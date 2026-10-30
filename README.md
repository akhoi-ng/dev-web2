# Lửa Hồng - Tìm kiếm và phân trang

Báo cáo Block 7 ("Tìm kiếm và phân trang") của nhóm. Block 7 mở rộng ứng dụng nhà hàng của
Block 6 (REST API + SPA) để chạy trên một thực đơn **1.500 món**:

- **Ba kiểu phân trang** ở thực đơn khách (`/dishes`): Số trang, Tải thêm, Cuộn vô hạn, chuyển
  bằng một nút trên trang (mục 10).
- **Bốn kiểu tìm kiếm tại server** ở cả thực đơn và trang quản lý món (`/admin/dishes`):
  Cơ bản (`basic`), Nâng cao (`advanced`: tên, khoảng giá, tình trạng, nguyên liệu, danh mục),
  Toàn văn (`fulltext`, PostgreSQL full-text) và Gần đúng (`fuzzy`, `pg_trgm`) (mục 11).
- **Migration PostgreSQL** bật `pg_trgm` và tạo index GIN cho full-text và trigram (mục 6).
- **Seed 1.500 món, 103 nguyên liệu** sinh cố định từ `api/prisma/catalog.js` (mục 6).
- Câu trả lời cho phần **"Trình bày quyết định của nhóm"** (mục 16) và danh sách **bằng chứng
  nộp** (mục 17).

Ứng dụng vẫn gồm **hai package trong cùng repository**:

- `api/`: server Express chỉ trả **JSON**. Router → handler → validator → Prisma →
  PostgreSQL (Supabase). Không render HTML.
- `web/`: ứng dụng React chạy trong trình duyệt (SPA), định tuyến bằng React Router, gọi API
  qua `fetch` và tự dựng giao diện.

Hai ứng dụng chạy ở **hai origin khác nhau** (mặc định `http://localhost:3000` và
`http://localhost:5173`), nên API bật CORS theo danh sách origin cấu hình trong `.env`.

Luồng của một trang:

```text
React Router (web) → useApiData → API client (fetch) → Express router (api)
→ handler đọc params/query/body → validator → Prisma → PostgreSQL
→ JSON { ok, data, meta? } → component render
```

Thao tác ghi đi qua `fetch` với `POST` / `PATCH` (body JSON) hoặc `DELETE` (không body), rồi
SPA chuyển trang bằng điều hướng phía client (không tải lại cả document).

> **Phạm vi giao diện hiện tại:** SPA có đủ trang khách và trang quản trị cho cả bốn nhóm:
> **món ăn**, **đầu bếp**, **nguyên liệu** và **đặt bàn**. Mọi thao tác CRUD của ba tài
> nguyên chính đều có giao diện tương ứng.

## 1. Thông tin nhóm

| STT | Họ và tên | MSSV |
| --- | --- | --- |
| 1 | Nguyễn Tấn Hiệu | 24127373 |
| 2 | La Anh Hào | 24127361 |
| 3 | Trần Nguyễn Tuấn Minh | 24127084 |
| 4 | Nguyễn Anh Khôi | 24127430 |

## 2. Phạm vi bài làm

### 2.1. Yêu cầu Block 7

| Yêu cầu (slide) | Cách project đáp ứng |
| --- | --- |
| ≥ 1.000 món trong Supabase, có script seed, giữ CRUD (33) | `npm run db:seed` nạp **1.500 món** từ `api/prisma/catalog.js`; CRUD món/đầu bếp/nguyên liệu giữ nguyên |
| Ba cách hiển thị: Số trang, Load More, Infinite Scroll (34) | Nút "Số trang / Tải thêm / Cuộn vô hạn" trên `/dishes` (`?view=pages\|more\|scroll`), mục 10 |
| Nhóm tự chọn client/server paging, tải trang HTML hay AJAX (35) | Server-side paging; cập nhật giao diện bằng AJAX (`fetch`) trong SPA, mục 16 |
| Filter/sort ở chức năng phù hợp, nêu tập dữ liệu bị tác động (36) | Lọc danh mục, khoảng giá, tình trạng, nguyên liệu; sắp tên/giá; tất cả chạy ở server trên **toàn bộ** kết quả, mục 11 và 16 |
| Search tại server: `basic`, `advanced`, `fulltext`, `fuzzy` (37) | `GET /api/dishes?mode=...`, có ở cả `/dishes` và `/admin/dishes`, mục 11 |
| Cấu hình PostgreSQL: full-text `simple`, document gồm tên + mô tả (NULL), `pg_trgm` ngưỡng 0.3, xếp theo điểm rồi `id` (38) | `api/prisma/search.sql` + `api/src/db/dish-search.js`, mục 6 và 11 |
| Mở lại kết quả và thay đổi điều kiện (39) | Tiêu chí nằm trên URL; tìm lại/đổi lọc/sắp xếp về đầu kết quả; Tải thêm/Cuộn không trộn hai lần tìm; hành vi mở lại link được công bố ở mục 10.4 |
| Nghiệm thu bằng kết quả quan sát được (40) | Acceptance script + kiểm tra SPA, mục 13 |
| Trình bày quyết định của nhóm (41) | Mục 16 |
| Bằng chứng nộp (42) | Mục 17 và thư mục `evidence/` |

### 2.2. Kế thừa từ Block 6

| Hạng mục | Cách project đáp ứng |
| --- | --- |
| Backend chỉ trả JSON | `api/src/http/respond.js` bọc mọi phản hồi của handler trong `{ ok, data, meta? }` hoặc `{ ok: false, error }` |
| REST cho ba tài nguyên | `GET/POST /api/dishes`, `/api/chefs`, `/api/ingredients`; `GET/PATCH/DELETE /api/<res>/:id` |
| SPA ở origin khác | `web/` chạy Vite cổng 5173, gọi `VITE_API_URL` (giá trị mẫu `http://localhost:3000`) |
| CORS thật, không dùng proxy | `api/src/http/cors.js` chỉ cho các origin trong `CORS_ORIGIN`, không dùng `*` |
| Trạng thái lỗi theo quy ước | Lỗi nghiệp vụ trả HTTP `200` với `ok: false`; lỗi giao thức trả `400`/`404`/`500` không có `ok` (mục 7) |

## 3. Công nghệ sử dụng

| Phần | Dùng gì | Ghi chú |
| --- | --- | --- |
| Runtime | Node.js 18 trở lên | Cần cho Vite 5 và `fetch`/`node:test` |
| Web framework (API) | Express 4.21 | `express.json()` đọc body JSON; `asyncHandler` đưa lỗi async tới middleware 500 |
| ORM | Prisma 6.16 | Code-first, `prisma db push`; một `PrismaClient` dùng chung |
| Database | PostgreSQL trên Supabase | `DATABASE_URL` (pooler 6543) và `DIRECT_URL` (5432) |
| CORS | `cors` 2.8 | Danh sách origin lấy từ `CORS_ORIGIN`, hỗ trợ nhiều origin cách nhau bằng dấu phẩy |
| Biến môi trường | `dotenv` | API đọc `.env` khi khởi động; SPA dùng `import.meta.env.VITE_API_URL` |
| Giao diện | React 18.3 + React Router 6.28 | `createBrowserRouter`, `NavLink`, `useSearchParams`; không dùng global store |
| Build frontend | Vite 5.4 | Dev/preview cố định cổng 5173 (`strictPort: true`) |
| CSS | Tailwind CSS 3.4 + PostCSS + Autoprefixer | Build thật, không dùng CDN; font Be Vietnam Pro nạp trong `web/index.html` |
| Kiểm thử | `node:test` | Test API HTTP/validator/helper và test API client của SPA |

## 4. Cấu trúc repository

```text
api/                                  # Backend: chỉ JSON
├── src/
│   ├── server.js                     # nạp .env, cảnh báo thiếu CORS_ORIGIN, app.listen
│   ├── app.js                        # CORS → JSON body → requireJson → routers → 404 → 500
│   ├── db/
│   │   ├── prisma.js                 # một PrismaClient dùng chung; LOG_SQL=1 in câu SQL
│   │   └── dish-search.js            # tìm kiếm món: where Prisma (basic/advanced), SQL xếp hạng (fulltext/fuzzy)
│   ├── http/
│   │   ├── respond.js                # ok/fail/notFound/validationFailed/requireJson/404/500
│   │   └── cors.js                   # đọc CORS_ORIGIN, cấu hình cors()
│   ├── routes/
│   │   ├── dishes.js                 # danh sách, chi tiết, tạo, sửa, xóa món
│   │   ├── chefs.js                  # CRUD đầu bếp
│   │   ├── ingredients.js            # CRUD nguyên liệu
│   │   ├── bookings.js               # khách tạo và tra cứu đặt bàn theo mã
│   │   ├── admin-bookings.js         # danh sách/đổi trạng thái đặt bàn
│   │   ├── stats.js                  # số liệu đầu trang thực đơn
│   │   └── options.js                # danh mục, kiểu sắp xếp, đơn vị, khung giờ đặt bàn
│   └── utils/
│       ├── helpers.js                # parseId, paginate, pageParams, escapeLike, todayInVietnam...
│       └── validators.js             # validateDish/Chef/..., parseDishSearch, SEARCH_MODES, hằng số
├── prisma/
│   ├── schema.prisma                 # Dish, Chef, Ingredient, DishIngredient, Booking
│   ├── search.sql                    # migration tìm kiếm: pg_trgm + index GIN (npm run db:search)
│   ├── catalog.js                    # dữ liệu mẫu: 51 món viết tay + sinh thêm cho đủ 1.500 món
│   └── seed.js                       # xóa dữ liệu cũ rồi ghi catalog bằng createMany
├── test/
│   ├── app.test.js                   # response shape, 400/404/413/415, CORS, options, VALIDATION_FAILED
│   ├── validators.test.js            # luật validate, chế độ PATCH một phần, parseDishSearch
│   ├── helpers.test.js               # parseId, paginate, pageParams, escapeLike, ngày giờ
│   ├── dish-search.test.js           # where của basic/advanced, SQL của fulltext/fuzzy, orderByIds
│   └── catalog.test.js               # 1.500 món, tên không trùng, công thức hợp lệ, sinh cố định
├── scripts/acceptance.mjs            # bảng REST + CORS + đặt bàn + tìm kiếm 4 mode
├── requests.http                     # request mẫu cho REST Client của IDE
├── .env.example
└── package.json

web/                                  # Frontend: React SPA
├── src/
│   ├── main.jsx                      # createRoot + RouterProvider
│   ├── router.jsx                    # toàn bộ route SPA
│   ├── api/
│   │   ├── client.js                 # nơi DUY NHẤT gọi fetch; phân loại lỗi
│   │   ├── client.test.js            # test client bằng fetch giả
│   │   └── index.js                  # dishesApi, chefsApi, ingredientsApi, bookingsApi...
│   ├── hooks/
│   │   ├── useApiData.js             # tải dữ liệu, huỷ request cũ, trạng thái + retry
│   │   ├── useLoadMore.js            # danh sách tích lũy cho Tải thêm / Cuộn vô hạn
│   │   ├── useSubmit.js              # chặn gửi đúp, gom fieldErrors/formError
│   │   └── useDocumentTitle.js
│   ├── components/                   # Layout, Pagination, DataStatus, SearchForm, SearchError, ViewSwitch...
│   ├── pages/
│   │   ├── MenuPage.jsx              # thực đơn: tìm 4 mode, lọc, sắp xếp, 3 kiểu phân trang
│   │   ├── menu/LoadMoreList.jsx     # lưới Tải thêm / Cuộn vô hạn (IntersectionObserver)
│   │   ├── DishPage.jsx              # chi tiết món + đầu bếp + công thức
│   │   ├── AboutPage.jsx
│   │   ├── NotFoundPage.jsx, RouteErrorPage.jsx
│   │   ├── bookings/                 # form đặt bàn, trang xác nhận
│   │   └── admin/
│   │       ├── bookings/             # danh sách và đổi trạng thái
│   │       ├── dishes/               # danh sách, thêm, chi tiết, sửa, xóa
│   │       ├── chefs/                # danh sách, thêm, chi tiết, sửa, xóa
│   │       └── ingredients/          # danh sách, thêm, chi tiết, sửa, xóa
│   └── lib/
│       ├── dish-search.js            # tiêu chí tìm kiếm ⇄ URL ⇄ query API (+ test)
│       ├── load-more.js              # trạng thái thuần của danh sách tích lũy (+ test)
│       └── format.js, restaurant.js  # format giá/ngày/điện thoại, thông tin nhà hàng
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── package.json

docs/superpowers/                     # spec và plan của Block 6, Block 7
evidence/                             # minh chứng (bug-like-wildcard.md: lỗi % _ trước/sau khi sửa)
README.md
.gitignore                            # node_modules/, .env, dist/
```

