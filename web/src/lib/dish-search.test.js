import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_CRITERIA, readCriteria, apiQuery, writeParams, criteriaKey, isRankedCriteria, hasFilters } from "./dish-search.js";

const c = (extra) => ({ ...EMPTY_CRITERIA, ...extra });

test("readCriteria: URL trống -> mặc định", () => {
  assert.deepEqual(readCriteria(new URLSearchParams("")), EMPTY_CRITERIA);
  assert.equal(EMPTY_CRITERIA.mode, "basic");
  assert.equal(EMPTY_CRITERIA.sort, "default");
});

test("readCriteria: đọc và cắt khoảng trắng", () => {
  const r = readCriteria(new URLSearchParams("mode=advanced&q=%20ph%E1%BB%9F%20&available=false&minPrice=0"));
  assert.equal(r.q, "phở");
  assert.equal(r.available, "false");
  assert.equal(r.minPrice, "0");
});

test("apiQuery: basic bỏ tiêu chí nâng cao", () => {
  assert.deepEqual(apiQuery(c({ q: "a", minPrice: "5", available: "true", ingredient: "tỏi" })), { q: "a" });
});

test("apiQuery: advanced giữ false và 0", () => {
  assert.deepEqual(apiQuery(c({ mode: "advanced", available: "false", minPrice: "0" })), {
    mode: "advanced",
    minPrice: "0",
    available: "false",
  });
});

test("apiQuery: xếp theo độ liên quan thì bỏ sort", () => {
  assert.deepEqual(apiQuery(c({ mode: "fuzzy", q: "pho", sort: "price-asc" })), { mode: "fuzzy", q: "pho" });
  assert.equal(apiQuery(c({ mode: "fuzzy", sort: "price-asc" })).sort, "price-asc");
  assert.equal(isRankedCriteria(c({ mode: "fulltext", q: "x" })), true);
  assert.equal(isRankedCriteria(c({ mode: "fulltext" })), false);
});

test("writeParams: chỉ ghi giá trị khác mặc định, thêm extra", () => {
  assert.equal(writeParams(EMPTY_CRITERIA).toString(), "");
  assert.equal(writeParams(c({ q: "phở" }), { page: 2, view: "" }).toString(), "q=ph%E1%BB%9F&page=2");
});

test("criteriaKey: giống nhau khi chỉ khác tiêu chí bị bỏ qua", () => {
  assert.equal(criteriaKey(c({ q: "a", minPrice: "5" })), criteriaKey(c({ q: "a" })));
  assert.notEqual(criteriaKey(c({ q: "a" })), criteriaKey(c({ q: "b" })));
});

test("hasFilters: sort không tính là bộ lọc", () => {
  assert.equal(hasFilters(c({ sort: "price-asc" })), false);
  assert.equal(hasFilters(c({ category: "Khai vị" })), true);
});
