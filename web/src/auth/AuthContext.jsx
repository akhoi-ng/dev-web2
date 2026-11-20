import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi, session } from "../api/index.js";

const AuthContext = createContext(null);

/*
 * Trạng thái đăng nhập cho giao diện: "loading" (đang thử khôi phục bằng refresh token),
 * "anon" (chưa đăng nhập) hoặc "authed" (có access token và đã tải /api/auth/me).
 * user (email, role) chỉ dùng để hiển thị; API không tin bất kỳ giá trị nào client tự giữ.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null, reason: null });

  const loadMe = useCallback(async () => {
    const { data } = await authApi.me();
    setState({ status: "authed", user: data, reason: null });
    return data;
  }, []);

  useEffect(() => {
    let alive = true;
    const unsubscribe = session.subscribe((event) => {
      if (!alive) return;
      if (event === "expired") setState({ status: "anon", user: null, reason: "expired" });
      else if (event === "logout") setState({ status: "anon", user: null, reason: "logout" });
      else if (event === "login") loadMe().catch(() => {});
    });

    session.restore().then(async (restored) => {
      if (!alive) return;
      if (!restored) {
        setState((s) => (s.status === "loading" ? { status: "anon", user: null, reason: null } : s));
        return;
      }
      try {
        await loadMe();
      } catch {
        if (alive) setState({ status: "anon", user: null, reason: null });
      }
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [loadMe]);

  // Nhận cặp token mới (đăng nhập, qua bước MFA, bật / tắt MFA), tải lại /me, báo các tab khác
  const applyTokens = useCallback(
    async (data) => {
      session.set(data);
      const user = await loadMe();
      session.announceLogin();
      return user;
    },
    [loadMe],
  );

  /*
   * Bước 1. Tài khoản chưa bật MFA: nhận token ngay -> { user }.
   * Tài khoản bật MFA (Block 10): API chưa cấp token mà trả challenge -> { mfa: { challenge, expiresIn } }.
   * Challenge chỉ giữ trong bộ nhớ (state của router), không ghi vào URL hay localStorage.
   */
  const login = useCallback(
    async (body) => {
      const { data } = await authApi.login(body);
      if (data && data.next === "mfa") return { mfa: { challenge: data.challenge, expiresIn: data.expiresIn } };
      return { user: await applyTokens(data) };
    },
    [applyTokens],
  );

  // Bước 2: challenge + mã TOTP hoặc mã khôi phục -> token
  const verifyMfa = useCallback(
    async (challenge, code) => {
      const { data } = await authApi.mfaLogin({ challenge, code });
      const user = await applyTokens(data);
      return { user, method: data.method, recoveryRemaining: data.recoveryRemaining };
    },
    [applyTokens],
  );

  const logout = useCallback(() => session.logout(), []);

  // Đăng xuất mọi nơi: API tăng tokenVersion, thu hồi mọi refresh token. Gọi API thất bại thì ném
  // lỗi và GIỮ đăng nhập ở tab này, để người dùng biết các thiết bị khác chưa bị đăng xuất.
  const logoutAll = useCallback(async () => {
    await authApi.logoutAll();
    await session.logout();
  }, []);

  const value = useMemo(
    () => ({ ...state, login, verifyMfa, applyTokens, logout, logoutAll }),
    [state, login, verifyMfa, applyTokens, logout, logoutAll],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong AuthProvider");
  return ctx;
}

// safeNext, isAdminUser, landingFor nằm ở landing.js (chạy được dưới Node thuần để test)
export { safeNext, isAdminUser, landingFor } from "./landing.js";
