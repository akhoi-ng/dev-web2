# Lửa Hồng - REST API và SPA

Báo cáo Block 6 ("REST API và SPA") của nhóm. Ứng dụng nhà hàng được tách thành **hai
package trong cùng repository**:

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

| Hạng mục | Cách project đáp ứng |
| --- | --- |
| Backend chỉ trả JSON | `api/src/http/respond.js` bọc mọi phản hồi của handler trong `{ ok, data, meta? }` hoặc `{ ok: false, error }` |
| REST cho ba tài nguyên | `GET/POST /api/dishes`, `/api/chefs`, `/api/ingredients`; `GET/PATCH/DELETE /api/<res>/:id` |
| SPA ở origin khác | `web/` chạy Vite cổng 5173, gọi `VITE_API_URL` (giá trị mẫu `http://localhost:3000`) |
| CORS thật, không dùng proxy | `api/src/http/cors.js` chỉ cho các origin trong `CORS_ORIGIN`, không dùng `*` |
| Giữ dữ liệu và nghiệp vụ của bài trước | Cùng schema Prisma, seed, quy tắc validate, quan hệ món – đầu bếp – nguyên liệu, đặt bàn |
| Phân trang, lọc, sắp xếp | Query param trên `GET /api/dishes`; `?page` và `?pageSize` cho cả ba danh sách |
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
│   ├── db/prisma.js                  # một PrismaClient dùng chung (giữ trên globalThis khi dev)
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
│       ├── helpers.js                # parseId, paginate, pageParams, todayInVietnam, asyncHandler...
│       └── validators.js             # validateDish/Chef/Ingredient/Booking, hằng số dùng chung
├── prisma/
│   ├── schema.prisma                 # Dish, Chef, Ingredient, DishIngredient, Booking
│   └── seed.js                       # xóa dữ liệu cũ rồi nạp 51 món, 5 đầu bếp, 45 nguyên liệu
├── test/
│   ├── app.test.js                   # response shape, 400/404/413/415, CORS, preflight
│   ├── validators.test.js            # luật validate và chế độ PATCH một phần
│   └── helpers.test.js               # parseId (kể cả giới hạn INT4), paginate, pageParams, ngày giờ
├── scripts/acceptance.mjs            # chạy toàn bộ bảng REST + CORS + đặt bàn
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
│   │   ├── useSubmit.js              # chặn gửi đúp, gom fieldErrors/formError
│   │   └── useDocumentTitle.js
│   ├── components/                   # Layout, Pagination, DataStatus, FieldError, ảnh/avatar...
│   ├── pages/
│   │   ├── MenuPage.jsx              # thực đơn: tìm, lọc, sắp xếp, phân trang
│   │   ├── DishPage.jsx              # chi tiết món + đầu bếp + công thức
│   │   ├── AboutPage.jsx
│   │   ├── NotFoundPage.jsx, RouteErrorPage.jsx
│   │   ├── bookings/                 # form đặt bàn, trang xác nhận
│   │   └── admin/
│   │       ├── bookings/             # danh sách và đổi trạng thái
│   │       ├── dishes/               # danh sách, thêm, chi tiết, sửa, xóa
│   │       ├── chefs/                # danh sách, thêm, chi tiết, sửa, xóa
│   │       └── ingredients/          # danh sách, thêm, chi tiết, sửa, xóa
│   └── lib/                          # format giá/ngày/điện thoại, thông tin nhà hàng
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── package.json

docs/superpowers/                     # spec và plan của Block 6
evidence/                             # minh chứng; hiện chỉ có .gitkeep
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

Nếu chỉ có một chuỗi Session pooler, có thể gán cùng chuỗi cho cả `DATABASE_URL` và
`DIRECT_URL` (bỏ `?pgbouncer=true`) để chạy được.

Tạo bảng, nạp dữ liệu mẫu, chạy server:

```bash
npx prisma db push
npm run db:seed
npm run dev
```

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