Không còn thư mục `views/`, template EJS, `method-override` hay `src/` ở thư mục gốc. Mọi
lệnh cài đặt/chạy phải thực hiện **trong `api/` hoặc `web/`**; thư mục gốc không có
`package.json`.

## 5. Cài đặt và chạy

### 5.1. Chuẩn bị

- Node.js 18 trở lên (`node --version`).
- Một project Supabase đã tạo, lấy chuỗi kết nối ở **Connect**.

### 5.2. API (`api/`)

```bash
cd api
npm install
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

Mở `api/.env` và điền:

| Biến | Dùng cho |
| --- | --- |
| `DATABASE_URL` | Ứng dụng khi chạy. Supabase **Transaction pooler**, cổng `6543`, có `?pgbouncer=true` |
| `DIRECT_URL` | `prisma db push`. Supabase **Session pooler**, cổng `5432` |
| `PORT` | Cổng Express, mặc định `3000` |
| `CORS_ORIGIN` | Origin của SPA. `.env.example` đặt `http://localhost:5173`. Không có `/` ở cuối; nhiều origin cách nhau bằng dấu phẩy |
| `LOG_SQL` | Không bắt buộc. `LOG_SQL=1` in mọi câu SQL Prisma gửi tới PostgreSQL (dùng để lấy bằng chứng truy vấn, mục 11.4) |

Nếu chỉ có một chuỗi Session pooler, có thể gán cùng chuỗi cho cả `DATABASE_URL` và
`DIRECT_URL` (bỏ `?pgbouncer=true`) để chạy được.

Tạo bảng, bật tìm kiếm, nạp dữ liệu mẫu, chạy server:

```bash
npm run db:push      # tạo/đồng bộ bảng theo schema.prisma
npm run db:search    # pg_trgm + index GIN (prisma/search.sql)
npm run db:seed      # xóa dữ liệu cũ, nạp 1.500 món (~20 giây với Supabase)
npm run dev
```

> **Chạy lại `npm run db:search` sau mỗi lần `npm run db:push`.** Schema Prisma không mô tả được
> index biểu thức (full-text), nên `db push` có thể xóa các index không có trong schema. File SQL
> dùng `IF NOT EXISTS`, chạy lại bao nhiêu lần cũng được.

`npm run dev` dùng `node --watch`. API chạy tại `http://localhost:3000`; kiểm tra nhanh:

```bash
curl -i http://localhost:3000/api/dishes
```

### 5.3. SPA (`web/`)

Mở terminal thứ hai:

```bash
cd web
npm install
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
npm run dev
```

`web/.env`:

| Biến | Dùng cho |
| --- | --- |
| `VITE_API_URL` | Base URL của API. `.env.example` đặt `http://localhost:3000`. Đây là biến công khai, không đặt bí mật ở đây |

Mở `http://localhost:5173/`. Nếu `CORS_ORIGIN` không khớp chính xác origin của SPA (kể cả
cổng), trình duyệt sẽ chặn request và SPA hiện khung "Không tải được dữ liệu".

### 5.4. Script

**`api/package.json`**

| Script | Nhiệm vụ |
| --- | --- |
| `npm run dev` | `node --watch src/server.js` |
| `npm start` | `node src/server.js` |
| `npm run db:push` | `prisma db push` (đồng bộ schema, Code-first) |
| `npm run db:search` | `prisma db execute --file prisma/search.sql`: bật `pg_trgm`, tạo index tìm kiếm |
| `npm run db:seed` | `prisma db seed` → `node prisma/seed.js`, **xóa dữ liệu cũ** rồi nạp lại |
| `npm test` | `node --test "test/**/*.test.js"` |
| `npm run acceptance` | Chạy `scripts/acceptance.mjs` (cần API đang chạy) |
| `postinstall` | `prisma generate` sau `npm install` |

**`web/package.json`**

| Script | Nhiệm vụ |
| --- | --- |
| `npm run dev` | Vite dev server, cổng 5173 |
| `npm run build` | Build production vào `web/dist/` |
| `npm run preview` | Xem bản build, cổng 5173 |
| `npm test` | `node --test "src/**/*.test.js"` |

> `npm run db:seed` xóa **cả đặt bàn** cùng dữ liệu món, đầu bếp, nguyên liệu trước khi nạp
> lại. Chỉ chạy khi muốn đưa database về trạng thái demo.

## 6. Thiết kế database (`api/prisma/schema.prisma`)

Mỗi model là một bảng, mỗi trường là một cột. Khóa chính `Int @id @default(autoincrement())`
do database sinh; `@@map` đặt tên bảng thật là chữ thường số nhiều.

| Model | Bảng | Trường |
| --- | --- | --- |
| `Dish` | `dishes` | `id`, `name`, `description?`, `price` (Int, VNĐ), `category?`, `imageUrl?`, `available` (mặc định `true`), `createdAt`, `chefId?` |
| `Chef` | `chefs` | `id`, `name`, `specialty`, `imageUrl?`, `createdAt` |
| `Ingredient` | `ingredients` | `id`, `name`, `unit`, `createdAt` |
| `DishIngredient` | `dish_ingredients` | `dishId`, `ingredientId`, `quantity` (Float); khóa chính `(dishId, ingredientId)`; index `ingredientId` |
| `Booking` | `bookings` | `id`, `code` (unique, 8 ký tự hex ngẫu nhiên), `name`, `phone`, `guests`, `bookedAt` (DateTime), `note?`, `status` (`pending`/`confirmed`/`cancelled`), `createdAt`; index `bookedAt` |

`price` là số nguyên vì tiền VNĐ không có phần lẻ. `status` là `String` có giá trị mặc định
`pending`; danh sách trạng thái hợp lệ được kiểm tra ở validator, không phải kiểu enum của
database.

### Quan hệ và hành vi khi xóa

| Quan hệ | Khai báo | Khi xóa |
| --- | --- | --- |
| Món ăn → đầu bếp (nhiều – một) | `Dish.chefId` → `Chef.id`, `onDelete: SetNull` | Xóa đầu bếp: món vẫn còn, `chefId = null`; giao diện hiện "Chưa phân công" |
| Món ăn ↔ nguyên liệu (nhiều – nhiều, có định lượng) | Bảng nối `DishIngredient`, `onDelete: Cascade` ở cả hai khóa ngoại | Xóa món hoặc nguyên liệu: các dòng công thức liên quan bị xóa theo |

### Migration tìm kiếm (`api/prisma/search.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Gần đúng không phân biệt dấu: so unaccent(q) với unaccent(name)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Full-text: biểu thức PHẢI trùng y hệt biểu thức trong truy vấn thì index mới được dùng
CREATE INDEX IF NOT EXISTS dishes_fts_idx ON dishes
  USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));

-- Trigram trên tên: tăng tốc ILIKE '%...%' của basic/advanced
CREATE INDEX IF NOT EXISTS dishes_name_trgm_idx ON dishes USING GIN (name gin_trgm_ops);
```

Trên Supabase của nhóm, `pg_trgm` được cài vào schema `public`; kiểm tra bằng
`SELECT extname, extnamespace::regnamespace FROM pg_extension WHERE extname = 'pg_trgm'`.

### Dữ liệu mẫu (`api/prisma/catalog.js`, `api/prisma/seed.js`)

| Bảng | Số bản ghi | Ghi chú |
| --- | --- | --- |
| `dishes` | **1.500** | 51 món viết tay của Block 6 + 1.449 món sinh tự động. Khai vị 276, Món chính 670, Món phụ 157, Tráng miệng 188, Đồ uống 209; 213 món `available: false` |
| `chefs` | 5 | Bếp Á, steak/món Âu, bếp trưởng điều hành, bếp Ý, bếp bánh ngọt |
| `ingredients` | 103 | 45 nguyên liệu cũ + 58 nguyên liệu mới (mực, cua, sả, nấm rơm, trân châu...) |
| `dish_ingredients` | 5.094 | Mỗi món 1 đến 6 dòng, định lượng nhân theo khẩu phần |
| `bookings` | 0 | Seed xóa toàn bộ đặt bàn cũ |

Cách sinh món (`buildCatalog()`):

- 47 **mẫu món** (Phở, Bún, Cơm, Mỳ Ý, Pizza, Lẩu, Chè, Trà, Cà phê...), mỗi mẫu có công thức lõi
  và 3–9 **biến thể** (ví dụ Phở: bò tái, gà, tái nạm, chay...; mỗi biến thể thêm nguyên liệu và
  chênh giá).
- Nhân với **phong cách** ("", "đặc biệt", "kiểu nhà làm") và **khẩu phần** ("", "phần nhỏ",
  "phần lớn", "phần gia đình", "suất trưa"; đồ uống: "ly nhỏ", "ly lớn", "bình 1 lít", "ít
  đường"). Giá và định lượng nhân theo hệ số của phong cách/khẩu phần.
- Xáo trộn bằng PRNG có seed cố định (`mulberry32(20261030)`) rồi lấy đủ 1.500 món, bỏ tên trùng.
  **Mỗi lần seed ra đúng cùng một thực đơn**, nên kết quả tìm kiếm trong README tái hiện được.
- Mô tả nêu nguyên liệu chính, ví dụ "Món ruột của nhà hàng: phở bò tái, làm từ thịt bò thăn
  (tái), bánh phở tươi, xương bò." — để tìm toàn văn theo nguyên liệu có kết quả.
- Ba món có ký tự đặc biệt trong tên để kiểm tra escape: `Combo 100% bò Úc`, `Bánh 50% đường`,
  `Trà_sữa_nhà_làm`.

`seed.js` xóa theo thứ tự `bookings` → `dish_ingredients` → `dishes` → `chefs` → `ingredients`,
rồi ghi bằng `createMany` (đầu bếp, nguyên liệu, món, công thức), lấy lại id theo tên (tên không
trùng). Chạy lại bao nhiêu lần cũng ra cùng một trạng thái.

## 7. Hợp đồng phản hồi của API

### 7.1. Hình dạng JSON

Thành công:

```json
{ "ok": true, "data": [] }
{ "ok": true, "data": [], "meta": { "page": 1, "totalPages": 6, "total": 51, "pageSize": 9 } }
```

Lỗi nghiệp vụ:

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Món ăn không tồn tại" } }
{ "ok": false, "error": { "code": "VALIDATION_FAILED", "message": "Dữ liệu không hợp lệ",
                          "fields": { "price": "Giá phải là số nguyên không âm (VNĐ)." } } }
```

