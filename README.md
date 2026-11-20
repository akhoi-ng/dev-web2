# Lửa Hồng - MFA và phân quyền cho bản SPA (Block 10)

Báo cáo Block 10 của nhóm. Đến Block 9, bản SSR đã có RBAC, ABAC và MFA. Bản SPA (React `web/` gọi
REST API `api/`) khi đó chưa có bước nhập mã: tài khoản đã bật MFA bị API chặn bằng `MFA_REQUIRED`.
Block 10 làm hai việc trên bản SPA:

1. **Xác thực hai bước (TOTP) cho API và SPA:** bật bằng mã QR hoặc secret key, đăng nhập hai bước,
   mã khôi phục, xác thực lại trước khi thay thiết bị, tắt MFA hoặc tạo lại mã khôi phục.
2. **Phân quyền khu vực quản trị:**
   - Admin dùng mọi chức năng quản trị.
   - Editor (tài khoản đầu bếp) chỉ vào khu món ăn: thêm món nháp và sửa món nháp của đầu bếp mình,
     theo đúng quy tắc ABAC của bản SSR. Editor không xóa được món.
   - Viewer không vào được khu quản trị.

   SPA ẩn lối vào và hiện trang 403 khi tài khoản không đủ quyền; API cũng trả `403`. Ẩn nút trên giao
   diện không phải là lớp chặn.

Slide thuyết trình: [`BLOCK10-slides.html`](BLOCK10-slides.html). Mở bằng trình duyệt; phím ← →
chuyển slide, `N` hiện ghi chú, `F` toàn màn hình.

Câu hỏi xuyên suốt: *password đã đúng nhưng chưa nhập mã thì API cấp gì cho SPA?* Câu trả lời của
nhóm: **chưa cấp token nào**. API trả một `challenge` ngắn hạn, và chỉ `POST /api/auth/mfa` nhận
challenge đó. Phải có challenge cộng với mã TOTP hoặc mã khôi phục đúng thì API mới cấp access token
và cookie `rt`.

## 1. Thông tin nhóm

| STT | Họ và tên | MSSV |
| --- | --- | --- |
| 1 | Nguyễn Tấn Hiệu | 24127373 |
| 2 | La Anh Hào | 24127361 |
| 3 | Trần Nguyễn Tuấn Minh | 24127084 |
| 4 | Nguyễn Anh Khôi | 24127430 |

## 2. Các phiên bản trong repository

Repository có ba ứng dụng dùng chung **một database PostgreSQL (Supabase)**:

| Thư mục | Ứng dụng | Cổng mặc định | Block |
| --- | --- | --- | --- |
| `api/` | REST API Express + Prisma, xác thực bằng JWT + refresh token | 3000 | 6–7 (CRUD, tìm kiếm), 9 Bài 1 (JWT), **10 (MFA, phân quyền quản trị)** |
| `web/` | React SPA (Vite + Tailwind) gọi `api/` | 5173 | 6–7, 9 Bài 1, **10** |
| `.` (gốc) | Bản SSR Express + EJS, xác thực bằng session | 3000 | 5 (CRUD), 8 (session), 9 Bài 2 (RBAC, ABAC, MFA) |

Tóm tắt các block trước:

- **Block 5–7:** CRUD món ăn, đầu bếp, nguyên liệu, đặt bàn. Tìm kiếm 4 mode (cơ bản, nâng cao, toàn
  văn, gần đúng) và 3 kiểu phân trang (số trang, tải thêm, cuộn vô hạn).
- **Block 8 (SSR):** đăng ký có reCAPTCHA, kích hoạt bằng OTP gửi qua email, đăng nhập bằng session
  lưu trong PostgreSQL, chống brute force, quên mật khẩu bằng reset token.
- **Block 9 Bài 1 (SPA):** chuyển các chức năng tài khoản sang API. Access token JWT sống 15 phút,
  refresh token xoay vòng trong cookie HttpOnly, `tokenVersion` để thu hồi token.
- **Block 9 Bài 2 (SSR):** RBAC Viewer / Editor / Admin, ABAC theo `chefId` và `status` của món, MFA
  bằng TOTP kèm mã khôi phục.

