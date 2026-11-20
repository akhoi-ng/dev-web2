// Nghiệm thu Block 9 – Bài 1 bằng request trực tiếp tới API (không qua giao diện), theo các bảng
// "Nghiệm thu Bài 1" của deck, cộng phần refresh token (xoay vòng, phát hiện dùng lại, đăng xuất).
// Block 10: thêm MFA cho SPA (bật bằng QR / secret key, đăng nhập hai bước, giới hạn thử, chống dùng
// lại mã, mã khôi phục, reset password không tắt MFA) và khu vực quản trị của API chỉ cho Admin. Mã TOTP
// được sinh từ secret đọc ở response setup, như một ứng dụng Authenticator.
// Script tự chạy API (cổng ACCEPT_PORT, mặc định 3998), đọc DB để đối chiếu (hash, usedAt, attempts,
// tokenVersion, refresh_tokens) và đọc thư trong api/mail-outbox/.
//
// reCAPTCHA: dùng một siteverify GIẢ LẬP (RECAPTCHA_VERIFY_URL) để kiểm tra logic backend tự động.
// Bằng chứng chặn bot nộp bài phải chụp với key thật và siteverify thật của Google.
//
// Chạy (trong thư mục api): npm run acceptance:auth   (cần api/.env: DATABASE_URL, SESSION_SECRET, JWT_SECRET)
// Script chỉ tạo user email @acceptance.test, xóa chúng ở đầu mỗi lần chạy, và xóa bộ đếm rate limit.
import "dotenv/config";
import { spawn } from "node:child_process";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prismaPkg from "@prisma/client";
import jwt from "jsonwebtoken";
import otplib from "otplib";

const { PrismaClient } = prismaPkg;
const { authenticator } = otplib;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTBOX = path.join(ROOT, "mail-outbox");
const PORT = Number(process.env.ACCEPT_PORT) || 3998;
const API = `http://localhost:${PORT}`;
const WEB = "http://localhost:5173";
const FAKE_GOOGLE_PORT = PORT + 2;
const RUN = Date.now().toString(36);
const prisma = new PrismaClient();
const sha256 = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

// ───────────────────────────── tiện ích ─────────────────────────────

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? " — " + detail : ""}`);
}
const section = (title) => console.log(`\n== ${title}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Gọi API như SPA: JSON, Origin của web. jar giữ cookie rt như browser (tên=giá trị).
async function call(method, url, { body, token, jar, headers = {}, origin = WEB } = {}) {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  if (jar && jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(API + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const setCookies = res.headers.getSetCookie();
  if (jar) {
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (!value || /expires=Thu, 01 Jan 1970/i.test(sc)) jar.delete(name);
      else jar.set(name, value);
    }
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text, headers: res.headers, setCookies };
}
const code = (r) => r.json?.error?.code ?? null;
const hasAccessToken = (r) => Boolean(r.json?.data?.accessToken) || r.text.includes("accessToken");

// Thư mới nhất gửi tới email (activation | reset | password-changed); chờ tối đa 3 giây
async function latestMail(to, kind, after = 0) {
  for (let i = 0; i < 30; i++) {
    const files = (await fs.readdir(OUTBOX).catch(() => []))
      .filter((f) => f.endsWith(".html") && f.includes(`-${kind}-`) && f.endsWith(`${to}.html`))
      .sort();
    if (files.length > after) return { html: await fs.readFile(path.join(OUTBOX, files[files.length - 1]), "utf8"), count: files.length };
    await wait(100);
  }
  return null;
}
async function mailCount(to, kind) {
  const files = await fs.readdir(OUTBOX).catch(() => []);
  return files.filter((f) => f.endsWith(".html") && f.includes(`-${kind}-`) && f.endsWith(`${to}.html`)).length;
}
const otpOf = (html) => (html.match(/letter-spacing:8px;margin:12px 0">(\d+)</) || [])[1];
const resetLinkOf = (html) => (html.match(/href="([^"]*reset\?token=[^"]+)"/) || [])[1]?.replace(/&amp;/g, "&") || "";

// ───────────────────────── siteverify giả lập ─────────────────────────

const fakeGoogle = {
  secret: `fake-secret-${RUN}`,
  tokens: new Map(),
  calls: 0,
  issue(hostname = "localhost") {
    const token = "fake-token-" + crypto.randomBytes(12).toString("hex");
    this.tokens.set(token, { hostname, used: false });
    return token;
  },
  server: null,
  start() {
    this.server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (d) => (raw += d));
      req.on("end", () => {
        this.calls++;
        const body = new URLSearchParams(raw);
        const send = (obj) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(obj));
        if (body.get("secret") !== this.secret) return send({ success: false, "error-codes": ["invalid-input-secret"] });
        const t = this.tokens.get(body.get("response"));
        if (!t) return send({ success: false, "error-codes": ["invalid-input-response"] });
        if (t.used) return send({ success: false, "error-codes": ["timeout-or-duplicate"] });
        t.used = true;
        send({ success: true, challenge_ts: new Date().toISOString(), hostname: t.hostname });
      });
    });
    return new Promise((r) => this.server.listen(FAKE_GOOGLE_PORT, r));
  },
};

// ───────────────────────────── server ─────────────────────────────

let server = null;
let serverLog = "";
async function startServer() {
  server = spawn(process.execPath, ["src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      CORS_ORIGIN: WEB,
      WEB_URL: WEB,
      MAIL_TRANSPORT: "file",
      COOKIE_SECURE: "0",
      RECAPTCHA_SITE_KEY: `fake-site-key-${RUN}`,
      RECAPTCHA_SECRET_KEY: fakeGoogle.secret,
      RECAPTCHA_VERIFY_URL: `http://localhost:${FAKE_GOOGLE_PORT}/siteverify`,
      RECAPTCHA_HOSTNAMES: "localhost",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(API + "/api/options");
      return;
    } catch {
      await wait(100);
    }
  }
  throw new Error("API không khởi động được:\n" + serverLog);
}
async function stopServer() {
  if (!server) return;
  // Server đã thoát (ví dụ thiếu cấu hình lúc khởi động): không chờ sự kiện exit sẽ không bao giờ tới
  if (server.exitCode !== null || server.signalCode !== null) {
    server = null;
    return;
  }
  const done = new Promise((r) => server.once("exit", r));
  server.kill();
  await done;
  server = null;
}

// Đăng ký + kích hoạt một tài khoản mới, trả về { email, password }
async function createActiveAccount(tag) {
  const email = `${tag}-${RUN}@acceptance.test`;
  const password = `mat-khau-${RUN}`;
  await call("POST", "/api/auth/register", { body: { email, password, captcha: fakeGoogle.issue() } });
  const mail = await latestMail(email, "activation");
  await call("POST", "/api/auth/activate", { body: { email, otp: otpOf(mail.html) } });
  return { email, password };
}
async function login({ email, password }, jar = new Map()) {
  const r = await call("POST", "/api/auth/login", { body: { email, password }, jar });
  return { r, token: r.json?.data?.accessToken, jar };
}

// ───────────────────────────── kịch bản ─────────────────────────────

