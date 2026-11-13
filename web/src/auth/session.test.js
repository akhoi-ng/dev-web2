import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "./session.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

const base = { baseUrl: "http://api", channel: null, locks: null, setTimer: () => 1, clearTimer: () => {} };

test("access token chỉ nằm trong bộ nhớ; Storage chỉ có cờ gợi ý, không có token", () => {
  const storage = memoryStorage();
  const s = createSession({ ...base, fetchImpl: async () => json({}), storage });
  s.set({ accessToken: "eyJ.secret.sig", expiresIn: 900 });
  assert.equal(s.getToken(), "eyJ.secret.sig");
  assert.deepEqual([...storage.m.entries()], [["lua-hong:signed-in", "1"]]);
});

test("refresh: một request cho nhiều lời gọi đồng thời, gửi cookie (credentials include)", async () => {
  let calls = 0;
  let init;
  const s = createSession({
    ...base,
    storage: memoryStorage(),
    fetchImpl: async (url, i) => {
      calls++;
      init = i;
      return json({ ok: true, data: { accessToken: "new", expiresIn: 900 } });
    },
  });
  const results = await Promise.all([s.refresh(), s.refresh(), s.refresh()]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(calls, 1);
  assert.equal(init.credentials, "include");
  assert.equal(s.getToken(), "new");
});

test("refresh dùng Web Locks khi có (tuần tự giữa các tab)", async () => {
  const names = [];
  const locks = {
    request: (name, fn) => {
      names.push(name);
      return fn();
    },
  };
  const s = createSession({
    ...base,
    locks,
    storage: memoryStorage(),
    fetchImpl: async () => json({ ok: true, data: { accessToken: "x", expiresIn: 900 } }),
  });
  await s.refresh();
  assert.deepEqual(names, ["lua-hong:refresh"]);
});

test("refresh 401: xóa token và cờ; 500: không xóa", async () => {
  const storage = memoryStorage();
  let status = 500;
  const s = createSession({ ...base, storage, fetchImpl: async () => json({ ok: false, error: { code: "X" } }, status) });
  s.set({ accessToken: "old", expiresIn: 900 });
  assert.equal(await s.refresh(), false);
  assert.equal(s.getToken(), "old");
  status = 401;
  assert.equal(await s.refresh(), false);
  assert.equal(s.getToken(), null);
  assert.equal(storage.getItem("lua-hong:signed-in"), null);
});

test("restore: không có cờ thì không gọi refresh", async () => {
  let calls = 0;
  const s = createSession({
    ...base,
    storage: memoryStorage(),
    fetchImpl: async () => {
      calls++;
      return json({});
    },
  });
  assert.equal(await s.restore(), false);
  assert.equal(calls, 0);
});

test("expire phát expired khi đang có token; logout gọi /api/auth/logout và phát logout", async () => {
  const events = [];
  const urls = [];
  const s = createSession({
    ...base,
    storage: memoryStorage(),
    fetchImpl: async (u) => {
      urls.push(u);
      return json({ ok: true, data: {} });
    },
  });
  s.subscribe((e) => events.push(e));
  s.set({ accessToken: "a", expiresIn: 900 });
  s.expire();
  s.expire(); // không còn token -> không phát lại
  await s.logout();
  assert.deepEqual(events, ["token", "expired", "logout"]);
  assert.deepEqual(urls, ["http://api/api/auth/logout"]);
});
