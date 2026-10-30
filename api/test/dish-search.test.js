const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDishWhere, isRanked, rankedFilterSql, rankedScoreSql, orderByIds } = require("../src/db/dish-search");

const NO_SEARCH = { mode: "basic", q: "", category: "", minPrice: null, maxPrice: null, available: null, ingredient: "" };
const search = (extra) => ({ ...NO_SEARCH, ...extra });

test("buildDishWhere: không tiêu chí -> where rỗng", () => {
  assert.deepEqual(buildDishWhere(NO_SEARCH), {});
});

test("buildDishWhere basic: tên chứa q (escape % _), không thêm điều kiện nâng cao", () => {
  const where = buildDishWhere(search({ q: "100%" }));
  assert.deepEqual(where, { name: { contains: "100\\%", mode: "insensitive" } });
});

test("buildDishWhere: category ở mọi mode", () => {
  assert.equal(buildDishWhere(search({ category: "Khai vị" })).category, "Khai vị");
});

test("buildDishWhere advanced: 0 và false là tiêu chí thật", () => {
  const where = buildDishWhere(search({ mode: "advanced", minPrice: 0, available: false }));
  assert.deepEqual(where.price, { gte: 0 });
  assert.equal(where.available, false);
});

test("buildDishWhere advanced: khoảng giá hai đầu", () => {
  assert.deepEqual(buildDishWhere(search({ mode: "advanced", minPrice: 50000, maxPrice: 90000 })).price, { gte: 50000, lte: 90000 });
  assert.deepEqual(buildDishWhere(search({ mode: "advanced", maxPrice: 90000 })).price, { lte: 90000 });
});

test("buildDishWhere advanced: nguyên liệu chứa chuỗi (escape)", () => {
  const where = buildDishWhere(search({ mode: "advanced", ingredient: "tỏi_" }));
  assert.deepEqual(where.ingredients, {
    some: { ingredient: { name: { contains: "tỏi\\_", mode: "insensitive" } } },
  });
});

test("buildDishWhere: basic và advanced cùng q cho cùng where", () => {
  assert.deepEqual(buildDishWhere(search({ q: "phở" })), buildDishWhere(search({ mode: "advanced", q: "phở" })));
});

test("isRanked: chỉ fulltext/fuzzy có q", () => {
  assert.equal(isRanked(search({ mode: "fulltext", q: "phở" })), true);
  assert.equal(isRanked(search({ mode: "fuzzy", q: "phở" })), true);
  assert.equal(isRanked(search({ mode: "fulltext" })), false);
  assert.equal(isRanked(search({ mode: "basic", q: "phở" })), false);
  assert.equal(isRanked(search({ mode: "advanced", q: "phở" })), false);
});

test("rankedFilterSql fulltext: cấu hình simple, q là tham số", () => {
  const sql = rankedFilterSql(search({ mode: "fulltext", q: "phở" }));
  assert.deepEqual(sql.values, ["phở"]);
  assert.match(sql.text, /to_tsvector\('simple', name \|\| ' ' \|\| coalesce\(description, ''\)\)/);
  assert.match(sql.text, /plainto_tsquery\('simple', \$1\)/);
});

test("rankedFilterSql: category thêm điều kiện AND có tham số", () => {
  const sql = rankedFilterSql(search({ mode: "fulltext", q: "phở", category: "Khai vị" }));
  assert.deepEqual(sql.values, ["phở", "Khai vị"]);
  assert.match(sql.text, /AND category = \$2/);
});

test("rankedFilterSql fuzzy: word_similarity với ngưỡng 0.3", () => {
  const sql = rankedFilterSql(search({ mode: "fuzzy", q: "carbonra" }));
  assert.match(sql.text, /word_similarity\(\$1, name\) >= \$2/);
  assert.deepEqual(sql.values, ["carbonra", 0.3]);
  assert.match(rankedScoreSql(search({ mode: "fuzzy", q: "x" })).text, /word_similarity/);
  assert.match(rankedScoreSql(search({ mode: "fulltext", q: "x" })).text, /ts_rank/);
});

test("orderByIds giữ thứ tự xếp hạng, bỏ id không còn", () => {
  const rows = [{ id: 2 }, { id: 1 }, { id: 3 }];
  assert.deepEqual(orderByIds(rows, [3, 1, 9, 2]).map((r) => r.id), [3, 1, 2]);
});
