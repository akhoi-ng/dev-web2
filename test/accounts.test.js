const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeEmail, emailError, validateRegistration, validateNewPassword, safeNext } = require("../src/auth/accounts");

test("normalizeEmail: cắt khoảng trắng, chữ thường, không bỏ dấu chấm hay +tag", () => {
  assert.equal(normalizeEmail("  An.Nguyen+food@Example.COM "), "an.nguyen+food@example.com");
  assert.equal(normalizeEmail(undefined), "");
  assert.equal(normalizeEmail(["a@b.c"]), "");
});

test("emailError: dùng validator, chặn chuỗi quá dài", () => {
  assert.equal(emailError("an@example.com"), null);
  assert.ok(emailError(""));
  assert.ok(emailError("khong-phai-email"));
  assert.ok(emailError("a".repeat(250) + "@x.vn"));
});

test("validateRegistration: bỏ qua role, kiểm tra độ dài và nhập lại", () => {
  const ok = validateRegistration({ email: " An@X.vn ", password: "12345678", confirm: "12345678", role: "admin" });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.email, "an@x.vn");
  assert.equal(ok.emailInput, "An@X.vn");
  assert.equal("role" in ok, false);

  assert.equal(validateRegistration({ email: "an@x.vn", password: "1234567", confirm: "1234567" }).errors.length, 1);
  assert.equal(validateRegistration({ email: "an@x.vn", password: "12345678", confirm: "khac" }).errors.length, 1);
  assert.equal(validateRegistration({ email: "an@x.vn", password: "x".repeat(129), confirm: "x".repeat(129) }).errors.length, 1);
});

test("validateNewPassword", () => {
  assert.deepEqual(validateNewPassword({ password: "mat-khau-moi", confirm: "mat-khau-moi" }).errors, []);
  assert.equal(validateNewPassword({ password: "ngan", confirm: "ngan" }).errors.length, 1);
});

test("safeNext: chỉ nhận đường dẫn nội bộ", () => {
  assert.equal(safeNext("/admin/dishes?page=2"), "/admin/dishes?page=2");
  assert.equal(safeNext("//evil.com"), null);
  assert.equal(safeNext("/\\evil.com"), null);
  assert.equal(safeNext("https://evil.com"), null);
  assert.equal(safeNext(undefined), null);
});
