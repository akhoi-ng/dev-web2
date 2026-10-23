# Block 6 REST API + SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Block 5 SSR restaurant app ("Lửa Hồng") into a JSON REST API (`api/`) plus a React SPA (`web/`) on a separate origin, keeping every Block 5 feature.

**Architecture:** `api/` is the Block 5 Express + Prisma project moved into a subfolder; EJS views become JSON handlers that all respond through one `ok()/fail()` helper, with CORS restricted to the SPA origin. `web/` is a Vite + React Router SPA whose pages each load their own data through a single API client that classifies network / HTTP / business errors.

**Tech Stack:** Node 18+, Express 4, Prisma 6, PostgreSQL (Supabase), `cors`; React 18, React Router 6, Vite 5, Tailwind CSS 3; tests with `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-23-block6-rest-spa-design.md`

## Global Constraints

- All work on branch `Block-6`. Never touch `Block-5` or `main`.
- Response shape: success `{ "ok": true, "data": ..., "meta"?: {...} }`; business error `{ "ok": false, "error": { "code", "message", "fields"? } }`. `meta` only on paged lists, `fields` only on `VALIDATION_FAILED`.
- Business errors (`NOT_FOUND`, `VALIDATION_FAILED`) → status **200**. Unknown route → **404**, malformed JSON / POST-PATCH without `application/json` → **400**, unexpected error → **500**; these three bodies are `{ "message": "..." }` with **no `ok`**.
- CORS origin from `CORS_ORIGIN` env (comma-separated, no trailing slash). Never `*`. Preflight → 204, methods `GET,POST,PATCH,DELETE`, headers `Content-Type`.
- API port 3000, SPA port 5173. SPA reads only `VITE_API_URL` (public).
- Validators write only validated fields; `price` must be a JSON integer 0…2147483647; `quantity` number in (0, 100000].
- SPA: no global store, no `dangerouslySetInnerHTML`, `fetch` only inside `web/src/api/client.js`, `Content-Type` only when a body is sent.
- UI text in Vietnamese, matching Block 5 wording and Tailwind look (brand palette, Be Vietnam Pro).
- `prisma/schema.prisma` and `prisma/seed.js` are not modified.

## Review Focus

- Non-object JSON body (`[]`, `"x"`, `null`) on POST/PATCH → treated as an empty object → `VALIDATION_FAILED` (POST) — never 500. Test: Task 2 app test + Task 3 validator test.
- Junk list params (`?page=abc`, `?page=-1`, `?pageSize=9999`, `?q[]=x`, `?category=xyz`) → fall back to defaults, never 500. Test: Task 3 `pageParams` test; Task 4 acceptance rows.
- Fast navigation between ids/filters → older response must not overwrite newer. Test: Task 7 client test that an aborted request rejects with `AbortError` (not `ApiError`); `useApiData` aborts on deps change.
- Deleting a chef who has dishes → dishes stay, `chef: null`, dish pages render "Chưa phân công". Test: Task 5 acceptance row.
- Double-click submit → exactly one request. Covered by `useSubmit` guarding `pending` (Task 7) and checked manually in Task 12.

---

## Task 0: Prerequisites (human)

- [ ] Node 18+ available: `node --version` prints `v18` or higher in both Bash and PowerShell. **If not, stop and ask the user.**
- [ ] After Task 1, the user copies the root `.env` to `api/.env` and adds `CORS_ORIGIN=http://localhost:5173`. The executor never reads or prints `.env` values.

---

### Task 1: Move the project into `api/` and strip SSR

**Files:**
- Move (`git mv`): `src/` → `api/src/`, `prisma/` → `api/prisma/`, `package.json` → `api/package.json`, `package-lock.json` → `api/package-lock.json`, `.env.example` → `api/.env.example`
- Delete: `views/`, `evidence/*` (Block 5 evidence), `api/src/routes/admin/`, `api/src/routes/about.js`, root `node_modules/` (untracked; reinstall inside `api/`)
- Modify: `api/package.json`, `api/.env.example`, `.gitignore`

- [ ] **Step 1:** `git mv` the files listed above. Delete `views/` and `evidence/` with `git rm -r`.
- [ ] **Step 2:** `api/package.json`: name `restaurant-api`, description `Lửa Hồng - REST API (Express + Prisma)`; remove `ejs`, `method-override`; add `cors@^2.8.5`; add script `"test": "node --test test/"` and `"acceptance": "node scripts/acceptance.mjs"`.
- [ ] **Step 3:** `api/.env.example` gains:
  ```
  # Origin của SPA được phép gọi API (không có dấu / ở cuối; nhiều origin cách nhau bằng dấu phẩy)
  CORS_ORIGIN=http://localhost:5173
  ```
