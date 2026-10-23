const { str, isHttpUrl, asObject, todayInVietnam, TIME_ZONE } = require("./helpers");

const DISH_CATEGORIES = ["Khai vị", "Món chính", "Món phụ", "Tráng miệng", "Đồ uống"];
const INGREDIENT_UNITS = ["kg", "gram", "lít", "ml", "bó", "quả", "ổ", "hộp", "gói"];
const MAX_PRICE = 2147483647; // Giới hạn kiểu Int của PostgreSQL
const MAX_QUANTITY = 100000;

// Các kiểu sắp xếp món ăn cho ?sort=...; thêm id để thứ tự ổn định khi phân trang
const DISH_SORTS = {
  default: { label: "Mặc định", orderBy: [{ id: "asc" }] },
  newest: { label: "Mới nhất", orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
  "price-asc": { label: "Giá thấp → cao", orderBy: [{ price: "asc" }, { id: "asc" }] },
  "price-desc": { label: "Giá cao → thấp", orderBy: [{ price: "desc" }, { id: "asc" }] },
  "name-asc": { label: "Tên A → Z", orderBy: [{ name: "asc" }, { id: "asc" }] },
};

// Kiểu sắp xếp lạ (hoặc ?sort=a&sort=b) -> mặc định
function parseDishSort(raw) {
  return typeof raw === "string" && Object.hasOwn(DISH_SORTS, raw) ? raw : "default";
}

// Khung giờ nhận khách: 10:00 – 21:00, mỗi 30 phút (nhà hàng đóng cửa 22:00)
const BOOKING_SLOTS = [];
for (let m = 10 * 60; m <= 21 * 60; m += 30) {
  BOOKING_SLOTS.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
}
const BOOKING_MAX_GUESTS = 20;
const BOOKING_MAX_DAYS = 60;
const BOOKING_STATUSES = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  cancelled: "Đã hủy",
};

/*
 * Mỗi hàm validate nhận body JSON (đã ép bằng asObject) và trả về { fields, data }:
 *  - fields: { <khóa JSON>: "thông báo lỗi" }, mỗi trường một thông báo (lỗi đầu tiên);
 *            rỗng khi dữ liệu hợp lệ
 *  - data:   object đã bóc tách + chuẩn hóa, chỉ chứa các trường được phép ghi vào DB
 * Chế độ partial (PATCH): khóa không có trong body thì không kiểm tra và không có trong data.
 */

/*
 * Một "rule" nhận giá trị thô trong body và trả về [lỗi, giá trị đã chuẩn hóa].
 * check() chạy rule cho một khóa rồi ghi vào ctx.fields hoặc ctx.data.
 */
function check(ctx, key, rule) {
  if (ctx.partial && !Object.hasOwn(ctx.body, key)) return;
  const [error, value] = rule(ctx.body[key]);
  if (error) ctx.fields[key] = error;
  else ctx.data[key] = value;
}

const newCtx = (body, partial = false) => ({ body: asObject(body), partial, fields: {}, data: {} });
const typeError = (label) => `${label} phải là chuỗi ký tự.`;

// Chuỗi bắt buộc: thiếu / null / chỉ có khoảng trắng -> lỗi "empty"
function requiredText({ label, empty, max, tooLong }) {
  return (v) => {
    if (v === undefined || v === null) return [empty];
    if (typeof v !== "string") return [typeError(label)];
    const text = v.trim();
    if (!text) return [empty];
    if (text.length > max) return [tooLong];
    return [null, text];
  };
}

// Chuỗi tùy chọn: thiếu / null / chuỗi rỗng -> null. `invalid` kiểm tra thêm giá trị đã cắt khoảng trắng.
function optionalText({ label, max, tooLong, invalid }) {
  return (v) => {
    if (v === undefined || v === null) return [null, null];
    if (typeof v !== "string") return [typeError(label)];
    const text = v.trim();
    if (!text) return [null, null];
    if (max && text.length > max) return [tooLong];
    const message = invalid && invalid(text);
    if (message) return [message];
    return [null, text];
  };
}

/*
 * options.chefs, options.ingredients: danh sách đang có trong DB (route đọc sẵn),
 * dùng để kiểm tra chefId / ingredientId gửi lên có thật hay không.
 * Ngoài { fields, data } còn trả về `recipe`: [{ ingredientId, quantity }]
 * (undefined khi partial và body không có khóa `ingredients`).
 */
