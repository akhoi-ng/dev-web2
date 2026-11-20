// Block 10: điều hướng sau đăng nhập — Admin mọi trang quản trị, Editor chỉ khu món ăn, Viewer không vào
import test from "node:test";
import assert from "node:assert/strict";
import { canOpenAdminPath, isAdminUser, isStaffUser, landingFor, safeNext } from "./landing.js";

const admin = { role: "admin" };
const editor = { role: "editor" };
const viewer = { role: "viewer" };

test("isAdminUser: chỉ role admin; isStaffUser: admin và editor", () => {
  assert.deepEqual([admin, editor, viewer, null, {}].map(isAdminUser), [true, false, false, false, false]);
  assert.deepEqual([admin, editor, viewer, null, {}].map(isStaffUser), [true, true, false, false, false]);
});

test("landingFor: không có next -> Admin, Editor về /admin/dishes, Viewer về thực đơn", () => {
  assert.equal(landingFor(null, admin), "/admin/dishes");
  assert.equal(landingFor(null, editor), "/admin/dishes");
  assert.equal(landingFor(undefined, viewer), "/dishes");
});

test("canOpenAdminPath: Editor chỉ mở khu món ăn", () => {
  assert.equal(canOpenAdminPath("/admin/chefs", admin), true);
  assert.equal(canOpenAdminPath("/admin/dishes/12/edit", editor), true);
  assert.equal(canOpenAdminPath("/admin/dishes?page=2", editor), true);
  assert.equal(canOpenAdminPath("/admin", editor), true);
  assert.equal(canOpenAdminPath("/admin/chefs", editor), false);
  assert.equal(canOpenAdminPath("/admin/bookings", editor), false);
  assert.equal(canOpenAdminPath("/admin/dishes-export", editor), false);
  assert.equal(canOpenAdminPath("/admin/dishes", viewer), false);
});

test("landingFor: next tới /admin chỉ giữ khi tài khoản được mở trang đó", () => {
  assert.equal(landingFor("/admin/chefs?page=2", admin), "/admin/chefs?page=2");
  assert.equal(landingFor("/admin/chefs?page=2", viewer), "/dishes");
  assert.equal(landingFor("/admin/chefs", editor), "/admin/dishes");
  assert.equal(landingFor("/admin/dishes/5/edit", editor), "/admin/dishes/5/edit");
  assert.equal(landingFor("/admin?x=1", viewer), "/dishes");
});

test("landingFor: next ngoài /admin được giữ cho mọi role; next lạ bị bỏ", () => {
  assert.equal(landingFor("/account/security", viewer), "/account/security");
  assert.equal(landingFor("/administrator-blog", viewer), "/administrator-blog");
  assert.equal(landingFor("//evil.example", viewer), "/dishes");
  assert.equal(landingFor("https://evil.example", admin), "/admin/dishes");
  assert.equal(safeNext("/\\evil"), null);
});
