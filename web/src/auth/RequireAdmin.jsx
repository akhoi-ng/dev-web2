import { Link, Outlet } from "react-router-dom";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { isAdminUser, useAuth } from "./AuthContext.jsx";

/*
 * Block 10: route guard cho /admin/* (đặt bên trong RequireAuth nên đã có user).
 * Không phải Admin thì hiện trang 403, không render trang quản trị. Chỉ là giao diện: gửi request
 * thẳng tới API quản trị bằng token của role khác vẫn bị backend trả 403.
 */
export default function RequireAdmin() {
  const { user } = useAuth();
  if (!isAdminUser(user)) return <ForbiddenPanel />;
  return <Outlet />;
}

function ForbiddenPanel() {
  useDocumentTitle("Không có quyền truy cập");
  return (
    <div className="mx-auto max-w-lg py-16 text-center" role="alert" data-code="FORBIDDEN">
      <p className="text-7xl font-extrabold text-brand-600">403</p>
      <h1 className="mt-4 text-2xl font-bold">Trang quản trị chỉ dành cho quản trị viên</h1>
      <p className="mt-2 text-stone-500">Tài khoản của bạn không có quyền vào khu vực này.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/dishes" className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Về thực đơn</Link>
        <Link to="/account/security" className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold hover:bg-stone-100">Bảo mật tài khoản</Link>
      </div>
    </div>
  );
}

// Nội dung chỉ hiện với Admin (link "Về trang quản trị", nút chuyển sang trang quản trị...)
export function AdminOnly({ children }) {
  const { status, user } = useAuth();
  return status === "authed" && isAdminUser(user) ? children : null;
}