`meta` chỉ có ở danh sách được phân trang; `fields` chỉ có khi `VALIDATION_FAILED`.

### 7.2. Mã HTTP

| Trường hợp | Status | Body |
| --- | --- | --- |
| Thành công, kể cả danh sách rỗng | `200` | `ok: true` |
| Id sai định dạng, vượt giới hạn cột INT4 (2 147 483 647), không tồn tại | `200` | `ok: false`, `NOT_FOUND` |
| Dữ liệu gửi lên sai | `200` | `ok: false`, `VALIDATION_FAILED` + `fields` |
| Route `/api/...` không khớp | `404` | `{ "message": "Không tìm thấy route" }`, **không có `ok`** |
| `POST`/`PATCH` không gửi `Content-Type: application/json` | `400` | `{ "message": "Body phải là JSON (Content-Type: application/json)" }` |
| JSON hỏng | `400` | `{ "message": "JSON không hợp lệ" }` |
| Body vượt quá 100 KB | `413` | `{ "message": "Không đọc được body của request" }` |
| Body dùng charset không hỗ trợ (ví dụ `latin1`) | `415` | `{ "message": "Không đọc được body của request" }` |
| Lỗi hệ thống (mất DB, bug) | `500` | `{ "message": "Lỗi hệ thống" }`; chi tiết chỉ ghi ở `console.error` |

Điểm cần lưu ý: **không tìm thấy bản ghi không phải HTTP 404**. Đây là lỗi nghiệp vụ, trả
`200` với `ok: false` và `error.code = "NOT_FOUND"`. SPA phân biệt hai loại này ở tầng API
client (mục 9), nên vẫn hiện đúng trang "Không tìm thấy". Khi kiểm tra bằng `curl`, phải xem
**body** chứ không chỉ status.

`express.json()` mặc định chỉ đọc body tới 100 KB. Các lỗi đọc body do phía client gây ra
(body quá lớn → `413`, charset không hỗ trợ → `415`...) được `errorHandler` giữ nguyên status
và chỉ trả `{ "message": "Không đọc được body của request" }`, thay vì biến thành `500`.

### 7.3. Thứ tự middleware (`api/src/app.js`)

```js
app.use(corsMiddleware(corsOrigin));   // 1. CORS, kể cả cho phản hồi 404/500
app.use(express.json());                // 2. đọc body JSON
app.use(requireJson);                   // 3. POST/PATCH bắt buộc JSON
app.use("/api/dishes", dishesRouter);   // 4. routers
// ...
app.use(routeNotFound);                 // 5. 404 không có ok
app.use(errorHandler);                  // 6. lỗi còn lại: 4xx body / 500 không lộ err.message
```

`corsMiddleware` đặt trước router để cả phản hồi lỗi vẫn có header CORS cho origin hợp lệ.
`requireJson` không áp dụng cho `DELETE` vì thao tác xóa không gửi body.

### 7.4. CORS

- `CORS_ORIGIN` là danh sách origin, ví dụ `http://localhost:5173` hoặc
  `http://localhost:5173,https://ten-mien.example`.
- Không có `/` ở cuối; so khớp chính xác scheme + host + port.
- Không dùng `Access-Control-Allow-Origin: *`.
- Preflight `OPTIONS` trả `204` với `Access-Control-Allow-Methods: GET,POST,PATCH,DELETE`
  và `Access-Control-Allow-Headers: Content-Type`.
- Origin lạ không nhận header `Access-Control-Allow-Origin`.
- Nếu `CORS_ORIGIN` để trống, server chỉ in cảnh báo khi khởi động và không cho origin nào gọi
  API.

## 8. Danh sách endpoint

### 8.1. Ba tài nguyên chính

Với `:res` là `dishes`, `chefs` hoặc `ingredients`:

| Thao tác | Request | Thành công | Lỗi nghiệp vụ |
| --- | --- | --- | --- |
| Danh sách | `GET /api/:res` | Mảng bản ghi | — |
| Chi tiết | `GET /api/:res/:id` | Một bản ghi | `NOT_FOUND` |
| Thêm | `POST /api/:res` | Bản ghi vừa tạo (có `id`) | `VALIDATION_FAILED` |
| Sửa một phần | `PATCH /api/:res/:id` | Bản ghi sau khi sửa | `VALIDATION_FAILED`, `NOT_FOUND` |
| Xóa | `DELETE /api/:res/:id` | `data: null` | `NOT_FOUND` |

`:id` được đọc bằng `parseId()`: phải là số nguyên dương và không vượt quá `2 147 483 647`
(giới hạn cột `INT4` của PostgreSQL). Giá trị không hợp lệ — kể cả id quá lớn — trả
`NOT_FOUND`, thay vì để Prisma ném lỗi và API trả `500`.

Danh sách nhận `?page` và `?pageSize`:

| Tham số | Hành vi |
| --- | --- |
| Không có `page` | Trả **toàn bộ** danh sách, không có `meta` (dùng cho trang giới thiệu và ô chọn trong form) |
| `page` hợp lệ | Trả một trang + `meta: { page, totalPages, total, pageSize }` |
| `page=abc`, `page=0`, `page=-2`, `page=1.5` | Coi như trang 1 |
| `page` vượt quá | Kẹp về trang cuối |
| `pageSize` | Số nguyên 1…50; không hợp lệ thì dùng mặc định |
| Mặc định `pageSize` | 9 với món ăn, 10 với đầu bếp và nguyên liệu |

### 8.2. Query riêng của danh sách món

`GET /api/dishes` (đọc bằng `parseDishSearch()` trong `api/src/utils/validators.js`)

| Tham số | Ý nghĩa | Sai → `VALIDATION_FAILED` (`error.fields.<tham số>`) |
| --- | --- | --- |
| `mode` | `basic` (mặc định), `advanced`, `fulltext`, `fuzzy` | Giá trị khác: "Kiểu tìm kiếm không hợp lệ." |
| `q` | Từ khóa; quy tắc so khớp theo `mode` (mục 11). Mảng (`?q[]=x`) hoặc chuỗi trắng = không có từ khóa | Dài hơn 100 ký tự |
| `category` | Một trong 5 danh mục, dùng ở **mọi** mode; giá trị lạ coi như "Tất cả" | — |
| `minPrice`, `maxPrice` | Chỉ ở `advanced`. Giá từ/đến (VNĐ, tính cả hai đầu) | Không phải số nguyên không âm ≤ 2 147 483 647; `minPrice > maxPrice` báo ở `maxPrice` |
| `available` | Chỉ ở `advanced`. `true` = còn món, `false` = tạm hết | Giá trị khác `true`/`false` |
| `ingredient` | Chỉ ở `advanced`. Món có ít nhất một nguyên liệu mà tên chứa chuỗi này | — |
| `sort` | `default`, `newest`, `price-asc`, `price-desc`, `name-asc`; giá trị lạ coi như `default`. **Bị bỏ qua** khi `fulltext`/`fuzzy` có từ khóa (xếp theo độ liên quan) | — |
| `page`, `pageSize` | Như bảng trên | — |

Quy ước "rỗng / false / 0" (slide 27):

- Thiếu tham số hoặc chuỗi trắng = **không có tiêu chí**.
- `available=false` là tiêu chí thật: chỉ món tạm hết.
- `minPrice=0` là một cận giá hợp lệ, không phải giá trị rỗng.
- Tham số nâng cao gửi kèm mode khác `advanced` (ví dụ còn sót trên URL sau khi đổi mode) bị
  **bỏ qua, không kiểm tra**, nên đổi mode không bao giờ sinh lỗi.

Phân trang trả thêm `meta.mode` (mode đã áp dụng). Không có kết quả là `ok: true`,
`data: []`, `meta.total: 0`.

Mỗi món trong danh sách kèm `chef` và `_count.ingredients`. Chi tiết món kèm `chef` và
`ingredients` (mỗi dòng có `ingredientId`, `quantity`, `ingredient`), sắp theo tên nguyên liệu.

`GET /api/chefs` và `GET /api/ingredients` kèm `_count.dishes`. Chi tiết đầu bếp kèm danh
sách món phụ trách; chi tiết nguyên liệu kèm các món sử dụng nó.

### 8.3. Endpoint bổ sung

| Request | Mục đích | `data` |
| --- | --- | --- |
| `GET /api/stats` | Số liệu đầu trang thực đơn | `{ dishes, categories, chefs, minPrice, tiles: [{ name, count, imageUrl }] }` |
| `GET /api/options` | Hằng số dùng chung cho form/bộ lọc | `{ categories, sorts: [{ key, label }], searchModes: [{ key, label }], units, booking: { slots, maxGuests, maxDays, statuses, minDate, maxDate } }` |
| `POST /api/bookings` | Khách gửi yêu cầu đặt bàn | Bản ghi vừa tạo, gồm `code` 8 ký tự hex |
| `GET /api/bookings/:code` | Khách tra cứu yêu cầu của mình | Bản ghi đặt bàn; mã sai định dạng/không có → `NOT_FOUND` |
| `GET /api/admin/bookings?show=all` | Danh sách đặt bàn | Mặc định chỉ từ hôm nay (giờ Việt Nam); `show=all` lấy cả lịch đã qua; sắp theo `bookedAt`, rồi `id` |
| `PATCH /api/admin/bookings/:id` | Đổi trạng thái | Body `{ "status": "pending" }`, `"confirmed"` hoặc `"cancelled"`; sai → `VALIDATION_FAILED` với `fields.status` |

`GET /api/stats` tính trên **toàn bộ** thực đơn, không theo bộ lọc, để các ô danh mục luôn có
đủ số món. `tiles` luôn gồm 5 danh mục cố định; danh mục chưa có món thì `count = 0` và
`imageUrl = null`.

`GET /api/options` trả khung giờ đặt bàn từ `10:00` đến `21:00`, mỗi 30 phút (23 khung), số
khách tối đa 20, đặt trước tối đa 60 ngày, cùng `minDate`/`maxDate` theo giờ Việt Nam.

## 9. Kiến trúc SPA

### 9.1. Route (`web/src/router.jsx`)