- [ ] **Step 4:** Root `.gitignore`: `node_modules/`, `.env`, `dist/` (patterns apply in subfolders).
- [ ] **Step 5:** `cd api && npm install` → exits 0 and runs `prisma generate`.
- [ ] **Step 6:** Commit: `git commit -m "refactor: move Block 5 app into api/ and drop SSR views"`. (`api/src/app.js` still references removed routers; it is rewritten in Task 2 — the commit is a pure move.)

---

### Task 2: HTTP layer — response helpers, CORS, error handling, `createApp`

**Files:**
- Create: `api/src/http/respond.js`, `api/src/http/cors.js`
- Rewrite: `api/src/app.js`, `api/src/server.js`
- Test: `api/test/app.test.js`

**Interfaces:**
- Produces:
  - `ok(res, data, meta?)` → `200 { ok: true, data, meta? }`
  - `fail(res, code, message, fields?)` → logs `console.warn("[business]", code, res.req.method, res.req.originalUrl)`; `200 { ok: false, error: { code, message, fields? } }`
  - `notFound(res, label)` → `fail(res, "NOT_FOUND", \`${label} không tồn tại\`)`
  - `validationFailed(res, fields)` → `fail(res, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", fields)`
  - `requireJson` middleware: POST/PATCH whose `req.is("application/json")` is falsy → `400 { message: "Body phải là JSON (Content-Type: application/json)" }`
  - `routeNotFound` → `404 { message: "Không tìm thấy route" }`
  - `errorHandler` → body-parser error (`err.type === "entity.parse.failed"`) → `400 { message: "JSON không hợp lệ" }`; else `console.error(err)` + `500 { message: "Lỗi hệ thống" }`
  - `corsMiddleware(originList: string)` in `cors.js` (splits on `,`, trims, drops empties; `cors({ origin: list, methods: [...], allowedHeaders: ["Content-Type"], optionsSuccessStatus: 204 })`)
  - `createApp({ corsOrigin })` exported from `app.js`; order: cors → `express.json()` → `requireJson` → routers mounted under `/api` → `routeNotFound` → `errorHandler`. Routers are registered by later tasks via `app.use("/api/<res>", router)` lines in `createApp`.
  - `server.js`: `require("dotenv").config()`, warns if `CORS_ORIGIN` empty, `createApp({ corsOrigin: process.env.CORS_ORIGIN || "" })`, listens on `PORT || 3000`.

- [ ] **Step 1: Write failing tests** in `api/test/app.test.js`. Helper `withServer(fn)` starts `createApp({ corsOrigin: "http://localhost:5173" })` on port 0 and passes the base URL. Mount a test-only router is NOT needed — use real 404 behaviour:
  ```js
  test("unknown /api route → 404 without ok", async () => {
    const r = await fetch(base + "/api/bok");
    assert.equal(r.status, 404);
    assert.equal("ok" in (await r.json()), false);
  });
  test("POST without JSON content-type → 400", ...)       // body "x", Content-Type text/plain, URL /api/dishes → 400, no ok
  test("malformed JSON → 400", ...)                        // Content-Type application/json, body "{bad" → 400, no ok
  test("preflight from allowed origin → 204 + exact origin", async () => {
    const r = await fetch(base + "/api/dishes/2", { method: "OPTIONS", headers: {
      Origin: "http://localhost:5173", "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "content-type" } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.match(r.headers.get("access-control-allow-methods"), /PATCH/);
    assert.match(r.headers.get("access-control-allow-headers"), /Content-Type/i);
  });
  test("other origin gets no allow-origin header", ...)   // Origin http://evil.test → header null
  test("404 response still carries CORS header", ...)     // GET /api/bok with allowed Origin → header equals origin
  ```
  Plus unit tests of `ok`/`fail` with a fake `res` (`{ status(c){this.code=c;return this}, json(b){this.body=b} , req:{method:"GET",originalUrl:"/x"} }`): `ok(res,[1])` → `{ok:true,data:[1]}` with no `meta` key; `fail(res,"NOT_FOUND","m")` → no `fields` key.
