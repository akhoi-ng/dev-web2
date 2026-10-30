# Block 7 — Tóm tắt phần làm ngày 30/10/2026

Tài liệu này gom riêng những gì đã làm cho Block 7 ("Tìm kiếm và phân trang") để đọc nhanh.
Báo cáo đầy đủ vẫn nằm trong `README.md` (mục 6, 10, 11, 13, 16, 17).

## 1. Kết quả một dòng

Thực đơn có **1.500 món**; trang khách có **3 kiểu phân trang**; cả trang khách và trang quản lý
món có **4 kiểu tìm kiếm** chạy ở server (Cơ bản, Nâng cao, Toàn văn, Gần đúng); PostgreSQL đã
bật `pg_trgm` và có index tìm kiếm; README đã viết lại thành báo cáo Block 7.

## 2. Việc đã làm

| # | Việc | Ở đâu |
| --- | --- | --- |
| 1 | Sửa lỗi tìm `%` / `_` trả về toàn bộ thực đơn (lỗi có từ Block 6) | `api/src/utils/helpers.js` (`escapeLike`) |
| 2 | Đọc và kiểm tra tham số tìm kiếm (`mode`, `q`, `minPrice`, `maxPrice`, `available`, `ingredient`) | `api/src/utils/validators.js` (`parseDishSearch`) |
| 3 | Migration tìm kiếm: `pg_trgm`, `unaccent` + index GIN full-text và trigram | `api/prisma/search.sql`, script `npm run db:search` |
| 4 | Tìm kiếm 4 mode trong API | `api/src/db/dish-search.js`, `api/src/routes/dishes.js` |
| 5 | In câu SQL thật ra terminal khi đặt `LOG_SQL=1` | `api/src/db/prisma.js` |
| 6 | Seed 1.500 món, 103 nguyên liệu, sinh cố định | `api/prisma/catalog.js`, `api/prisma/seed.js` |
| 7 | Form tìm kiếm dùng chung + thông báo tiêu chí sai | `web/src/components/SearchForm.jsx`, `SearchError.jsx` |
| 8 | Trang quản lý món: thêm tìm kiếm, giữ phân trang số trang | `web/src/pages/admin/dishes/DishListPage.jsx` |
| 9 | Thực đơn: tìm kiếm + nút chuyển 3 kiểu phân trang | `web/src/pages/MenuPage.jsx`, `ViewSwitch.jsx`, `menu/LoadMoreList.jsx`, `hooks/useLoadMore.js` |
| 10 | Chuyển URL ⇄ tiêu chí ⇄ query API; trạng thái "Tải thêm" | `web/src/lib/dish-search.js`, `web/src/lib/load-more.js` |
| 11 | Test và acceptance cho tất cả phần trên | `api/test/*.test.js`, `web/src/lib/*.test.js`, `api/scripts/acceptance.mjs` |
| 12 | Viết lại README thành báo cáo Block 7 | `README.md` |

## 3. Chạy thử

```bash
cd api
npm run db:push      # chỉ khi schema đổi
npm run db:search    # bật pg_trgm + index (chạy lại sau mỗi lần db:push)
npm run db:seed      # XÓA dữ liệu cũ, nạp 1.500 món (~20 giây)
npm run dev          # API cổng 3000

cd ../web
npm run dev          # SPA cổng 5173
```

> Database Supabase **đã được** chạy `db:search` và `db:seed` trong buổi làm. Server API của bạn
> đang chạy bằng `node src/server.js` (không `--watch`) nên cần **khởi động lại** để dùng code mới.

## 4. Bốn kiểu tìm kiếm

API: `GET /api/dishes?mode=...&q=...&page=...&pageSize=...`

| Mode | Tên trên giao diện | Tìm thế nào | Lọc thêm | Thứ tự |
| --- | --- | --- | --- | --- |
| `basic` | Cơ bản | Tên **chứa** từ khóa, không phân biệt hoa/thường | Danh mục | Theo ô "Sắp xếp" |
| `advanced` | Nâng cao | Như Cơ bản | Danh mục, giá từ/đến, tình trạng (còn/tạm hết), nguyên liệu — kết hợp AND | Theo ô "Sắp xếp" |
| `fulltext` | Toàn văn | Tên + mô tả chứa **mọi từ** của từ khóa (PostgreSQL full-text, cấu hình `simple`) | Danh mục | Điểm `ts_rank` giảm dần, rồi `id` |
| `fuzzy` | Gần đúng | Tên có đoạn **gần giống** từ khóa, gõ sai hoặc **không dấu** vẫn ra (`word_similarity(unaccent(q), unaccent(name)) ≥ 0.3`) | Danh mục | Điểm giảm dần, rồi `id` |

