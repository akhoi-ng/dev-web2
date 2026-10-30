const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCatalog } = require("../prisma/catalog");
const { DISH_CATEGORIES } = require("../src/utils/validators");

const catalog = buildCatalog();
const { chefs, ingredients, dishes } = catalog;

test("catalog: đúng 1.500 món, tên không trùng", () => {
  assert.equal(dishes.length, 1500);
  assert.equal(new Set(dishes.map((d) => d.name)).size, 1500);
});

test("catalog: có món chứa % và _ trong tên (kiểm tra escape)", () => {
  assert.ok(dishes.some((d) => d.name.includes("%")));
  assert.ok(dishes.some((d) => d.name.includes("_")));
});

test("catalog: 80–120 nguyên liệu, tên không trùng", () => {
  const list = Object.values(ingredients);
  assert.ok(list.length >= 80 && list.length <= 120, `${list.length} nguyên liệu`);
  assert.equal(new Set(list.map((i) => i.name)).size, list.length);
});

test("catalog: công thức 1–6 dòng, nguyên liệu tồn tại, không lặp, định lượng > 0", () => {
  for (const d of dishes) {
    assert.ok(d.recipe.length >= 1 && d.recipe.length <= 6, d.name);
    const keys = d.recipe.map(([key]) => key);
    assert.equal(new Set(keys).size, keys.length, d.name);
    for (const [key, qty] of d.recipe) {
      assert.ok(Object.hasOwn(ingredients, key), `${d.name}: ${key}`);
      assert.ok(qty > 0, `${d.name}: ${key}`);
    }
  }
});

test("catalog: đầu bếp, danh mục, giá, mô tả hợp lệ", () => {
  for (const d of dishes) {
    assert.ok(Object.hasOwn(chefs, d.chef), d.name);
    assert.ok(DISH_CATEGORIES.includes(d.category), d.name);
    assert.ok(Number.isInteger(d.price) && d.price > 0 && d.price <= 2000000, `${d.name}: ${d.price}`);
    assert.ok(d.description && d.description.trim(), d.name);
    assert.equal(typeof d.available, "boolean", d.name);
  }
});

test("catalog: ít nhất 10% món tạm hết", () => {
  assert.ok(dishes.filter((d) => !d.available).length >= 150);
});

test("catalog: sinh cố định (deterministic)", () => {
  assert.deepEqual(buildCatalog(), catalog);
});
