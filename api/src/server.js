require("dotenv").config();
const { createApp } = require("./app");
const { checkAuthConfig } = require("./auth/config");
const { checkMailConfig } = require("./auth/mailer");
const { cleanupExpired } = require("./auth/cleanup");

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.CORS_ORIGIN) {
  console.warn("CORS_ORIGIN chưa được cấu hình: trình duyệt sẽ không gọi được API từ SPA.");
}

// Thiếu khóa ký JWT, khóa OTP, key reCAPTCHA hay cấu hình email thì dừng ngay khi khởi động
try {
  checkAuthConfig();
  checkMailConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = createApp({ corsOrigin: process.env.CORS_ORIGIN || "", trustProxy: process.env.TRUST_PROXY === "1" });

app.listen(PORT, () => {
  console.log(`API đang chạy tại http://localhost:${PORT}`);
});

// Dọn refresh token hết hạn và bộ đếm cũ mỗi 30 phút
const timer = setInterval(() => cleanupExpired().catch((err) => console.error("[cleanup]", err.message)), 30 * 60 * 1000);
timer.unref();
