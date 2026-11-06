require("dotenv").config();
const { secret, recaptchaConfig } = require("./auth/config");
const { cleanupExpired } = require("./auth/cleanup");
const { checkMailConfig } = require("./auth/mailer");

// Dừng ngay nếu thiếu secret (CSRF token, hash OTP), khóa reCAPTCHA hoặc cấu hình email
try {
  secret();
  recaptchaConfig();
  checkMailConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = require("./app");

const PORT = Number(process.env.PORT) || 3000;
const CLEANUP_EVERY_MS = 30 * 60 * 1000;

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

// Dọn session và bộ đếm đã hết hạn
setInterval(() => {
  cleanupExpired().catch((err) => console.error("[cleanup]", err.code || err.message));
}, CLEANUP_EVERY_MS).unref();
