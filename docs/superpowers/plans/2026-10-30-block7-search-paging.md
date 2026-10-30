# Block 7 — Search and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (the user forbids subagents — execute inline, task by task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed 1,500 dishes, add four server-side search modes (basic/advanced/fulltext/fuzzy) to `GET /api/dishes`, give the customer menu three paging views and both menu and admin a search form, and rewrite the README as the Block 7 report.

**Architecture:** Approach A from the spec — basic/advanced extend the existing Prisma `where`; fulltext/fuzzy run parameterized `$queryRaw` for ranked ids + count, then Prisma loads rows. The SPA keeps all search state in the URL; Load More / infinite scroll accumulate server pages locally, keyed by the search.

**Tech Stack:** Express 4 + Prisma 6 + PostgreSQL (Supabase, `pg_trgm`), React 18 + React Router 6 + Tailwind, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-30-block7-search-paging-design.md`

## Global Constraints

- Node/npm: in Bash prefix with `export PATH="/c/Users/Harkone/miniconda3/envs/web:/c/Users/Harkone/miniconda3/envs/web/Scripts:$PATH"`.
- Response contract unchanged: business errors HTTP 200 `{ ok: false, error: { code, message, fields } }`; `meta` = `{ page, totalPages, total, pageSize }` (+ new `mode`).
- No user input concatenated into SQL — only `Prisma.sql` / tagged-template parameters.
- Full-text config `simple` for both document and query; document = `name || ' ' || coalesce(description, '')`.
- Fuzzy: `word_similarity(q, name) >= 0.3`; ranked modes order by score desc, `id` asc.
- `available=false` and `minPrice=0` are real criteria; empty/missing = no criterion.
- Seed: exactly 1,500 dishes; deterministic; includes names with literal `%` and `_`.
- Vietnamese comments and UI copy, matching surrounding code.
- Mode keys/labels: `basic` Cơ bản, `advanced` Nâng cao, `fulltext` Toàn văn, `fuzzy` Gần đúng.
- Menu views: `pages` (default) Số trang, `more` Tải thêm, `scroll` Cuộn vô hạn. Menu page size 9, admin 10.
- Supabase may be written (user approved `db:push`, `db:search`, `db:seed`).

## Review Focus

1. User types `%`, `_` or `\` in `q` or `ingredient` → matched literally, never "everything" (Task 1, Task 3 tests).
2. Filter changes while a Load More request is in flight → the late response is dropped, lists never mix (Task 8 `applyPage` stale-key test).
3. Full-text `q` of only punctuation (`!!!`) → `ok: true`, `total: 0`, not a 500 (Task 4 acceptance row).
4. URL with leftover advanced params but `mode=basic` (e.g. `minPrice=abc`) → ignored, not `VALIDATION_FAILED` (Task 2 test).
5. Ranked mode with `page` beyond the last page → clamped to last page like basic, and `total` equals the sum of items across pages (Task 4 acceptance rows).

---

### Task 1: Fix literal `%`/`_` in name search (slide 41 bug, before/after evidence)

Prisma's `contains` does not escape LIKE wildcards: today `GET /api/dishes?q=%25` returns all 51 dishes. This is the bug the README reports.

**Files:**
- Modify: `api/src/utils/helpers.js` (add `escapeLike`), `api/src/routes/dishes.js` (use it)
- Modify: `api/scripts/acceptance.mjs` (rows)
- Test: `api/test/helpers.test.js`
- Create: `evidence/bug-like-wildcard.md`

**Interfaces:**
- Produces: `escapeLike(text: string): string` — escapes `\` → `\\`, `%` → `\%`, `_` → `\_` (PostgreSQL's default LIKE escape is backslash; Prisma wraps the value in `%…%`).

- [ ] **Step 1:** Add acceptance rows in `dishesRows()` after "list q[] và category lạ":
  - `"dishes: q=% là ký tự thường"` path `/api/dishes?q=%25&page=1` → `ok: true`, test `j.meta.total < allTotal` where `allTotal` is `meta.total` from `/api/dishes?page=1` fetched first.
  - `"dishes: q=_ là ký tự thường"` same with `%5F`.
- [ ] **Step 2:** Start API (`npm run dev` in `api/`, background) and run `npm run acceptance`. Expected: the two new rows FAIL (`total 51`). Save the request URLs, the failing output and a `curl -s "http://localhost:3000/api/dishes?q=%25&page=1&pageSize=1"` response into `evidence/bug-like-wildcard.md` under "Trước khi sửa". Commit acceptance rows + evidence: `test: q=% và q=_ trả toàn bộ món (lỗi, chưa sửa)`.
- [ ] **Step 3:** Write failing unit tests in `api/test/helpers.test.js`:
  ```js
  assert.equal(escapeLike("100%"), "100\\%");
  assert.equal(escapeLike("SQL_"), "SQL\\_");
  assert.equal(escapeLike("a\\b"), "a\\\\b");
  assert.equal(escapeLike("phở"), "phở");
  ```
  Run `npm test` in `api/` → FAIL (`escapeLike is not a function`).
- [ ] **Step 4:** Implement `escapeLike` in helpers, export it; in `dishes.js` use `contains: escapeLike(q)`. Run `npm test` → PASS; rerun acceptance → the two rows PASS. Append "Sau khi sửa" output to the evidence file.
- [ ] **Step 5:** Commit `fix(api): q chứa % hoặc _ được so khớp như ký tự thường`.

### Task 2: Search parameter parsing + options

**Files:**
- Modify: `api/src/utils/validators.js`, `api/src/routes/options.js`
- Test: `api/test/validators.test.js`

**Interfaces:**
- Produces: `SEARCH_MODES = { basic: "Cơ bản", advanced: "Nâng cao", fulltext: "Toàn văn", fuzzy: "Gần đúng" }`
- Produces: `parseDishSearch(query): { fields, search }`, `search = { mode, q, category, minPrice: number|null, maxPrice: number|null, available: boolean|null, ingredient: string }`. Non-advanced modes always get `minPrice/maxPrice/available = null`, `ingredient = ""` and never validate those params.
- Produces: `/api/options` adds `searchModes: [{ key, label }]`.

- [ ] **Step 1:** Failing tests (`parseDishSearch`):
  - `{}` → fields `{}`, search `{ mode: "basic", q: "", category: "", minPrice: null, maxPrice: null, available: null, ingredient: "" }`.
  - `{ mode: "advanced", available: "false", minPrice: "0" }` → `available === false`, `minPrice === 0`.
  - `{ mode: "advanced", minPrice: "", maxPrice: "  ", available: "" }` → all `null`, no fields.
  - `{ mode: "advanced", minPrice: "abc" }` → `fields.minPrice === "Giá từ phải là số nguyên không âm."`; `"-1"`, `"1.5"`, `"2147483648"` also fail.
  - `{ mode: "advanced", minPrice: "500", maxPrice: "100" }` → `fields.maxPrice === "Giá đến phải lớn hơn hoặc bằng giá từ."`.
  - `{ mode: "advanced", available: "yes" }` → `fields.available === "Tình trạng chỉ nhận true hoặc false."`.
  - `{ mode: "xyz" }` → `fields.mode === "Kiểu tìm kiếm không hợp lệ."`; `{ mode: "" }` → basic.
  - `{ q: "x".repeat(101) }` → `fields.q === "Từ khóa tối đa 100 ký tự."`; `{ q: ["a","b"] }` → `q === ""`.
  - `{ category: "xyz" }` → `category === ""` (ignored); `{ category: "Khai vị" }` kept.
  - `{ mode: "basic", minPrice: "abc", available: "yes", ingredient: "tỏi" }` → fields `{}`, all advanced fields null/"".
  - `{ mode: "advanced", ingredient: "  Tỏi " }` → `ingredient === "Tỏi"`.
- [ ] **Step 2:** `npm test` → FAIL. Implement; price parse = `/^\d+$/` and `≤ MAX_PRICE`. `npm test` → PASS.
- [ ] **Step 3:** Add `searchModes` to options. Commit `feat(api): đọc và kiểm tra tham số tìm kiếm món`.

### Task 3: Migration, SQL logging, basic/advanced search in the route

**Files:**
- Create: `api/prisma/search.sql` (content exactly as spec §1)
- Modify: `api/package.json` (script `"db:search": "prisma db execute --file prisma/search.sql --schema prisma/schema.prisma"`), `api/src/db/prisma.js` (`LOG_SQL=1` → `new PrismaClient({ log: [{ emit: "stdout", level: "query" }] })`), `api/.env.example` (commented `# LOG_SQL=1`)
- Create: `api/src/db/dish-search.js`
- Modify: `api/src/routes/dishes.js`
- Test: `api/test/dish-search.test.js`

