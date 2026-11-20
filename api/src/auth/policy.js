// Nơi duy nhất quyết định quyền của bản API. Cùng quy tắc với bản SSR (src/auth/policy.js) vì hai
// bản dùng chung bảng users và dishes.
//
// RBAC: role -> các thao tác được phép.
//   viewer  đọc
//   editor  đọc, tạo, sửa
//   admin   đọc, tạo, sửa, xóa
// ABAC (món ăn, Block 10 đưa sang API): Editor chỉ sửa món có chefId trùng chefId của tài khoản VÀ
//   status = draft. chefId, role của tài khoản đọc từ DB ở mỗi request (requireAuth), không lấy từ
//   token hay body.

const ROLES = ["viewer", "editor", "admin"];

const PERMISSIONS = {
  viewer: new Set(["read"]),
  editor: new Set(["read", "create", "update"]),
  admin: new Set(["read", "create", "update", "delete"]),
};

// Thao tác của một request suy ra từ HTTP method
const ACTIONS = { GET: "read", HEAD: "read", POST: "create", PATCH: "update", PUT: "update", DELETE: "delete" };
const actionFor = (method) => ACTIONS[method] || null;

// RBAC: user có được làm thao tác action không (read | create | update | delete)
function can(user, action) {
  const allowed = user && PERMISSIONS[user.role];
  return Boolean(allowed && allowed.has(action));
}

const isAdmin = (user) => Boolean(user && user.role === "admin");

// Chỉ Admin được chọn đầu bếp phụ trách và trạng thái draft/published của món
const canAssignDish = isAdmin;

// Tạo món: Admin; Editor phải gắn với một đầu bếp (món mới sẽ thuộc đầu bếp đó)
function canCreateDish(user) {
  if (isAdmin(user)) return true;
  return can(user, "create") && Number.isInteger(user.chefId);
}

// ABAC: điều kiện món phải thỏa để user sửa được. Admin: không thêm điều kiện ({}).
// Editor: chefId trùng + đang draft. Không sửa được món nào: null.
// Route dùng chính object này làm điều kiện WHERE của câu UPDATE, nên điều kiện được kiểm tra lại
// trong cùng câu lệnh ghi (món bị đổi status giữa lúc mở form và lúc gửi -> không ghi).
function dishEditScope(user) {
  if (isAdmin(user)) return {};
  if (can(user, "update") && Number.isInteger(user.chefId)) return { chefId: user.chefId, status: "draft" };
  return null;
}

function canEditDish(user, dish) {
  const scope = dishEditScope(user);
  if (!scope || !dish) return false;
  return Object.entries(scope).every(([key, value]) => dish[key] === value);
}

const canDeleteDish = (user) => can(user, "delete");

module.exports = {
  ROLES,
  PERMISSIONS,
  actionFor,
  can,
  isAdmin,
  canAssignDish,
  canCreateDish,
  dishEditScope,
  canEditDish,
  canDeleteDish,
};
