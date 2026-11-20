// Block 10: RBAC + ABAC của bản API (cùng quy tắc với src/auth/policy.js của bản SSR)
const test = require("node:test");
const assert = require("node:assert/strict");
const { can, actionFor, canCreateDish, canEditDish, canDeleteDish, dishEditScope, canAssignDish } = require("../src/auth/policy");
const { validateDish } = require("../src/utils/validators");

const viewer = { id: 1, role: "viewer", chefId: null };
const editorA = { id: 2, role: "editor", chefId: 10 };
const editorNoChef = { id: 4, role: "editor", chefId: null };
const admin = { id: 5, role: "admin", chefId: null };
const ACTIONS = ["read", "create", "update", "delete"];

test("RBAC: viewer đọc; editor đọc, tạo, sửa; admin thêm xóa", () => {
  assert.deepEqual(ACTIONS.map((a) => can(viewer, a)), [true, false, false, false]);
  assert.deepEqual(ACTIONS.map((a) => can(editorA, a)), [true, true, true, false]);
  assert.deepEqual(ACTIONS.map((a) => can(admin, a)), [true, true, true, true]);
  assert.equal(can(null, "read"), false);
  assert.equal(can({ role: "superuser" }, "read"), false);
  assert.equal(can(admin, null), false);
});

test("actionFor: suy ra thao tác từ HTTP method; method lạ -> null (bị từ chối)", () => {
  assert.deepEqual(["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"].map(actionFor), ["read", "read", "create", "update", "update", "delete"]);
  assert.equal(actionFor("TRACE"), null);
});

test("ABAC: editor chỉ sửa món draft của đầu bếp mình; admin sửa mọi món", () => {
  const draftA = { chefId: 10, status: "draft" };
  const publishedA = { chefId: 10, status: "published" };
  const draftB = { chefId: 20, status: "draft" };
  assert.equal(canEditDish(editorA, draftA), true);
  assert.equal(canEditDish(editorA, publishedA), false);
  assert.equal(canEditDish(editorA, draftB), false);
  assert.equal(canEditDish(editorNoChef, { chefId: null, status: "draft" }), false);
  assert.equal(canEditDish(viewer, draftA), false);
  assert.equal(canEditDish(admin, publishedA), true);
  assert.equal(canEditDish(admin, null), false);

  assert.deepEqual(dishEditScope(editorA), { chefId: 10, status: "draft" });
  assert.deepEqual(dishEditScope(admin), {});
  assert.equal(dishEditScope(viewer), null);
  assert.equal(dishEditScope(editorNoChef), null);
});

test("tạo / xóa / gán: editor phải có chefId mới tạo được; chỉ admin xóa và gán đầu bếp, trạng thái", () => {
  assert.deepEqual([viewer, editorA, editorNoChef, admin].map(canCreateDish), [false, true, false, true]);
  assert.deepEqual([viewer, editorA, admin].map(canDeleteDish), [false, false, true]);
  assert.deepEqual([viewer, editorA, admin].map(canAssignDish), [false, false, true]);
});

test("validateDish canAssign=false: chefId và status trong body bị bỏ qua, không thành lỗi", () => {
  const ctx = { chefs: [{ id: 1 }], ingredients: [] };
  const body = { name: "Phở", price: 50000, chefId: 1, status: "published" };
  const asEditor = validateDish(body, { ...ctx, canAssign: false });
  assert.deepEqual(asEditor.fields, {});
  assert.equal("chefId" in asEditor.data, false);
  assert.equal("status" in asEditor.data, false);

  const asAdmin = validateDish(body, ctx);
  assert.equal(asAdmin.data.chefId, 1);
  assert.equal(asAdmin.data.status, "published");
  assert.equal(validateDish({ ...body, status: "archived" }, ctx).fields.status, "Trạng thái phải là draft hoặc published.");
  assert.equal("status" in validateDish({ name: "A", price: 1 }, ctx).data, false, "không gửi status -> route quyết định");

  const patch = validateDish({ status: "draft" }, { ...ctx, partial: true, canAssign: false });
  assert.deepEqual(patch.data, {}, "PATCH của editor chỉ đổi status -> không có gì để ghi");
});
