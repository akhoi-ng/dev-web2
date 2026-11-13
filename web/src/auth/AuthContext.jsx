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

  const login = useCallback(
    async (body) => {
      const { data } = await authApi.login(body);
      session.set(data);
      const user = await loadMe();
      session.announceLogin();
      return user;
    },
    [loadMe],
  );

  const logout = useCallback(() => session.logout(), []);

  // Đăng xuất mọi nơi: API tăng tokenVersion, thu hồi mọi refresh token. Gọi API thất bại thì ném
  // lỗi và GIỮ đăng nhập ở tab này, để người dùng biết các thiết bị khác chưa bị đăng xuất.
  const logoutAll = useCallback(async () => {
    await authApi.logoutAll();
    await session.logout();
  }, []);

  const value = useMemo(() => ({ ...state, login, logout, logoutAll }), [state, login, logout, logoutAll]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong AuthProvider");
  return ctx;
}

// Chỉ nhận đường dẫn nội bộ cho ?next= (chặn "//evil.com", "/\evil", "https://...")
export function safeNext(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}