### Dữ liệu mẫu (`api/prisma/seed.js`)

| Bảng | Số bản ghi | Ghi chú |
| --- | --- | --- |
| `dishes` | 51 | Khai vị 9, Món chính 15, Món phụ 9, Tráng miệng 9, Đồ uống 9. Pizza Margherita đặt `available: false` |
| `chefs` | 5 | Bếp Á, steak/món Âu, bếp trưởng điều hành, bếp Ý, bếp bánh ngọt |
| `ingredients` | 45 | Đơn vị như kg, gram, ml, bó, quả, ổ... |
| `dish_ingredients` | Mỗi món 1 đến 5 dòng | Công thức cho một phần ăn |
| `bookings` | 0 | Seed xóa toàn bộ đặt bàn cũ |

Seed xóa theo thứ tự `bookings` → `dish_ingredients` → `dishes` → `chefs` → `ingredients`,
nên chạy lại bao nhiêu lần cũng ra cùng một trạng thái.

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

`GET /api/dishes`

| Tham số | Ý nghĩa |
| --- | --- |
| `q` | Tên chứa chuỗi, không phân biệt hoa thường. `q` là mảng (ví dụ `?q[]=x`) hoặc không phải chuỗi thì bỏ qua |
| `category` | Một trong 5 danh mục; giá trị lạ coi như "Tất cả" |
| `sort` | `default`, `newest`, `price-asc`, `price-desc`, `name-asc`; giá trị lạ coi như `default` |
| `page`, `pageSize` | Như bảng trên |

Mỗi món trong danh sách kèm `chef` và `_count.ingredients`. Chi tiết món kèm `chef` và
`ingredients` (mỗi dòng có `ingredientId`, `quantity`, `ingredient`), sắp theo tên nguyên liệu.

`GET /api/chefs` và `GET /api/ingredients` kèm `_count.dishes`. Chi tiết đầu bếp kèm danh
sách món phụ trách; chi tiết nguyên liệu kèm các món sử dụng nó.

### 8.3. Endpoint bổ sung

| Request | Mục đích | `data` |
| --- | --- | --- |
| `GET /api/stats` | Số liệu đầu trang thực đơn | `{ dishes, categories, chefs, minPrice, tiles: [{ name, count, imageUrl }] }` |
| `GET /api/options` | Hằng số dùng chung cho form/bộ lọc | `{ categories, sorts: [{ key, label }], units, booking: { slots, maxGuests, maxDays, statuses, minDate, maxDate } }` |
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
| `/dishes?q&category&sort&page` | Thực đơn: số liệu, ô danh mục, tìm kiếm, lọc, sắp xếp, phân trang | `GET /api/stats`, `GET /api/options`, `GET /api/dishes` |
| `/dishes/:id` | Chi tiết món, đầu bếp, công thức | `GET /api/dishes/:id` |
| `/about` | Giới thiệu nhà hàng và đội ngũ đầu bếp | `GET /api/chefs`, `GET /api/stats` |
| `/bookings/new` | Form đặt bàn | `GET /api/options`, `POST /api/bookings` |
| `/bookings/:code` | Xác nhận yêu cầu đặt bàn | `GET /api/bookings/:code`, `GET /api/options` |
| `/admin` | Chuyển hướng sang `/admin/dishes` | — |
| `/admin/bookings?show=all` | Danh sách đặt bàn, nút đổi trạng thái | `GET/PATCH /api/admin/bookings` |
| `/admin/dishes?sort&page` | Bảng món ăn | `GET /api/dishes`, `GET /api/options` |
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

Toàn bộ trạng thái bộ lọc (`q`, `category`, `sort`, `page`, `show`) nằm trong URL search
params, nên link chia sẻ được và Reload giữ nguyên ngữ cảnh.

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

**Xem thực đơn** (`/dishes?q=phở&category=Món chính&page=2`)

