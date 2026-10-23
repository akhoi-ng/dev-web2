const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateDish,
  validateChef,
  validateIngredient,
  validateBooking,
  validateBookingStatus,
} = require("../src/utils/validators");

const chefs = [{ id: 1 }];
const ingredients = [{ id: 5, name: "Tỏi" }, { id: 6, name: "Muối" }];
const ctx = { chefs, ingredients };
const dish = (extra) => validateDish({ name: "A", price: 1, ...extra }, ctx);

test("validateDish hợp lệ: mặc định available true, chefId null, recipe []", () => {
  const r = validateDish({ name: "Phở", price: 50000 }, ctx);
  assert.deepEqual(r.fields, {});
  assert.equal(r.data.available, true);
  assert.equal(r.data.chefId, null);
  assert.equal(r.data.description, null);
  assert.equal(r.data.category, null);
  assert.equal(r.data.imageUrl, null);
  assert.deepEqual(r.recipe, []);
});

test("validateDish: giá phải là số nguyên JSON", () => {
  assert.equal(validateDish({ name: "Phở", price: "50000" }, ctx).fields.price, "Giá phải là số nguyên không âm (VNĐ).");
  assert.equal(dish({ price: 1.5 }).fields.price, "Giá phải là số nguyên không âm (VNĐ).");
  assert.equal(dish({ price: 2147483648 }).fields.price, "Giá quá lớn.");
  assert.equal(validateDish({ name: "A" }, ctx).fields.price, "Giá không được để trống.");
});

test("validateDish: tên trống và giá âm báo từng trường", () => {
  const { fields } = validateDish({ name: " ", price: -1 }, ctx);
  assert.equal(fields.name, "Tên món ăn không được để trống.");
  assert.equal(fields.price, "Giá phải là số nguyên không âm (VNĐ).");
});

test("validateDish: tên quá dài, tên không phải chuỗi", () => {
  assert.equal(dish({ name: "x".repeat(101) }).fields.name, "Tên món ăn tối đa 100 ký tự.");
  assert.equal(dish({ name: 5 }).fields.name, "Tên món ăn phải là chuỗi ký tự.");
});

test("validateDish: trường văn bản tùy chọn", () => {
  assert.equal(dish({ description: "x".repeat(1001) }).fields.description, "Mô tả tối đa 1000 ký tự.");
  assert.equal(dish({ description: 3 }).fields.description, "Mô tả phải là chuỗi ký tự.");
  assert.equal(dish({ category: "Lạ" }).fields.category, "Danh mục không hợp lệ.");
  assert.equal(dish({ category: "Món chính" }).data.category, "Món chính");
  assert.equal(dish({ imageUrl: "ftp://x" }).fields.imageUrl, "URL hình ảnh phải bắt đầu bằng http:// hoặc https://.");
  const r = dish({ description: "  ", category: "", imageUrl: null });
  assert.deepEqual(r.fields, {});
  assert.equal(r.data.description, null);
  assert.equal(r.data.category, null);
  assert.equal(r.data.imageUrl, null);
});

test("validateDish: available phải là boolean", () => {
  assert.equal(dish({ available: "yes" }).fields.available, "Trạng thái phải là true hoặc false.");
  assert.equal(dish({ available: false }).data.available, false);
});

test("validateDish: chefId", () => {
  assert.equal(dish({ chefId: 9 }).fields.chefId, "Đầu bếp phụ trách không hợp lệ.");
  assert.equal(dish({ chefId: "1" }).fields.chefId, "Đầu bếp phụ trách không hợp lệ.");
  assert.equal(dish({ chefId: 1 }).data.chefId, 1);
  const r = dish({ chefId: null });
  assert.deepEqual(r.fields, {});
  assert.equal(r.data.chefId, null);
});