Chi tiết Block 9 nằm ở [`BLOCK9.md`](BLOCK9.md) và [`BLOCK9-slides.html`](BLOCK9-slides.html). Lưu ý:
những chỗ trong `BLOCK9.md` nói API trả `MFA_REQUIRED`, hoặc nói trang quản trị SPA không thấy món
nháp, là trạng thái **trước** Block 10. README này mô tả trạng thái hiện tại.

## 3. Yêu cầu Block 10 và nơi đáp ứng

| Yêu cầu | Trong project |
| --- | --- |
| Bật MFA: QR vẽ ở server, secret nhập tay, xác nhận bằng một mã trước khi bật | `POST/GET /api/auth/mfa/setup`, `POST /api/auth/mfa/confirm` (`api/src/routes/mfa.js`); trang `web/src/pages/account/SecurityPage.jsx` |
| Mã khôi phục: 10 mã, chỉ hiện một lần, DB chỉ lưu HMAC | `replaceRecoveryCodes`, `useRecoveryCode` (`api/src/auth/mfa.js`), bảng `recovery_codes` |
| Đăng nhập hai bước: password đúng chưa có token | `POST /api/auth/login` trả `{ next: "mfa", challenge }` (`api/src/routes/auth.js`), `startChallenge` (`api/src/auth/mfa.js`) |
| Bước nhập mã: giới hạn số lần thử, chống dùng lại mã | `POST /api/auth/mfa` (`api/src/routes/mfa.js`); trang `web/src/pages/auth/MfaPage.jsx` |
| Thay thiết bị, tắt MFA, tạo lại mã phải xác thực lại | `reauthenticate()` trong `api/src/routes/mfa.js` (password + mã TOTP hoặc mã khôi phục) |
| Bật, thay, tắt MFA thì đăng xuất mọi nơi khác | `signOutEverywhere` (`api/src/auth/mfa.js`): tăng `tokenVersion`, thu hồi refresh token, xóa session SSR |
| Phân quyền khu quản trị, chặn ở server | `requireDishStaff`, `dishStaffFor`, `adminOrEditorRead`, `requireAdmin` (`api/src/auth/middleware.js`), mount trong `api/src/app.js`; ABAC trong `api/src/routes/dishes.js` |
| SPA ẩn lối vào quản trị, tài khoản không đủ quyền thấy trang 403 | `web/src/auth/RequireAdmin.jsx`, `web/src/auth/landing.js`, `web/src/router.jsx`, `canAdmin` trong `web/src/components/Layout.jsx` |
| Dùng chung tài khoản và MFA với bản SSR | Chung bảng `users`, `mfa_challenges`, `recovery_codes`, `auth_throttles` và chung khóa `MFA_ENC_KEY` |

## 4. Cấu trúc liên quan

```
.
├── BLOCK10-slides.html            Slide thuyết trình Block 10
├── BLOCK9.md, BLOCK9-slides.html  Báo cáo và slide Block 9
├── evidence/ggdrive_link.txt      Link thư mục Google Drive chứa video và ảnh bằng chứng
├── api/
│   ├── src/app.js                 Thứ tự middleware, cổng phân quyền cho các route quản trị
│   ├── src/auth/
│   │   ├── config.js              POLICY: thời hạn token, ngưỡng CAPTCHA, rate limit, chính sách MFA
│   │   ├── middleware.js          requireAuth (Bearer -> verify -> tải user -> so tokenVersion), các cổng phân quyền
│   │   ├── policy.js              RBAC + ABAC (cùng quy tắc với bản SSR)
│   │   ├── mfa.js                 (mới) mã hóa secret, TOTP, mã khôi phục, challenge, bật/tắt MFA
│   │   ├── tokens.js              ký/verify JWT, cấp/xoay vòng/thu hồi refresh token
│   │   └── service.js, accounts.js, captcha.js, throttle.js, crypto.js, mailer.js, ...
│   ├── src/routes/
│   │   ├── auth.js                /api/auth/* (login trả challenge khi tài khoản bật MFA)
│   │   ├── mfa.js                 (mới) /api/auth/mfa và /api/auth/mfa/*
│   │   ├── dishes.js              /api/dishes (công khai, chỉ món published) + /api/admin/dishes (mới)
│   │   └── chefs.js, ingredients.js, admin-bookings.js, bookings.js, team.js, stats.js, options.js
│   ├── src/http/refresh-cookie.js (mới) cookie rt và issueTokens, chỗ duy nhất cấp cặp token
│   ├── prisma/                    schema.prisma (giống bản gốc), block9-auth.sql, block9-rbac-mfa.sql
│   ├── scripts/acceptance-auth.mjs  Nghiệm thu xác thực + MFA + phân quyền quản trị bằng request trực tiếp
│   ├── scripts/acceptance.mjs       Nghiệm thu CRUD Block 6–7
│   └── test/                        Unit test (node --test), có mfa.test.js, policy.test.js, admin-gate.test.js
├── web/src/
│   ├── api/client.js, api/index.js  Lớp gọi API: gắn Bearer, xử lý 401 / 403, authApi, mfaApi
│   ├── auth/AuthContext.jsx         login trả { user } hoặc { mfa: { challenge } }; verifyMfa; applyTokens
│   ├── auth/RequireAuth.jsx         Chưa đăng nhập -> /login?next=...
│   ├── auth/RequireAdmin.jsx        (mới) Không đủ quyền -> trang 403 (allowEditor: cho cả Editor)
│   ├── auth/landing.js              Ai mở được trang quản trị nào; trang đích sau đăng nhập
│   ├── auth/session.js              Access token trong biến JS, refresh có khóa giữa các tab
│   ├── pages/auth/MfaPage.jsx       (mới) /login/mfa
│   ├── pages/account/SecurityPage.jsx  (mới) /account/security
│   └── pages/admin/...              Trang quản trị (món có badge draft / published)
├── src/, views/, prisma/, scripts/, test/   Bản SSR (Block 5, 8, 9 Bài 2)
└── public/js/load-more.js                   Tải thêm / cuộn vô hạn của bản SSR
```

