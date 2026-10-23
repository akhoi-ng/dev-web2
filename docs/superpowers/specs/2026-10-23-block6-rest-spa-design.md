# Block 6 — REST API + SPA for "Lửa Hồng" (design)

Date: 2026-10-23 · Branch: `Block-6` (starts identical to `Block-5`)

## Intent

Block 6's assignment ("REST API và SPA", slides 41–52) asks for the restaurant app split into two
independent applications: a backend that only returns JSON over a uniform response shape, and a
browser SPA on a different origin that calls it. The team already has a complete Block 5 app
(Express + EJS + Prisma on Supabase, server-rendered). The goal is to **reuse Block 5 as the frame**:
same database, schema, seed, validation rules, feature set and visual design, but re-architected as
REST API + SPA so that every Block 6 acceptance criterion is met and demonstrable.

Success = every row of the deck's acceptance checklists (slides 49–52) can be shown with a concrete
request or screen, and the SPA looks and behaves like the Block 5 app.

## Goals

- `api/`: REST API for dishes, chefs, ingredients (+ the Block 5 extras below), JSON only.
- `web/`: React SPA (Vite + React Router), client-side routing, one API-client layer.
- Keep **all Block 5 extras** (user's decision): chef↔dish relation, dish recipe (ingredients +
  quantity), category filter, sort, pagination, bookings (public + admin), About page, menu stats.
- Block 6 README report in the same style/structure as the Block 5 README.

## Non-goals

- Authentication / authorization (deck: admin API has no auth in this block).
- Caching, optimistic updates, global state stores, API versioning.
- Schema changes. `prisma/schema.prisma` and `prisma/seed.js` stay as they are.

## Anti-goals (would fail acceptance even if it "works")

- Returning 404 for a missing record, or wrapping DB/system errors as `ok: false`.
- `Access-Control-Allow-Origin: *`.
- SPA that checks only HTTP status (business errors shown as success).
- A global store (Redux/Context/shared service) holding lists; pages passing records to each other.
- `dangerouslySetInnerHTML` / raw HTML from API data; secrets in `VITE_` env vars.
- Any GET route that writes; writes that use anything other than POST/PATCH/DELETE.
- Server-side rendering framework for the SPA.

## Constraints

- Stack decided by the user: **React + Vite + React Router** for `web/`.
- Backend stays Express 4 + Prisma 6 + PostgreSQL (Supabase); `.env` never committed.
- API on `http://localhost:3000`, SPA on `http://localhost:5173` (two origins).
- Node.js is **not currently on PATH** in this environment; the user must install Node 18+ (or point
  to it) before anything can be run or verified.

---

## Repository layout (builder's call, matches deck slide 42 "api là BE, web là FE")

```
api/                 ← moved from repo root with `git mv` (src/, prisma/, package.json, .env.example)
  src/app.js, server.js, db/prisma.js
  src/http/respond.js       ok()/fail() helpers, the single place that builds the response shape
  src/http/cors.js          CORS config from env
  src/routes/*.js           dishes, chefs, ingredients, bookings, admin-bookings, stats, options
  src/utils/helpers.js, validators.js
  test/validators.test.js   node:test unit tests (no extra deps)
  scripts/acceptance.mjs    runs every row of the REST table against a running API
  requests.http             same requests for VS Code REST Client / IDE HTTP client
web/                 ← new Vite React app
docs/superpowers/specs/     this file
README.md                   rewritten as the Block 6 report
```

`views/`, `ejs`, `method-override` are removed (Block 5 remains on branch `Block-5`).
Root `.env` moves to `api/.env` (user does this locally; it is gitignored). `.gitignore` covers
`node_modules/`, `.env`, `dist/` in both folders. Block 5 `evidence/` files are removed from this
branch (they stay on `Block-5`); new Block 6 evidence is captured by the team.

---

## API design

### Response shape (every response produced by a handler)

