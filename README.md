# Lửa Hồng - Xác thực tài khoản trên SSR (Block 8)

Báo cáo bài tập Block 8 ("Xác thực tài khoản trên SSR") của nhóm. Ứng dụng tiếp tục
**Restaurant App SSR của Block 5**: một server Express dựng HTML bằng EJS, đọc ghi PostgreSQL
trên Supabase qua Prisma. Block 8 gắn thêm cụm xác thực:

- Đăng ký có **Google reCAPTCHA v2**, kích hoạt tài khoản bằng **OTP gửi qua email**.
- Đăng nhập bằng **session lưu trong PostgreSQL** và cookie `sid`, có chống brute force; đăng xuất.
- Quên mật khẩu bằng **reset token** gửi qua email.
- Khu vực quản trị `/admin/*` yêu cầu đăng nhập, và nhóm chọn thêm: **chỉ tài khoản `admin`** mới vào được.

Phần tìm kiếm 4 mode và 3 kiểu phân trang của Block 7 (vốn làm trên REST API + SPA) được mang
sang bản SSR này, để không mất chức năng đã có.

Câu hỏi xuyên suốt của buổi học: *Server chỉ nhận một request. Dựa vào đâu để biết request đó
của ai?* Câu trả lời của nhóm: request mang cookie `sid` (mã ngẫu nhiên 32 byte). Server băm mã
đó bằng SHA-256, tra bảng `sessions` để lấy `userId`, rồi đọc lại user (trạng thái, role) từ
database. Không có bản ghi hợp lệ thì coi như chưa đăng nhập. Cookie không chứa email, userId
hay role.

Slide thuyết trình: [`BLOCK8-slides.html`](BLOCK8-slides.html) (mở bằng trình duyệt; phím ← →
chuyển slide, `N` hiện ghi chú, `F` toàn màn hình).

## 1. Thông tin nhóm

| STT | Họ và tên | MSSV |
| --- | --- | --- |
| 1 | Nguyễn Tấn Hiệu | 24127373 |
| 2 | La Anh Hào | 24127361 |
| 3 | Trần Nguyễn Tuấn Minh | 24127084 |
| 4 | Nguyễn Anh Khôi | 24127430 |

## 2. Phạm vi bài làm

### 2.1. Yêu cầu Block 8 và nơi đáp ứng

| Yêu cầu (slide "Mô tả bài tập") | Trong project |
| --- | --- |
| Đăng ký có xác minh email: OTP kích hoạt qua email và CAPTCHA | `src/routes/auth.js` (`/register`, `/activate`, `/activate/resend`), `src/auth/service.js`, `src/auth/captcha.js` |
| Đăng nhập bằng session và cookie, chống brute force, session lưu bền vững, đăng xuất | `src/auth/session.js`, `src/auth/throttle.js`, bảng `sessions` và `auth_throttles` |
| Quên mật khẩu qua email bằng reset token | `/forgot`, `/reset` trong `src/routes/auth.js`, bảng `password_resets` |
| Cụm CRUD của Block 5 yêu cầu đăng nhập | `app.use("/admin", requireLogin, requireRole("admin"))` trong `src/app.js` |

### 2.2. Chọn branch: tiếp tục từ Block 5

Branch `Block-8` được tách từ `Block-5`, không từ Block 6 hay 7. Lý do: deck yêu cầu tiếp tục
**app SSR** của Block 5 (form `POST`, redirect `303`, `Set-Cookie`, trang `429`), còn Block 6–7
đã bỏ view SSR để chuyển sang REST API + React SPA. Phần dùng lại từ Block 7:

| Từ Block 7 | Trong Block 8 |
| --- | --- |
| Tìm kiếm 4 mode, escape `%` và `_` | `src/db/dish-search.js`, `parseDishSearch` trong `src/utils/validators.js`, `escapeLike` trong `src/utils/helpers.js` |
| Migration `pg_trgm` + `unaccent` + index | `prisma/search.sql` (`npm run db:search`) |
| Seed 1.500 món, 103 nguyên liệu | `prisma/catalog.js`, `prisma/seed.js` |
| 3 kiểu phân trang ở thực đơn | `src/routes/dishes.js`, `views/dishes/index.ejs`, `public/js/load-more.js` |
| `LOG_SQL=1` in câu SQL | `src/db/prisma.js` |
| Id vượt giới hạn INT4 trả 404 | `parseId` trong `src/utils/helpers.js` |

### 2.3. Lựa chọn thêm của nhóm: chỉ admin vào quản trị

