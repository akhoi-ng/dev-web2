// Chuẩn hóa email và kiểm tra dữ liệu form tài khoản.
const isEmail = require("validator/lib/isEmail");
const { POLICY } = require("./config");

const MAX_EMAIL_LENGTH = 254;

/*
 * Chính sách chuẩn hóa email (áp dụng giống nhau ở đăng ký, kích hoạt, đăng nhập, quên mật khẩu):
 *  - cắt khoảng trắng hai đầu
 *  - đổi toàn bộ thành chữ thường (cả phần trước @: hệ thống này quy định An@x.com và an@x.com
 *    là một tài khoản)
 *  - không bỏ dấu chấm hay phần "+tag" theo kiểu riêng của nhà cung cấp
 */
function normalizeEmail(raw) {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

// Định dạng email dùng thư viện validator (đã kiểm thử), không tự viết regex
function emailError(input) {
  if (!input) return "Vui lòng nhập email.";
  if (input.length > MAX_EMAIL_LENGTH || !isEmail(input)) return "Email không đúng định dạng.";
  return null;
}

function passwordError(password) {
  const { min, max } = POLICY.password;
  if (!password) return "Vui lòng nhập mật khẩu.";
  if (password.length < min) return `Mật khẩu tối thiểu ${min} ký tự.`;
  if (password.length > max) return `Mật khẩu tối đa ${max} ký tự.`;
  return null;
}

// Form đăng ký: { email, password, confirm }. Trường role (nếu có) không được đọc.
function validateRegistration(body) {
  const emailInput = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const errors = [];

  const e = emailError(emailInput);
  if (e) errors.push(e);
  const p = passwordError(password);
  if (p) errors.push(p);
  else if (password !== confirm) errors.push("Mật khẩu nhập lại không khớp.");

  return { errors, emailInput, email: normalizeEmail(emailInput), password };
}

// Form đặt mật khẩu mới: { password, confirm }
function validateNewPassword(body) {
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const errors = [];
  const p = passwordError(password);
  if (p) errors.push(p);
  else if (password !== confirm) errors.push("Mật khẩu nhập lại không khớp.");
  return { errors, password };
}

// Chỉ nhận đường dẫn nội bộ cho ?next= sau đăng nhập (chặn open redirect "//evil.com", "/\evil")
function safeNext(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

module.exports = { normalizeEmail, emailError, passwordError, validateRegistration, validateNewPassword, safeNext };