```json
{ "ok": true,  "data": <record | array | null>, "meta": { ... } }     // meta only on paged lists
{ "ok": false, "error": { "code": "NOT_FOUND" | "VALIDATION_FAILED",
                          "message": "<for developers/logs>",
                          "fields": { "<field>": "<message>" } } }    // fields only for VALIDATION_FAILED
```

Built only via `ok(res, data, meta)` / `fail(res, code, message, fields)` in `src/http/respond.js`.
Business errors are logged with their `error.code` (deck trade-off note, slide 13).

### Status rules (deck slides 12–19)

| Case | Status | Body |
| --- | --- | --- |
| Success, including empty list | 200 | `ok: true` |
| Invalid/missing id (`abc`, `999`) | 200 | `ok: false`, `NOT_FOUND` |
| Invalid input | 200 | `ok: false`, `VALIDATION_FAILED` + `fields` |
| No route matches under `/api` | 404 | `{ "message": "..." }`, **no `ok`** |
| POST/PATCH without `Content-Type: application/json`, or malformed JSON | 400 | `{ "message": "..." }`, no `ok` |
| Unexpected error (DB down, bug) | 500 | `{ "message": "..." }`, no `ok`; error logged server-side only |

Handlers only catch *known* business cases (Prisma `P2025` → `NOT_FOUND`); everything else goes to
the global 500 handler. Ids are parsed with `parseId()` before touching the DB. Writes only use the
fields produced by the validator, never `req.body` directly. All writes are awaited before responding.

### Validation (port of Block 5 validators, JSON-typed)

Validators keep Block 5's rules and messages but:
- read JSON values with types enforced: `price` must be a JSON integer ≥ 0 and ≤ 2147483647 (string
  `"50000"` → `VALIDATION_FAILED`), `available` boolean, `chefId` integer or `null`,
  `quantity` number > 0 and ≤ 100000;
- return `fields` (`{ name: "...", price: "..." }`) instead of a flat error list. Field keys match
  the SPA input names. Recipe errors use `ingredients` (general) and `ingredients.<ingredientId>`
  (per row);
- support **partial mode for PATCH**: only fields present in the body are validated and written;
  POST requires all required fields. (The SPA edit forms still send every field.)
- unknown body keys are ignored.

### Endpoints

Resources (deck table, slide 44) — identical pattern for `dishes`, `chefs`, `ingredients`:

| Operation | Request | Success `data` | Business errors |
| --- | --- | --- | --- |
| List | `GET /api/<res>` | array (may be empty) | — |
| Detail | `GET /api/<res>/:id` | record | `NOT_FOUND` |
| Create | `POST /api/<res>` | created record (with `id`) | `VALIDATION_FAILED` |
| Update | `PATCH /api/<res>/:id` | updated record | `VALIDATION_FAILED`, `NOT_FOUND` |
| Delete | `DELETE /api/<res>/:id` | `null` | `NOT_FOUND` |

List query params:
- all lists: `page` (positive int) and `pageSize` (1–50, defaults 9 for dishes / 10 others). When
  `page` is **absent**, the full list is returned (used by About page and form dropdowns). When
  present, `meta: { page, totalPages, total, pageSize }` is added; out-of-range page clamps like
  Block 5's `paginate()`. `data` is always an array.
- `GET /api/dishes`: `q` (name, case-insensitive contains), `category` (must be one of the 5
  categories, otherwise ignored), `sort` (`default|newest|price-asc|price-desc|name-asc`).
  Each dish includes `chef` and `_count.ingredients`.
- `GET /api/chefs` / `GET /api/ingredients`: each item includes `_count.dishes`.

Details: dish includes `chef` and `ingredients[]` (`{ ingredientId, quantity, ingredient }`, sorted
by ingredient name); chef includes `dishes[]`; ingredient includes `dishes[]` with `dish`.

Dish write body: `{ name, description, price, category, imageUrl, available, chefId,
ingredients: [{ ingredientId, quantity }] }`. On PATCH, sending `ingredients` replaces the whole
recipe (as Block 5). `chefId`/`ingredientId` must exist (checked against DB, as Block 5).
Delete chef → dishes keep existing with `chefId = null`; delete ingredient → recipe rows cascade.

