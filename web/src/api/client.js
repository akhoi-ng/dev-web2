// Máy khách HTTP duy nhất của SPA. Không import gì của Vite/trình duyệt để chạy được dưới Node thuần.
//
// Block 9: đây là chỗ DUY NHẤT gắn header Authorization (trang không tự gắn).
//  - Chỉ gắn cho đường dẫn tương đối "/api/..." của API mình; URL tuyệt đối (domain khác) bị từ chối,
//    nên token không bao giờ đi tới bên thứ ba.
//  - 401: thử làm mới access token một lần bằng refresh token (cookie HttpOnly), thành công thì gửi
//    lại request; thất bại thì báo auth.onUnauthenticated() (xóa token, về trang đăng nhập).
//  - 403: báo không đủ quyền, GIỮ token.
//  - Lỗi mạng, 500: lỗi kỹ thuật, không bị hiểu thành đã đăng xuất.

export class ApiError extends Error {
  constructor(kind, { status, code, fields, message, retryAfterSec } = {}) {
    super(message || code || kind);
    this.name = "ApiError";
    this.kind = kind; // "network" | "http" | "business"
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfterSec = retryAfterSec;
  }
}

function buildUrl(baseUrl, path, query) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return base + path + (qs ? "?" + qs : "");
}

// Chỉ đường dẫn "/api/..." của chính API này; chặn "//evil.com", "https://..." hay "/\evil"
function isOwnApiPath(path) {
  return typeof path === "string" && path.startsWith("/api/") && !path.startsWith("//") && !path.includes("\\");
}

/*
 * auth (tuỳ chọn):
 *   getToken()            -> access token hiện tại hoặc null
 *   refresh()             -> Promise<boolean>: làm mới access token bằng cookie refresh
 *   onUnauthenticated()   -> gọi khi 401 không cứu được (xóa token, chuyển về đăng nhập)
 */
export function createClient(baseUrl, fetchImpl = globalThis.fetch, auth = null) {
  async function send(method, path, { query, body, signal, credentials, anonymous }) {
    const headers = {};
    const init = { method, signal, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    // credentials "include" chỉ cho các route cần cookie refresh (/api/auth/login, refresh, logout)
    if (credentials) init.credentials = credentials;
    const token = !anonymous && auth ? auth.getToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetchImpl(buildUrl(baseUrl, path, query), init);
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
      throw new ApiError("network", { message: err && err.message });
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    return { res, payload };
  }

  async function request(method, path, options = {}) {
    if (!isOwnApiPath(path)) throw new Error(`Đường dẫn API không hợp lệ: ${path}`);

    let { res, payload } = await send(method, path, options);

    // 401 ở route cần đăng nhập: làm mới một lần rồi thử lại
    if (res.status === 401 && auth && !options.anonymous && !options.noRefresh) {
      const refreshed = await auth.refresh();
      if (refreshed) {
        ({ res, payload } = await send(method, path, options));
      }
      if (res.status === 401) auth.onUnauthenticated();
    }

    const error = payload && typeof payload === "object" && payload.error ? payload.error : null;

    if (!res.ok) {
      // 401, 403, 429 có body { ok: false, error: { code } }; 4xx/5xx khác chỉ có message
      throw new ApiError("http", {
        status: res.status,
        code: error ? error.code : undefined,
        message: (error && error.message) || (payload && payload.message),
        retryAfterSec: error && error.retryAfterSec,
      });
    }
    if (!payload || typeof payload !== "object" || typeof payload.ok !== "boolean") {
      throw new ApiError("http", { status: res.status });
    }
    if (!payload.ok) {
      const err = new ApiError("business", {
        status: res.status,
        code: error && error.code,
        fields: (error && error.fields) || {},
        message: error && error.message,
      });
      if (error && typeof error.captchaRequired === "boolean") err.captchaRequired = error.captchaRequired;
      throw err;
    }
    return { data: payload.data, meta: payload.meta };
  }

  return { request };
}
