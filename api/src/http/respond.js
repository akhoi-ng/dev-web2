// Định dạng phản hồi JSON thống nhất cho toàn bộ API.
// - Thành công / lỗi nghiệp vụ: HTTP 200, phân biệt bằng trường `ok`.
// - Lỗi giao thức (JSON hỏng, sai Content-Type, sai route, lỗi hệ thống): mã 4xx/5xx, không có `ok`.
// - Block 9: 401 (chưa xác thực) và 429 (vượt giới hạn) là lỗi tầng hai nhưng body vẫn theo
//   response shape { ok: false, error: { code, message } } để lớp gọi API đọc được error.code.

function ok(res, data, meta) {
  const body = { ok: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(200).json(body);
}

function fail(res, code, message, fields) {
  console.warn("[business]", code, res.req.method, res.req.originalUrl);
  const error = { code, message };
  if (fields !== undefined) error.fields = fields;
  return res.status(200).json({ ok: false, error });
}

function notFound(res, label) {
  return fail(res, "NOT_FOUND", `${label} không tồn tại`);
}

function validationFailed(res, fields) {
  return fail(res, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", fields);
}

// 401: thiếu token, token sai chữ ký, hết hạn, hoặc user không còn hợp lệ.
// WWW-Authenticate theo RFC 6750 để công cụ HTTP biết cần Bearer token.
function unauthenticated(res, code, message) {
  console.warn("[auth]", code, res.req.method, res.req.originalUrl);
  const challenge = code === "TOKEN_EXPIRED" ? 'Bearer error="invalid_token", error_description="expired"' : "Bearer";
  res.set("WWW-Authenticate", challenge);
  return res.status(401).json({ ok: false, error: { code, message } });
}

// 403: đã xác thực nhưng role không đủ quyền (Block 9 Bài 2). Lớp gọi API giữ token, không refresh.
function forbidden(res, code = "FORBIDDEN", message = "Tài khoản không có quyền thực hiện thao tác này") {
  console.warn("[auth]", code, res.req.method, res.req.originalUrl);
  return res.status(403).json({ ok: false, error: { code, message } });
}

// 429: vượt giới hạn tần suất hoặc đang bị khóa tạm
function rateLimited(res, retryAfterSec, message) {
  console.warn("[auth] RATE_LIMITED", res.req.method, res.req.originalUrl);
  res.set("Retry-After", String(retryAfterSec));
  return res.status(429).json({
    ok: false,
    error: { code: "RATE_LIMITED", message: message || "Bạn đã thử quá nhiều lần", retryAfterSec },
  });
}

// POST/PATCH bắt buộc gửi body JSON
function requireJson(req, res, next) {
  if ((req.method === "POST" || req.method === "PATCH") && !req.is("application/json")) {
    return res.status(400).json({ message: "Body phải là JSON (Content-Type: application/json)" });
  }
  next();
}

function routeNotFound(req, res) {
  res.status(404).json({ message: "Không tìm thấy route" });
}

// Bắt lỗi toàn cục, không lộ err.message ra ngoài
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "JSON không hợp lệ" });
  }
  // Lỗi khác do client gây ra khi đọc body (413 body quá lớn, 415 charset không hỗ trợ...)
  if (err.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ message: "Không đọc được body của request" });
  }
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: "Lỗi hệ thống" });
}

module.exports = {
  ok,
  fail,
  notFound,
  validationFailed,
  unauthenticated,
  forbidden,
  rateLimited,
  requireJson,
  routeNotFound,
  errorHandler,
};
