// Chuẩn hóa email và kiểm tra dữ liệu tài khoản. Cùng quy tắc với bản SSR (src/auth/accounts.js),
// khác ở chỗ lỗi trả về dạng { tênTrường: thôngBáo } để đưa vào error.fields như hợp đồng Block 6.
const isEmail = require("validator/lib/isEmail");
const { POLICY } = require("./config");
const { asObject } = require("../utils/helpers");

const MAX_EMAIL_LENGTH = 254;

// Cắt khoảng trắng hai đầu, đổi thành chữ thường; không bỏ dấu chấm hay "+tag"
function normalizeEmail(raw) {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

const text = (v) => (typeof v === "string" ? v.trim() : "");
// Password không bị trim: khoảng trắng là ký tự hợp lệ của mật khẩu
const raw = (v) => (typeof v === "string" ? v : "");

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

// confirm không bắt buộc với API (client gọi trực tiếp có thể không gửi); có gửi thì phải khớp
function confirmError(password, body) {
  return typeof body.confirm === "string" && body.confirm !== password ? "Mật khẩu nhập lại không khớp." : null;
}

function collect(pairs) {
  const fields = {};
  for (const [key, message] of pairs) if (message) fields[key] = message;
  return fields;
}

// { email, password, confirm? }. Trường role (nếu có) không bao giờ được đọc.
function validateRegistration(input) {
  const body = asObject(input);
  const emailInput = text(body.email);
  const password = raw(body.password);
  const fields = collect([
    ["email", emailError(emailInput)],
    ["password", passwordError(password)],
    ["confirm", passwordError(password) ? null : confirmError(password, body)],
  ]);
  return { fields, emailInput, email: normalizeEmail(emailInput), password };
}

// { token, password, confirm? }
function validateNewPassword(input) {
  const body = asObject(input);
  const password = raw(body.password);
  const fields = collect([
    ["password", passwordError(password)],
    ["confirm", passwordError(password) ? null : confirmError(password, body)],
  ]);
  return { fields, password, token: text(body.token) };
}

module.exports = { normalizeEmail, emailError, passwordError, validateRegistration, validateNewPassword, text, raw };
