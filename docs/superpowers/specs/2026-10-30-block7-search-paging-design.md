# Block 7 — Search and pagination for "Lửa Hồng" (design)

Date: 2026-10-30 · Branch: `Block-7` (already contains all of Block 6 plus README/evidence commits)

## Intent

Block 7's assignment ("Tìm kiếm và phân trang", slides 32–42) asks the restaurant app to work on a
realistically large menu (≥ 1,000 dishes) and to show three pagination UIs, filter/sort applied to a
clearly stated data set, and four server-side search modes (basic, advanced, full-text, fuzzy) backed
by PostgreSQL. The team already has a complete Block 6 app (`api/` Express + Prisma on Supabase,
`web/` React SPA). The goal is to **extend Block 6**, not rebuild it, so that every Block 7
acceptance row (slide 40) and every "Trình bày quyết định của nhóm" question (slide 41) can be shown
with a concrete URL, Network request, or SQL query.

Deck rows this design must satisfy (source: `block7-deck.html`, not in the repo):

- Slide 39 — Số trang: copy URL hoặc Reload giữ điều kiện và trang đang xem · Tìm lại, đổi filter
  hoặc sort: bắt đầu từ phần đầu của kết quả mới · Load More, Infinite Scroll: không trộn kết quả
  của hai lần tìm · Công bố khi mở lại link sẽ tải từ đầu hay khôi phục phần đã xem.
- Slide 40 (nghiệm thu):
  | Thao tác | Kết quả cần chứng minh |
  | --- | --- |
  | Chọn trang, Tải thêm, cuộn tiếp | Ba kiểu UI hoạt động, không mất hoặc lặp món |
  | Đổi filter hoặc sort | Đúng điều kiện, thứ tự và phạm vi đã công bố |
  | Chuyển trang sau khi search | Giữ đúng bộ điều kiện, không trộn kết quả |
  | Xóa điều kiện, Reload, mở lại link | Khôi phục danh sách hoặc lựa chọn như thiết kế |
- Slide 41: (1) Chức năng nào dùng client paging, server paging hoặc AJAX? (2) Filter và sort đặt
  ở đâu, áp dụng cho dữ liệu nào? (3) Network cho thấy tải toàn bộ hay từng phần? (4) Nhóm đã phát
  hiện lỗi nào và chứng minh sửa đúng ra sao?
- Slide 42 (bằng chứng): số bản ghi + script seed ≥ 1.000 món; demo ba kiểu phân trang và
  filter/sort; URL search, Network và query thực hiện tại PostgreSQL; một lỗi đã phát hiện, cách tái
  hiện và bằng chứng sau khi sửa.
- Slides 33–38: ≥ 1.000 món + seed, giữ CRUD; ba kiểu hiển thị; nhóm tự chọn client/server paging
  và tải trang/AJAX; filter category/khoảng giá/còn bán, sort tên/giá; search `basic` (một phần tên,
  không phân biệt hoa/thường), `advanced` (q, category, minPrice, maxPrice, available; AND),
  `fulltext` (tên + mô tả, PostgreSQL full-text, cấu hình `simple` cho cả document và query, xử lý
  NULL), `fuzzy` (`pg_trgm`, ngưỡng 0.3); full-text/fuzzy sắp theo điểm giảm dần, `id` khi bằng điểm.

Success = the team can demo: numbered pages / Load More / infinite scroll on the customer menu, all
four search modes on both the customer menu and the admin dish table, URLs that restore the search
on Reload/Back/Forward/copy-paste, and a README that answers slide 41 and lists slide 42 evidence.

## Goals (user's decisions)

1. **Seed 1,500 dishes** plus an expanded ingredient list and recipes; the seed script recreates them.
   CRUD keeps working.
2. **Customer menu (`/dishes`)**: a switch to change between three paging views —
   numbered pages, "Tải thêm" (Load More), infinite scroll.
3. **Admin dish table (`/admin/dishes`)**: paging stays numbered as today; add search.
4. **Four search modes on both pages**: `basic`, `advanced`, `fulltext`, `fuzzy`. Advanced search
   covers name, price range, availability, ingredient (and category).
5. **Database migration** enabling full-text and fuzzy search (`pg_trgm`, indexes).
6. **README rewritten as the Block 7 report**, including answers to all four slide-41 questions and
   the slide-42 evidence list.

## Non-goals

- Changing paging of chefs, ingredients, bookings admin pages.
- Search on chefs/ingredients/bookings.
- `unaccent` / Vietnamese-specific stemming (full-text uses the `simple` config as the deck requires).
- Keyset/cursor pagination (offset is what the deck teaches; its weakness is explained in README).
- Authentication.

