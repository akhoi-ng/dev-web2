// Băm và sinh số ngẫu nhiên: chỉ dùng thư viện/bộ sinh an toàn của nền tảng, không tự viết thuật toán.
const crypto = require("crypto");
const argon2 = require("@node-rs/argon2");
const { secret } = require("./config");

// Argon2id với tham số tối thiểu OWASP khuyến nghị (m=19 MiB, t=2, p=1).
// Kết quả là chuỗi PHC: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>, salt ngẫu nhiên mỗi lần.
const ARGON2_OPTIONS = { algorithm: argon2.Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Hash giả để email không tồn tại cũng tốn đúng một lần verify Argon2 (thời gian phản hồi như nhau)
let dummyHash = null;
async function verifyAgainstDummy(password) {
  if (!dummyHash) dummyHash = await hashPassword(crypto.randomBytes(16).toString("hex"));
  await verifyPassword(dummyHash, password);
  return false;
}

// Mã ngẫu nhiên dạng base64url (sid, aid, reset token, challengeId)
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

// OTP n chữ số, phân bố đều (crypto.randomInt)
function generateOtp(digits) {
  return String(crypto.randomInt(0, 10 ** digits)).padStart(digits, "0");
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

// HMAC với SESSION_SECRET: dùng cho hash OTP (không gian 10^6 nhỏ, cần khóa bí mật để đọc DB
// thôi chưa dò được) và CSRF token gắn với phiên.
function hmac(text) {
  return crypto.createHmac("sha256", secret()).update(String(text)).digest("hex");
}

// So sánh hai chuỗi hex/ASCII với thời gian không phụ thuộc vị trí ký tự khác nhau
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = {
  hashPassword,
  verifyPassword,
  verifyAgainstDummy,
  randomToken,
  generateOtp,
  sha256,
  hmac,
  safeEqual,
};
