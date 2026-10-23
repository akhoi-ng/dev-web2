// Máy khách HTTP duy nhất của SPA. Không import gì của Vite/trình duyệt để chạy được dưới Node thuần.

export class ApiError extends Error {
  constructor(kind, { status, code, fields, message } = {}) {
    super(message || code || kind);
    this.name = "ApiError";
    this.kind = kind; // "network" | "http" | "business"
    this.status = status;
    this.code = code;
    this.fields = fields;
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

export function createClient(baseUrl, fetchImpl = globalThis.fetch) {
  async function request(method, path, { query, body, signal } = {}) {
    const init = { method, signal };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }

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

    if (!res.ok) {
      throw new ApiError("http", { status: res.status, message: payload && payload.message });
    }
    if (!payload || typeof payload !== "object" || typeof payload.ok !== "boolean") {
      throw new ApiError("http", { status: res.status });
    }
    if (!payload.ok) {
      const error = payload.error || {};
      throw new ApiError("business", {
        status: res.status,
        code: error.code,
        fields: error.fields || {},
        message: error.message,
      });
    }
    return { data: payload.data, meta: payload.meta };
  }

  return { request };
}