## Anti-goals (would fail acceptance even if it "works")

- User input concatenated into SQL. Every raw query uses Prisma tagged-template parameters.
- `%` or `_` typed by the user widening the match (e.g. `q=100%` must not return every dish).
- `available=false` or `minPrice=0` silently dropped as "empty".
- Load More / infinite scroll mixing items from two different searches, or showing a dish twice.
- `total` counted with a different predicate than the items.
- Sorting/paging applied before the result set is selected.
- Invalid search input returned as HTTP 4xx/5xx (must be HTTP 200, `ok: false`,
  `VALIDATION_FAILED`, per the Block 6 response contract).

## Constraints

- Keep the Block 6 response contract (`{ ok, data, meta? }`, business errors HTTP 200) and the
  existing `meta` shape `{ page, totalPages, total, pageSize }`. Existing callers (acceptance script,
  `GET /api/dishes` without `?page`) keep working.
- Schema is managed with `prisma db push` (no `prisma/migrations`). Supabase via pgbouncer
  (port 6543, prepared statements disabled), direct URL on 5432.
- Node `node:test` for API and web unit tests; `api/scripts/acceptance.mjs` for live checks.
- Code comments and UI text in Vietnamese, matching the existing code.

## Approaches considered

| | Approach | Trade-off |
| --- | --- | --- |
| **A (chosen)** | Prisma `where` for `basic`/`advanced`; parameterized `$queryRaw` for `fulltext`/`fuzzy` returning ranked ids + total, then Prisma `findMany` to load rows with relations, reordered by rank | Two code paths, but reuses the existing Prisma query/include code; every mode returns the same JSON |
| B | Raw SQL for all four modes, mirroring the deck's `PREPARE` examples | Most "SQL-visible", but hand-written joins for chef / ingredient count duplicate Prisma and add risk |
| C | One Postgres function per mode called via RPC | Logic leaves the repo's JS, harder to test and to keep in sync; too heavy |

User picked **A**.

## Design

### 1. Database migration — `api/prisma/search.sql`

Idempotent SQL file run after `db push` with
`prisma db execute --file prisma/search.sql --schema prisma/schema.prisma`
(new npm script `db:search`; README setup order becomes `db:push` → `db:search` → `db:seed`).

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Full-text: biểu thức PHẢI trùng y hệt biểu thức trong truy vấn để index được dùng
CREATE INDEX IF NOT EXISTS dishes_fts_idx ON dishes
  USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));

