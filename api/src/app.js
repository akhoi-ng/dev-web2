const path = require("path");
const express = require("express");
const methodOverride = require("method-override");

const dishesRouter = require("./routes/dishes");
const adminDishesRouter = require("./routes/admin/dishes");
const adminChefsRouter = require("./routes/admin/chefs");
const adminIngredientsRouter = require("./routes/admin/ingredients");
const bookingsRouter = require("./routes/bookings");
const aboutRouter = require("./routes/about");
const adminBookingsRouter = require("./routes/admin/bookings");
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

// 1. Đọc dữ liệu form
app.use(express.urlencoded({ extended: false }));
// 2. Chuyển POST ?_method=PATCH|DELETE thành PATCH|DELETE (phải đặt TRƯỚC router)
app.use(methodOverride("_method"));

// Đánh dấu khu vực hiện tại để navbar tô sáng
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// 3. Routes
app.get("/", (req, res) => res.redirect("/dishes"));
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
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render("errors/500");
});

module.exports = app;
