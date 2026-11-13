// Kiểm thử access token và bước kiểm tra danh tính. Các ca 401 dừng trước khi tra DB nên không cần
// kết nối PostgreSQL; ca token hợp lệ (tải user từ DB) nằm trong scripts/acceptance-auth.mjs.
process.env.JWT_SECRET = "test-jwt-secret-0123456789abcdef0123456789";
process.env.SESSION_SECRET = "test-otp-secret-0123456789abcdef0123456789";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { signAccessToken, verifyAccessToken, bearerToken } = require("../src/auth/tokens");
const { createApp } = require("../src/app");

const ORIGIN = "http://localhost:5173";
const USER = { id: 7, tokenVersion: 0 };
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const parts = (token) => token.split(".");

async function withServer(fn) {
  const app = createApp({ corsOrigin: ORIGIN });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    await fn(`http://localhost:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("access token: payload chỉ có sub, ver, jti, iat, exp, iss, aud; header alg HS256", () => {
  const { accessToken, expiresIn, tokenType } = signAccessToken(USER);
  assert.equal(expiresIn, 900);
  assert.equal(tokenType, "Bearer");
  const [h, p] = parts(accessToken);
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "HS256", typ: "JWT" });
  const payload = JSON.parse(Buffer.from(p, "base64url"));
  assert.deepEqual(Object.keys(payload).sort(), ["aud", "exp", "iat", "iss", "jti", "sub", "ver"]);
  assert.equal(payload.sub, "7");
  assert.equal(payload.exp - payload.iat, 900);
  assert.equal("role" in payload, false);
});

test("verify: token hợp lệ -> userId, ver", () => {
  const { accessToken } = signAccessToken(USER);
  const r = verifyAccessToken(accessToken);
  assert.equal(r.ok, true);
  assert.equal(r.userId, 7);
  assert.equal(r.ver, 0);
});

test("verify: sửa payload (sub 7 -> 1, thêm role admin), giữ chữ ký cũ -> UNAUTHENTICATED", () => {
  const { accessToken } = signAccessToken(USER);
  const [h, p, s] = parts(accessToken);
  const payload = JSON.parse(Buffer.from(p, "base64url"));
  const forged = [h, b64({ ...payload, sub: "1", role: "admin" }), s].join(".");
  assert.deepEqual(verifyAccessToken(forged), { ok: false, code: "UNAUTHENTICATED" });
});

test("verify: quá exp -> TOKEN_EXPIRED; chưa tới exp -> ok", () => {
  const issuedAt = Date.now() - 901 * 1000;
  const { accessToken } = signAccessToken(USER, issuedAt);
  assert.deepEqual(verifyAccessToken(accessToken), { ok: false, code: "TOKEN_EXPIRED" });
  assert.equal(verifyAccessToken(accessToken, issuedAt + 899 * 1000).ok, true);
});

test("verify: token hết hạn VÀ sai chữ ký -> UNAUTHENTICATED (chữ ký kiểm tra trước)", () => {
  const { accessToken } = signAccessToken(USER, Date.now() - 901 * 1000);
  const [h, p] = parts(accessToken);
  assert.equal(verifyAccessToken(`${h}.${p}.${"A".repeat(43)}`).code, "UNAUTHENTICATED");
});

test("verify: alg none bị từ chối (RFC 8725)", () => {
  const now = Math.floor(Date.now() / 1000);
  const none = [
    b64({ alg: "none", typ: "JWT" }),
    b64({ sub: "7", ver: 0, iat: now, exp: now + 900, iss: "lua-hong-api", aud: "lua-hong-web" }),
    "",
  ].join(".");
  assert.deepEqual(verifyAccessToken(none), { ok: false, code: "UNAUTHENTICATED" });
});

test("verify: ký bằng thuật toán khác (HS512, cùng secret) bị từ chối", () => {
  const token = jwt.sign({ ver: 0 }, process.env.JWT_SECRET, {
    algorithm: "HS512",
    subject: "7",
    issuer: "lua-hong-api",
    audience: "lua-hong-web",
    expiresIn: 900,
  });
  assert.equal(verifyAccessToken(token).ok, false);
});

test("verify: secret khác, iss khác, aud khác đều bị từ chối", () => {
  const opts = { algorithm: "HS256", subject: "7", issuer: "lua-hong-api", audience: "lua-hong-web", expiresIn: 900 };
  assert.equal(verifyAccessToken(jwt.sign({ ver: 0 }, crypto.randomBytes(32).toString("hex"), opts)).ok, false);
  assert.equal(verifyAccessToken(jwt.sign({ ver: 0 }, process.env.JWT_SECRET, { ...opts, issuer: "x" })).ok, false);
  assert.equal(verifyAccessToken(jwt.sign({ ver: 0 }, process.env.JWT_SECRET, { ...opts, audience: "x" })).ok, false);
});

test("verify: thiếu ver hoặc sub không phải số -> UNAUTHENTICATED", () => {
  const opts = { algorithm: "HS256", issuer: "lua-hong-api", audience: "lua-hong-web", expiresIn: 900 };
  assert.equal(verifyAccessToken(jwt.sign({}, process.env.JWT_SECRET, { ...opts, subject: "7" })).ok, false);
  assert.equal(verifyAccessToken(jwt.sign({ ver: 0 }, process.env.JWT_SECRET, { ...opts, subject: "abc" })).ok, false);
});

test("bearerToken: chỉ nhận dạng 'Bearer <jwt>'", () => {
  assert.equal(bearerToken("Bearer a.b.c"), "a.b.c");
  assert.equal(bearerToken("bearer a.b.c"), null);
  assert.equal(bearerToken("Basic dXNlcg=="), null);
  assert.equal(bearerToken("Bearer "), null);
  assert.equal(bearerToken(undefined), null);
});

// ─────────────────────────── middleware qua HTTP ───────────────────────────

const json = (body) => ({ "Content-Type": "application/json", Origin: ORIGIN, ...body });

test("ghi dishes / mọi endpoint chefs, ingredients, admin bookings: không token -> 401 UNAUTHENTICATED", async () => {
  await withServer(async (base) => {
    const cases = [
      ["POST", "/api/dishes", { name: "x", price: 1 }],
      ["PATCH", "/api/dishes/1", { price: 2 }],
      ["DELETE", "/api/dishes/1"],
      ["GET", "/api/chefs"],
      ["GET", "/api/chefs/1"],
      ["POST", "/api/ingredients", { name: "x", unit: "kg" }],
      ["GET", "/api/admin/bookings"],
      ["GET", "/api/auth/me"],
    ];
    for (const [method, path, body] of cases) {
      const r = await fetch(base + path, {
        method,
        headers: json(),
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(r.status, 401, `${method} ${path}`);
      assert.equal(r.headers.get("www-authenticate"), "Bearer");
      assert.deepEqual(await r.json(), { ok: false, error: { code: "UNAUTHENTICATED", message: "Cần đăng nhập" } });
    }
  });
});

test("Bearer bị sửa -> 401 UNAUTHENTICATED; hết hạn -> 401 TOKEN_EXPIRED", async () => {
  await withServer(async (base) => {
    const { accessToken } = signAccessToken(USER);
    const [h, p, s] = parts(accessToken);
    const payload = JSON.parse(Buffer.from(p, "base64url"));
    const forged = [h, b64({ ...payload, role: "admin" }), s].join(".");
    let r = await fetch(base + "/api/chefs", { headers: { Authorization: `Bearer ${forged}`, Origin: ORIGIN } });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error.code, "UNAUTHENTICATED");

    const expired = signAccessToken(USER, Date.now() - 1000 * 1000).accessToken;
    r = await fetch(base + "/api/chefs", { headers: { Authorization: `Bearer ${expired}`, Origin: ORIGIN } });
    assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate"), /invalid_token/);
    assert.equal((await r.json()).error.code, "TOKEN_EXPIRED");
  });
});

test("preflight có authorization: 204, origin cụ thể, Allow-Headers chứa authorization", async () => {
  await withServer(async (base) => {
    const r = await fetch(base + "/api/dishes/3", {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
    assert.match(r.headers.get("access-control-allow-headers").toLowerCase(), /authorization/);
    assert.match(r.headers.get("access-control-allow-methods"), /PATCH/);
    assert.equal(r.headers.get("access-control-allow-credentials"), "true");
  });
});

test("preflight từ origin lạ: không có Access-Control-Allow-Origin", async () => {
  await withServer(async (base) => {
    const r = await fetch(base + "/api/dishes/3", {
      method: "OPTIONS",
      headers: { Origin: "http://evil.example", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "authorization" },
    });
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  });
});

test("refresh từ origin lạ -> 403, không chạm DB", async () => {
  await withServer(async (base) => {
    const r = await fetch(base + "/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://evil.example", Cookie: "rt=abc" },
      body: "{}",
    });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error.code, "FORBIDDEN");
  });
});