| URL | Trang | Dữ liệu dùng |
| --- | --- | --- |
| `/` | Chuyển hướng sang `/dishes` | — |
| `/dishes?view&mode&q&category&minPrice&maxPrice&available&ingredient&sort&page` | Thực đơn: số liệu, ô danh mục, tìm kiếm 4 mode, lọc, sắp xếp, 3 kiểu phân trang | `GET /api/stats`, `GET /api/options`, `GET /api/dishes` |
| `/dishes/:id` | Chi tiết món, đầu bếp, công thức | `GET /api/dishes/:id` |
| `/about` | Giới thiệu nhà hàng và đội ngũ đầu bếp | `GET /api/chefs`, `GET /api/stats` |
| `/bookings/new` | Form đặt bàn | `GET /api/options`, `POST /api/bookings` |
| `/bookings/:code` | Xác nhận yêu cầu đặt bàn | `GET /api/bookings/:code`, `GET /api/options` |
| `/admin` | Chuyển hướng sang `/admin/dishes` | — |
| `/admin/bookings?show=all` | Danh sách đặt bàn, nút đổi trạng thái | `GET/PATCH /api/admin/bookings` |
| `/admin/dishes?mode&q&category&minPrice&maxPrice&available&ingredient&sort&page` | Bảng món ăn + tìm kiếm 4 mode, phân trang số trang | `GET /api/dishes`, `GET /api/options` |
| `/admin/dishes/new` | Form thêm món | `GET /api/chefs`, `/api/ingredients`, `/api/options`; `POST /api/dishes` |
| `/admin/dishes/:id` | Chi tiết món trong quản trị | `GET /api/dishes/:id`; đích sau khi thêm/sửa |
| `/admin/dishes/:id/edit` | Form sửa, điền sẵn từ DB | `GET /api/dishes/:id` + options; `PATCH /api/dishes/:id` |
| `/admin/dishes/:id/delete` | Trang xác nhận xóa | `GET /api/dishes/:id`; chỉ nút xác nhận mới gọi `DELETE` |
| `/admin/chefs?page` | Bảng đầu bếp kèm số món phụ trách | `GET /api/chefs` |
| `/admin/chefs/new` | Form thêm đầu bếp (`name`, `specialty`, `imageUrl`) | `POST /api/chefs` |
| `/admin/chefs/:id` | Chi tiết đầu bếp và các món phụ trách | `GET /api/chefs/:id` |
| `/admin/chefs/:id/edit` | Form sửa, điền sẵn từ DB | `GET /api/chefs/:id`; `PATCH /api/chefs/:id` |
| `/admin/chefs/:id/delete` | Trang xác nhận; nêu số món sẽ chuyển thành "Chưa phân công" | `GET /api/chefs/:id`; `DELETE /api/chefs/:id` |
| `/admin/ingredients?page` | Bảng nguyên liệu kèm số món đang dùng | `GET /api/ingredients` |
| `/admin/ingredients/new` | Form thêm nguyên liệu, ô đơn vị gợi ý từ options | `GET /api/options`; `POST /api/ingredients` |
| `/admin/ingredients/:id` | Chi tiết nguyên liệu và các món/định lượng dùng nó | `GET /api/ingredients/:id` |
| `/admin/ingredients/:id/edit` | Form sửa nguyên liệu | `GET /api/ingredients/:id` + options; `PATCH /api/ingredients/:id` |
| `/admin/ingredients/:id/delete` | Trang xác nhận; nêu số món sẽ bị gỡ khỏi công thức | `GET /api/ingredients/:id`; `DELETE /api/ingredients/:id` |
| `*` | Trang không tìm thấy | — |

Toàn bộ trạng thái tìm kiếm, bộ lọc và kiểu phân trang (`view`, `mode`, `q`, `category`,
`minPrice`, `maxPrice`, `available`, `ingredient`, `sort`, `page`, `show`) nằm trong URL search
params, nên link chia sẻ được và Reload giữ nguyên ngữ cảnh. `web/src/lib/dish-search.js` là
nơi duy nhất chuyển URL ⇄ tiêu chí ⇄ query API (`readCriteria`, `writeParams`, `apiQuery`,
`criteriaKey`); chỉ ghi lên URL các giá trị khác mặc định.

### 9.2. Tầng gọi API

`web/src/api/client.js` là **nơi duy nhất dùng `fetch`**:

- Base URL lấy từ `import.meta.env.VITE_API_URL`.
- Chỉ gửi `Content-Type: application/json` khi có body, nên request `GET` không tạo preflight.
- Nhận `AbortSignal` để huỷ request cũ.
- Phân biệt ba loại lỗi qua `ApiError.kind`:

| `kind` | Khi nào | SPA xử lý |
| --- | --- | --- |
| `network` | `fetch` bị reject (API tắt, CORS chặn) | Khung lỗi chung + nút "Thử lại" |
| `http` | Status không 2xx, hoặc body không phải JSON đúng dạng | Khung lỗi chung |
| `business` | HTTP 200 nhưng `ok: false` | `NOT_FOUND` → trang "Không tìm thấy"; `VALIDATION_FAILED` → lỗi dưới từng ô |

`web/src/api/index.js` tạo các hàm mỏng: `dishesApi.list/get/create/update/remove`,
`chefsApi`, `ingredientsApi`, `bookingsApi`, `adminBookingsApi`, `getStats`, `getOptions`.

### 9.3. Tải dữ liệu và gửi form

`useApiData(loader, deps)`:

- Gọi loader khi `deps` đổi; huỷ request cũ bằng `AbortController`.
- Trả `status` là `loading`, `ok`, `notFound` hoặc `error`, kèm `data`, `meta`, `retry()`.
- Kết quả được gắn với khoá của `deps`, nên phản hồi cũ không bao giờ ghi đè dữ liệu của URL
  mới khi người dùng chuyển trang nhanh.
- `notFound` chỉ đến từ `error.code === "NOT_FOUND"`, không dựa vào HTTP status.

`useSubmit()`:

- Chặn gửi đúp bằng `pendingRef`.
- `VALIDATION_FAILED` → `fieldErrors` theo đúng khóa API trả về, kèm thông báo chung.
- `NOT_FOUND` → "Bản ghi không còn tồn tại."
- Lỗi khác → "Không kết nối được máy chủ, vui lòng thử lại."

`DataStatus` render thống nhất bốn trạng thái: đang tải, lỗi + thử lại, 404, và nội dung.

Form gửi body JSON với kiểu đúng: `price` là `Number`, `available` là boolean, `chefId` là
`Number` hoặc `null`, `quantity` đổi dấu phẩy thành dấu chấm rồi `Number`, `guests` là
`Number`. Sau khi API trả `ok: true`, SPA điều hướng phía client sang trang chi tiết/danh
sách; không tải lại document.

### 9.4. Luồng dữ liệu tiêu biểu

**Xem thực đơn** (`/dishes?mode=fulltext&q=phở&category=Món chính&page=2`)

1. `MenuPage` đọc tiêu chí bằng `readCriteria(searchParams)`, kiểu phân trang `view` và `page`.
2. Gọi song song `GET /api/stats`, `GET /api/options`, và
   `GET /api/dishes?mode=fulltext&q=phở&category=Món%20chính&page=2&pageSize=9`.
3. API đọc tham số bằng `parseDishSearch`, chọn tập kết quả (full-text), đếm tổng, xếp theo điểm
   rồi lấy đúng trang bằng `LIMIT`/`OFFSET`.
4. JSON trả `data` + `meta`; component vẽ lưới món và thanh phân trang.

**Thêm món** (`/admin/dishes/new`)

1. Trang tải đầu bếp, nguyên liệu và danh mục để hiện trong form.
2. Submit gửi `POST /api/dishes` với body JSON.
3. `requireJson` kiểm tra Content-Type; handler gọi `validateDish(req.body, { chefs, ingredients })`.
4. Có lỗi → `ok: false`, `VALIDATION_FAILED`, `fields`; form hiện lỗi dưới từng ô và giữ nguyên
   giá trị đang nhập.
5. Hợp lệ → `prisma.dish.create` cùng công thức (`ingredients: { create: recipe }`), trả bản
   ghi vừa tạo; SPA chuyển sang `/admin/dishes/:id`.

**Sửa món** (`PATCH /api/dishes/:id`)

1. Kiểm tra id bằng `parseId()`.
2. Validate ở chế độ partial: chỉ trường có trong body được kiểm tra và ghi.
3. Nếu body có `ingredients`, toàn bộ công thức cũ bị thay bằng công thức mới trong cùng một
   lệnh `update` (`deleteMany: {}` + `create`).
4. Trả bản ghi sau khi sửa; SPA chuyển về trang chi tiết.

**Xóa món** (`DELETE /api/dishes/:id`)

1. Link "Xóa" chỉ mở trang xác nhận `/admin/dishes/:id/delete` (chỉ đọc).
2. Nút "Xác nhận xóa" mới gửi `DELETE /api/dishes/:id`.
3. API trả `data: null`; SPA chuyển về `/admin/dishes`.

**Quản trị đầu bếp và nguyên liệu** (`/admin/chefs`, `/admin/ingredients`)

1. Trang danh sách gọi `GET /api/chefs` hoặc `GET /api/ingredients` với `page` và `pageSize=10`,
   nhận `data` + `meta` để vẽ bảng và thanh phân trang.
2. Form thêm/sửa gửi `POST` hoặc `PATCH` với body JSON (`name`, `specialty`, `imageUrl` cho đầu
   bếp; `name`, `unit` cho nguyên liệu). Lỗi validate hiện dưới từng ô y như form món ăn.
3. Trang chi tiết đọc lại bản ghi theo `id`, kèm danh sách món liên quan; trang xóa chỉ gửi
   `DELETE` khi bấm "Xác nhận xóa".

**Đặt bàn**

1. Form gửi `name`, `phone`, `guests`, `date`, `time`, `note` dạng JSON.
2. API validate, đổi ngày + giờ Việt Nam thành `bookedAt`, sinh `code` 8 ký tự hex (thử lại tối
   đa 3 lần nếu trùng `P2002`).
3. SPA chuyển sang `/bookings/:code`; trang này đọc lại bản ghi từ API theo mã.

## 10. Phân trang

### 10.1. Phân trang ở server (offset)

Cả ba kiểu hiển thị dùng **cùng một API phân trang** (`GET /api/dishes?page&pageSize`):

```text
skip = (page - 1) × pageSize          # SQL: LIMIT pageSize OFFSET skip
take = pageSize
totalPages = ceil(total / pageSize)
```

`paginate(total, rawPage, pageSize)` trong `api/src/utils/helpers.js`:

```js
function paginate(total, rawPage, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(parseId(rawPage) || 1, totalPages);
  return { page, totalPages, skip: (page - 1) * pageSize, take: pageSize };
}
```

- Trang vượt quá được kẹp về trang cuối (áp dụng cho cả 4 mode tìm kiếm). `page` sai định dạng
  coi như trang 1. `NOT_FOUND` chỉ dành cho bản ghi không tồn tại.
- `total` là số món của **toàn bộ tập kết quả**, không phải số món của trang hiện tại; nó được đếm
  bằng **cùng điều kiện** (`where` hoặc cùng đoạn SQL `WHERE`) với truy vấn lấy món.
- Thứ tự luôn ổn định: mỗi kiểu sắp xếp thêm `id` làm khóa phụ (`DISH_SORTS`); full-text/fuzzy
  xếp theo điểm giảm dần rồi `id` tăng dần. Không có thứ tự ổn định thì một món có thể xuất hiện
  ở hai trang hoặc bị bỏ qua.
- Chọn tập kết quả trước (tìm kiếm + lọc), **sau đó** mới sắp xếp và cắt trang.

| Trang | Số dòng mỗi lần tải | Kiểu hiển thị | Query giữ lại |
| --- | --- | --- | --- |
| `/dishes` | 9 (lưới 3 × 3) | Số trang / Tải thêm / Cuộn vô hạn | `view`, tiêu chí tìm kiếm, `sort`, `page` (chỉ kiểu Số trang) |
| `/admin/dishes` | 10 | Số trang | tiêu chí tìm kiếm, `sort`, `page` |
| `/admin/chefs`, `/admin/ingredients` | 10 | Số trang | `page` |

`/admin/bookings` không phân trang: mặc định chỉ hiện lịch từ hôm nay trở đi nên danh sách
ngắn, và nhân viên cần thấy hết lịch sắp tới trên một trang.

### 10.2. Ba kiểu hiển thị ở thực đơn

Nút **Số trang | Tải thêm | Cuộn vô hạn** nằm cạnh ô sắp xếp (`web/src/components/ViewSwitch.jsx`),
ghi `?view=pages|more|scroll` lên URL. Đổi kiểu giữ nguyên tìm kiếm và bắt đầu lại từ đầu.