- [ ] **Step 2:** `cd api && npm test` → FAIL (`createApp` not exported).
- [ ] **Step 3:** Implement `respond.js`, `cors.js`, `app.js`, `server.js` per Interfaces.
- [ ] **Step 4:** `npm test` → all pass.
- [ ] **Step 5:** Commit `feat(api): JSON response shape, CORS and error handlers`.

---

### Task 3: Validators and helpers for JSON input

**Files:**
- Modify: `api/src/utils/validators.js`, `api/src/utils/helpers.js`
- Test: `api/test/validators.test.js`, `api/test/helpers.test.js`

**Interfaces:**
- Produces (`helpers.js`, keep existing `asyncHandler`, `parseId`, `paginate`, `isHttpUrl`, `isNotFoundError`, `todayInVietnam`, `TIME_ZONE`, `str`; remove `formatPrice`, `formatQty`, `formatDateTime`, `formatPhone`, `DEFAULT_DISH_IMAGE`, `RESTAURANT`):
  - `asObject(body) → object` — plain object as is, anything else (array, string, null) → `{}`
  - `pageParams(query, defaultSize) → null | { rawPage, pageSize }` — `null` when `query.page` is absent; `pageSize` = `parseId(query.pageSize)` clamped to 1…50, else `defaultSize`
  - `isEmpty(fields) → boolean`
- Produces (`validators.js`; keep constants `DISH_CATEGORIES`, `DISH_SORTS`, `parseDishSort`, `INGREDIENT_UNITS`, `BOOKING_*`; remove `*ToValues`). Every validator returns `{ fields, data }` where `fields` is `{}` when valid:
  - `validateDish(body, { chefs, ingredients, partial = false }) → { fields, data, recipe }` — `recipe` is `[{ ingredientId, quantity }]`, or `undefined` when `partial` and `ingredients` key absent
  - `validateChef(body, { partial = false })`, `validateIngredient(body, { partial = false })`
  - `validateBooking(body, now = new Date())` — field keys `name, phone, guests, date, time, note`; `guests` must be a JSON integer
  - `validateBookingStatus(body) → { fields, data: { status } }`
  - Partial mode: a key absent from the body is neither validated nor present in `data`. Non-partial: required fields missing → required message; `available` absent → `true`; `ingredients` absent → `[]`; `chefId` absent → `null`.
  - Type rules: text fields must be strings (or `null`/absent for optional ones) else `"<Field> phải là chuỗi ký tự."`; Block 5 messages otherwise unchanged. `available` non-boolean → `"Trạng thái phải là true hoặc false."`. Recipe: non-array → `fields.ingredients`; unknown/duplicate id → `fields.ingredients = "Có nguyên liệu không hợp lệ trong công thức."`; bad quantity → `fields["ingredients.<id>"]` with Block 5 text.

- [ ] **Step 1: Write failing tests** (`node:test`, `assert/strict`). Minimum cases:
  ```js
  const chefs = [{ id: 1 }], ingredients = [{ id: 5, name: "Tỏi" }];
  validateDish({ name: "Phở", price: 50000 }, { chefs, ingredients })            // fields {}, data.available true, data.chefId null, recipe []
  validateDish({ name: "Phở", price: "50000" }, ...).fields.price                // "Giá phải là số nguyên không âm (VNĐ)."
  validateDish({ name: " ", price: -1 }, ...).fields                              // has name + price
  validateDish({}, { ..., partial: true })                                        // fields {}, data {}, recipe undefined
  validateDish({ price: 1 }, { ..., partial: true }).data                         // deepEqual { price: 1 }
  validateDish({ name: "A", price: 1, chefId: 9 }, ...).fields.chefId             // "Đầu bếp phụ trách không hợp lệ."
  validateDish({ name: "A", price: 1, ingredients: [{ ingredientId: 5, quantity: 0 }] }, ...).fields["ingredients.5"]  // defined
  validateDish({ name: "A", price: 1, ingredients: [{ ingredientId: 5, quantity: 0.25 }] }, ...).recipe // [{ ingredientId: 5, quantity: 0.25 }]
  validateDish({ name: "A", price: 1, available: "yes" }, ...).fields.available  // defined
  validateDish({ name: "A", price: 1, isAdmin: true }, ...).data.isAdmin          // undefined
  validateChef({ name: "A" }).fields.specialty                                    // "Chuyên môn không được để trống."
  validateIngredient({ name: "Muối", unit: "x".repeat(21) }).fields.unit          // "Đơn vị tính tối đa 20 ký tự."
  validateBooking({ name: "An", phone: "0123 456 789", guests: "2", date: "2026-10-24", time: "18:00" }, new Date("2026-10-23T03:00:00Z")).fields.guests // defined (string)
  validateBooking({ ...same, guests: 2 }, sameNow)                               // fields {}, data.phone "0123456789"
  validateBookingStatus({ status: "done" }).fields.status                         // "Trạng thái không hợp lệ."
  asObject([1]) / asObject(null) / asObject("x")                                 // {}
  pageParams({}, 9) === null; pageParams({ page: "2" }, 9) → { rawPage: "2", pageSize: 9 }
  pageParams({ page: "1", pageSize: "9999" }, 9).pageSize === 50; pageParams({ page: "1", pageSize: "abc" }, 10).pageSize === 10
  ```