## 5. Cài đặt và chạy

Cần Node.js 20 trở lên. Các file `.env` không được commit; bản nộp cho giảng viên có kèm `.env`.

### 5.1. API và SPA (phần chính của Block 10)

```bash
# Terminal 1: API
cd api
npm install                 # postinstall chạy prisma generate
cp .env.example .env        # bỏ qua nếu đã có .env
npm run dev                 # http://localhost:3000

# Terminal 2: SPA
cd web
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:3000
npm run dev                 # http://localhost:5173
```

Nếu dùng database của nhóm (`.env` đã cấu hình sẵn) thì bảng và dữ liệu đã có, không cần chạy lệnh
database nào. Database mới thì xem mục 5.3.

### 5.2. Biến môi trường của API (`api/.env`)

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | Có | Kết nối Supabase (pooler 6543 cho app, 5432 cho lệnh SQL), giống `.env` gốc |
| `CORS_ORIGIN` | Có | Origin của SPA, ví dụ `http://localhost:5173`. Không dùng `*` |
| `WEB_URL` | Nên có | Dùng để dựng link đặt lại mật khẩu trong email; mặc định là origin đầu tiên của `CORS_ORIGIN` |
| `SESSION_SECRET` | Có | ≥ 32 ký tự, **trùng** `.env` gốc (hash OTP dùng chung) |
| `JWT_SECRET` | Có | ≥ 32 ký tự, khác `SESSION_SECRET`; khóa ký access token |
| `MFA_ENC_KEY` | Có | ≥ 32 ký tự, **trùng** `.env` gốc; khóa AES-256-GCM mã hóa secret TOTP |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | Có | reCAPTCHA v2 checkbox. Test key của Google luôn cho qua, chỉ dùng để chạy thử |
| `RECAPTCHA_HOSTNAMES` | Không | Mặc định là hostname của `WEB_URL`; dùng test key thì đặt `localhost,testkey.google.com` |
| `MAIL_TRANSPORT` | Không | `file` (ghi thư vào `api/mail-outbox/`), `resend`, `ethereal`, `smtp` |
| `RESEND_API_KEY`, `MAIL_FROM`, `SMTP_*` | Tùy transport | Resend chưa xác minh domain thì chỉ gửi được tới email của chủ tài khoản Resend |
| `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` | Để seed | Tài khoản seed (mục 5.3) |
| `ACCESS_TOKEN_TTL_SEC` | Không | Mặc định 900; đặt nhỏ (ví dụ 60) để thử token hết hạn |
| `COOKIE_SECURE`, `REFRESH_COOKIE_SAMESITE`, `TRUST_PROXY`, `LOG_SQL` | Không | Xem `api/.env.example` |