test("validateDish: công thức", () => {
  const badQty = 'Định lượng của "Tỏi" phải là số lớn hơn 0 (VD: 0,25).';
  assert.equal(dish({ ingredients: [{ ingredientId: 5, quantity: 0 }] }).fields["ingredients.5"], badQty);
  assert.equal(dish({ ingredients: [{ ingredientId: 5, quantity: "2" }] }).fields["ingredients.5"], badQty);
  assert.equal(dish({ ingredients: [{ ingredientId: 5, quantity: 100001 }] }).fields["ingredients.5"], badQty);
  assert.equal(dish({ ingredients: [{ ingredientId: 5 }] }).fields["ingredients.5"], 'Nhập định lượng cho "Tỏi".');
  assert.deepEqual(dish({ ingredients: [{ ingredientId: 5, quantity: 0.25 }] }).recipe, [{ ingredientId: 5, quantity: 0.25 }]);
  const bad = "Có nguyên liệu không hợp lệ trong công thức.";
  assert.equal(dish({ ingredients: [{ ingredientId: 99, quantity: 1 }] }).fields.ingredients, bad);
  assert.equal(dish({ ingredients: [{ ingredientId: 5, quantity: 1 }, { ingredientId: 5, quantity: 2 }] }).fields.ingredients, bad);
  assert.equal(dish({ ingredients: [null] }).fields.ingredients, bad);
  assert.equal(dish({ ingredients: [{ ingredientId: "5", quantity: 1 }] }).fields.ingredients, bad);
  assert.equal(typeof dish({ ingredients: "tỏi" }).fields.ingredients, "string");
  assert.equal(typeof dish({ ingredients: {} }).fields.ingredients, "string");
});

test("validateDish: bỏ qua khóa lạ", () => {
  const r = dish({ isAdmin: true, id: 7 });
  assert.equal(r.data.isAdmin, undefined);
  assert.equal(r.data.id, undefined);
});

test("validateDish: body không phải object coi như rỗng", () => {
  const r = validateDish(null, ctx);
  assert.equal(r.fields.name, "Tên món ăn không được để trống.");
  assert.equal(r.fields.price, "Giá không được để trống.");
});

test("validateDish partial: khóa vắng mặt không được kiểm tra", () => {
  const empty = validateDish({}, { ...ctx, partial: true });
  assert.deepEqual(empty.fields, {});
  assert.deepEqual(empty.data, {});
  assert.equal(empty.recipe, undefined);
  assert.deepEqual(validateDish({ price: 1 }, { ...ctx, partial: true }).data, { price: 1 });
});

test("validateDish partial: khóa có mặt vẫn bị kiểm tra", () => {
  const r = validateDish({ name: "", price: "1", chefId: null, ingredients: [] }, { ...ctx, partial: true });
  assert.equal(r.fields.name, "Tên món ăn không được để trống.");
  assert.equal(r.fields.price, "Giá phải là số nguyên không âm (VNĐ).");
  assert.equal(r.fields.chefId, undefined);
  assert.deepEqual(r.recipe, []);
  const ok = validateDish({ chefId: null, description: " " }, { ...ctx, partial: true });
  assert.deepEqual(ok.data, { chefId: null, description: null });
});

test("validateChef", () => {
  assert.equal(validateChef({ name: "A" }).fields.specialty, "Chuyên môn không được để trống.");
  assert.equal(validateChef({}).fields.name, "Tên đầu bếp không được để trống.");
  assert.equal(validateChef({ name: "A", specialty: "x".repeat(151) }).fields.specialty, "Chuyên môn tối đa 150 ký tự.");
  assert.equal(validateChef({ name: "A", specialty: "B", imageUrl: "zzz" }).fields.imageUrl,
    "URL ảnh đại diện phải bắt đầu bằng http:// hoặc https://.");
  assert.equal(validateChef({ name: 1, specialty: "B" }).fields.name, "Tên đầu bếp phải là chuỗi ký tự.");
  const r = validateChef({ name: " A ", specialty: "B", role: "x" });
  assert.deepEqual(r.fields, {});
  assert.deepEqual(r.data, { name: "A", specialty: "B", imageUrl: null });
  assert.deepEqual(validateChef({ specialty: "B" }, { partial: true }).data, { specialty: "B" });
  assert.deepEqual(validateChef({}, { partial: true }), { fields: {}, data: {} });
});

test("validateIngredient", () => {
  assert.equal(validateIngredient({ name: "Muối", unit: "x".repeat(21) }).fields.unit, "Đơn vị tính tối đa 20 ký tự.");
  assert.equal(validateIngredient({ name: "Muối" }).fields.unit, "Đơn vị tính không được để trống.");
  assert.equal(validateIngredient({ unit: "kg" }).fields.name, "Tên nguyên liệu không được để trống.");
  assert.equal(validateIngredient({ name: "x".repeat(101), unit: "kg" }).fields.name, "Tên nguyên liệu tối đa 100 ký tự.");
  assert.equal(validateIngredient({ name: "M", unit: 3 }).fields.unit, "Đơn vị tính phải là chuỗi ký tự.");
  assert.deepEqual(validateIngredient({ name: "Muối", unit: "kg" }), { fields: {}, data: { name: "Muối", unit: "kg" } });
  assert.deepEqual(validateIngredient({ unit: "kg" }, { partial: true }).data, { unit: "kg" });
});