Quy ước cần nhớ:

- Ô trống = không lọc. `available=false` (tạm hết) và `minPrice=0` là điều kiện thật.
- Giá sai (`abc`, số âm), `minPrice > maxPrice`, `available` lạ, `mode` lạ → HTTP 200,
  `ok: false`, `VALIDATION_FAILED` kèm lỗi từng ô.
- Tham số nâng cao gửi kèm mode khác `advanced` bị **bỏ qua**, không báo lỗi.
- Không có kết quả → `ok: true`, `data: []`, `total: 0`.

Ví dụ thử nhanh:

```bash
curl "http://localhost:3000/api/dishes?q=%25&page=1"                                  # "%" -> 2 món
curl "http://localhost:3000/api/dishes?mode=fulltext&q=ph%E1%BB%9F%20b%C3%B2&page=1"    # "phở bò"
curl "http://localhost:3000/api/dishes?mode=fuzzy&q=carbonra&page=1"                  # ra Mỳ Ý Carbonara
curl "http://localhost:3000/api/dishes?mode=advanced&available=false&maxPrice=80000&ingredient=t%E1%BB%8Fi&page=1"
```

## 5. Ba kiểu phân trang (trang `/dishes`)

Nút **Số trang | Tải thêm | Cuộn vô hạn** cạnh ô sắp xếp, lưu trên URL `?view=pages|more|scroll`.
Cả ba gọi cùng một API phân trang ở server, mỗi lần 9 món.

| Kiểu | Hành vi | Reload / mở lại link |
| --- | --- | --- |
| Số trang | Chọn trang để **thay** danh sách; URL có `?page=n` | Mở lại **đúng trang** |
| Tải thêm | Bấm nút để **nối** 9 món tiếp theo | Tải lại **từ đầu** |
| Cuộn vô hạn | Cuộn gần cuối (200px) thì tự nối thêm | Tải lại **từ đầu** |

- Tìm lại, đổi danh mục, đổi sắp xếp → về đầu kết quả mới.
- Đổi điều kiện khi đang tải → request cũ bị huỷ, **không trộn** kết quả hai lần tìm.
- Món trùng `id` chỉ hiện một lần; hết món thì hiện "Đã hiện hết N món".
- Trang quản lý `/admin/dishes` vẫn chỉ dùng **Số trang** (10 dòng/trang) như yêu cầu.

## 6. Dữ liệu seed

| Bảng | Số dòng |
| --- | --- |
| `dishes` | 1.500 (51 món cũ + 1.449 món sinh) |
| `ingredients` | 103 (45 cũ + 58 mới) |
| `dish_ingredients` | 5.094 |
| `chefs` | 5 |

- Món sinh từ 44 mẫu (Phở, Bún, Cơm, Pizza, Lẩu, Chè, Trà...) × biến thể × phong cách × khẩu
  phần, xáo bằng PRNG có seed cố định → **mỗi lần seed ra đúng cùng một thực đơn**.
- Có 3 món chứa ký tự đặc biệt để thử escape: `Combo 100% bò Úc`, `Bánh 50% đường`,
  `Trà_sữa_nhà_làm`.
- 213 món "Tạm hết".

## 7. Lỗi phát hiện và sửa (dùng cho câu 4 slide 41)

- **Lỗi:** gõ `%` hoặc `_` vào ô tìm kiếm trả về **toàn bộ** thực đơn. Prisma `contains` không
  escape ký tự đại diện của `LIKE`, nên `%` thành mẫu `%%%` khớp mọi tên.
- **Tái hiện:** `curl "http://localhost:3000/api/dishes?q=%25&page=1&pageSize=1"` → `total = 51`
  (seed cũ 51 món), đáng lẽ phải là 0.
- **Trước khi sửa:** commit `407ae17` thêm kiểm tra, chạy ra
  `FAIL dishes: q=% là ký tự thường — total = 51, bằng toàn bộ 51 món`.
