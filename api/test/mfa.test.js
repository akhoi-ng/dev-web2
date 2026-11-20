// Block 10: phần không cần DB của MFA bản API (mã hóa secret, TOTP, mã khôi phục, QR).
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

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
  assert.equal(mfa.decryptSecret(null), null);
});

test("secret lưu bởi bản SSR (cùng định dạng, cùng MFA_ENC_KEY) giải mã được ở bản API", () => {
  // Mô phỏng đúng cách src/auth/mfa.js mã hóa: khóa = SHA-256(MFA_ENC_KEY), "v1.iv.tag.data"
  const secret = mfa.newSecret();
  const key = crypto.createHash("sha256").update(process.env.MFA_ENC_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const stored = ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
  assert.equal(mfa.decryptSecret(stored), secret);
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
  assert.equal(mfa.matchStep(secret, "abcdef", now), null);
  assert.equal(mfa.matchStep(null, code, now), null);
  assert.equal(mfa.matchStep(mfa.newSecret(), code, now), null, "secret khác thì mã khác");
});

test("mã khôi phục: 10 ký tự dạng XXXXX-XXXXX, chuẩn hóa không phân biệt hoa thường / dấu gạch", () => {
  const code = mfa.newRecoveryCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(mfa.normalizeRecovery(code.toLowerCase().replace("-", " ")), code.replace("-", ""));
  const many = new Set(Array.from({ length: 200 }, mfa.newRecoveryCode));
  assert.equal(many.size, 200);
});

test("verifyCode: user chưa bật MFA, mã rỗng hay quá dài bị từ chối trước khi chạm DB", async () => {
  const user = { id: 1, mfaEnabled: false, mfaSecret: null };
  assert.deepEqual(await mfa.verifyCode(user, "123456"), { ok: false });
  assert.deepEqual(await mfa.verifyCode({ ...user, mfaEnabled: true }, ""), { ok: false });
  assert.deepEqual(await mfa.verifyCode({ ...user, mfaEnabled: true }, "x".repeat(21)), { ok: false });
  assert.deepEqual(await mfa.verifyCode({ ...user, mfaEnabled: true }, { code: "123456" }), { ok: false });
  assert.deepEqual(await mfa.verifyCode(null, "123456"), { ok: false });
});

test("findChallenge: challenge sai định dạng -> null, không tra DB", async () => {
  assert.equal(await mfa.findChallenge(undefined), null);
  assert.equal(await mfa.findChallenge("ngắn"), null);
  assert.equal(await mfa.findChallenge("a".repeat(44)), null);
  assert.equal(await mfa.findChallenge({ challenge: "x" }), null);
});

test("setupPayload: QR vẽ ở server (data URL), URI otpauth có issuer, secret chia nhóm 4 ký tự", async () => {
  const secret = mfa.newSecret();
  const p = await mfa.setupPayload("an@example.com", secret);
  assert.ok(p.qr.startsWith("data:image/png;base64,"));
  assert.ok(p.otpauthUri.startsWith("otpauth://totp/"));
  assert.ok(p.otpauthUri.includes(`secret=${secret}`));
  assert.ok(p.otpauthUri.includes("issuer="));
  assert.match(p.secret, /^([A-Z2-7]{4} )*[A-Z2-7]{1,4}$/);
  assert.equal(p.secret.replace(/ /g, ""), secret);
  assert.deepEqual([p.algorithm, p.digits, p.period], ["SHA1", 6, 30]);
});