const now = new Date("2026-10-23T03:00:00Z"); // 10:00 ngày 23/10 giờ Việt Nam
const bookingBody = { name: "An", phone: "0123 456 789", guests: 2, date: "2026-10-24", time: "18:00" };

test("validateBooking: guests phải là số nguyên JSON", () => {
  assert.equal(typeof validateBooking({ ...bookingBody, guests: "2" }, now).fields.guests, "string");
  assert.equal(typeof validateBooking({ ...bookingBody, guests: 1.5 }, now).fields.guests, "string");
  assert.equal(typeof validateBooking({ ...bookingBody, guests: 0 }, now).fields.guests, "string");
  assert.equal(typeof validateBooking({ ...bookingBody, guests: 21 }, now).fields.guests, "string");
});

test("validateBooking hợp lệ", () => {
  const r = validateBooking(bookingBody, now);
  assert.deepEqual(r.fields, {});
  assert.equal(r.data.phone, "0123456789");
  assert.equal(r.data.guests, 2);
  assert.equal(r.data.note, null);
  assert.equal(r.data.bookedAt.toISOString(), "2026-10-24T11:00:00.000Z");
  assert.equal(validateBooking({ ...bookingBody, note: " ghi chú " }, now).data.note, "ghi chú");
});

test("validateBooking: họ tên, điện thoại", () => {
  assert.equal(validateBooking({}, now).fields.name, "Vui lòng nhập họ tên.");
  assert.equal(validateBooking({}, now).fields.phone, "Vui lòng nhập số điện thoại.");
  assert.equal(validateBooking({ ...bookingBody, phone: 123456789 }, now).fields.phone, "Số điện thoại phải là chuỗi ký tự.");
  assert.equal(validateBooking({ ...bookingBody, phone: "12345" }, now).fields.phone, "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.");
  assert.equal(validateBooking({ ...bookingBody, phone: "0123.456-789" }, now).data.phone, "0123456789");
  assert.equal(validateBooking({ ...bookingBody, name: "x".repeat(101) }, now).fields.name, "Họ tên tối đa 100 ký tự.");
});

test("validateBooking: giờ và ngày báo lỗi ở khóa riêng", () => {
  assert.equal(validateBooking({ ...bookingBody, time: "09:00" }, now).fields.time,
    "Vui lòng chọn giờ đến trong khung giờ nhận khách.");
  assert.equal(typeof validateBooking({ ...bookingBody, time: undefined }, now).fields.time, "string");
  assert.equal(validateBooking({ ...bookingBody, date: "" }, now).fields.date, "Vui lòng chọn ngày đến.");
  assert.equal(validateBooking({ ...bookingBody, date: "2026-02-31" }, now).fields.date, "Ngày đến không hợp lệ.");
  assert.equal(validateBooking({ ...bookingBody, date: "2026-10-22" }, now).fields.date, "Ngày đến không được ở trong quá khứ.");
  assert.equal(validateBooking({ ...bookingBody, date: "2026-10-23", time: "10:00" }, now).fields.date,
    "Giờ đến đã qua, vui lòng chọn giờ muộn hơn.");
  assert.equal(validateBooking({ ...bookingBody, date: "2027-01-01" }, now).fields.date,
    "Chỉ nhận đặt bàn trong vòng 60 ngày tới.");
});

test("validateBooking: ghi chú", () => {
  assert.equal(validateBooking({ ...bookingBody, note: "x".repeat(501) }, now).fields.note, "Ghi chú tối đa 500 ký tự.");
  assert.equal(validateBooking({ ...bookingBody, note: 5 }, now).fields.note, "Ghi chú phải là chuỗi ký tự.");
});

test("validateBookingStatus", () => {
  assert.equal(validateBookingStatus({ status: "done" }).fields.status, "Trạng thái không hợp lệ.");
  assert.equal(validateBookingStatus({}).fields.status, "Trạng thái không hợp lệ.");
  assert.equal(validateBookingStatus({ status: "toString" }).fields.status, "Trạng thái không hợp lệ.");
  assert.deepEqual(validateBookingStatus({ status: "confirmed" }), { fields: {}, data: { status: "confirmed" } });
});
