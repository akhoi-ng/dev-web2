const express = require("express");
const { corsMiddleware } = require("./http/cors");
const { requireJson, routeNotFound, errorHandler } = require("./http/respond");

function createApp({ corsOrigin }) {
  const app = express();

  // 1. CORS (đặt đầu tiên để cả phản hồi lỗi cũng có header CORS)
  app.use(corsMiddleware(corsOrigin));
  // 2. Đọc body JSON, rồi từ chối POST/PATCH không phải JSON
  app.use(express.json());
  app.use(requireJson);

  // 3. Routers: các task sau đăng ký bằng app.use("/api/<tài-nguyên>", router)

  // 4. 404 cho mọi route không khớp
  app.use(routeNotFound);
  // 5. Bắt lỗi toàn cục
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
