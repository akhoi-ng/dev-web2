import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { authApi } from "../../api/index.js";
import FieldError from "../../components/FieldError.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { AuthCard, Notice, describeError, field, label, linkCls, primaryBtn } from "./shared.jsx";

/*
 * /reset?token=... — mở từ link trong email. Mở trang CHỈ hiện form, không gọi API: token chưa bị
 * tiêu thụ. Token chỉ bị tiêu thụ khi gửi POST /api/auth/reset { token, password, confirm }.
 * Đặt lại xong không tự đăng nhập; mọi JWT cũ của tài khoản mất hiệu lực (tokenVersion tăng).
 */
export default function ResetPage() {
  useDocumentTitle("Đặt mật khẩu mới");
  const navigate = useNavigate();
  const location = useLocation();
  // Giữ token trong state của trang (đọc một lần từ URL)
  const [token] = useState(() => new URLSearchParams(location.search).get("token") || "");
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});

  // Bỏ token khỏi thanh địa chỉ và lịch sử để không lộ qua ảnh chụp màn hình hay khi chia sẻ link
  useEffect(() => {
    if (new URLSearchParams(location.search).has("token")) navigate("/reset", { replace: true });
  }, [location.search, navigate]);

  // Không gửi Referer chứa đường dẫn trang khi trang tải tài nguyên ngoài
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    if (values.password !== values.confirm) {
      setFields({ confirm: "Mật khẩu nhập lại không khớp." });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    try {
      await authApi.reset({ token, ...values });
      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") setFields(err.fields || {});
      setError({ ...describeError(err), invalidToken: err instanceof ApiError && err.code === "INVALID_RESET_TOKEN" });
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Link không hợp lệ" footer={<Link to="/login" className={linkCls}>Về trang đăng nhập</Link>}>
        <Notice code="INVALID_RESET_TOKEN">
          Link đặt lại mật khẩu thiếu mã. Hãy mở đúng link trong email hoặc{" "}
          <Link to="/forgot" className={linkCls}>yêu cầu link mới</Link>.
        </Notice>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Đặt mật khẩu mới"
      subtitle="Sau khi đổi, mọi phiên đăng nhập cũ của tài khoản sẽ bị đăng xuất."
      footer={<Link to="/login" className={linkCls}>Về trang đăng nhập</Link>}
    >
      {error && (
        <Notice code={error.code}>
          {error.message}
          {error.invalidToken && (
            <>
              {" "}
              <Link to="/forgot" className={linkCls}>Yêu cầu link mới</Link>
            </>
          )}
        </Notice>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <label htmlFor="password" className={label}>Mật khẩu mới</label>
          <input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
                 value={values.password} onChange={set("password")} className={field} aria-invalid={Boolean(fields.password)} />
          <FieldError message={fields.password} />
        </div>
        <div>
          <label htmlFor="confirm" className={label}>Nhập lại mật khẩu mới</label>
          <input id="confirm" type="password" autoComplete="new-password" required value={values.confirm} onChange={set("confirm")}
                 className={field} aria-invalid={Boolean(fields.confirm)} />
          <FieldError message={fields.confirm} />
        </div>
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "Đang lưu…" : "Đặt mật khẩu mới"}
        </button>
      </form>
    </AuthCard>
  );
}