**Interfaces:**
- Consumes: `parseDishSearch`, `escapeLike`.
- Produces: `buildDishWhere(search): object` (Prisma where): `name contains escapeLike(q)` insensitive when `q`; `category`; `price: { gte, lte }` when set; `available` when not null; `ingredients: { some: { ingredient: { name: { contains: escapeLike(ingredient), mode: "insensitive" } } } }` when set.
- Produces: `isRanked(search): boolean` — `(mode === "fulltext" || mode === "fuzzy") && q !== ""`.

- [ ] **Step 1:** Run `npm run db:search` in `api/`. Verify with a node one-liner using `prisma.$queryRaw`: `SELECT extname, extnamespace::regnamespace FROM pg_extension WHERE extname='pg_trgm'`, `SELECT indexname FROM pg_indexes WHERE tablename='dishes'` (both `dishes_fts_idx`, `dishes_name_trgm_idx`), and `SELECT word_similarity('carbonra', 'Mỳ Ý Carbonara')` returns a number. If `word_similarity` is not found, add the extension schema to the call path and note it in README.
- [ ] **Step 2:** Failing tests for `buildDishWhere`: basic `{q:"100%"}` → `where.name.contains === "100\\%"`, no `price`/`available`; advanced with `minPrice: 0, available: false` → `where.price.gte === 0`, `where.available === false`; `ingredient: "tỏi_"` → nested contains `"tỏi\\_"`; basic and advanced with same `q` only → deepEqual where. `isRanked` truth table (fulltext+q true, fulltext+"" false, basic+q false).
- [ ] **Step 3:** Implement; route: `parseDishSearch(req.query)`; non-empty `fields` → `validationFailed(res, fields)`; non-ranked path uses `buildDishWhere`; `meta.mode = search.mode`. Ranked path may temporarily fall through to basic until Task 4. `npm test` → PASS; acceptance → all PASS.
- [ ] **Step 4:** Commit `feat(api): migration pg_trgm + index, tìm kiếm basic/advanced`.