- [ ] **Step 2:** `npm test` → new tests FAIL.
- [ ] **Step 3:** Implement per Interfaces (validators call `asObject` first).
- [ ] **Step 4:** `npm test` → all pass.
- [ ] **Step 5:** Commit `feat(api): JSON-typed validators with field errors and partial PATCH`.

---

### Task 4: Dishes, stats and options routes + acceptance script

**Files:**
- Create: `api/src/routes/dishes.js` (replaces old public file), `api/src/routes/stats.js`, `api/src/routes/options.js`, `api/scripts/acceptance.mjs`, `api/requests.http`
- Modify: `api/src/app.js` (mount `/api/dishes`, `/api/stats`, `/api/options`)

**Interfaces:**
- Consumes: Task 2 `ok/notFound/validationFailed`, Task 3 validators + `pageParams/paginate/parseId/isEmpty`.
- Produces endpoints exactly as spec §Endpoints:
  - `GET /api/dishes?q&category&sort&page&pageSize` (default pageSize 9) → items include `chef` and `_count: { ingredients }`; `meta { page, totalPages, total, pageSize }` only when paged. `q`/`category` that are not strings are ignored.
  - `GET /api/dishes/:id` → includes `chef`, `ingredients: [{ ingredientId, quantity, ingredient }]` ordered by ingredient name.
  - `POST /api/dishes` → created dish (same includes as detail). `PATCH /api/dishes/:id` → partial validate; `recipe` defined → `ingredients: { deleteMany: {}, create: recipe }`; returns updated detail. `DELETE` → `data: null`. Missing id (or `parseId` null) → `notFound(res, "Món ăn")`; Prisma `P2025` during update/delete → same.
  - `GET /api/stats` → `{ dishes, categories, chefs, minPrice, tiles: [{ name, count, imageUrl }] }` (logic from Block 5 `routes/dishes.js` lines 40–66).
  - `GET /api/options` → `{ categories, sorts: [{ key, label }], units, booking: { slots, maxGuests, maxDays, statuses, minDate, maxDate } }` (`minDate`/`maxDate` as in Block 5 `bookings.js formOptions`).
- Produces `acceptance.mjs` structure later tasks extend: `const API = process.env.API_URL || "http://localhost:3000"; const ORIGIN = process.env.ORIGIN || "http://localhost:5173";` helper `check(name, { method, path, body, headers }, expect: { status, ok?, code?, fieldsHas?, noOk? , dataIsArray?, dataNull? })` printing `PASS/FAIL name`; exit code 1 if any fail. Each resource section is an `async function dishesRows()` etc., called in order.

- [ ] **Step 1: Write acceptance rows for dishes** (all with `Origin: ORIGIN`): list → 200/ok/array; list `?page=abc` → 200/ok/array + `meta.page === 1`; list `?q[]=x&category=xyz` → 200/ok; detail of created id → ok; detail `999999` → NOT_FOUND; detail `abc` → NOT_FOUND; POST `{ name: "", price: -5 }` → VALIDATION_FAILED with `fields.name` and `fields.price`; POST `{ name: "Test", price: "50000" }` → VALIDATION_FAILED `fields.price`; POST valid → ok, `data.id` number; PATCH `{ price: 60000 }` → ok, `data.price === 60000`; PATCH 999999 → NOT_FOUND; PATCH `{ name: "" }` → VALIDATION_FAILED; DELETE created → ok, `data === null`; DELETE again → NOT_FOUND; `/api/bok` → 404 `noOk`; `/api/stats` → ok; `/api/options` → ok; response header `access-control-allow-origin === ORIGIN` on the list row, never `*`; OPTIONS preflight for PATCH → 204 with exact origin.
- [ ] **Step 2:** Start API (`npm run dev` in `api/`, needs `api/.env`), run `npm run acceptance` → dishes rows FAIL (routes missing).
- [ ] **Step 3:** Implement the three route files and mount them.
- [ ] **Step 4:** `npm run acceptance` → all PASS; `npm test` → still PASS.
- [ ] **Step 5:** Write `api/requests.http` with the same dishes requests (`@api = http://localhost:3000`, `###` separators, `Origin` header).
- [ ] **Step 6:** Commit `feat(api): dishes REST routes, stats, options and acceptance script`.