API **dừng ngay khi khởi động** nếu thiếu `SESSION_SECRET`, `JWT_SECRET`, `MFA_ENC_KEY` hoặc key
reCAPTCHA, hoặc nếu `JWT_SECRET` trùng `SESSION_SECRET`.

### 5.3. Database mới (chỉ khi không dùng database của nhóm)

Chạy ở thư mục gốc vì schema hai bản giống nhau:

```bash
npm install
npm run db:push        # tạo mọi bảng theo prisma/schema.prisma (đã có cột/bảng của Block 9–10)
npm run db:search      # pg_trgm, unaccent, index tìm kiếm (Block 7)
npm run db:seed        # 1.500 món + 4 tài khoản seed
```

Database đã có từ các block trước thì **không** chạy `db:push`, vì lệnh đó xóa index trigram tạo bằng
`search.sql`. Thay vào đó chạy các file SQL chỉ thêm (chạy lại nhiều lần không lỗi):
`cd api && npm run db:block9 && npm run db:block9-2`. **Block 10 không thêm bảng hay cột mới.**

`npm run db:seed-user` ở thư mục gốc tạo hoặc cập nhật 4 tài khoản active, dùng chung
`SEED_USER_PASSWORD`, không đụng tới thực đơn:

| Tài khoản | Role | Ghi chú |
| --- | --- | --- |
| `SEED_USER_EMAIL` | admin | Mọi trang quản trị |
| `<tên>+viewer@...` | viewer | Trang 403 ở `/admin/*` (bản SPA); chỉ đọc (bản SSR) |
| `<tên>+editor-a@...`, `<tên>+editor-b@...` | editor | Gắn với đầu bếp Nguyễn Văn Minh / Trần Quốc Huy; mỗi đầu bếp có ít nhất 2 món nháp. Cả hai bản: thêm món nháp, sửa món nháp của đầu bếp mình |

Seed lại không đổi trạng thái MFA của tài khoản đã có. `api/` cũng có `npm run db:seed-user` riêng,
nhưng lệnh đó chỉ tạo tài khoản admin.

### 5.4. Bản SSR (tùy chọn)

```bash
npm install
npm run dev            # http://localhost:3000
```

Bản SSR và API cùng mặc định cổng 3000. Muốn chạy cả hai cùng lúc thì đổi `PORT` và `APP_URL` trong
`.env` gốc (ví dụ `3001`). Bật MFA ở bản nào thì đăng nhập ở cả hai bản đều phải nhập mã.

### 5.5. Script

| Thư mục | Lệnh | Việc |
| --- | --- | --- |
| `api` | `npm run dev` / `npm start` | Chạy API |
| `api` | `npm test` | Unit test |
| `api` | `npm run acceptance:auth` | Nghiệm thu xác thực, MFA, phân quyền quản trị (tự chạy API ở cổng 3998) |
| `api` | `npm run acceptance` | Nghiệm thu CRUD Block 6–7 (cần API đang chạy) |
| `web` | `npm run dev` / `npm run build` / `npm test` | Chạy, build, unit test SPA |
| gốc | `npm run dev` / `npm test` / `npm run acceptance` | Bản SSR |

## 6. Đăng nhập hai bước qua API

```
POST /api/auth/login { email, password, captcha? }
  password đúng, tài khoản active, chưa bật MFA  ->  { accessToken, expiresIn, tokenType } + Set-Cookie: rt
  password đúng, tài khoản active, đã bật MFA    ->  { next: "mfa", challenge, expiresIn: 300 }
                                                     (không có accessToken, không có cookie rt)

POST /api/auth/mfa { challenge, code }           code = mã TOTP 6 chữ số hoặc mã khôi phục XXXXX-XXXXX
  đúng   ->  { accessToken, expiresIn, tokenType, method: "totp" | "recovery", recoveryRemaining? } + rt
  sai    ->  200 INVALID_MFA_CODE (kèm attemptsLeft)
  lần sai thứ 5 -> 401 MFA_TOO_MANY_ATTEMPTS, challenge bị xóa, phải đăng nhập lại
  challenge không có / hết hạn / đã dùng -> 401 MFA_CHALLENGE_EXPIRED
```

Thứ tự kiểm tra trong `POST /api/auth/mfa`:

