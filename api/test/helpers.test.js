const test = require("node:test");
const assert = require("node:assert/strict");
const helpers = require("../src/utils/helpers");
const { asObject, pageParams, isEmpty, paginate, parseId, escapeLike } = helpers;

test("asObject giữ nguyên object thường, còn lại thành {}", () => {
  const body = { a: 1 };
  assert.equal(asObject(body), body);
  assert.deepEqual(asObject([1]), {});
  assert.deepEqual(asObject(null), {});
  assert.deepEqual(asObject(undefined), {});
  assert.deepEqual(asObject("x"), {});
  assert.deepEqual(asObject(5), {});
});

test("pageParams trả null khi không có ?page", () => {
  assert.equal(pageParams({}, 9), null);
  assert.equal(pageParams({ pageSize: "5" }, 9), null);
});

test("pageParams đọc page và pageSize", () => {
  assert.deepEqual(pageParams({ page: "2" }, 9), { rawPage: "2", pageSize: 9 });
  assert.equal(pageParams({ page: "1", pageSize: "20" }, 9).pageSize, 20);
});

test("pageParams chặn pageSize trong 1..50, sai thì dùng mặc định", () => {
  assert.equal(pageParams({ page: "1", pageSize: "9999" }, 9).pageSize, 50);
  assert.equal(pageParams({ page: "1", pageSize: "abc" }, 10).pageSize, 10);
  assert.equal(pageParams({ page: "1", pageSize: "0" }, 10).pageSize, 10);
  assert.equal(pageParams({ page: "1", pageSize: "-3" }, 10).pageSize, 10);
});

test("isEmpty", () => {
  assert.equal(isEmpty({}), true);
  assert.equal(isEmpty({ name: "x" }), false);
});

test("paginate và parseId vẫn hoạt động", () => {
  assert.deepEqual(paginate(25, "2", 10), { page: 2, totalPages: 3, skip: 10, take: 10 });
  assert.equal(parseId("3"), 3);
  assert.equal(parseId("0"), null);
});

test("các helper chỉ dùng cho giao diện đã bị gỡ", () => {
  for (const name of ["formatPrice", "formatQty", "formatDateTime", "formatPhone", "DEFAULT_DISH_IMAGE", "RESTAURANT"]) {
    assert.equal(helpers[name], undefined, name);
  }
});

test("parseId: id vượt giới hạn INT4 của PostgreSQL → null (NOT_FOUND, không phải 500)", () => {
  assert.equal(parseId("2147483647"), 2147483647);
  assert.equal(parseId("2147483648"), null);
  assert.equal(parseId("99999999999"), null);
});

test("escapeLike: % _ \\ người dùng gõ thành ký tự thường trong mẫu LIKE", () => {
  assert.equal(escapeLike("100%"), "100\\%");
  assert.equal(escapeLike("SQL_"), "SQL\\_");
  assert.equal(escapeLike("a\\b"), "a\\\\b");
  assert.equal(escapeLike("phở"), "phở");
});