---

### Task 5: Chefs and ingredients routes

**Files:**
- Create: `api/src/routes/chefs.js`, `api/src/routes/ingredients.js`
- Modify: `api/src/app.js`, `api/scripts/acceptance.mjs`, `api/requests.http`

**Interfaces:**
- Same five operations as dishes (default pageSize 10, order `id asc`). List items include `_count: { dishes }`. Chef detail includes `dishes` (order id asc); ingredient detail includes `dishes: [{ dish, quantity }]`. Labels for `notFound`: `"Đầu bếp"`, `"Nguyên liệu"`.

- [ ] **Step 1:** Acceptance rows for both resources mirroring Task 4 Step 1 (list, detail ok/999999/abc, POST invalid → `fields.name`, POST valid, PATCH ok/NOT_FOUND/invalid, DELETE ok/again NOT_FOUND). Plus the chef-deletion row: create chef → create dish with `chefId` → DELETE chef → GET dish → ok and `data.chef === null` → clean up dish.
- [ ] **Step 2:** Run acceptance → new rows FAIL.
- [ ] **Step 3:** Implement and mount.
- [ ] **Step 4:** Acceptance all PASS.
- [ ] **Step 5:** Add requests to `requests.http`; commit `feat(api): chefs and ingredients REST routes`.

---

### Task 6: Bookings routes

**Files:**
- Create: `api/src/routes/bookings.js` (public), `api/src/routes/admin-bookings.js`
- Modify: `api/src/app.js` (mount `/api/bookings`, `/api/admin/bookings`), `api/scripts/acceptance.mjs`, `api/requests.http`

**Interfaces:**
- `POST /api/bookings` → `validateBooking`; create with random 8-hex code (retry on `P2002` up to 3 tries, Block 5 logic) → booking record.
- `GET /api/bookings/:code` → code must match `/^[0-9a-f]{8}$/` else `notFound(res, "Yêu cầu đặt bàn")`.
- `GET /api/admin/bookings?show=all` → array, default `bookedAt >= start of today (VN)`, order `bookedAt asc, id asc`. No pagination.
- `PATCH /api/admin/bookings/:id` → `validateBookingStatus`; returns updated booking; missing id → NOT_FOUND.

- [ ] **Step 1:** Acceptance rows: POST invalid `{}` → VALIDATION_FAILED with `fields.name`, `fields.phone`; POST valid (date = tomorrow in VN time computed in script, time `"18:00"`, `guests: 2`) → ok, `data.code` matches `/^[0-9a-f]{8}$/`; GET by that code → ok; GET `/api/bookings/zzz` → NOT_FOUND; admin list → array; admin list `?show=all` → array; PATCH status `confirmed` → ok; PATCH `{ status: "x" }` → VALIDATION_FAILED `fields.status`; PATCH 999999 → NOT_FOUND. (Test bookings are left in DB; note in README that seed resets them.)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → all PASS.
- [ ] **Step 5:** Commit `feat(api): bookings REST routes`.

---

### Task 7: SPA scaffold, API client, data hooks, layout

**Files:**
- Create: `web/package.json`, `web/vite.config.js`, `web/index.html`, `web/.env.example`, `web/tailwind.config.js`, `web/postcss.config.js`, `web/src/index.css`, `web/src/main.jsx`, `web/src/router.jsx`
- Create: `web/src/api/client.js`, `web/src/api/index.js`, `web/src/api/client.test.js`
- Create: `web/src/hooks/useApiData.js`, `web/src/hooks/useSubmit.js`
- Create: `web/src/lib/format.js`, `web/src/lib/restaurant.js`
- Create: `web/src/components/Layout.jsx`, `Logo.jsx`, `ChefAvatar.jsx`, `Pagination.jsx`, `PageHeading.jsx`, `FieldError.jsx`, `DataStatus.jsx`, `DishImage.jsx`, `web/src/pages/NotFoundPage.jsx`

