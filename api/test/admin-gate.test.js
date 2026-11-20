// Block 10: cổng phân quyền khu quản trị của API (chạy sau requireAuth nên req.user đã có).
// Không cần DB: các middleware này chỉ đọc req.user.
const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAdmin, requireDishStaff, dishStaffFor, adminOrEditorRead } = require("../src/auth/middleware");

const admin = { id: 1, role: "admin" };
const editor = { id: 2, role: "editor", chefId: 7 };
const viewer = { id: 3, role: "viewer" };

// Chạy middleware, trả "next" hoặc status đã gửi
function run(mw, user, method) {
  let result = null;
  const req = { user, method, originalUrl: "/api/test" };
  const res = {
    req,
    status(code) {
      result = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  mw(req, res, () => (result = "next"));
  return result;
}

test("requireDishStaff: viewer -> 403 mọi method", () => {
  for (const m of ["GET", "POST", "PATCH", "DELETE"]) assert.equal(run(requireDishStaff, viewer, m), 403, m);
});

test("requireDishStaff: editor đọc, tạo, sửa; xóa -> 403", () => {
  assert.equal(run(requireDishStaff, editor, "GET"), "next");
  assert.equal(run(requireDishStaff, editor, "POST"), "next");
  assert.equal(run(requireDishStaff, editor, "PATCH"), "next");
  assert.equal(run(requireDishStaff, editor, "DELETE"), 403);
});

test("requireDishStaff: admin mọi method", () => {
  for (const m of ["GET", "POST", "PATCH", "DELETE"]) assert.equal(run(requireDishStaff, admin, m), "next", m);
});

test("dishStaffFor: GET công khai của /api/dishes không bị chặn", () => {
  const mw = dishStaffFor(["POST", "PATCH", "DELETE"]);
  assert.equal(run(mw, undefined, "GET"), "next");
  assert.equal(run(mw, viewer, "POST"), 403);
  assert.equal(run(mw, editor, "DELETE"), 403);
});

test("adminOrEditorRead: editor chỉ GET đầu bếp / nguyên liệu, viewer -> 403", () => {
  assert.equal(run(adminOrEditorRead, editor, "GET"), "next");
  for (const m of ["POST", "PATCH", "DELETE"]) assert.equal(run(adminOrEditorRead, editor, m), 403, m);
  assert.equal(run(adminOrEditorRead, viewer, "GET"), 403);
  assert.equal(run(adminOrEditorRead, admin, "DELETE"), "next");
});

test("requireAdmin (đặt bàn): chỉ admin", () => {
  assert.equal(run(requireAdmin, admin, "GET"), "next");
  assert.equal(run(requireAdmin, editor, "GET"), 403);
  assert.equal(run(requireAdmin, viewer, "GET"), 403);
});