-- Trigram trên tên: tăng tốc ILIKE '%x%' (basic/advanced) và tìm gần đúng
CREATE INDEX IF NOT EXISTS dishes_name_trgm_idx ON dishes USING GIN (name gin_trgm_ops);
```

Why a separate file: Prisma schema cannot express expression indexes, and `db push` may drop
indexes it does not know about — so `db:search` must be re-run after every `db:push`
(documented in README). Builder must verify on Supabase that `similarity()` / `word_similarity()`
resolve from the app connection (Supabase may install extensions into the `extensions` schema,
which is on the default `search_path`); if not, qualify or adjust the `CREATE EXTENSION`.

### 2. API — `GET /api/dishes`

Query parameters (all optional):

| Param | Meaning | Validation (fail → `VALIDATION_FAILED`, `error.fields[param]`) |
| --- | --- | --- |
| `mode` | `basic` (default) \| `advanced` \| `fulltext` \| `fuzzy` | other non-empty value → error |
| `q` | search text | trimmed; arrays/whitespace → no criterion (as today); > 100 chars → error |
| `category` | one of `DISH_CATEGORIES` | unknown → ignored (Block 6 behavior, acceptance relies on it) |
| `minPrice`, `maxPrice` | price bounds, inclusive | **advanced only**; non-negative integer ≤ `MAX_PRICE`; `minPrice > maxPrice` → error on `maxPrice` |
| `available` | `true` \| `false` | **advanced only**; other non-empty value → error |
| `ingredient` | text contained in an ingredient name of the recipe | **advanced only**; trimmed, case-insensitive contains |
| `sort` | `DISH_SORTS` key | unknown → default (as today); **ignored when the mode is ranked and `q` is non-empty** |
| `page`, `pageSize` | as today (`pageParams` + `paginate`) | as today |

Empty string / missing for any filter = "no criterion". `available=false` and `minPrice=0` are real
criteria. Parameters that a mode does not use are **ignored, not validated** (so switching mode in the
UI never produces an error from leftover params).

Matching rule per mode (the text rule decides *which* dishes match `q`; the category pill applies in
every mode because it is the menu's browsing control):

| Mode | Text rule for `q` | Also applies | Order |
| --- | --- | --- | --- |
| `basic` | name contains `q`, case-insensitive, `%`/`_` literal | category | `sort` |
| `advanced` | same as basic | category, minPrice, maxPrice, available, ingredient — all AND | `sort` |
| `fulltext` | `to_tsvector('simple', name ‖ ' ' ‖ coalesce(description,'')) @@ plainto_tsquery('simple', q)` | category | `ts_rank` desc, `id` asc |
| `fuzzy` | `word_similarity(q, name) >= 0.3` | category | score desc, `id` asc |

`basic` and `advanced` with only `q` must return identical results (deck slide 29).
For `fulltext`/`fuzzy` with empty `q`: no text criterion → behaves like `basic` with the given sort.

Implementation shape (approach A):

- `basic`/`advanced`: extend the existing Prisma `where`. Ingredient filter:
  `ingredients: { some: { ingredient: { name: { contains, mode: "insensitive" } } } }`.
  **Builder must verify** that Prisma escapes `%`/`_` in `contains`; if it does not, escape them
  before passing (backslash is PostgreSQL's default LIKE escape). A test with `q=100%` and `q=_`
  against the seeded data proves it either way.
- `fulltext`/`fuzzy`: one `$queryRaw` for `count(*)` and one for
  `SELECT id … ORDER BY score DESC, id ASC LIMIT/OFFSET`, both built from the **same** WHERE
  fragment (`Prisma.sql`), so `total` and items share one predicate. Then
  `prisma.dish.findMany({ where: { id: { in: ids } }, include })` and reorder in JS by the id list.
  Unpaged requests (no `?page`) return all matches in rank order.
- `meta` gains `mode` (the effective mode) so the SPA can label results; everything else unchanged.
- Search parsing/validation lives in `api/src/utils/validators.js` (e.g. `parseDishSearch(query)`
  → `{ fields, search }`), unit-tested like the other validators.
- `GET /api/options` gains `searchModes: [{ key, label }]` (labels: Cơ bản, Nâng cao, Toàn văn,
  Gần đúng) so both pages render the mode selector from the API.
- Optional SQL logging: `LOG_SQL=1` makes `PrismaClient` log `query` events, used to capture the
  "query thực hiện tại PostgreSQL" evidence (slide 42).

Why `word_similarity` (my call): seeded names are 3–6 words; `similarity()` compares the whole name,
so a typo like `carbonra` vs "Mỳ Ý Carbonara đặc biệt" falls under 0.3, while `word_similarity`
scores the best-matching part of the name. Threshold 0.3 is published as the deck requires. The
GIN trigram index is still useful for basic/advanced `ILIKE`.

### 3. Seed — 1,500 dishes (`api/prisma/seed.js`)

- Keep the 5 chefs, the hand-written ingredients, and the ~40 hand-written dishes (with images).
- Expand ingredients to roughly 80–100 realistic items (meats, seafood, vegetables, spices, dairy,
  drinks bases).
- Generate the remaining dishes up to **exactly 1,500** from base dishes × variants (e.g. protein,
  style, size: "Phở bò tái lăn", "Phở gà đặc biệt", "Pizza hải sản cỡ lớn"), each with a Vietnamese
  description that mentions its main ingredients (so full-text has something to find), a category, a
  chef, a price, `available` ≈ 85% true, an image reused from the same category, and a 2–6 line
  recipe drawn from ingredients that make sense for that base dish.
- Deterministic (fixed-seed PRNG) so evidence and tests are reproducible; names unique.
- Include a few names with literal `%` and `_` (e.g. "Combo 100% bò Úc", "Trà_sữa_nhà_làm") to
  demo escaping.
- Bulk insert with `createMany` (dishes, then recipe rows) so seeding Supabase takes seconds, not
  minutes. The seed still resets bookings as today.

### 4. Customer menu `/dishes`

URL is the source of truth:
`/dishes?view=pages|more|scroll&mode=…&q=…&category=…&minPrice=…&maxPrice=…&available=…&ingredient=…&sort=…&page=…`
(only non-default values written; `view` default `pages`).

- **View switch**: a segmented control "Số trang | Tải thêm | Cuộn vô hạn" above the grid.
  Switching view keeps the search, starts from the first page.
- **Search form** (in the hero): text box + mode selector. Choosing **Nâng cao** reveals a filter
  panel: giá từ / đến, tình trạng (Tất cả / Còn món / Tạm hết), nguyên liệu. Category pills stay.
  Sort select is replaced by "Sắp xếp: Độ liên quan" when the mode is ranked and `q` is set.
- **New search, filter change, sort change, view change, "Xóa bộ lọc"** → start at page 1 / an
  empty accumulated list. **Changing page** keeps every criterion and only changes `page`.
- **Numbered pages**: as today (`Pagination` + `?page`). Copy/Reload/Back/Forward restore page.
- **Load More / infinite scroll**: server-side paging with AJAX, 9 per request, appended to a local
  list. State: `items`, `nextPage`, `pending`, `end`, keyed by the search key (all URL params except
  `page`). A key change aborts the in-flight request and resets the list, so results of two
  searches never mix. Append de-duplicates by `id`. `end` when `page × pageSize ≥ total` or a page
  returns no items. Infinite scroll uses `IntersectionObserver` on a sentinel after the grid
  (`rootMargin: "200px 0px"`), disconnected on unmount/key change; `loadNext()` still checks
  `pending`/`end`. Error on a later page shows an inline retry under the grid without dropping
  loaded items.
- **Published reopen behavior** (slide 39): in Load More / infinite scroll the URL keeps the search
  and view but not the page; Reload, opening the link, and Back from a dish detail page all
  **load from the start** (no client cache or scroll restoration). Numbered pages restore the
  exact page.
- Invalid criteria from a hand-edited URL (`VALIDATION_FAILED`) show an inline message with the
  field errors and a "Xóa bộ lọc" link, not the generic error screen.

### 5. Admin `/admin/dishes`

- Keep the table and numbered paging (10 per page).
- Add the same search form (mode selector + advanced panel + text) above the table; criteria in the
  URL alongside `sort`/`page`; any criteria change resets to page 1; "Xóa bộ lọc" clears them.
- Sort select behaves as on the menu (relevance when ranked mode + `q`).
- Same inline `VALIDATION_FAILED` handling.

Shared pieces (builder decides exact split): a `SearchForm` component used by both pages, and a
small pure module that converts URL ⇄ search criteria (unit-tested in `web/src/**/*.test.js`).

### 6. README — Block 7 report

Rewrite `README.md` in the same structure/style as the Block 6 README (team info table kept), now
titled for Block 7, covering: scope table mapped to slides 33–42, setup order including
`db:search`, the migration, the seed, the API search contract and validation table, the SQL actually
executed for each mode, the three paging UIs and their state rules, URL/reopen behavior, test and
acceptance commands, and:

- **"Trình bày quyết định của nhóm"** — answer each slide-41 question:
  1. Which feature uses client paging, server paging, or AJAX (and why: data volume, behavior
     when changing page).
  2. Where filter and sort run and which data set they affect (server, whole result set — never
     only the loaded page).
  3. What Network shows: each request loads one page (`pageSize` items + `total`), not the whole
     table.
  4. A bug the team found, how to reproduce it, and evidence that the fix works (a real bug found
     during this block's development, with the failing test/request before and passing after).
- **Evidence (slide 42)**: record count + seed command, demo of the three views, sample search URLs
  and their Network responses, logged SQL per mode. Screenshots go in `evidence/` (the team captures
  them; README links to them).

### 7. Tests

- API unit tests: search parsing/validation (empty vs `false` vs `0`, bad numbers, min > max, bad
  mode, ignored params for non-advanced modes).
- Acceptance script additions (live DB): `q=100%` and `q=_` literal, basic = advanced for the same
  `q`, `available=false` returns only unavailable, `minPrice=0` accepted, full-text and fuzzy return
  rank-ordered results, out-of-range page clamps, `total` consistent with items across pages.
- Web unit tests: URL ⇄ criteria conversion, accumulate/dedupe logic for Load More.

## Answers from the user (after builder check)

- The builder **may run** `db:push`, `db:search` and `db:seed` against the Supabase database in
  `api/.env` (the seed wipes and recreates all data).
- The team has **no bug yet** for slide 41 Q4: record the first genuine bug found while building —
  commit the failing test (or capture the failing request/response) **before** the fix, then the
  passing run after, and document it in the README.

## Left to the builder

- Exact component/file split, styling details (match existing Tailwind design).
- Exact generated dish catalogue and ingredient list.
- Whether ranked-mode raw SQL uses two queries or `count(*) OVER()` (must clamp page like `paginate`).
- Exact wording of Vietnamese UI labels and validation messages.

## Calls made by Claude (not explicitly decided by the user)

- `word_similarity` ≥ 0.3 for fuzzy instead of plain `similarity`.
- Filters other than category apply only in `advanced`; other modes ignore (not reject) them.
- Load More / infinite scroll reopen from the start (Reload, link, and Back from detail);
  numbered pages restore the exact page.
- Ingredient search = text contains on ingredient names (not an id dropdown).
- ~80–100 ingredients (not 1,500); "1,500" applies to dishes.
- All filter/sort runs on the server (no client-side filtering), justified by data volume.