**Interfaces:**
- `package.json`: `"type": "module"`; deps `react@^18.3.1`, `react-dom@^18.3.1`, `react-router-dom@^6.28.0`; devDeps `vite@^5.4.0`, `@vitejs/plugin-react@^4.3.0`, `tailwindcss@^3.4.0`, `postcss@^8.4.0`, `autoprefixer@^10.4.0`; scripts `dev`, `build`, `preview`, `"test": "node --test src/"`. `vite.config.js`: `server: { port: 5173, strictPort: true }`, `preview: { port: 5173, strictPort: true }`.
- Tailwind theme colors copied from Block 5 `views/partials/header.ejs` (brand 50–900, saffron, cream, ink); `index.css` holds the Block 5 `<style>` rules (focus outline, summary marker, `.rtable` mobile rules). Font link in `index.html`; `<html lang="vi">`.
- `client.js` (no Vite/browser imports):
  - `export class ApiError extends Error { kind: "network"|"http"|"business"; status?: number; code?: string; fields?: object }`
  - `export function createClient(baseUrl, fetchImpl = globalThis.fetch) → { request(method, path, { query, body, signal } = {}) → Promise<{ data, meta }> }` — query values `undefined`/`""`/`null` are skipped; `Content-Type: application/json` + `JSON.stringify` only when `body !== undefined`; fetch rejection with `name === "AbortError"` is re-thrown unchanged; other rejection → `ApiError("network")`; `!res.ok` → `ApiError("http", status)`; non-JSON or body without boolean `ok` → `ApiError("http", status)`; `ok:false` → `ApiError("business", status, error.code, error.fields || {})`.
- `api/index.js`: `export const api = createClient(import.meta.env.VITE_API_URL)`, and `resource(path)` → `{ list(query, signal), get(id, signal), create(body), update(id, body), remove(id) }`; exports `dishesApi`, `chefsApi`, `ingredientsApi` (= `resource("/api/...")`), `bookingsApi = { create(body), get(code, signal) }`, `adminBookingsApi = { list(query, signal), update(id, body) }`, `getStats(signal)`, `getOptions(signal)`.
- `useApiData(loader: (signal) => Promise<{data, meta}>, deps: any[]) → { status: "loading"|"ok"|"notFound"|"error", data, meta, error, retry() }` — new `AbortController` per run, aborted in effect cleanup; `AbortError` ignored; `ApiError` with `kind === "business" && code === "NOT_FOUND"` → `notFound`; anything else → `error`.
- `useSubmit() → { pending, fieldErrors, formError, submit(action: () => Promise<T>) → Promise<T|null> }` — returns `null` immediately if `pending`; `VALIDATION_FAILED` → `fieldErrors = error.fields`, `formError = "Vui lòng kiểm tra lại các ô được đánh dấu."`; `NOT_FOUND` → `formError = "Bản ghi không còn tồn tại."`; others → `formError = "Không kết nối được máy chủ, vui lòng thử lại."`.
- `DataStatus({ state, notFoundText, children: (data, meta) => node })` — renders `LoadingState` / `ErrorState` (generic message + "Thử lại" button calling `state.retry`) / `NotFoundPanel` / `children`.
- `Layout` = port of `header.ejs` + `footer.ejs` with `<Outlet/>`, admin vs customer by `useLocation().pathname.startsWith("/admin")`, `NavLink` for active links. `Pagination({ page, totalPages, hrefFor })` ports `partials/pagination.ejs`. `DishImage({ src, alt, className })` falls back to `DEFAULT_DISH_IMAGE` on error. `FieldError({ message })` renders `<p class="text-sm text-brand-700">` or nothing.
- `format.js` exports `formatPrice`, `formatQty`, `formatDateTime`, `formatPhone` (bodies from Block 5 `helpers.js`); `restaurant.js` exports `RESTAURANT`, `DEFAULT_DISH_IMAGE`, `TIME_ZONE`.
- `router.jsx`: `createBrowserRouter` with `Layout` root, `/` → `<Navigate to="/dishes" replace/>`, `/admin` → `/admin/dishes`, `*` → `NotFoundPage`. Page routes are added by Tasks 8–11.

