import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingState } from "../components/DataStatus.jsx";
import { useAuth } from "./AuthContext.jsx";

/*
 * Route guard cho /admin/*: chưa đăng nhập thì chuyển về /login?next=<trang đang mở>.
 * Chỉ là giao diện. Request gửi thẳng tới API (công cụ HTTP, sửa mã trong DevTools) vẫn bị backend
 * chặn bằng 401 vì backend tự verify Bearer token ở mỗi request.
 */
export default function RequireAuth() {
  const { status, reason } = useAuth();
  const location = useLocation();

  if (status === "loading") return <LoadingState />;
  if (status !== "authed") {
    const next = location.pathname + location.search;
    const params = new URLSearchParams({ next });
    if (reason === "expired") params.set("expired", "1");
    return <Navigate to={`/login?${params}`} replace />;
  }
  return <Outlet />;
}