async function registrationAndActivation() {
  section("Đăng ký, kích hoạt, đăng nhập (bảng nghiệm thu 2)");
  const email = `an-${RUN}@acceptance.test`;
  const password = `mat-khau-${RUN}`;

  let r = await call("POST", "/api/auth/register", { body: { email, password } });
  check("register thiếu CAPTCHA -> 200 CAPTCHA_REQUIRED", r.status === 200 && code(r) === "CAPTCHA_REQUIRED", `${r.status} ${code(r)}`);
  r = await call("POST", "/api/auth/register", { body: { email, password, captcha: "token-bia" } });
  check("register CAPTCHA sai -> INVALID_CAPTCHA", code(r) === "INVALID_CAPTCHA", code(r));
  const used = fakeGoogle.issue();
  fakeGoogle.tokens.get(used).used = true;
  r = await call("POST", "/api/auth/register", { body: { email, password, captcha: used } });
  check("register CAPTCHA đã dùng (timeout-or-duplicate) -> INVALID_CAPTCHA", code(r) === "INVALID_CAPTCHA", code(r));
  r = await call("POST", "/api/auth/register", { body: { email, password, captcha: fakeGoogle.issue("evil.example") } });
  check("register CAPTCHA giải ở hostname khác -> INVALID_CAPTCHA", code(r) === "INVALID_CAPTCHA", code(r));
  check(
    "CAPTCHA lỗi: không tạo user, không gửi OTP",
    (await prisma.user.count({ where: { email } })) === 0 && (await mailCount(email, "activation")) === 0
  );

  r = await call("POST", "/api/auth/register", { body: { email, password, role: "admin", captcha: fakeGoogle.issue() } });
  const first = r.json;
  check("register hợp lệ -> 200 ok, không có accessToken", r.status === 200 && r.json?.ok === true && !hasAccessToken(r), r.text);
  const user = await prisma.user.findUnique({ where: { email } });
  check("register kèm role: admin -> bản ghi role viewer, status pending", user?.role === "viewer" && user?.status === "pending", `${user?.role} ${user?.status}`);
  check("password lưu dạng Argon2id, không lưu password gốc", user?.passwordHash.startsWith("$argon2id$") && !user.passwordHash.includes(password));
  const mail = await latestMail(email, "activation");
  const otp = mail && otpOf(mail.html);
  check("OTP gửi qua email", Boolean(otp));
  const ch = await prisma.activationChallenge.findUnique({ where: { userId: user.id } });
  check("OTP lưu hash, có hạn, attempts, usedAt", ch && ch.otpHash !== otp && ch.otpHash.length === 64 && ch.expiresAt > new Date() && ch.attempts === 0 && ch.usedAt === null);

  r = await call("POST", "/api/auth/register", { body: { email: email.toUpperCase(), password: "khac-hoan-toan", captcha: fakeGoogle.issue() } });
  check("register email đã có -> phản hồi giống hệt email mới", JSON.stringify(r.json) === JSON.stringify(first), r.text);

  r = await call("POST", "/api/auth/login", { body: { email, password } });
  check("tài khoản pending, password đúng -> ACCOUNT_NOT_ACTIVATED, không có accessToken", code(r) === "ACCOUNT_NOT_ACTIVATED" && !hasAccessToken(r) && r.setCookies.length === 0, code(r));

  const wrong = otp === "000000" ? "111111" : "000000";
  r = await call("POST", "/api/auth/activate", { body: { email, otp: wrong } });
  const afterWrong = await prisma.user.findUnique({ where: { email }, include: { activation: true } });
  check("OTP sai -> INVALID_OTP, vẫn pending, attempts = 1", code(r) === "INVALID_OTP" && afterWrong.status === "pending" && afterWrong.activation.attempts === 1, `${code(r)} ${afterWrong.status} ${afterWrong.activation.attempts}`);

  r = await call("POST", "/api/auth/activate", { body: { email, otp } });
  check("OTP đúng -> 200 ok, không có accessToken", r.json?.ok === true && !hasAccessToken(r), r.text);
  const active = await prisma.user.findUnique({ where: { email }, include: { activation: true } });
  check("kích hoạt: pending -> active, emailVerifiedAt, usedAt", active.status === "active" && active.emailVerifiedAt && active.activation.usedAt);
  r = await call("POST", "/api/auth/activate", { body: { email, otp } });
  check("dùng lại OTP đã dùng -> INVALID_OTP", code(r) === "INVALID_OTP", code(r));

  // OTP hết hạn: tài khoản pending khác, đẩy expiresAt về quá khứ
  const late = `het-han-${RUN}@acceptance.test`;
  await call("POST", "/api/auth/register", { body: { email: late, password, captcha: fakeGoogle.issue() } });
  const lateOtp = otpOf((await latestMail(late, "activation")).html);
  const lateUser = await prisma.user.findUnique({ where: { email: late } });
  await prisma.activationChallenge.update({ where: { userId: lateUser.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  r = await call("POST", "/api/auth/activate", { body: { email: late, otp: lateOtp } });
  check("OTP hết hạn -> INVALID_OTP, vẫn pending", code(r) === "INVALID_OTP" && (await prisma.user.findUnique({ where: { email: late } })).status === "pending", code(r));

  return { email, password };
}

async function captchaAndBruteForce(account) {
  section("Đăng nhập sai tới ngưỡng CAPTCHA");
  let r;
  for (let i = 1; i <= 3; i++) r = await call("POST", "/api/auth/login", { body: { email: account.email, password: "sai-mat-khau" } });
  check("sai 3 lần -> INVALID_CREDENTIALS (200), captchaRequired = true", r.status === 200 && code(r) === "INVALID_CREDENTIALS" && r.json.error.captchaRequired === true, r.text);

  r = await call("POST", "/api/auth/login", { body: { email: account.email, password: account.password } });
  check("tới ngưỡng, bỏ trường CAPTCHA (password đúng) -> CAPTCHA_REQUIRED, không có accessToken", code(r) === "CAPTCHA_REQUIRED" && !hasAccessToken(r), code(r));
  r = await call("POST", "/api/auth/login", { body: { email: account.email, password: account.password, captcha: "bia" } });
  check("tới ngưỡng, CAPTCHA sai -> INVALID_CAPTCHA, không có accessToken", code(r) === "INVALID_CAPTCHA" && !hasAccessToken(r), code(r));
  const row = await prisma.authThrottle.findUnique({ where: { key: `login-fail:email:${account.email}` } });
  check("bộ đếm sai nằm ở server (auth_throttles), không ở client", row?.count === 3, String(row?.count));

  r = await call("POST", "/api/auth/login", { body: { email: account.email, password: account.password, captcha: fakeGoogle.issue() } });
  check("CAPTCHA đúng + password đúng -> có accessToken", Boolean(r.json?.data?.accessToken), r.text);
  check("đăng nhập thành công xóa bộ đếm sai theo email", (await prisma.authThrottle.findUnique({ where: { key: `login-fail:email:${account.email}` } })) === null);

  // Khóa 5 phút sau 10 lần sai
  const victim = await createActiveAccount("khoa");
  for (let i = 1; i <= 10; i++) {
    r = await call("POST", "/api/auth/login", {
      body: { email: victim.email, password: "sai", ...(i > 3 ? { captcha: fakeGoogle.issue() } : {}) },
    });
  }
  check("sai lần thứ 10 -> 429 RATE_LIMITED + Retry-After", r.status === 429 && code(r) === "RATE_LIMITED" && Number(r.headers.get("retry-after")) > 0, `${r.status} ${code(r)}`);
  r = await call("POST", "/api/auth/login", { body: { email: victim.email, password: victim.password, captcha: fakeGoogle.issue() } });
  check("đang khóa: password đúng + CAPTCHA đúng vẫn 429", r.status === 429 && !hasAccessToken(r), String(r.status));
}

async function jwtAndCrud(account) {
  section("JWT và API (bảng nghiệm thu 1)");
  const jar = new Map();
  const { r, token } = await login(account, jar);
  const ttl = Number(process.env.ACCESS_TOKEN_TTL_SEC) || 900;
  check(`login -> { accessToken, expiresIn: ${ttl} }`, Boolean(token) && r.json.data.expiresIn === ttl, r.text);
  const rtCookie = r.setCookies.find((c) => c.startsWith("rt=")) || "";
  check("refresh token trong cookie HttpOnly, SameSite=Strict, Path=/api/auth", /HttpOnly/i.test(rtCookie) && /SameSite=Strict/i.test(rtCookie) && /Path=\/api\/auth/i.test(rtCookie), rtCookie.replace(/rt=[^;]+/, "rt=***"));
  check("refresh token không nằm trong body JSON", !r.text.includes(jar.get("rt")));
  const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url"));
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  check("JWT header alg HS256", header.alg === "HS256");
  check("payload không có email, role, password", !("email" in payload) && !("role" in payload) && !JSON.stringify(payload).includes(account.email));
  const stored = await prisma.refreshToken.findFirst({ where: { tokenHash: sha256(jar.get("rt")) } });
  check("DB lưu SHA-256 của refresh token, không lưu giá trị gốc", Boolean(stored) && (await prisma.refreshToken.count({ where: { tokenHash: jar.get("rt") } })) === 0);

  // Chưa đăng nhập
  const noAuth = [
    ["POST", "/api/dishes", { name: "x", price: 1 }],
    ["PATCH", "/api/dishes/1", { price: 1 }],
    ["DELETE", "/api/dishes/1"],
    ["GET", "/api/chefs"],
    ["POST", "/api/ingredients", { name: "x", unit: "kg" }],
  ];
  for (const [m, p, b] of noAuth) {
    const x = await call(m, p, { body: b });
    check(`chưa đăng nhập ${m} ${p} -> 401 UNAUTHENTICATED`, x.status === 401 && code(x) === "UNAUTHENTICATED", `${x.status} ${code(x)}`);
  }

  // Tài khoản mới đăng ký là viewer. Block 10: khu vực quản trị của bản SPA chỉ dành cho Admin,
  // nên viewer bị 403 cả khi đọc (token vẫn giữ, /api/auth/me vẫn dùng được)
  let x = await call("GET", "/api/chefs", { token });
  check("viewer: GET /api/chefs -> 403 FORBIDDEN (quản trị chỉ Admin)", x.status === 403 && code(x) === "FORBIDDEN", `${x.status}`);
  x = await call("POST", "/api/chefs", { token, body: { name: `Viewer tạo ${RUN}`, specialty: "x" } });
  check("viewer: POST /api/chefs -> 403 FORBIDDEN", x.status === 403 && code(x) === "FORBIDDEN", `${x.status} ${code(x)}`);
  x = await call("POST", "/api/dishes", { token, body: { name: `Viewer tạo ${RUN}`, price: 1000 } });
  check("viewer: POST /api/dishes -> 403 FORBIDDEN", x.status === 403 && code(x) === "FORBIDDEN", `${x.status} ${code(x)}`);
  // Admin cấp quyền (mô phỏng bằng DB): role đọc từ DB ở mỗi request nên token đang có dùng được ngay
  await prisma.user.update({ where: { email: account.email }, data: { role: "admin" } });

  // Token hợp lệ: CRUD đầu bếp
  x = await call("POST", "/api/chefs", { token, body: { name: `Bếp nghiệm thu ${RUN}`, specialty: "Món Việt" } });
  const chefId = x.json?.data?.id;
  check("token hợp lệ: POST /api/chefs -> 200 ok", x.status === 200 && x.json?.ok === true, x.text);
  x = await call("PATCH", `/api/chefs/${chefId}`, { token, body: { specialty: "Món Âu", role: "admin" } });
  check("token hợp lệ: PATCH -> 200 ok (role trong body bị bỏ qua)", x.json?.ok === true && x.json.data.specialty === "Món Âu");
  x = await call("PATCH", "/api/chefs/99999999", { token, body: { specialty: "x" } });
  check("lỗi CRUD giữ nguyên: NOT_FOUND 200", x.status === 200 && code(x) === "NOT_FOUND");
  x = await call("POST", "/api/chefs", { token, body: { name: "" } });
  check("lỗi CRUD giữ nguyên: VALIDATION_FAILED 200", x.status === 200 && code(x) === "VALIDATION_FAILED");

  // Sửa payload
  const [h, p, s] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ ...payload, role: "admin" })).toString("base64url");
  x = await call("DELETE", `/api/chefs/${chefId}`, { token: [h, forgedPayload, s].join(".") });
  check("JWT sửa payload (role: admin), giữ chữ ký cũ -> 401 UNAUTHENTICATED", x.status === 401 && code(x) === "UNAUTHENTICATED", `${x.status} ${code(x)}`);
  const otherSub = Buffer.from(JSON.stringify({ ...payload, sub: "1" })).toString("base64url");
  x = await call("GET", "/api/auth/me", { token: [h, otherSub, s].join(".") });
  check("JWT đổi sub sang user khác -> 401", x.status === 401);
  const noneToken = [Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url"), p, ""].join(".");
  x = await call("GET", "/api/chefs", { token: noneToken });
  check("JWT alg none -> 401", x.status === 401);

  // Hết hạn: ký bằng đúng secret nhưng exp đã qua
  const expired = jwt.sign({ ver: payload.ver, iat: payload.iat - 2000 }, process.env.JWT_SECRET, {
    algorithm: "HS256", subject: payload.sub, issuer: payload.iss, audience: payload.aud, expiresIn: 900,
  });
  x = await call("GET", "/api/chefs", { token: expired });
  check("JWT quá exp -> 401 TOKEN_EXPIRED", x.status === 401 && code(x) === "TOKEN_EXPIRED", `${x.status} ${code(x)}`);

  // Đổi role trong DB: quyền đọc từ DB, không từ token
  const me = await call("GET", "/api/auth/me", { token });
  check("/api/auth/me trả role đọc từ DB (admin vừa cấp)", me.json?.data?.role === "admin" && me.json.data.email === account.email, me.text);

  x = await call("DELETE", `/api/chefs/${chefId}`, { token });
  check("token hợp lệ: DELETE -> 200 ok", x.json?.ok === true);

  // Preflight
  x = await call("OPTIONS", "/api/dishes/3", { headers: { "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "authorization, content-type" } });
  check(
    "preflight OPTIONS có authorization -> 204, origin cụ thể",
    x.status === 204 && x.headers.get("access-control-allow-origin") === WEB && /authorization/i.test(x.headers.get("access-control-allow-headers") || ""),
    `${x.status} ${x.headers.get("access-control-allow-origin")} ${x.headers.get("access-control-allow-headers")}`
  );

  // Đọc công khai giữ nguyên (Block 7)
  x = await call("GET", "/api/dishes?mode=basic&q=phở&page=1&pageSize=5");
  check("GET /api/dishes tìm kiếm + phân trang, không token -> ok, có meta", x.json?.ok === true && Array.isArray(x.json.data) && x.json.meta?.page === 1, x.text.slice(0, 200));
  x = await call("GET", "/api/dishes?page=2&pageSize=9&sort=price-asc");
  check("GET /api/dishes phân trang trang 2, không token -> ok", x.json?.ok === true && x.json.meta?.page === 2);
  x = await call("GET", "/api/team");
  check("GET /api/team (trang Về chúng tôi) công khai", x.json?.ok === true && Array.isArray(x.json.data));

  return { token, jar };
}

async function refreshTokens(account) {
  section("Refresh token: xoay vòng, phát hiện dùng lại, đăng xuất");
  const { token, jar } = await login(account);
  const rt1 = jar.get("rt");

  let r = await call("POST", "/api/auth/refresh", { jar, body: {} });
  const rt2 = jar.get("rt");
  check("refresh -> accessToken mới + cookie rt mới", r.json?.ok === true && Boolean(r.json.data.accessToken) && rt2 && rt2 !== rt1, r.text);
  check("access token mới khác token cũ (jti khác)", r.json.data.accessToken !== token);
  const old = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rt1) } });
  check("rt cũ được đánh dấu usedAt", Boolean(old?.usedAt));

  r = await call("POST", "/api/auth/refresh", { jar: new Map([["rt", rt1]]), body: {} });
  check("gửi lại rt đã dùng -> 401, không có accessToken", r.status === 401 && !hasAccessToken(r), String(r.status));
  r = await call("POST", "/api/auth/refresh", { jar: new Map([["rt", rt2]]), body: {} });
  check("phát hiện dùng lại -> thu hồi cả family: rt mới nhất cũng bị từ chối", r.status === 401, String(r.status));
  const fam = await prisma.refreshToken.findMany({ where: { familyId: old.familyId } });
  check("mọi token trong family có revokedAt", fam.length >= 2 && fam.every((t) => t.revokedAt));

  r = await call("POST", "/api/auth/refresh", { body: {} });
  check("refresh không có cookie -> 401", r.status === 401);
  r = await call("POST", "/api/auth/refresh", { jar: new Map([["rt", "abc"]]), body: {}, origin: "http://evil.example" });
  check("refresh từ origin lạ -> 403", r.status === 403);

  // Logout thiết bị này
  const s2 = await login(account);
  const rtBeforeLogout = s2.jar.get("rt");
  r = await call("POST", "/api/auth/logout", { jar: s2.jar, body: {} });
  check("logout -> ok, xóa cookie rt", r.json?.ok === true && !s2.jar.has("rt"));
  const loggedOut = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rtBeforeLogout) } });
  check("logout thu hồi refresh token ở DB (revokedAt)", Boolean(loggedOut?.revokedAt));
  r = await call("POST", "/api/auth/refresh", { jar: new Map([["rt", rtBeforeLogout]]), body: {} });
  check("sau logout, refresh bằng rt cũ -> 401", r.status === 401);
  r = await call("GET", "/api/auth/me", { token: s2.token });
  check("logout: access token đã cấp còn dùng được tới exp (giới hạn đã công bố)", r.status === 200);

  // Logout mọi nơi: tokenVersion
  const s3 = await login(account);
  const s4 = await login(account);
  // Giả lập một phiên đang mở ở bản SSR của cùng tài khoản
  const owner = await prisma.user.findUnique({ where: { email: account.email } });
  const inAnHour = new Date(Date.now() + 3600 * 1000);
  await prisma.session.create({ data: { sidHash: sha256(`ssr-${RUN}`), userId: owner.id, expiresAt: inAnHour, absoluteExpiresAt: inAnHour } });
  r = await call("POST", "/api/auth/logout-all", { token: s3.token, jar: s3.jar, body: {} });
  check("logout-all -> ok", r.json?.ok === true, r.text);
  check("logout-all: xóa cả session của bản SSR", (await prisma.session.count({ where: { userId: owner.id } })) === 0);
  r = await call("GET", "/api/auth/me", { token: s4.token });
  check("logout-all: access token của thiết bị khác -> 401 ngay (tokenVersion)", r.status === 401 && code(r) === "UNAUTHENTICATED");
  r = await call("POST", "/api/auth/refresh", { jar: s4.jar, body: {} });
  check("logout-all: refresh token của thiết bị khác -> 401", r.status === 401);
}

