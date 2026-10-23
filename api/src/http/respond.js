// Định dạng phản hồi JSON thống nhất cho toàn bộ API.
// - Thành công / lỗi nghiệp vụ: HTTP 200, phân biệt bằng trường `ok`.
// - Lỗi giao thức (JSON hỏng, sai Content-Type, sai route, lỗi hệ thống): mã 4xx/5xx, không có `ok`.

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
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: "Lỗi hệ thống" });
}

module.exports = { ok, fail, notFound, validationFailed, requireJson, routeNotFound, errorHandler };