- [ ] **Step 1: Write failing `client.test.js`** with a fake `fetchImpl` returning `new Response(...)`:
  ```js
  test("ok:true → { data, meta }")                    // body {ok:true,data:[1],meta:{page:1}} → deepEqual
  test("ok:false → business ApiError")                // {ok:false,error:{code:"NOT_FOUND",message:"m"}} → kind business, code NOT_FOUND, fields {}
  test("404 → http ApiError")                         // status 404 → kind http, status 404
  test("200 HTML → http ApiError")                    // text/html "<!doctype html>" → kind http
  test("fetch rejects → network ApiError")            // fetchImpl throws TypeError → kind network
  test("AbortError passes through")                   // throws DOMException("x","AbortError") → rejects with name "AbortError", not ApiError
  test("GET sends no Content-Type")                   // captured init.headers has no content-type
  test("POST sends JSON body + Content-Type")         // header application/json, body JSON string
  test("query skips empty values")                    // { q: "", page: 2, x: undefined } → URL ends with "?page=2"
  ```
- [ ] **Step 2:** `cd web && npm install && npm test` → FAIL.
- [ ] **Step 3:** Implement scaffold, client, hooks, lib, components, router.
- [ ] **Step 4:** `npm test` → PASS; `npm run build` → exits 0.
- [ ] **Step 5:** Commit `feat(web): Vite React SPA scaffold, API client and layout`.

---

### Task 8: Customer pages — menu, dish detail, about

**Files:**
- Create: `web/src/pages/MenuPage.jsx`, `web/src/pages/DishPage.jsx`, `web/src/pages/AboutPage.jsx`
- Modify: `web/src/router.jsx`

**Interfaces:**
- Consumes: `useApiData`, `DataStatus`, `dishesApi`, `chefsApi`, `getStats`, `getOptions`, `Pagination`, `DishImage`, `format.js`.
- `MenuPage` ports `views/dishes/index.ejs`: state in `useSearchParams` (`q`, `category`, `sort`, `page`); search form `onSubmit` → `setSearchParams` (drops `page`); category chips/tiles and sort `<select>` update params; dish grid with `pageSize: 9`; empty state "Chưa tìm thấy món phù hợp"; booking CTA links to `/bookings/new`. Stats/tiles load independently (their failure shows a small error, not the whole page).
- `DishPage` ports `views/dishes/show.ejs`; id from `useParams`; not found text "Không tìm thấy món ăn"; `chef === null` → "Chưa phân công".
- `AboutPage` ports `views/about.ejs` (read it for markup) using `chefsApi.list()` (all) + `getStats()` for dish count.

- [ ] **Step 1:** Implement the three pages and routes `/dishes`, `/dishes/:id`, `/about`.
- [ ] **Step 2:** `npm run build` → exits 0.
- [ ] **Step 3:** Manual check with API running (`npm run dev` in both folders): `/dishes` lists dishes; search `phở` updates URL `?q=phở`; Reload keeps results; `/dishes/999999` shows not-found page; stop API → menu shows error with "Thử lại"; Network tab "Doc" filter shows no document request when clicking a dish.
- [ ] **Step 4:** Commit `feat(web): menu, dish detail and about pages`.

---

### Task 9: Booking pages (guest + admin)

**Files:**
- Create: `web/src/pages/bookings/NewBookingPage.jsx`, `web/src/pages/bookings/BookingPage.jsx`, `web/src/pages/admin/bookings/AdminBookingsPage.jsx`
- Modify: `web/src/router.jsx`

**Interfaces:**
- `NewBookingPage` ports `views/bookings/new.ejs`; options from `getOptions()`; body `{ name, phone, guests: Number(guests), date, time, note }`; success → `navigate("/bookings/" + data.code)`.
- `BookingPage` ports `views/bookings/show.ejs`, code from URL.
- `AdminBookingsPage` ports `views/admin/bookings/index.ejs`; `show` in search params; status buttons call `adminBookingsApi.update(id, { status })` via `useSubmit`, then `retry()` the list.

- [ ] **Step 1:** Implement pages + routes `/bookings/new`, `/bookings/:code`, `/admin/bookings`.
- [ ] **Step 2:** `npm run build` → 0.
- [ ] **Step 3:** Manual: empty booking form submit (remove `required` via devtools or type spaces in name) shows errors beside fields with values kept; valid booking navigates to the code page; Reload there works; admin confirm changes the badge.
- [ ] **Step 4:** Commit `feat(web): booking pages`.

---

### Task 10: Admin dishes pages

**Files:**
- Create: `web/src/pages/admin/dishes/{DishListPage,DishShowPage,DishNewPage,DishEditPage,DishDeletePage,DishForm}.jsx`
- Modify: `web/src/router.jsx`