Extras:

| Request | Purpose | Notes |
| --- | --- | --- |
| `GET /api/stats` | menu header numbers + category tiles | `{ dishes, categories, chefs, minPrice, tiles: [{ name, count, imageUrl }] }` |
| `GET /api/options` | shared constants for SPA forms | categories, sorts (key+label), ingredient units, booking slots, max guests, max days, booking statuses |
| `POST /api/bookings` | guest creates booking | returns record incl. random 8-hex `code` |
| `GET /api/bookings/:code` | guest views own booking | non-matching code format or missing → `NOT_FOUND` |
| `GET /api/admin/bookings?show=all` | admin list | default only from today (VN time) |
| `PATCH /api/admin/bookings/:id` | change status | body `{ status }`; invalid → `VALIDATION_FAILED` with `fields.status` |

Admin bookings live under `/api/admin/` because the list exposes phone numbers and is keyed by id,
while guests use the unguessable `code` (same reasoning as Block 5).

### CORS (slides 22–26)

`cors` middleware configured from `CORS_ORIGIN` in `api/.env` (e.g. `http://localhost:5173`, no
trailing slash; comma-separated list allowed). Never `*`. Preflight `OPTIONS` → 204 with
`Access-Control-Allow-Methods: GET,POST,PATCH,DELETE` and `Access-Control-Allow-Headers:
Content-Type`. Mounted before routes so 404/500 responses also carry the header for allowed origins.
The deck's proxy alternative is **not** used (the assignment requires real CORS).

### Middleware order

`cors` → `express.json()` (+ 400 handler for parse errors / missing JSON content type on
POST/PATCH) → `/api` routers → `/api` 404 → global 500.

---

## SPA design (`web/`)

Vite + React 18 + React Router 6 (`createBrowserRouter`), Tailwind CSS 3 via PostCSS with the Block 5
brand palette (`brand-*`, `saffron`, `cream`, `ink`) and Be Vietnam Pro font, so the UI matches
Block 5. `web/.env.example`: `VITE_API_URL=http://localhost:3000` (public, not secret).

### API client (`src/api/client.js`) — the only place that calls `fetch`

- Base URL from `import.meta.env.VITE_API_URL`; sets `Content-Type: application/json` **only when
  there is a body** (so GET has no preflight).
- Three error layers (slide 28) → throws `ApiError` with `kind`:
  1. `network` — fetch rejected (API down, CORS blocked);
  2. `http` — non-2xx status, or response not JSON (e.g. fallback HTML);
  3. `business` — `ok: false`; carries `code`, `fields`.
- Returns `{ data, meta }` on success. Accepts an `AbortSignal`.
- Thin per-resource functions (`dishesApi.list(params)`, `.get(id)`, `.create(body)`, …).

### Loading data

A `useApiData(loader, deps)` hook used by every page: aborts the previous request when deps change
(stale-response fix, slide 32), exposes `status ∈ loading | ok | notFound | error`, `data`, `meta`,
`retry()`. `notFound` comes **only** from `error.code === "NOT_FOUND"`; network/http errors →
`error` state with a generic message + "Thử lại" button. Lists render an explicit empty state.
No global store; each page loads its own data on mount; forms load the record by URL id.

### Routes

