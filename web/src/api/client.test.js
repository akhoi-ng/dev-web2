import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, ApiError } from "./client.js";

const BASE = "http://localhost:3000";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("ok:true → { data, meta }", async () => {
  const client = createClient(BASE, async () => json({ ok: true, data: [1], meta: { page: 1 } }));
  const result = await client.request("GET", "/api/dishes");
  assert.deepEqual(result, { data: [1], meta: { page: 1 } });
});

test("ok:false → business ApiError", async () => {
  const client = createClient(BASE, async () =>
    json({ ok: false, error: { code: "NOT_FOUND", message: "m" } }),
  );
  await assert.rejects(client.request("GET", "/api/dishes/1"), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.kind, "business");
    assert.equal(err.code, "NOT_FOUND");
    assert.deepEqual(err.fields, {});
    return true;
  });
});

test("404 → http ApiError", async () => {
  const client = createClient(BASE, async () => json({ message: "x" }, 404));
  await assert.rejects(client.request("GET", "/nope"), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.kind, "http");
    assert.equal(err.status, 404);
    return true;
  });
});

test("200 HTML → http ApiError", async () => {
  const client = createClient(
    BASE,
    async () => new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } }),
  );
  await assert.rejects(client.request("GET", "/"), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.kind, "http");
    return true;
  });
});

test("fetch rejects → network ApiError", async () => {
  const client = createClient(BASE, async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(client.request("GET", "/"), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.kind, "network");
    return true;
  });
});

test("AbortError passes through", async () => {
  const client = createClient(BASE, async () => {
    throw new DOMException("x", "AbortError");
  });
  await assert.rejects(client.request("GET", "/"), (err) => {
    assert.ok(!(err instanceof ApiError));
    assert.equal(err.name, "AbortError");
    return true;
  });
});

test("GET sends no Content-Type", async () => {
  let captured;
  const client = createClient(BASE, async (url, init) => {
    captured = init;
    return json({ ok: true, data: null });
  });
  await client.request("GET", "/api/dishes");
  const keys = Object.keys(captured.headers || {}).map((k) => k.toLowerCase());
  assert.ok(!keys.includes("content-type"));
  assert.equal(captured.body, undefined);
});

test("POST sends JSON body + Content-Type", async () => {
  let captured;
  const client = createClient(BASE, async (url, init) => {
    captured = init;
    return json({ ok: true, data: { id: 1 } });
  });
  await client.request("POST", "/api/dishes", { body: { name: "Phở" } });
  assert.equal(captured.method, "POST");
  assert.equal(captured.headers["Content-Type"], "application/json");
  assert.equal(captured.body, JSON.stringify({ name: "Phở" }));
});

test("query skips empty values", async () => {
  let capturedUrl;
  const client = createClient(BASE, async (url) => {
    capturedUrl = String(url);
    return json({ ok: true, data: [] });
  });
  await client.request("GET", "/api/dishes", { query: { q: "", page: 2, x: undefined, y: null } });
  assert.ok(capturedUrl.endsWith("?page=2"), capturedUrl);
});