**Interfaces:**
- `DishForm({ initialValues, options, chefs, ingredients, submitLabel, onSubmit(body) → Promise })` — controlled string state like Block 5 `values` (`ingredients: { [id]: { selected, quantity } }`); converts to body: `price: values.price === "" ? null : Number(values.price)`, `chefId: values.chefId ? Number(values.chefId) : null`, recipe rows of selected ids `{ ingredientId: Number(id), quantity: q === "" ? null : Number(q.replace(",", ".")) }`; uses `useSubmit` for `pending/fieldErrors/formError`; shows `FieldError` under each input keyed by the API `fields` names (`ingredients.<id>` under its row).
- `dishToValues(dish)` lives in `DishForm.jsx` (port of the removed Block 5 helper).
- New/Edit load chefs + ingredients (`list()` without page) + options; Edit also loads the dish by id (`notFound` → not-found page). Success → `navigate("/admin/dishes/" + data.id)`.
- Delete page loads the dish, shows confirm; only its button calls `dishesApi.remove(id)` → `navigate("/admin/dishes")`.
- List ports `views/admin/dishes/index.ejs` with `sort` + `page` (pageSize 10) in search params.

- [ ] **Step 1:** Implement the six files + routes `/admin/dishes`, `/new`, `/:id`, `/:id/edit`, `/:id/delete` (declare `new` before `:id`).
- [ ] **Step 2:** `npm run build` → 0.
- [ ] **Step 3:** Manual: create dish with empty name (spaces) → field error, values kept; valid create lands on detail without document reload; edit price; delete via confirm page; `/admin/dishes/999999/edit` → not found; double-click "Lưu" sends one POST (Network).
- [ ] **Step 4:** Commit `feat(web): admin dish pages`.

---

### Task 11: Admin chefs and ingredients pages

**Files:**
- Create: `web/src/pages/admin/chefs/{ChefListPage,ChefShowPage,ChefNewPage,ChefEditPage,ChefDeletePage,ChefForm}.jsx`, same six under `web/src/pages/admin/ingredients/` with `Ingredient` prefix
- Modify: `web/src/router.jsx`

**Interfaces:** Same pattern as Task 10, porting the matching `views/admin/chefs/*` and `views/admin/ingredients/*`. Chef delete page warns with the number of dishes that will lose their chef (`data.dishes.length`). Ingredient form uses `options.units` as a `<datalist>` (as Block 5 `_form.ejs`).

- [ ] **Step 1:** Implement + routes. **Step 2:** `npm run build` → 0.
- [ ] **Step 3:** Manual: one create/edit/delete round for each; validation error displayed beside field.
- [ ] **Step 4:** Commit `feat(web): admin chef and ingredient pages`.

---

### Task 12: README report and final verification

**Files:**
- Rewrite: `README.md`
- Create: `web/.env.example` (if not yet), `evidence/.gitkeep`

- [ ] **Step 1:** Write `README.md` (Vietnamese, Block 5 style, sections per spec §README): team table copied from the Block 5 README; deck goals → implementation table; how to run (two terminals: `cd api && npm install && npx prisma db push && npx prisma db seed && npm run dev`; `cd web && npm install && cp .env.example .env && npm run dev`); env tables for both apps; stack + reasons; folder tree; response shape + status table; full API route table and SPA route table; CORS + preflight walkthrough; three error layers; data-flow examples (menu search, dish create with `VALIDATION_FAILED`, delete); acceptance checklist mapping slides 49–52 to code location + how to verify; testing section (`npm test` in both, `npm run acceptance`, `requests.http`); evidence list the team must capture (Network screenshots: preflight OPTIONS, PATCH, VALIDATION_FAILED response, 404 `/api/bok`, deep-link reload, API stopped → generic error); extras beyond the spec; SPA fallback note for static hosting.
- [ ] **Step 2:** Full verification: `cd api && npm test` PASS; API running → `npm run acceptance` all PASS; `cd web && npm test` PASS and `npm run build` exits 0; grep checks — `grep -rn "dangerouslySetInnerHTML\|innerHTML" web/src` → none; `grep -rn "fetch(" web/src --include=*.jsx` → none; `grep -rn "DATABASE_URL" web/ api/src` → none; `grep -rn "'\*'\|\"\*\"" api/src/http` → none.
- [ ] **Step 3:** Commit `docs: Block 6 README report`.
