const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");
const { ok, fail } = require("../src/http/respond");

const ORIGIN = "http://localhost:5173";

// Khởi động app trên cổng ngẫu nhiên, truyền base URL cho fn rồi đóng server
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

// res giả cho test đơn vị của ok/fail
function fakeRes() {
  return {
    code: null,
    body: null,
    req: { method: "GET", originalUrl: "/x" },
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

test("ok: bọc data, không có khóa meta khi không truyền", () => {
  const res = fakeRes();
  ok(res, [1]);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true, data: [1] });
  assert.equal("meta" in res.body, false);
});

test("ok: có meta khi được truyền", () => {
  const res = fakeRes();
  ok(res, [1], { total: 1 });
  assert.deepEqual(res.body, { ok: true, data: [1], meta: { total: 1 } });
});

test("fail: HTTP 200, ok=false, không có khóa fields khi không truyền", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const res = fakeRes();
  fail(res, "NOT_FOUND", "m");
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: false, error: { code: "NOT_FOUND", message: "m" } });
  assert.equal("fields" in res.body.error, false);
  assert.deepEqual(warn.mock.calls[0].arguments, ["[business]", "NOT_FOUND", "GET", "/x"]);
});

test("unknown /api route → 404 without ok", async () => {
  await withServer(async (base) => {
    const r = await fetch(base + "/api/bok");
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal("ok" in body, false);
    assert.equal(body.message, "Không tìm thấy route");
  });
});

test("POST without JSON content-type → 400", async () => {
  await withServer(async (base) => {
    const r = await fetch(base + "/api/dishes", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x",
    });
    assert.equal(r.status, 400);
    assert.equal("ok" in (await r.json()), false);
  });
});

test("malformed JSON → 400", async () => {
  await withServer(async (base) => {
    const r = await fetch(base + "/api/dishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad",
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal("ok" in body, false);
    assert.equal(body.message, "JSON không hợp lệ");
  });
});

test("preflight from allowed origin → 204 + exact origin", async () => {
  await withServer(async (base) => {
    const r = await fetch(base + "/api/dishes/2", {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(r.headers.get("access-control-allow-methods"), "GET,POST,PATCH,DELETE");
    assert.match(r.headers.get("access-control-allow-headers"), /Content-Type/i);
  });
});

test("other origin gets no allow-origin header", async () => {
  await withServer(async (base) => {
    const r = await fetch(base + "/api/bok", { headers: { Origin: "http://evil.test" } });
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  });
});

test("404 response still carries CORS header", async () => {
  await withServer(async (base) => {
    const r = await fetch(base + "/api/bok", { headers: { Origin: ORIGIN } });
    assert.equal(r.status, 404);
    assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
  });
});