Deck để phân quyền theo role cho Block 9 ("ở Block 8 mọi tài khoản active đều dùng được cụm
CRUD"). Nhóm chọn chặn sớm, để tài khoản tự đăng ký (role `viewer`) không sửa được thực đơn:

| Người gọi `/admin/*` | Kết quả |
| --- | --- |
| Chưa đăng nhập | `303` tới `/login?next=...` |
| Đã đăng nhập, role khác `admin` | `403`, mã `FORBIDDEN`, dữ liệu không đổi |
| Role `admin` | Vào được, CRUD như Block 5 |

`requireRole` tách khỏi `requireLogin`, nên Block 9 chỉ cần thêm role (ví dụ `editor`) mà không
sửa phần đăng nhập. Tài khoản admin do script seed tạo (mục 5.3). Khi chụp bằng chứng cho dòng
nghiệm thu "đăng nhập đúng, tài khoản active vào được CRUD", nhóm dùng tài khoản admin.

## 3. Công nghệ sử dụng

| Thành phần | Dùng | Ghi chú |
| --- | --- | --- |
| Server | Node.js 20 trở lên, Express 4, EJS 3 | SSR, `method-override` cho PATCH/DELETE |
| Database | PostgreSQL (Supabase), Prisma 6 | |
| Băm password | Argon2id qua `@node-rs/argon2` | m = 19 MiB, t = 2, p = 1 (mức tối thiểu OWASP khuyến nghị) |
| Session | Middleware tự viết + bảng `sessions` | Không dùng `express-session` hay Passport, để chỉ ra được nơi đọc cookie, tra session, chặn request |
| CAPTCHA | Google reCAPTCHA v2 (checkbox) | Xác minh ở backend qua `siteverify` |
| Email | `nodemailer` và `resend` | Chọn bằng `MAIL_TRANSPORT` (mục 5.4) |
| Kiểm tra định dạng email | `validator` | Không tự viết regex |
| Cookie | `cookie-parser` | |
| Giao diện | Tailwind CSS (CDN) | |

## 4. Cấu trúc repository

```
.
├── BLOCK8-slides.html          Slide thuyết trình Block 8
├── prisma/
│   ├── schema.prisma           Model cũ + 5 bảng xác thực mới
│   ├── search.sql              Extension pg_trgm, unaccent và index tìm kiếm (Block 7)
│   ├── catalog.js              Dữ liệu mẫu 1.500 món (Block 7)
│   ├── seed.js                 Ghi catalog vào DB (xóa thực đơn và đặt bàn cũ), rồi gọi seed-user
│   └── seed-user.js            Tạo/cập nhật tài khoản admin đã kích hoạt từ SEED_USER_*
├── public/js/load-more.js      "Tải thêm" và "Cuộn vô hạn" (chỉ đọc bằng GET)
├── scripts/acceptance.mjs      Nghiệm thu tự động bằng request trực tiếp (126 kiểm tra)
├── src/
│   ├── server.js               Kiểm tra cấu hình, khởi động server, dọn bản ghi hết hạn
│   ├── app.js                  Thứ tự middleware và mount router
│   ├── auth/
│   │   ├── config.js           Mọi con số chính sách (POLICY), cookie, reCAPTCHA, APP_URL
│   │   ├── crypto.js           Argon2id, sinh token/OTP, SHA-256, HMAC, so sánh hằng thời gian
│   │   ├── accounts.js         Chuẩn hóa email, validate form tài khoản, safeNext
│   │   ├── session.js          anonSession, loadSession, createSession, destroySession, requireLogin, requireRole
│   │   ├── csrf.js             CSRF token + kiểm tra Origin
│   │   ├── captcha.js          Gọi siteverify của reCAPTCHA
│   │   ├── throttle.js         Bộ đếm rate limit / đăng nhập sai trong DB
│   │   ├── service.js          Nghiệp vụ: đăng ký, OTP, đăng nhập, quên/đặt lại mật khẩu
│   │   ├── mailer.js           Gửi email (file / resend / ethereal / smtp) + lệnh gửi thử
│   │   ├── mail-templates.js   Nội dung email OTP, reset, báo đổi mật khẩu
│   │   └── cleanup.js          Xóa session và bộ đếm hết hạn
│   ├── db/
│   │   ├── prisma.js           PrismaClient dùng chung (LOG_SQL=1 in SQL)
│   │   ├── dish-search.js      4 mode tìm kiếm (Block 7)
│   │   └── dish-list.js        Tìm + sắp xếp + phân trang dùng chung cho thực đơn và quản trị
│   ├── routes/
│   │   ├── auth.js             /register /activate /login /logout /forgot /reset
│   │   ├── dishes.js           /dishes, /dishes/items, /dishes/:id
│   │   ├── bookings.js, about.js
│   │   └── admin/              dishes, chefs, ingredients, bookings (CRUD của Block 5)
│   └── utils/
│       ├── helpers.js          asyncHandler, parseId, paginate, escapeLike, định dạng
│       ├── validators.js       Validate form CRUD, parseDishSearch
│       └── dish-query.js       Tiêu chí tìm kiếm -> query string trên URL
├── test/                       Unit test (node --test)
└── views/
    ├── auth/                   register, activate, login, pending, forgot, reset
    ├── errors/                 403, 404, 429, 500
    ├── partials/               header, footer, csrf, captcha, auth-alert, search-form, ...
    ├── dishes/, bookings/, admin/
    └── about.ejs
```

Thư mục `mail-outbox/` (thư ghi ra file khi `MAIL_TRANSPORT=file`) và `.env` không được commit.

## 5. Cài đặt và chạy

### 5.1. Chuẩn bị

```bash
npm install
cp .env.example .env
```

`npm install` chạy `prisma generate` ở bước `postinstall`. Với npm 11, nếu thấy cảnh báo
`install-scripts` và Prisma Client chưa được tạo, chạy thêm `npx prisma generate`.

### 5.2. Biến môi trường (`.env`)

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | Có | Chuỗi kết nối Supabase (pooler 6543 cho app, 5432 cho `db push`) |
| `SESSION_SECRET` | Có | Ít nhất 32 ký tự ngẫu nhiên; khóa cho CSRF token và hash OTP. Tạo: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `APP_URL` | Nên có | Địa chỉ gốc để dựng link trong email (không lấy từ header `Host`). Mặc định `http://localhost:PORT` |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | Có | Key reCAPTCHA v2 checkbox, tạo tại https://www.google.com/recaptcha/admin/create, thêm domain `localhost` |
| `RECAPTCHA_HOSTNAMES` | Không | Hostname chấp nhận trong kết quả `siteverify`; mặc định lấy từ `APP_URL` |
| `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` | Để seed | Tài khoản admin đã kích hoạt |
| `MAIL_TRANSPORT` | Không | `file` (mặc định), `resend`, `ethereal`, `smtp` |
| `RESEND_API_KEY` | Khi dùng Resend | Dạng `re_...`, chỉ nằm ở backend |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Khi dùng SMTP | |
| `MAIL_FROM` | Không | Bỏ trống để dùng mặc định của từng transport |
| `COOKIE_SECURE` | Không | Cookie có cờ `Secure` theo mặc định; đặt `0` chỉ khi thử bằng công cụ không gửi cookie `Secure` qua http |
| `TRUST_PROXY` | Không | Đặt `1` khi chạy sau reverse proxy để lấy IP thật cho rate limit |
| `LOG_SQL` | Không | `1` để in câu SQL |

Server **dừng ngay khi khởi động** nếu thiếu `SESSION_SECRET`, thiếu key reCAPTCHA, hoặc chọn
`resend`/`smtp` mà thiếu cấu hình tương ứng.

Chỉ để chạy thử trên máy, Google có cặp test key luôn cho qua (ghi trong `.env.example`, kèm
`RECAPTCHA_HOSTNAMES=localhost,testkey.google.com`). Test key **không** dùng làm bằng chứng chặn
bot; ảnh nộp phải chụp với key thật.

### 5.3. Database

```bash
npm run db:push        # tạo/cập nhật bảng theo prisma/schema.prisma
npm run db:search      # bật pg_trgm, unaccent và tạo index tìm kiếm; chạy lại sau mỗi lần db:push
npm run db:seed        # XÓA thực đơn và đặt bàn cũ, nạp 1.500 món, rồi tạo tài khoản admin
npm run db:seed-user   # chỉ tạo/cập nhật tài khoản admin, không đụng thực đơn
```

Nếu database đã có thực đơn 1.500 món từ Block 7, chỉ cần `db:push`, `db:search` và
`db:seed-user`. `db:seed` không xóa bảng `users`.

### 5.4. Gửi email

| `MAIL_TRANSPORT` | Cần gì | Thư đi đâu |
| --- | --- | --- |
| `file` (mặc định) | Không cần gì | Thư mục `mail-outbox/`, mỗi thư một file `.eml` và `.html`; mở file `.html` để lấy OTP hoặc link |
| `resend` | Tài khoản Resend + `RESEND_API_KEY` | Hộp thư thật |
| `ethereal` | Internet | Hộp thư thử nghiệm ethereal.email; user/pass đăng nhập in ra một lần trong log |
| `smtp` | Máy chủ SMTP (Mailpit, Gmail App Password, ...) | Theo máy chủ SMTP |

**Giới hạn của Resend khi chưa xác minh domain:** người gửi phải là `onboarding@resend.dev` (mặc
định khi để trống `MAIL_FROM`) và **chỉ gửi được tới email của chủ tài khoản Resend**. Gửi tới
email khác, Resend trả `validation_error`: tài khoản vẫn được tạo ở trạng thái pending, lỗi
được ghi vào log server, người dùng không nhận được mã. Muốn gửi cho mọi địa chỉ cần xác minh
domain tại resend.com/domains, hoặc dùng `smtp` với Gmail App Password.

Kiểm tra cấu hình email mà không cần đăng ký tài khoản:

```bash
npm run mail:test -- you@example.com
```

### 5.5. Chạy

```bash
npm run dev            # node --watch, http://localhost:3000
npm start              # không watch
```

Server không tự đọc lại `.env`; sửa `.env` thì phải khởi động lại.

### 5.6. Script

| Lệnh | Việc |
| --- | --- |
| `npm run dev` / `npm start` | Chạy server |
| `npm test` | Unit test (`test/*.test.js`) |
| `npm run acceptance` | Nghiệm thu tự động (mục 16.2) |
| `npm run db:push`, `db:search`, `db:seed`, `db:seed-user` | Database (mục 5.3) |
| `npm run db:cleanup` | Xóa session và bộ đếm đã hết hạn (server cũng tự chạy mỗi 30 phút) |
| `npm run mail:test -- <email>` | Gửi thư thử theo `MAIL_TRANSPORT` |

## 6. Thiết kế database

Các model của Block 5 (`Dish`, `Chef`, `Ingredient`, `DishIngredient`, `Booking`) giữ nguyên.
Block 8 thêm 5 bảng; mọi bí mật chỉ lưu dạng hash:

| Bảng | Trường chính | Ghi chú |
| --- | --- | --- |
| `users` | `email` (chuẩn hóa, unique), `emailInput`, `passwordHash`, `role` (mặc định `viewer`), `status` (`pending`/`active`), `emailVerifiedAt` | `passwordHash` là chuỗi PHC Argon2id, chứa thuật toán, tham số, salt |
| `activation_challenges` | `userId` (unique), `purpose` (`activation`), `otpHash`, `expiresAt`, `attempts`, `lockedUntil`, `lastSentAt`, `usedAt` | Một dòng mỗi tài khoản pending; gửi lại mã thì ghi đè `otpHash` |
| `password_resets` | `userId`, `tokenHash` (unique), `expiresAt`, `usedAt` | Token gốc chỉ nằm trong email |
| `sessions` | `sidHash` (khóa chính), `userId`, `expiresAt`, `absoluteExpiresAt` | Lưu SHA-256 của `sid`: đọc được bảng vẫn không dựng lại được cookie |
| `auth_throttles` | `key`, `count`, `windowStart`, `lockedUntil` | Bộ đếm theo email chuẩn hóa và theo IP, ví dụ `login-fail:email:...`, `login:ip:...` |

Cách băm từng loại:

| Giá trị | Băm bằng | Lý do |
| --- | --- | --- |
| Password | Argon2id, salt ngẫu nhiên mỗi lần | Do người chọn, cần hàm băm chậm dành cho password |
| OTP | `HMAC-SHA256(SESSION_SECRET, "otp:" + userId + ":" + otp)` | Chỉ có 10^6 giá trị; có khóa bí mật thì đọc được DB vẫn chưa dò được mã |
| Reset token, `sid` | SHA-256 | Đủ dài và ngẫu nhiên (32 byte) |

Không có bảng thử thách CAPTCHA: dùng reCAPTCHA thì Google giữ trạng thái thử thách.

Chuẩn hóa email (áp dụng giống nhau ở đăng ký, kích hoạt, đăng nhập, quên mật khẩu): cắt khoảng
trắng hai đầu và đổi toàn bộ thành chữ thường. Không bỏ dấu chấm hay phần `+tag` theo kiểu
riêng của nhà cung cấp. Bản người dùng gõ được giữ ở `emailInput` để hiển thị.

## 7. Chính sách công bố

Mọi con số nằm ở `POLICY` trong `src/auth/config.js`.

| Hạng mục | Giá trị |
| --- | --- |
| Password | 8–128 ký tự |
| OTP | 6 chữ số, hạn 10 phút, dùng một lần |
| Nhập sai OTP | Tối đa 5 lần, sau đó khóa kích hoạt 15 phút (429). Gửi lại mã **không** đặt lại số lần sai |
| Gửi lại OTP | Cách nhau tối thiểu 60 giây, tối đa 5 lần mỗi giờ cho mỗi email |
| Đăng nhập sai | Đếm theo email chuẩn hóa trong cửa sổ 15 phút. Từ lần sai thứ 3: bắt buộc CAPTCHA trước khi kiểm tra password. Lần sai thứ 10: khóa 5 phút (429), kể cả khi CAPTCHA và password đúng |
| Rate limit theo IP | Đăng nhập 50 lần / 15 phút; đăng ký 10 lần / giờ; kích hoạt 30 lần / 15 phút; gửi lại OTP 20 lần / giờ; quên mật khẩu 10 lần / giờ; trang reset 30 lần / 15 phút |
| Quên mật khẩu theo email | 3 lần / giờ, áp dụng cả cho email không có tài khoản |
| Reset token | 32 byte ngẫu nhiên, hạn 15 phút, dùng một lần; yêu cầu mới làm token cũ hết hiệu lực |
| Session | Hạn không hoạt động 2 giờ (gia hạn tối đa 5 phút một lần), hạn tối đa 12 giờ kể từ khi đăng nhập |
| Dọn bản ghi | Mỗi 30 phút: session hết hạn, bộ đếm cũ hơn 1 ngày và không còn khóa |

Chỉ đăng nhập thành công (password đúng, tài khoản active, session đã tạo) mới xóa bộ đếm sai
theo email. Giải đúng CAPTCHA hay nhập đúng password cho tài khoản pending không xóa bộ đếm.
Giới hạn theo IP không bị xóa.

## 8. Thứ tự middleware (`src/app.js`)

```js
app.use(express.static(...));                           // public/js
app.use(express.urlencoded({ extended: false }));        // đọc form
app.use(methodOverride("_method"));                      // POST ?_method=PATCH|DELETE
app.use(cookieParser());
app.use(anonSession);                                    // cookie aid cho CSRF trước khi đăng nhập
app.use(loadSession);                                    // (1) đọc cookie sid (2) tra bảng sessions -> req.user
app.use((req, res, next) => { res.locals.csrfToken = csrfToken(req); next(); });
app.use("/admin", requireLogin, requireRole("admin"));   // (3) chưa đăng nhập -> 303; không phải admin -> 403
app.use(csrfProtection);                                 // POST/PATCH/DELETE phải có token đúng
app.use("/", authRouter);                                // các trang xác thực
app.use("/dishes", dishesRouter);                        // ... các router còn lại
```

Ba chỗ deck yêu cầu tìm trong mã:

1. **Đọc cookie:** `loadSession` (`src/auth/session.js`) chỉ nhận `sid` đúng định dạng (43 ký tự
   base64url). Cookie lạ hoặc session không hợp lệ bị bỏ qua và bị xóa khỏi browser.
2. **Tra session:** tìm theo `sha256(sid)`, kiểm tra `expiresAt`, `absoluteExpiresAt` và user còn
   `active`. Hợp lệ thì gắn `req.user = { id, email, role }`; role được đọc lại từ DB ở mỗi
   request nên đổi role có hiệu lực ngay.
3. **Chặn request:** `requireLogin` và `requireRole` chạy ở middleware, trước handler. Gọi thẳng
   bằng công cụ HTTP (kể cả `POST`/`DELETE`) cũng bị chặn, không chỉ ẩn nút trên giao diện.
   Chúng chạy trước `csrfProtection`, nên request không có cookie nhận đúng `303` chứ không phải `403`.

Handler không tự đọc cookie, chỉ đọc `req.user`.

## 9. Danh sách route

### 9.1. Trang công khai

| Method | Đường dẫn | Ghi chú |
| --- | --- | --- |
| GET | `/` | `303` tới `/dishes` |
| GET | `/dishes` | Thực đơn: tìm kiếm 4 mode, lọc danh mục, sắp xếp, 3 kiểu phân trang (`?view=pages|more|scroll`) |
| GET | `/dishes/items?page=n` | Một trang thẻ món (HTML) cho Tải thêm / Cuộn vô hạn; header `X-Total`, `X-Page`, `X-Total-Pages` |
| GET | `/dishes/:id` | Chi tiết món |
| GET | `/about` | Giới thiệu |
| GET/POST | `/bookings/new`, `/bookings` | Đặt bàn (không cần tài khoản, như Block 5) |
| GET | `/bookings/:code` | Xem lại yêu cầu đặt bàn theo mã ngẫu nhiên |

### 9.2. Trang xác thực (`src/routes/auth.js`)

| Method | Đường dẫn | Việc |
| --- | --- | --- |
| GET | `/register` | Form đăng ký + reCAPTCHA (đã đăng nhập thì chuyển về trang mặc định) |
| POST | `/register` | Rate limit IP → reCAPTCHA → validate → tạo tài khoản pending → `303 /activate` |
| GET | `/activate` | Form nhập email + OTP, nút gửi lại mã |
| POST | `/activate` | Xác nhận OTP → `303 /login?activated=1` (không tự đăng nhập) |
| POST | `/activate/resend` | Gửi lại OTP → `303 /activate?sent=1` |
| GET | `/login` | Form đăng nhập; hiện CAPTCHA nếu bộ đếm sai của email (trong `?email=`) đã tới ngưỡng |
| POST | `/login` | Đăng nhập → `303` tới `?next=` hoặc trang mặc định theo role |
| POST | `/logout` | Hủy session ở server, xóa cookie → `303 /login?loggedOut=1` (không có `GET /logout`) |
| GET | `/forgot` | Form quên mật khẩu |
| POST | `/forgot` | Gửi link đặt lại (nếu email có tài khoản); trả cùng một trang |
| GET | `/reset?token=` | Chỉ hiện form, không tiêu thụ token |
| POST | `/reset` | Đổi password, tiêu thụ token, hủy mọi session → `303 /login?reset=1` |

Sau khi đăng nhập: admin vào `/admin/dishes`, role khác về `/dishes`. `?next=` chỉ nhận đường dẫn
nội bộ (`safeNext` chặn `//evil.com`, `/\evil.com`, URL tuyệt đối); `next` trỏ vào `/admin` mà
tài khoản không phải admin thì về trang mặc định.

### 9.3. Khu vực quản trị (cần role `admin`)

CRUD của Block 5 giữ nguyên cho món ăn (`/admin/dishes`), đầu bếp (`/admin/chefs`), nguyên liệu
(`/admin/ingredients`) và đặt bàn (`/admin/bookings`). `/admin/dishes` có thêm tìm kiếm 4 mode,
phân trang số trang 10 dòng mỗi trang. Header và footer ẩn link "Quản trị" với tài khoản không
phải admin.

### 9.4. Mã trạng thái và mã lỗi

Lỗi nhập giữ status `200` và có mã lỗi như hợp đồng Block 6; mã lỗi hiển thị trên trang và nằm
trong thuộc tính `data-error-code` để đọc khi kiểm tra.

| Mã | Status | Khi nào |
| --- | --- | --- |
| `VALIDATION_FAILED` | 200 | Form tài khoản sai định dạng; tiêu chí tìm kiếm sai (`?minPrice=abc`) |
| `INVALID_CAPTCHA` | 200 | Đăng ký thiếu hoặc sai CAPTCHA |
| `CAPTCHA_REQUIRED` | 200 | Đăng nhập khi bộ đếm đã tới ngưỡng mà thiếu/sai CAPTCHA |
| `CAPTCHA_UNAVAILABLE` | 503 | Không gọi được `siteverify` hoặc secret key sai: không cho qua |
| `INVALID_OTP` | 200 | OTP sai, hết hạn, đã dùng, hoặc email không có tài khoản pending |
| `INVALID_CREDENTIALS` | 200 | Sai email hoặc sai password (cùng một thông báo) |
| `ACCOUNT_PENDING` | 200 | Password đúng nhưng tài khoản chưa kích hoạt; không tạo session |
| `INVALID_TOKEN` | 200 | Reset token sai, hết hạn, đã dùng hoặc đã bị thay |
| `RATE_LIMITED` | 429 | Vượt giới hạn; có header `Retry-After` |
| `CSRF_FAILED` | 403 | Thiếu/sai CSRF token hoặc `Origin` lạ |
| `FORBIDDEN` | 403 | Đã đăng nhập nhưng không phải admin |

CRUD của Block 5 giữ quy ước cũ: input sai `400`, id sai hoặc không có `404`, thành công `303`.

## 10. Đăng ký và kích hoạt

### 10.1. `POST /register`

1. Rate limit theo IP (10 lần/giờ).
2. **reCAPTCHA ở server**, trước khi băm password, tạo user hay gửi OTP: backend gửi token
   `g-recaptcha-response` và secret key tới `siteverify`, chỉ cho qua khi `success = true` và
   `hostname` thuộc danh sách cho phép. Không tin trường nào do browser tự gửi (ví dụ
   `captchaPassed=true`). Không gọi được Google thì trả `503 CAPTCHA_UNAVAILABLE`, không tạo user.
3. Validate email (thư viện `validator`), password 8–128 ký tự, nhập lại khớp.
4. Băm password **trước** khi tra email, để ba nhánh dưới đây tốn thời gian như nhau.
5. Email mới: tạo user `pending`, role `viewer` do server gán (trường `role` trong body không
   được đọc), sinh OTP và gửi email. Email đã có tài khoản pending: **không ghi đè password**,
   coi như yêu cầu gửi lại mã (vẫn theo thời gian chờ). Email đã có tài khoản active: không làm gì.
6. Cả ba nhánh cùng trả `303 /activate?registered=1&email=...` với một thông báo chung.

Email được gửi bất đồng bộ (`queueMail`), nên request không chờ gửi xong. Gửi thất bại thì tài
khoản vẫn pending, người dùng dùng nút gửi lại mã.

### 10.2. `POST /activate`

Mã chỉ được chấp nhận khi đúng cả sáu điều kiện: tài khoản đang `pending`, `purpose` là
`activation`, chưa hết hạn, chưa dùng, còn lượt thử, hash khớp. Thứ tự trong
`activate()` (`src/auth/service.js`):

1. Kiểm tra khóa (`lockedUntil`) trước khi so hash.
2. Mã khớp: trong một transaction, `UPDATE` có điều kiện (`usedAt IS NULL`, `expiresAt > now`,
   `attempts < 5`, đúng `otpHash`) để đánh dấu `usedAt`, rồi đổi user sang `active` và ghi
   `emailVerifiedAt`. Hai request cùng gửi một mã đúng thì chỉ một request thắng; request còn
   lại nhận `INVALID_OTP`.
3. Sai vì bất kỳ lý do nào: cùng thông báo `INVALID_OTP`, `attempts` tăng; đủ 5 lần thì khóa
   15 phút.
4. Email không có tài khoản pending vẫn được đếm sai theo email: 5 lần `INVALID_OTP` rồi `429`,
   giống tài khoản thật, nên không dò được email nào đang chờ kích hoạt.

Kích hoạt xong không tự đăng nhập; người dùng đăng nhập ở bước riêng. OTP chỉ xuất hiện trong
email, không có trong response hay log.

### 10.3. `POST /activate/resend`

Thời gian chờ 60 giây và tối đa 5 lần mỗi giờ, tính theo chuỗi email nên email không tồn tại cũng
bị giới hạn y hệt. Mã mới ghi đè `otpHash` (mã cũ hết hiệu lực), `attempts` và `lockedUntil` giữ
nguyên. Phản hồi giống nhau dù email có tài khoản pending hay không.

## 11. Đăng nhập và chống brute force

Thứ tự trong `POST /login`:

1. Rate limit theo IP (50 lần / 15 phút).
2. Email đang bị khóa (đủ 10 lần sai) → trang `429`, không xét CAPTCHA hay password.
3. Bộ đếm sai của email ≥ 3 → **bắt buộc reCAPTCHA**. Thiếu hoặc sai thì dừng trước bước kiểm tra
   password, hiện lại form với CAPTCHA, giữ email, bỏ password.
4. Kiểm tra password bằng Argon2. Email không tồn tại vẫn verify với một hash giả để thời gian
   phản hồi như nhau.
5. Sai → tăng bộ đếm theo email; lần sai thứ 10 trả `429` và khóa 5 phút. Thông báo chung
   `Email hoặc mật khẩu không đúng.`
6. Đúng nhưng tài khoản `pending` → trang báo cần kích hoạt, **không tạo session**.
7. Đúng và `active` → xóa bộ đếm sai theo email, tạo session mới, `303`.

Bộ đếm nằm ở bảng `auth_throttles`, không ở cookie hay localStorage: xóa cookie, mở tab ẩn danh,
bỏ trường CAPTCHA hay gửi thẳng `POST /login` đều không đặt lại được. Tăng bộ đếm dùng `upsert`
với `count = count + 1` nên hai request đồng thời không ghi đè nhau. Email chưa đăng ký cũng phải
qua CAPTCHA sau 3 lần sai, để việc đòi CAPTCHA không xác nhận email tồn tại. Backend quyết định có
hiện CAPTCHA; browser chỉ vẽ theo phản hồi.

## 12. Session, cookie và đăng xuất

```
POST /login HTTP/1.1
Content-Type: application/x-www-form-urlencoded

_csrf=...&email=...&password=...

HTTP/1.1 303 See Other
Location: /admin/dishes
Set-Cookie: sid=<43 ký tự>; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Lax
```

| Sự kiện | Server | Browser |
| --- | --- | --- |
| Đăng nhập | Xóa session cũ mà request đang mang (nếu có), tạo `sid` mới | Nhận `Set-Cookie` |
| Request tiếp theo | Tra `sha256(sid)`, gia hạn `expiresAt` | Gửi `Cookie` tự động |
| Hết hạn | Coi bản ghi vô hiệu, xóa | Cookie có thể còn nhưng không còn khớp |
| Đăng xuất | Xóa bản ghi **trước** | Nhận cookie hết hạn |

- **Cookie `sid`:** `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` 12 giờ. Giá trị là
  mã ngẫu nhiên, không chứa userId, role hay password.
- **Cookie `aid`:** phiên ẩn danh để gắn CSRF token cho các form trước khi đăng nhập; không
  chứa danh tính và không có bản ghi trong DB.
- **Đổi `sid` mỗi lần đăng nhập** (chống session fixation): `sid` do kẻ tấn công đặt sẵn không
  trở thành phiên đăng nhập.
- **Lưu bền vững:** session nằm ở bảng `sessions` trên PostgreSQL, không nằm trong bộ nhớ của
  tiến trình; khởi động lại server, cookie cũ vẫn đăng nhập.
- **Đăng xuất là `POST`** có CSRF token. Xóa cookie thôi không hủy được session: bản sao `sid` vẫn
  dùng được cho tới khi bản ghi ở server bị xóa.

## 13. Chống CSRF

Ba lớp (`src/auth/csrf.js`):

1. `SameSite=Lax` trên cookie: browser không gửi cookie trong `POST` từ site khác.
2. CSRF token trong mọi form `POST` (`views/partials/csrf.ejs`):
   `HMAC(SESSION_SECRET, "csrf:" + sha256(sid hoặc aid))`. Trang lạ không đọc được giá trị này.
3. Header `Origin`, nếu có, phải là origin của ứng dụng.

Thiếu hoặc sai token, hoặc `Origin` lạ → `403 CSRF_FAILED`, dữ liệu không đổi. Riêng `/reset`
gửi `Referrer-Policy: no-referrer`, nên browser gửi form của chính trang đó với `Origin: null`
(chuẩn Fetch). Ở route này `null` được coi là "không có thông tin"; CSRF token vẫn bắt buộc. Các
route khác gửi `Origin: null` vẫn bị chặn (lỗi đã sửa, mục 19.2).

GET không bao giờ đổi dữ liệu, vì `SameSite=Lax` vẫn gửi cookie khi điều hướng GET cấp cao nhất.

## 14. Quên mật khẩu

1. `POST /forgot`: giới hạn 3 lần/giờ mỗi email và 10 lần/giờ mỗi IP. Email có tài khoản: vô hiệu
   các token chưa dùng, tạo token 32 byte, lưu SHA-256, gửi link
   `APP_URL/reset?token=...`. Không có tài khoản: không làm gì. Hai trường hợp **cùng status
   200 và cùng HTML**: "Nếu email đã đăng ký, hướng dẫn đặt lại mật khẩu đã được gửi."
2. `GET /reset?token=`: chỉ hiện form (hoặc báo link không dùng được), **không tiêu thụ token**,
   vì phần mềm quét email có thể mở link trước người dùng. Có `Referrer-Policy: no-referrer`.
3. `POST /reset`: validate password trước (gõ sai không làm mất token), rồi trong một transaction:
   `UPDATE` có điều kiện (`usedAt IS NULL`, `expiresAt > now`) để tiêu thụ token, đổi
   `passwordHash`, vô hiệu các token còn lại, xóa mọi session của user. Gửi email báo đã đổi
   mật khẩu. `303 /login?reset=1`, không tự đăng nhập.

Token sai, hết hạn, đã dùng hoặc đã bị thay: cùng thông báo `INVALID_TOKEN`, password không đổi.
Reset token chỉ được `/reset` chấp nhận: dùng làm cookie `sid` hay làm OTP đều bị từ chối. Reset
password không kích hoạt tài khoản đang pending.

## 15. Tìm kiếm và phân trang (Block 7 trên SSR)

| Mode | Cách tìm |
| --- | --- |
| Cơ bản | Tên chứa từ khóa, không phân biệt hoa thường; `%`, `_` được escape |
| Nâng cao | Như Cơ bản + khoảng giá, tình trạng, nguyên liệu (kết hợp AND) |
| Toàn văn | PostgreSQL full-text (`simple`), xếp theo `ts_rank` |
| Gần đúng | `word_similarity(unaccent(q), unaccent(name)) >= 0.3`; gõ "bun" ra "bún" |

Thực đơn `/dishes` có 3 kiểu phân trang, 9 món mỗi lần:

- **Số trang** (`?view=pages`): server dựng HTML trang `?page=n`; mở lại link đúng trang.
- **Tải thêm** (`?view=more`) và **Cuộn vô hạn** (`?view=scroll`): server dựng trang 1;
  `public/js/load-more.js` đọc `GET /dishes/items?page=n` (HTML thẻ món) rồi nối vào lưới, bỏ món
  trùng id. Cuộn vô hạn dùng `IntersectionObserver` với `rootMargin` 200px. Không có JavaScript
  thì nút Tải thêm là link sang trang 2. Tải lại trang thì bắt đầu lại từ trang 1.

Tiêu chí sai (ví dụ `?mode=advanced&minPrice=abc`) hiện khung báo lỗi `VALIDATION_FAILED`. Script
phía client chỉ đọc dữ liệu bằng `GET`; mọi thao tác ghi vẫn là form HTML như Block 5.

## 16. Kiểm thử

### 16.1. Unit test

```bash
npm test
```

11 test, không cần database: chuẩn hóa email, validate form tài khoản, `safeNext`, `escapeLike`,
`parseId`, `parseDishSearch`, dựng query string tìm kiếm.

### 16.2. Nghiệm thu tự động (`scripts/acceptance.mjs`)

```bash
npm run acceptance
```

Script tự chạy server ở cổng `ACCEPT_PORT` (mặc định 3999) để kiểm tra được cả bước **dừng tiến
trình rồi chạy lại**. Script gửi request trực tiếp như một browser (giữ cookie, lấy CSRF token từ
form), đọc database để đối chiếu hash, `usedAt`, `attempts`, session, bộ đếm, và đọc OTP / reset
token từ `mail-outbox/` (script ép `MAIL_TRANSPORT=file` cho server nó chạy).

reCAPTCHA thật không giải tự động được, nên script chạy một `siteverify` **giả lập** ở cổng
`ACCEPT_PORT + 1` và trỏ `RECAPTCHA_VERIFY_URL` tới đó. Bản giả lập kiểm tra secret, cho mỗi token
xác minh một lần (`timeout-or-duplicate`), trả hostname nơi token được giải, và giả lập được Google
bị lỗi. Đây chỉ là kiểm thử hồi quy cho logic backend; nhóm đã chạy thêm end-to-end với
`siteverify` thật của Google (bằng test key), và bằng chứng nộp dùng key thật.

Kết quả lần chạy gần nhất (trên PostgreSQL local): **126 PASS, 0 FAIL**.

| Nhóm | Số kiểm tra | Ví dụ |
| --- | --- | --- |
| Đăng ký và kích hoạt | 32 | Thiếu/sai CAPTCHA không tạo user, không gửi OTP; gửi `role=admin` vẫn là `viewer`; hai request kích hoạt đồng thời chỉ một thắng; gửi lại mã không đặt lại `attempts`; OTP không dùng được làm password |
| CAPTCHA và brute force | 16 | Token dùng lại / sai hostname bị từ chối; Google lỗi → 503, không tạo user; đủ ngưỡng mà bỏ CAPTCHA thì bị chặn trước bước kiểm tra password; trình duyệt mới vẫn 429 |
| Đăng nhập, đăng xuất, CRUD | 47 | Chưa đăng nhập: mọi route `/admin/*` → 303, dữ liệu không đổi; viewer → 403; cờ cookie; `sid` đổi khi đăng nhập; khởi động lại server vẫn đăng nhập; CSRF (thiếu token, token sai, `Origin` lạ, `Origin: null`) → 403; dùng lại `sid` sau logout → 303 |
| Quên mật khẩu | 20 | Email có / không có → cùng HTML; quá 3 lần/giờ → 429; `GET /reset` không đổi `usedAt`; sau reset `sid` ở tab khác bị từ chối; token cũ, đã dùng, hết hạn bị từ chối |
| Tìm kiếm và phân trang | 9 | `q=%` không trả toàn bộ; `bun` = `bún`; `/dishes/items?page=2` trả 9 thẻ |
| Log và dữ liệu | 2 | Log server không chứa OTP, reset token, password hay hash |

**Lưu ý:** script dùng `DATABASE_URL` trong `.env`. Nó xóa và tạo user có email kết thúc bằng
`@acceptance.test`, tạo rồi xóa một món ăn, và **xóa toàn bộ bảng `auth_throttles`**. Nên chạy
trên database thử nghiệm riêng thay vì database đang dùng để demo.

### 16.3. Kiểm tra thủ công bằng browser

- DevTools → Network: response `POST /login` có `Set-Cookie: sid=...`; request sau có `Cookie`.
- DevTools → Application → Cookies: cờ `HttpOnly`, `Secure`, `SameSite=Lax` của `sid`.
- Supabase → Table Editor: `users` (`status`, `role`, `emailVerifiedAt`), `activation_challenges`
  (`otpHash`, `attempts`, `usedAt`), `password_resets`, `sessions`, `auth_throttles`.
- Khởi động lại server rồi tải lại `/admin/dishes` với cùng cookie: vẫn đăng nhập.

## 17. Kiểm tra mã nguồn (slide "Kiểm tra mã nguồn")

| Câu hỏi | Kết quả và vị trí |
| --- | --- |
| Password, OTP, reset token có bị lưu, ghi log hay trả trong response ở dạng đọc được? | Không. DB chỉ lưu hash (mục 6). Log email chỉ ghi email đã che và loại thư (`src/auth/mailer.js`); lỗi Prisma chỉ ghi dòng cuối để không in tham số truy vấn (`src/app.js`). Nghiệm thu có kiểm tra log |
| Password băm bằng gì? | Argon2id: tạo ở `hashPassword`, so ở `verifyPassword` (`src/auth/crypto.js`) |
| Tài khoản pending có nhận session ở bước đăng nhập? | Không: `checkCredentials` trả `pending` trước khi tạo session (`src/auth/service.js`); `loadSession` cũng bỏ qua user không `active` |
| Route CRUD nào thiếu kiểm tra đăng nhập? | Không: một dòng `app.use("/admin", requireLogin, requireRole("admin"))` chặn mọi route `/admin/*` |
| Có GET nào đổi dữ liệu? | Không: `GET /reset` chỉ đọc; đăng xuất là `POST`; CRUD dùng `POST`/`PATCH`/`DELETE` |
| Session lưu ở đâu? | Bảng `sessions` trên PostgreSQL (`createSession` trong `src/auth/session.js`) |
| Bộ đếm đăng nhập sai lưu ở đâu? | Bảng `auth_throttles` (`src/auth/throttle.js`, `recordLoginFailure` trong `src/auth/service.js`) |
| Đáp án CAPTCHA có nằm trong response, hidden field hay cookie? | Không: dùng reCAPTCHA, browser chỉ có site key và token; secret key chỉ ở `.env`, xác minh ở `src/auth/captcha.js` |

## 18. Câu hỏi trình bày

**Cookie `sid` và bản ghi session khác nhau thế nào? Xóa cookie có hủy được session không?**
Cookie là mã tham chiếu nằm ở browser; bản ghi (`sidHash`, `userId`, hạn) nằm ở server. Xóa cookie
chỉ dọn browser hiện tại, bản sao `sid` vẫn dùng được. Chỉ đăng xuất (xóa bản ghi), hết hạn hoặc
đặt lại mật khẩu mới hủy session.

**Session lưu ở đâu, quan sát nào chứng minh nó còn sau khi server khởi động lại?**
Bảng `sessions` trên Supabase. Đăng nhập, dừng server, chạy lại, tải trang với cùng cookie: vẫn vào
`/admin/dishes`, bản ghi vẫn trong bảng.

**CAPTCHA chặn được gì, không chặn được gì; vì sao vẫn cần bộ đếm sai và thời gian chờ?**
CAPTCHA làm tăng chi phí tự động hóa (đăng ký hàng loạt, đoán password bằng script), nhưng không
chứng minh danh tính hay quyền sở hữu email, và có thể bị giải tự động hoặc thuê người giải. Bộ đếm
theo email + IP và thời gian khóa mới giới hạn số lần đoán, kể cả khi CAPTCHA bị vượt qua.

**Tài khoản pending bị chặn ở đâu? Gửi lại OTP có đặt lại số lần thử không?**
Ở server, trong `checkCredentials` (không tạo session) và `loadSession` (không nhận user không
active). Gửi lại OTP không đặt lại `attempts`.

**Route nào truy cập được khi chưa đăng nhập, và vì sao?**
`/dishes`, `/about`, `/bookings` (khách xem thực đơn và đặt bàn không cần tài khoản), cùng
`/register`, `/activate`, `/login`, `/forgot`, `/reset` (phải vào được thì mới có hoặc lấy lại tài
khoản). Mọi `/admin/*` cần tài khoản admin.

**Reset token được lưu thế nào, và quan sát nào chứng minh session cũ bị hủy sau khi reset?**
Chỉ lưu SHA-256 của token, kèm `expiresAt`, `usedAt`. Đăng nhập ở tab A, đặt lại mật khẩu ở tab
B, tải lại tab A: bị chuyển tới `/login`; bảng `sessions` không còn bản ghi của user đó.

## 19. Lỗi do agent tạo ra

### 19.1. Kích hoạt thành công nhưng trang báo "mã sai"

- **Tái hiện:** đăng ký, lấy OTP, bấm "Kích hoạt" hai lần liên tiếp (Enter rồi click). Request 1
  kích hoạt thành công; request 2 gặp mã đã dùng nên nhận `INVALID_OTP`. Browser hiện response của
  request 2, người dùng tưởng thất bại và thử thêm vài lần.
- **Bằng chứng:** trong DB, user đã `active`, `usedAt` có giá trị, trong khi bộ đếm
  `activate-fail:email:...` vẫn tăng.
- **Sửa:** server giữ nguyên (mã đã dùng phải báo như mã sai). Phía giao diện, script trong
  `views/partials/footer.ejs` khóa nút submit sau lần gửi đầu cho mọi form `POST`, và mở lại khi
  quay về trang bằng nút Back.
- **Sau khi sửa:** double-click trong Chrome headless chỉ gửi 1 request `POST`.

### 19.2. Đổi mật khẩu bị `403`

- **Tái hiện:** mở link đặt lại mật khẩu trong browser, nhập mật khẩu mới, bấm "Đổi mật khẩu" →
  `403 CSRF_FAILED`.
- **Nguyên nhân:** trang `/reset` gửi `Referrer-Policy: no-referrer`, nên browser gửi form với
  `Origin: null`; kiểm tra `Origin` coi đó là origin lạ. Script nghiệm thu không bắt được vì
  request gửi từ Node không có header `Origin`.
- **Sửa:** `src/auth/csrf.js` coi `Origin: null` là "không có thông tin" chỉ ở `/reset`; CSRF
  token vẫn bắt buộc.
- **Sau khi sửa:** Chrome headless gửi `Origin: null` và nhận `303 /login?reset=1`. Nghiệm thu
  thêm hai kiểm tra: `/reset` thiếu token vẫn `403`; route khác gửi `Origin: null` vẫn `403`.

### 19.3. Ô "Nâng cao" và nút "Tải thêm" không ẩn

- **Tái hiện:** chọn mode khác "Nâng cao" mà các ô giá, nguyên liệu vẫn hiện; ở kiểu Cuộn vô hạn
  nút "Tải thêm" vẫn hiện.
- **Nguyên nhân:** script đặt thuộc tính `hidden`, nhưng class `grid`/`flex` của Tailwind ghi đè
  `display`.
- **Sửa:** bật tắt class `hidden` thay vì thuộc tính (`views/partials/search-form.ejs`,
  `public/js/load-more.js`). Kiểm tra lại bằng Chrome headless.

## 20. Bằng chứng nộp

Thư mục `evidence/` hiện chứa bằng chứng của **Block 5** (`demo.webm`, `network-create.png`,
`network-delete.png`, `supabase-tables.png`, `validation-400.png`). Bằng chứng Block 8 cần chụp
thêm (che OTP, token, `sid`, password, key trước khi nộp):

- [ ] Đăng ký: form có reCAPTCHA; thiếu CAPTCHA → `INVALID_CAPTCHA`, không có user trong `users`
- [ ] Email OTP nhận được (che mã); bản ghi `activation_challenges` có `otpHash`, `expiresAt`
- [ ] OTP sai → `INVALID_OTP`, `attempts` tăng; quá 5 lần → trang `429`
- [ ] Kích hoạt đúng → `status = active`, có `emailVerifiedAt`, `usedAt`; không có `Set-Cookie: sid`
- [ ] Đăng nhập tài khoản pending → `ACCOUNT_PENDING`, không có `sid`
- [ ] Đăng nhập sai 3 lần → form hiện CAPTCHA; lần thứ 10 → `429`; bản ghi `auth_throttles`
- [ ] Đăng nhập đúng → Network có `Set-Cookie: sid` với `HttpOnly; Secure; SameSite=Lax`; so `sid` trước và sau
- [ ] Khởi động lại server, tải lại trang → vẫn đăng nhập; bản ghi trong `sessions`
- [ ] Đăng xuất, dùng lại `sid` cũ bằng công cụ HTTP → `303 /login`
- [ ] Chưa đăng nhập gọi `/admin/dishes` (GET, POST, DELETE) → `303`; viewer → `403`
- [ ] Form gửi từ trang khác (thiếu CSRF token) → `403 CSRF_FAILED`
- [ ] Quên mật khẩu: email có và không có → cùng trang; bản ghi `password_resets` chỉ có hash
- [ ] `GET /reset` → `usedAt` vẫn rỗng; đặt lại xong → `usedAt` có giá trị, `sid` cũ bị từ chối
- [ ] Sơ đồ luồng đăng ký, đăng nhập (chống brute force), đăng xuất, quên mật khẩu do nhóm vẽ
- [ ] Một lỗi do agent tạo ra (mục 19): ảnh trước và sau khi sửa

## 21. Giới hạn đã biết

- **Resend chưa có domain** chỉ gửi được tới email chủ tài khoản Resend (mục 5.4).
- **Test key reCAPTCHA** chỉ để chạy thử; dùng key thật khi demo và chụp bằng chứng.
- **Thời gian phản hồi `/forgot`:** nhánh có tài khoản ghi thêm hai câu lệnh DB, nên có thể chậm
  hơn nhánh không có tài khoản một chút; việc gửi email đã tách ra bất đồng bộ.
- **CAPTCHA chỉ có dạng checkbox của Google**: chưa có phương án cho người không hoàn thành được
  thử thách hình ảnh.
- **IP cho rate limit** lấy từ kết nối trực tiếp; chạy sau proxy phải đặt `TRUST_PROXY=1`.
- **Đặt bàn chưa gắn với tài khoản:** khách đặt bàn không cần đăng nhập và xem lại bằng mã như
  Block 5; tài khoản `viewer` hiện chưa có chức năng riêng.
- **Supabase từ máy nhóm** mất vài giây cho mỗi trang thực đơn do nhiều lượt truy vấn qua mạng.
- **Phân quyền chi tiết** (Viewer / Editor / Admin, MFA, SPA với JWT) thuộc Block 9; Block 8 chỉ
  phân biệt `admin` và còn lại.

## 22. Tổng kết

- Session nằm ở server (PostgreSQL), cookie chỉ mang mã tham chiếu `sid`; vì vậy session còn sau
  khi khởi động lại server, và đăng xuất hay đặt lại mật khẩu hủy được mọi bản sao.
- Tài khoản pending khác active; OTP, reset token, `sid` mỗi loại chỉ có một nơi chấp nhận và chỉ
  lưu dạng hash.
- CAPTCHA là lớp bổ sung cùng bộ đếm sai và thời gian chờ ở server, không thay password.
- Mọi kiểm tra nằm ở server; nhóm kiểm chứng bằng request trực tiếp và bản ghi database, không dựa
  vào việc giao diện ẩn nút.
