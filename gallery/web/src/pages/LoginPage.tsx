import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Aperture } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import { ErrorBox } from "../components/Status";
import { useDocumentTitle } from "../hooks/usePhotoFeed";

export function LoginPage() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle("Đăng nhập");

  // Chỉ chuyển hướng trong cùng site
  const rawNext = params.get("next") ?? "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/admin";
  if (user) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không đăng nhập được");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-sm gap-6 py-10">
      <div className="text-center">
        <Aperture aria-hidden className="mx-auto mb-3 size-8 text-accent" />
        <h1 className="text-xl font-semibold">Đăng nhập quản trị</h1>
        <p className="mt-1 text-sm text-muted">Chỉ dành cho quản trị viên; không có đăng ký công khai.</p>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-5">
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input id="email" type="email" className="input" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Mật khẩu
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}

export function NotFoundPage() {
  useDocumentTitle("Không tìm thấy");
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl font-semibold text-accent">404</p>
      <h1 className="mt-3 text-xl font-semibold">Không tìm thấy trang</h1>
      <a href="/" className="btn-secondary mt-6">
        Về thư viện
      </a>
    </div>
  );
}
