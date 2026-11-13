// Nghiệm thu Block 8 và Block 9 Bài 2 (RBAC / ABAC / MFA) bằng request trực tiếp (không qua giao
// diện), theo các bảng "Nghiệm thu" của deck.
// Script tự chạy server (cổng ACCEPT_PORT, mặc định 3999) để kiểm tra được cả bước khởi động lại.
// Đọc DB để đối chiếu (hash, usedAt, attempts, session, bộ đếm) và đọc thư trong mail-outbox/.
// reCAPTCHA: script chạy một siteverify GIẢ LẬP (RECAPTCHA_VERIFY_URL) để tự động kiểm tra logic
// backend (thiếu token, token sai, dùng lại, sai hostname, Google không phản hồi). Đây chỉ là kiểm
// thử hồi quy; bằng chứng chặn bot nộp bài phải chụp với key thật và siteverify thật của Google.
//
// Chạy: npm run acceptance   (cần .env với DATABASE_URL, SESSION_SECRET, SEED_USER_*; MAIL_TRANSPORT=file)
// Script chỉ tạo user email @acceptance.test và xóa chúng ở đầu mỗi lần chạy; xóa toàn bộ bộ đếm rate limit.
import "dotenv/config";
import { spawn } from "node:child_process";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import prismaPkg from "@prisma/client";
import otplib from "otplib";

const { PrismaClient } = prismaPkg;
const require = createRequire(import.meta.url);
const { hashPassword } = require("../src/auth/crypto.js");
// Ứng dụng Authenticator giả lập: sinh mã TOTP từ secret hiện trên trang thiết lập.
// offsetSteps = 1: mã của bước 30 giây kế tiếp (server chấp nhận lệch 1 bước) để không phải chờ.
const totpAt = (secret, offsetSteps = 0) =>
  otplib.authenticator.clone({ epoch: Date.now() + offsetSteps * 30000 }).generate(secret);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTBOX = path.join(ROOT, "mail-outbox");
const PORT = Number(process.env.ACCEPT_PORT) || 3999;
const BASE = `http://localhost:${PORT}`;
const FAKE_GOOGLE_PORT = PORT + 1;
const RUN = Date.now().toString(36);
const prisma = new PrismaClient();

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