| Kiểu | Hành vi | Code |
| --- | --- | --- |
| Số trang (`pages`, mặc định) | Chọn trang để **thay** danh sách đang xem. Mỗi trang là một URL `?page=n` | `MenuPage` + `useApiData` + `Pagination` |
| Tải thêm (`more`) | Bấm "Tải thêm (x/y)" để **nối** 9 món tiếp theo vào danh sách | `useLoadMore` + `LoadMoreList` |
| Cuộn vô hạn (`scroll`) | Cuộn gần cuối (còn 200px) thì tự nối phần tiếp theo | `useLoadMore` + `IntersectionObserver` trong `LoadMoreList` |

### 10.3. Trạng thái của Tải thêm / Cuộn vô hạn

`web/src/lib/load-more.js` (hàm thuần, có test) giữ `{ key, items, nextPage, total, pending,
end, error }`:

- `key` là khóa của lần tìm (`criteriaKey(criteria)` + kiểu hiển thị). Đổi tìm kiếm, bộ lọc,
  sắp xếp hoặc kiểu → `useLoadMore` **huỷ request đang chạy** (`AbortController`), đưa danh sách
  về rỗng và tải trang 1. `applyPage` bỏ qua phản hồi có `key` cũ, nên **kết quả của hai lần tìm
  không bao giờ trộn vào nhau**.
- Chặn tải tiếp khi `pending` hoặc `end` đang đúng (`canLoad`), nên bấm nhanh hay observer gọi
  liên tục cũng chỉ có một request mỗi trang.
- Thành công: nối `data`, bỏ món trùng `id` (offset có thể lệch nếu dữ liệu đổi giữa hai lần
  tải), rồi tăng `nextPage`.
- Hết dữ liệu khi `page × pageSize ≥ total` hoặc trang trả về rỗng → hiện "Đã hiện hết N món".
- Lỗi ở trang sau: giữ các món đã tải, hiện "Không tải được phần tiếp theo. Thử lại" dưới lưới.

Cuộn vô hạn:

```js
const observer = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) loadNext();   // loadNext tự kiểm tra pending/end
}, { rootMargin: "200px 0px" });
observer.observe(sentinel);   // sentinel là một <div> đặt SAU lưới món, không phải từng món
// cleanup: observer.disconnect() khi rời trang, đổi tìm kiếm hoặc sau mỗi lần nối thêm
```

### 10.4. Mở lại link và thay đổi điều kiện (công bố theo slide 39)

| Thao tác | Số trang | Tải thêm / Cuộn vô hạn |
| --- | --- | --- |
| Tìm lại, đổi bộ lọc, đổi sắp xếp | Về trang 1 của kết quả mới | Danh sách mới, bắt đầu từ 9 món đầu |
| Chuyển trang / tải thêm | Giữ nguyên tiêu chí, chỉ đổi `page` trên URL | Giữ nguyên tiêu chí, nối trang tiếp |
| "Xóa bộ lọc" | Về `/dishes`, trang 1 | Về `/dishes` (kiểu Số trang) |
| Reload, copy link sang tab khác | **Khôi phục đúng tiêu chí và đúng trang** | Khôi phục tiêu chí và kiểu hiển thị, **tải lại từ đầu** (URL không lưu số trang đã tải) |
| Back/Forward | Khôi phục tiêu chí và trang; ô tìm kiếm cập nhật theo URL | Như Reload: tải lại từ đầu, kể cả khi Back từ trang chi tiết món |

Nhóm chọn "tải lại từ đầu" cho Tải thêm / Cuộn vô hạn vì giữ lại hàng trăm món đã tải cần cache
phía client và khôi phục vị trí cuộn; kiểu Số trang đã đáp ứng nhu cầu "mở lại đúng chỗ".

## 11. Tìm kiếm tại server

### 11.1. Bốn mode

Tìm kiếm luôn chạy ở server trên **toàn bộ** bảng `dishes`; SPA chỉ gửi tiêu chí. Mode quyết
định **quy tắc so khớp văn bản** của `q`; danh mục áp dụng ở mọi mode.

| Mode | Giao diện | Quy tắc cho `q` | Tiêu chí khác (AND) | Thứ tự |
| --- | --- | --- | --- | --- |
| `basic` (Cơ bản) | Một ô từ khóa | Tên **chứa** `q`, không phân biệt hoa/thường (`ILIKE`) | `category` | `sort` |
| `advanced` (Nâng cao) | Ô từ khóa + giá từ/đến, tình trạng, nguyên liệu | Như `basic` | `category`, `minPrice`, `maxPrice`, `available`, `ingredient` | `sort` |
| `fulltext` (Toàn văn) | Một ô từ khóa | `to_tsvector('simple', tên + mô tả) @@ plainto_tsquery('simple', q)`: món chứa **mọi từ** của `q` trong tên hoặc mô tả | `category` | `ts_rank` giảm dần, `id` tăng dần |
| `fuzzy` (Gần đúng) | Một ô từ khóa | `word_similarity(unaccent(q), unaccent(name)) >= 0.3` (`pg_trgm` + `unaccent`): tên có đoạn **gần giống** `q`, chịu được gõ sai và **gõ không dấu** | `category` | `word_similarity` giảm dần, `id` tăng dần |

- `basic` và `advanced` với cùng một `q` (không có tiêu chí khác) cho **cùng kết quả**
  (acceptance kiểm tra).
- `fulltext`/`fuzzy` không có từ khóa → không có tiêu chí văn bản, hoạt động như `basic` và dùng
  `sort`.
- `fulltext` dùng cấu hình `simple` cho **cả document và query** (không stemming, giữ dấu tiếng
  Việt, chỉ đưa về chữ thường). `description` có thể `NULL` nên document dùng
  `coalesce(description, '')`.
- `q` chỉ gồm dấu câu (`!!!`) cho `plainto_tsquery` rỗng → `ok: true`, `total: 0`, không lỗi.

**Ngưỡng fuzzy: `word_similarity ≥ 0.3`** (hằng `FUZZY_THRESHOLD`). Nhóm dùng
`word_similarity(q, name)` thay vì `similarity(q, name)` vì tên món dài 3–6 từ: `similarity` so
`q` với **cả tên** nên điểm thấp dù khách gõ đúng một phần. Đo trên Supabase:

| `q` | Tên món | `similarity` | `word_similarity` |
| --- | --- | --- | --- |
| `carbonra` | Mỳ Ý Carbonara | 0.41 | 0.67 |

**Gần đúng không phân biệt dấu (`unaccent`).** `pg_trgm` cắt chuỗi thành trigram và coi `ú`
khác `u`: `bun` → `{"  b"," bu","bun","un "}`, `bún` → `{"  b"," bú","bún","ún "}`, chỉ chung
1/4 trigram nên `word_similarity = 0.25 < 0.3` và gõ "bun" không ra món nào. Nhóm phát hiện khi
thử giao diện và sửa bằng extension `unaccent`, bỏ dấu **cả hai phía** trước khi so:

| `q` | Trước khi sửa | Sau khi sửa |
| --- | --- | --- |
| `bún` | 42 món | 42 món |
| `bun` | **0 món** (điểm cao nhất 0.25) | **42 món**, "Bún chả Hà Nội" đứng đầu (1.00) |
| `bun bo hue` | 0 món | "Bún bò Huế" đứng đầu |

Hệ quả: `pho` khớp cả "Phở ..." và "Khoai tây chiên phô mai" với điểm 1.00 — đúng tinh thần
"gần giống, không phân biệt dấu". Acceptance có dòng `fuzzy q=bun (không dấu) = q=bún`.

### 11.2. Ký tự đặc biệt là dữ liệu

`%` và `_` là ký tự đại diện của `LIKE`. Prisma `contains` **không** escape chúng (xem lỗi ở mục
16, câu 4), nên `buildDishWhere` gọi `escapeLike()` trước khi đưa `q` và `ingredient` vào
`contains`:

| Người dùng nhập | Giá trị gửi Prisma | Mẫu `ILIKE` | Khớp |
| --- | --- | --- | --- |
| `100%` | `100\%` | `%100\%%` | Tên chứa đúng `100%` (Combo 100% bò Úc) |
| `_` | `\_` | `%\_%` | Tên chứa đúng `_` (Trà_sữa_nhà_làm) |
| `\` | `\\` | `%\\%` | Tên chứa đúng `\` |

PostgreSQL dùng `\` làm ký tự escape mặc định của `LIKE`/`ILIKE` (deck dùng `ESCAPE '!'`; cùng
ý tưởng). Chuỗi không khớp trả danh sách rỗng, không trả toàn bộ món.

### 11.3. Cách cài đặt (`api/src/db/dish-search.js`)

- `basic`/`advanced`: `buildDishWhere(search)` tạo `where` của Prisma:
  `name: { contains, mode: "insensitive" }`, `category`, `price: { gte, lte }`, `available`,
  `ingredients: { some: { ingredient: { name: { contains, mode: "insensitive" } } } }`. Route
  gọi `prisma.dish.count({ where })` rồi `findMany({ where, orderBy, skip, take })`.
- `fulltext`/`fuzzy`: `rankedFilterSql(search)` tạo **một** đoạn `WHERE` bằng `Prisma.sql` (tham
  số hóa), dùng chung cho `countRanked` (`SELECT count(*)`) và `rankedIds` (`SELECT id ...
  ORDER BY score DESC, id ASC LIMIT/OFFSET`). Sau đó Prisma nạp món kèm `chef` và
  `_count.ingredients` theo danh sách id, rồi `orderByIds` sắp lại đúng thứ tự xếp hạng.
- Không có chỗ nào nối chuỗi người dùng vào SQL: mọi giá trị đi qua tham số `$1, $2...`.

### 11.4. SQL thực hiện tại PostgreSQL

Ghi lại bằng `LOG_SQL=1` trên dữ liệu seed (rút gọn danh sách cột và bỏ `BEGIN`/`COMMIT`):

**`basic`** — `/api/dishes?q=phở&page=1`

```sql
SELECT COUNT(*) FROM (SELECT "dishes"."id" FROM "dishes" WHERE "dishes"."name" ILIKE $1 OFFSET $2) AS "sub"
SELECT "dishes"."id", "dishes"."name", ... FROM "dishes" LEFT JOIN (SELECT "dishId", COUNT(*) ... GROUP BY "dishId") ...
  WHERE "dishes"."name" ILIKE $1 ORDER BY "dishes"."id" ASC LIMIT $2 OFFSET $3
```

**`advanced`** — `/api/dishes?mode=advanced&q=phở&minPrice=0&maxPrice=80000&available=true&ingredient=bò&page=1`

```sql
SELECT COUNT(*) FROM (SELECT "dishes"."id" FROM "dishes"
  WHERE ("dishes"."name" ILIKE $1 AND "dishes"."price" >= $2 AND "dishes"."price" <= $3
    AND "dishes"."available" = $4
    AND EXISTS(SELECT "t0"."dishId" FROM "dish_ingredients" AS "t0"
               LEFT JOIN "ingredients" AS "j1" ON ("j1"."id") = ("t0"."ingredientId")
               WHERE ("j1"."name" ILIKE $5 AND ("dishes"."id") = ("t0"."dishId") ...)))
  OFFSET $6) AS "sub"
-- truy vấn lấy món dùng đúng WHERE trên + ORDER BY "dishes"."id" ASC LIMIT ... OFFSET ...
```

**`fulltext`** — `/api/dishes?mode=fulltext&q=phở bò&page=1`

```sql
SELECT count(*) AS total FROM dishes
WHERE to_tsvector('simple', name || ' ' || coalesce(description, '')) @@ plainto_tsquery('simple', $1)

