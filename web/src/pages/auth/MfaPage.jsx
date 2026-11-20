import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import FieldError from "../../components/FieldError.jsx";
import { landingFor, safeNext, useAuth } from "../../auth/AuthContext.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { AuthCard, Notice, describeError, field, label, linkCls, primaryBtn } from "./shared.jsx";

/*
 * /login/mfa — Block 10, bước 2 khi tài khoản bật MFA: POST /api/auth/mfa { challenge, code }.
 * Challenge do trang đăng nhập chuyển sang qua state của router (chỉ nằm trong bộ nhớ). Mở thẳng URL
 * hoặc tải lại trang thì không còn challenge -> về /login. Mã 6 chữ số là TOTP; dạng XXXXX-XXXXX là
 * mã khôi phục. Số lượt thử, chống dùng lại mã đều do server quyết định.
 */
export default function MfaPage() {
  useDocumentTitle("Xác thực hai bước");
  const { status, user, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const challenge = state && typeof state.challenge === "string" ? state.challenge : null;
  const next = safeNext(state && state.next);

  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState("");

  if (status === "authed" && !pending) return <Navigate to={landingFor(next, user)} replace />;
  if (!challenge) return <Navigate to="/login?mfaExpired=1" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFieldError("");
    try {
      const result = await verifyMfa(challenge, code);
      if (result.method === "recovery") {
        // Vào bằng mã khôi phục (thường do mất điện thoại): đưa tới trang bảo mật để thay thiết bị
        navigate("/account/security", { replace: true, state: { recoveryUsed: true, recoveryRemaining: result.recoveryRemaining } });
      } else {
        navigate(landingFor(next, result.user), { replace: true });
      }
    } catch (err) {
      setCode("");
      // 401: lần chờ hết hạn hoặc đã sai đủ số lần -> phải đăng nhập lại từ đầu
      if (err instanceof ApiError && err.status === 401) {
        navigate(`/login?${err.code === "MFA_TOO_MANY_ATTEMPTS" ? "mfaFailed" : "mfaExpired"}=1`, { replace: true });
        return;
      }
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") setFieldError((err.fields && err.fields.code) || "");
      setError(describeError(err));
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Xác thực hai bước"
      subtitle={
        useRecovery
          ? "Nhập một mã khôi phục bạn đã lưu khi bật xác thực hai bước. Mỗi mã chỉ dùng được một lần."
          : "Mở ứng dụng Authenticator trên điện thoại và nhập mã 6 chữ số đang hiện cho Lửa Hồng."
      }
      footer={
        <>
          Không phải bạn? <Link to="/login" className={linkCls}>Đăng nhập lại</Link>
        </>
      }
    >
      {state.email && <p className="-mt-2 mb-5 text-sm text-stone-500">Tài khoản: <span className="font-semibold text-stone-700">{state.email}</span></p>}
      {error && <Notice code={error.code}>{error.message}</Notice>}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-mfa-step>
        <div>
          <label htmlFor="code" className={label}>{useRecovery ? "Mã khôi phục" : "Mã xác thực"}</label>
          {useRecovery ? (
            <input key="recovery" id="code" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} required
                   value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX"
                   className={field + " text-center font-mono text-lg tracking-widest"} aria-invalid={Boolean(fieldError)} />
          ) : (
            <input key="totp" id="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus
                   value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456"
                   className={field + " text-center font-mono text-2xl tracking-[0.4em]"} aria-invalid={Boolean(fieldError)} />
          )}
          <FieldError message={fieldError} />
        </div>

        <button type="submit" disabled={pending || !code.trim()} className={primaryBtn}>
          {pending ? "Đang kiểm tra…" : "Xác nhận"}
        </button>

        <button type="button" onClick={() => { setUseRecovery((v) => !v); setCode(""); setError(null); setFieldError(""); }}
                className="text-sm font-semibold text-brand-700 hover:underline">
          {useRecovery ? "Dùng mã từ ứng dụng Authenticator" : "Mất điện thoại? Dùng mã khôi phục"}
        </button>
      </form>
    </AuthCard>
  );
}
