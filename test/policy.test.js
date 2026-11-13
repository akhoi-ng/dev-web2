const test = require("node:test");
const assert = require("node:assert/strict");
const { can, canCreateDish, canEditDish, dishEditScope, canAssignDish, actionFor } = require("../src/auth/policy");
const { validateDish } = require("../src/utils/validators");

const viewer = { id: 1, role: "viewer", chefId: null };
const editorA = { id: 2, role: "editor", chefId: 10 };
const editorB = { id: 3, role: "editor", chefId: 20 };
const editorNoChef = { id: 4, role: "editor", chefId: null };
const admin = { id: 5, role: "admin", chefId: null };

test("RBAC: viewer đọc; editor đọc, tạo, sửa; admin thêm xóa", () => {
  assert.deepEqual(["read", "create", "update", "delete"].map((a) => can(viewer, a)), [true, false, false, false]);
  assert.deepEqual(["read", "create", "update", "delete"].map((a) => can(editorA, a)), [true, true, true, false]);
  assert.deepEqual(["read", "create", "update", "delete"].map((a) => can(admin, a)), [true, true, true, true]);
  assert.equal(can(null, "read"), false);
  assert.equal(can({ role: "superuser" }, "read"), false);
  assert.equal(can(admin, "drop"), false);
});

test("actionFor: suy ra thao tác từ method + đường dẫn", () => {
  assert.equal(actionFor("GET", "/dishes"), "read");
  assert.equal(actionFor("GET", "/dishes/5"), "read");
  assert.equal(actionFor("GET", "/dishes/new"), "create");
  assert.equal(actionFor("GET", "/dishes/5/edit"), "update");
  assert.equal(actionFor("GET", "/dishes/5/delete"), "delete");
  assert.equal(actionFor("GET", "/dishes/5/delete/"), "delete");
  assert.equal(actionFor("POST", "/dishes"), "create");
  assert.equal(actionFor("PATCH", "/dishes/5"), "update");
  assert.equal(actionFor("DELETE", "/dishes/5"), "delete");
  assert.equal(actionFor("TRACE", "/dishes"), null);
});

test("ABAC: editor chỉ sửa món draft của đầu bếp mình", () => {
  const draftA = { id: 1, chefId: 10, status: "draft" };
  const publishedA = { id: 2, chefId: 10, status: "published" };
  const draftB = { id: 3, chefId: 20, status: "draft" };
  const unassigned = { id: 4, chefId: null, status: "draft" };

  assert.equal(canEditDish(editorA, draftA), true);
  assert.equal(canEditDish(editorA, publishedA), false);
  assert.equal(canEditDish(editorA, draftB), false);
  assert.equal(canEditDish(editorA, unassigned), false);
  assert.equal(canEditDish(editorB, draftB), true);
  assert.equal(canEditDish(editorNoChef, unassigned), false, "editor chưa gắn đầu bếp không sửa được món chefId null");
  assert.equal(canEditDish(viewer, draftA), false);
  assert.equal(canEditDish(admin, publishedA), true);

  assert.deepEqual(dishEditScope(editorA), { chefId: 10, status: "draft" });
  assert.deepEqual(dishEditScope(admin), {});
  assert.equal(dishEditScope(viewer), null);
  assert.equal(dishEditScope(editorNoChef), null);
});

test("Tạo món: editor phải gắn đầu bếp; chỉ admin gán chefId/status", () => {
  assert.equal(canCreateDish(editorA), true);
  assert.equal(canCreateDish(editorNoChef), false);
  assert.equal(canCreateDish(viewer), false);
  assert.equal(canCreateDish(admin), true);
  assert.equal(canAssignDish(editorA), false);
  assert.equal(canAssignDish(admin), true);
});

test("validateDish: canAssign = false bỏ qua chefId/status trong body", () => {
  const body = { name: "Món thử", price: "1000", chefId: "20", status: "published" };
  const chefs = [{ id: 10 }, { id: 20 }];
  const asEditor = validateDish(body, { chefs, canAssign: false });
  assert.deepEqual(asEditor.errors, []);
  assert.equal("chefId" in asEditor.data, false);
  assert.equal("status" in asEditor.data, false);

  const forged = validateDish({ ...body, chefId: "999" }, { chefs, canAssign: false });
  assert.deepEqual(forged.errors, [], "chefId giả từ editor bị bỏ qua, không thành lỗi validate");

  const asAdmin = validateDish(body, { chefs, canAssign: true });
  assert.equal(asAdmin.data.chefId, 20);
  assert.equal(asAdmin.data.status, "published");
  assert.ok(validateDish({ ...body, status: "archived" }, { chefs }).errors.length > 0);
});