1. Rate limit theo IP: 50 lần / 15 phút.
2. Tìm challenge theo `sha256(challenge)`. Challenge phải còn hạn (5 phút), còn lượt, user vẫn
   `active` và vẫn bật MFA.
3. Giới hạn theo tài khoản: 10 lần / 15 phút. Bộ đếm cộng dồn qua nhiều lần đăng nhập và dùng chung
   với bản SSR, nên biết password vẫn không dò được mã bằng cách đăng nhập lại.
4. **Giữ một lượt thử trước khi kiểm tra mã** bằng `UPDATE ... WHERE attempts < 5`. Gửi nhiều request
   song song không vượt được số lượt.
5. Kiểm tra mã:
   - TOTP: chấp nhận lệch ±1 bước 30 giây. Chống dùng lại bằng `UPDATE mfaLastStep` có điều kiện
     "bước mới > bước cũ".
   - Mã khôi phục: `UPDATE usedAt` có điều kiện `usedAt IS NULL`.
6. Mã đúng: xóa challenge (chỉ một request xóa được), xóa bộ đếm theo tài khoản, rồi mới cấp token.

Phía SPA:

- `LoginPage` nhận `{ mfa: { challenge } }` thì chuyển sang `/login/mfa`. Challenge được truyền qua
  state của router, chỉ nằm trong bộ nhớ, không ghi vào URL hay localStorage.
- Tải lại trang ở bước này thì challenge mất, người dùng phải đăng nhập lại.
- Access token vẫn chỉ nằm trong biến JavaScript, refresh token nằm trong cookie HttpOnly, như Block 9.

Hai bản dùng chung bảng `mfa_challenges`: challenge lưu dạng SHA-256 và mỗi tài khoản chỉ có một lần
chờ. Đăng nhập lại (ở bản nào cũng vậy) thì lần chờ cũ mất hiệu lực.

## 7. Quản lý MFA (`/account/security`)

Mọi tài khoản đã đăng nhập đều vào được trang này, kể cả Viewer và Editor. Các endpoint đều cần
Bearer token và trả `Cache-Control: no-store`.

| Endpoint | Việc | Điều kiện |
| --- | --- | --- |
| `GET /api/auth/mfa/status` | `mfaEnabled`, có thiết lập đang chờ không, số mã khôi phục còn lại | |
| `POST /api/auth/mfa/setup` | Tạo secret chờ xác nhận, trả QR (data URL vẽ ở server) và secret nhập tay | MFA đang bật (thay thiết bị) thì phải gửi `{ password, code }` |
| `GET /api/auth/mfa/setup` | Xem lại QR và secret đang chờ | |
| `POST /api/auth/mfa/confirm` | `{ code }` đúng thì bật MFA, trả 10 mã khôi phục **một lần** và cặp token mới | 10 lần / 15 phút |
| `POST /api/auth/mfa/cancel` | Bỏ secret đang chờ | |
| `POST /api/auth/mfa/recovery-codes` | Tạo lại 10 mã, mã cũ hết hiệu lực | `{ password, code }` |
| `POST /api/auth/mfa/disable` | Tắt MFA, xóa secret và mã khôi phục, trả cặp token mới | `{ password, code }` |

- **Xác thực lại** cần password hiện tại cộng với mã TOTP hoặc mã khôi phục, giới hạn 5 lần / 15
  phút. Password sai thì không kiểm tra mã, nên không tiêu thụ mã khôi phục.
- **Thay thiết bị:** secret cũ vẫn dùng được cho tới khi secret mới được xác nhận.
- **Bật, thay, tắt MFA:** trong cùng một transaction, `tokenVersion` tăng 1, mọi refresh token bị thu
  hồi, mọi session SSR và mọi challenge chờ MFA bị xóa. Sau đó thiết bị đang thao tác nhận cặp token
  mới; các nơi khác phải đăng nhập lại và qua bước MFA.
- **Lưu trữ:**
  - Secret TOTP được mã hóa AES-256-GCM bằng `MFA_ENC_KEY` (`mfaSecret`, `mfaPendingSecret`). Secret
    không băm một chiều được vì server cần giá trị gốc để tính mã.
  - Mã khôi phục chỉ lưu HMAC (`recovery_codes.codeHash`).
  - Secret và mã khôi phục không ghi vào log.
