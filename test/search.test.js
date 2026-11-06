const test = require("node:test");
const assert = require("node:assert/strict");
const { parseDishSearch } = require("../src/utils/validators");
const { escapeLike, parseId } = require("../src/utils/helpers");
const { searchParams, hasFilters, isRankedSearch } = require("../src/utils/dish-query");

test("escapeLike: % _ \\ thành ký tự thường", () => {
  assert.equal(escapeLike("100%_a\\b"), "100\\%\\_a\\\\b");
});

test("parseId: chặn số vượt INT4", () => {
  assert.equal(parseId("2147483647"), 2147483647);
  assert.equal(parseId("2147483648"), null);
  assert.equal(parseId("abc"), null);
});

test("parseDishSearch: mode lạ và giá sai báo lỗi", () => {
  assert.ok(parseDishSearch({ mode: "xyz" }).fields.mode);
  const r = parseDishSearch({ mode: "advanced", minPrice: "abc", maxPrice: "10" });
  assert.ok(r.fields.minPrice);
  assert.ok(parseDishSearch({ mode: "advanced", minPrice: "20", maxPrice: "10" }).fields.maxPrice);
});

test("parseDishSearch: tiêu chí nâng cao bị bỏ qua ở mode khác advanced", () => {
  const r = parseDishSearch({ mode: "basic", minPrice: "abc", available: "x" });
  assert.deepEqual(r.fields, {});
  assert.equal(r.search.minPrice, null);
});

test("parseDishSearch: available=false và minPrice=0 là tiêu chí thật", () => {
  const { search } = parseDishSearch({ mode: "advanced", available: "false", minPrice: "0" });
  assert.equal(search.available, false);
  assert.equal(search.minPrice, 0);
});

test("searchParams: bỏ mặc định, bỏ sort khi xếp theo độ liên quan", () => {
  const basic = parseDishSearch({ q: "phở", sort: "price-asc" }).search;
  assert.equal(searchParams(basic, "price-asc", { page: 2 }).toString(), "q=ph%E1%BB%9F&sort=price-asc&page=2");
  const fuzzy = parseDishSearch({ mode: "fuzzy", q: "bun" }).search;
  assert.equal(isRankedSearch(fuzzy), true);
  assert.equal(searchParams(fuzzy, "price-asc").toString(), "mode=fuzzy&q=bun");
  assert.equal(hasFilters(parseDishSearch({}).search), false);
});
