// Block 9 Bài 2: nơi duy nhất quyết định quyền. Route, middleware và view đều hỏi ở đây.
//
// RBAC: role -> các thao tác được phép.
//   viewer  đọc
//   editor  đọc, tạo, sửa
//   admin   đọc, tạo, sửa, xóa
// ABAC (món ăn): Editor chỉ sửa món có chefId trùng chefId của tài khoản VÀ status = draft.
//   chefId của tài khoản đọc từ DB (loadSession), không bao giờ lấy từ form.
// Role, chefId đều đọc lại từ DB ở mỗi request nên đổi quyền có hiệu lực ngay.

const ROLES = ["viewer", "editor", "admin"];

const PERMISSIONS = {
  viewer: new Set(["read"]),
  editor: new Set(["read", "create", "update"]),
  admin: new Set(["read", "create", "update", "delete"]),
};

const DISH_STATUSES = { draft: "Nháp", published: "Đã đăng" };

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

// ABAC: điều kiện mà món phải thỏa để user sửa được. Admin: không thêm điều kiện ({}).
// Editor: chefId trùng + đang draft. Không sửa được món nào: null.
// Route dùng chính object này làm điều kiện WHERE của câu UPDATE, nên điều kiện được kiểm tra
// lại trong cùng câu lệnh ghi (món bị đổi status giữa lúc mở form và lúc gửi -> không ghi).
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

/*
 * Thao tác của một request trong khu vực quản trị, suy ra từ method và đường dẫn
 * (method-override đã đổi POST ?_method=PATCH|DELETE thành PATCH|DELETE):
 *   GET .../new -> create, GET .../edit -> update, GET .../delete -> delete, GET khác -> read
 *   POST -> create, PATCH/PUT -> update, DELETE -> delete
 * Method khác -> null (từ chối).
 */
function actionFor(method, path) {
  const last = String(path).replace(/\/+$/, "").split("/").pop();
  if (method === "GET" || method === "HEAD") {
    if (last === "new") return "create";
    if (last === "edit") return "update";
    if (last === "delete") return "delete";
    return "read";
  }
  if (method === "POST") return "create";
  if (method === "PATCH" || method === "PUT") return "update";
  if (method === "DELETE") return "delete";
  return null;
}

module.exports = {
  ROLES,
  PERMISSIONS,
  DISH_STATUSES,
  can,
  isAdmin,
  canAssignDish,
  canCreateDish,
  dishEditScope,
  canEditDish,
  actionFor,
};