1. `MenuPage` đọc `q`, `category`, `sort`, `page` từ URL.
2. Gọi song song `GET /api/stats`, `GET /api/options`, và
   `GET /api/dishes?q=phở&category=Món%20chính&sort=default&page=2&pageSize=9`.
3. API chuẩn hoá query, đếm tổng rồi lấy đúng trang bằng `skip`/`take`.
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

API dùng phân trang offset (`skip`/`take`):

```text
skip = (page - 1) × pageSize
take = pageSize
```

`paginate(total, rawPage, pageSize)` trong `api/src/utils/helpers.js`:

```js
function paginate(total, rawPage, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(parseId(rawPage) || 1, totalPages);
  return { page, totalPages, skip: (page - 1) * pageSize, take: pageSize };
}
```

Trang vượt quá được kẹp về trang cuối thay vì trả lỗi hay danh sách rỗng. `page` chỉ là điều
kiện hiển thị; `NOT_FOUND` chỉ dành cho bản ghi không tồn tại.

| Trang | Số dòng mỗi trang | Query giữ lại |
| --- | --- | --- |
| `/dishes` | 9 (lưới 3 × 3) | `q`, `category`, `sort` |
| `/admin/dishes` | 10 | `sort` |
| `/admin/chefs`, `/admin/ingredients` | 10 | `page` |
| `GET /api/chefs` | 10 mặc định | `pageSize` |
| `GET /api/ingredients` | 10 mặc định | `pageSize` |

`/admin/bookings` không phân trang: mặc định chỉ hiện lịch từ hôm nay trở đi nên danh sách
ngắn, và nhân viên cần thấy hết lịch sắp tới trên một trang.

Mỗi kiểu sắp xếp món đều thêm `id` làm khóa phụ (`DISH_SORTS`), vì PostgreSQL không bảo đảm thứ
tự của các dòng cùng giá trị sắp xếp. Thứ tự ổn định tránh việc một món xuất hiện ở hai trang
hoặc bị bỏ qua khi chuyển trang.

## 11. Luật validate

Validator nằm ở server (`api/src/utils/validators.js`) và nhận **body JSON đã đúng kiểu**.
HTML validation trong SPA chỉ giúp nhập nhanh; API luôn kiểm tra lại.

### 11.1. Món ăn (`POST` đầy đủ, `PATCH` một phần)

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

### 11.2. Đầu bếp và nguyên liệu

| Đối tượng | Trường | Luật |
| --- | --- | --- |
| Đầu bếp | `name` | Bắt buộc, tối đa 100 ký tự |
| | `specialty` | Bắt buộc, tối đa 150 ký tự |
| | `imageUrl` | Như món ăn |
| Nguyên liệu | `name` | Bắt buộc, tối đa 100 ký tự |
| | `unit` | Bắt buộc, tối đa 20 ký tự. Không giới hạn trong danh sách gợi ý |

`INGREDIENT_UNITS` trong `options` chỉ là gợi ý cho giao diện; API không bắt buộc đơn vị phải
nằm trong danh sách này.

### 11.3. Đặt bàn

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

## 12. Kiểm thử và kiểm tra thủ công

### 12.1. Test tự động

```bash
cd api
npm test            # app.test.js, validators.test.js, helpers.test.js
```

Các test này không cần database: phần HTTP dùng `createApp` trên cổng ngẫu nhiên, phần
validator/helper là hàm thuần. Phần HTTP có thêm hai ca `413` (body quá lớn) và `415`
(charset không hỗ trợ) để chắc rằng lỗi đọc body vẫn giữ đúng status thay vì thành `500`;
phần helper có ca `parseId` với id vượt giới hạn `INT4`.

```bash
cd web
npm test            # client.test.js
npm run build       # kiểm tra SPA build được
```

Nếu `node --test` trong môi trường không mở rộng mẫu glob, truyền trực tiếp file:

```bash
# api
node --test test/app.test.js test/validators.test.js test/helpers.test.js
# web
node --test src/api/client.test.js
```