// Một "trình duyệt": giữ cookie như browser (tên=giá trị), gửi request không tự theo redirect
class Browser {
  constructor() {
    this.cookies = new Map();
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async request(method, url, { form, headers = {} } = {}) {
    const h = { ...headers };
    if (this.cookies.size) h.Cookie = this.cookieHeader();
    let body;
    if (form) {
      h["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(BASE + url, { method, headers: h, body, redirect: "manual" });
    const setCookies = res.headers.getSetCookie();
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (!value || /expires=Thu, 01 Jan 1970/i.test(sc)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    return { status: res.status, location: res.headers.get("location"), setCookies, headers: res.headers, text };
  }
  get(url, opts) {
    return this.request("GET", url, opts);
  }
  post(url, form, opts = {}) {
    return this.request("POST", url, { ...opts, form });
  }
  // GET trang để lấy CSRF token (và challengeId nếu có), rồi POST form
  async submit(pageUrl, actionUrl, form, { solveCaptcha = false, captchaAnswer = null } = {}) {
    const page = await this.get(pageUrl);
    const data = { _csrf: csrfOf(page.text), ...form };
    if (hasCaptcha(page.text) && solveCaptcha) data["g-recaptcha-response"] = captchaAnswer ?? fakeGoogle.issue();
    return this.post(actionUrl, data);
  }
}

const csrfOf = (html) => (html.match(/name="_csrf" value="([^"]*)"/) || [])[1] || "";
const hasCaptcha = (html) => html.includes('class="g-recaptcha');
const errorCodeOf = (html) => (html.match(/data-error-code="([A-Z_]+)"/) || [])[1] || null;
const sidOf = (res) => (res.setCookies.find((c) => c.startsWith("sid=") && !/=;|01 Jan 1970/.test(c)) || null);

// Thư mới nhất gửi tới email (loại thư: activation | reset | password-changed); chờ tối đa 3 giây
async function latestMail(to, kind, after = 0) {
  for (let i = 0; i < 30; i++) {
    const files = (await fs.readdir(OUTBOX).catch(() => []))
      .filter((f) => f.endsWith(".html") && f.includes(`-${kind}-`) && f.endsWith(`${to}.html`))
      .sort();
    const file = files[files.length - 1];
    if (file && files.length > after) return { html: await fs.readFile(path.join(OUTBOX, file), "utf8"), count: files.length };
    await wait(100);
  }
  return null;
}
async function mailCount(to, kind) {
  const files = await fs.readdir(OUTBOX).catch(() => []);
  return files.filter((f) => f.endsWith(".html") && f.includes(`-${kind}-`) && f.endsWith(`${to}.html`)).length;
}
const otpOf = (html) => (html.match(/letter-spacing:8px;margin:12px 0">(\d+)</) || [])[1];
const resetTokenOf = (html) => decodeURIComponent((html.match(/reset\?token=([^"&]+)"/) || [])[1] || "");

const resetThrottles = () => prisma.authThrottle.deleteMany({});

// ───────────────────────── siteverify giả lập ─────────────────────────
// Giống siteverify thật ở các điểm backend phải xử lý: kiểm tra secret, token chỉ xác minh được một
// lần (timeout-or-duplicate), trả hostname nơi token được giải.
const fakeGoogle = {
  secret: `fake-secret-${RUN}`,
  tokens: new Map(), // token -> { hostname, used }
  down: false, // true: trả HTTP 500 (giả lập Google lỗi)
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
        if (this.down) {
          res.writeHead(500).end();
          return;
        }
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
      APP_URL: BASE,
      MAIL_TRANSPORT: "file",
      RECAPTCHA_SITE_KEY: `fake-site-key-${RUN}`,
      RECAPTCHA_SECRET_KEY: fakeGoogle.secret,
      RECAPTCHA_VERIFY_URL: `http://localhost:${FAKE_GOOGLE_PORT}/siteverify`,
      RECAPTCHA_HOSTNAMES: "",
      // Khóa mã hóa TOTP secret: dùng khóa trong .env nếu có, không thì khóa riêng cho lần chạy này
      MFA_ENC_KEY: process.env.MFA_ENC_KEY || `acceptance-mfa-key-${RUN}`.padEnd(40, "x"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(BASE + "/about");
      return;
    } catch {
      await wait(100);
    }
  }
  throw new Error("Server không khởi động được:\n" + serverLog);
}
async function stopServer() {
  if (!server) return;
  const done = new Promise((r) => server.once("exit", r));
  server.kill();
  await done;
  server = null;
}

// ───────────────────────────── kịch bản ─────────────────────────────

async function login(b, email, password) {
  return b.submit(`/login?email=${encodeURIComponent(email)}`, "/login", { email, password }, { solveCaptcha: true });
}

async function registrationAndActivation() {
  section("Đăng ký và kích hoạt");
  const email = `an-${RUN}@acceptance.test`;
  const password = `mat-khau-${RUN}`;
  const b = new Browser();

  // Thiếu / sai CAPTCHA: không tạo user, không gửi OTP
  let r = await b.submit("/register", "/register", { email, password, confirm: password });
  check("register: thiếu CAPTCHA -> INVALID_CAPTCHA", r.status === 200 && errorCodeOf(r.text) === "INVALID_CAPTCHA", `${r.status} ${errorCodeOf(r.text)}`);
  r = await b.submit("/register", "/register", { email, password, confirm: password }, { solveCaptcha: true, captchaAnswer: "token-tu-che" });
  check("register: token CAPTCHA sai -> INVALID_CAPTCHA", errorCodeOf(r.text) === "INVALID_CAPTCHA");
  r = await b.submit("/register", "/register", { email, password, confirm: password, captchaPassed: "true", score: "1" });
  check("register: browser tự gửi captchaPassed=true -> vẫn INVALID_CAPTCHA", errorCodeOf(r.text) === "INVALID_CAPTCHA");
  check("register: thiếu/sai CAPTCHA -> không tạo user", (await prisma.user.count({ where: { email } })) === 0);
  check("register: thiếu/sai CAPTCHA -> không gửi OTP", (await mailCount(email, "activation")) === 0);

  // Trang chỉ có site key (công khai), không có secret key
  const page = await b.get("/register");
  check("register: trang có widget reCAPTCHA + site key, không có secret", hasCaptcha(page.text) && page.text.includes(`data-sitekey="fake-site-key-${RUN}"`) && !page.text.includes(fakeGoogle.secret));

  // Dữ liệu sai: VALIDATION_FAILED, không tạo user
  r = await b.submit("/register", "/register", { email: "khong-phai-email", password: "123", confirm: "123" }, { solveCaptcha: true });
  check("register: dữ liệu sai -> 200 VALIDATION_FAILED", r.status === 200 && errorCodeOf(r.text) === "VALIDATION_FAILED");

  // Hợp lệ, kèm role=admin trong body
  r = await b.submit("/register", "/register", { email: `  An-${RUN}@Acceptance.TEST `, password, confirm: password, role: "admin" }, { solveCaptcha: true });
  check("register: hợp lệ -> 303 /activate", r.status === 303 && r.location.startsWith("/activate"), `${r.status} ${r.location}`);
  check("register: response không có OTP / không tạo session", !sidOf(r) && !/\b\d{6}\b/.test(r.text));
  let user = await prisma.user.findUnique({ where: { email }, include: { activation: true } });
  check("register: email lưu bản chuẩn hóa + bản nhập", user && user.email === email && user.emailInput === `An-${RUN}@Acceptance.TEST`);
  check("register: user pending, role viewer (bỏ qua role=admin)", user && user.status === "pending" && user.role === "viewer", user && `${user.status}/${user.role}`);
  check("register: password lưu bằng Argon2id", user && user.passwordHash.startsWith("$argon2id$"));
  check("register: DB lưu hash OTP, không lưu OTP", user && user.activation && /^[0-9a-f]{64}$/.test(user.activation.otpHash));
  const mail1 = await latestMail(email, "activation");
  const otp1 = mail1 && otpOf(mail1.html);
  check("register: email OTP được gửi", Boolean(otp1));

  // Đăng ký lại cùng email (password khác): phản hồi giống, không có bản ghi thứ hai, password giữ nguyên
  const b2 = new Browser();
  r = await b2.submit("/register", "/register", { email, password: "mat-khau-khac-123", confirm: "mat-khau-khac-123" }, { solveCaptcha: true });
  check("register lại: cùng phản hồi 303 /activate", r.status === 303 && r.location.startsWith("/activate?registered=1"));
  const again = await prisma.user.findMany({ where: { email } });
  check("register lại: vẫn 1 user, passwordHash không đổi", again.length === 1 && again[0].passwordHash === user.passwordHash);

  // Tài khoản pending đăng nhập đúng password: không cấp session
  r = await login(new Browser(), email, password);
  check("login pending: không Set-Cookie sid, ACCOUNT_PENDING", !sidOf(r) && errorCodeOf(r.text) === "ACCOUNT_PENDING", `${r.status} ${errorCodeOf(r.text)}`);

  // OTP sai: INVALID_OTP, attempts tăng, vẫn pending
  const wrong = otp1 === "000000" ? "111111" : "000000";
  r = await b.submit("/activate", "/activate", { email, otp: wrong });
  user = await prisma.user.findUnique({ where: { email }, include: { activation: true } });
  check("activate: OTP sai -> 200 INVALID_OTP, attempts=1, pending", r.status === 200 && errorCodeOf(r.text) === "INVALID_OTP" && user.activation.attempts === 1 && user.status === "pending");

  // Gửi lại ngay: đang trong thời gian chờ -> 429
  r = await b.submit("/activate", "/activate/resend", { email });
  check("resend: trong 60 giây -> 429", r.status === 429 && errorCodeOf(r.text) === "RATE_LIMITED");
  // Mô phỏng hết thời gian chờ (xóa bộ đếm cooldown), gửi lại: mã mới thay mã cũ, attempts giữ nguyên
  await prisma.authThrottle.deleteMany({ where: { key: { startsWith: "resend-cooldown:" } } });
  r = await b.submit("/activate", "/activate/resend", { email });
  check("resend: sau thời gian chờ -> 303", r.status === 303);
  const mail2 = await latestMail(email, "activation", mail1.count);
  const otp2 = mail2 && otpOf(mail2.html);
  user = await prisma.user.findUnique({ where: { email }, include: { activation: true } });
  check("resend: attempts không về 0", user.activation.attempts === 1);
  if (otp2 !== otp1) {
    r = await b.submit("/activate", "/activate", { email, otp: otp1 });
    check("resend: mã cũ bị từ chối", errorCodeOf(r.text) === "INVALID_OTP");
  }

  // Phản hồi gửi lại giống nhau cho email không có tài khoản
  r = await b.submit("/activate", "/activate/resend", { email: `khong-co-${RUN}@acceptance.test` });
  check("resend: email không tồn tại -> cùng 303", r.status === 303 && r.location.startsWith("/activate?sent=1"));

  // Hai request xác nhận cùng lúc với mã đúng: chỉ một request thắng
  const p1 = new Browser();
  const p2 = new Browser();
  const [f1, f2] = await Promise.all([p1.get("/activate"), p2.get("/activate")]);
  const [a1, a2] = await Promise.all([
    p1.post("/activate", { _csrf: csrfOf(f1.text), email, otp: otp2 }),
    p2.post("/activate", { _csrf: csrfOf(f2.text), email, otp: otp2 }),
  ]);
  const wins = [a1, a2].filter((x) => x.status === 303).length;
  check("activate đồng thời: đúng 1 request thắng", wins === 1, `${a1.status}/${a2.status}`);
  check("activate: không tạo session (người dùng đăng nhập ở bước riêng)", !sidOf(a1) && !sidOf(a2));
  user = await prisma.user.findUnique({ where: { email }, include: { activation: true } });
  check("activate: active, có emailVerifiedAt, usedAt", user.status === "active" && user.emailVerifiedAt && user.activation.usedAt);
  r = await b.submit("/activate", "/activate", { email, otp: otp2 });
  check("activate: dùng lại OTP -> INVALID_OTP", errorCodeOf(r.text) === "INVALID_OTP");

  // OTP kích hoạt không dùng được làm password
  r = await login(new Browser(), email, otp2);
  check("login bằng OTP làm password -> từ chối", !sidOf(r) && errorCodeOf(r.text) === "INVALID_CREDENTIALS");

  // Giới hạn thử: 5 lần sai -> khóa (429), gửi lại không mở thêm lượt
  const email2 = `binh-${RUN}@acceptance.test`;
  await new Browser().submit("/register", "/register", { email: email2, password, confirm: password }, { solveCaptcha: true });
  const m = await latestMail(email2, "activation");
  const good = otpOf(m.html);
  const bad = good === "123456" ? "654321" : "123456";
  for (let i = 0; i < 5; i++) await b.submit("/activate", "/activate", { email: email2, otp: bad });
  await prisma.authThrottle.deleteMany({ where: { key: { startsWith: "resend-cooldown:" } } });
  await b.submit("/activate", "/activate/resend", { email: email2 });
  const ch = await prisma.activationChallenge.findFirst({ where: { user: { email: email2 } } });
  check("activate: 5 lần sai -> attempts=5, có lockedUntil; gửi lại không đặt lại", ch.attempts === 5 && ch.lockedUntil > new Date());
  const m2 = await latestMail(email2, "activation", m.count);
  r = await b.submit("/activate", "/activate", { email: email2, otp: otpOf(m2.html) });
  check("activate: đang khóa -> 429 dù mã mới đúng", r.status === 429);
  check("activate: đang khóa -> vẫn pending", (await prisma.user.findUnique({ where: { email: email2 } })).status === "pending");

  // Email không có tài khoản: 5 lần INVALID_OTP rồi 429, giống tài khoản thật
  const ghost = `ma-${RUN}@acceptance.test`;
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await b.submit("/activate", "/activate", { email: ghost, otp: "123456" })).status);
  check("activate: email không tồn tại -> 5 lần 200 rồi 429", codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429, codes.join(","));
  return { email, password };
}

async function captchaAndBruteForce(account) {
  section("CAPTCHA và chống brute force");
  await resetThrottles();
  const { email, password } = account;

  const b = new Browser();
  const page = await b.get("/register");
  const reg = (extra) => b.post("/register", { _csrf: csrfOf(page.text), email: "khong-phai-email", password: "x", confirm: "x", ...extra });

  // Token hợp lệ: backend gọi siteverify rồi mới đi tiếp
  const callsBefore = fakeGoogle.calls;
  const token = fakeGoogle.issue();
  let r = await reg({ "g-recaptcha-response": token });
  check("captcha: token hợp lệ -> qua bước CAPTCHA (tới VALIDATION_FAILED)", errorCodeOf(r.text) === "VALIDATION_FAILED");
  check("captcha: backend thật sự gọi siteverify", fakeGoogle.calls === callsBefore + 1);
  r = await reg({ "g-recaptcha-response": token });
  check("captcha: dùng lại token (timeout-or-duplicate) -> INVALID_CAPTCHA", errorCodeOf(r.text) === "INVALID_CAPTCHA");
  r = await reg({ "g-recaptcha-response": fakeGoogle.issue("evil.example") });
  check("captcha: token giải ở hostname khác -> INVALID_CAPTCHA", errorCodeOf(r.text) === "INVALID_CAPTCHA");

  // Google không phản hồi: không mặc định cho qua, không tạo user, không gửi OTP
  const downEmail = `down-${RUN}@acceptance.test`;
  fakeGoogle.down = true;
  r = await b.submit("/register", "/register", { email: downEmail, password: "mat-khau-123", confirm: "mat-khau-123" }, { solveCaptcha: true });
  fakeGoogle.down = false;
  check("captcha: siteverify lỗi -> 503 CAPTCHA_UNAVAILABLE", r.status === 503 && errorCodeOf(r.text) === "CAPTCHA_UNAVAILABLE", `${r.status} ${errorCodeOf(r.text)}`);
  check("captcha: siteverify lỗi -> không tạo user, không gửi OTP", (await prisma.user.count({ where: { email: downEmail } })) === 0 && (await mailCount(downEmail, "activation")) === 0);

  // Đăng nhập sai tới ngưỡng CAPTCHA
  const att = new Browser();
  for (let i = 0; i < 3; i++) await att.submit("/login", "/login", { email, password: "sai-mat-khau" });
  const key = `login-fail:email:${email}`;
  let counter = await prisma.authThrottle.findUnique({ where: { key } });
  check("login: 3 lần sai -> bộ đếm = 3", counter && counter.count === 3);

  // Bỏ trường CAPTCHA (gửi thẳng POST /login), kể cả với password đúng
  r = await att.submit("/login", "/login", { email, password });
  check("login: đủ ngưỡng, bỏ CAPTCHA -> CAPTCHA_REQUIRED, không session", errorCodeOf(r.text) === "CAPTCHA_REQUIRED" && !sidOf(r));
  counter = await prisma.authThrottle.findUnique({ where: { key } });
  check("login: bị chặn trước bước kiểm tra password (bộ đếm vẫn 3)", counter.count === 3);
  check("login: form hiện CAPTCHA, giữ email, bỏ password", hasCaptcha(r.text) && r.text.includes(`value="${email}"`) && !r.text.includes(password));
  check("login: chưa tới ngưỡng thì không hiện CAPTCHA", !hasCaptcha((await new Browser().get("/login")).text));

  // Giải đúng CAPTCHA nhưng password sai: bộ đếm tiếp tục tăng
  r = await login(att, email, "van-sai");
  counter = await prisma.authThrottle.findUnique({ where: { key } });
  check("login: CAPTCHA đúng + password sai -> bộ đếm tăng (4)", counter.count === 4 && errorCodeOf(r.text) === "INVALID_CREDENTIALS");

  for (let i = 0; i < 6; i++) r = await login(att, email, "van-sai");
  counter = await prisma.authThrottle.findUnique({ where: { key } });
  check("login: lần sai thứ 10 -> khóa tạm (lockedUntil)", counter.count === 10 && counter.lockedUntil > new Date(), `${counter.count}`);
  r = await login(att, email, password);
  check("login: đang khóa, password + CAPTCHA đúng -> 429, không session", r.status === 429 && !sidOf(r));

  // Xóa cookie / phiên ẩn danh mới: không đặt lại bộ đếm theo email
  const fresh = new Browser();
  r = await fresh.submit("/login", "/login", { email, password });
  check("login: trình duyệt mới (không cookie) -> vẫn 429", r.status === 429);

  // Email không tồn tại: cùng quy tắc CAPTCHA (không lộ tài khoản)
  const ghost = `khong-ton-tai-${RUN}@acceptance.test`;
  const g = new Browser();
  for (let i = 0; i < 3; i++) await g.submit("/login", "/login", { email: ghost, password: "x-x-x-x-x" });
  r = await g.submit("/login", "/login", { email: ghost, password: "x-x-x-x-x" });
  check("login: email không tồn tại cũng phải có CAPTCHA sau 3 lần", errorCodeOf(r.text) === "CAPTCHA_REQUIRED");

  // Mở khóa cho phần sau
  await resetThrottles();
}

async function loginLogoutCrud(account) {
  section("Đăng nhập, đăng xuất, CRUD");
  await resetThrottles();
  const before = await prisma.dish.count();
  const dish = await prisma.dish.findFirst({ where: { status: "published" }, orderBy: { id: "asc" } });
  const anon = new Browser();

  // Chưa đăng nhập: mọi route quản trị -> 303 /login, dữ liệu không đổi
  const routes = [
    ["GET", "/admin/dishes"],
    ["GET", "/admin/dishes/new"],
    ["GET", `/admin/dishes/${dish.id}`],
    ["GET", `/admin/dishes/${dish.id}/edit`],
    ["GET", `/admin/dishes/${dish.id}/delete`],
    ["POST", "/admin/dishes", { name: "Hack", price: "1" }],
    ["POST", `/admin/dishes/${dish.id}?_method=PATCH`, { name: "Hack", price: "1" }],
    ["POST", `/admin/dishes/${dish.id}?_method=DELETE`, {}],
    ["GET", "/admin/chefs"],
    ["GET", "/admin/ingredients"],
    ["GET", "/admin/bookings"],
  ];
  for (const [method, url, form] of routes) {
    const r = await anon.request(method, url, { form });
    check(`chưa đăng nhập: ${method} ${url} -> 303 /login`, r.status === 303 && r.location.startsWith("/login"), `${r.status} ${r.location}`);
  }
  const after = await prisma.dish.findUnique({ where: { id: dish.id } });
  check("chưa đăng nhập: dữ liệu không đổi", (await prisma.dish.count()) === before && after && after.name === dish.name);

  // Trang công khai vẫn vào được
  for (const url of ["/dishes", `/dishes/${dish.id}`, "/login", "/register", "/activate", "/forgot"]) {
    const r = await anon.get(url);
    check(`công khai: GET ${url} -> 200`, r.status === 200);
  }

  // Sai email và sai password: cùng thông báo
  const e1 = await anon.submit("/login", "/login", { email: `khong-co-${RUN}@acceptance.test`, password: "sai-mat-khau" });
  const e2 = await anon.submit("/login", "/login", { email: account.email, password: "sai-mat-khau" });
  const msg = (t) => (t.match(/role="alert"[\s\S]*?<\/div>/) || [""])[0];
  check("login: sai email và sai password -> cùng thông báo", msg(e1.text) && msg(e1.text) === msg(e2.text));
  await resetThrottles();

  // Đăng nhập đúng: 303 + Set-Cookie sid với HttpOnly, SameSite, Secure; sid khác trước đăng nhập
  const b = new Browser();
  b.cookies.set("sid", "A".repeat(43)); // sid do kẻ tấn công đặt sẵn (session fixation)
  let r = await login(b, account.email, account.password);
  const sc = sidOf(r) || "";
  check("login đúng (viewer): 303 tới /dishes", r.status === 303 && r.location === "/dishes", `${r.status} ${r.location}`);
  check("login đúng: Set-Cookie sid HttpOnly; SameSite=Lax; Secure", /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc) && /Secure/i.test(sc), sc.replace(/sid=[^;]+/, "sid=…"));
  const sid1 = b.cookies.get("sid");
  check("login đúng: sid đổi so với trước đăng nhập", sid1 && sid1 !== "A".repeat(43));
  check("login đúng: cookie chỉ là mã ngẫu nhiên (không chứa email/userId)", !sid1.includes("@") && /^[A-Za-z0-9_-]{43}$/.test(sid1));
  // Block 9 Bài 2: Viewer đọc được khu vực quản trị nhưng không tạo / sửa / xóa (chi tiết ở rbacAndAbac)
  for (const url of ["/admin/dishes", `/admin/dishes/${dish.id}`, "/admin/chefs", "/admin/ingredients", "/admin/bookings"]) {
    r = await b.get(url);
    check(`viewer: GET ${url} -> 200 (chỉ đọc)`, r.status === 200, `${r.status}`);
  }
  r = await b.get(`/admin/dishes/${dish.id}/edit`);
  check("viewer: GET form sửa -> 403 FORBIDDEN", r.status === 403 && errorCodeOf(r.text) === "FORBIDDEN", `${r.status}`);
  const viewerToken = csrfOf((await b.get("/dishes")).text);
  r = await b.post("/admin/dishes", { _csrf: viewerToken, name: `Viewer tạo ${RUN}`, price: "1000" });
  check("viewer: POST /admin/dishes (CSRF hợp lệ) -> 403", r.status === 403);
  r = await b.post(`/admin/dishes/${dish.id}?_method=DELETE`, { _csrf: viewerToken });
  check("viewer: DELETE /admin/dishes/:id -> 403", r.status === 403);
  check("viewer: dữ liệu không đổi", (await prisma.dish.count()) === before && (await prisma.dish.findUnique({ where: { id: dish.id } })) !== null);
  check("viewer: header có link Quản trị (đọc được)", (await b.get("/dishes")).text.includes('href="/admin/dishes"'));

  // Admin cấp quyền (mô phỏng bằng DB). Role đọc lại mỗi request nên có hiệu lực ngay với phiên đang mở.
  await prisma.user.update({ where: { email: account.email }, data: { role: "admin" } });
  r = await b.get("/admin/dishes");
  check("admin: GET /admin/dishes -> 200 (role mới có hiệu lực ngay)", r.status === 200);

  // Đăng nhập lại khi đang có phiên: sid mới, sid cũ bị hủy
  const old = new Browser();
  old.cookies.set("sid", sid1);
  // (đang đăng nhập thì GET /login chuyển hướng, nên lấy CSRF token từ trang quản trị rồi POST /login)
  const adminPage = await b.get("/admin/dishes");
  r = await b.post("/login", { _csrf: csrfOf(adminPage.text), email: account.email, password: account.password });
  check("login đúng (admin): 303 tới /admin/dishes", r.status === 303 && r.location === "/admin/dishes", `${r.status} ${r.location}`);
  const sid2 = b.cookies.get("sid");
  r = await old.get("/admin/dishes");
  check("login lại: sid mới khác sid cũ, sid cũ bị từ chối", sid2 !== sid1 && r.status === 303);

  // Session lưu bền vững: khởi động lại server, dùng lại cookie
  await stopServer();
  await startServer();
  r = await b.get("/admin/dishes");
  check("khởi động lại server: cookie cũ vẫn đăng nhập (session trong DB)", r.status === 200);
  const userId = (await prisma.user.findUnique({ where: { email: account.email } })).id;
  check("session: bản ghi còn trong bảng sessions", (await prisma.session.count({ where: { userId } })) >= 1);

  // CSRF: thiếu token, token sai, Origin lạ -> 403, dữ liệu không đổi
  const count0 = await prisma.dish.count();
  r = await b.post("/admin/dishes", { name: "CSRF test", price: "1000" });
  check("CSRF: thiếu token -> 403", r.status === 403 && errorCodeOf(r.text) === "CSRF_FAILED");
  const newPage = await b.get("/admin/dishes/new");
  const token = csrfOf(newPage.text);
  r = await b.post("/admin/dishes", { _csrf: token, name: "CSRF test", price: "1000" }, { headers: { Origin: "http://evil.example" } });
  check("CSRF: form gửi từ trang khác (Origin lạ) -> 403", r.status === 403);
  r = await b.post("/admin/dishes", { _csrf: "sai" + token.slice(3), name: "CSRF test", price: "1000" });
  check("CSRF: token sai -> 403", r.status === 403);
  r = await b.post("/admin/dishes", { _csrf: token, name: "CSRF test", price: "1000" }, { headers: { Origin: "null" } });
  check("CSRF: Origin null ở route khác /reset -> 403", r.status === 403);
  check("CSRF: dữ liệu không đổi", (await prisma.dish.count()) === count0);
  r = await b.post("/admin/dishes", { _csrf: token, name: `Món nghiệm thu ${RUN}`, price: "1000" }, { headers: { Origin: BASE } });
  check("CSRF: token đúng -> 303 tạo món", r.status === 303);
  const created = await prisma.dish.findFirst({ where: { name: `Món nghiệm thu ${RUN}` } });
  if (created) {
    const del = await b.get(`/admin/dishes/${created.id}/delete`);
    r = await b.post(`/admin/dishes/${created.id}?_method=DELETE`, { _csrf: csrfOf(del.text) });
    check("CRUD: xóa món (DELETE qua method-override) -> 303", r.status === 303);
  }

  // Đăng xuất: hủy session ở server, dùng lại sid cũ bị từ chối
  const copy = new Browser();
  copy.cookies.set("sid", b.cookies.get("sid"));
  const home = await b.get("/admin/dishes");
  r = await b.post("/logout", { _csrf: csrfOf(home.text) });
  check("logout: 303 + xóa cookie sid", r.status === 303 && r.setCookies.some((c) => c.startsWith("sid=;") || /sid=;|sid=$/.test(c.split(";")[0])));
  r = await copy.get("/admin/dishes");
  check("logout: dùng lại sid cũ (bản sao) -> 303 /login", r.status === 303 && r.location.startsWith("/login"));
  check("logout: logout bằng GET không có tác dụng", (await anon.get("/logout")).status === 404);
}

async function forgotAndReset(account) {
  section("Quên mật khẩu");
  await resetThrottles();
  const { email } = account;
  const ghost = `khong-co-${RUN}@acceptance.test`;
  const b = new Browser();
  const page = await b.get("/forgot");
  const token = csrfOf(page.text);

  // Email có và không có: cùng status, cùng nội dung
  const sentBefore = await mailCount(email, "reset");
  const r1 = await b.post("/forgot", { _csrf: token, email });
  const r2 = await b.post("/forgot", { _csrf: token, email: ghost });
  check("forgot: email có / không có -> cùng status", r1.status === r2.status && r1.status === 200);
  check("forgot: email có / không có -> cùng nội dung HTML", r1.text === r2.text);
  const mailA = await latestMail(email, "reset", sentBefore);
  const tokenA = resetTokenOf(mailA.html);
  check("forgot: chỉ email có tài khoản nhận thư", Boolean(tokenA) && (await mailCount(ghost, "reset")) === 0);
  const userId = (await prisma.user.findUnique({ where: { email } })).id;
  const rowA = await prisma.passwordReset.findFirst({ where: { userId }, orderBy: { id: "desc" } });
  check("forgot: DB lưu hash token, không lưu token", rowA && /^[0-9a-f]{64}$/.test(rowA.tokenHash) && rowA.tokenHash !== tokenA);

  // Yêu cầu mới làm token cũ hết hiệu lực
  await b.post("/forgot", { _csrf: token, email });
  const mailB = await latestMail(email, "reset", mailA.count);
  const tokenB = resetTokenOf(mailB.html);
  let r = await b.get(`/reset?token=${encodeURIComponent(tokenA)}`);
  check("reset: token cũ (đã có yêu cầu mới) -> INVALID_TOKEN", errorCodeOf(r.text) === "INVALID_TOKEN");

  // Vượt giới hạn /forgot theo email (3/giờ) -> 429; áp cả với email không có tài khoản
  await b.post("/forgot", { _csrf: token, email: ghost });
  await b.post("/forgot", { _csrf: token, email: ghost });
  r = await b.post("/forgot", { _csrf: token, email: ghost });
  check("forgot: lần thứ 4 trong giờ -> 429", r.status === 429 && errorCodeOf(r.text) === "RATE_LIMITED");

  // GET /reset với token hợp lệ: chỉ hiện form, usedAt vẫn rỗng, Referrer-Policy no-referrer
  r = await b.get(`/reset?token=${encodeURIComponent(tokenB)}`);
  const rowB = await prisma.passwordReset.findFirst({ where: { userId }, orderBy: { id: "desc" } });
  check("reset GET: hiện form, usedAt vẫn null", r.status === 200 && r.text.includes('name="token"') && rowB.usedAt === null);
  check("reset GET: Referrer-Policy: no-referrer", r.headers.get("referrer-policy") === "no-referrer");

  // Đang đăng nhập ở tab khác trước khi reset
  const tab = new Browser();
  await login(tab, email, account.password);
  check("reset: trước khi reset, phiên cũ còn dùng được", (await tab.get("/admin/dishes")).status === 200);

  // Reset token dùng ở route khác: làm cookie sid, làm OTP
  const misuse = new Browser();
  misuse.cookies.set("sid", tokenB);
  check("reset token làm cookie sid -> 303 /login", (await misuse.get("/admin/dishes")).status === 303);
  r = await b.submit("/activate", "/activate", { email, otp: tokenB });
  check("reset token làm OTP -> từ chối", errorCodeOf(r.text) === "INVALID_OTP" || r.status === 429);

  // POST /reset: đổi password, tiêu thụ token, không tự đăng nhập, hủy session cũ
  const newPassword = `mat-khau-moi-${RUN}`;
  const form = await b.get(`/reset?token=${encodeURIComponent(tokenB)}`);
  // Browser gửi "Origin: null" vì trang /reset đặt Referrer-Policy: no-referrer
  r = await b.post("/reset", { token: tokenB, password: newPassword, confirm: newPassword }, { headers: { Origin: "null" } });
  check("reset POST: Origin null nhưng thiếu CSRF token -> 403", r.status === 403);
  r = await b.post("/reset", { _csrf: csrfOf(form.text), token: tokenB, password: newPassword, confirm: newPassword }, { headers: { Origin: "null" } });
  check("reset POST: 303 /login?reset=1, không Set-Cookie sid", r.status === 303 && r.location === "/login?reset=1" && !sidOf(r));
  const usedRow = await prisma.passwordReset.findFirst({ where: { userId }, orderBy: { id: "desc" } });
  check("reset POST: usedAt có giá trị", Boolean(usedRow.usedAt));
  check("reset POST: sid cũ ở tab khác bị từ chối", (await tab.get("/admin/dishes")).status === 303);
  check("reset POST: bảng sessions không còn phiên của user", (await prisma.session.count({ where: { userId } })) === 0);
  check("reset POST: có thư báo password đã đổi", Boolean(await latestMail(email, "password-changed")));

  // Dùng lại token: từ chối, password không đổi lần nữa
  const hashAfter = (await prisma.user.findUnique({ where: { id: userId } })).passwordHash;
  r = await b.post("/reset", { _csrf: csrfOf(form.text), token: tokenB, password: "doi-lan-nua-123", confirm: "doi-lan-nua-123" });
  check("reset: dùng lại token -> INVALID_TOKEN, password không đổi",
    errorCodeOf(r.text) === "INVALID_TOKEN" && (await prisma.user.findUnique({ where: { id: userId } })).passwordHash === hashAfter);

  // Token hết hạn
  await resetThrottles();
  await b.post("/forgot", { _csrf: token, email });
  const mailC = await latestMail(email, "reset", mailB.count);
  const tokenC = resetTokenOf(mailC.html);
  await prisma.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  r = await b.post("/reset", { _csrf: csrfOf(form.text), token: tokenC, password: "het-han-123456", confirm: "het-han-123456" });
  check("reset: token hết hạn -> INVALID_TOKEN, password không đổi",
    errorCodeOf(r.text) === "INVALID_TOKEN" && (await prisma.user.findUnique({ where: { id: userId } })).passwordHash === hashAfter);

  // Đăng nhập lại bằng password mới theo luồng thường
  r = await login(new Browser(), email, newPassword);
  check("reset: đăng nhập bằng password mới -> 303", r.status === 303 && Boolean(sidOf(r)));
}

// Block 7 (bản SSR): tìm kiếm 4 mode + phân trang trên thực đơn và trang quản trị
async function searchAndPaging(account) {
  section("Tìm kiếm và phân trang (Block 7)");
  const b = new Browser();
  const totalOf = (html) => Number((html.match(/data-result-total>(\d+)</) || [])[1] ?? NaN);
  const menuTotal = async (qs) => totalOf((await b.get("/dishes?" + qs)).text);

  // Block 9 Bài 2: thực đơn công khai chỉ tính món đã đăng
  const PUBLISHED = { status: "published" };
  const all = await prisma.dish.count({ where: PUBLISHED });
  check("thực đơn: tổng số món đúng (chỉ món published)", (await menuTotal("")) === all);
  // Kỳ vọng tính bằng LIKE có escape (contains "%" của Prisma không escape, chính là lỗi đã sửa ở Block 7)
  const percent = await prisma.dish.count({ where: { ...PUBLISHED, name: { contains: "\\%" } } });
  check("basic: q=% là ký tự thường (không trả toàn bộ)", (await menuTotal("q=%25")) === percent, `${percent}`);
  const bun = await menuTotal("mode=fuzzy&q=b%C3%BAn");
  check("fuzzy: q=bun (không dấu) = q=bún", bun > 0 && (await menuTotal("mode=fuzzy&q=bun")) === bun, `${bun}`);
  check("fulltext: 'phở bò' có kết quả", (await menuTotal("mode=fulltext&q=ph%E1%BB%9F%20b%C3%B2")) > 0);
  const adv = await prisma.dish.count({ where: { ...PUBLISHED, available: false, price: { lte: 80000 } } });
  check("advanced: available=false&maxPrice=80000", (await menuTotal("mode=advanced&available=false&maxPrice=80000")) === adv);
  let r = await b.get("/dishes?mode=advanced&minPrice=abc");
  check("advanced: minPrice=abc -> 200 + VALIDATION_FAILED", r.status === 200 && errorCodeOf(r.text) === "VALIDATION_FAILED");

  r = await b.get("/dishes?view=more");
  check("Tải thêm: trang đầu 9 món + dữ liệu cho script", (r.text.match(/data-dish-id=/g) || []).length === 9 && r.text.includes("data-load-more"));
  r = await b.get("/dishes/items?page=2");
  check("Tải thêm: /dishes/items?page=2 trả 9 thẻ + X-Total-Pages", (r.text.match(/data-dish-id=/g) || []).length === 9 && Number(r.headers.get("x-total-pages")) === Math.ceil(all / 9));

  await resetThrottles();
  await login(b, account.email, account.password);
  r = await b.get("/admin/dishes?mode=fuzzy&q=carbonra&page=1");
  check("quản trị: tìm Gần đúng 'carbonra' ra Carbonara", r.status === 200 && /Carbonara/.test(r.text));
}

// ───────────────────── Block 9 Bài 2: RBAC, ABAC, MFA ─────────────────────

const TEST_DISH_TAG = "[nghiệm thu Bài 2]";
const mfaSecrets = []; // TOTP secret + mã khôi phục của lần chạy, để kiểm tra log không chứa
const MFA_PASSWORD = `mat-khau-bai2-${RUN}`;

// Bốn tài khoản active tạo thẳng trong DB (role, chefId chỉ admin / seed gán, không qua form) +
// món thử: draft của A, published của A, draft của B
async function createRoleAccounts() {
  const [chefA, chefB] = await prisma.chef.findMany({ orderBy: { id: "asc" }, take: 2 });
  const passwordHash = await hashPassword(MFA_PASSWORD);
  const make = (name, role, chefId = null) => {
    const email = `${name}-${RUN}@acceptance.test`;
    return prisma.user.create({
      data: { email, emailInput: email, passwordHash, role, chefId, status: "active", emailVerifiedAt: new Date() },
    });
  };
  const users = {
    viewer: await make("viewer", "viewer"),
    editorA: await make("editor-a", "editor", chefA.id),
    editorB: await make("editor-b", "editor", chefB.id),
    editorNoChef: await make("editor-x", "editor"),
    admin: await make("admin", "admin"),
  };
  const dish = (label, chef, status) =>
    prisma.dish.create({ data: { name: `${label} ${TEST_DISH_TAG} ${RUN}`, price: 50000, chefId: chef.id, status } });
  const dishes = {
    draftA: await dish("Nháp A", chefA, "draft"),
    publishedA: await dish("Đã đăng A", chefA, "published"),
    draftB: await dish("Nháp B", chefB, "draft"),
  };
  return { users, dishes, chefA, chefB };
}

async function loginAs(user) {
  const b = new Browser();
  const r = await login(b, user.email, MFA_PASSWORD);
  return { b, r };
}

// PATCH món qua form sửa; csrf lấy từ trang /dishes (form sửa có thể bị 403)
async function patchDish(b, id, form) {
  const token = csrfOf((await b.get("/dishes")).text);
  return b.post(`/admin/dishes/${id}?_method=PATCH`, { _csrf: token, price: "50000", ...form });
}

async function rbacAndAbac({ users, dishes, chefA, chefB }) {
  section("Block 9 Bài 2 — RBAC (Viewer / Editor / Admin)");
  await resetThrottles();
  const reload = (id) => prisma.dish.findUnique({ where: { id } });
  const forbiddenPage = (r) => r.status === 403 && errorCodeOf(r.text) === "FORBIDDEN";

  // Viewer: chỉ đọc
  const { b: viewer } = await loginAs(users.viewer);
  for (const url of ["/admin/dishes", `/admin/dishes/${dishes.draftA.id}`, "/admin/chefs", "/admin/ingredients", "/admin/bookings"]) {
    check(`Viewer: GET ${url} -> 200`, (await viewer.get(url)).status === 200);
  }
  let r = await viewer.get("/admin/dishes");
  check("Viewer: danh sách không có nút Thêm / Sửa / Xóa", !r.text.includes('href="/admin/dishes/new"') && !/\/admin\/dishes\/\d+\/(edit|delete)"/.test(r.text));
  for (const url of ["/admin/dishes/new", `/admin/dishes/${dishes.draftA.id}/edit`, `/admin/dishes/${dishes.draftA.id}/delete`, "/admin/chefs/new"]) {
    check(`Viewer: GET ${url} -> 403`, forbiddenPage(await viewer.get(url)));
  }
  const countBefore = await prisma.dish.count();
  const vt = csrfOf((await viewer.get("/dishes")).text);
  check("Viewer: POST tạo món -> 403", forbiddenPage(await viewer.post("/admin/dishes", { _csrf: vt, name: `Viewer ${TEST_DISH_TAG}`, price: "1000" })));
  check("Viewer: PATCH sửa món -> 403", forbiddenPage(await patchDish(viewer, dishes.draftA.id, { name: "Viewer sửa" })));
  check("Viewer: DELETE món -> 403", forbiddenPage(await viewer.post(`/admin/dishes/${dishes.draftA.id}?_method=DELETE`, { _csrf: vt })));
  check("Viewer: PATCH trạng thái đặt bàn -> 403", forbiddenPage(await viewer.post(`/admin/bookings/1?_method=PATCH`, { _csrf: vt, status: "confirmed" })));
  check("Viewer: dữ liệu không đổi", (await prisma.dish.count()) === countBefore && (await reload(dishes.draftA.id)).name === dishes.draftA.name);

  // Editor: đọc, tạo, sửa; xóa bị chặn
  const { b: editor, r: loginR } = await loginAs(users.editorA);
  check("Editor: đăng nhập -> 303 /admin/dishes", loginR.status === 303 && loginR.location === "/admin/dishes", `${loginR.status} ${loginR.location}`);
  check("Editor: GET form thêm -> 200, không có ô chọn đầu bếp / trạng thái", await (async () => {
    const p = await editor.get("/admin/dishes/new");
    return p.status === 200 && !p.text.includes('name="chefId"') && !p.text.includes('name="status"');
  })());
  // Gửi kèm chefId của đầu bếp B và status=published: server bỏ qua, gán theo tài khoản
  const nt = csrfOf((await editor.get("/admin/dishes/new")).text);
  r = await editor.post("/admin/dishes", { _csrf: nt, name: `Editor tạo ${TEST_DISH_TAG} ${RUN}`, price: "45000", chefId: String(chefB.id), status: "published" });
  const createdByEditor = await prisma.dish.findFirst({ where: { name: `Editor tạo ${TEST_DISH_TAG} ${RUN}` } });
  check("Editor: tạo món -> 303", r.status === 303 && Boolean(createdByEditor));
  check("Editor: món mới có chefId của tài khoản (bỏ qua chefId giả) và status draft",
    createdByEditor && createdByEditor.chefId === chefA.id && createdByEditor.status === "draft",
    createdByEditor && `${createdByEditor.chefId}/${createdByEditor.status}`);
  check("Editor: GET trang xác nhận xóa -> 403", forbiddenPage(await editor.get(`/admin/dishes/${dishes.draftA.id}/delete`)));
  r = await editor.post(`/admin/dishes/${dishes.draftA.id}?_method=DELETE`, { _csrf: nt });
  check("Editor: DELETE món của mình -> 403, món còn nguyên", forbiddenPage(r) && Boolean(await reload(dishes.draftA.id)));
  check("Editor: DELETE đầu bếp -> 403", forbiddenPage(await editor.post(`/admin/chefs/${chefB.id}?_method=DELETE`, { _csrf: nt })));

  // Editor chưa gắn đầu bếp: không thêm được món
  const { b: noChef } = await loginAs(users.editorNoChef);
  check("Editor chưa gắn đầu bếp: GET form thêm -> 403", forbiddenPage(await noChef.get("/admin/dishes/new")));

  section("Block 9 Bài 2 — ABAC (Editor chỉ sửa món draft của đầu bếp mình)");
  check("Editor A: GET sửa món draft của A -> 200", (await editor.get(`/admin/dishes/${dishes.draftA.id}/edit`)).status === 200);
  r = await patchDish(editor, dishes.draftA.id, { name: `Nháp A đã sửa ${TEST_DISH_TAG} ${RUN}`, chefId: String(chefB.id), status: "published" });
  let a = await reload(dishes.draftA.id);
  check("Editor A: PATCH món draft của A -> 303, tên đổi", r.status === 303 && a.name.startsWith("Nháp A đã sửa"));
  check("Editor A: PATCH kèm chefId / status giả -> chefId, status không đổi", a.chefId === chefA.id && a.status === "draft", `${a.chefId}/${a.status}`);

  check("Editor A: GET sửa món draft của B -> 403", forbiddenPage(await editor.get(`/admin/dishes/${dishes.draftB.id}/edit`)));
  r = await patchDish(editor, dishes.draftB.id, { name: "A sửa món B" });
  check("Editor A: PATCH món của B -> 403, dữ liệu không đổi", forbiddenPage(r) && (await reload(dishes.draftB.id)).name === dishes.draftB.name);
  check("Editor A: GET sửa món published của A -> 403", forbiddenPage(await editor.get(`/admin/dishes/${dishes.publishedA.id}/edit`)));
  r = await patchDish(editor, dishes.publishedA.id, { name: "A sửa món đã đăng" });
  check("Editor A: PATCH món published của A -> 403, dữ liệu không đổi", forbiddenPage(r) && (await reload(dishes.publishedA.id)).name === dishes.publishedA.name);

  const { b: editorB } = await loginAs(users.editorB);
  check("Editor B: GET sửa món draft của B -> 200", (await editorB.get(`/admin/dishes/${dishes.draftB.id}/edit`)).status === 200);
  check("Editor B: GET sửa món draft của A -> 403", forbiddenPage(await editorB.get(`/admin/dishes/${dishes.draftA.id}/edit`)));

  // Đổi status giữa lúc mở form và lúc gửi: editor mở form (200), admin đăng món, editor gửi -> 403
  const formPage = await editor.get(`/admin/dishes/${dishes.draftA.id}/edit`);
  check("Đổi status giữa chừng: editor mở form sửa -> 200", formPage.status === 200);
  const { b: admin } = await loginAs(users.admin);
  r = await patchDish(admin, dishes.draftA.id, { name: a.name, chefId: String(chefA.id), status: "published" });
  check("Đổi status giữa chừng: admin PATCH status=published -> 303", r.status === 303 && (await reload(dishes.draftA.id)).status === "published");
  r = await editor.post(`/admin/dishes/${dishes.draftA.id}?_method=PATCH`, { _csrf: csrfOf(formPage.text), name: "Gửi sau khi đã đăng", price: "50000" });
  a = await reload(dishes.draftA.id);
  check("Đổi status giữa chừng: editor gửi form đã mở -> 403, món không đổi", forbiddenPage(r) && a.name !== "Gửi sau khi đã đăng");

  // Admin: đổi đầu bếp, trạng thái, xóa
  r = await patchDish(admin, dishes.draftB.id, { name: dishes.draftB.name, chefId: String(chefA.id), status: "draft" });
  check("Admin: PATCH đổi chefId -> 303, chefId mới", r.status === 303 && (await reload(dishes.draftB.id)).chefId === chefA.id);
  const delPage = await admin.get(`/admin/dishes/${createdByEditor.id}/delete`);
  r = await admin.post(`/admin/dishes/${createdByEditor.id}?_method=DELETE`, { _csrf: csrfOf(delPage.text) });
  check("Admin: DELETE món -> 303, món bị xóa", r.status === 303 && !(await reload(createdByEditor.id)));

  // Trang công khai chỉ hiện món đã đăng
  const anon = new Browser();
  check("Công khai: GET món draft -> 404", (await anon.get(`/dishes/${dishes.draftB.id}`)).status === 404);
  check("Công khai: GET món published -> 200", (await anon.get(`/dishes/${dishes.publishedA.id}`)).status === 200);
  r = await anon.get(`/dishes?q=${encodeURIComponent(`Nháp B ${TEST_DISH_TAG}`)}`);
  check("Công khai: tìm theo tên món draft -> không có kết quả", !r.text.includes(`data-dish-id="${dishes.draftB.id}"`));
  r = await anon.get(`/dishes?mode=fuzzy&q=${encodeURIComponent(`Nháp B nghiệm thu ${RUN}`)}`);
  check("Công khai: tìm Gần đúng tên món draft -> không có kết quả", !r.text.includes(`data-dish-id="${dishes.draftB.id}"`));

  // Role đọc lại từ DB mỗi request: hạ admin xuống viewer có hiệu lực ngay với phiên đang mở
  await prisma.user.update({ where: { id: users.admin.id }, data: { role: "viewer" } });
  check("Đổi role trong DB: admin -> viewer, GET form sửa -> 403 ngay", forbiddenPage(await admin.get(`/admin/dishes/${dishes.publishedA.id}/edit`)));
  await prisma.user.update({ where: { id: users.admin.id }, data: { role: "admin" } });
}

async function mfaFlow({ users }) {
  section("Block 9 Bài 2 — MFA (TOTP + mã khôi phục)");
  await resetThrottles();
  const user = users.admin;
  const reloadUser = () => prisma.user.findUnique({ where: { id: user.id } });
  const mfaCookie = (r) => r.setCookies.some((c) => c.startsWith("mfa=") && !/01 Jan 1970/.test(c));

  // 1. Bật MFA: QR + secret nhập tay + xác nhận mã
  const { b } = await loginAs(user);
  let page = await b.get("/account/security");
  check("Bảo mật: trang /account/security -> 200, MFA đang tắt", page.status === 200 && page.text.includes('data-mfa-status="disabled"'));
  let r = await b.post("/account/mfa/setup", { _csrf: csrfOf(page.text) });
  check("Bật MFA: POST setup -> 303 /account/mfa/setup", r.status === 303 && r.location === "/account/mfa/setup");
  page = await b.get("/account/mfa/setup");
  const secret = ((page.text.match(/data-mfa-secret>([^<]+)</) || [])[1] || "").replace(/\s+/g, "");
  check("Bật MFA: trang có QR (data URL vẽ ở server) và secret nhập tay", page.text.includes('src="data:image/png;base64,') && /^[A-Z2-7]{16,}$/.test(secret));
  check("Bật MFA: Cache-Control no-store", (page.headers.get("cache-control") || "").includes("no-store"));
  let db = await reloadUser();
  check("Bật MFA: chưa xác nhận mã thì mfaEnabled = false", db.mfaEnabled === false && Boolean(db.mfaPendingSecret));
  check("Bật MFA: DB không lưu secret dạng rõ", !String(db.mfaPendingSecret).includes(secret));

  const wrongCode = totpAt(secret) === "000000" ? "111111" : "000000";
  r = await b.post("/account/mfa/confirm", { _csrf: csrfOf(page.text), code: wrongCode });
  check("Bật MFA: mã sai -> INVALID_MFA_CODE, vẫn tắt", errorCodeOf(r.text) === "INVALID_MFA_CODE" && !(await reloadUser()).mfaEnabled);
  r = await b.post("/account/mfa/confirm", { _csrf: csrfOf(page.text), code: totpAt(secret) });
  const recovery = [...r.text.matchAll(/data-recovery-code>([A-Z0-9-]+)</g)].map((m) => m[1]);
  mfaSecrets.push(secret, ...recovery);
  db = await reloadUser();
  check("Bật MFA: mã đúng -> mfaEnabled = true, hiện 10 mã khôi phục", r.status === 200 && db.mfaEnabled && recovery.length === 10);
  const rows = await prisma.recoveryCode.findMany({ where: { userId: user.id } });
  check("Mã khôi phục: DB lưu 10 hash, không lưu mã gốc", rows.length === 10 && rows.every((x) => /^[0-9a-f]{64}$/.test(x.codeHash) && !recovery.includes(x.codeHash)));
  check("Bật MFA: DB không lưu secret dạng rõ", db.mfaSecret && !db.mfaSecret.includes(secret) && db.mfaPendingSecret === null);
  // Phiên đang mở (đã có trước khi bật MFA) vẫn dùng được
  check("Bật MFA: phiên hiện tại vẫn đăng nhập", (await b.get("/admin/dishes")).status === 200);

  // 2. Đăng nhập: password đúng -> trạng thái chờ MFA, chưa có session
  const p = new Browser();
  r = await login(p, user.email, MFA_PASSWORD);
  check("Đăng nhập MFA: password đúng -> 303 /login/mfa", r.status === 303 && r.location === "/login/mfa", `${r.status} ${r.location}`);
  check("Đăng nhập MFA: chưa Set-Cookie sid, có cookie mfa", !sidOf(r) && mfaCookie(r));
  r = await p.get("/admin/dishes");
  check("Đăng nhập MFA: đang chờ mã thì /admin -> 303 /login", r.status === 303 && r.location.startsWith("/login"));
  const mfaCookieValue = p.cookies.get("mfa");
  check("Đăng nhập MFA: dùng cookie mfa làm sid -> không đăng nhập được", await (async () => {
    const fake = new Browser();
    fake.cookies.set("sid", mfaCookieValue);
    return (await fake.get("/admin/dishes")).status === 303;
  })());
  // Gọi thẳng POST /login/mfa không qua password (không có trạng thái chờ)
  const direct = new Browser();
  const dp = await direct.get("/login");
  r = await direct.post("/login/mfa", { _csrf: csrfOf(dp.text), code: totpAt(secret, 1) });
  check("Bỏ qua bước password: POST /login/mfa không có trạng thái chờ -> 303 /login, không sid", r.status === 303 && r.location.startsWith("/login") && !sidOf(r));

  r = await p.submit("/login/mfa", "/login/mfa", { code: wrongCode });
  check("Đăng nhập MFA: mã sai -> INVALID_MFA_CODE, không sid", errorCodeOf(r.text) === "INVALID_MFA_CODE" && !sidOf(r));
  const nextCode = totpAt(secret, 1);
  r = await p.submit("/login/mfa", "/login/mfa", { code: nextCode });
  check("Đăng nhập MFA: mã đúng -> 303 + Set-Cookie sid", r.status === 303 && Boolean(sidOf(r)), `${r.status}`);
  check("Đăng nhập MFA: sau khi xong, cookie mfa bị xóa", !p.cookies.has("mfa"));
  check("Đăng nhập MFA: vào /admin được", (await p.get("/admin/dishes")).status === 200);
  check("Đăng nhập MFA: trạng thái chờ bị xóa khỏi DB", (await prisma.mfaChallenge.count({ where: { userId: user.id } })) === 0);

  // 3. Chống dùng lại mã: cùng mã TOTP vừa dùng -> từ chối
  const replay = new Browser();
  await login(replay, user.email, MFA_PASSWORD);
  r = await replay.submit("/login/mfa", "/login/mfa", { code: nextCode });
  check("Dùng lại mã TOTP đã dùng -> INVALID_MFA_CODE, không sid", errorCodeOf(r.text) === "INVALID_MFA_CODE" && !sidOf(r));

  // 4. Mã khôi phục: dùng được một lần
  r = await replay.submit("/login/mfa", "/login/mfa", { code: recovery[0].toLowerCase() });
  check("Mã khôi phục: đăng nhập được (không phân biệt hoa thường)", r.status === 303 && Boolean(sidOf(r)));
  const used = await prisma.recoveryCode.count({ where: { userId: user.id, usedAt: { not: null } } });
  check("Mã khôi phục: usedAt được ghi", used === 1);
  const again = new Browser();
  await login(again, user.email, MFA_PASSWORD);
  r = await again.submit("/login/mfa", "/login/mfa", { code: recovery[0] });
  check("Mã khôi phục: dùng lại -> INVALID_MFA_CODE", errorCodeOf(r.text) === "INVALID_MFA_CODE" && !sidOf(r));

  // 5. Giới hạn thử: 5 lần sai trong một lần chờ -> hủy, phải đăng nhập lại
  await resetThrottles();
  const brute = new Browser();
  await login(brute, user.email, MFA_PASSWORD);
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    r = await brute.submit("/login/mfa", "/login/mfa", { code: String(100000 + i) });
    statuses.push(r.status === 303 ? r.location : errorCodeOf(r.text));
  }
  check("Giới hạn thử: 4 lần INVALID_MFA_CODE, lần 5 -> 303 /login?mfaFailed=1",
    statuses.slice(0, 4).every((s) => s === "INVALID_MFA_CODE") && statuses[4] === "/login?mfaFailed=1", statuses.join(","));
  r = await brute.post("/login/mfa", { _csrf: csrfOf((await brute.get("/login")).text), code: totpAt(secret, 1) });
  check("Giới hạn thử: sau khi hủy, mã đúng cũng không vào được (phải đăng nhập lại)", r.status === 303 && r.location.startsWith("/login") && !sidOf(r));

  // 6. Thay / tắt MFA cần xác thực lại
  await resetThrottles();
  page = await b.get("/account/security");
  check("Bảo mật: MFA đang bật, còn 9 mã khôi phục", page.text.includes('data-mfa-status="enabled"') && page.text.includes("data-recovery-remaining>9<"));
  r = await b.post("/account/mfa/setup", { _csrf: csrfOf(page.text) });
  check("Thay MFA: không nhập password + mã -> REAUTH_FAILED", errorCodeOf(r.text) === "REAUTH_FAILED" && (await reloadUser()).mfaPendingSecret === null);
  r = await b.post("/account/mfa/disable", { _csrf: csrfOf(page.text), password: "sai-mat-khau", code: recovery[1] });
  check("Tắt MFA: sai password -> REAUTH_FAILED, vẫn bật", errorCodeOf(r.text) === "REAUTH_FAILED" && (await reloadUser()).mfaEnabled);
  check("Tắt MFA: sai password thì mã khôi phục không bị tiêu thụ",
    (await prisma.recoveryCode.count({ where: { userId: user.id, usedAt: null } })) === 9);
  r = await b.post("/account/mfa/disable", { _csrf: csrfOf(page.text), password: MFA_PASSWORD, code: "000000" });
  check("Tắt MFA: password đúng, mã sai -> REAUTH_FAILED, vẫn bật", errorCodeOf(r.text) === "REAUTH_FAILED" && (await reloadUser()).mfaEnabled);
  r = await b.post("/account/mfa/recovery-codes", { _csrf: csrfOf(page.text), password: MFA_PASSWORD, code: recovery[1] });
  const fresh = [...r.text.matchAll(/data-recovery-code>([A-Z0-9-]+)</g)].map((m) => m[1]);
  check("Tạo lại mã khôi phục (xác thực lại) -> 10 mã mới, mã cũ hết hiệu lực",
    fresh.length === 10 && !fresh.includes(recovery[2]) && (await prisma.recoveryCode.count({ where: { userId: user.id } })) === 10);
  r = await b.post("/account/mfa/disable", { _csrf: csrfOf(page.text), password: MFA_PASSWORD, code: fresh[0] });
  db = await reloadUser();
  check("Tắt MFA: password + mã khôi phục đúng -> 303, đã tắt, xóa secret và mã", r.status === 303 && !db.mfaEnabled && db.mfaSecret === null &&
    (await prisma.recoveryCode.count({ where: { userId: user.id } })) === 0);
  r = await login(new Browser(), user.email, MFA_PASSWORD);
  check("Tắt MFA: đăng nhập lại chỉ cần password", r.status === 303 && Boolean(sidOf(r)));
  await resetThrottles();
}

async function codeReview() {
  section("Kiểm tra log và dữ liệu");
  const mails = (await fs.readdir(OUTBOX)).filter((f) => f.endsWith(".html") && f.includes(RUN));
  const secrets = [];
  for (const f of mails) {
    const html = await fs.readFile(path.join(OUTBOX, f), "utf8");
    const otp = otpOf(html);
    const tok = resetTokenOf(html);
    if (otp) secrets.push(otp);
    if (tok) secrets.push(tok);
  }
  const leaked = secrets.filter((s) => serverLog.includes(s));
  check(`log server không chứa OTP / reset token (${secrets.length} giá trị)`, secrets.length > 0 && leaked.length === 0, leaked.join(","));
  check("log server không chứa password hay argon2 hash", !serverLog.includes("$argon2id$") && !serverLog.includes(`mat-khau-${RUN}`));
  const mfaLeaked = mfaSecrets.filter((s) => serverLog.includes(s));
  check(`log server không chứa TOTP secret / mã khôi phục (${mfaSecrets.length} giá trị)`, mfaSecrets.length > 0 && mfaLeaked.length === 0, mfaLeaked.join(","));
}

// ───────────────────────────── chạy ─────────────────────────────

async function main() {
  // Dọn dữ liệu của lần chạy trước (chỉ user @acceptance.test, món có nhãn nghiệm thu) và bộ đếm
  await prisma.user.deleteMany({ where: { email: { endsWith: "@acceptance.test" } } });
  await prisma.dish.deleteMany({ where: { name: { contains: TEST_DISH_TAG } } });
  await resetThrottles();
  await fakeGoogle.start();
  await startServer();
  try {
    const account = await registrationAndActivation();
    await captchaAndBruteForce(account);
    await loginLogoutCrud(account);
    await forgotAndReset(account);
    await searchAndPaging({ ...account, password: `mat-khau-moi-${RUN}` });
    const accounts = await createRoleAccounts();
    await rbacAndAbac(accounts);
    await mfaFlow(accounts);
    await codeReview();
  } finally {
    await prisma.dish.deleteMany({ where: { name: { contains: TEST_DISH_TAG } } });
    await stopServer();
    fakeGoogle.server.close();
    await resetThrottles();
    await prisma.$disconnect();
  }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => {
  console.error(err);
  await stopServer();
  process.exitCode = 1;
});
