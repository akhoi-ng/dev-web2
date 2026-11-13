const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SESSION_SECRET ||= "s".repeat(40);
process.env.MFA_ENC_KEY ||= "k".repeat(40);
const mfa = require("../src/auth/mfa");

test("secret TOTP: mã hóa AES-GCM, giải mã đúng, sửa dữ liệu thì không giải được", () => {
  const secret = mfa.newSecret();
  const stored = mfa.encryptSecret(secret);
  assert.ok(stored.startsWith("v1."));
  assert.ok(!stored.includes(secret), "DB không chứa secret dạng rõ");
  assert.notEqual(mfa.encryptSecret(secret), stored, "IV ngẫu nhiên mỗi lần");
  assert.equal(mfa.decryptSecret(stored), secret);

  const parts = stored.split(".");
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
  assert.equal(mfa.decryptSecret(parts.join(".")), null);
  assert.equal(mfa.decryptSecret("rác"), null);
});

test("matchStep: mã đúng trả bước 30 giây; mã sai, sai định dạng -> null", () => {
  const secret = mfa.newSecret();
  const code = mfa.totp.generate(secret);
  const now = Date.now();
  const step = mfa.matchStep(secret, code, now);
  assert.ok(Math.abs(step - Math.floor(now / 30000)) <= 1);
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
  assert.equal(mfa.matchStep(secret, wrong, now), null);
  assert.equal(mfa.matchStep(secret, "12345", now), null);
  assert.equal(mfa.matchStep(null, code, now), null);
});

test("mã khôi phục: 10 ký tự dạng XXXXX-XXXXX, chuẩn hóa không phân biệt hoa thường / dấu gạch", () => {
  const code = mfa.newRecoveryCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(mfa.normalizeRecovery(code.toLowerCase().replace("-", " ")), code.replace("-", ""));
  const many = new Set(Array.from({ length: 200 }, mfa.newRecoveryCode));
  assert.equal(many.size, 200);
});

test("setupPayload: QR vẽ ở server (data URL), URI otpauth có issuer", async () => {
  const secret = mfa.newSecret();
  const p = await mfa.setupPayload("an@example.com", secret);
  assert.ok(p.qr.startsWith("data:image/png;base64,"));
  assert.ok(p.uri.startsWith("otpauth://totp/"));
  assert.ok(p.uri.includes(`secret=${secret}`));
  assert.equal(p.secretGroups.replace(/ /g, ""), secret);
});
