import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import FieldError from "../../components/FieldError.jsx";
import { safeNext, useAuth } from "../../auth/AuthContext.jsx";
import Recaptcha from "../../auth/Recaptcha.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { AuthCard, Notice, describeError, field, isCaptchaError, label, linkCls, primaryBtn } from "./shared.jsx";

const NOTICES = {
  activated: "Tài khoản đã được kích hoạt. Hãy đăng nhập.",
  reset: "Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.",
  expired: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
};

// /login — POST /api/auth/login. CAPTCHA chỉ hiện khi server báo bộ đếm sai đã tới ngưỡng
// (captchaRequired, CAPTCHA_REQUIRED, INVALID_CAPTCHA); server tự kiểm tra lại, không tin giao diện.
export default function LoginPage() {
  useDocumentTitle("Đăng nhập");
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const noticeKey = Object.keys(NOTICES).find((k) => params.get(k) === "1");

  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const captchaRef = useRef(null);

  if (status === "authed") return <Navigate to={next || "/admin/dishes"} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFields({});
    try {
      await login({ email, password, ...(needCaptcha ? { captcha } : {}) });
      navigate(next || "/admin/dishes", { replace: true });
    } catch (err) {
      setPassword("");
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") setFields(err.fields || {});
      if (err instanceof ApiError && (err.captchaRequired || isCaptchaError(err))) setNeedCaptcha(true);
      setError({ ...describeError(err), pendingAccount: err instanceof ApiError && err.code === "ACCOUNT_NOT_ACTIVATED" });
      // Token reCAPTCHA chỉ dùng được một lần: lần gửi sau cần xác nhận lại
      if (captchaRef.current) captchaRef.current.reset();
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Đăng nhập"
      subtitle="Dành cho nhân viên quản lý thực đơn, đầu bếp, nguyên liệu và đặt bàn."
      footer={
        <>
          Chưa có tài khoản? <Link to="/register" className={linkCls}>Đăng ký</Link>
        </>
      }
    >
      {noticeKey && !error && <Notice tone={noticeKey === "expired" ? "info" : "ok"}>{NOTICES[noticeKey]}</Notice>}
      {error && (
        <Notice code={error.code}>
          {error.message}
          {error.pendingAccount && (
            <>
              {" "}
              <Link to={`/activate?email=${encodeURIComponent(email)}`} className={linkCls}>Nhập mã kích hoạt</Link>
            </>
          )}
        </Notice>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
                 className={field} aria-invalid={Boolean(fields.email)} />
          <FieldError message={fields.email} />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className={label}>Mật khẩu</label>
            <Link to="/forgot" className="text-sm font-semibold text-brand-700 hover:underline">Quên mật khẩu?</Link>
          </div>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
                 className={field} aria-invalid={Boolean(fields.password)} />
          <FieldError message={fields.password} />
        </div>

        {needCaptcha && (
          <div>
            <p className="mb-2 text-sm text-stone-600">Bạn đã nhập sai nhiều lần. Vui lòng xác nhận trước khi thử lại.</p>
            <Recaptcha ref={captchaRef} onChange={setCaptcha} />
          </div>
        )}

        <button type="submit" disabled={pending || (needCaptcha && !captcha)} className={primaryBtn}>
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </AuthCard>
  );
}
