// Block 10: điều hướng sau đăng nhập — trang quản trị chỉ dành cho Admin
import test from "node:test";
import assert from "node:assert/strict";
import { isAdminUser, landingFor, safeNext } from "./landing.js";

const admin = { role: "admin" };
const editor = { role: "editor" };
const viewer = { role: "viewer" };

test("isAdminUser: chỉ role admin", () => {
  assert.deepEqual([admin, editor, viewer, null, {}].map(isAdminUser), [true, false, false, false, false]);
});

test("landingFor: không có next -> Admin về /admin/dishes, role khác về thực đơn", () => {
  assert.equal(landingFor(null, admin), "/admin/dishes");
  assert.equal(landingFor(null, editor), "/dishes");
  assert.equal(landingFor(undefined, viewer), "/dishes");
});

test("landingFor: next tới /admin chỉ giữ cho Admin", () => {
  assert.equal(landingFor("/admin/chefs?page=2", admin), "/admin/chefs?page=2");
  assert.equal(landingFor("/admin/chefs?page=2", viewer), "/dishes");
  assert.equal(landingFor("/admin", editor), "/dishes");
  assert.equal(landingFor("/admin?x=1", editor), "/dishes");
});

test("landingFor: next ngoài /admin được giữ cho mọi role; next lạ bị bỏ", () => {
  assert.equal(landingFor("/account/security", viewer), "/account/security");
  assert.equal(landingFor("/administrator-blog", viewer), "/administrator-blog");
  assert.equal(landingFor("//evil.example", viewer), "/dishes");
  assert.equal(landingFor("https://evil.example", admin), "/admin/dishes");
  assert.equal(safeNext("/\\evil"), null);
});