### 12.2. Acceptance test

Cần API đang chạy và database đã seed:

```bash
cd api
npm run acceptance
```

Script kiểm tra các nhóm món ăn (kèm thống kê, tùy chọn và CORS), đầu bếp, nguyên liệu và đặt
bàn. Mặc định dùng `http://localhost:3000` và origin `http://localhost:5173`; có thể ghi đè
bằng biến môi trường `API_URL` và `ORIGIN`.

- Bản ghi do script tạo ở ba bảng chính được xóa lại bằng API trong `finally`.
- **Đặt bàn không có endpoint xóa**, nên các yêu cầu tên `ZZ Acceptance` sẽ còn lại trong DB.
  Chạy `npm run db:seed` để dọn.

### 12.3. Kiểm tra bằng `curl`

```bash
# Danh sách có phân trang
curl -i "http://localhost:3000/api/dishes?page=1&pageSize=9"

# Tìm kiếm + lọc + sắp xếp
curl -i "http://localhost:3000/api/dishes?q=ph%E1%BB%9F&category=M%C3%B3n%20ch%C3%ADnh&sort=price-asc"

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

### 12.4. Kiểm tra SPA

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

### 12.5. Kiểm tra CORS

```bash
curl -i -X OPTIONS "http://localhost:3000/api/dishes/1" \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: PATCH" \
  -H "Access-Control-Request-Headers: content-type"
```

Kết quả mong đợi: `204`, `Access-Control-Allow-Origin: http://localhost:5173` (không phải
`*`). Gửi cùng request với `Origin: http://evil.test` sẽ không có header
`Access-Control-Allow-Origin`.

## 13. Trạng thái triển khai và giới hạn đã biết

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
| Đăng nhập / phân quyền | **Không có**. Mọi endpoint quản trị đều công khai, nằm ngoài phạm vi bài này; không dùng cho production |
| Test | Unit test cho API và API client; acceptance script cần API chạy. Không có test end-to-end trình duyệt |
| Thư mục `evidence/` | Đã có thư mục (kèm `.gitkeep`) nhưng **chưa có ảnh/video minh chứng** |

Các điểm cần biết thêm:

- Xóa đầu bếp không xóa món: các món chuyển thành "Chưa phân công". Xóa nguyên liệu chỉ gỡ nó
  khỏi công thức của món, món ăn vẫn còn. Hai trang xác nhận đều nêu rõ hệ quả này trước khi
  người dùng bấm nút.
- API không có endpoint xóa đặt bàn; nhân viên chỉ đổi trạng thái.
- Không có lịch sử migration: project dùng `prisma db push`. Khi triển khai thật nên chuyển
  sang `prisma migrate`.
- Phân trang offset chậm dần với bảng rất lớn và có thể lặp/sót dòng nếu dữ liệu thay đổi giữa
  hai lần bấm. Với vài chục món, cách này đổi lấy khả năng nhảy tới trang bất kỳ.
- `count` và `findMany` là hai truy vấn riêng, không nằm trong transaction; nếu dữ liệu đổi
  đúng giữa hai truy vấn, "Trang x/y" có thể lệch một trang trong một lần tải.
- `GET /api/dishes` không có `page` trả toàn bộ danh sách. Đây là chủ ý để form và trang giới
  thiệu lấy đủ dữ liệu, nhưng sẽ không phù hợp nếu thực đơn rất lớn.
- Khi triển khai SPA lên static host, cần cấu hình fallback mọi đường dẫn về `index.html` để
  deep link như `/dishes/1` hoạt động. Vite dev và `vite preview` đã làm việc này sẵn.
- `VITE_API_URL` và `CORS_ORIGIN` là hai cấu hình phải khớp nhau; đổi cổng một bên mà không
  đổi bên kia sẽ khiến SPA không gọi được API.

## 14. Quyết định kỹ thuật

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

## 15. Tổng kết

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