async function forgotAndReset(account) {
  section("Quên mật khẩu (bảng nghiệm thu 3)");
  const before = await login(account);
  const ghost = `khong-co-${RUN}@acceptance.test`;

  const a = await call("POST", "/api/auth/forgot", { body: { email: account.email } });
  const b = await call("POST", "/api/auth/forgot", { body: { email: ghost } });
  check("forgot email có và không có -> cùng status, cùng nội dung", a.status === b.status && a.text === b.text && a.status === 200, `${a.text} | ${b.text}`);
  check("email không có tài khoản: không gửi thư", (await mailCount(ghost, "reset")) === 0);

  const mail = await latestMail(account.email, "reset");
  const link = mail ? resetLinkOf(mail.html) : "";
  check("link trong thư trỏ tới trang /reset của web", link.startsWith(`${WEB}/reset?token=`), link.replace(/token=.*/, "token=***"));
  const token = decodeURIComponent(new URL(link).searchParams.get("token") || "");
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
  check("reset token lưu SHA-256, có hạn, chưa dùng", Boolean(row) && row.usedAt === null && row.expiresAt > new Date());

  // Mở link trên SPA chỉ tải trang tĩnh của web, không gọi API -> token chưa bị tiêu thụ
  check("mở trang /reset (chưa gửi form): token chưa bị tiêu thụ", (await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } })).usedAt === null);

  const { passwordHash: hashBefore, tokenVersion: versionBefore } = await prisma.user.findUnique({ where: { email: account.email } });
  let r = await call("POST", "/api/auth/reset", { body: { token: "token-bia", password: "mat-khau-gia-mao" } });
  check("token sai -> INVALID_RESET_TOKEN, password không đổi", code(r) === "INVALID_RESET_TOKEN" && (await prisma.user.findUnique({ where: { email: account.email } })).passwordHash === hashBefore, code(r));

  const newPassword = `mat-khau-moi-${RUN}`;
  r = await call("POST", "/api/auth/reset", { body: { token, password: newPassword } });
  check("reset hợp lệ -> 200 ok, không có accessToken", r.json?.ok === true && !hasAccessToken(r), r.text);
  const after = await prisma.user.findUnique({ where: { email: account.email } });
  check("reset: tokenVersion tăng, passwordHash đổi", after.tokenVersion === versionBefore + 1 && after.passwordHash !== hashBefore);
  r = await call("GET", "/api/auth/me", { token: before.token });
  check("JWT cấp trước reset -> 401 (tokenVersion)", r.status === 401, String(r.status));
  r = await call("POST", "/api/auth/refresh", { jar: before.jar, body: {} });
  check("refresh token cấp trước reset -> 401", r.status === 401);
  r = await call("POST", "/api/auth/reset", { body: { token, password: "mot-mat-khau-khac" } });
  check("dùng lại token đã dùng -> INVALID_RESET_TOKEN", code(r) === "INVALID_RESET_TOKEN");
  let l = await login({ email: account.email, password: account.password });
  check("password cũ không còn đăng nhập được", code(l.r) === "INVALID_CREDENTIALS");
  l = await login({ email: account.email, password: newPassword });
  check("đăng nhập bằng password mới thành công", Boolean(l.token));

  // Token hết hạn
  await call("POST", "/api/auth/forgot", { body: { email: account.email } });
  const mail2 = await latestMail(account.email, "reset", mail.count);
  const token2 = decodeURIComponent(new URL(resetLinkOf(mail2.html)).searchParams.get("token"));
  await prisma.passwordReset.update({ where: { tokenHash: sha256(token2) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  r = await call("POST", "/api/auth/reset", { body: { token: token2, password: "mat-khau-het-han" } });
  check("token hết hạn -> INVALID_RESET_TOKEN", code(r) === "INVALID_RESET_TOKEN");

  // Giới hạn forgot: 3 lần/giờ/email (đã gửi 2 lần cho account.email)
  await call("POST", "/api/auth/forgot", { body: { email: account.email } });
  r = await call("POST", "/api/auth/forgot", { body: { email: account.email } });
  check("vượt giới hạn forgot -> 429 RATE_LIMITED", r.status === 429 && code(r) === "RATE_LIMITED", `${r.status} ${code(r)}`);
  return { ...account, password: newPassword };
}

// ───────────────────────────── Block 10: MFA cho SPA ─────────────────────────────

// Sinh mã như ứng dụng Authenticator; offsetSteps = 1 là mã của bước 30 giây kế tiếp (server nhận
// lệch một bước), dùng khi mã của bước hiện tại đã bị đánh dấu là đã dùng.
const totpAt = (secret, offsetSteps = 0) => authenticator.clone({ epoch: Date.now() + offsetSteps * 30000 }).generate(secret);
const otherCode = (c) => String((Number(c) + 500000) % 1000000).padStart(6, "0");

// Các phần trước đã gửi nhiều request từ cùng IP (đăng ký, đăng nhập...): xóa bộ đếm theo IP để
// phần Block 10 không chạm giới hạn chung (các giới hạn đó đã được nghiệm thu ở trên).
const resetIpLimits = () => prisma.authThrottle.deleteMany({ where: { key: { contains: ":ip:" } } });

async function mfaForSpa() {
  section("Block 10 · MFA cho SPA: bật bằng QR / secret key");
  await resetIpLimits();
  const account = await createActiveAccount("mfa");
  const user0 = await prisma.user.findUnique({ where: { email: account.email } });
  const first = await login(account);
  const other = await login(account); // "thiết bị khác" đăng nhập trước khi bật MFA

  let r = await call("GET", "/api/auth/mfa/status", { token: first.token });
  check("status: tài khoản mới chưa bật MFA", r.json?.ok === true && r.json.data.mfaEnabled === false, r.text);
  r = await call("GET", "/api/auth/mfa/status");
  check("quản lý MFA cần Bearer: không token -> 401", r.status === 401);

  r = await call("POST", "/api/auth/mfa/setup", { token: first.token, body: {} });
  const setup = r.json?.data || {};
  const secret = String(setup.secret || "").replace(/ /g, "");
  check("setup -> QR data URL vẽ ở server + secret key nhập tay + otpauth://", String(setup.qr).startsWith("data:image/png;base64,") && /^[A-Z2-7]{32}$/.test(secret) && String(setup.otpauthUri).startsWith("otpauth://totp/"), r.text.slice(0, 200));
  check("setup: Cache-Control no-store", r.headers.get("cache-control") === "no-store", r.headers.get("cache-control"));
  let row = await prisma.user.findUnique({ where: { id: user0.id } });
  check("setup: secret chờ xác nhận lưu đã mã hóa, MFA vẫn tắt", row.mfaPendingSecret?.startsWith("v1.") && !row.mfaPendingSecret.includes(secret) && row.mfaEnabled === false);

  r = await call("POST", "/api/auth/mfa/confirm", { token: first.token, body: { code: otherCode(totpAt(secret)) } });
  check("confirm mã sai -> INVALID_MFA_CODE, MFA vẫn tắt", code(r) === "INVALID_MFA_CODE" && !(await prisma.user.findUnique({ where: { id: user0.id } })).mfaEnabled, code(r));

  const jar = new Map(first.jar);
  const confirmCode = totpAt(secret);
  r = await call("POST", "/api/auth/mfa/confirm", { token: first.token, jar, body: { code: confirmCode } });
  const recovery = r.json?.data?.recoveryCodes || [];
  const tokenAfter = r.json?.data?.accessToken;
  check("confirm mã đúng -> bật MFA, 10 mã khôi phục hiện một lần + token mới cho thiết bị này", r.json?.ok === true && recovery.length === 10 && Boolean(tokenAfter) && jar.get("rt") !== first.jar.get("rt"), r.text.slice(0, 200));
  row = await prisma.user.findUnique({ where: { id: user0.id } });
  const codeRows = await prisma.recoveryCode.findMany({ where: { userId: user0.id } });
  check("DB: mfaEnabled, secret mã hóa, tokenVersion + 1, mfaLastStep ghi bước đã dùng", row.mfaEnabled && row.mfaSecret?.startsWith("v1.") && !row.mfaPendingSecret && row.tokenVersion === user0.tokenVersion + 1 && Number.isInteger(row.mfaLastStep));
  check("DB: mã khôi phục lưu HMAC, không lưu mã gốc", codeRows.length === 10 && codeRows.every((c) => c.usedAt === null && !recovery.includes(c.codeHash) && /^[0-9a-f]{64}$/.test(c.codeHash)));
  r = await call("GET", "/api/auth/me", { token: first.token });
  check("bật MFA: access token cũ của chính thiết bị -> 401 (tokenVersion)", r.status === 401);
  r = await call("GET", "/api/auth/me", { token: tokenAfter });
  check("token mới cấp kèm confirm dùng được, /me báo mfaEnabled", r.json?.data?.mfaEnabled === true, r.text);
  r = await call("POST", "/api/auth/refresh", { jar: other.jar, body: {} });
  check("bật MFA: refresh token của thiết bị khác -> 401 (phải đăng nhập lại qua MFA)", r.status === 401);

  section("Block 10 · MFA cho SPA: đăng nhập hai bước");
  const step1Jar = new Map();
  r = await call("POST", "/api/auth/login", { body: account, jar: step1Jar });
  const challenge = r.json?.data?.challenge;
  check("password đúng -> { next: \"mfa\", challenge }, KHÔNG có accessToken", r.json?.ok === true && r.json.data.next === "mfa" && /^[A-Za-z0-9_-]{43}$/.test(challenge || "") && !hasAccessToken(r), r.text);
  check("password đúng nhưng chưa nhập mã: không có cookie rt", !step1Jar.has("rt") && !r.setCookies.some((c) => c.startsWith("rt=")));
  const ch = await prisma.mfaChallenge.findUnique({ where: { tokenHash: sha256(challenge) } });
  check("DB lưu SHA-256 của challenge, có hạn 5 phút", Boolean(ch) && (await prisma.mfaChallenge.count({ where: { tokenHash: challenge } })) === 0 && ch.expiresAt - Date.now() <= 5 * 60 * 1000);
  r = await call("GET", "/api/chefs", { token: challenge });
  check("dùng challenge làm Bearer gọi API -> 401", r.status === 401);
  r = await call("GET", "/api/admin/dishes", { headers: { Authorization: `Bearer ${challenge}` } });
  check("challenge không mở được /api/admin/dishes -> 401", r.status === 401);

  r = await call("POST", "/api/auth/mfa", { body: { challenge, code: otherCode(totpAt(secret)) } });
  check("mã sai -> INVALID_MFA_CODE, còn 4 lượt", code(r) === "INVALID_MFA_CODE" && r.json.error.attemptsLeft === 4 && !hasAccessToken(r), r.text);
  check("DB: attempts của lần chờ = 1", (await prisma.mfaChallenge.findUnique({ where: { tokenHash: sha256(challenge) } })).attempts === 1);
  r = await call("POST", "/api/auth/mfa", { body: { challenge, code: confirmCode } });
  check("mã vừa dùng để bật MFA -> bị từ chối (chống dùng lại)", code(r) === "INVALID_MFA_CODE", code(r));
  const loginJar = new Map();
  const goodCode = totpAt(secret, 1);
  r = await call("POST", "/api/auth/mfa", { body: { challenge, code: goodCode }, jar: loginJar });
  const mfaToken = r.json?.data?.accessToken;
  check("mã đúng -> accessToken + cookie rt", r.json?.ok === true && Boolean(mfaToken) && loginJar.has("rt") && r.json.data.method === "totp", r.text.slice(0, 200));
  check("qua MFA: challenge bị xóa", (await prisma.mfaChallenge.count({ where: { tokenHash: sha256(challenge) } })) === 0);
  r = await call("GET", "/api/auth/me", { token: mfaToken });
  check("token sau MFA gọi được API", r.status === 200 && r.json?.data?.email === account.email);
  r = await call("POST", "/api/auth/mfa", { body: { challenge, code: goodCode } });
  check("gửi lại challenge đã dùng -> 401 MFA_CHALLENGE_EXPIRED", r.status === 401 && code(r) === "MFA_CHALLENGE_EXPIRED", `${r.status} ${code(r)}`);
  let again = await call("POST", "/api/auth/login", { body: account });
  r = await call("POST", "/api/auth/mfa", { body: { challenge: again.json?.data?.challenge, code: goodCode } });
  check("cùng mã đúng dùng lần hai (challenge mới) -> INVALID_MFA_CODE", code(r) === "INVALID_MFA_CODE", code(r));
  r = await call("POST", "/api/auth/mfa/disable", { token: challenge, body: { password: account.password, code: goodCode } });
  check("challenge không dùng được cho route quản lý MFA -> 401", r.status === 401);
  await prisma.authThrottle.deleteMany({ where: { key: `mfa:user:${user0.id}` } });

  section("Block 10 · MFA cho SPA: giới hạn thử, hết hạn, mã khôi phục");
  again = await call("POST", "/api/auth/login", { body: account });
  const c2 = again.json?.data?.challenge;
  const wrong = otherCode(totpAt(secret));
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await call("POST", "/api/auth/mfa", { body: { challenge: c2, code: wrong } }));
  check("4 lần sai đầu -> INVALID_MFA_CODE (còn 4, 3, 2, 1 lượt)", results.slice(0, 4).map((x) => x.json?.error?.attemptsLeft).join(",") === "4,3,2,1");
  check("lần sai thứ 5 -> 401 MFA_TOO_MANY_ATTEMPTS, lần chờ bị hủy", results[4].status === 401 && code(results[4]) === "MFA_TOO_MANY_ATTEMPTS" && (await prisma.mfaChallenge.count({ where: { tokenHash: sha256(c2) } })) === 0, `${results[4].status} ${code(results[4])}`);
  r = await call("POST", "/api/auth/mfa", { body: { challenge: c2, code: totpAt(secret, 1) } });
  check("hết lượt rồi nhập mã đúng vẫn -> 401 (phải đăng nhập lại)", r.status === 401 && !hasAccessToken(r));
  await prisma.authThrottle.deleteMany({ where: { key: `mfa:user:${user0.id}` } });

  again = await call("POST", "/api/auth/login", { body: account });
  const c3 = again.json?.data?.challenge;
  await prisma.mfaChallenge.update({ where: { tokenHash: sha256(c3) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  r = await call("POST", "/api/auth/mfa", { body: { challenge: c3, code: totpAt(secret, 1) } });
  check("challenge quá 5 phút -> 401 MFA_CHALLENGE_EXPIRED", r.status === 401 && code(r) === "MFA_CHALLENGE_EXPIRED");

  again = await call("POST", "/api/auth/login", { body: account });
  r = await call("POST", "/api/auth/mfa", { body: { challenge: again.json?.data?.challenge, code: recovery[0].toLowerCase() } });
  check("mã khôi phục (chữ thường vẫn nhận) -> token, method recovery, còn 9 mã", r.json?.ok === true && r.json.data.method === "recovery" && r.json.data.recoveryRemaining === 9, r.text.slice(0, 200));
  let recToken = r.json?.data?.accessToken;
  const used = await prisma.recoveryCode.count({ where: { userId: user0.id, usedAt: { not: null } } });
  check("DB: mã khôi phục vừa dùng có usedAt", used === 1);
  again = await call("POST", "/api/auth/login", { body: account });
  r = await call("POST", "/api/auth/mfa", { body: { challenge: again.json?.data?.challenge, code: recovery[0] } });
  check("mã khôi phục dùng lần hai -> INVALID_MFA_CODE", code(r) === "INVALID_MFA_CODE", code(r));
  await prisma.authThrottle.deleteMany({ where: { key: `mfa:user:${user0.id}` } });

  section("Block 10 · MFA cho SPA: xác thực lại, tạo lại mã, reset password, tắt MFA");
  r = await call("POST", "/api/auth/mfa/recovery-codes", { token: recToken, body: { password: "sai-mat-khau", code: recovery[1] } });
  check("tạo lại mã khôi phục: sai password -> REAUTH_FAILED, mã khôi phục không bị tiêu thụ", code(r) === "REAUTH_FAILED" && (await prisma.recoveryCode.count({ where: { userId: user0.id, usedAt: { not: null } } })) === 1, code(r));
  r = await call("POST", "/api/auth/mfa/disable", { token: recToken, body: { password: account.password, code: wrong } });
  check("tắt MFA: đúng password nhưng sai mã -> REAUTH_FAILED, MFA vẫn bật", code(r) === "REAUTH_FAILED" && (await prisma.user.findUnique({ where: { id: user0.id } })).mfaEnabled, code(r));
  r = await call("POST", "/api/auth/mfa/setup", { token: recToken, body: {} });
  check("thay thiết bị khi MFA đang bật mà không xác thực lại -> REAUTH_FAILED", code(r) === "REAUTH_FAILED", code(r));
  r = await call("POST", "/api/auth/mfa/recovery-codes", { token: recToken, body: { password: account.password, code: recovery[1] } });
  const recovery2 = r.json?.data?.recoveryCodes || [];
  check("tạo lại mã khôi phục (password + mã khôi phục) -> 10 mã mới", r.json?.ok === true && recovery2.length === 10 && !recovery2.includes(recovery[2]), r.text.slice(0, 120));
  again = await call("POST", "/api/auth/login", { body: account });
  r = await call("POST", "/api/auth/mfa", { body: { challenge: again.json?.data?.challenge, code: recovery[2] } });
  check("mã khôi phục của nhóm cũ (chưa dùng) -> bị từ chối", code(r) === "INVALID_MFA_CODE", code(r));
  await prisma.authThrottle.deleteMany({ where: { key: `mfa:user:${user0.id}` } });

  // Reset password chỉ chứng minh đọc được hộp thư: không tắt MFA, không tạo phiên
  await call("POST", "/api/auth/forgot", { body: { email: account.email } });
  const mail = await latestMail(account.email, "reset");
  const resetToken = decodeURIComponent(new URL(resetLinkOf(mail.html)).searchParams.get("token") || "");
  const newPassword = `mat-khau-mfa-${RUN}`;
  r = await call("POST", "/api/auth/reset", { body: { token: resetToken, password: newPassword } });
  check("reset password -> ok, không có token", r.json?.ok === true && !hasAccessToken(r), r.text);
  check("reset password: MFA vẫn bật, secret giữ nguyên", (await prisma.user.findUnique({ where: { id: user0.id } })).mfaEnabled === true);
  r = await call("GET", "/api/auth/me", { token: recToken });
  check("reset password: token trước đó -> 401", r.status === 401);
  again = await call("POST", "/api/auth/login", { body: { email: account.email, password: newPassword } });
  check("reset xong đăng nhập -> vẫn phải qua bước MFA", again.json?.data?.next === "mfa" && !hasAccessToken(again), again.text);

  r = await call("POST", "/api/auth/mfa", { body: { challenge: again.json?.data?.challenge, code: recovery2[0] } });
  recToken = r.json?.data?.accessToken;
  const disableJar = new Map();
  r = await call("POST", "/api/auth/mfa/disable", { token: recToken, jar: disableJar, body: { password: newPassword, code: recovery2[1] } });
  row = await prisma.user.findUnique({ where: { id: user0.id } });
  check("tắt MFA (password + mã) -> ok, token mới; DB xóa secret và mã khôi phục", r.json?.ok === true && Boolean(r.json.data.accessToken) && disableJar.has("rt") && !row.mfaEnabled && !row.mfaSecret && (await prisma.recoveryCode.count({ where: { userId: user0.id } })) === 0, r.text.slice(0, 160));
  r = await call("GET", "/api/auth/me", { token: recToken });
  check("tắt MFA: token cũ -> 401 (đăng xuất mọi nơi)", r.status === 401);
  const plain = await login({ email: account.email, password: newPassword });
  check("tắt MFA xong: đăng nhập chỉ cần password", Boolean(plain.token));

  check("log của API không chứa TOTP secret hay mã khôi phục", !serverLog.includes(secret) && ![...recovery, ...recovery2].some((c) => serverLog.includes(c)));
}

// ──────────────── Block 10: khu vực quản trị (Admin; Editor chỉ món nháp của mình) ────────────────

const ADMIN_TAG = `[nghiệm thu Block 10 ${RUN}]`;

async function adminOnlyOnApi() {
  section("Block 10 · Khu vực quản trị của API: Admin mọi thứ, Editor chỉ món nháp của mình, Viewer 403");
  await resetIpLimits();
  const chef = await prisma.chef.create({ data: { name: `Bếp A ${ADMIN_TAG}`, specialty: "x" } });
  const otherChef = await prisma.chef.create({ data: { name: `Bếp B ${ADMIN_TAG}`, specialty: "x" } });
  const acc = {};
  for (const [tag, data] of [
    ["viewer", { role: "viewer" }],
    ["editor", { role: "editor", chefId: chef.id }],
    ["admin", { role: "admin" }],
  ]) {
    const a = await createActiveAccount(`quantri-${tag}`);
    await prisma.user.update({ where: { email: a.email }, data });
    acc[tag] = { ...a, token: (await login(a)).token };
  }
  const [viewer, editor, admin] = [acc.viewer.token, acc.editor.token, acc.admin.token];
  const mk = (name, status, chefId = chef.id) =>
    prisma.dish.create({ data: { name: `${name} ${ADMIN_TAG}`, price: 10000, chefId, status } });
  const draft = await mk("Nháp", "draft");
  const published = await mk("Đã đăng", "published");
  const otherDraft = await mk("Nháp bếp B", "draft", otherChef.id);
  const dish = (id) => prisma.dish.findUnique({ where: { id } });

  // Đọc khu vực quản trị
  const reads = ["/api/admin/dishes", `/api/admin/dishes/${draft.id}`, "/api/chefs", "/api/ingredients", "/api/admin/bookings"];
  let results = await Promise.all(reads.map((p) => call("GET", p, { token: viewer })));
  check(`viewer: GET ${reads.length} endpoint quản trị -> 403 FORBIDDEN`, results.every((x) => x.status === 403 && code(x) === "FORBIDDEN"), results.map((x) => x.status).join(","));
  results = await Promise.all(reads.slice(0, 4).map((p) => call("GET", p, { token: editor })));
  check("editor: GET món (cả nháp), đầu bếp, nguyên liệu -> 200", results.every((x) => x.json?.ok === true), results.map((x) => x.status).join(","));
  let r = await call("GET", "/api/admin/bookings", { token: editor });
  check("editor: GET /api/admin/bookings -> 403 (đặt bàn chỉ Admin)", r.status === 403 && code(r) === "FORBIDDEN", `${r.status}`);
  r = await call("GET", `/api/admin/dishes/${draft.id}`, { token: editor });
  check("editor: món nháp của đầu bếp mình có canEdit true, canDelete false", r.json?.data?.canEdit === true && r.json.data.canDelete === false, r.text.slice(0, 160));
  r = await call("GET", `/api/admin/dishes/${published.id}`, { token: editor });
  check("editor: món đã đăng có canEdit false", r.json?.data?.canEdit === false, r.text.slice(0, 160));
  r = await call("GET", "/api/admin/dishes");
  check("không token: GET /api/admin/dishes -> 401 (xác thực trước phân quyền)", r.status === 401);
  r = await call("GET", "/api/auth/me", { token: editor });
  check("editor: /api/auth/me -> role editor", r.json?.data?.role === "editor");
  r = await call("GET", "/api/auth/mfa/status", { token: viewer });
  check("viewer vẫn quản lý MFA của mình: /api/auth/mfa/status -> 200", r.json?.ok === true);

  // Ghi của Editor: ABAC (đầu bếp của mình + món nháp), không xóa
  r = await call("POST", "/api/admin/dishes", { token: editor, body: { name: `Editor tạo ${ADMIN_TAG}`, price: 5000, chefId: otherChef.id, status: "published" } });
  check("editor: tạo món -> nháp của đầu bếp mình (chefId / status trong body bị bỏ qua)", r.json?.data?.status === "draft" && r.json.data.chefId === chef.id, r.text.slice(0, 160));
  r = await call("PATCH", `/api/admin/dishes/${draft.id}`, { token: editor, body: { price: 12000 } });
  check("editor: PATCH món nháp của đầu bếp mình -> 200, giá đổi", r.json?.ok === true && (await dish(draft.id)).price === 12000, r.text.slice(0, 160));
  r = await call("PATCH", `/api/admin/dishes/${draft.id}`, { token: editor, body: { status: "published", chefId: otherChef.id } });
  check("editor: gửi status / chefId -> bị bỏ qua, món vẫn nháp của đầu bếp mình", (await dish(draft.id)).status === "draft" && (await dish(draft.id)).chefId === chef.id, r.text.slice(0, 160));
  r = await call("PATCH", `/api/dishes/${published.id}`, { token: editor, body: { price: 1 } });
  check("editor: PATCH món đã đăng -> 403, giá không đổi", r.status === 403 && (await dish(published.id)).price === 10000, `${r.status}`);
  r = await call("PATCH", `/api/admin/dishes/${otherDraft.id}`, { token: editor, body: { price: 1 } });
  check("editor: PATCH món nháp của đầu bếp khác -> 403, giá không đổi", r.status === 403 && (await dish(otherDraft.id)).price === 10000, `${r.status}`);
  r = await call("DELETE", `/api/dishes/${draft.id}`, { token: editor });
  check("editor: DELETE món -> 403, món còn", r.status === 403 && Boolean(await dish(draft.id)), `${r.status}`);
  r = await call("POST", "/api/chefs", { token: editor, body: { name: `x ${ADMIN_TAG}`, specialty: "x" } });
  check("editor: POST /api/chefs -> 403", r.status === 403, `${r.status}`);

  // Ghi của Viewer: 403, dữ liệu không đổi
  r = await call("PATCH", `/api/dishes/${draft.id}`, { token: viewer, body: { price: 1 } });
  check("viewer: PATCH /api/dishes/:id -> 403, giá không đổi", r.status === 403 && (await dish(draft.id)).price === 12000, `${r.status}`);
  r = await call("POST", "/api/dishes", { token: viewer, body: { name: `Viewer tạo ${ADMIN_TAG}`, price: 5000 } });
  check("viewer: POST /api/dishes -> 403, không tạo món", r.status === 403 && (await prisma.dish.count({ where: { name: `Viewer tạo ${ADMIN_TAG}` } })) === 0, `${r.status}`);

  // Trang khách không bị ảnh hưởng
  r = await call("GET", `/api/dishes/${published.id}`);
  check("khách: GET món đã đăng -> 200, không cần token", r.json?.ok === true);
  r = await call("GET", `/api/dishes/${draft.id}`);
  check("khách: GET món nháp -> NOT_FOUND", code(r) === "NOT_FOUND");

  // Admin dùng đủ chức năng
  r = await call("GET", `/api/admin/dishes/${draft.id}`, { token: admin });
  check("admin: xem món nháp, cờ canEdit / canDelete true", r.json?.data?.status === "draft" && r.json.data.canEdit === true && r.json.data.canDelete === true, r.text.slice(0, 160));
  r = await call("GET", `/api/admin/dishes?status=draft&mode=basic&q=${encodeURIComponent(RUN)}`, { token: admin });
  check("admin: danh sách lọc nháp chỉ có món nháp", (r.json?.data || []).some((x) => x.id === draft.id) && r.json.data.every((x) => x.status === "draft"), r.text.slice(0, 160));
  r = await call("POST", "/api/admin/dishes", { token: admin, body: { name: `Admin tạo nháp ${ADMIN_TAG}`, price: 1000, chefId: chef.id, status: "draft" } });
  check("admin: tạo món chọn đầu bếp + trạng thái nháp", r.json?.data?.status === "draft" && r.json.data.chefId === chef.id, r.text.slice(0, 160));
  r = await call("POST", "/api/dishes", { token: admin, body: { name: `Admin tạo ${ADMIN_TAG}`, price: 1000 } });
  check("admin: tạo món không chọn trạng thái -> published", r.json?.data?.status === "published", r.text.slice(0, 160));
  r = await call("PATCH", `/api/admin/dishes/${draft.id}`, { token: admin, body: { status: "published" } });
  check("admin: đăng món nháp -> khách thấy", r.json?.data?.status === "published" && (await call("GET", `/api/dishes/${draft.id}`)).json?.ok === true, r.text.slice(0, 160));
  r = await call("PATCH", `/api/admin/dishes/${draft.id}`, { token: admin, body: { ingredients: [] } });
  check("admin: PATCH chỉ đổi công thức -> 200", r.json?.ok === true, r.text.slice(0, 160));
  r = await call("DELETE", `/api/admin/dishes/${published.id}`, { token: admin });
  check("admin: xóa món -> 200", r.json?.ok === true && !(await dish(published.id)));

  // Role đọc từ DB ở mỗi request: hạ admin xuống viewer thì token đang có bị chặn ngay
  await prisma.user.update({ where: { email: acc.admin.email }, data: { role: "viewer" } });
  r = await call("GET", "/api/admin/dishes", { token: admin });
  check("hạ admin xuống viewer trong DB -> token đang dùng bị 403 ngay", r.status === 403, `${r.status}`);
}

async function cleanupBlock10() {
  await prisma.dish.deleteMany({ where: { name: { contains: "[nghiệm thu Block 10" } } });
  await prisma.chef.deleteMany({ where: { name: { contains: "[nghiệm thu Block 10" } } });
}

async function codeReview() {
  section("Đọc mã: các điểm agent hay làm sai");
  const tokens = await fs.readFile(path.join(ROOT, "src/auth/tokens.js"), "utf8");
  check("verify cố định algorithms: [\"HS256\"] (không theo alg của token)", /algorithms:\s*\[AT\.algorithm\]/.test(tokens) && /algorithm:\s*"HS256"/.test(await fs.readFile(path.join(ROOT, "src/auth/config.js"), "utf8")));
  check("không dùng jwt.decode để xác thực", !/jwt\.decode\(/.test(tokens));
  const app = await fs.readFile(path.join(ROOT, "src/app.js"), "utf8");
  check("không còn middleware session ở api", !/session/i.test(app.replace(/\/\/.*$/gm, "")));
  const web = await fs.readFile(path.join(ROOT, "..", "web", "src", "auth", "session.js"), "utf8");
  check("SPA không ghi access token vào localStorage/sessionStorage", !/(localStorage|sessionStorage)\.setItem\([^)]*[Tt]oken/.test(web) && !/hint\.set\([^)]*accessToken/.test(web));
}

async function main() {
  await prisma.user.deleteMany({ where: { email: { endsWith: "@acceptance.test" } } });
  await prisma.authThrottle.deleteMany({});
  await fakeGoogle.start();
  await startServer();
  try {
    const account = await registrationAndActivation();
    await captchaAndBruteForce(account);
    await jwtAndCrud(account);
    await refreshTokens(account);
    await forgotAndReset(account);
    await mfaForSpa();
    await adminOnlyOnApi();
    await codeReview();
  } finally {
    await cleanupBlock10().catch((e) => console.error("dọn dữ liệu Block 10:", e.message));
    await stopServer();
    fakeGoogle.server.close();
    await prisma.authThrottle.deleteMany({});
    await prisma.$disconnect();
  }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => {
  console.error(err);
  console.error(serverLog);
  await stopServer();
  fakeGoogle.server?.close();
  process.exitCode = 1;
});
