# Lửa Hồng - Quản lý Nhà hàng dạng server-side rendering

Báo cáo bài tập Block 5 ("SSR với database và ORM") của nhóm. Ứng dụng là **một server
Express duy nhất**: dựng HTML ở server bằng EJS và đọc ghi PostgreSQL trên Supabase qua
Prisma ORM. Luồng xử lý của mọi request, theo mental model của buổi học:

Browser → Router → Handler (đọc params, query, body; validate) → Model (Prisma) → PostgreSQL
→ Template (EJS) → HTML về browser. Thao tác ghi kết thúc bằng `res.redirect(303)` thay vì
render.

Trình duyệt **không gửi dữ liệu bằng JavaScript**. Mọi thao tác đi qua thẻ `<a>` (GET) hoặc
`<form>` HTML (POST, và PATCH, DELETE qua `method-override`). Ứng dụng có hai phân hệ:

- **Khách hàng** (`/dishes`): chỉ đọc. Xem thực đơn, tìm theo tên, lọc theo danh mục, sắp
xếp, phân trang, xem chi tiết món.
- **Quản trị** (`/admin/`*): CRUD đầy đủ cho 3 đối tượng: Món ăn, Đầu bếp, Nguyên liệu.

Stack: Node.js, Express 4, EJS 3, Prisma 6, PostgreSQL (Supabase), `method-override`,
Tailwind CSS (CDN).

## 1. Thông tin nhóm

| STT | Họ và tên | MSSV |
| --- | --- | --- |
| 1 | Nguyễn Tấn Hiệu | 24127373 |
| 2 | La Anh Hào | 24127361 |
| 3 | Trần Nguyễn Tuấn Minh | 24127084 |
| 4 | Nguyễn Anh Khôi | 24127430 |

## 2. Yêu cầu đề bài

Câu hỏi của buổi học: *Server tổ chức các trang và xử lý CRUD thế nào để UI luôn phản ánh
đúng dữ liệu trong database?*

Mục tiêu (slide "Mục tiêu"):

- Nối ứng dụng với database Supabase.
- So sánh SQL thô, query builder, ORM và truy vấn qua model.
- Chọn `params`, `query` hay `form` (body) để truyền dữ liệu giữa các trang.
- Dùng `POST`, `PATCH`, `DELETE` để ghi dữ liệu rồi redirect, không dùng `GET`.

Bài tập: xây ứng dụng nhà hàng gồm (a) trang người dùng xem món ăn, (b) trang quản trị CRUD
món ăn, đầu bếp và nguyên liệu.

| Mô tả trong slide | Trong project này |
| --- | --- |
| Project Express và EJS, có `.env.example` và `.gitignore` chứa `.env` | `package.json`, `.env.example`, `.gitignore` (`.env`, `node_modules`) |
| Mỗi nhóm một project Supabase, `DATABASE_URL` chỉ nằm trong `.env` | `.env` (không commit); code chỉ đọc qua `process.env` ở server |
| Ba model `Dish`, `Chef`, `Ingredient` | `prisma/schema.prisma` (thêm bảng nối `DishIngredient`, xem mục 6) |
| Script seed có dữ liệu cho cả ba bảng | `prisma/seed.js`: 51 món, 5 đầu bếp, 45 nguyên liệu |

Các trường gợi ý của slide đều được giữ:

| Model | Trường gợi ý | Trường nhóm thêm |
| --- | --- | --- |
| `Dish` | `name`, `description`, `price`, `category`, `available` | `imageUrl`, `createdAt`, `chefId`, công thức (`ingredients`) |
| `Chef` | `name`, `specialty` | `imageUrl`, `createdAt` |
| `Ingredient` | `name`, `unit` | `createdAt` |

Ràng buộc của trang quản trị (vi phạm là trượt nghiệm thu):

| # | Quy tắc | Cách project đáp ứng |
| --- | --- | --- |
| 1 | Thêm dùng `POST`, sửa dùng `PATCH`, xóa dùng `DELETE` | Form `POST`; sửa và xóa gửi `?_method=PATCH` / `?_method=DELETE` |
| 2 | Không dùng `fetch`, AJAX hay JavaScript phía client để gửi dữ liệu | Không có `fetch`, `XMLHttpRequest`, `axios` trong `views/` (xem mục 14) |
| 3 | Input sai trả `400`, giữ giá trị đã nhập | Render lại form với `values` đã gõ và danh sách lỗi |
| 4 | Id sai hoặc không có trả `404` | `parseId()` rồi `findUnique()`; `null` thì `404` |
| 5 | Thao tác thành công redirect `303`; xóa có trang xác nhận | `res.redirect(303, ...)`; link "Xóa" chỉ mở `GET /admin/:res/:id/delete` |

## 3. Cách chạy

Yêu cầu: Node.js 18 trở lên và một project Supabase.

```bash
npm install
cp .env.example .env
```

Mở `.env` và điền chuỗi kết nối (Supabase → nút **Connect**):

| Biến | Dùng cho | Cổng |
| --- | --- | --- |
| `DATABASE_URL` | Ứng dụng khi chạy: pooler, Transaction mode, có `?pgbouncer=true` | 6543 |
| `DIRECT_URL` | `prisma db push`: Session pooler (cần để tạo bảng) | 5432 |
| `PORT` | Cổng của server Express (mặc định 3000) | |

Slide hướng dẫn dùng **Session pooler cổng 5432** cho `DATABASE_URL`. Nhóm tách thành hai
biến: ứng dụng dùng Transaction pooler (6543) để không giữ kết nối lâu, còn `db push` cần
Session mode nên đi qua `DIRECT_URL` (5432). Nếu chỉ có một chuỗi Session pooler, gán cùng
chuỗi đó cho cả hai biến (bỏ `?pgbouncer=true`) cũng chạy được.

Tạo bảng (Code-first), nạp dữ liệu mẫu, rồi chạy server:

```bash
npx prisma db push
npx prisma db seed
npm run dev
```

Mở `http://localhost:3000/`.

| Script | Nhiệm vụ |
| --- | --- |
| `npm run dev` | Chạy server với `node --watch` (tự khởi động lại khi sửa code) |
| `npm start` | Chạy server bình thường |
| `npm run db:push` | `prisma db push`: đồng bộ `schema.prisma` lên database (Code-first) |
| `npm run db:seed` | `prisma db seed`: **xóa toàn bộ dữ liệu cũ** rồi nạp 51 món, 5 đầu bếp, 45 nguyên liệu |
| `postinstall` | Tự chạy `prisma generate` sau `npm install` để sinh Prisma Client |

Vì seed luôn xóa trước khi nạp, chạy lại `npm run db:seed` trước khi quay video hoặc nộp bài
để database về đúng trạng thái ban đầu.

## 4. Công nghệ sử dụng

