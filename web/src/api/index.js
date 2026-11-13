import { createClient } from "./client.js";
import { createSession } from "../auth/session.js";

const BASE_URL = import.meta.env.VITE_API_URL;

// Access token nằm trong session (biến JS); lớp gọi API hỏi session mỗi request
export const session = createSession({ baseUrl: BASE_URL });

export const api = createClient(BASE_URL, globalThis.fetch.bind(globalThis), {
  getToken: session.getToken,
  refresh: session.refresh,
  onUnauthenticated: session.expire,
});

function resource(path) {
  return {
    list: (query, signal) => api.request("GET", path, { query, signal }),
    get: (id, signal) => api.request("GET", `${path}/${encodeURIComponent(id)}`, { signal }),
    create: (body) => api.request("POST", path, { body }),
    update: (id, body) => api.request("PATCH", `${path}/${encodeURIComponent(id)}`, { body }),
    remove: (id) => api.request("DELETE", `${path}/${encodeURIComponent(id)}`),
  };
}

export const dishesApi = resource("/api/dishes");
export const chefsApi = resource("/api/chefs");
export const ingredientsApi = resource("/api/ingredients");

export const bookingsApi = {
  create: (body) => api.request("POST", "/api/bookings", { body }),
  get: (code, signal) => api.request("GET", `/api/bookings/${encodeURIComponent(code)}`, { signal }),
};

export const adminBookingsApi = {
  list: (query, signal) => api.request("GET", "/api/admin/bookings", { query, signal }),
  update: (id, body) => api.request("PATCH", `/api/admin/bookings/${encodeURIComponent(id)}`, { body }),
};

export const getStats = (signal) => api.request("GET", "/api/stats", { signal });
export const getOptions = (signal) => api.request("GET", "/api/options", { signal });
export const getTeam = (signal) => api.request("GET", "/api/team", { signal });

// Các route xác thực công khai gửi "anonymous": không gắn Bearer, không thử refresh khi lỗi.
// login/logout cần credentials "include" để browser nhận / gửi cookie refresh (rt).
const anon = (path, body, extra = {}) => api.request("POST", path, { body, anonymous: true, ...extra });

export const authApi = {
  captchaConfig: (signal) => api.request("GET", "/api/auth/captcha", { signal, anonymous: true }),
  register: (body) => anon("/api/auth/register", body),
  activate: (body) => anon("/api/auth/activate", body),
  resendOtp: (body) => anon("/api/auth/activate/resend", body),
  login: (body) => anon("/api/auth/login", body, { credentials: "include" }),
  forgot: (body) => anon("/api/auth/forgot", body),
  reset: (body) => anon("/api/auth/reset", body, { credentials: "include" }),
  me: (signal) => api.request("GET", "/api/auth/me", { signal }),
  logoutAll: () => api.request("POST", "/api/auth/logout-all", { body: {}, credentials: "include" }),
};