| URL | Page | API |
| --- | --- | --- |
| `/` | redirect → `/dishes` | |
| `/dishes?q&category&sort&page` | menu: hero + stats, category tiles, search, filter, sort, pagination, booking CTA | `GET /api/stats`, `GET /api/dishes?...` |
| `/dishes/:id` | dish detail with chef + recipe | `GET /api/dishes/:id` |
| `/about` | restaurant + chefs | `GET /api/chefs`, `GET /api/stats` |
| `/bookings/new` | booking form | `GET /api/options`, `POST /api/bookings` |
| `/bookings/:code` | booking confirmation | `GET /api/bookings/:code` |
| `/admin` | redirect → `/admin/dishes` | |
| `/admin/dishes?sort&page` | table + links to new/show/edit/delete | `GET /api/dishes` |
| `/admin/dishes/new` | form | `GET /api/options`, chefs, ingredients; `POST` |
| `/admin/dishes/:id` | admin detail | `GET /api/dishes/:id` |
| `/admin/dishes/:id/edit` | form prefilled by id | `GET /api/dishes/:id` + options; `PATCH` |
| `/admin/dishes/:id/delete` | confirm page; only its button calls `DELETE` | `GET` then `DELETE` |
| `/admin/chefs…`, `/admin/ingredients…` | same 6 pages each | same pattern |
| `/admin/bookings?show=all` | list + status buttons | `GET`/`PATCH /api/admin/bookings` |
| `*` | SPA "không tìm thấy" page | |

Query state (`q`, `category`, `sort`, `page`, `show`) lives in the URL search params so links are
shareable and Reload works.

### Forms (slides 39, 47)

`preventDefault`, submit button disabled + "Đang lưu…" while pending, values kept in form state.
`VALIDATION_FAILED` → message under each input keyed by `fields`; other errors → a generic banner
above the form. Light HTML constraints (`required`, `type=number`, `min`) for fast feedback; the API
still validates everything. Navigation after success (no document reload): create/edit → admin
detail page; delete → admin list; booking → `/bookings/:code`; booking status change → reload the
admin list data.

### Layout

`Layout` component = port of `header.ejs`/`footer.ejs` (customer vs admin nav, mobile menu using
`<details>`), using `NavLink` for active state. Shared components: `Logo`, `ChefAvatar`,
`Pagination`, `PageHeading`, `FieldError`, `LoadingState`, `ErrorState` (with retry), `NotFound`,
`EmptyState`. Formatting helpers (`formatPrice`, `formatQty`, `formatDateTime`, `formatPhone`) and
`RESTAURANT` branding move to `web/src/lib/`. Images fall back to the default dish image on error.

SPA fallback: Vite dev and `vite preview` already serve `index.html` for deep links; README explains
that a static host needs the same rewrite.

---

## Verification

- `api`: `node --test` unit tests for validators (types, partial PATCH, fields keys, booking rules).
- `api/scripts/acceptance.mjs`: with API running, executes each REST table row for the three
  resources + extras and asserts status / `ok` / `error.code`, plus `/api/bok` → 404 without `ok`,
  preflight `OPTIONS` returns the exact origin, never `*`. Creates and cleans up its own records.
- `api/requests.http`: the same requests for manual demo.
- `web`: `npm run build` must succeed; manual checklist in README for deep-link reload, states
  (stop API → generic error; id 999 → not found), validation display, no document reload on writes.
- The 500 case is demonstrated manually (wrong `DATABASE_URL` or stopped network).

## README (Block 6 report)

Same structure as the Block 5 README: team table (unchanged members), deck goals/requirements →
where met, how to run both apps, tech stack + reasons, structure, response shape & status rules,
full route tables (API + SPA), CORS explanation with preflight, error layers, data flow examples,
acceptance checklist mapping (slides 49–52) with how to verify, evidence list (to be captured by the
team), key code excerpts, extras beyond the spec.

## Left to the builder

Component file breakdown, exact Tailwind classes (follow Block 5 markup), test case selection,
wording of generic error messages, `requests.http` contents.

## Builder's calls (not discussed with the user)

1. `api/` + `web/` folders; views and EJS removed; Block 5 evidence removed from this branch.
2. Pagination kept via `meta` alongside an array `data`; no `page` param → full list.
3. `/api/stats` and `/api/options` endpoints so the SPA doesn't duplicate server constants.
4. Admin bookings under `/api/admin/bookings`, guests under `/api/bookings/:code`.
5. PATCH validates only fields present; `price` as a JSON string is a validation error.
6. `cors` npm package rather than a hand-written middleware.
7. Tailwind 3 via PostCSS (not the CDN) to match Block 5 classes in a real build.
8. Tests: `node:test` validator tests + an acceptance script; no frontend test framework.