function validateDish(body, { chefs = [], ingredients = [], partial = false } = {}) {
  const ctx = newCtx(body, partial);

  check(ctx, "name", requiredText({
    label: "Tên món ăn",
    empty: "Tên món ăn không được để trống.",
    max: 100,
    tooLong: "Tên món ăn tối đa 100 ký tự.",
  }));

  check(ctx, "description", optionalText({
    label: "Mô tả",
    max: 1000,
    tooLong: "Mô tả tối đa 1000 ký tự.",
  }));

  check(ctx, "price", (v) => {
    if (v === undefined || v === null) return ["Giá không được để trống."];
    if (!Number.isInteger(v) || v < 0) return ["Giá phải là số nguyên không âm (VNĐ)."];
    if (v > MAX_PRICE) return ["Giá quá lớn."];
    return [null, v];
  });

  check(ctx, "category", optionalText({
    label: "Danh mục",
    invalid: (text) => (DISH_CATEGORIES.includes(text) ? null : "Danh mục không hợp lệ."),
  }));

  check(ctx, "imageUrl", optionalText({
    label: "URL hình ảnh",
    invalid: (text) => (isHttpUrl(text) ? null : "URL hình ảnh phải bắt đầu bằng http:// hoặc https://."),
  }));

  // Không gửi `available` = còn bán
  check(ctx, "available", (v) => {
    if (v === undefined) return [null, true];
    if (typeof v !== "boolean") return ["Trạng thái phải là true hoặc false."];
    return [null, v];
  });

  // Đầu bếp: null / không gửi = chưa phân công; có giá trị thì phải là id đầu bếp đang tồn tại
  check(ctx, "chefId", (v) => {
    if (v === undefined || v === null) return [null, null];
    if (!Number.isInteger(v) || !chefs.some((c) => c.id === v)) return ["Đầu bếp phụ trách không hợp lệ."];
    return [null, v];
  });

  let recipe;
  if (!partial || Object.hasOwn(ctx.body, "ingredients")) {
    recipe = validateRecipe(ctx.body.ingredients, ingredients, ctx.fields);
  }

  return { fields: ctx.fields, data: ctx.data, recipe };
}

// Công thức: mỗi nguyên liệu phải tồn tại, không trùng và có định lượng > 0.
// Lỗi chung ghi vào fields.ingredients, lỗi định lượng ghi vào fields["ingredients.<id>"].
function validateRecipe(raw, ingredients, fields) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    fields.ingredients = "Công thức phải là danh sách nguyên liệu.";
    return [];
  }

  const recipe = [];
  const seen = new Set();
  for (const item of raw) {
    const entry = asObject(item);
    const ingredient = ingredients.find((i) => i.id === entry.ingredientId);
    if (!ingredient || seen.has(ingredient.id)) {
      fields.ingredients = "Có nguyên liệu không hợp lệ trong công thức.";
      continue;
    }
    seen.add(ingredient.id);

    const key = `ingredients.${ingredient.id}`;
    const quantity = entry.quantity;
    if (quantity === undefined || quantity === null) {
      fields[key] = `Nhập định lượng cho "${ingredient.name}".`;
    } else if (typeof quantity !== "number" || !(quantity > 0) || quantity > MAX_QUANTITY) {
      fields[key] = `Định lượng của "${ingredient.name}" phải là số lớn hơn 0 (VD: 0,25).`;
    } else {
      recipe.push({ ingredientId: ingredient.id, quantity });
    }
  }
  return recipe;
}

function validateChef(body, { partial = false } = {}) {
  const ctx = newCtx(body, partial);

  check(ctx, "name", requiredText({
    label: "Tên đầu bếp",
    empty: "Tên đầu bếp không được để trống.",
    max: 100,
    tooLong: "Tên đầu bếp tối đa 100 ký tự.",
  }));

  check(ctx, "specialty", requiredText({
    label: "Chuyên môn",
    empty: "Chuyên môn không được để trống.",
    max: 150,
    tooLong: "Chuyên môn tối đa 150 ký tự.",
  }));

  check(ctx, "imageUrl", optionalText({
    label: "URL ảnh đại diện",
    invalid: (text) => (isHttpUrl(text) ? null : "URL ảnh đại diện phải bắt đầu bằng http:// hoặc https://."),
  }));

  return { fields: ctx.fields, data: ctx.data };
}

