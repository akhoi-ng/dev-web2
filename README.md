# Lửa Hồng - REST API và SPA

Báo cáo bài tập Block 6 ("REST API và SPA") của nhóm. Ứng dụng nhà hàng của Block 5 (một
server Express dựng HTML bằng EJS) được tách thành **hai ứng dụng độc lập chạy ở hai origin**:

| Thư mục | Vai trò | Origin khi chạy dev |
| --- | --- | --- |
| `api/` | BE: REST API trả JSON (Express 4 + Prisma 6 + PostgreSQL trên Supabase) | `http://localhost:3000` |
| `web/` | FE: SPA chạy trong browser (React 18 + Vite 5 + React Router 6 + Tailwind CSS 3) | `http://localhost:5173` |

Mental model của buổi học: **Browser chạy SPA → router của SPA chọn trang theo URL → trang gọi
API bằng `fetch` → route/handler/Prisma của BE đọc ghi PostgreSQL → JSON `{ ok, data | error }`
→ SPA lưu vào state rồi dựng UI.** SPA không nối database, response của API không có HTML.

## 1. Thông tin nhóm

| STT | Họ và tên | MSSV |
| --- | --- | --- |
| 1 | Nguyễn Tấn Hiệu | 24127373 |
| 2 | La Anh Hào | 24127361 |
| 3 | Trần Nguyễn Tuấn Minh | 24127084 |
| 4 | Nguyễn Anh Khôi | 24127430 |

## 2. Yêu cầu đề bài và nơi đáp ứng

Câu hỏi của buổi học: *Khi giao diện là một SPA chạy trong browser, dữ liệu từ database đến SPA
như thế nào?*

| Mục tiêu (slide "Mục tiêu") | Trong project |
| --- | --- |
| REST API trả JSON theo một response shape thống nhất | `api/src/http/respond.js`: mọi handler trả qua `ok()` / `fail()` |
| Phân biệt lỗi kỹ thuật (status HTTP) và lỗi nghiệp vụ (body) | Bảng ở mục 6; SPA phân loại 3 tầng lỗi trong `web/src/api/client.js` |
| Cho phép SPA gọi API khác origin với CORS | `api/src/http/cors.js`, origin đọc từ `CORS_ORIGIN`, không dùng `*` |
| Client-side routing | `web/src/router.jsx` (`createBrowserRouter`), mỗi trang một URL |

| Mô tả bài tập (slide "Mô tả", "Dữ liệu") | Trong project |
| --- | --- |
| `api` là BE: project nền có kết nối DB, ba model, seed | `api/prisma/schema.prisma`, `api/prisma/seed.js` (51 món, 5 đầu bếp, 45 nguyên liệu) |
| `web` là FE: SPA mới, không render ở server | `web/` tạo mới bằng Vite + React, chỉ phát `index.html` + JS |
| Ba tài nguyên: món ăn, đầu bếp, nguyên liệu | `/api/dishes`, `/api/chefs`, `/api/ingredients` |
| `api` và `web` chạy ở hai origin khác nhau | cổng 3000 và 5173 |

## 3. Cách chạy

Yêu cầu: Node.js 18 trở lên (script test của `web` dùng glob nên cần Node 21+) và một project
Supabase. Máy của nhóm dùng Node trong môi trường conda: `conda activate web`.

**Terminal 1 — API**

```bash
cd api
npm install
cp .env.example .env      # điền DATABASE_URL, DIRECT_URL; CORS_ORIGIN=http://localhost:5173
npx prisma db push        # tạo bảng (Code-first)
npx prisma db seed        # XÓA dữ liệu cũ rồi nạp dữ liệu mẫu
npm run dev               # http://localhost:3000
```

**Terminal 2 — SPA**

```bash
cd web
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:3000
npm run dev               # http://localhost:5173
```

