import { test } from "node:test";
import assert from "node:assert/strict";
import { initialList, startLoading, applyPage, applyError, canLoad } from "./load-more.js";

const dishes = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i }));

test("applyPage: nối hai trang, tăng nextPage", () => {
  let s = initialList("k");
  s = applyPage(startLoading(s, "k"), "k", { items: dishes(1, 9), total: 30, page: 1, pageSize: 9 });
  s = applyPage(startLoading(s, "k"), "k", { items: dishes(10, 18), total: 30, page: 2, pageSize: 9 });
  assert.equal(s.items.length, 18);
  assert.equal(s.nextPage, 3);
  assert.equal(s.end, false);
  assert.equal(s.pending, false);
});

test("applyPage: món trùng id chỉ xuất hiện một lần", () => {
  let s = applyPage(initialList("k"), "k", { items: dishes(1, 9), total: 30, page: 1, pageSize: 9 });
  s = applyPage(s, "k", { items: dishes(9, 17), total: 30, page: 2, pageSize: 9 });
  assert.equal(s.items.length, 17);
  assert.equal(new Set(s.items.map((d) => d.id)).size, 17);
});

test("applyPage/applyError: phản hồi của lần tìm cũ bị bỏ", () => {
  const s = initialList("moi");
  assert.equal(applyPage(s, "cu", { items: dishes(1, 9), total: 9, page: 1, pageSize: 9 }), s);
  assert.equal(applyError(s, "cu", new Error("x")), s);
  assert.equal(startLoading(s, "cu"), s);
});

test("applyPage: hết khi page * pageSize >= total hoặc trang rỗng", () => {
  assert.equal(applyPage(initialList("k"), "k", { items: dishes(1, 9), total: 9, page: 1, pageSize: 9 }).end, true);
  assert.equal(applyPage(initialList("k"), "k", { items: [], total: 0, page: 1, pageSize: 9 }).end, true);
  assert.equal(applyPage(initialList("k"), "k", { items: [], total: 20, page: 3, pageSize: 9 }).end, true);
});

test("canLoad: không tải khi đang tải, đã hết hoặc có lỗi", () => {
  const s = initialList("k");
  assert.equal(canLoad(s), true);
  assert.equal(canLoad(startLoading(s, "k")), false);
  assert.equal(canLoad({ ...s, end: true }), false);
  assert.equal(canLoad(applyError(s, "k", new Error("x"))), false);
});