SELECT id FROM dishes
WHERE to_tsvector('simple', name || ' ' || coalesce(description, '')) @@ plainto_tsquery('simple', $1)
ORDER BY ts_rank(to_tsvector('simple', name || ' ' || coalesce(description, '')), plainto_tsquery('simple', $2)) DESC, id ASC
LIMIT $3 OFFSET $4

SELECT "dishes"."id", ... FROM "dishes" ... WHERE "dishes"."id" IN ($1,$2,...,$9)
```

**`fuzzy`** — `/api/dishes?mode=fuzzy&q=carbonra&page=1`

```sql
SELECT count(*) AS total FROM dishes WHERE word_similarity(unaccent($1), unaccent(name)) >= $2

SELECT id FROM dishes
WHERE word_similarity(unaccent($1), unaccent(name)) >= $2
ORDER BY word_similarity(unaccent($3), unaccent(name)) DESC, id ASC
LIMIT $4 OFFSET $5
```

### 11.5. Giao diện tìm kiếm

`web/src/components/SearchForm.jsx` dùng chung cho `/dishes` (trong phần đầu trang) và
`/admin/dishes` (trên bảng):

- Ô từ khóa + ô chọn kiểu tìm kiếm (danh sách lấy từ `GET /api/options` → `searchModes`).
- Chọn **Nâng cao** mở thêm: Giá từ, Giá đến (`type="number"`, `min="0"`), Tình trạng (Tất cả /
  Còn món / Tạm hết), Nguyên liệu.
- Bấm "Tìm" ghi tiêu chí lên URL và về trang đầu; Back/Forward làm ô nhập cập nhật theo URL.
- Khi xếp theo độ liên quan (`fulltext`/`fuzzy` có từ khóa), ô sắp xếp được thay bằng chữ
  "Sắp xếp: Độ liên quan".
- URL sửa tay sai (`?mode=advanced&minPrice=abc`) → API trả `VALIDATION_FAILED`; trang hiện
  "Điều kiện tìm kiếm không hợp lệ" kèm thông báo của từng trường và link "Xóa bộ lọc"
  (`SearchError.jsx`), không phải khung lỗi kết nối.

## 12. Luật validate

Validator nằm ở server (`api/src/utils/validators.js`) và nhận **body JSON đã đúng kiểu**.
HTML validation trong SPA chỉ giúp nhập nhanh; API luôn kiểm tra lại.

### 12.1. Món ăn (`POST` đầy đủ, `PATCH` một phần)

| Trường | Luật |
| --- | --- |
| `name` | Chuỗi bắt buộc, tối đa 100 ký tự |
| `price` | **Số nguyên JSON** từ 0 đến 2 147 483 647. Chuỗi `"50000"`, số thực `1.5`, số âm đều bị từ chối |
| `category` | Để trống/`null`, hoặc một trong: Khai vị, Món chính, Món phụ, Tráng miệng, Đồ uống |
| `description` | Không bắt buộc, tối đa 1000 ký tự |
| `imageUrl` | Không bắt buộc; nếu có phải là URL `http://` hoặc `https://` |
| `available` | Boolean; **không gửi** thì mặc định `true` |
| `chefId` | Số nguyên id của đầu bếp đang tồn tại, hoặc `null`/không gửi = chưa phân công |
| `ingredients` | Mảng `{ ingredientId, quantity }`. Mỗi nguyên liệu phải tồn tại, không trùng; `quantity` là số > 0 và ≤ 100 000 |

Khi `PATCH`, chỉ các khóa có trong body được kiểm tra và ghi; khóa lạ bị bỏ qua. Nếu body có
`ingredients`, danh sách đó thay toàn bộ công thức cũ.

Lỗi công thức dùng khóa `ingredients` cho lỗi chung và `ingredients.<id>` cho lỗi định lượng
của từng nguyên liệu.

### 12.2. Đầu bếp và nguyên liệu

| Đối tượng | Trường | Luật |
| --- | --- | --- |
| Đầu bếp | `name` | Bắt buộc, tối đa 100 ký tự |
| | `specialty` | Bắt buộc, tối đa 150 ký tự |
| | `imageUrl` | Như món ăn |
| Nguyên liệu | `name` | Bắt buộc, tối đa 100 ký tự |
| | `unit` | Bắt buộc, tối đa 20 ký tự. Không giới hạn trong danh sách gợi ý |

`INGREDIENT_UNITS` trong `options` chỉ là gợi ý cho giao diện; API không bắt buộc đơn vị phải
nằm trong danh sách này.

### 12.3. Đặt bàn

| Trường | Luật |
| --- | --- |
| `name` | Bắt buộc, tối đa 100 ký tự |
| `phone` | Chuỗi 10 chữ số bắt đầu bằng `0`; bỏ qua khoảng trắng, dấu chấm, dấu gạch ngang trước khi kiểm tra và lưu chỉ chữ số |
| `guests` | **Số nguyên JSON** từ 1 đến 20 |
| `date` | Chuỗi `YYYY-MM-DD`, là ngày có thật, không ở quá khứ |
| `time` | Một trong các khung 10:00 – 21:00, mỗi 30 phút |
| `date` + `time` | Phải ở tương lai và trong vòng 60 ngày; tính theo giờ Việt Nam (UTC+7) |
| `note` | Không bắt buộc, tối đa 500 ký tự |
| `status` (PATCH admin) | `pending`, `confirmed` hoặc `cancelled` |

## 13. Kiểm thử và kiểm tra thủ công

### 13.1. Test tự động

```bash
cd api
npm test            # 71 test: app, validators, helpers, dish-search, catalog
```

Các test này không cần database: phần HTTP dùng `createApp` trên cổng ngẫu nhiên, phần còn lại
là hàm thuần. Phần mới của Block 7:

| File | Kiểm tra |
| --- | --- |
| `validators.test.js` | `parseDishSearch`: rỗng / `false` / `0`, giá sai định dạng, `minPrice > maxPrice`, `available` lạ, `mode` lạ, `q` > 100 ký tự, mode khác `advanced` bỏ qua tham số nâng cao |
| `helpers.test.js` | `escapeLike`: `%`, `_`, `\` thành ký tự thường |
| `dish-search.test.js` | `where` của basic/advanced (0 và `false` là tiêu chí thật, basic = advanced với cùng `q`); SQL của fulltext (`simple`, tham số `$1`) và fuzzy (`word_similarity`, ngưỡng 0.3); `orderByIds` |
| `catalog.test.js` | Đúng 1.500 món, tên không trùng, có tên chứa `%`/`_`, công thức 1–6 dòng hợp lệ, ≥ 10% món tạm hết, sinh cố định |
| `app.test.js` | `GET /api/options` có `searchModes`; tiêu chí sai → HTTP 200 + `VALIDATION_FAILED` |

```bash
cd web
npm test            # 22 test: client, dish-search (URL ⇄ tiêu chí), load-more (nối, khử trùng, bỏ phản hồi cũ)
npm run build       # kiểm tra SPA build được
```

Nếu `node --test` trong môi trường không mở rộng mẫu glob, truyền trực tiếp file:

```bash
# api
node --test test/app.test.js test/validators.test.js test/helpers.test.js test/dish-search.test.js test/catalog.test.js
# web
node --test src/api/client.test.js src/lib/dish-search.test.js src/lib/load-more.test.js
```

### 13.2. Acceptance test

Cần API đang chạy và database đã seed:

```bash
cd api
npm run acceptance
```

Script kiểm tra các nhóm món ăn (kèm thống kê, tùy chọn và CORS), **tìm kiếm**, đầu bếp,
nguyên liệu và đặt bàn. Mặc định dùng `http://localhost:3000` và origin `http://localhost:5173`;
có thể ghi đè bằng biến môi trường `API_URL` và `ORIGIN`.

Các dòng tìm kiếm của Block 7 (chạy trên 1.500 món đã seed, tất cả PASS):

```text
PASS dishes: q=% là ký tự thường
PASS dishes: q=_ là ký tự thường
PASS search: fulltext q=phở -> tên/mô tả chứa phở
PASS search: fulltext q chỉ có dấu câu -> rỗng, không lỗi
PASS search: fuzzy q=carbonra -> Carbonara đứng đầu
PASS search: fuzzy q=bun (không dấu) = q=bún
PASS search: basic và advanced cùng q cho cùng kết quả
PASS search: advanced available=false chỉ món tạm hết
PASS search: advanced minPrice=0&maxPrice=60000 trong khoảng
PASS search: advanced ingredient=mozzarella
PASS search: advanced minPrice=abc -> VALIDATION_FAILED
PASS search: mode=xyz -> VALIDATION_FAILED
PASS search: basic bỏ qua tham số nâng cao còn sót
PASS search: fulltext page vượt -> trang cuối
PASS search: fuzzy đi hết các trang = total, không trùng
```

- Bản ghi do script tạo ở ba bảng chính được xóa lại bằng API trong `finally`.
- **Đặt bàn không có endpoint xóa**, nên các yêu cầu tên `ZZ Acceptance` sẽ còn lại trong DB.
  Chạy `npm run db:seed` để dọn.

### 13.3. Kiểm tra bằng `curl`

```bash
# Danh sách có phân trang
curl -i "http://localhost:3000/api/dishes?page=1&pageSize=9"

# Tìm kiếm + lọc + sắp xếp
curl -i "http://localhost:3000/api/dishes?q=ph%E1%BB%9F&category=M%C3%B3n%20ch%C3%ADnh&sort=price-asc"

# Bốn mode tìm kiếm (Block 7)
curl "http://localhost:3000/api/dishes?q=%25&page=1"                                   # q=% -> 2 món chứa đúng "%"
curl "http://localhost:3000/api/dishes?mode=advanced&available=false&maxPrice=80000&ingredient=t%E1%BB%8Fi&page=1"
curl "http://localhost:3000/api/dishes?mode=fulltext&q=ph%E1%BB%9F%20b%C3%B2&page=1"     # phở bò, xếp theo ts_rank
curl "http://localhost:3000/api/dishes?mode=fuzzy&q=carbonra&page=1"                   # gõ sai vẫn ra Mỳ Ý Carbonara
curl "http://localhost:3000/api/dishes?mode=advanced&minPrice=500&maxPrice=100"        # VALIDATION_FAILED, fields.maxPrice

# Bản ghi không tồn tại: HTTP 200, ok:false, NOT_FOUND
curl -i "http://localhost:3000/api/dishes/999999"

# Id sai định dạng: cũng là NOT_FOUND
curl -i "http://localhost:3000/api/dishes/abc"

# Validate sai: HTTP 200, ok:false, VALIDATION_FAILED
curl -i -X POST "http://localhost:3000/api/dishes" \
  -H "Content-Type: application/json" \
  -d '{"name":"","price":-5}'

# Tạo hợp lệ: HTTP 200, ok:true
curl -i -X POST "http://localhost:3000/api/dishes" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cơm tấm","price":50000,"category":"Món chính"}'

# Sửa một phần
curl -i -X PATCH "http://localhost:3000/api/dishes/1" \
  -H "Content-Type: application/json" \
  -d '{"price":60000}'

# Xóa
curl -i -X DELETE "http://localhost:3000/api/dishes/1"

# Sai Content-Type: HTTP 400, không có ok
curl -i -X POST "http://localhost:3000/api/dishes" \
  -H "Content-Type: text/plain" -d 'x'

# Route lạ: HTTP 404, không có ok
curl -i "http://localhost:3000/api/bok"
```

Trên PowerShell, `curl` có thể là alias của `Invoke-WebRequest`; dùng `curl.exe` để có hành vi
như trên.