| Biến | Ở đâu | Ý nghĩa |
| --- | --- | --- |
| `DATABASE_URL` | `api/.env` | Chuỗi kết nối pooler (Transaction mode, cổng 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | `api/.env` | Session pooler (cổng 5432) cho `prisma db push` |
| `PORT` | `api/.env` | Cổng API, mặc định 3000 |
| `CORS_ORIGIN` | `api/.env` | Origin được phép gọi API, không có `/` cuối, nhiều origin cách nhau bằng dấu phẩy |
| `VITE_API_URL` | `web/.env` | URL gốc của API. **Công khai**: mọi biến `VITE_` bị nhúng vào bundle gửi cho browser |

Chuỗi kết nối database chỉ nằm trong `api/.env` (đã `.gitignore`); SPA không có biến bí mật nào.

| Script | Thư mục | Nhiệm vụ |
| --- | --- | --- |
| `npm run dev` | `api` / `web` | Chạy API với `node --watch` / chạy dev server Vite |
| `npm test` | `api` | Unit test validator, helper và tầng HTTP (`node:test`, không cần DB) |
| `npm run acceptance` | `api` | Chạy từng dòng của bảng REST API vào API đang chạy (cần DB) |
| `npm test` | `web` | Unit test lớp gọi API (`client.test.js`) |
| `npm run build` / `npm run preview` | `web` | Build bản production vào `web/dist` / phục vụ bản build ở cổng 5173 |

Acceptance tự xóa món, đầu bếp, nguyên liệu nó tạo. API không có DELETE cho đặt bàn, nên mỗi lần
chạy để lại một yêu cầu đặt bàn tên "ZZ Acceptance"; chạy `npm run db:seed` trong `api/` để đưa
database về trạng thái ban đầu trước khi quay video hoặc nộp bài.

## 4. Công nghệ và lý do

| Phần | Dùng gì | Vì sao |
| --- | --- | --- |
| API | Express 4 | Giữ nguyên project nền của Block 5; thấy rõ thứ tự middleware |
| ORM | Prisma 6 | Giữ schema, seed và quan hệ của Block 5; lỗi `P2025` để nhận biết bản ghi không còn |
| CORS | gói `cors` | Middleware chuẩn, cấu hình bằng danh sách origin cụ thể |
| SPA | React 18 + Vite 5 | Stack mà ví dụ của slide giả định (cổng 5173, biến `VITE_`) |
| Router | React Router 6 (`createBrowserRouter`) | History API, path param, query param, `errorElement` |
| CSS | Tailwind CSS 3 qua PostCSS | Giữ nguyên class và bảng màu thương hiệu của Block 5 |
| Test | `node:test` | Không thêm dependency |

## 5. Cấu trúc

```
api/
  src/app.js               createApp(): cors → express.json → requireJson → routers → 404 → 500
  src/server.js            đọc .env, chạy app
  src/http/respond.js      ok(), fail(), notFound(), validationFailed(), requireJson, routeNotFound, errorHandler
  src/http/cors.js         corsMiddleware(CORS_ORIGIN)
  src/routes/              dishes, chefs, ingredients, bookings, admin-bookings, stats, options
  src/utils/validators.js  validate JSON có kiểu, trả { fields, data }, hỗ trợ PATCH một phần
  src/utils/helpers.js     parseId, paginate, pageParams, asObject, todayInVietnam…
  test/                    app.test.js, validators.test.js, helpers.test.js
  scripts/acceptance.mjs   kiểm tra bảng REST API vào API thật
  requests.http            các request mẫu cho REST Client (VS Code)
  prisma/                  schema.prisma, seed.js
web/
  src/api/client.js        lớp gọi API duy nhất có fetch; ApiError { kind: network | http | business }
  src/api/index.js         dishesApi, chefsApi, ingredientsApi, bookingsApi, adminBookingsApi, getStats, getOptions
  src/hooks/               useApiData (tải dữ liệu + huỷ request cũ), useSubmit (gửi form), useDocumentTitle
  src/components/          Layout (header/footer), DataStatus, Pagination, DishImage, ChefAvatar, FieldError…
  src/pages/               MenuPage, DishPage, AboutPage, bookings/*, admin/{dishes,chefs,ingredients,bookings}/*
  src/router.jsx           bảng route của SPA
docs/superpowers/          bản thiết kế và kế hoạch triển khai
```

## 6. Response shape và status

```json
// Thành công (meta chỉ có khi danh sách được phân trang)
{ "ok": true, "data": [ ... ], "meta": { "page": 1, "totalPages": 6, "total": 51, "pageSize": 9 } }
// Lỗi nghiệp vụ
{ "ok": false, "error": { "code": "VALIDATION_FAILED", "message": "Dữ liệu không hợp lệ",
                          "fields": { "name": "Tên món ăn không được để trống." } } }
```

| Tình huống | Status | Body |
| --- | --- | --- |
| Thành công, kể cả danh sách rỗng | 200 | `ok: true` |
| Id không có hoặc sai kiểu (`999999`, `abc`) | 200 | `ok: false`, `NOT_FOUND` |
| Input sai | 200 | `ok: false`, `VALIDATION_FAILED` + `fields` |
| Sai URL (`/api/bok`) | 404 | `{ "message" }`, **không có `ok`** |
| POST/PATCH thiếu `Content-Type: application/json`, hoặc JSON hỏng | 400 | `{ "message" }`, không có `ok` |
| Lỗi hệ thống (mất kết nối DB, lỗi mã nguồn) | 500 | `{ "message" }`, không có `ok`; chi tiết chỉ ghi log ở server |

Twist so với slide, phù hợp với project:

- **`meta` cho phân trang.** Block 5 có phân trang, nhóm giữ lại. `data` của danh sách vẫn luôn là
  mảng; thông tin trang nằm riêng ở `meta`, chỉ xuất hiện khi gửi `?page=`. Không gửi `page` thì
  API trả toàn bộ (dùng cho trang Về chúng tôi và ô chọn trong form).
- **`message`** dành cho lập trình viên và log; SPA rẽ nhánh theo `code`, câu hiển thị do SPA chọn.
- **Lỗi nghiệp vụ được ghi log** (`[business] NOT_FOUND GET /api/dishes/999999`) vì công cụ giám sát
  nhìn status 200 sẽ không thấy chúng (đánh đổi nêu trong slide).

Thứ tự kiểm tra trong mỗi handler theo slide "Một request đi qua API": route → body → validate
input → database → bản ghi tồn tại. Handler chỉ bắt lỗi nghiệp vụ biết trước (Prisma `P2025` →
`NOT_FOUND`), mọi lỗi khác đi tới `errorHandler` trả 500. Lệnh ghi chỉ dùng `data` do validator trả
về (không đưa nguyên `req.body`); `price` gửi dạng chuỗi `"50000"` bị coi là input sai.

## 7. Danh sách route

### 7.1. REST API

Ba tài nguyên `dishes`, `chefs`, `ingredients` cùng một mẫu (slide "REST API"):

| Thao tác | Request | Thành công (`data`) | Lỗi nghiệp vụ |
| --- | --- | --- | --- |
| Danh sách | `GET /api/<res>` | mảng, có thể rỗng | — |
| Chi tiết | `GET /api/<res>/:id` | bản ghi | `NOT_FOUND` |
| Thêm | `POST /api/<res>` | bản ghi vừa tạo (có `id`) | `VALIDATION_FAILED` |
| Sửa | `PATCH /api/<res>/:id` | bản ghi đã sửa | `VALIDATION_FAILED`, `NOT_FOUND` |
| Xóa | `DELETE /api/<res>/:id` | `null` | `NOT_FOUND` |

- `GET /api/dishes?q=&category=&sort=&page=&pageSize=`: tìm theo tên, lọc danh mục, sắp xếp
  (`default`, `newest`, `price-asc`, `price-desc`, `name-asc`), phân trang. Tham số lạ bị bỏ qua.
- Món ăn kèm `chef` và công thức `ingredients: [{ ingredientId, quantity, ingredient }]`; PATCH có
  `ingredients` thì thay toàn bộ công thức. Xóa đầu bếp: món còn lại với `chef: null`. Xóa nguyên
  liệu: dòng công thức bị xóa theo.

Phần làm thêm (giữ từ Block 5):

| Request | Mục đích |
| --- | --- |
| `GET /api/stats` | Số liệu đầu trang thực đơn và ô danh mục |
| `GET /api/options` | Hằng số cho form: danh mục, kiểu sắp xếp, đơn vị, khung giờ đặt bàn |
| `POST /api/bookings` | Khách gửi yêu cầu đặt bàn, nhận mã 8 ký tự ngẫu nhiên |
| `GET /api/bookings/:code` | Khách xem lại yêu cầu bằng mã (không dùng id vì id đoán được) |
| `GET /api/admin/bookings?show=all` | Quản trị xem danh sách (mặc định từ hôm nay, giờ Việt Nam) |
| `PATCH /api/admin/bookings/:id` | Đổi trạng thái `pending` / `confirmed` / `cancelled` |

### 7.2. Trang của SPA

| URL trên thanh địa chỉ | Trang | Request tới API |
| --- | --- | --- |
| `/dishes?q=&category=&sort=&page=` | Thực đơn: tìm, lọc, sắp xếp, phân trang | `GET /api/stats`, `GET /api/dishes?...` |
| `/dishes/:id` | Chi tiết món | `GET /api/dishes/:id` |
| `/about` | Về chúng tôi | `GET /api/chefs`, `GET /api/stats` |
| `/bookings/new` | Form đặt bàn | `GET /api/options`; khi gửi `POST /api/bookings` |
| `/bookings/:code` | Xác nhận đặt bàn | `GET /api/bookings/:code` |
| `/admin/dishes?sort=&page=` | Bảng món ăn | `GET /api/dishes?...` |
| `/admin/dishes/new` | Form thêm | khi gửi `POST /api/dishes` |
| `/admin/dishes/:id` | Chi tiết (trang đích sau khi thêm/sửa) | `GET /api/dishes/:id` |
| `/admin/dishes/:id/edit` | Form sửa | `GET /api/dishes/:id`; khi gửi `PATCH` |
| `/admin/dishes/:id/delete` | Xác nhận xóa; chỉ nút "Xác nhận xóa" gọi `DELETE` | `GET`, rồi `DELETE /api/dishes/:id` |
| `/admin/chefs…`, `/admin/ingredients…` | Sáu trang như trên cho mỗi tài nguyên | tương ứng |
| `/admin/bookings?show=all` | Danh sách đặt bàn + nút đổi trạng thái | `GET`, `PATCH /api/admin/bookings/:id` |
| `*` | Trang "không tìm thấy" của SPA | — |

## 8. CORS

SPA ở `http://localhost:5173`, API ở `http://localhost:3000`: khác cổng nên khác origin. Browser chỉ
cho mã JavaScript đọc response khi API trả `Access-Control-Allow-Origin` đúng origin của SPA.

- `PATCH`, `DELETE` và mọi request có `Content-Type: application/json` cần **preflight**: browser
  gửi `OPTIONS` trước. API trả `204` kèm `Access-Control-Allow-Origin: http://localhost:5173`,
  `Access-Control-Allow-Methods: GET,POST,PATCH,DELETE`, `Access-Control-Allow-Headers: Content-Type`.
- CORS đặt trước mọi route nên cả response 404/500 cũng mang header (SPA đọc được để báo lỗi).
- Origin đọc từ `CORS_ORIGIN`; origin lạ không nhận header nào. Không dùng `*` vì API quản trị
  chưa có xác thực.
- Lớp gọi API chỉ đặt `Content-Type` khi có body, nên `GET` không bị preflight.

Kiểm tra bằng công cụ HTTP:

```bash
curl -i -X OPTIONS http://localhost:3000/api/dishes/1 \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: PATCH" \
  -H "Access-Control-Request-Headers: content-type"
```

## 9. SPA gọi API: ba tầng lỗi

`web/src/api/client.js` là nơi duy nhất gọi `fetch`. Nó trả `{ data, meta }` hoặc ném `ApiError`:

| Tầng | `kind` | Khi nào | SPA hiển thị |
| --- | --- | --- | --- |
| 1 | `network` | Không có response: API tắt, mất mạng, bị chặn CORS | Thông báo chung + nút "Thử lại" |
| 2 | `http` | Có response nhưng status không 2xx, hoặc body không phải JSON có `ok` | Thông báo chung + nút "Thử lại" |
| 3 | `business` | Status 200, `ok: false` | `NOT_FOUND` → trang không tìm thấy; `VALIDATION_FAILED` → lỗi cạnh từng ô |

- `useApiData(loader, deps)` cho mỗi trang trạng thái `loading | ok | notFound | error`. Đổi id hay
  bộ lọc thì request cũ bị huỷ bằng `AbortController`, response cũ không ghi đè response mới.
- `useSubmit()` chặn bấm Gửi hai lần, gom `fields` để hiện lỗi cạnh ô và giữ nguyên giá trị đã nhập.
- **Dữ liệu thuộc về trang**: không có kho trạng thái toàn cục. Mỗi trang tự tải khi mở; form sửa
  tải bản ghi theo id trong URL; ghi xong thì điều hướng sang trang đích để trang đó tải lại.

## 10. Luồng dữ liệu

**Tìm món** — gõ "phở" ở `/dishes`: SPA đổi URL thành `/dishes?q=phở#thuc-don` (History API, không
có document request) → `MenuPage` đọc `q` từ URL → `GET /api/dishes?q=phở&page=1&pageSize=9` →
`{ ok: true, data: [...], meta }` → hiện lưới món hoặc trạng thái rỗng. Reload ở URL đó vẫn ra đúng kết quả.

**Thêm món sai dữ liệu** — `/admin/dishes/new`, tên chỉ có khoảng trắng: SPA chặn tải lại trang,
khóa nút Gửi, `POST /api/dishes` (preflight `OPTIONS` trước) → API validate → `200 { ok: false,
error: { code: "VALIDATION_FAILED", fields: { name } } }` → SPA hiện lỗi dưới ô "Tên món ăn", giữ
các giá trị đã nhập. Sửa lại và gửi → `ok: true` → điều hướng tới `/admin/dishes/:id`.

**Xóa** — nút "Xóa" chỉ mở `/admin/dishes/:id/delete` (một `GET`). Chỉ nút "Xác nhận xóa" gửi
`DELETE /api/dishes/:id` → `{ ok: true, data: null }` → điều hướng về danh sách.

## 11. URL của SPA và fallback

Bấm link trong SPA: router đổi URL, không hỏi server. Gõ URL hoặc Reload ở `/dishes/87`: browser gửi
`GET /dishes/87` tới server giữ file SPA; server phải trả `index.html` (fallback) để SPA chạy lên
và router hiện đúng trang. Dev server và `vite preview` đã làm sẵn việc này; khi triển khai lên host
file tĩnh cần cấu hình rewrite tương đương (mọi đường dẫn không phải file → `index.html`).

## 12. Đối chiếu tiêu chí nghiệm thu

### Kiểm tra mã nguồn: API (slide)

| Câu hỏi | Kết quả |
| --- | --- |
| Có route GET nào ghi dữ liệu không; sửa, xóa có dùng PATCH, DELETE không | Không; ghi chỉ ở POST/PATCH/DELETE (`api/src/routes/*.js`) |
| Không có bản ghi trả `NOT_FOUND` với status 200; lỗi hệ thống vẫn là 500 | `notFound()` trong `respond.js`; handler chỉ bắt `P2025` |
| Dữ liệu của request có bị đưa nguyên vào lệnh ghi không | Không; chỉ dùng `data` của validator (khóa lạ bị bỏ) |
| Chuỗi kết nối database có xuất hiện trong mã hoặc log không | Không; chỉ trong `api/.env`, đọc qua `process.env` |

### Kiểm tra mã nguồn: SPA (slide)

| Câu hỏi | Kết quả |
| --- | --- |
| Kiểm tra cả status HTTP lẫn `ok`; URL gốc API ở một chỗ | `client.js` (3 tầng lỗi); URL gốc chỉ ở `api/index.js` từ `VITE_API_URL` |
| State danh sách/bản ghi dùng chung giữa các trang | Không có; mỗi trang dùng `useApiData` riêng |
| Dữ liệu từ API chèn vào HTML thô | Không; không có `dangerouslySetInnerHTML`/`innerHTML`, React tự thoát ký tự |
| Biến môi trường bí mật trong bundle | Không; chỉ `VITE_API_URL` (công khai) |

### Tiêu chí nghiệm thu

| Tiêu chí | Cách chứng minh |
| --- | --- |
| Từng dòng bảng REST API: status 200, `ok`, `data` hoặc `error.code` đúng | `npm run acceptance` (in PASS/FAIL từng dòng), hoặc `api/requests.http` |
| URL `/api` sai trả 404; lỗi hệ thống trả 500; hai loại này không theo response shape | Acceptance có dòng `/api/bok`; 500: đổi `DATABASE_URL` sai rồi gọi `GET /api/dishes` |
| `Access-Control-Allow-Origin` là origin của SPA, không phải `*` | Acceptance kiểm tra header và preflight; DevTools → Network → request `OPTIONS` |
| Mở thẳng và Reload ở từng URL ra đúng trang; lệnh ghi không tải lại document | Network lọc **Doc**: chỉ có 1 document request khi mở trang, không có thêm khi bấm link/ghi |
| `VALIDATION_FAILED` hiện lỗi cạnh trường, giữ giá trị; xóa chỉ sau trang xác nhận | Gửi form với tên toàn khoảng trắng; nút "Xóa" chỉ dẫn tới trang `/delete` |
| `NOT_FOUND` hiện không tìm thấy; API tắt hoặc sai URL hiện lỗi chung | Mở `/dishes/999999`; tắt API rồi mở `/dishes` → "Không tải được dữ liệu" + "Thử lại" |

Bật **Disable cache** trong Network khi kiểm tra preflight vì browser có thể nhớ kết quả preflight.

## 13. Kiểm thử tự động

| Lệnh | Kết quả lần chạy cuối |
| --- | --- |
| `cd api && npm test` | 36/36 pass (tầng HTTP, CORS, validator, helper) |
| `cd api && npm run acceptance` (API đang chạy) | toàn bộ PASS: món ăn, đầu bếp (kể cả xóa đầu bếp → món còn `chef: null`), nguyên liệu, đặt bàn, 404, CORS |
| `cd web && npm test` | 9/9 pass (phân loại lỗi network/http/business, AbortError, Content-Type chỉ khi có body) |
| `cd web && npm run build` | build thành công |

## 14. Minh chứng (nhóm cần chụp)

Thư mục `evidence/` dành cho minh chứng Block 6:

1. Network: request `OPTIONS` (preflight) trước `PATCH`, kèm header CORS của response.
2. Network → Response của một `VALIDATION_FAILED` và form hiện lỗi cạnh ô.
3. `GET /api/bok` trả 404 không có `ok`; `GET /api/dishes/999999` trả 200 `NOT_FOUND`.
4. Reload ở một URL sâu (`/admin/dishes/:id/edit`) ra đúng trang.
5. Tắt API → trang hiện lỗi chung với nút "Thử lại", không trắng trang.
6. Video ngắn: tìm món, thêm/sửa/xóa một món, đặt bàn, xác nhận đặt bàn ở trang quản trị.

## 15. Phạm vi làm thêm so với đề

- Quan hệ đầu bếp ↔ món và công thức món ↔ nguyên liệu (bảng nối có định lượng).
- Lọc theo danh mục, sắp xếp, phân trang (qua `meta`), số liệu đầu trang thực đơn.
- Đặt bàn cho khách (mã ngẫu nhiên) và trang quản trị đặt bàn.
- Trang "Về chúng tôi".
- Chặn bấm Gửi hai lần, huỷ request cũ khi đổi trang, tiêu đề tab theo trang.

## 16. Tổng kết

- REST API: URL là tài nguyên, method là thao tác, body có `ok`, `data` hoặc `error`.
- Status báo lỗi kỹ thuật; `error.code` báo lỗi nghiệp vụ, status vẫn 200.
- Hai origin cần CORS; `PATCH`, `DELETE` và JSON gây preflight.
- Routing phía client cho mỗi trang một URL; ghi xong thì SPA điều hướng tới trang kết quả.