function validateIngredient(body, { partial = false } = {}) {
  const ctx = newCtx(body, partial);

  check(ctx, "name", requiredText({
    label: "Tên nguyên liệu",
    empty: "Tên nguyên liệu không được để trống.",
    max: 100,
    tooLong: "Tên nguyên liệu tối đa 100 ký tự.",
  }));

  check(ctx, "unit", requiredText({
    label: "Đơn vị tính",
    empty: "Đơn vị tính không được để trống.",
    max: 20,
    tooLong: "Đơn vị tính tối đa 20 ký tự.",
  }));

  return { fields: ctx.fields, data: ctx.data };
}

function validateBooking(body, now = new Date()) {
  const ctx = newCtx(body);
  const { fields } = ctx;

  check(ctx, "name", requiredText({
    label: "Họ tên",
    empty: "Vui lòng nhập họ tên.",
    max: 100,
    tooLong: "Họ tên tối đa 100 ký tự.",
  }));

  // Cho phép gõ "0123 456 789" hoặc "0123.456.789"; lưu chỉ chữ số
  check(ctx, "phone", (v) => {
    if (v === undefined || v === null || v === "") return ["Vui lòng nhập số điện thoại."];
    if (typeof v !== "string") return [typeError("Số điện thoại")];
    const phone = v.trim().replace(/[\s.-]/g, "");
    if (!phone) return ["Vui lòng nhập số điện thoại."];
    if (!/^0\d{9}$/.test(phone)) return ["Số điện thoại gồm 10 chữ số, bắt đầu bằng 0."];
    return [null, phone];
  });

  // Số khách phải là số nguyên JSON (chuỗi "2" bị từ chối)
  check(ctx, "guests", (v) => {
    if (!Number.isInteger(v) || v < 1 || v > BOOKING_MAX_GUESTS)
      return [`Số khách từ 1 đến ${BOOKING_MAX_GUESTS}. Nhóm đông hơn vui lòng gọi hotline.`];
    return [null, v];
  });

  const date = str(ctx.body.date);
  const time = str(ctx.body.time);
  const timeOk = BOOKING_SLOTS.includes(time);
  if (!timeOk) fields.time = "Vui lòng chọn giờ đến trong khung giờ nhận khách.";

  // Ngày giờ khách chọn là giờ Việt Nam (UTC+7)
  let bookedAt = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fields.date = "Vui lòng chọn ngày đến.";
  } else {
    const at = new Date(`${date}T${timeOk ? time : "00:00"}:00+07:00`);
    // Đọc lại theo giờ Việt Nam để chặn ngày không có thật như 2026-02-31
    const sameDay =
      !Number.isNaN(at.getTime()) &&
      new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(at) === date;
    if (!sameDay) fields.date = "Ngày đến không hợp lệ.";
    else if (date < todayInVietnam(now)) fields.date = "Ngày đến không được ở trong quá khứ.";
    else if (timeOk && at <= now) fields.date = "Giờ đến đã qua, vui lòng chọn giờ muộn hơn.";
    else if (at - now > BOOKING_MAX_DAYS * 24 * 60 * 60 * 1000)
      fields.date = `Chỉ nhận đặt bàn trong vòng ${BOOKING_MAX_DAYS} ngày tới.`;
    else bookedAt = at;
  }
  ctx.data.bookedAt = bookedAt;

  check(ctx, "note", optionalText({
    label: "Ghi chú",
    max: 500,
    tooLong: "Ghi chú tối đa 500 ký tự.",
  }));

  return { fields, data: ctx.data };
}

function validateBookingStatus(body) {
  const status = asObject(body).status;
  if (typeof status !== "string" || !Object.hasOwn(BOOKING_STATUSES, status))
    return { fields: { status: "Trạng thái không hợp lệ." }, data: {} };
  return { fields: {}, data: { status } };
}

module.exports = {
  DISH_CATEGORIES,
  DISH_SORTS,
  parseDishSort,
  INGREDIENT_UNITS,
  BOOKING_SLOTS,
  BOOKING_MAX_GUESTS,
  BOOKING_MAX_DAYS,
  BOOKING_STATUSES,
  validateBooking,
  validateBookingStatus,
  validateDish,
  validateChef,
  validateIngredient,
};
