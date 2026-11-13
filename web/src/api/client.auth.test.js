import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, ApiError } from "./client.js";

const BASE = "http://localhost:3000";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeAuth({ token = "t1", refreshResult = true, newToken = "t2" } = {}) {
  const calls = { refresh: 0, unauth: 0 };
  let current = token;
  return {
    calls,
    getToken: () => current,
    refresh: async () => {
      calls.refresh++;
      if (refreshResult) current = newToken;
      return refreshResult;
    },
    onUnauthenticated: () => {
      calls.unauth++;
      current = null;
    },
  };
}

test("gắn Authorization: Bearer cho đường dẫn /api/ của API mình", async () => {
  let seen;
  const client = createClient(BASE, async (url, init) => {
    seen = { url, init };
    return json({ ok: true, data: 1 });
  }, fakeAuth());
  await client.request("GET", "/api/chefs");
  assert.equal(seen.url, BASE + "/api/chefs");
  assert.equal(seen.init.headers.Authorization, "Bearer t1");
  assert.equal(seen.init.credentials, undefined);
});

test("URL tuyệt đối hoặc //domain khác: từ chối, không gửi request", async () => {
  let called = false;
  const client = createClient(BASE, async () => {
    called = true;
    return json({ ok: true, data: 1 });
  }, fakeAuth());
  await assert.rejects(client.request("GET", "https://evil.example/api/x"));
  await assert.rejects(client.request("GET", "//evil.example/api/x"));
  assert.equal(called, false);
});

test("anonymous: không gắn Bearer", async () => {
  let headers;
  const client = createClient(BASE, async (url, init) => {
    headers = init.headers;
    return json({ ok: true, data: 1 });
  }, fakeAuth());
  await client.request("POST", "/api/auth/login", { body: {}, anonymous: true, credentials: "include" });
  assert.equal(headers.Authorization, undefined);
});

test("401 TOKEN_EXPIRED: refresh một lần rồi gửi lại với token mới", async () => {
  const auth = fakeAuth();
  const sent = [];
  const client = createClient(BASE, async (url, init) => {
    sent.push(init.headers.Authorization);
    if (init.headers.Authorization === "Bearer t1") return json({ ok: false, error: { code: "TOKEN_EXPIRED" } }, 401);
    return json({ ok: true, data: "x" });
  }, auth);
  const r = await client.request("PATCH", "/api/dishes/1", { body: { price: 1 } });
  assert.equal(r.data, "x");
  assert.deepEqual(sent, ["Bearer t1", "Bearer t2"]);
  assert.equal(auth.calls.refresh, 1);
  assert.equal(auth.calls.unauth, 0);
});

test("401 và refresh thất bại: xóa token (onUnauthenticated), ném ApiError 401 có code", async () => {
  const auth = fakeAuth({ refreshResult: false });
  const client = createClient(BASE, async () => json({ ok: false, error: { code: "UNAUTHENTICATED", message: "m" } }, 401), auth);
  await assert.rejects(client.request("DELETE", "/api/dishes/1"), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.kind, "http");
    assert.equal(err.status, 401);
    assert.equal(err.code, "UNAUTHENTICATED");
    return true;
  });
  assert.equal(auth.calls.unauth, 1);
  assert.equal(auth.getToken(), null);
});

test("403: không refresh, không xóa token", async () => {
  const auth = fakeAuth();
  const client = createClient(BASE, async () => json({ ok: false, error: { code: "FORBIDDEN" } }, 403), auth);
  await assert.rejects(client.request("DELETE", "/api/dishes/1"), (err) => err.status === 403 && err.code === "FORBIDDEN");
  assert.equal(auth.calls.refresh, 0);
  assert.equal(auth.calls.unauth, 0);
  assert.equal(auth.getToken(), "t1");
});

test("500 và lỗi mạng: không bị coi là đăng xuất", async () => {
  const auth = fakeAuth();
  let client = createClient(BASE, async () => json({ message: "x" }, 500), auth);
  await assert.rejects(client.request("GET", "/api/chefs"), (err) => err.status === 500);
  client = createClient(BASE, async () => {
    throw new TypeError("Failed to fetch");
  }, auth);
  await assert.rejects(client.request("GET", "/api/chefs"), (err) => err.kind === "network");
  assert.equal(auth.calls.unauth, 0);
  assert.equal(auth.getToken(), "t1");
});

test("429: ApiError có code RATE_LIMITED và retryAfterSec", async () => {
  const client = createClient(BASE, async () =>
    json({ ok: false, error: { code: "RATE_LIMITED", message: "m", retryAfterSec: 120 } }, 429), fakeAuth());
  await assert.rejects(client.request("POST", "/api/auth/forgot", { body: {}, anonymous: true }), (err) => {
    assert.equal(err.status, 429);
    assert.equal(err.code, "RATE_LIMITED");
    assert.equal(err.retryAfterSec, 120);
    return true;
  });
});

test("INVALID_CREDENTIALS mang cờ captchaRequired", async () => {
  const client = createClient(BASE, async () =>
    json({ ok: false, error: { code: "INVALID_CREDENTIALS", message: "m", captchaRequired: true } }), fakeAuth());
  await assert.rejects(client.request("POST", "/api/auth/login", { body: {}, anonymous: true }), (err) => {
    assert.equal(err.kind, "business");
    assert.equal(err.captchaRequired, true);
    return true;
  });
});