Có thể dùng `api/requests.http` với REST Client của VS Code để chạy cùng bộ request.

### 13.4. Kiểm tra SPA

Mở DevTools → Network:

- `/` chuyển sang `/dishes`; các bộ lọc, sắp xếp và số trang đều nằm trong URL.
- Tìm "phở" → URL có `q=phở`; gõ "PHỞ" vẫn ra kết quả.
- Reload hoặc mở link trực tiếp `/dishes?page=2` vẫn đúng trang.
- Dừng API rồi tải lại trang → khung "Không tải được dữ liệu" + nút "Thử lại".
- Mở `/dishes/999999` → khung 404 của SPA. Network hiện status `200` vì đây là lỗi nghiệp vụ;
  kiểm tra body có `ok: false` và `code: NOT_FOUND`.
- Quản trị món ăn, đầu bếp, nguyên liệu: thêm/sửa/xóa không tải lại document; Network chỉ có
  request JSON tương ứng.
- Trang xóa của cả ba tài nguyên: chỉ khi bấm "Xác nhận xóa" mới có request `DELETE`.
- Gửi trùng nút submit: nút bị vô hiệu trong lúc chờ nên chỉ có một request.
- Đặt bàn: sau khi gửi, URL chuyển thành `/bookings/<mã 8 ký tự hex>`.
- Đổi trạng thái đặt bàn ở `/admin/bookings` → có `PATCH /api/admin/bookings/:id`, danh sách
  được tải lại.

Block 7 — nghiệm thu theo slide 40:

| Thao tác | Kết quả cần thấy |
| --- | --- |
| Kiểu **Số trang**: bấm trang 2, 3 | URL đổi `?page=`; Network: mỗi lần **một** request `GET /api/dishes?...&page=n&pageSize=9`, `data` có 9 món |
| Kiểu **Tải thêm**: bấm "Tải thêm" 3 lần | 36 món, không trùng; Network: các request `page=2,3,4`; nút bị vô hiệu khi đang tải; cuối danh sách hiện "Đã hiện hết N món" |
| Kiểu **Cuộn vô hạn**: cuộn xuống | Tự nối 9 món khi còn ~200px tới cuối; dừng khi hết |
| Đổi danh mục hoặc sắp xếp khi đang Tải thêm | Danh sách bắt đầu lại với điều kiện mới; không còn món của điều kiện cũ (request cũ bị huỷ — Network hiện `(canceled)`) |
| Tìm "phở" chế độ Toàn văn, chuyển sang trang 2 | URL giữ `mode=fulltext&q=phở`, chỉ đổi `page` |
| Nâng cao: Tạm hết + Giá đến 80000 + nguyên liệu "tỏi" | Chỉ món tạm hết, giá ≤ 80.000đ, có tỏi trong công thức |
| Gần đúng "carbonra" | "Mỳ Ý Carbonara" đứng đầu; ô sắp xếp hiện "Sắp xếp: Độ liên quan" |
| Gõ `%` ở chế độ Cơ bản | 2 món ("Combo 100% bò Úc", "Bánh 50% đường"), không phải cả thực đơn |
| "Xóa bộ lọc", Reload, mở lại link | Như bảng ở mục 10.4 |
| Sửa tay `?mode=advanced&minPrice=abc` | Khung "Điều kiện tìm kiếm không hợp lệ" + "Giá từ phải là số nguyên không âm." |
| `/admin/dishes`: tìm Nâng cao, bấm trang 2 | Bảng giữ tiêu chí; "N món phù hợp · Trang 2/x" |

### 13.5. Kiểm tra CORS

```bash
curl -i -X OPTIONS "http://localhost:3000/api/dishes/1" \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: PATCH" \
  -H "Access-Control-Request-Headers: content-type"
```

Kết quả mong đợi: `204`, `Access-Control-Allow-Origin: http://localhost:5173` (không phải
`*`). Gửi cùng request với `Origin: http://evil.test` sẽ không có header
`Access-Control-Allow-Origin`.

## 14. Trạng thái triển khai và giới hạn đã biết

| Hạng mục | Trạng thái |
| --- | --- |
| API JSON cho món ăn, đầu bếp, nguyên liệu | Đã có đủ CRUD |
| Hình dạng phản hồi thống nhất, mã lỗi | Đã có (`respond.js`) |
| CORS theo allowlist | Đã có |
| SPA: thực đơn, chi tiết món, giới thiệu | Đã có |
| SPA: đặt bàn cho khách, xác nhận theo mã | Đã có |
| SPA: quản trị món ăn (danh sách, thêm, chi tiết, sửa, xóa) | Đã có |
| SPA: quản trị đầu bếp (danh sách, thêm, chi tiết, sửa, xóa) | Đã có |
| SPA: quản trị nguyên liệu (danh sách, thêm, chi tiết, sửa, xóa) | Đã có |
| SPA: quản trị đặt bàn | Đã có |
| Seed 1.500 món, migration tìm kiếm | Đã có (`npm run db:search`, `npm run db:seed`) |
| Tìm kiếm 4 mode ở API, thực đơn và trang quản lý món | Đã có |
| Ba kiểu phân trang ở thực đơn | Đã có |
| Đăng nhập / phân quyền | **Không có**. Mọi endpoint quản trị đều công khai, nằm ngoài phạm vi bài này; không dùng cho production |
| Test | Unit test cho API và SPA (logic thuần); acceptance script cần API chạy. Không có test end-to-end trình duyệt: giao diện ba kiểu phân trang được kiểm tra thủ công theo mục 13.4 |
| Thư mục `evidence/` | Có `bug-like-wildcard.md` (lỗi `%`/`_`, trước và sau khi sửa). **Ảnh chụp màn hình/Network do nhóm bổ sung** theo danh sách ở mục 17 |

Các điểm cần biết thêm:

- Xóa đầu bếp không xóa món: các món chuyển thành "Chưa phân công". Xóa nguyên liệu chỉ gỡ nó
  khỏi công thức của món, món ăn vẫn còn. Hai trang xác nhận đều nêu rõ hệ quả này trước khi
  người dùng bấm nút.
- API không có endpoint xóa đặt bàn; nhân viên chỉ đổi trạng thái.
- Không có lịch sử migration: project dùng `prisma db push`. Khi triển khai thật nên chuyển
  sang `prisma migrate`.
- Phân trang offset chậm dần với bảng rất lớn (`OFFSET` vẫn phải đọc qua các dòng bị bỏ) và có
  thể lặp/sót dòng nếu dữ liệu thay đổi giữa hai lần tải. Với 1.500 món thì không đáng kể; đổi
  lại được nhảy tới trang bất kỳ. Tải thêm/Cuộn vô hạn khử trùng theo `id` nên không hiện một món
  hai lần, nhưng vẫn có thể sót một món nếu có món bị xóa giữa hai lần tải.
- Đếm (`count`) và lấy trang là hai truy vấn riêng, không nằm trong transaction; nếu dữ liệu
  đổi đúng giữa hai truy vấn, "Trang x/y" có thể lệch một trang trong một lần tải.
- `GET /api/dishes` không có `page` vẫn trả **toàn bộ** danh sách (giữ hành vi Block 6). Với
  1.500 món phản hồi khoảng **1 MB**; SPA không gọi dạng này cho thực đơn hay bảng quản lý.
- Full-text dùng cấu hình `simple` (theo yêu cầu slide 38): không bỏ dấu, nên "pho" không khớp
  "phở" ở chế độ Toàn văn — dùng chế độ Gần đúng (đã bỏ dấu) khi gõ không dấu. Không có từ đồng
  nghĩa hay stemming tiếng Việt.
- Fuzzy dùng `word_similarity(...) >= 0.3` trong `WHERE` nên PostgreSQL quét tuần tự bảng
  `dishes` (index trigram chỉ được dùng với toán tử `%`/`<%`). Với 1.500 món, mỗi truy vấn vẫn
  nhanh; bảng lớn hơn nên chuyển sang `q <% name` và đặt `pg_trgm.word_similarity_threshold`.
- Index full-text và trigram nằm ngoài schema Prisma: chạy lại `npm run db:search` sau mỗi
  `db:push`.
- Khi triển khai SPA lên static host, cần cấu hình fallback mọi đường dẫn về `index.html` để
  deep link như `/dishes/1` hoạt động. Vite dev và `vite preview` đã làm việc này sẵn.
- `VITE_API_URL` và `CORS_ORIGIN` là hai cấu hình phải khớp nhau; đổi cổng một bên mà không
  đổi bên kia sẽ khiến SPA không gọi được API.

## 15. Quyết định kỹ thuật

| Quyết định | Lý do | Đánh đổi |
| --- | --- | --- |
| Tách `api/` và `web/`, chạy hai origin | Đúng yêu cầu REST API + SPA; backend không phụ thuộc giao diện | Phải cấu hình CORS và hai tiến trình |
| Lỗi nghiệp vụ trả HTTP `200` + `ok: false` | Một hình dạng phản hồi cho mọi kết quả của handler; client phân biệt bằng `error.code` | Không thể chỉ nhìn status; phải đọc body. Đã ghi rõ ở mục 7 |
| Chỉ cho origin trong `CORS_ORIGIN` | Không mở API cho mọi website; preflight trả đúng origin | Thêm một biến môi trường và dễ lỗi khi đổi cổng |
| Prisma 6 | Quan hệ, lọc, sắp xếp, phân trang; tham số hóa sẵn; Prisma 7 đổi cách cấu hình (`prisma.config.ts`, driver adapter) | Không thấy ngay SQL sinh ra; cần `prisma generate` |
| `db push` (Code-first) | Bài tập chưa cần giữ lịch sử dữ liệu; một lệnh là đồng bộ schema | Không có migration để rollback |
| Một `PrismaClient` dùng chung | Tránh mở nhiều pool, đặc biệt khi `node --watch` khởi động lại | Không có |
| Một API client duy nhất trong SPA | Mọi request đi qua cùng chỗ xử lý lỗi, base URL và header | Không có |
| `useApiData` huỷ request cũ | Tránh phản hồi của trang trước ghi đè dữ liệu trang mới | Thêm một hook và một `AbortController` mỗi lần tải |
| Không dùng global store | Mỗi trang tự tải dữ liệu theo URL; không có trạng thái ẩn trong bộ nhớ | Chuyển trang tải lại dữ liệu; với API nhỏ thì chấp nhận được |
| `useSubmit` chặn gửi đúp | Tránh tạo hai bản ghi khi bấm nhanh hai lần | Chỉ chặn trong một tab/phiên |
| Mã đặt bàn ngẫu nhiên 8 ký tự hex | `id` tăng dần đoán được; mã khó đoán hơn và không lộ thông tin khách khác | Vẫn có thể trùng; xử lý `P2002` bằng cách thử lại tối đa 3 lần |
| Seed xóa trước rồi nạp | Chạy lại luôn ra cùng trạng thái, tiện trước khi demo | Xóa cả đặt bàn và dữ liệu người dùng thêm |
| Tailwind qua PostCSS | Bản build thật, không phụ thuộc CDN; giữ bảng màu thương hiệu | Cần `npm run build` khi triển khai |
| Không dùng `dangerouslySetInnerHTML` | React tự escape dữ liệu; giảm nguy cơ XSS | Không render được HTML tùy ý từ API |
| Phân trang, lọc, sắp xếp ở **server** (Block 7) | 1.500 món: tải hết về browser là ~1 MB; lọc/sắp ở client chỉ đúng trên phần đã tải | Mỗi thao tác là một request; cần API phản hồi nhanh |
| Prisma cho basic/advanced, SQL tham số hóa cho fulltext/fuzzy | Giữ code Prisma sẵn có (quan hệ, đếm nguyên liệu); Prisma không có full-text/trigram cho PostgreSQL | Hai cách truy vấn; ranked mode mất thêm một truy vấn nạp món theo id |
| Migration bằng file SQL (`db:search`) | `db push` không tạo được extension và index biểu thức | Phải nhớ chạy lại sau `db:push` |
| `word_similarity` thay vì `similarity` | Tên món nhiều từ; người dùng gõ một phần tên (mục 11.1) | Khớp rộng hơn với từ khóa ngắn |
| Tham số nâng cao bị bỏ qua (không báo lỗi) ở mode khác `advanced` | Đổi mode trên giao diện không sinh lỗi từ giá trị còn sót | Gửi `minPrice` với `mode=basic` không có tác dụng và không được báo |
| Tải thêm/Cuộn vô hạn mở lại từ đầu | Không cần cache phía client và khôi phục vị trí cuộn | Reload/Back mất phần đã tải; muốn mở lại đúng chỗ thì dùng kiểu Số trang |
| Seed sinh cố định bằng PRNG có seed | Kết quả tìm kiếm, số liệu trong README và bằng chứng tái hiện được | Món sinh tự động có tên/mô tả theo khuôn mẫu |