- **Đặt lại mật khẩu không tắt MFA:** reset xong, đăng nhập vẫn phải qua bước nhập mã.

## 8. Phân quyền khu vực quản trị

### 8.1. API (`api/src/app.js`)

```js
app.use("/api/auth", authRouter);
app.use("/api/dishes", protectMethods(WRITE_METHODS), dishStaffFor(WRITE_METHODS), dishesRouter);
app.use("/api/admin/dishes", requireAuth, requireDishStaff, adminDishesRouter);
app.use("/api/chefs", requireAuth, adminOrEditorRead, chefsRouter);
app.use("/api/ingredients", requireAuth, adminOrEditorRead, ingredientsRouter);
app.use("/api/admin/bookings", requireAuth, requireAdmin, adminBookingsRouter);
```

| Endpoint | Không có token | Viewer | Editor | Admin |
| --- | --- | --- | --- | --- |
| `GET /api/dishes`, `GET /api/dishes/:id` | 200 (chỉ món `published`) | 200 | 200 | 200 |
| `GET /api/admin/dishes[/:id]` (thấy cả món nháp, có cờ `canEdit` / `canDelete`) | 401 | 403 | 200 | 200 |
| `POST /api/dishes`, `POST /api/admin/dishes` | 401 | 403 | 200: luôn là món **nháp** của đầu bếp mình (`chefId`, `status` trong body bị bỏ qua) | 200 |
| `PATCH /api/dishes/:id`, `PATCH /api/admin/dishes/:id` | 401 | 403 | 200 nếu món **nháp** của đầu bếp mình, còn lại 403 | 200 |
| `DELETE /api/dishes/:id`, `DELETE /api/admin/dishes/:id` | 401 | 403 | 403 | 200 |
| `GET /api/chefs`, `GET /api/ingredients` (danh sách cho form món) | 401 | 403 | 200 | 200 |
| Ghi `/api/chefs/*`, `/api/ingredients/*`; mọi `/api/admin/bookings/*` | 401 | 403 | 403 | 200 |
| `/api/auth/me`, `/api/auth/mfa/*`, `/api/auth/logout-all` | 401 | 200 | 200 | 200 |

Bị chặn thì nhận `403 FORBIDDEN` và dữ liệu không đổi. Các tuyến công khai `/api/stats`,
`/api/options`, `/api/team`, `POST /api/bookings`, `GET /api/bookings/:code` không cần token.

Quyền được kiểm tra qua hai lớp:

1. **Cổng ở `app.js`:** xét role (Viewer bị chặn) và RBAC theo method (`policy.can`): GET là đọc,
   POST là tạo, PATCH là sửa, DELETE là xóa. Editor không có quyền xóa.
2. **ABAC trong handler ghi món** (`api/src/routes/dishes.js`, quy tắc ở `api/src/auth/policy.js`,
   giống bản SSR):
   - Chỉ Admin được đặt `chefId` và `status`.
   - Editor tạo món: server gán `chefId` của tài khoản và `status = draft`. Tài khoản chưa gắn đầu
     bếp thì nhận 403.
   - Editor sửa món: điều kiện `{ chefId, status: "draft" }` nằm trong WHERE của câu UPDATE. Nếu Admin
     đăng món giữa lúc Editor mở form và lúc gửi, UPDATE không khớp dòng nào và trả 403.

Role và `chefId` được đọc từ DB ở mỗi request (`requireAuth`), không lấy từ JWT hay body. Hạ một
Admin xuống Viewer trong DB thì token người đó đang dùng nhận 403 ngay ở request kế tiếp.

### 8.2. SPA

| | Viewer | Editor | Admin |
| --- | --- | --- | --- |
| Nút "Quản trị" trên header | Không có | Có | Có |
| Tab trong khu quản trị | | Món ăn | Món ăn, Đầu bếp, Nguyên liệu, Đặt bàn |
| Mở `/admin/dishes/*` | Trang 403 | Được | Được |
| Mở `/admin/chefs`, `/admin/ingredients`, `/admin/bookings` | Trang 403 | Trang 403 | Được |
| Trang đích sau đăng nhập | `/dishes` | `/admin/dishes` | `/admin/dishes` |

- Route guard nằm ở `RequireAdmin` (`allowEditor` cho khu món ăn) và `landing.js`. `?next=` trỏ vào
  trang quản trị mà tài khoản không mở được thì bị bỏ qua.