- **Sửa:** commit `83f981e` thêm `escapeLike()` (thêm `\` trước `\`, `%`, `_`).
- **Sau khi sửa:** kiểm tra chuyển sang PASS, `total = 0`; với seed mới `q=%` ra đúng 2 món.
- Chi tiết: `evidence/bug-like-wildcard.md`.

### Lỗi thứ hai: Gần đúng gõ "bun" không ra "bún"

- **Phát hiện:** khi bấm thử giao diện, chế độ Gần đúng gõ `bún` ra 42 món, gõ `bun` ra 0 món.
- **Nguyên nhân:** `pg_trgm` cắt chuỗi thành nhóm 3 ký tự và coi `ú` khác `u`. `bun` và `bún` chỉ
  chung 1/4 nhóm → điểm 0.25, dưới ngưỡng 0.3.
- **Sửa:** bật extension `unaccent` (`api/prisma/search.sql`) và so
  `word_similarity(unaccent(q), unaccent(name))` (`api/src/db/dish-search.js`).
- **Sau khi sửa:** `bun` ra 42 món như `bún`, "Bún chả Hà Nội" đứng đầu; acceptance thêm dòng
  `PASS search: fuzzy q=bun (không dấu) = q=bún` (75/75 PASS).

## 8. Kết quả kiểm tra

| Lệnh | Kết quả |
| --- | --- |
| `cd api && npm test` | 71/71 pass |
| `cd web && npm test` | 22/22 pass |
| `cd web && npm run build` | Build thành công |
| `cd api && npm run acceptance` (trên 1.500 món) | 75/75 PASS, gồm 15 dòng tìm kiếm mới |

## 9. Quyết định đã chọn

| Quyết định | Lý do |
| --- | --- |
| Phân trang, lọc, sắp xếp đều ở **server** | 1.500 món ≈ 1 MB nếu tải hết; một trang 9 món chỉ ≈ 5,6 KB |
| Prisma cho Cơ bản/Nâng cao, SQL có tham số cho Toàn văn/Gần đúng | Giữ code cũ; Prisma không hỗ trợ full-text/trigram của PostgreSQL |
| `word_similarity` thay vì `similarity` | Tên món dài nhiều từ; "carbonra" so với "Mỳ Ý Carbonara": 0.67 thay vì 0.41 |
| Tải thêm / Cuộn vô hạn mở lại từ đầu | Không cần cache phía client; muốn mở lại đúng chỗ thì dùng Số trang |
| Trang không hợp lệ vẫn về trang 1, trang vượt quá về trang cuối | Giữ hành vi Block 6. Slide 9–10 gợi ý trả `items: []` / `VALIDATION_FAILED` — có thể đổi nếu thầy yêu cầu |

## 10. Việc còn lại cho nhóm

1. **Khởi động lại API** (cổng 3000) để chạy code mới.
2. **Bấm thử giao diện** theo bảng nghiệm thu ở `README.md` mục 13.4. Phần giao diện chưa được
   kiểm tra trên trình duyệt; chỉ mới qua build, unit test và acceptance của API.
3. **Chụp ảnh minh chứng** vào `evidence/` (danh sách ở `README.md` mục 17):
   - Supabase: `SELECT count(*) FROM dishes;` = 1500
   - Ba kiểu phân trang kèm tab Network
   - Bốn mode tìm kiếm với URL trên thanh địa chỉ
   - Terminal API chạy `LOG_SQL=1` khi tìm Toàn văn / Gần đúng
   - `/admin/dishes` đang tìm Nâng cao ở trang 2

Chưa xử lý (ngoài phạm vi):

- Trang chi tiết đầu bếp / nguyên liệu liệt kê **toàn bộ** món liên quan (có thể vài trăm món).
- Mỗi request tới Supabase mất ~3 giây từ máy này do nhiều lượt đi-về mạng.

## 11. Danh sách commit

| Commit | Nội dung |
| --- | --- |
| `5554c8f` | Thiết kế Block 7 (`docs/superpowers/specs/...`) |
| `087e290` | Kế hoạch triển khai (`docs/superpowers/plans/...`) |
| `407ae17` | Kiểm tra lỗi `%` / `_` (trước khi sửa) |
| `83f981e` | Sửa lỗi `%` / `_` |
| `0ebd0d0` | Đọc và kiểm tra tham số tìm kiếm |
| `d817b8d` | Migration `pg_trgm` + 4 mode tìm kiếm |
| `c035866` | Seed 1.500 món |
| `8983cf0` | Tìm kiếm ở trang quản lý món |
| `58ed6bd` | Thực đơn: tìm kiếm + 3 kiểu phân trang |
| `3368742` | README báo cáo Block 7 |
