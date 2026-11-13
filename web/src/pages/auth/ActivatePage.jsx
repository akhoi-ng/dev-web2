import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { authApi } from "../../api/index.js";
import FieldError from "../../components/FieldError.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { AuthCard, Notice, describeError, field, label, linkCls, primaryBtn } from "./shared.jsx";

const SENT =
  "Nếu email này vừa đăng ký và chưa kích hoạt, mã OTP đã được gửi tới hộp thư. Mã có hiệu lực trong 10 phút.";

// /activate — POST /api/auth/activate { email, otp }; gửi lại: POST /api/auth/activate/resend.
// Kích hoạt thành công không cấp token: chuyển sang trang đăng nhập.
export default function ActivatePage() {
  useDocumentTitle("Kích hoạt tài khoản");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(null); // "activate" | "resend" | null
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [notice, setNotice] = useState(params.get("registered") === "1" ? SENT : "");

  async function run(kind, action) {
    if (pending) return;
    setPending(kind);
    setError(null);
    setFields({});
    try {
      return await action();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") setFields(err.fields || {});
      setNotice("");
      setError(describeError(err));
      return null;
    } finally {
      setPending(null);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const ok = await run("activate", () => authApi.activate({ email, otp: otp.trim() }));
    if (ok) navigate(`/login?activated=1&email=${encodeURIComponent(email.trim())}`);
    else setOtp("");
  }

  async function onResend() {
    const ok = await run("resend", () => authApi.resendOtp({ email }));
    if (ok) setNotice(SENT);
  }

  return (
    <AuthCard
      title="Kích hoạt tài khoản"
      subtitle="Nhập email đã đăng ký và mã OTP 6 chữ số trong thư."
      footer={<Link to="/login" className={linkCls}>Về trang đăng nhập</Link>}
    >
      {notice && !error && <Notice tone="info">{notice}</Notice>}
      {error && <Notice code={error.code}>{error.message}</Notice>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                 className={field} aria-invalid={Boolean(fields.email)} />
          <FieldError message={fields.email} />
        </div>
        <div>
          <label htmlFor="otp" className={label}>Mã OTP</label>
          <input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required
                 value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                 className={field + " font-mono text-2xl tracking-[0.5em]"} />
        </div>
        <button type="submit" disabled={Boolean(pending) || otp.length !== 6} className={primaryBtn}>
          {pending === "activate" ? "Đang kích hoạt…" : "Kích hoạt"}
        </button>
        <button type="button" onClick={onResend} disabled={Boolean(pending) || !email.trim()}
                className="min-h-11 rounded-2xl border border-[#D9C3B7] bg-white px-6 font-semibold hover:bg-brand-50 disabled:opacity-60">
          {pending === "resend" ? "Đang gửi…" : "Gửi lại mã"}
        </button>
      </form>
    </AuthCard>
  );
}
