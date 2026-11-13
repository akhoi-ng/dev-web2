const express = require("express");
const cookieParser = require("cookie-parser");
const { corsMiddleware } = require("./http/cors");
const { requireJson, routeNotFound, errorHandler } = require("./http/respond");
const { requireAuth, protectMethods, requirePermission, requireAdmin } = require("./auth/middleware");
const authRouter = require("./routes/auth");
const dishesRouter = require("./routes/dishes");
const chefsRouter = require("./routes/chefs");
const ingredientsRouter = require("./routes/ingredients");
const statsRouter = require("./routes/stats");
const optionsRouter = require("./routes/options");
const teamRouter = require("./routes/team");
const bookingsRouter = require("./routes/bookings");
const adminBookingsRouter = require("./routes/admin-bookings");

// Ghi món (POST/PATCH/DELETE) đã qua requireAuth ở protectMethods; thêm điều kiện chỉ admin
const WRITE_METHODS = new Set(["POST", "PATCH", "DELETE"]);
const adminWrites = (req, res, next) => (WRITE_METHODS.has(req.method) ? requireAdmin(req, res, next) : next());

function createApp({ corsOrigin, trustProxy = false }) {
  const app = express();
  app.disable("x-powered-by");
  // Sau reverse proxy: lấy IP thật từ X-Forwarded-For cho rate limit (TRUST_PROXY=1)
  if (trustProxy) app.set("trust proxy", 1);

  // 1. CORS (đặt đầu tiên để cả phản hồi lỗi cũng có header CORS; preflight OPTIONS kết thúc ở đây,
  //    không đi qua bước kiểm tra token vì preflight không mang Authorization)
  app.use(corsMiddleware(corsOrigin));
  // 2. Đọc body JSON, rồi từ chối POST/PATCH không phải JSON; đọc cookie (chỉ dùng cho refresh token)
  app.use(express.json({ limit: "100kb" }));
  app.use(requireJson);
  app.use(cookieParser());

  // 3. Routers
  //    Công khai: đăng ký/đăng nhập..., thực đơn (GET dishes), số liệu, đội ngũ, khách đặt bàn
  //    Cần Bearer token của tài khoản active: ghi dishes, mọi endpoint chefs, ingredients, admin/bookings
  //    Block 9 Bài 2: thêm phân quyền theo role (viewer đọc; editor tạo, sửa; admin thêm xóa).
  //    Ghi món ăn chỉ admin (ABAC của editor chỉ có ở bản SSR). GET dishes chỉ trả món đã đăng.
  app.use("/api/auth", authRouter);
  app.use("/api/dishes", protectMethods(["POST", "PATCH", "DELETE"]), adminWrites, dishesRouter);
  app.use("/api/chefs", requireAuth, requirePermission, chefsRouter);
  app.use("/api/ingredients", requireAuth, requirePermission, ingredientsRouter);
  app.use("/api/admin/bookings", requireAuth, requirePermission, adminBookingsRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/options", optionsRouter);
  app.use("/api/team", teamRouter);
  app.use("/api/bookings", bookingsRouter);

  // 4. 404 cho mọi route không khớp
  app.use(routeNotFound);
  // 5. Bắt lỗi toàn cục
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
