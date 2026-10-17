const { str, isHttpUrl, parseId, todayInVietnam, TIME_ZONE } = require("./helpers");

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

/*
 * Mỗi hàm validate trả về:
 *  - values: giá trị dạng chuỗi để render lại form (giữ nguyên những gì người dùng gõ)
 *  - errors: mảng thông báo lỗi
 *  - data:   object đã bóc tách + ép kiểu, chỉ chứa các trường được phép ghi vào DB
 */

/*
 * options.chefs, options.ingredients: danh sách đang có trong DB (route đọc sẵn),
 * dùng để kiểm tra chefId / ingredientId người dùng gửi lên có thật hay không.
 * Ngoài { values, errors, data } còn trả về `recipe`: [{ ingredientId, quantity }].
 */
function validateDish(body, { chefs = [], ingredients = [] } = {}) {
  // Checkbox cùng tên: 1 ô -> chuỗi, nhiều ô -> mảng. Đưa về mảng chuỗi.
  const selectedIds = new Set(
    [].concat(body.ingredientIds || []).filter((v) => typeof v === "string")
  );

  const values = {
    name: str(body.name),
    description: str(body.description),
    price: str(body.price),
    category: str(body.category),
    imageUrl: str(body.imageUrl),
    available: body.available === "on",
    chefId: str(body.chefId),
    // { "<ingredientId>": { selected, quantity } } để vẽ lại bảng công thức
    ingredients: {},
  };
  for (const ing of ingredients) {
    const key = String(ing.id);
    values.ingredients[key] = {
      selected: selectedIds.has(key),
      quantity: str(body["qty_" + key]),
    };
  }
  const errors = [];

  if (!values.name) errors.push("Tên món ăn không được để trống.");
  else if (values.name.length > 100) errors.push("Tên món ăn tối đa 100 ký tự.");

  if (values.description.length > 1000) errors.push("Mô tả tối đa 1000 ký tự.");

  const price = Number(values.price);
  if (values.price === "") errors.push("Giá không được để trống.");
  else if (!/^\d+$/.test(values.price) || !Number.isInteger(price))
    errors.push("Giá phải là số nguyên không âm (VNĐ).");
  else if (price > MAX_PRICE) errors.push("Giá quá lớn.");

  if (values.category && !DISH_CATEGORIES.includes(values.category))
    errors.push("Danh mục không hợp lệ.");

  if (values.imageUrl && !isHttpUrl(values.imageUrl))
    errors.push("URL hình ảnh phải bắt đầu bằng http:// hoặc https://.");

  // Đầu bếp: để trống = chưa phân công; có giá trị thì phải là id đầu bếp đang tồn tại
  let chefId = null;
  if (values.chefId) {
    chefId = parseId(values.chefId);
    if (chefId === null || !chefs.some((c) => c.id === chefId)) {
      errors.push("Đầu bếp phụ trách không hợp lệ.");
      chefId = null;
    }
  }

  // Công thức: mỗi nguyên liệu được chọn phải tồn tại và có định lượng > 0
  const recipe = [];
  for (const raw of selectedIds) {
    const ingredient = ingredients.find((i) => i.id === parseId(raw));
    if (!ingredient) {
      errors.push("Có nguyên liệu không hợp lệ trong công thức.");
      continue;
    }
    const text = values.ingredients[raw].quantity.replace(",", ".");
    const quantity = Number(text);
    if (text === "") {
      errors.push(`Nhập định lượng cho "${ingredient.name}".`);
    } else if (!/^\d+(\.\d+)?$/.test(text) || quantity <= 0 || quantity > MAX_QUANTITY) {
      errors.push(`Định lượng của "${ingredient.name}" phải là số lớn hơn 0 (VD: 0,25).`);
    } else {
      recipe.push({ ingredientId: ingredient.id, quantity });
    }
  }

  const data = {
    name: values.name,
    description: values.description || null,
    price,
    category: values.category || null,
    imageUrl: values.imageUrl || null,
    available: values.available,
    chefId,
  };

  return { values, errors, data, recipe };
}

function validateChef(body) {
  const values = {
    name: str(body.name),
    specialty: str(body.specialty),
    imageUrl: str(body.imageUrl),
  };
  const errors = [];

  if (!values.name) errors.push("Tên đầu bếp không được để trống.");
  else if (values.name.length > 100) errors.push("Tên đầu bếp tối đa 100 ký tự.");

  if (!values.specialty) errors.push("Chuyên môn không được để trống.");
  else if (values.specialty.length > 150) errors.push("Chuyên môn tối đa 150 ký tự.");

  if (values.imageUrl && !isHttpUrl(values.imageUrl))
    errors.push("URL ảnh đại diện phải bắt đầu bằng http:// hoặc https://.");

  const data = {
    name: values.name,
    specialty: values.specialty,
    imageUrl: values.imageUrl || null,
  };

  return { values, errors, data };
}