### Task 4: Ranked modes (fulltext, fuzzy)

**Files:**
- Modify: `api/src/db/dish-search.js`, `api/src/routes/dishes.js`, `api/scripts/acceptance.mjs`
- Test: `api/test/dish-search.test.js`

**Interfaces:**
- Produces: `rankedFilterSql(search): Prisma.Sql` — WHERE body (text predicate + optional `AND category = ${category}`).
- Produces: `rankedScoreSql(search): Prisma.Sql` — `ts_rank(<doc>, plainto_tsquery('simple', ${q}))` or `word_similarity(${q}, name)`.
- Produces: `countRanked(prisma, search): Promise<number>`, `rankedIds(prisma, search, { skip, take } | null): Promise<number[]>` (`ORDER BY score DESC, id ASC`, `LIMIT/OFFSET` only when paged).
- Produces: `orderByIds(rows, ids): rows` — reorder Prisma rows to match `ids`.

- [ ] **Step 1:** Failing unit tests: `rankedFilterSql({mode:"fulltext",q:"phở",category:""}).values` deepEqual `["phở"]` and `.sql` contains `plainto_tsquery('simple'`; with category → values `["phở","Khai vị"]`; fuzzy `.sql` contains `word_similarity(` and `>= 0.3`; `orderByIds([{id:2},{id:1},{id:3}], [3,1,2])` → ids `[3,1,2]`.
- [ ] **Step 2:** Implement; route ranked branch: `total = countRanked` → `paginate` → `rankedIds` → `findMany({ where: { id: { in: ids } }, include })` → `orderByIds`. Unpaged: `rankedIds(…, null)`. Count result is BigInt → `Number()`. `npm test` → PASS.
- [ ] **Step 3:** Acceptance rows (run after Task 5's seed, but write now):
  - `fulltext q=phở` → `ok`, `total > 0`, every item's name/description contains "phở" case-insensitively.
  - `fulltext q=!!!` → `ok: true`, `total === 0`.
  - `fuzzy q=carbonra` → `total > 0`, first item name contains "Carbonara".
  - `basic q=phở` vs `advanced q=phở` → identical `data` id lists and `total`.
  - `advanced available=false` → every item `available === false`; `advanced minPrice=0&maxPrice=60000` → every price in range.
  - `advanced minPrice=abc` → `VALIDATION_FAILED`, `fieldsHas: ["minPrice"]`; `mode=xyz` → `fieldsHas: ["mode"]`.
  - `fulltext q=phở&page=99999` → `meta.page === meta.totalPages`.
  - `fuzzy q=carbonra`, pages 1..totalPages with `pageSize=50`: union of ids has size `total` with no duplicates.
- [ ] **Step 4:** Commit `feat(api): tìm kiếm fulltext và fuzzy xếp theo điểm`.

### Task 5: Seed 1,500 dishes

**Files:**
- Create: `api/prisma/catalog.js` (pure data generator)
- Modify: `api/prisma/seed.js` (move existing chefs/ingredients/dishes data into `catalog.js` or import it; switch dishes/recipes to `createMany`)
- Test: `api/test/catalog.test.js`

**Interfaces:**
- Produces: `buildCatalog(): { chefs, ingredients, dishes }` — same shapes as today's seed objects (`chefs`/`ingredients` keyed objects; `dishes[]` with `name, description, price, category, imageUrl, available, chef, recipe: [[ingredientKey, qty]]`).

- [ ] **Step 1:** Failing tests: `dishes.length === 1500`; names unique; at least one name contains `%` and one contains `_`; every `recipe` key exists in `ingredients` and recipe length 1–6 with no duplicate key per dish; every `chef` exists; every category in `DISH_CATEGORIES`; `Object.keys(ingredients).length` between 80 and 120; `buildCatalog()` twice → deepEqual (deterministic); ≥ 10% `available === false`; every price is an integer > 0 and ≤ 2,000,000; descriptions non-empty for generated dishes.
- [ ] **Step 2:** Implement: keep hand-written data; base dishes × variants with mulberry32-style seeded PRNG; descriptions mention main ingredients; images reused per category from the hand-written dishes.
- [ ] **Step 3:** Seed inserts dishes with `createMany`, reads back `{ id, name }`, maps recipes by name, `createMany` for `dishIngredient`. Run `npm run db:seed` → then verify `prisma.dish.count() === 1500`. Run `npm test` and `npm run acceptance` (API running) → all PASS, including Task 4 rows.
- [ ] **Step 4:** Commit `feat(seed): 1.500 món và danh sách nguyên liệu mở rộng`.

### Task 6: Web — search criteria module + SearchForm + admin page

**Files:**
- Create: `web/src/lib/dish-search.js`, `web/src/lib/dish-search.test.js`
- Create: `web/src/components/SearchForm.jsx`, `web/src/components/SearchError.jsx`
- Modify: `web/src/pages/admin/dishes/DishListPage.jsx`

**Interfaces:**
- Produces (`dish-search.js`):
  - `CRITERIA_KEYS = ["mode","q","category","minPrice","maxPrice","available","ingredient","sort"]`
  - `readCriteria(searchParams: URLSearchParams): criteria` — strings, `""` when missing (sort default `"default"`, mode default `"basic"`).
  - `apiQuery(criteria): object` — for the API; drops `minPrice/maxPrice/available/ingredient` unless `mode === "advanced"`, drops empty values and `sort` when ranked (`isRankedCriteria`).
  - `writeParams(criteria, extra = {}): URLSearchParams` — only non-default values, then `extra` (e.g. `page`, `view`).
  - `criteriaKey(criteria): string` — stable JSON of `apiQuery(criteria)`.
  - `isRankedCriteria(criteria): boolean`.
- Produces: `<SearchForm criteria modes categories? onSubmit(next) />` — text + mode select; Nâng cao shows giá từ/đến (`type=number min=0`), tình trạng select (Tất cả/Còn món/Tạm hết → ""/"true"/"false"), nguyên liệu; local input state re-synced from `criteria` on change (as `MenuHero` does).
- Produces: `<SearchError error onClear />` — renders `error.fields` messages + "Xóa bộ lọc".

- [ ] **Step 1:** Failing tests: `readCriteria(new URLSearchParams(""))` defaults; `apiQuery({mode:"basic", minPrice:"5", q:"a", …})` has no `minPrice`; `apiQuery` advanced keeps `available:"false"` and `minPrice:"0"`; `writeParams({mode:"basic", q:"", sort:"default", …}).toString() === ""`; `writeParams(c, {page: 2})` includes `page=2`; `criteriaKey` equal for criteria differing only in ignored fields; ranked + q drops `sort`. Run `npm test` in `web/` → FAIL, implement → PASS.
- [ ] **Step 2:** Admin page: criteria from URL; `dishesApi.list({ ...apiQuery(c), page, pageSize: 10 })`; submit / sort change → `setSearchParams(writeParams(next))` (page reset); Pagination `hrefFor` keeps criteria; sort select replaced by "Sắp xếp: Độ liên quan" text when ranked; empty-result row says "Không có món phù hợp."; `VALIDATION_FAILED` (ApiError business) → `SearchError` instead of generic error (catch inside the loader or check `state.error` before `DataStatus`).
- [ ] **Step 3:** `npm run build` in `web/` → success. Manual check with API running (`npm run dev` both): `/admin/dishes?mode=advanced&available=false` shows only "Tạm hết"; `?mode=advanced&minPrice=abc` shows the field error; page 2 link keeps criteria.
- [ ] **Step 4:** Commit `feat(web): tìm kiếm 4 chế độ ở trang quản lý món`.

### Task 7: Web — menu search + numbered view

**Files:**
- Modify: `web/src/pages/MenuPage.jsx`, `web/src/pages/menu/MenuHero.jsx` (hero hosts `SearchForm`)

**Interfaces:**
- Consumes: Task 6 module and components.
- Produces: `menuHref(criteria, extra)` in `MenuPage.jsx` built on `writeParams`, path `/dishes`, hash `#thuc-don`; `view` read from URL (`pages|more|scroll`, unknown → `pages`).

- [ ] **Step 1:** Replace the hero's plain search box by `SearchForm`; category pills / sort / "Xóa bộ lọc" go through `menuHref` and reset page; heading shows mode label when `q` set ("Kết quả Toàn văn cho “phở”").
- [ ] **Step 2:** `npm run build` → success. Manual: `/dishes?mode=fuzzy&q=carbonra` shows Carbonara first; `/dishes?q=%25` shows only `%` dishes; page 3 → Reload stays on page 3 with the same criteria; Back/Forward restore input values.
- [ ] **Step 3:** Commit `feat(web): tìm kiếm 4 chế độ ở thực đơn`.

### Task 8: Web — Load More and infinite scroll

**Files:**
- Create: `web/src/lib/load-more.js`, `web/src/lib/load-more.test.js`
- Create: `web/src/hooks/useLoadMore.js`, `web/src/components/ViewSwitch.jsx`, `web/src/pages/menu/LoadMoreList.jsx`
- Modify: `web/src/pages/MenuPage.jsx`

**Interfaces:**
- Produces (`load-more.js`, pure):
  - `initialList(key): { key, items: [], nextPage: 1, total: null, pending: false, end: false, error: null }`
  - `applyPage(state, key, { items, total, page, pageSize }): state` — returns `state` unchanged when `key !== state.key`; appends items whose `id` is not already present; `nextPage = page + 1`; `end = page * pageSize >= total || items.length === 0`.
  - `canLoad(state): boolean` — `!pending && !end && !error`.
- Produces: `useLoadMore(key, fetchPage(page, signal)) → { items, total, pending, end, error, loadNext, retry }` — resets to `initialList(key)` and aborts in-flight on key change; loads page 1 automatically.
- Produces: `<ViewSwitch view hrefFor(view) />` (segmented links Số trang / Tải thêm / Cuộn vô hạn, `aria-current`).
- Produces: `<LoadMoreList key=… criteria mode="more"|"scroll" />` — grid of `DishCard`; `more` → "Tải thêm" button (disabled while pending, hidden at end, "Đã hiện hết N món" at end); `scroll` → sentinel `div` after the grid observed by `IntersectionObserver` with `rootMargin: "200px 0px"`, calling `loadNext` only when `canLoad`; observer disconnected on cleanup. Later-page error → inline retry under the grid, items kept.

- [ ] **Step 1:** Failing tests: append two pages → 18 items; duplicate id in page 2 appears once; stale key → state unchanged; `end` true when `page*pageSize >= total`; `end` true on empty page; `canLoad` false while pending/end/error. `npm test` → FAIL → implement → PASS.
- [ ] **Step 2:** Implement hook + components; MenuPage renders `ViewSwitch`, then numbered grid (Task 7) for `pages`, `LoadMoreList` keyed by `criteriaKey(c) + view` otherwise. View links reset page. Header count shows `total` from whichever view is active.
- [ ] **Step 3:** `npm run build` → success. Manual: Tải thêm three times → 36 cards, no duplicates; change category while a page is loading → list restarts with the new category only; scroll view loads near the bottom and stops with "Đã hiện hết"; Reload in `more` view starts from first 9.
- [ ] **Step 4:** Commit `feat(web): ba kiểu phân trang thực đơn (số trang, tải thêm, cuộn vô hạn)`.

### Task 9: README — Block 7 report + evidence

**Files:**
- Modify: `README.md`, `evidence/bug-like-wildcard.md`

- [ ] **Step 1:** Rewrite README (keep team table and section style): Block 7 intro; scope table slides 33–42 → where each is met; setup order `db:push` → `db:search` → `db:seed` and why `db:search` follows every `db:push`; migration SQL; seed (1,500 món, deterministic, `%`/`_` names); API search contract (param table, validation messages, mode table); the SQL actually executed per mode, captured with `LOG_SQL=1` while running the acceptance requests; paging (offset formula, clamp, three UIs, state rules, published reopen behavior); routes table updated with new query params; tests/acceptance commands and results.
- [ ] **Step 2:** Section "Trình bày quyết định của nhóm" answering the four slide-41 questions per spec §6, Q4 = the Task 1 bug with its reproduce URL, before/after acceptance output, link to `evidence/bug-like-wildcard.md`.
- [ ] **Step 3:** Section "Bằng chứng nộp" (slide 42): record count query + result, seed command, sample URLs per mode with a trimmed Network response, list of screenshots the team should add in `evidence/`.
- [ ] **Step 4:** Commit `docs: Block 7 README report`.

### Task 10: Final verification

- [ ] `npm test` in `api/` and `web/` → all pass; `npm run build` in `web/` → success; `npm run acceptance` with API running → "Tất cả dòng đều PASS"; `git status` clean. Then superpowers:finishing-a-development-branch.