- Danh sách món hiện badge Nháp / Đã đăng. Nút "Sửa" / "Xóa" hiện theo cờ `canEdit` / `canDelete` do
  API tính, nên Editor chỉ thấy nút "Sửa" ở món nháp của đầu bếp mình và không thấy nút "Xóa".
- Form món của Editor không có ô chọn đầu bếp và trạng thái. Tên đầu bếp và nguyên liệu không còn
  là link sang trang chỉ Admin mở được.

### 8.3. Bản SSR

Bản SSR giữ nguyên RBAC + ABAC của Block 9 Bài 2:

- Viewer chỉ đọc.
- Editor tạo món và sửa món draft của đầu bếp mình.
- Admin làm được mọi thao tác.

Chi tiết ở `BLOCK9.md` mục 11. Khác biệt duy nhất giữa hai bản: Viewer đọc được trang quản trị của
bản SSR, còn trên SPA thì Viewer không vào được khu quản trị.

## 9. Mã lỗi mới của Block 10

Body lỗi vẫn theo shape `{ ok: false, error: { code, message } }` của Block 6.

| Mã | Status | Khi nào |
| --- | --- | --- |
| `INVALID_MFA_CODE` | 200 | Mã sai, hết hạn hoặc đã dùng (bước đăng nhập có kèm `attemptsLeft`; cũng dùng khi xác nhận bật MFA) |
| `MFA_CHALLENGE_EXPIRED` | 401 | Challenge không có, hết hạn, hết lượt hoặc đã dùng |
| `MFA_TOO_MANY_ATTEMPTS` | 401 | Lần nhập sai thứ 5 trong một challenge |
| `REAUTH_FAILED` | 200 | Password hoặc mã sai khi thay thiết bị, tắt MFA, tạo lại mã khôi phục |
| `NO_PENDING_SETUP` | 200 | Xác nhận hoặc xem QR khi không có thiết lập đang chờ |
| `MFA_NOT_ENABLED` | 200 | Tắt MFA hoặc tạo lại mã khi chưa bật MFA |
| `FORBIDDEN` | 403 | Đã đăng nhập nhưng không đủ quyền với endpoint quản trị hoặc với món đó (mục 8) |
| `RATE_LIMITED` | 429 | Vượt giới hạn; có header `Retry-After` |