## 16. Trình bày quyết định của nhóm

### Câu 1. Chức năng nào dùng client paging, server paging hoặc AJAX?

| Chức năng | Phân trang | Cập nhật giao diện | Lý do |
| --- | --- | --- | --- |
| Thực đơn `/dishes` — Số trang | **Server** (`LIMIT/OFFSET`) | **AJAX**: SPA gọi `GET /api/dishes?page=n&pageSize=9`, React vẽ lại lưới; URL đổi bằng History API, không tải lại trang HTML | Mỗi trang chỉ 9 món (~5,6 KB); `?page=n` trên URL nên Reload/copy link mở đúng trang |
| Thực đơn — Tải thêm | **Server** | **AJAX**, nối kết quả vào danh sách đang có | Người dùng lướt liên tục; mỗi lần bấm chỉ tải 9 món tiếp theo |
| Thực đơn — Cuộn vô hạn | **Server** | **AJAX**, kích hoạt bằng `IntersectionObserver` | Như Tải thêm, không cần bấm |
| Quản lý món `/admin/dishes` | **Server**, 10 dòng/trang | **AJAX** | Nhân viên cần nhảy tới trang bất kỳ và mở lại đúng trang để sửa tiếp |
| Quản lý đầu bếp, nguyên liệu | **Server**, 10 dòng/trang | **AJAX** | Giữ như Block 6 |
| Đặt bàn `/admin/bookings` | Không phân trang | AJAX | Mặc định chỉ lịch từ hôm nay, danh sách ngắn |

Nhóm **không dùng client paging**: với 1.500 món, tải toàn bộ là ~1 MB JSON cho mỗi lần mở
trang, trong khi người dùng thường chỉ xem vài chục món đầu. Server paging chỉ tải đúng phần
cần xem; khi chuyển trang chỉ có một request nhỏ.

### Câu 2. Filter và sort đặt ở đâu, áp dụng cho dữ liệu nào?

| Thao tác | Đặt ở | Áp dụng cho |
| --- | --- | --- |
| Lọc danh mục (ô danh mục / nút "Tất cả, Khai vị...") | Server, mọi mode | **Toàn bộ 1.500 món**, trước khi phân trang |
| Lọc khoảng giá, tình trạng, nguyên liệu | Server, mode Nâng cao | Toàn bộ món, kết hợp AND với từ khóa và danh mục |
| Tìm kiếm (4 mode) | Server | Toàn bộ món |
| Sắp xếp (Mặc định, Mới nhất, Giá ↑/↓, Tên A→Z) | Server, `ORDER BY ... , id` | **Toàn bộ tập kết quả** sau khi lọc, trước khi cắt trang |
| Xếp theo độ liên quan | Server, `ts_rank` / `word_similarity` | Toàn bộ tập kết quả của fulltext/fuzzy |

Không có thao tác nào chỉ lọc/sắp trên trang đang hiển thị: nếu lọc ở client sau khi mới tải 9
món, kết quả "Giá thấp → cao" chỉ đúng trong 9 món đó chứ không đúng với cả thực đơn (slide 19).
Thứ tự luôn là: **chọn tập kết quả → đếm `total` cùng điều kiện → sắp xếp → cắt trang**.

### Câu 3. Network cho thấy tải toàn bộ hay từng phần?

**Từng phần.** Mở DevTools → Network → lọc `Fetch/XHR` trên `/dishes`:

| Thao tác | Request trong Network | Kích thước phản hồi |
| --- | --- | --- |
| Mở `/dishes` | `GET /api/dishes?page=1&pageSize=9` (+ `/api/stats`, `/api/options`) | ~5,6 KB, `data` 9 món, `meta.total = 1500` |
| Bấm trang 2 | `GET /api/dishes?page=2&pageSize=9` | ~5,6 KB |
| Tìm Toàn văn "phở" | `GET /api/dishes?mode=fulltext&q=phở&page=1&pageSize=9` | ~6,3 KB |
| Tải thêm 3 lần | 3 request `page=2,3,4` | mỗi request 9 món |
| (so sánh) tải toàn bộ `GET /api/dishes` | không được SPA gọi ở thực đơn | **~1 MB** |

`meta.total` cho biết tổng số món của kết quả (để tính số trang và biết khi nào hết) mà không
cần tải chúng về.

### Câu 4. Nhóm đã phát hiện lỗi nào và chứng minh sửa đúng ra sao?

**Lỗi:** tìm `%` hoặc `_` trả về **toàn bộ thực đơn**. Ô tìm kiếm của Block 6 dùng Prisma
`name: { contains: q, mode: "insensitive" }`. Prisma sinh `name ILIKE '%' || q || '%'` nhưng
**không escape** `%` và `_` trong `q`, nên `q=%` thành mẫu `%%%` (khớp mọi tên) và `q=_` thành
`%_%` (khớp mọi tên có ít nhất một ký tự). Đây đúng là tình huống slide 25 cảnh báo.

**Cách tái hiện** (seed Block 6, 51 món, không món nào có `%`/`_` trong tên):

```bash
curl "http://localhost:3000/api/dishes?q=%25&page=1&pageSize=1"   # kỳ vọng total 0, thực tế 51
curl "http://localhost:3000/api/dishes?q=%5F&page=1&pageSize=1"   # kỳ vọng total 0, thực tế 51
```

**Bằng chứng trước khi sửa:** commit `407ae17` ("test: q=% và q=_ trả toàn bộ món (lỗi, chưa
sửa)") thêm hai dòng acceptance; chạy trên code chưa sửa:

```text
FAIL dishes: q=% là ký tự thường — total = 51, bằng toàn bộ 51 món
FAIL dishes: q=_ là ký tự thường — total = 51, bằng toàn bộ 51 món
```

**Sửa:** commit `83f981e` thêm `escapeLike()` (`api/src/utils/helpers.js`) thêm `\` trước `\`,
`%`, `_`; mọi chỗ dùng `contains` cho từ khóa và nguyên liệu đi qua hàm này.

**Bằng chứng sau khi sửa:**

- Hai dòng acceptance trên chuyển thành `PASS`, phản hồi `total: 0` với seed 51 món.
- Unit test `escapeLike` (`api/test/helpers.test.js`) và `buildDishWhere` (`dish-search.test.js`)
  giữ hành vi này.
- Với seed 1.500 món (có 3 món chứa ký tự đặc biệt): `q=%` → 2 món ("Combo 100% bò Úc", "Bánh
  50% đường"), `q=_` → 1 món ("Trà_sữa_nhà_làm").

Toàn bộ log trước/sau: `evidence/bug-like-wildcard.md`.

## 17. Bằng chứng nộp

| Yêu cầu (slide 42) | Bằng chứng | Ở đâu |
| --- | --- | --- |
| Số bản ghi trong Supabase và script seed ≥ 1.000 món | `SELECT count(*) FROM dishes` → **1500**; `ingredients` 103, `dish_ingredients` 5.094. Script: `api/prisma/seed.js` + `api/prisma/catalog.js`, chạy `npm run db:seed` | Mục 6; ảnh Table Editor/SQL Editor của Supabase: `evidence/` (nhóm bổ sung) |
| Demo ba kiểu hiển thị phân trang và filter/sort | Kịch bản ở mục 13.4 | Video/ảnh: `evidence/` (nhóm bổ sung) |
| URL search, Network và query tại PostgreSQL | URL mẫu ở mục 13.3; Network ở câu 3 mục 16; SQL thật (`LOG_SQL=1`) ở mục 11.4 | Ảnh Network: `evidence/` (nhóm bổ sung) |
| Một lỗi đã phát hiện, cách tái hiện và bằng chứng sau khi sửa | Lỗi `%`/`_` (câu 4 mục 16) | `evidence/bug-like-wildcard.md`, commit `407ae17` (trước) và `83f981e` (sau) |

Ảnh nên chụp cho `evidence/`:

1. Supabase SQL Editor: `SELECT count(*) FROM dishes;` = 1500.
2. `/dishes` ở ba kiểu (Số trang trang 2, Tải thêm sau vài lần bấm, Cuộn vô hạn) kèm tab Network.
3. Bốn mode tìm kiếm với URL trên thanh địa chỉ (ví dụ các URL ở mục 13.3).
4. Terminal API chạy với `LOG_SQL=1` khi tìm Toàn văn và Gần đúng.
5. `/admin/dishes` tìm Nâng cao, đang ở trang 2.

## 18. Tổng kết

- **Dữ liệu nằm trong database; mỗi lần tải trang, SPA đọc lại qua API.** Không trang nào nhận
  bản ghi từ trang trước; chi tiết món và form sửa đều lấy dữ liệu theo `id` trong URL.
- **REST tách backend khỏi giao diện.** Backend chỉ biết JSON; giao diện có thể thay đổi mà
  không sửa API, miễn giữ hợp đồng `{ ok, data, meta? }` và các endpoint.
- **CORS là cấu hình bắt buộc, không dùng proxy hay `*`.** Origin của SPA phải nằm trong
  `CORS_ORIGIN`.
- **Validate ở server, escape ở client.** API kiểm tra kiểu và giá trị; React render dữ liệu
  bằng JSX nên nội dung người dùng không được chèn thành HTML.
- **Phân trang, lọc, sắp xếp và trạng thái điều hướng đều đi qua URL/API.** Link chia sẻ được
  và Reload vẫn đúng ngữ cảnh. Giá trị đang gõ trong form chỉ nằm trong bộ nhớ cho tới khi
  gửi; dữ liệu đã ghi luôn đọc lại từ database.
- **Thao tác trên toàn bộ kết quả thì làm ở server.** Tìm kiếm, lọc, sắp xếp chạy trên cả 1.500
  món rồi mới cắt trang; browser chỉ nhận phần đang xem. Ba kiểu hiển thị chỉ khác cách **ghép
  các trang** ở giao diện, còn API phân trang là một.
- **Ký tự người dùng nhập là dữ liệu.** `%`, `_` được escape; mọi giá trị vào SQL đều là tham số.
- **Chọn quy tắc so khớp theo nhu cầu:** chứa chuỗi (basic/advanced), từ trong tên + mô tả
  (full-text), gần đúng khi gõ sai (fuzzy) — và công bố rõ cấu hình (`simple`, ngưỡng 0.3).
