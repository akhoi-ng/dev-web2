import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { authApi } from "../../api/index.js";
import FieldError from "../../components/FieldError.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { AuthCard, Notice, describeError, field, label, linkCls, primaryBtn } from "./shared.jsx";

// /forgot — POST /api/auth/forgot { email }. Server trả cùng nội dung cho email có và không có
// tài khoản; link trong thư mở trang /reset của SPA.
export default function ForgotPage() {
  useDocumentTitle("Quên mật khẩu");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [sent, setSent] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFields({});
    try {
      const { data } = await authApi.forgot({ email });
      setSent(data.message);
      setEmail("");
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") setFields(err.fields || {});
      setSent("");
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      subtitle="Nhập email đã đăng ký. Chúng tôi sẽ gửi link đặt mật khẩu mới, hiệu lực 15 phút."
      footer={<Link to="/login" className={linkCls}>Về trang đăng nhập</Link>}
    >
      {sent && <Notice tone="ok">{sent}</Notice>}
      {error && <Notice code={error.code}>{error.message}</Notice>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                 className={field} aria-invalid={Boolean(fields.email)} />
          <FieldError message={fields.email} />
        </div>
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "Đang gửi…" : "Gửi link đặt lại"}
        </button>
      </form>
    </AuthCard>
  );
}
