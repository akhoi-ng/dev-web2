import { useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { authApi } from "../../api/index.js";
import FieldError from "../../components/FieldError.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import Recaptcha from "../../auth/Recaptcha.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { AuthCard, Notice, describeError, field, label, linkCls, primaryBtn } from "./shared.jsx";

// /register — POST /api/auth/register { email, password, confirm, captcha }.
// Không có ô role: server luôn gán viewer, kể cả khi ai đó gửi role trong body.
export default function RegisterPage() {
  useDocumentTitle("Đăng ký");
  const { status } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "", confirm: "" });
  const [captcha, setCaptcha] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const captchaRef = useRef(null);

  if (status === "authed") return <Navigate to="/admin/dishes" replace />;

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    // Kiểm tra nhanh ở client cho trải nghiệm; server kiểm tra lại toàn bộ
    if (values.password !== values.confirm) {
      setFields({ confirm: "Mật khẩu nhập lại không khớp." });
      setError({ message: "Vui lòng kiểm tra lại các ô được đánh dấu.", code: "VALIDATION_FAILED" });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    try {
      await authApi.register({ ...values, captcha });
      navigate(`/activate?registered=1&email=${encodeURIComponent(values.email.trim())}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") setFields(err.fields || {});
      setError(describeError(err));
      if (captchaRef.current) captchaRef.current.reset();
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Tạo tài khoản"
      subtitle="Sau khi đăng ký, mã OTP gồm 6 chữ số sẽ được gửi tới email để kích hoạt tài khoản."
      footer={
        <>
          Đã có tài khoản? <Link to="/login" className={linkCls}>Đăng nhập</Link>
        </>
      }
    >
      {error && <Notice code={error.code}>{error.message}</Notice>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" type="email" autoComplete="email" required value={values.email} onChange={set("email")}
                 className={field} aria-invalid={Boolean(fields.email)} />
          <FieldError message={fields.email} />
        </div>
        <div>
          <label htmlFor="password" className={label}>Mật khẩu</label>
          <input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
                 value={values.password} onChange={set("password")} className={field} aria-invalid={Boolean(fields.password)}
                 aria-describedby="password-hint" />
          <p id="password-hint" className="mt-1 text-sm text-stone-500">Tối thiểu 8 ký tự.</p>
          <FieldError message={fields.password} />
        </div>
        <div>
          <label htmlFor="confirm" className={label}>Nhập lại mật khẩu</label>
          <input id="confirm" type="password" autoComplete="new-password" required value={values.confirm} onChange={set("confirm")}
                 className={field} aria-invalid={Boolean(fields.confirm)} />
          <FieldError message={fields.confirm} />
        </div>
        <Recaptcha ref={captchaRef} onChange={setCaptcha} />
        <button type="submit" disabled={pending || !captcha} className={primaryBtn}>
          {pending ? "Đang gửi…" : "Đăng ký"}
        </button>
      </form>
    </AuthCard>
  );
}
