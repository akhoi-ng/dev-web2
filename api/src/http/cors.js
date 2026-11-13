const cors = require("cors");

/*
 * corsOrigin: chuỗi origin cách nhau bằng dấu phẩy (CORS_ORIGIN trong .env), không dùng "*".
 *  - Authorization nằm trong allowedHeaders: request kèm Bearer không thuộc nhóm "simple" nên
 *    browser gửi preflight OPTIONS trước; thiếu authorization ở đây thì request thật không được gửi.
 *  - credentials: true chỉ cần cho cookie refresh token (rt) ở /api/auth/*; dấu sao không đi cùng
 *    credentials, vì vậy origin luôn là danh sách cụ thể.
 *  - Preflight không mang Authorization nên OPTIONS được trả lời ở đây, trước mọi bước xác thực.
 */
function corsMiddleware(corsOrigin) {
  const origins = String(corsOrigin || "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o && o !== "*");

  return cors({
    origin: origins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Retry-After"],
    credentials: true,
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
}

module.exports = { corsMiddleware };