| Phần | Dùng gì | Vì sao |
| --- | --- | --- |
| Web framework | Express 4 | Starter của lớp. Thấy rõ thứ tự middleware và cách khớp method + path. Handler async được bọc bằng `asyncHandler` để lỗi đi tới middleware `500` (Express 4 không tự làm). |
| Template engine | EJS 3 | `<%= %>` **tự escape** (chống XSS); `include()` tách header, footer, form dùng chung. |
| Database | PostgreSQL trên Supabase | Theo đề bài; không phải cài database server. |
| ORM | Prisma 6 | Khai báo model trong `schema.prisma`, `db push` tạo bảng (Code-first). Truy vấn bằng hàm của model nên giá trị luôn được tham số hóa. Bản 7 bắt buộc `prisma.config.ts` và driver adapter, khác cách cấu hình trong bài, nên dùng bản 6. |
| PATCH và DELETE từ form | `method-override` | Form HTML chỉ gửi `GET`/`POST`. `methodOverride("_method")` đọc `?_method=` của request `POST` và đổi `req.method`. |
| Đọc body form | `express.urlencoded({ extended: false })` | Thiếu middleware này thì `req.body` là `undefined`. |
| Giao diện | Tailwind CSS qua CDN, font Be Vietnam Pro | Không cần bước build CSS. Chỉ tạo style, không gửi dữ liệu. Màu thương hiệu `brand` (đỏ #B8321C), `cream`, `ink` khai báo một lần trong `header.ejs`. |
| Biến môi trường | `dotenv` | Đọc `DATABASE_URL` từ `.env`. |

Phương án khác đã cân nhắc và cái giá của từng lựa chọn: xem mục 11.

### Vì sao chọn ORM: so sánh ba cách truy cập DB (slide "Trade-off")

Cả ba cách dưới đây lấy cùng một dòng của bảng `dishes`, đều chạy trên server và đều truyền
`id` dạng tham số thay vì nối chuỗi SQL:

```js
// 1. SQL thô với pg
const { rows } = await pool.query("SELECT * FROM dishes WHERE id = $1", [id]);
// 2. Query builder (knex)
const dish = await knex("dishes").where({ id }).first();
// 3. ORM (Prisma) — cách project dùng
const dish = await prisma.dish.findUnique({ where: { id } });
```

| Giải pháp | Được | Mất |
| --- | --- | --- |
| SQL thô (`pg`) | Thấy chính xác SQL nào chạy; không thêm thư viện | Lặp lại nhiều; sai tên cột chỉ lộ khi chạy |
| Query builder (`knex`) | Ghép điều kiện động bằng hàm | Vẫn phải hiểu SQL |
| ORM (Prisma) | Model và object thay cho bảng và dòng; có quan hệ, migration | Thêm khái niệm; không thấy ngay SQL sinh ra |

Nhóm chọn Prisma vì dữ liệu có quan hệ (món – đầu bếp, món – nguyên liệu) và cần lọc, sắp
xếp, phân trang động. Project **không có** `$queryRaw` hay `$queryRawUnsafe`, nên không có
chỗ nào nối giá trị người dùng vào chuỗi SQL.

### Code-first

| | Code-first (project dùng) | DB-first |
| --- | --- | --- |
| Nguồn của schema | `prisma/schema.prisma` trong repository | Bảng đã có trong database |
| Lệnh Prisma | `prisma db push` (hoặc `prisma migrate dev`) | `prisma db pull` |
| Khi nào dùng | Bắt đầu dự án từ đầu | Database đã tồn tại hoặc do nhóm khác quản lý |

## 5. Cấu trúc

```text
.env.example                    # mẫu biến môi trường (không chứa mật khẩu thật)
.gitignore                      # bỏ qua .env và node_modules
package.json                    # script + cấu hình prisma.seed
prisma/
├── schema.prisma               # MODEL: Dish, Chef, Ingredient, DishIngredient
└── seed.js                     # dữ liệu mẫu cho cả ba bảng + công thức
src/
├── server.js                   # nạp .env, app.listen(PORT)
├── app.js                      # middleware theo thứ tự, gắn router, 404, 500
├── db/
│   └── prisma.js               # một PrismaClient dùng chung toàn ứng dụng
├── utils/
│   ├── helpers.js              # RESTAURANT (tên, giờ mở cửa, hotline, địa chỉ), parseId, paginate, str, asyncHandler, formatPrice...
│   └── validators.js           # validateDish/Chef/Ingredient, *ToValues, DISH_CATEGORIES, DISH_SORTS
└── routes/
    ├── dishes.js               # KHÁCH: GET /dishes, GET /dishes/:id
    ├── bookings.js             # KHÁCH: form đặt bàn, POST /bookings, trang xác nhận
    ├── about.js                # KHÁCH: GET /about (Về chúng tôi)
    └── admin/
        ├── dishes.js           # QUẢN TRỊ: 8 route CRUD /admin/dishes
        ├── chefs.js            # QUẢN TRỊ: 8 route CRUD /admin/chefs
        ├── ingredients.js      # QUẢN TRỊ: 8 route CRUD /admin/ingredients
        └── bookings.js         # QUẢN TRỊ: danh sách đặt bàn, đổi trạng thái
views/                          # TEMPLATE: chỉ quyết định dữ liệu trông thế nào
├── partials/
│   ├── header.ejs              # <head>, bảng màu thương hiệu, navbar Khách / Quản trị
│   ├── footer.ejs              # footer: thực đơn theo danh mục, hỗ trợ, liên hệ
│   ├── logo.ejs                # logo Lửa Hồng (SVG)
│   ├── form-errors.ejs         # khung lỗi đỏ trên đầu form (400)
│   ├── page-heading.ejs        # tiêu đề trang + link quay lại
│   ├── pagination.ejs          # thanh phân trang dùng chung (‹ 1 … 4 5 [6] 7 8 … 20 ›)
│   └── chef-avatar.ejs         # ảnh đầu bếp, hoặc chữ cái đầu nếu không có ảnh
├── dishes/
│   ├── index.ejs               # trang chủ + thực đơn: tìm kiếm, ô danh mục, lọc, sắp xếp, phân trang, đặt bàn
│   └── show.ejs                # chi tiết món: đầu bếp, công thức
├── bookings/
│   ├── new.ejs                 # form đặt bàn
│   └── show.ejs                # xác nhận mã đặt bàn + trạng thái
├── about.ejs                   # Về chúng tôi
├── admin/
│   ├── dishes/                 # index, new, edit, _form, show, delete
│   ├── chefs/                  # index, new, edit, _form, show, delete
│   ├── ingredients/            # index, new, edit, _form, show, delete
│   └── bookings/               # index (danh sách đặt bàn, đổi trạng thái)
└── errors/
    ├── 404.ejs
    └── 500.ejs
```

Mỗi đối tượng quản trị dùng **một** `_form.ejs` chung cho trang thêm (`new.ejs`) và trang
sửa (`edit.ejs`). Hai trang chỉ khác `action` của form và nhãn nút.

Ranh giới trách nhiệm (speaker note slide "Mental model"): **handler quyết định lấy dữ liệu
nào**, **template chỉ quyết định dữ liệu trông thế nào**. Template không gọi Prisma và không
nhận `prisma` hay `process.env`.

## 6. Thiết kế database (`prisma/schema.prisma`)

Mỗi model là một bảng, mỗi trường là một cột. Khóa chính `Int @id @default(autoincrement())`
do database sinh. `@@map` đặt tên bảng thật là chữ thường số nhiều. `String?` cho phép `null`.

| Model | Bảng | Trường |
| --- | --- | --- |
| `Dish` | `dishes` | `id`, `name`, `description?`, `price` (Int, VNĐ), `category?`, `imageUrl?`, `available` (mặc định `true`), `createdAt`, `chefId?` |
| `Chef` | `chefs` | `id`, `name`, `specialty`, `imageUrl?`, `createdAt` |
| `Ingredient` | `ingredients` | `id`, `name`, `unit`, `createdAt` |
| `DishIngredient` | `dish_ingredients` | `dishId`, `ingredientId`, `quantity` (Float); khóa chính `(dishId, ingredientId)` |
| `Booking` | `bookings` | `id`, `code` (unique, 8 ký tự hex ngẫu nhiên), `name`, `phone`, `guests`, `bookedAt` (DateTime), `note?`, `status` (`pending`/`confirmed`/`cancelled`), `createdAt` |

`price` là số nguyên vì tiền VNĐ không có phần lẻ, tránh sai số của số thực.

### Quan hệ (phần nhóm làm thêm)

Speaker note của slide "Dữ liệu" ghi: ba đối tượng độc lập, quan hệ giữa chúng không thuộc
yêu cầu. Nhóm **thêm** quan hệ để trang chi tiết có nội dung thật, nhưng vẫn giữ đủ trường
gợi ý và CRUD riêng cho từng đối tượng:

| Quan hệ | Cách khai báo | Khi xóa |
| --- | --- | --- |
| Món ăn → Đầu bếp phụ trách (nhiều – một) | `Dish.chefId` → `Chef.id` | Xóa đầu bếp: món còn lại, `chefId = null` (`onDelete: SetNull`). Trang xác nhận xóa báo số món bị ảnh hưởng |
| Món ăn ↔ Nguyên liệu (nhiều – nhiều, có định lượng) | Bảng nối `DishIngredient` | Xóa món hoặc nguyên liệu: dòng trong bảng nối bị xóa theo (`onDelete: Cascade`), món và nguyên liệu kia vẫn còn |

### Dữ liệu mẫu (`prisma/seed.js`)

| Bảng | Số bản ghi | Ghi chú |
| --- | --- | --- |
| `dishes` | 51 | Khai vị 9, Món chính 15, Món phụ 9, Tráng miệng 9, Đồ uống 9. Pizza Margherita đặt "tạm hết" |
| `chefs` | 5 | Bếp trưởng món Á, Steak & Món Âu, Bếp trưởng điều hành, Bếp món Ý, Bếp bánh ngọt |
| `ingredients` | 45 | Thăn bò Wagyu (kg), Mỳ spaghetti (gram), Kem tươi (ml), Trứng gà (quả)... |
| `dish_ingredients` | Mỗi món 1 đến 5 dòng | Công thức cho một phần ăn |

## 7. Truyền dữ liệu giữa các trang: params, query, body

Mỗi request là một request mới; server không nhớ trang trước vừa hiển thị gì. Vì vậy thông
tin cần thiết phải nằm trong chính request, ở đúng chỗ:

| Nơi | Dùng cho | Ví dụ trong project |
| --- | --- | --- |
| `req.params` | Cho biết **bản ghi nào** | `/dishes/2` → `{ id: "2" }`; `/admin/chefs/3/edit` |
| `req.query` | **Điều kiện hiển thị**: tìm, lọc, sắp xếp, trang | `/dishes?q=phở&category=Món chính&sort=price-asc&page=2` |
| `req.body` | **Nội dung cần ghi** | Form POST: `name=...&price=...&chefId=...` |

Trang sửa món cần cả hai: `id` từ params cho biết sửa món nào, nội dung mới từ body.

### Truyền id, đọc lại từ database

Link từ trang danh sách chỉ mang `id` (`<a href="/dishes/<%= d.id %>">`). Trang chi tiết
**đọc lại** món từ database ở mỗi request, không nhận cả object từ trang trước. Nhờ đó mở
thẳng `/dishes/2` ở tab mới, gửi link cho người khác, Reload hay Back đều ra đúng dữ liệu
hiện tại.

### Query giữ lại khi chuyển trang

Ở `/dishes`, các điều kiện hiển thị đi cùng nhau: đổi danh mục giữ từ khóa và kiểu sắp xếp;
chuyển trang giữ cả ba; đổi sắp xếp giữ từ khóa và danh mục. Hàm `filterHref()` và
`pageHref()` trong `views/dishes/index.ejs` ghép các query này vào link. Vì mọi điều kiện nằm
trong URL, link kết quả tìm kiếm lưu lại và gửi cho người khác được.

### Lỗi thường gặp khi đọc request (slide "Lỗi thường gặp khi đọc dữ liệu từ request")

| Lỗi | Project xử lý |
| --- | --- |
| `req.params.id` là chuỗi `"2"`, không phải số | `parseId()` đổi sang số và chỉ nhận số nguyên dương; sai thì `404`, không gọi Prisma |
| `req.query.q` thành mảng khi URL là `?q=a&q=b` | `typeof req.query.q === "string" ? ... : ""`; tương tự cho `category` (`parseDishSort()` cho `sort`) |
| Giá trị form là chuỗi, kể cả `type="number"` | Validator kiểm tra bằng regex rồi mới `Number()`: giá `/^\d+$/`, định lượng `/^\d+(\.\d+)?$/` |
| Input thiếu `name` không xuất hiện trong request | Mọi input có `name`; checkbox `available` không gửi khi bỏ chọn nên được hiểu là `false` |

## 8. Danh sách route

Ứng dụng SSR nên các route trả về **HTML** hoặc redirect, không trả JSON.

### 8.1. Trang người dùng (chỉ đọc)

| Method | URL | Kết quả |
| --- | --- | --- |
| `GET` | `/` | `302` → `/dishes` |
| `GET` | `/dishes` | `200`. 9 món mỗi trang, mỗi món có link sang trang chi tiết |
| `GET` | `/dishes?q=phở` | Lọc `name` chứa `q`, không phân biệt hoa thường; ô tìm kiếm giữ lại `q` |
| `GET` | `/dishes?category=Tráng miệng` | Lọc theo danh mục; giá trị lạ coi như "Tất cả" |
| `GET` | `/dishes?sort=price-asc` | Sắp xếp: `default`, `newest`, `price-asc`, `price-desc`, `name-asc`; giá trị lạ coi như `default` |
| `GET` | `/dishes?page=2` | Phân trang; số trang sai thành 1, vượt quá thành trang cuối |
| `GET` | `/dishes/:id` | `200` chi tiết (đủ các trường, đầu bếp, công thức), hoặc `404` khi id sai / không có |
| `GET` | `/about` | `200`. Về chúng tôi: giới thiệu, lý do chọn nhà hàng, đội ngũ đầu bếp (đọc từ DB), địa chỉ |
| `GET` | `/bookings/new` | `200`. Form đặt bàn |
| `POST` | `/bookings` | Sai: `400` + form kèm lỗi và giá trị đã nhập. Đúng: tạo yêu cầu rồi `303` → `/bookings/:code` |
| `GET` | `/bookings/:code` | `200` trang xác nhận đã nhận yêu cầu, hoặc `404` khi mã sai / không có |

Trang xác nhận dùng `code` ngẫu nhiên thay cho `id`: `id` tăng dần nên ai cũng đoán được
`/bookings/1`, `/bookings/2`… và xem được tên, số điện thoại của khách khác.

Phần quản trị đặt bàn chỉ có hai route (yêu cầu do khách tạo, nhân viên chỉ đổi trạng thái):

| Method | URL | Kết quả |
| --- | --- | --- |
| `GET` | `/admin/bookings` | `200`. Lịch từ hôm nay trở đi, sắp theo giờ; `?show=all` hiện cả lịch đã qua |
| `PATCH` | `/admin/bookings/:id` (form `POST` tới `?_method=PATCH`, body `status=...`) | Đúng: `303` → `/admin/bookings`. Trạng thái lạ: `400`. Id sai / không có: `404` |

### 8.2. Trang quản trị (bảng CRUD của slide)

Cùng một bảng cho cả ba đối tượng, thay `:res` bằng `dishes`, `chefs` hoặc `ingredients`.
`GET /admin` redirect sang `/admin/dishes`.

| # | Thao tác | Method | URL | Kết quả |
| --- | --- | --- | --- | --- |
| 1 | Danh sách | `GET` | `/admin/:res` | `200`. Bảng dữ liệu, nút "+ Thêm mới", link Sửa, Xóa |
| 2 | Mở form thêm | `GET` | `/admin/:res/new` | `200`. Form trống |
| 3 | Thêm | `POST` | `/admin/:res` | `303` sang chi tiết, hoặc `400` |
| 4 | Chi tiết | `GET` | `/admin/:res/:id` | `200` hoặc `404` |
| 5 | Mở form sửa | `GET` | `/admin/:res/:id/edit` | `200` (điền sẵn từ DB) hoặc `404` |
| 6 | Sửa | `PATCH` | `/admin/:res/:id` (form `POST` tới `?_method=PATCH`) | `303`, `400` hoặc `404` |
| 7 | Xác nhận xóa | `GET` | `/admin/:res/:id/delete` | `200` hoặc `404` |
| 8 | Xóa | `DELETE` | `/admin/:res/:id` (form `POST` tới `?_method=DELETE`) | `303` sang danh sách, hoặc `404` |

Các trang danh sách quản trị nhận `?page=` (10 dòng mỗi trang, mục 10). `/admin/dishes`
cũng nhận `?sort=` với cùng các lựa chọn như trang khách.

Mỗi thao tác ghi đi cùng một trang `GET`: form thêm, form sửa, trang xác nhận xóa. Đích của
redirect luôn là một URL mà `GET` mở được: sau thêm và sửa là trang chi tiết, sau xóa là danh
sách (vì trang chi tiết không còn).

### 8.3. Mã lỗi (slide "Mã lỗi")

| Loại | Ví dụ | Status | Server làm |
| --- | --- | --- | --- |
| Input sai | `name` trống, `price` âm | `400` | Không ghi database; render lại form kèm lỗi và giá trị đã nhập |
| Không tìm thấy | `/dishes/999`, `/dishes/abc`, URL không khớp route | `404` | `views/errors/404.ejs` có link về `/dishes` và `/admin/dishes` |
| Lỗi hệ thống | Mất kết nối database | `500` | `console.error(err)` ở server; trang chung "Đã xảy ra lỗi hệ thống", không in `err.message` |

### 8.4. Luật validate

| Đối tượng | Trường | Luật |
| --- | --- | --- |
| Món ăn | `name` | Bắt buộc, tối đa 100 ký tự |
| | `price` | Bắt buộc, chỉ gồm chữ số (`/^\d+$/`), tối đa 2 147 483 647 (`Int` của PostgreSQL). `-5`, `abc`, `1e3`, `10.5` bị từ chối |
| | `category` | Để trống, hoặc một trong: Khai vị, Món chính, Món phụ, Tráng miệng, Đồ uống |
| | `description` | Không bắt buộc, tối đa 1000 ký tự |
| | `imageUrl` | Không bắt buộc; nếu có phải là URL `http://` hoặc `https://` (chặn `javascript:...`) |
| | `available` | Checkbox: gửi `"on"` thì `true`, không gửi thì `false` |
| | `chefId` | Để trống (chưa phân công), hoặc id của một đầu bếp đang tồn tại |
| | Công thức | Mỗi nguyên liệu được chọn phải tồn tại và có định lượng > 0, tối đa 100 000; nhận cả `0,25` và `0.25` |
| Đầu bếp | `name`, `specialty` | Bắt buộc, tối đa 100 / 150 ký tự |
| | `imageUrl` | Như món ăn |
| Nguyên liệu | `name`, `unit` | Bắt buộc, tối đa 100 / 20 ký tự. Ô đơn vị có gợi ý (`<datalist>`) |
| Đặt bàn | `name` | Bắt buộc, tối đa 100 ký tự |
| | `phone` | 10 chữ số, bắt đầu bằng 0; nhận cả `0123 456 789`, `0123.456.789` và lưu chỉ chữ số |
| | `guests` | Số nguyên 1 đến 20 (nhóm đông hơn gọi hotline) |
| | `date`, `time` | Ngày có thật, giờ thuộc khung 10:00 – 21:00 mỗi 30 phút; thời điểm phải ở tương lai và trong vòng 60 ngày. Tính theo giờ Việt Nam (UTC+7) |
| | `note` | Không bắt buộc, tối đa 500 ký tự |

## 9. Luồng dữ liệu

### Đọc danh sách và tìm kiếm (`GET /dishes?q=...`)

1. Người dùng gõ từ khóa vào `<form method="GET" action="/dishes">` và bấm **Tìm**. Form

   dùng GET nên trình duyệt tự tạo URL `/dishes?q=phở` và gửi một document request.
2. **Router** khớp `GET /dishes`. **Handler** lấy `q`, `category`, `sort`, `page` an toàn từ

   `req.query`.
3. **Model**: `prisma.dish.count({ where })` để tính số trang, rồi

   `prisma.dish.findMany({ where, orderBy, include: { chef: true }, skip, take: 9 })`.
    `q` rỗng thì `contains: ""` khớp tất cả.
4. **Template**: `res.render("dishes/index", {...})`. EJS dựng HTML đầy đủ (card có ảnh, giá

   VNĐ, trạng thái, đầu bếp) và gửi về. Ô tìm kiếm có `value="<%= q %>"` nên giữ từ khóa.

### Thêm bản ghi (`POST /admin/dishes`)

1. Người dùng điền form ở `/admin/dishes/new` rồi bấm **Thêm món ăn**. Trình duyệt gửi

   `POST /admin/dishes`, body `application/x-www-form-urlencoded`.
2. `express.urlencoded` đọc body vào `req.body`.
3. **Handler** đọc danh sách đầu bếp, nguyên liệu rồi gọi `validateDish(req.body, options)`.
   - Có lỗi: `res.status(400).render("admin/dishes/new", { values, errors, ... })`. Không ghi
    DB; form hiện lại với khung lỗi đỏ và nội dung vừa gõ.
   - Hợp lệ: `prisma.dish.create({ data: { ...data, ingredients: { create: recipe } } })`.
   Món và công thức được tạo trong cùng một lệnh.
4. `res.redirect(303, "/admin/dishes/" + created.id)`. `created.id` là id database vừa sinh.

   Trình duyệt tự gửi `GET /admin/dishes/:id` và hiện trang chi tiết.

### Sửa bản ghi (`PATCH /admin/dishes/:id`)

1. Form ở trang sửa: `<form method="POST" action="/admin/dishes/3?_method=PATCH">`.
2. `methodOverride("_method")` (đặt **trước** router) đổi `req.method` thành `PATCH`, nên

   `router.patch("/:id")` khớp.
3. Handler: id hợp lệ → bản ghi tồn tại (`404`) → dữ liệu hợp lệ (`400`) →

   `prisma.dish.update` (thay toàn bộ công thức cũ bằng công thức mới) → `303` về trang chi
    tiết.

### Xóa bản ghi (`DELETE /admin/dishes/:id`)

1. Link "Xóa" trong bảng là `GET /admin/dishes/3/delete`: **chỉ mở trang xác nhận**.
2. Trang xác nhận có `<form method="POST" action="/admin/dishes/3?_method=DELETE">` với nút

   **Xác nhận xóa**, và link **Hủy** về danh sách.
3. `method-override` đổi thành `DELETE`. Handler kiểm tra tồn tại (`404`), gọi

   `prisma.dish.delete`, rồi `303` → `/admin/dishes`.

## 10. Cơ chế phân trang

Phân trang có ở bốn trang danh sách, cùng dùng một hàm `paginate()` và một partial
`pagination.ejs`:

| Trang | Số dòng mỗi trang | Query giữ lại khi chuyển trang |
| --- | --- | --- |
| `/dishes` | 9 (lưới 3 cột × 3 hàng) | `q`, `category`, `sort` |
| `/admin/dishes` | 10 | `sort` |
| `/admin/chefs` | 10 | (không có) |
| `/admin/ingredients` | 10 | (không có) |

`/admin/bookings` không phân trang: mặc định chỉ hiện lịch từ hôm nay trở đi nên danh sách
ngắn, và nhân viên cần thấy hết lịch sắp tới trên một trang.

### Kiểu phân trang: offset (`skip` / `take`)

Số trang nằm trong URL (`?page=3`). Server đổi nó thành `OFFSET` / `LIMIT` của SQL:

```text
skip = (page - 1) × pageSize        // bỏ qua bao nhiêu dòng
take = pageSize                     // lấy bao nhiêu dòng
```

Ví dụ `/dishes?page=3` với 9 món mỗi trang: `skip = 18`, `take = 9`, tức các món thứ 19 đến
27 theo thứ tự sắp xếp đang chọn.

### Các bước trong một request

```js
// 1. Đếm số bản ghi khớp bộ lọc (cùng `where` với bước 3)
const total = await prisma.dish.count({ where });
// 2. Tính trang hợp lệ từ ?page=
const { page, totalPages, skip, take } = paginate(total, req.query.page, PAGE_SIZE);
// 3. Lấy đúng các dòng của trang đó
const dishes = await prisma.dish.findMany({ where, orderBy, include: { chef: true }, skip, take });
```

Hàm `paginate()` (`src/utils/helpers.js`):

```js
function paginate(total, rawPage, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(parseId(rawPage) || 1, totalPages);
  return { page, totalPages, skip: (page - 1) * pageSize, take: pageSize };
}
```

| Bước | Lý do |
| --- | --- |
| `count` chạy **trước** `findMany`, không chạy song song | Phải biết `totalPages` mới kẹp được `page` và tính `skip`. Đổi lại mất thêm một lượt gọi database |
| `count` dùng **cùng `where`** với `findMany` | Số trang tính theo kết quả đã lọc. Tìm "phở" ra 4 món thì chỉ có 1 trang, không phải 6 |
| `Math.max(1, ...)` | Không có kết quả nào thì vẫn là "trang 1/1" (hiện thông báo trống), không phải trang 0 và không có `skip` âm |
| `parseId(rawPage) \|\| 1` | Dùng lại hàm kiểm tra id: `?page=abc`, `?page=0`, `?page=-2`, `?page=1.5`, `?page=a&page=b` đều thành trang 1 |
| `Math.min(..., totalPages)` | `?page=999` thành trang cuối thay vì một trang rỗng |

Trang vượt quá được **kẹp về trang cuối** thay vì trả `404` hay một danh sách rỗng. Tình huống
thật: admin đang ở trang 6 của món ăn, xóa món cuối cùng của trang đó; hoặc khách lưu link
`?page=6` rồi thực đơn bớt món. Link cũ vẫn hiện nội dung có ích. `404` chỉ dành cho bản ghi
không tồn tại (`/dishes/999`), còn `page` chỉ là điều kiện hiển thị.

### Thứ tự sắp xếp phải ổn định

Offset chỉ đúng khi thứ tự giữa các lần truy vấn không đổi. PostgreSQL **không bảo đảm** thứ
tự của các dòng có cùng giá trị sắp xếp: hai món cùng giá 45 000 ₫ có thể đổi chỗ giữa hai
request, làm một món xuất hiện ở cả trang 2 và trang 3, món kia biến mất. Vì vậy mỗi kiểu sắp
xếp trong `DISH_SORTS` đều có thêm `id` làm khóa phụ (`id` là duy nhất):

```js
"price-asc": { label: "Giá thấp → cao", orderBy: [{ price: "asc" }, { id: "asc" }] },
```

Danh sách đầu bếp và nguyên liệu sắp theo `id` nên đã ổn định sẵn.

### Link phân trang giữ bộ lọc

Template truyền vào partial một hàm `pageHref(p)` trả URL của trang `p`. Partial chỉ lo vẽ
nút, còn mỗi trang tự quyết URL gồm những query nào:

```ejs
<%# views/dishes/index.ejs %>
const pageHref = function (p) {
  const base = filterHref(category);          // /dishes?category=...&q=...&sort=...
  if (p <= 1) return base + "#thuc-don";
  return base + (base.includes("?") ? "&" : "?") + "page=" + p + "#thuc-don";
};
<%- include("../partials/pagination", { page, totalPages, pageHref }) %>
```

- Trang 1 không ghi `page=1`, nên `/dishes` và "trang 1" là cùng một URL.
- Giá trị được `encodeURIComponent` ("Món chính" → `M%C3%B3n%20ch%C3%ADnh`).
- `#thuc-don` cuộn trang mới xuống phần thực đơn, không quay lên phần đầu trang.
- Ngược lại, **đổi bộ lọc thì về trang 1**: `filterHref()`, form tìm kiếm và form sắp xếp
  không gửi `page`. Trang 4 của "tất cả món" có thể không tồn tại khi chỉ lọc "Đồ uống", và
  người dùng muốn xem kết quả mới từ đầu.

### Dãy nút trang (`views/partials/pagination.ejs`)

Luôn hiện trang đầu, trang cuối và 2 trang mỗi bên trang hiện tại; khoảng trống giữa chúng
thành `…`:

```text
trang 1 / 20:   ‹  [1] 2 3 … 20  ›
trang 6 / 20:   ‹  1 … 4 5 [6] 7 8 … 20  ›
trang 20 / 20:  ‹  1 … 18 19 [20]  ›
```

- Chỉ có 1 trang thì không hiện thanh phân trang.
- Nút `‹` ở trang đầu và `›` ở trang cuối là `<span>` mờ, không phải link, nên không có link
  trỏ tới trang không tồn tại.
- Trang hiện tại là `<span aria-current="page">`; link trước/sau có `rel="prev"` /
  `rel="next"`; thẻ `<nav aria-label="Phân trang">` cho trình đọc màn hình.
- Phía trên danh sách in "51 món · Trang 2/6" để người dùng biết đang ở đâu.

Mọi nút là thẻ `<a>` thường: bấm là một document request `GET` mới, server dựng lại cả trang.
Không có JavaScript, Back/Forward của trình duyệt đi đúng từng trang, và mỗi trang có URL
riêng để gửi cho người khác.

### Giới hạn đã biết

| Giới hạn | Vì sao chấp nhận |
| --- | --- |
| `OFFSET` lớn vẫn phải quét qua các dòng bị bỏ qua | Dữ liệu chỉ vài chục dòng. Hàng trăm nghìn dòng mới cần chuyển sang cursor (xem mục 11) |
| `count` và `findMany` là hai truy vấn riêng, không trong transaction | Nếu có người thêm hoặc xóa đúng giữa hai truy vấn, "Trang x/y" có thể lệch một trang trong một lần tải. Lần tải sau tự đúng; không ảnh hưởng dữ liệu |
| Khi danh sách thay đổi giữa hai lần bấm, một bản ghi có thể bị lặp hoặc bị nhảy qua | Đặc tính chung của offset. Chấp nhận được với thực đơn ít thay đổi |

## 11. Lý do các quyết định kỹ thuật

Mục 4 liệt kê công nghệ. Mục này giải thích vì sao chọn cách đó thay vì phương án khác, và
nhóm phải đánh đổi gì.

### Kiến trúc và tech stack

| Quyết định | Phương án đã cân nhắc | Lý do chọn | Đánh đổi |
| --- | --- | --- | --- |
| SSR: server dựng HTML hoàn chỉnh | SPA (React) gọi API JSON | Đúng chủ đề Block 5. Một server, một codebase, không cần API riêng. Trang có nội dung ngay trong HTML (View Page Source thấy tên món), link nào cũng mở thẳng được | Mỗi thao tác tải lại cả trang; không có cập nhật tức thời |
| Express 4 | Express 5, Fastify | Starter của lớp, tài liệu và ví dụ trên slide đều là Express 4 | Express 4 không tự bắt lỗi của handler `async`, nên phải tự viết `asyncHandler` |
| EJS | Pug, Handlebars | Cú pháp là HTML thường chèn JavaScript, cả nhóm đọc được ngay. `<%= %>` tự escape; `include()` truyền tham số được (dùng cho `_form.ejs`, `pagination.ejs`) | Template có thể chứa logic; nhóm tự giữ quy tắc "template không gọi Prisma" |
| Prisma 6 | SQL thô (`pg`), `knex`, Prisma 7 | Có quan hệ và lọc, sắp xếp, phân trang động (mục 4). Tham số hóa sẵn. Prisma 7 đổi cách cấu hình (`prisma.config.ts`, driver adapter) khác bài giảng | Không thấy ngay câu SQL sinh ra; thêm bước `prisma generate` |
| `db push` (Code-first) | `prisma migrate dev` | Bài tập chưa có dữ liệu thật cần giữ; `db push` một lệnh là đồng bộ | Không có lịch sử migration. Làm sản phẩm thật nên chuyển sang `migrate` |
| Hai chuỗi kết nối `DATABASE_URL` (6543) và `DIRECT_URL` (5432) | Một chuỗi Session pooler như slide | Transaction pooler trả kết nối ngay sau mỗi truy vấn, hợp với server dev khởi động lại liên tục; `db push` cần Session mode | Thêm một biến môi trường phải điền |
| Một `PrismaClient` dùng chung (`src/db/prisma.js`) | `new PrismaClient()` trong từng router | Mỗi client mở một pool kết nối. Với `node --watch`, client được giữ trên `globalThis` để không mở thêm pool sau mỗi lần khởi động lại | Không có |
| Tailwind qua CDN | Tailwind CLI có bước build, CSS viết tay | Không cần build, chạy `npm run dev` là có giao diện. Bảng màu `brand`, `cream`, `ink` khai báo một chỗ | CDN tạo CSS ở trình duyệt nên tải chậm hơn chút; Tailwind khuyên không dùng CDN cho production |
| `method-override` qua `?_method=` trong URL | Hidden input `_method` trong body | Đọc từ query nên không phụ thuộc thứ tự với `urlencoded`, và DevTools hiện rõ `POST ...?_method=DELETE` | `_method` lộ trên URL của form (không phải dữ liệu nhạy cảm) |

### Cách xử lý request và dữ liệu

| Quyết định | Lý do |
| --- | --- |
| Validator trả `{ values, errors, data }` | Ba nhu cầu khác nhau: `values` là chuỗi gốc để hiện lại form khi `400` (giữ cả giá trị sai như `-5`), `errors` để báo lỗi, `data` là object đã ép kiểu và chỉ có trường được phép ghi. Tách ra nên handler không bao giờ đưa `req.body` vào Prisma |
| Validator nằm ở server, HTML validation chỉ là phụ | Request có thể gửi bằng `curl` không qua form. Server là nơi duy nhất tin được |
| Kiểm tra số bằng regex trước khi `Number()` | `Number("")` là `0`, `Number("1e3")` là `1000`, `Number(" 5 ")` là `5`. Regex `/^\d+$/` chỉ nhận đúng dạng chữ số |
| `chefId`, nguyên liệu đối chiếu với danh sách đọc từ DB | Nếu để database báo lỗi khóa ngoại, người dùng thấy `500`. Kiểm tra trước thì trả `400` với thông báo rõ |
| Query lạ coi như mặc định, không báo lỗi | `?sort=abc`, `?category=xyz`, `?page=-1` chỉ là điều kiện hiển thị. Trả trang mặc định có ích hơn trang lỗi, và `orderBy` chỉ nhận khóa có trong `DISH_SORTS` nên không đưa được tên cột tùy ý vào truy vấn |
| `PATCH`: kiểm tra id → tồn tại → dữ liệu | Sửa bản ghi không tồn tại luôn là `404`, không phụ thuộc dữ liệu gửi lên. Thêm `try/catch` mã `P2025` cho trường hợp bị xóa giữa lúc kiểm tra và lúc ghi |
| Sửa công thức bằng `deleteMany: {}` + `create` trong cùng một `update` | Đơn giản hơn so sánh từng dòng cũ/mới để thêm, sửa, xóa riêng. Prisma chạy cả lệnh nested trong một transaction nên không có lúc món bị mất công thức |
| Xóa đi qua trang xác nhận `GET .../delete` | Không có link `GET` nào ghi dữ liệu. Trang xác nhận còn báo hệ quả (số món mất đầu bếp phụ trách, số món dùng nguyên liệu) |
| `onDelete: SetNull` cho đầu bếp, `Cascade` cho bảng nối | Đầu bếp nghỉ không làm mất món khỏi thực đơn. Dòng công thức không có nghĩa khi món hoặc nguyên liệu không còn |
| `303` thay vì `302` | `303` quy định rõ request tiếp theo là `GET`, kể cả khi request gốc là `PATCH`/`DELETE` |
| Sau thêm/sửa về trang chi tiết, sau xóa về danh sách | Người dùng thấy ngay kết quả vừa ghi, đọc lại từ DB. Sau xóa thì trang chi tiết không còn |
| Trang `500` không nhận `err` | Không thể vô tình in tên bảng, cột hay chuỗi kết nối ra HTML; chi tiết lỗi chỉ ở `console.error` của server |
| `price` kiểu `Int` | VNĐ không có phần lẻ; số thực có sai số khi cộng |
| Số liệu đầu trang `/dishes` dùng `Promise.all` | Bốn truy vấn (đếm theo danh mục, số đầu bếp, giá thấp nhất, ảnh bìa) không phụ thuộc nhau nên chạy song song. Chúng tính trên toàn thực đơn, không theo bộ lọc, để các ô danh mục luôn hiện đủ số món |
| Đặt bàn dùng `code` ngẫu nhiên 8 ký tự hex trong URL | `id` tăng dần đoán được. `crypto.randomBytes(4)` cho khoảng 4 tỉ giá trị; nếu trùng (`P2002` của cột `@unique`) thì thử lại tối đa 3 lần |
| Giờ đặt bàn tính theo `Asia/Ho_Chi_Minh` | Server hoặc database có thể chạy giờ UTC. Tính rõ múi giờ thì "18:30 hôm nay" luôn là 18:30 ở Việt Nam |
| Seed xóa hết rồi nạp lại | Chạy bao nhiêu lần cũng ra cùng một trạng thái, tiện trước khi demo |

### Vì sao phân trang offset, không dùng cursor

| | Offset (`skip`/`take`, project dùng) | Cursor (`cursor` + `take`) |
| --- | --- | --- |
| URL | `?page=3` | `?after=27` (id của dòng cuối trang trước) |
| Nhảy tới trang bất kỳ, hiện "Trang 3/6" | Được | Không, chỉ "trang sau" / "xem thêm" |
| Sắp xếp theo giá, tên | Chỉ cần `orderBy` | Cursor phải gồm cả giá trị sắp xếp và `id`, phức tạp hơn |
| Tốc độ với bảng rất lớn | Chậm dần khi trang càng xa | Ổn định |
| Danh sách thay đổi giữa hai lần bấm | Có thể lặp hoặc sót một dòng | Không lặp, không sót |

Thực đơn vài chục món, cần dãy số trang và nhiều kiểu sắp xếp, nên offset hợp hơn. Cursor
phù hợp với feed dài vô tận, chẳng hạn danh sách đặt bàn sau vài năm hoạt động.

### Vì sao không dùng JavaScript phía client

Ngoài việc đề bài cấm `fetch`/AJAX, dùng form và link thường cho nhiều thứ miễn phí: Back,
Reload, mở tab mới, lưu link đều chạy đúng; trang dùng được khi tắt JavaScript (ô sắp xếp có
nút "Áp dụng" trong `<noscript>`); và mọi trạng thái nằm ở URL hoặc database, không có trạng
thái nào chỉ tồn tại trong trình duyệt.

## 12. Các điểm kiến thức của buổi học

### Chuỗi kết nối không rời khỏi server

- `DATABASE_URL` chỉ nằm trong `.env` trên server; `.env` nằm trong `.gitignore`, chỉ commit
`.env.example` (chuỗi mẫu, không có mật khẩu).
- Không truyền `process.env` hay `prisma` vào `res.render`. View chỉ nhận các helper an toàn
  qua `app.locals` (`formatPrice`, `formatQty`, `formatDateTime`, `formatPhone`, `DEFAULT_DISH_IMAGE`, `RESTAURANT`).
- EJS chạy trên server nên đọc được mọi biến handler truyền vào; nếu in ra, giá trị nằm trong
HTML gửi cho người truy cập. Vì vậy chỉ truyền đúng dữ liệu cần hiển thị.

### Đọc và ghi qua model

- `findUnique` trả `null` khi không có bản ghi: handler trả `404` ngay, không render tiếp.
- `id` từ URL là chuỗi: đổi thành số và kiểm tra **trước** khi truy vấn. Không có bước này,
`/dishes/abc` thành lỗi `500` thay vì `404`.
- `data` truyền vào `create`/`update` là object đã qua validate, **không phải** `req.body`.
Nếu đưa thẳng `req.body`, client có thể ghi cả trường không được phép (`id`, `createdAt`).
- Mọi lời gọi Prisma đều có `await`. Thiếu `await` thì handler redirect khi ghi chưa xong,
hoặc báo thành công khi ghi thất bại.

### Thứ tự middleware

```js
app.use(express.urlencoded({ extended: false })); // 1. có req.body
app.use(methodOverride("_method"));               // 2. đổi POST -> PATCH/DELETE
app.use("/dishes", dishesRouter);                 // 3. routes
// ...
app.use((req, res) => res.status(404).render("errors/404")); // 4. không khớp route nào
app.use((err, req, res, next) => { /* ... */ });            // 5. lỗi 500
```

`methodOverride` phải đứng trước router. Nếu đặt sau, request đã được khớp như `POST` và
`router.patch` / `router.delete` không bao giờ chạy.

### HTTP method: GET để đọc, POST/PATCH/DELETE để ghi

Browser, công cụ tìm kiếm và tiện ích tải trước trang có thể **tự gửi GET**. Một link kiểu
`/admin/dishes/2/xoa-luon` có thể xóa dữ liệu khi không ai bấm. Vì vậy:

- Link "Xóa" chỉ mở trang xác nhận (`GET`); thao tác xóa là form `DELETE`.
- `method-override` mặc định chỉ đổi method của request `POST`. Thử
`GET /admin/dishes/1?_method=DELETE` chỉ hiện trang chi tiết, không xóa gì.
- Trong DevTools → Network, request vẫn hiện là `POST ...?_method=DELETE`; method thật dùng
để khớp route nằm trong code.

### Post/Redirect/Get và mã `303`

Sau khi ghi thành công, server không render trang mà trả `303 See Other` kèm `Location`.
Trình duyệt tự gửi `GET` tới địa chỉ đó. Với PATCH và DELETE qua method override, chuỗi vẫn
là POST → 303 → GET. `303` (thay vì `302`) bảo đảm request tiếp theo luôn là `GET`.

| PRG giải quyết | PRG không giải quyết |
| --- | --- |
| Reload sau khi ghi chỉ lặp lại `GET` | Bấm gửi hai lần trước khi response đầu về vẫn có thể tạo hai bản ghi |
| URL trên thanh địa chỉ là trang kết quả, gửi được cho người khác | Hai tab hoặc hai người gửi cùng nội dung vẫn tạo hai bản ghi |
| Back không quay về một POST đã xử lý | Chặn trùng thật sự cần ràng buộc ở database (tuần 6) |

### Validate ở server và escape đầu ra

- HTML validation (`required`, `maxlength`) chỉ giúp nhập nhanh; request có thể gửi không qua
form (ví dụ `curl`), nên server luôn kiểm tra lại từng input.
- Mọi dữ liệu người dùng được in bằng `<%= %>`, EJS tự escape. Tìm `/dishes?q=<script>` chỉ
hiện chữ `<script>` trên trang. `<%- %>` (không escape) chỉ dùng cho `include()` partial.
- Không hiển thị `err.message` của database cho người dùng vì lộ tên bảng và cột.

### Lỗi thường gặp khi ghi dữ liệu (slide) và cách project tránh

| Lỗi | Trong project |
| --- | --- |
| Dùng link `GET` để xóa hoặc sửa | Không có. Xóa đi qua trang xác nhận + form `DELETE` |
| Render HTML ngay trong response của `POST`, Reload tạo bản ghi trùng | Ghi thành công luôn `303`; chỉ render khi `400` (không ghi gì) |
| Hiển thị `err.message` của database | Trang `500` không nhận `err` |
| Redirect khi chưa `await` xong | Mọi lời gọi Prisma có `await`; `asyncHandler` đưa lỗi tới `500` |

## 13. Đối chiếu tiêu chí nghiệm thu

### Tiêu chí nghiệm thu (slide "Tiêu chí nghiệm thu")

| # | Tiêu chí | Cách kiểm tra | Kết quả |
| --- | --- | --- | --- |
| 01 | Trang người dùng có danh sách và chi tiết món ăn; id sai hoặc không có trả `404` | `/dishes`, `/dishes/1` → `200`; `/dishes/abc`, `/dishes/0`, `/dishes/1.5`, `/dishes/99999` → `404` | Đạt |
| 02 | Món ăn, đầu bếp, nguyên liệu đều có danh sách, thêm, sửa, xóa ở `/admin` | 8 route × 3 đối tượng (mục 8.2) | Đạt |
| 03 | Thêm `POST`, sửa `PATCH`, xóa `DELETE`; không có `fetch` hay AJAX | `src/routes/admin/*.js`; tìm trong `views/` (mục 14) | Đạt |
| 04 | Input sai trả `400` và giữ giá trị đã nhập; thành công trả `303` | Tên rỗng, giá `-5` → `400`, các ô còn nội dung; dữ liệu đúng → `303` + `Location` | Đạt |
| 05 | Xóa chỉ xảy ra sau trang xác nhận; Reload không lặp lại thao tác | Link Xóa → trang xác nhận; F5 sau khi lưu chỉ tải lại trang chi tiết | Đạt |

### Kiểm tra mã nguồn: method và request

| Câu hỏi | Kết quả | Vị trí |
| --- | --- | --- |
| Có link hoặc route `GET` nào xóa hay sửa dữ liệu không? | Không. Mọi `router.get` chỉ đọc và render | `src/routes/**/*.js` |
| Sửa và xóa có route `PATCH` và `DELETE` qua method override không? | Có | `router.patch("/:id")`, `router.delete("/:id")` trong 3 file admin; `router.patch("/:id")` ở `src/routes/admin/bookings.js`; `methodOverride` ở `src/app.js` |
| Thao tác ghi thành công có redirect `303` không? | Có, cả 11 handler ghi (9 CRUD + `POST /bookings` + `PATCH /admin/bookings`) | `res.redirect(303, ...)` |
| Template có `fetch` hoặc AJAX không? | Không | Xem mục 14 |

### Kiểm tra mã nguồn: dữ liệu và bảo mật

| Câu hỏi | Kết quả | Vị trí |
| --- | --- | --- |
| Giá trị người dùng nhập có bị nối vào raw query không? | Không. Không dùng `$queryRaw`/`$queryRawUnsafe`/`$executeRaw` | Toàn bộ `src/` |
| `req.body` có bị đưa thẳng vào `create` hoặc `update` không? | Không. `data` được tạo từng trường trong validator | `src/utils/validators.js` |
| Chuỗi kết nối có xuất hiện trong mã, log hoặc template không? | Không. Chỉ có trong `.env`; `.env.example` là chuỗi mẫu | `src/db/prisma.js` không in gì ra log |

### Quy trình làm bài (slide "Quy trình làm bài")

1. **Nối database**: đặt `DATABASE_URL`, khai báo model, `db push`, seed.
2. **Trang người dùng**: danh sách, chi tiết, `404`.
3. **CRUD món ăn**: form, validate, method override, redirect sau khi ghi.
4. **Đầu bếp và nguyên liệu**: lặp lại đúng mẫu của món ăn, rồi đối chiếu tiêu chí nghiệm thu.

## 14. Cách kiểm tra

Mở DevTools → tab Network rồi thử:

- `http://localhost:3000/` → `302` sang `/dishes`.
- Tìm "phở" → URL thành `/dishes?q=phở`, ô tìm kiếm còn chữ "phở". Tìm "PHỞ" cũng ra.
- Bấm tab danh mục, đổi "Sắp xếp theo", bấm số trang → mỗi lần là một document request
`GET /dishes?...`, các điều kiện cũ vẫn còn trong URL.
- `http://localhost:3000/dishes?q=a&q=b` → trang vẫn chạy, coi như không tìm.
- `/dishes/abc`, `/dishes/0`, `/dishes/99999` → trang 404 (status `404`).
- **Quản trị → Món ăn → + Thêm mới**, để trống tên và nhập giá `-5` → status `400`, khung lỗi
đỏ, các ô còn nguyên nội dung.
- Nhập đúng rồi gửi → Network có `POST /admin/dishes` (`303`) rồi `GET /admin/dishes/:id` (`200`).
Nhấn F5: chỉ có `GET`, không tạo thêm bản ghi.
- Bấm **Sửa**, đổi giá → `POST /admin/dishes/:id?_method=PATCH` (`303`).
- Bấm **Xóa** → trang xác nhận; **Hủy** quay về danh sách; **Xác nhận xóa** →
`POST /admin/dishes/:id?_method=DELETE` (`303` → `/admin/dishes`).
- Làm tương tự với **Đầu bếp** và **Nguyên liệu**. Xóa một đầu bếp: các món của họ thành
"Chưa phân công", không bị xóa.
- View Page Source ở `/dishes`: thấy tên món ngay trong HTML.

Tìm AJAX trong template (không có kết quả nào):

```bash
grep -rn "fetch(\|XMLHttpRequest\|axios" views src
```

JavaScript còn lại trong trang chỉ có ba loại, **không loại nào gửi dữ liệu bằng AJAX**:

| Ở đâu | Làm gì |
| --- | --- |
| `views/partials/header.ejs` | Tải Tailwind CDN và khai báo bảng màu thương hiệu (`tailwind.config`) để tạo CSS |
| `onerror` trên `<img>` (`views/dishes/*.ejs`) | Đổi sang ảnh mặc định khi ảnh món lỗi |
| `onchange="this.form.submit()"` trên ô "Sắp xếp theo" (cả `views/dishes/index.ejs` và `views/admin/dishes/index.ejs`) | Gửi form `GET` thường (document request, không phải `fetch`). Có nút "Áp dụng" trong `<noscript>` nên vẫn dùng được khi tắt JavaScript |

Kiểm tra bằng `curl` (thêm `-i` để xem status và header `Location`):

```bash
curl -i "http://localhost:3000/dishes/abc"
curl -i -X POST "http://localhost:3000/admin/dishes" -d "name=&price=-5"
curl -i -X POST "http://localhost:3000/admin/dishes" -d "name=Com tam&price=50000&category=Món chính&available=on"
```

## 15. Minh chứng

| File | Nội dung |
| --- | --- |
| `evidence/supabase-tables.png` | Table Editor của Supabase sau `db push` và seed |
| `evidence/network-create.png` | `POST /admin/dishes` → `303` → `GET /admin/dishes/:id` |
| `evidence/network-delete.png` | `POST ...?_method=DELETE` → `303` → `GET /admin/dishes` |
| `evidence/validation-400.png` | Form với khung lỗi đỏ và giá trị còn giữ |
| `evidence/demo.webm` | Video thao tác theo các bước ở mục 14 |

## 16. Đoạn code chính cần giải thích

**Đọc id và trả 404** (`src/utils/helpers.js`):

```js
function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}
```

**Đọc query an toàn và truy vấn qua model** (`src/routes/dishes.js`, rút gọn):

```js
const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
const sort = parseDishSort(req.query.sort);

const where = { name: { contains: q, mode: "insensitive" } };
if (category) where.category = category;

const total = await prisma.dish.count({ where });
const { page, totalPages, skip, take } = paginate(total, req.query.page, PAGE_SIZE);

const dishes = await prisma.dish.findMany({
  where,
  orderBy: DISH_SORTS[sort].orderBy,
  include: { chef: true },
  skip,
  take,
});
```

**Thêm bản ghi** (`src/routes/admin/dishes.js`):

```js
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const options = await loadFormOptions();
    const { values, errors, data, recipe } = validateDish(req.body, options);
    if (errors.length > 0) {
      return res.status(400).render("admin/dishes/new", {
        title: "Thêm món ăn",
        values,
        errors,
        categories: DISH_CATEGORIES,
        ...options,
      });
    }

    const created = await prisma.dish.create({
      data: { ...data, ingredients: { create: recipe } },
    });
    res.redirect(303, "/admin/dishes/" + created.id);
  })
);
```

**Sửa bản ghi** (`src/routes/admin/dishes.js`, rút gọn):

```js
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const dish = await prisma.dish.findUnique({ where: { id } });
    if (!dish) return notFound(res);

    const options = await loadFormOptions();
    const { values, errors, data, recipe } = validateDish(req.body, options);
    if (errors.length > 0) {
      return res.status(400).render("admin/dishes/edit", { title: "Sửa món ăn", dish, values, errors, /* ... */ });
    }

    try {
      await prisma.dish.update({
        where: { id },
        data: { ...data, ingredients: { deleteMany: {}, create: recipe } },
      });
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res);
      throw err;
    }
    res.redirect(303, "/admin/dishes/" + id);
  })
);
```

**Form xác nhận xóa** (`views/admin/dishes/delete.ejs`):

```html
<form method="POST" action="/admin/dishes/<%= dish.id %>?_method=DELETE">
  <button type="submit">Xác nhận xóa</button>
</form>
<a href="/admin/dishes">Hủy</a>
```

**Bắt lỗi toàn cục** (`src/app.js`):

```js
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render("errors/500");
});
```

Giải thích:

- `parseId` chặn id sai ngay đầu handler. Không có nó, `Number("abc")` là `NaN`, Prisma
báo lỗi kiểu dữ liệu và người dùng thấy `500` thay vì `404`.
- **Đọc query**: `typeof ... === "string"` loại trường hợp `?q=a&q=b` (mảng). `category` chỉ
nhận giá trị trong `DISH_CATEGORIES`, `sort` chỉ nhận khóa trong `DISH_SORTS`, nên người
dùng không thể đưa tên cột tùy ý vào `orderBy`. Mỗi kiểu sắp xếp có thêm `id` để thứ tự ổn
định khi phân trang (hai món cùng giá không đổi chỗ giữa các trang). Chi tiết phân trang ở
mục 10.
- `validateDish` trả bốn thứ: `values` để hiện lại form, `errors` để báo lỗi, `data` để
ghi bảng `dishes`, `recipe` để ghi bảng nối. `data` được tạo từng trường, nên trường lạ
trong `req.body` không lọt vào Prisma. `chefId` và từng nguyên liệu được đối chiếu với danh
sách đọc từ DB, nên không gán được id không tồn tại.
- **Handler** `POST` chỉ gọi `create` khi `errors` rỗng. Khi lỗi, nó render lại **cùng view**
`new` với `values` đã gõ và status `400`. `ingredients: { create: recipe }` tạo món và công
thức trong một lệnh.
- **Handler** `PATCH` kiểm tra theo thứ tự id hợp lệ → bản ghi tồn tại (`404`) → dữ liệu hợp
lệ (`400`), nên sửa một bản ghi không tồn tại luôn là `404`, kể cả khi dữ liệu cũng sai.
`deleteMany: {}` rồi `create: recipe` thay toàn bộ công thức cũ trong cùng một `update`.
`isNotFoundError` bắt lỗi Prisma `P2025` (bản ghi bị xóa giữa lúc kiểm tra và lúc ghi) để
trả `404` thay vì `500`.
- `res.redirect(303, ...)` áp dụng Post/Redirect/Get: F5 sau khi lưu không gửi lại form.
- **Form xóa** dùng `method="POST"` vì HTML không hỗ trợ `DELETE`; `?_method=DELETE` để
`method-override` đổi method. Link Hủy là `GET` vì không thay đổi dữ liệu.
- **Middleware lỗi** có 4 tham số nên Express nhận ra đây là error handler. `asyncHandler`
chuyển mọi Promise bị reject vào đây. Trang `500` không nhận `err`, nên không thể vô tình in
thông tin lỗi ra HTML.

## 17. Phạm vi làm thêm

Ngoài yêu cầu của slide, nhóm đã thêm:

- Quan hệ món – đầu bếp và món – nguyên liệu có định lượng (mục 6). Trang chi tiết đầu bếp
liệt kê món phụ trách; trang chi tiết nguyên liệu liệt kê các món dùng nó.
- Trang khách: lọc theo danh mục, sắp xếp, phân trang 9 món mỗi trang. Tất cả đều là query
param của `GET /dishes`, không đổi URL của trang chi tiết.
- Trang quản trị món ăn: ô "Sắp xếp theo" dùng chung danh sách kiểu sắp xếp với trang khách.
- Đặt bàn: form ở `/bookings/new` (giờ đến chọn bằng các nút khung giờ), trang xác nhận có
mã đặt bàn, và trang quản trị `/admin/bookings` để xác nhận hoặc hủy. Vẫn chỉ dùng form
HTML + `303`, không có AJAX.
- Ảnh món ăn và ảnh đầu bếp (URL Unsplash). Món không có ảnh hoặc ảnh lỗi dùng ảnh mặc định;
đầu bếp không có ảnh hiện chữ cái đầu của tên.

## 18. Tổng kết

Theo bốn ý tổng kết của buổi học:

- **Dữ liệu nằm trong database; mỗi request đọc lại nên HTML khớp với dữ liệu.** Không trang
nào nhận dữ liệu từ trang trước; mọi trang đọc lại từ PostgreSQL qua Prisma.
- **ORM thay SQL thô bằng model, vẫn chạy trên server cùng chuỗi kết nối.** `prisma` chỉ dùng
trong handler; `DATABASE_URL` chỉ ở `.env`.
- **Param cho biết bản ghi, query cho điều kiện hiển thị, body cho nội dung ghi.**
`/dishes/:id`, `/dishes?q=&category=&sort=&page=`, form `POST`.
- **GET để đọc; POST, PATCH, DELETE để ghi; redirect sau khi ghi.** Mọi thao tác ghi kết thúc
bằng `303`.

| Phần | Trạng thái |
| --- | --- |
| Express + EJS + Prisma (Code-first) + PostgreSQL Supabase | Đạt |
| `urlencoded`, `methodOverride` trước router; `404` và `500` cuối cùng | Đạt |
| 3 model + seed cho cả ba bảng (51 món, 5 đầu bếp, 45 nguyên liệu) | Đạt |
| Trang người dùng: danh sách, tìm kiếm giữ `q`, chi tiết, `404` | Đạt |
| Trang quản trị: 8 route CRUD × 3 đối tượng, trang xác nhận xóa riêng | Đạt |
| Validate ở server, không truyền thẳng `req.body`, kiểm tra `id` và `q` | Đạt |
| `400` giữ giá trị, `404` thân thiện, `500` không lộ lỗi | Đạt |
| Không `fetch`/AJAX, không GET ghi dữ liệu | Đạt |
| Tiêu chí nghiệm thu 01 đến 05 | Đạt hết |
| Minh chứng (`evidence/`) | Đạt. Đã có đủ 5 file (mục 15) |
