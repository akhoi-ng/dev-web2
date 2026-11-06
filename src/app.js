const path = require("path");
const express = require("express");
const methodOverride = require("method-override");
const cookieParser = require("cookie-parser");

const dishesRouter = require("./routes/dishes");
const adminDishesRouter = require("./routes/admin/dishes");
const adminChefsRouter = require("./routes/admin/chefs");
const adminIngredientsRouter = require("./routes/admin/ingredients");
const bookingsRouter = require("./routes/bookings");
const aboutRouter = require("./routes/about");
const adminBookingsRouter = require("./routes/admin/bookings");
const authRouter = require("./routes/auth");
const { anonSession, loadSession, requireLogin, requireRole } = require("./auth/session");
const { csrfProtection, csrfToken } = require("./auth/csrf");
const {
  formatPrice,
  formatQty,
  formatDateTime,
  formatPhone,
  DEFAULT_DISH_IMAGE,
  RESTAURANT,
} = require("./utils/helpers");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

// Chỉ cung cấp các helper an toàn cho view (không đưa process.env hay prisma vào res.locals)
app.locals.formatPrice = formatPrice;
app.locals.formatQty = formatQty;
app.locals.formatDateTime = formatDateTime;
app.locals.formatPhone = formatPhone;
app.locals.DEFAULT_DISH_IMAGE = DEFAULT_DISH_IMAGE;
app.locals.RESTAURANT = RESTAURANT;

// Phía sau reverse proxy (TRUST_PROXY=1) mới tin X-Forwarded-For để lấy IP cho rate limit
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.disable("x-powered-by");

// File tĩnh (script Tải thêm / Cuộn vô hạn)
app.use(express.static(path.join(__dirname, "..", "public")));

// 1. Đọc dữ liệu form
app.use(express.urlencoded({ extended: false }));
// 2. Chuyển POST ?_method=PATCH|DELETE thành PATCH|DELETE (phải đặt TRƯỚC router)
app.use(methodOverride("_method"));

// Đánh dấu khu vực hiện tại để navbar tô sáng
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// Block 8 — xác thực. Thứ tự quan trọng:
//  a. đọc cookie -> phiên ẩn danh (aid) -> khôi phục danh tính từ cookie sid (req.user)
//  b. khu vực quản trị /admin/*: chưa đăng nhập -> 303 /login; đã đăng nhập nhưng không phải
//     admin -> 403. Chạy trước kiểm tra CSRF để request lạ nhận đúng 303/403.
//  c. mọi request đổi dữ liệu phải có CSRF token đúng
app.use(cookieParser());
app.use(anonSession);
app.use(loadSession);
app.use((req, res, next) => {
  res.locals.csrfToken = csrfToken(req); // cho form đăng xuất trên header của mọi trang, kể cả 403
  next();
});
app.use("/admin", requireLogin, requireRole("admin"));
app.use(csrfProtection);

// 3. Routes
app.get("/", (req, res) => res.redirect("/dishes"));
app.use("/", authRouter);
app.use("/dishes", dishesRouter);
app.use("/admin/dishes", adminDishesRouter);
app.use("/admin/chefs", adminChefsRouter);
app.use("/admin/ingredients", adminIngredientsRouter);
app.use("/bookings", bookingsRouter);
app.use("/about", aboutRouter);
app.use("/admin/bookings", adminBookingsRouter);
app.get("/admin", (req, res) => res.redirect("/admin/dishes"));

// 4. 404 cho mọi route không khớp
app.use((req, res) => {
  res.status(404).render("errors/404");
});

// 5. 500 - bắt lỗi toàn cục, không lộ err.message ra giao diện
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Lỗi Prisma in kèm tham số truy vấn (có thể chứa passwordHash, otpHash...): chỉ ghi dòng cuối
  if (err && String(err.name).startsWith("PrismaClient")) {
    console.error(`[${err.name}] ${err.code || ""} ${String(err.message).trim().split("\n").pop()}`);
  } else {
    console.error(err);
  }
  if (res.headersSent) return next(err);
  res.status(500).render("errors/500");
});

module.exports = app;