Các mã của Block 9 (`UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `CAPTCHA_REQUIRED`, ...)
giữ nguyên; xem `BLOCK9.md` mục 3. Mã `MFA_REQUIRED` của Block 9 **đã bỏ**.

## 10. Chính sách MFA (`POLICY.mfa` trong `api/src/auth/config.js`)

| Hạng mục | Giá trị |
| --- | --- |
| TOTP | RFC 6238, 6 chữ số, bước 30 giây, SHA-1, chấp nhận lệch ±1 bước |
| Challenge chờ MFA | 32 byte ngẫu nhiên, DB lưu SHA-256, sống 5 phút, tối đa 5 lần thử |
| Nhập mã theo tài khoản | 10 lần / 15 phút (dùng chung bộ đếm với bản SSR) |
| Nhập mã theo IP | 50 lần / 15 phút |
| Xác nhận khi bật MFA | 10 lần / 15 phút |
| Xác thực lại | 5 lần / 15 phút |
| Mã khôi phục | 10 mã, dạng `XXXXX-XXXXX` (50 bit), mỗi mã dùng một lần |

Các số liệu này giống bản SSR (`src/auth/config.js`) vì hai bản dùng chung bảng và bộ đếm.

## 11. Kiểm thử

| Lệnh | Kết quả |
| --- | --- |
| `cd api && npm test` | 105 PASS (có `mfa.test.js`: mã hóa secret, TOTP, mã khôi phục, QR; `policy.test.js`: RBAC, ABAC; `admin-gate.test.js`: cổng phân quyền theo role và method) |
| `cd web && npm test` | 50 PASS (có `landing.test.js`: trang quản trị nào mở được theo role, trang đích; test bước MFA của lớp gọi API) |
| `npm test` (gốc, SSR) | 20 PASS |
| `cd api && npm run acceptance:auth` | Xác thực Block 9, 46 dòng MFA và 27 dòng phân quyền quản trị (Admin / Editor / Viewer) của Block 10 |
| `cd api && npm run acceptance` | 74 / 74 PASS (CRUD Block 6–7, đăng nhập bằng tài khoản admin seed) |
| `npm run acceptance` (gốc, SSR) | 205 / 205 PASS (Block 8 + Block 9 Bài 2 không bị ảnh hưởng) |

`acceptance:auth` làm những việc sau:

- Tự chạy API ở cổng 3998, với một `siteverify` giả lập ở cổng kế bên.
- Đọc thư trong `api/mail-outbox/`.
- Sinh mã TOTP từ secret key đọc được ở response thiết lập, như một ứng dụng Authenticator.
- Đối chiếu DB: hash, `usedAt`, `attempts`, `tokenVersion`, `revokedAt`, `mfaEnabled`.

Một số dòng tiêu biểu của Block 10:

- Login của tài khoản bật MFA không có `accessToken` và không có `Set-Cookie: rt`; dùng challenge
  làm Bearer bị 401.
- Mã TOTP dùng lại bị từ chối; lần sai thứ 5 trả `401 MFA_TOO_MANY_ATTEMPTS`; challenge hết hạn trả 401.
- Mã khôi phục dùng lần hai bị từ chối; reset password xong vẫn phải qua bước MFA.
- Bật hoặc tắt MFA làm token cũ ở thiết bị khác bị 401.
- Viewer gọi 5 endpoint quản trị đều nhận 403; sửa hay tạo món bằng Viewer bị 403, dữ liệu không đổi.
- Editor tạo món thì món luôn là nháp của đầu bếp mình (gửi `chefId` khác hay `status=published` đều
  bị bỏ qua). Editor sửa được món nháp của mình. Sửa món đã đăng, sửa món nháp của đầu bếp khác,
  xóa món, tạo đầu bếp, xem đặt bàn đều nhận 403.
- Hạ Admin xuống Viewer trong DB thì token đang dùng nhận 403 ngay.

**Lưu ý:** cả ba script nghiệm thu dùng `DATABASE_URL` trong `.env`. Chúng tạo rồi xóa user
`@acceptance.test` và dữ liệu có nhãn `[nghiệm thu ...]`, và **xóa toàn bộ bảng `auth_throttles`**.
Nên chạy trên database thử nghiệm.

## 12. Giới hạn đã biết

- **Tải lại trang ở bước nhập mã** làm mất challenge, vì challenge chỉ nằm trong bộ nhớ của SPA.
  Người dùng phải đăng nhập lại.
- **TOTP vẫn bị phishing chuyển tiếp:** trang giả có thể chuyển mã người dùng nhập tới server thật
  trong cửa sổ 30 giây. Chống được việc này cần WebAuthn hoặc passkey, nằm ngoài phạm vi block.
- **Bật MFA rồi đăng xuất ngay trong cùng 30 giây** thì phải chờ mã kế tiếp, vì mã vừa dùng đã bị
  đánh dấu.
- **Đổi `MFA_ENC_KEY`** làm mọi secret đã lưu không giải mã được. Người dùng phải đăng nhập bằng mã
  khôi phục rồi bật lại MFA.
- **Đăng xuất một thiết bị** không vô hiệu bản sao access token ở nơi khác trước `exp` (≤ 15 phút).
  "Đăng xuất mọi nơi" thì chặn ngay.
- **Editor không đổi được trạng thái món:** món nháp do Editor tạo hoặc sửa chỉ lên thực đơn khi
  Admin chuyển sang "Đã đăng". Sau đó Editor không sửa được món đó nữa.
- **Bản SSR và API cùng mặc định cổng 3000:** chạy song song thì đổi `PORT` của một bản (mục 5.4).
- **Resend chưa xác minh domain** chỉ gửi được thư tới email chủ tài khoản Resend. Muốn thử đăng ký
  bằng email khác thì đặt `MAIL_TRANSPORT=file` và mở thư trong `api/mail-outbox/`.

## 13. Bằng chứng

Video demo và ảnh chụp (Network, Application, bản ghi database, request trực tiếp) nằm trong thư mục
Google Drive ở [`evidence/ggdrive_link.txt`](evidence/ggdrive_link.txt). OTP, token, password, secret
TOTP và mã khôi phục đã được che trước khi nộp.