function validateIngredient(body) {
  const values = {
    name: str(body.name),
    unit: str(body.unit),
  };
  const errors = [];

  if (!values.name) errors.push("Tên nguyên liệu không được để trống.");
  else if (values.name.length > 100) errors.push("Tên nguyên liệu tối đa 100 ký tự.");

  if (!values.unit) errors.push("Đơn vị tính không được để trống.");
  else if (values.unit.length > 20) errors.push("Đơn vị tính tối đa 20 ký tự.");

  const data = { name: values.name, unit: values.unit };

  return { values, errors, data };
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

function validateBooking(body, now = new Date()) {
  const values = {
    name: str(body.name),
    phone: str(body.phone),
    guests: str(body.guests),
    date: str(body.date),
    time: str(body.time),
    note: str(body.note),
  };
  const errors = [];

  if (!values.name) errors.push("Vui lòng nhập họ tên.");
  else if (values.name.length > 100) errors.push("Họ tên tối đa 100 ký tự.");

  // Cho phép gõ "0123 456 789" hoặc "0123.456.789"; lưu chỉ chữ số
  const phone = values.phone.replace(/[\s.-]/g, "");
  if (!values.phone) errors.push("Vui lòng nhập số điện thoại.");
  else if (!/^0\d{9}$/.test(phone)) errors.push("Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.");

  const guests = Number(values.guests);
  if (!/^\d+$/.test(values.guests) || guests < 1 || guests > BOOKING_MAX_GUESTS)
    errors.push(`Số khách từ 1 đến ${BOOKING_MAX_GUESTS}. Nhóm đông hơn vui lòng gọi hotline.`);

  if (!BOOKING_SLOTS.includes(values.time)) errors.push("Vui lòng chọn giờ đến trong khung giờ nhận khách.");

  // Ngày giờ khách chọn là giờ Việt Nam (UTC+7)
  let bookedAt = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
    errors.push("Vui lòng chọn ngày đến.");
  } else {
    const at = new Date(`${values.date}T${BOOKING_SLOTS.includes(values.time) ? values.time : "00:00"}:00+07:00`);
    // Đọc lại theo giờ Việt Nam để chặn ngày không có thật như 2026-02-31
    const sameDay =
      !Number.isNaN(at.getTime()) &&
      new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(at) === values.date;
    if (!sameDay) errors.push("Ngày đến không hợp lệ.");
    else if (values.date < todayInVietnam(now)) errors.push("Ngày đến không được ở trong quá khứ.");
    else if (BOOKING_SLOTS.includes(values.time) && at <= now) errors.push("Giờ đến đã qua, vui lòng chọn giờ muộn hơn.");
    else if (at - now > BOOKING_MAX_DAYS * 24 * 60 * 60 * 1000)
      errors.push(`Chỉ nhận đặt bàn trong vòng ${BOOKING_MAX_DAYS} ngày tới.`);
    else bookedAt = at;
  }

  if (values.note.length > 500) errors.push("Ghi chú tối đa 500 ký tự.");

  const data = {
    name: values.name,
    phone,
    guests,
    bookedAt,
    note: values.note || null,
  };

  return { values, errors, data };
}

// Chuyển bản ghi DB thành giá trị chuỗi để điền sẵn vào form sửa.
// d phải được đọc kèm `ingredients` (bảng nối).
const dishToValues = (d) => {
  const ingredients = {};
  for (const di of d.ingredients || []) {
    ingredients[String(di.ingredientId)] = { selected: true, quantity: String(di.quantity) };
  }
  return {
    name: d.name,
    description: d.description || "",
    price: String(d.price),
    category: d.category || "",
    imageUrl: d.imageUrl || "",
    available: d.available,
    chefId: d.chefId ? String(d.chefId) : "",
    ingredients,
  };
};
const chefToValues = (c) => ({
  name: c.name,
  specialty: c.specialty,
  imageUrl: c.imageUrl || "",
});
const ingredientToValues = (i) => ({ name: i.name, unit: i.unit });

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
  validateDish,
  validateChef,
  validateIngredient,
  dishToValues,
  chefToValues,
  ingredientToValues,
};
