# Lửa Hồng - Xác thực cho SPA, phân quyền và MFA (Block 9)

Báo cáo Bài 1 của Block 9 ("Xác thực cho SPA, phân quyền và MFA"). Bài 1 chuyển bốn chức năng
tài khoản của Block 8 (đăng ký, kích hoạt, đăng nhập, quên mật khẩu) sang **bản CSR của Block 6–7**:
React SPA `web/` (cổng 5173) gọi REST API `api/` (cổng 3000), hai origin khác nhau.

- `api`: đăng ký có **Google reCAPTCHA v2**, kích hoạt bằng **OTP qua email**, đăng nhập trả
  **access token JWT** (15 phút) kèm **refresh token** xoay vòng trong cookie HttpOnly, quên và đặt
  lại mật khẩu. Ghi món ăn và mọi endpoint đầu bếp, nguyên liệu, quản lý đặt bàn cần Bearer token.
- `web`: trang đăng ký, nhập OTP, đăng nhập, quên mật khẩu, đặt lại mật khẩu; lớp gọi API gắn
  `Authorization: Bearer`, tự làm mới token khi gặp 401; route guard cho `/admin/*`.
- Bài 2 (bản SSR): phân quyền RBAC Viewer / Editor / Admin, ABAC theo đầu bếp và trạng thái món,
  MFA bằng TOTP + mã khôi phục. Xem [mục 11](#11-bài-2--phân-quyền-và-mfa-bản-ssr).

Slide thuyết trình: [`BLOCK9-slides.html`](BLOCK9-slides.html) (mở bằng trình duyệt; ← → chuyển
slide, `N` hiện ghi chú, `F` toàn màn hình).

Câu hỏi xuyên suốt: *SPA gọi API ở origin khác. Request mang bằng chứng gì để API biết người gọi
là ai?* Câu trả lời của nhóm: header `Authorization: Bearer <JWT>`. API tính lại chữ ký HS256 bằng
`JWT_SECRET`, kiểm tra `exp`, `iss`, `aud`, rồi tải user theo `sub` từ database và so
`tokenVersion`. Role luôn đọc từ database, không từ token hay từ body.

## 1. Cấu trúc liên quan

```
api/
  src/auth/
    config.js        chính sách (hạn token, ngưỡng CAPTCHA, rate limit), đọc .env
    tokens.js        ký / verify JWT, cấp / xoay vòng / thu hồi refresh token
    middleware.js    requireAuth: Bearer -> verify -> tải user -> so tokenVersion
    service.js       đăng ký, OTP, bộ đếm sai, quên / đặt lại mật khẩu (từ Block 8)
    accounts.js      chuẩn hóa email, kiểm tra dữ liệu (lỗi trả về error.fields)
    captcha.js       siteverify của Google (giữ nguyên Block 8)
    throttle.js      bộ đếm ở bảng auth_throttles (giữ nguyên Block 8)
    crypto.js        Argon2id, số ngẫu nhiên, SHA-256, HMAC (giữ nguyên Block 8)
    mailer.js        gửi thư: file | resend | ethereal | smtp (giữ nguyên Block 8)
    mail-templates.js
    cleanup.js       dọn refresh token hết hạn, bộ đếm cũ
  src/routes/auth.js /api/auth/*
  src/routes/team.js GET /api/team (đội ngũ cho trang công khai)
  src/http/cors.js   cho phép Authorization, credentials, origin cụ thể
  prisma/block9-auth.sql  thêm cột tokenVersion và bảng refresh_tokens
  scripts/acceptance-auth.mjs  nghiệm thu Bài 1 bằng request trực tiếp
  requests-auth.http          request mẫu cho REST Client
  test/auth-tokens.test.js    unit test JWT, 401, preflight
web/src/
  api/client.js      lớp gọi API: gắn Bearer, 401 -> refresh một lần, 403 giữ token
  api/index.js       authApi, session dùng chung
  auth/session.js    nơi giữ access token (biến JS), refresh có khóa giữa các tab
  auth/AuthContext.jsx, auth/RequireAuth.jsx, auth/Recaptcha.jsx
  pages/auth/        LoginPage, RegisterPage, ActivatePage, ForgotPage, ResetPage
```

### Mô-đun chuyển từ Block 8 sang `api` và phần đã đổi

| Mô-đun Block 8 (`src/auth`) | Trong `api/src/auth` |
| --- | --- |
| `crypto.js`, `captcha.js`, `throttle.js`, `mailer.js` | Giữ nguyên |
| `service.js` | Giữ đăng ký, OTP, bộ đếm sai. Link đặt lại trỏ về `WEB_URL/reset`. Đặt lại mật khẩu tăng `tokenVersion`, thu hồi mọi refresh token, xóa session SSR |
| `accounts.js` | Cùng quy tắc chuẩn hóa email và độ dài password; lỗi trả về dạng `{ trường: thông báo }` |
| `config.js` | Thêm chính sách access / refresh token, `WEB_URL`, `JWT_SECRET`; hostname reCAPTCHA mặc định theo `WEB_URL` |
| `session.js`, `csrf.js` | Không dùng: API không có session; CSRF chỉ liên quan tới `/refresh`, `/logout` (mục 6) |
| (mới) `tokens.js`, `middleware.js` | JWT, refresh token, `requireAuth` |

Bản SSR (`src/auth/service.js`) cũng được sửa một chỗ: đặt lại mật khẩu ở SSR tăng `tokenVersion`
và thu hồi refresh token, vì hai bản dùng chung bảng `users`.

## 2. Cài đặt và chạy

```bash
# 1. API
cd api
npm install
cp .env.example .env        # điền DATABASE_URL, DIRECT_URL, SESSION_SECRET (trùng bản SSR),
                            # JWT_SECRET (mới, khác SESSION_SECRET), RECAPTCHA_*, MAIL_*
npm run db:block9           # thêm users.tokenVersion và bảng refresh_tokens (không xóa gì)
npm run db:seed-user        # tài khoản active từ SEED_USER_EMAIL / SEED_USER_PASSWORD
npm run dev                 # http://localhost:3000

# 2. Web (terminal khác)
cd web
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:3000
npm run dev                 # http://localhost:5173
```

Không chạy `prisma db push` cho Block 9: lệnh đó sẽ xóa index trigram tìm kiếm của Block 7 (tạo
bằng `prisma/search.sql`, không nằm trong schema). `prisma/block9-auth.sql` chỉ thêm, chạy lại nhiều
lần không sao. Hai file `prisma/schema.prisma` (gốc và `api/`) giống nhau vì dùng chung một DB.

Tạo `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

reCAPTCHA: đăng ký key loại v2 checkbox với domain `localhost`. Site key công khai được SPA lấy qua
`GET /api/auth/captcha`; secret key chỉ nằm ở `api/.env`. Test key của Google luôn thành công, chỉ
dùng để chạy thử, không dùng làm bằng chứng chặn bot.

## 3. Endpoint xác thực

| Method + path | Body | Kết quả |
| --- | --- | --- |
| `GET /api/auth/captcha` | | `{ provider, siteKey }` |
| `POST /api/auth/register` | `{ email, password, confirm?, captcha }` | 200 ok, không có token; `CAPTCHA_REQUIRED`, `INVALID_CAPTCHA`, `VALIDATION_FAILED`; 429; 503 khi không gọi được Google |
| `POST /api/auth/activate` | `{ email, otp }` | 200 ok (không cấp token); `INVALID_OTP`; 429 khi khóa |
| `POST /api/auth/activate/resend` | `{ email }` | 200 ok; 429 khi chưa đủ 60 giây hoặc quá 5 lần/giờ |
| `POST /api/auth/login` | `{ email, password, captcha? }` | `{ accessToken, expiresIn: 900, tokenType }` + cookie `rt`; `INVALID_CREDENTIALS` (kèm `captchaRequired`), `CAPTCHA_REQUIRED`, `INVALID_CAPTCHA`, `ACCOUNT_NOT_ACTIVATED`; 429 |
| `POST /api/auth/refresh` | cookie `rt` | access token mới + `rt` mới; 401; 403 nếu Origin lạ |
| `POST /api/auth/logout` | cookie `rt` | thu hồi family của `rt`, xóa cookie |
| `POST /api/auth/logout-all` | Bearer | `tokenVersion + 1`, thu hồi mọi `rt`, xóa session của bản SSR |
| `GET /api/auth/me` | Bearer | `{ id, email, displayEmail, role, status }` (role từ DB) |
| `POST /api/auth/forgot` | `{ email }` | 200 ok, giống nhau cho email có và không có; 429 |
| `POST /api/auth/reset` | `{ token, password, confirm? }` | 200 ok, không có token; `INVALID_RESET_TOKEN` |

### Bảo vệ CRUD (`api/src/app.js`)

| Endpoint | Yêu cầu |
| --- | --- |
| `GET /api/dishes`, `GET /api/dishes/:id` | Công khai (tìm kiếm, phân trang của Block 7 giữ nguyên) |
| `POST`, `PATCH`, `DELETE /api/dishes...` | Bearer token của tài khoản active, role admin (Bài 2) |
| `/api/chefs/*`, `/api/ingredients/*`, `/api/admin/bookings/*` | Bearer token, mọi method; Bài 2: GET mọi role, POST/PATCH editor + admin, DELETE admin |
| `/api/stats`, `/api/options`, `/api/team`, `POST /api/bookings`, `GET /api/bookings/:code` | Công khai |

`GET /api/team` là endpoint mới: trang "Về chúng tôi" của khách cần tên và chuyên môn đầu bếp,
mà `/api/chefs` đã khóa sau token. Endpoint chỉ trả các trường hiển thị.

### Hợp đồng lỗi

| Tình huống | Status | `error.code` | SPA xử lý |
| --- | --- | --- | --- |
| Thiếu Authorization, chữ ký sai, user không còn active, `tokenVersion` cũ | 401 | `UNAUTHENTICATED` | Thử refresh một lần; không được thì xóa token, về `/login?next=…` |
| Token quá `exp` | 401 | `TOKEN_EXPIRED` (+ `WWW-Authenticate: Bearer error="invalid_token"`) | Như trên |
| Có danh tính, thiếu quyền (Bài 2) | 403 | `FORBIDDEN` | Báo không đủ quyền, giữ token |
| Vượt giới hạn, đang khóa | 429 | `RATE_LIMITED` (+ `Retry-After`, `retryAfterSec`) | Báo thời gian chờ |
| Lỗi nhập ở các form xác thực | 200 | `INVALID_CREDENTIALS`, `CAPTCHA_REQUIRED`, `INVALID_CAPTCHA`, `INVALID_OTP`, `INVALID_RESET_TOKEN`, `ACCOUNT_NOT_ACTIVATED`, `VALIDATION_FAILED` | Thông báo trong form |
| `NOT_FOUND`, `VALIDATION_FAILED` của CRUD | 200 | như Block 6 | Giữ nguyên |

Body 401, 403, 429 vẫn theo shape `{ ok: false, error: { code, message } }`. Lỗi mạng và 500 là lỗi
kỹ thuật, không làm SPA đăng xuất.

## 4. Chính sách công bố

| Mục | Giá trị |
| --- | --- |
| Access token | JWT HS256, 900 giây (đổi được bằng `ACCESS_TOKEN_TTL_SEC` để thử hết hạn nhanh). Claim: `sub`, `ver` (tokenVersion), `jti`, `iat`, `exp`, `iss = lua-hong-api`, `aud = lua-hong-web`. Không có email, role hay bí mật |
| Verify | `algorithms: ["HS256"]` cố định ở server (từ chối `none` và thuật toán khác), kiểm tra `exp`, `iss`, `aud`; tải user từ DB, phải `active`, `ver` phải bằng `tokenVersion` |
| Khóa ký | `JWT_SECRET` ≥ 32 ký tự trong `api/.env`, khác `SESSION_SECRET`; không có trong bundle của SPA |
| Refresh token | 32 byte ngẫu nhiên, cookie `rt`: `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`. DB lưu SHA-256. Hạn 7 ngày tính từ lúc đăng nhập, làm mới không gia hạn |
| Xoay vòng | Mỗi lần refresh: token cũ có `usedAt`, cấp token mới cùng `familyId`. Token đã dùng bị gửi lại → thu hồi cả family |
| CAPTCHA, bộ đếm sai | Như Block 8, dùng chung bảng `auth_throttles` với SSR: từ lần sai thứ 3 cần CAPTCHA, lần thứ 10 khóa 5 phút |
| OTP | 6 chữ số, 10 phút, 5 lần sai khóa 15 phút; gửi lại cách 60 giây, tối đa 5 lần/giờ |
| Reset token | 15 phút, một lần; 3 yêu cầu/giờ/email |

### Nơi lưu token (yêu cầu web)

- **Access token: biến JavaScript** trong `web/src/auth/session.js`. Không ghi vào localStorage
  hay sessionStorage. Mất khi tải lại trang hoặc đóng tab.
- **Refresh token: cookie HttpOnly** do API đặt. JavaScript không đọc được; browser chỉ gửi kèm
  `/api/auth/*`. Tải lại trang hoặc mở tab mới, SPA gọi `POST /api/auth/refresh` để lấy access
  token mới nên người dùng vẫn đăng nhập.
- localStorage chỉ có cờ `lua-hong:signed-in = "1"` để trang biết có nên thử refresh lúc tải; sửa
  cờ này không cấp quyền gì.
- **Rủi ro XSS còn lại:** mã chạy trong trang đọc được access token đang ở bộ nhớ và gọi được API
  (kể cả `/refresh`) khi trang đang mở. Cookie HttpOnly chỉ chặn việc đọc refresh token. Giảm bằng:
  React escape dữ liệu khi render, không dùng `dangerouslySetInnerHTML` với dữ liệu người dùng,
  access token chỉ sống 15 phút.

### JWT đã cấp khi đổi mật khẩu, đăng xuất

| Hành động | Access token đã cấp | Refresh token |
| --- | --- | --- |
| Đặt lại mật khẩu (ở API hoặc SSR) | Bị từ chối ngay (`tokenVersion + 1`) | Thu hồi tất cả |
| Đăng xuất mọi nơi (nút trong menu tài khoản, `/logout-all`) | Bị từ chối ngay; session của bản SSR cũng bị xóa | Thu hồi tất cả |
| Đăng xuất thiết bị này (`/logout`) | SPA bỏ bản của mình; **bản sao ở nơi khác còn dùng tới `exp`, tối đa 15 phút** | Thu hồi family |
| Refresh token bị dùng lại | Còn tới `exp` | Thu hồi cả family |

## 5. Lớp gọi API trên SPA

- `web/src/api/client.js` là nơi duy nhất gắn `Authorization`. Chỉ nhận đường dẫn bắt đầu bằng
  `/api/` của API mình; URL tuyệt đối hay `//domain` bị từ chối trước khi gửi, nên token không đi
  tới bên thứ ba.
- 401: gọi `session.refresh()` một lần rồi gửi lại request. Refresh token hết hiệu lực (refresh
  nhận 401) thì xóa token, báo `expired`; `RequireAuth` chuyển về `/login?next=<trang đang mở>&expired=1`.
- 403: báo không đủ quyền, giữ token. Lỗi mạng, 500: báo lỗi kỹ thuật, không đăng xuất.
- Refresh chạy một lần tại một thời điểm trong tab (các request cùng gặp 401 chờ chung) và giữa
  các tab (`navigator.locks`), vì refresh token xoay vòng: hai tab gửi cùng một cookie cũ sẽ bị API
  coi là dùng lại. Access token được làm mới trước khi hết hạn 60 giây (hoặc 1/5 thời hạn nếu token
  sống ngắn hơn 5 phút, ví dụ token 60 giây được làm mới ở giây 48).
- Chỉ kết thúc phiên khi API trả 401 cho refresh token. Làm mới thất bại do mất mạng, 429 hay 5xx
  thì giữ phiên và thử lại sau 15 giây.
- Đăng xuất ở một tab báo cho các tab khác qua `BroadcastChannel`.
- Route guard `/admin/*` và việc ẩn nút chỉ là giao diện; API tự chặn bằng 401.

## 6. CORS và CSRF

- `Access-Control-Allow-Headers: Content-Type, Authorization`; origin lấy từ `CORS_ORIGIN`, bỏ
  qua `*`; `Access-Control-Allow-Credentials: true` (cookie `rt`). Preflight OPTIONS được trả lời
  trước bước kiểm tra token.
- Request CRUD dùng Bearer, không dùng cookie, nên không có CSRF. Chỉ `/refresh` và `/logout` dùng
  cookie; ở đó có: cookie `SameSite=Strict`, kiểm tra `Origin` (lạ → 403), POST bắt buộc
  `Content-Type: application/json` (form của trang khác không gửi được nếu không qua preflight).

## 7. Kiểm thử

| Lệnh | Kết quả |
| --- | --- |
| `cd api && npm test` | 87 PASS (có 16 test mới cho JWT, thời hạn token, 401, preflight, origin) |
| `cd web && npm test` | 43 PASS (có 21 test mới cho lớp gọi API và session) |
| `cd api && npm run acceptance:auth` | **85 PASS, 0 FAIL**: request trực tiếp theo ba bảng nghiệm thu Bài 1 và phần refresh token; chạy được với thời hạn 900 và 60 giây |
| `cd api && npm run acceptance` (API đang chạy) | Block 6–7: tất cả PASS (script đăng nhập bằng tài khoản seed) |
| `npm run acceptance` (gốc, SSR Block 8) | 126 PASS sau khi sửa đặt lại mật khẩu ở SSR |

`acceptance:auth` tự chạy API ở cổng 3998 với siteverify giả lập, đọc thư trong
`api/mail-outbox/`, đối chiếu DB (hash, `usedAt`, `attempts`, `tokenVersion`, `revokedAt`), chỉ tạo
user `@acceptance.test` và xóa bộ đếm rate limit.

### Đối chiếu bảng nghiệm thu của deck

| Kịch bản | Kết quả | Dòng trong `acceptance:auth` |
| --- | --- | --- |
| Chưa đăng nhập, gọi POST, PATCH, DELETE | 401 | `chưa đăng nhập POST/PATCH/DELETE /api/dishes -> 401` |
| Gọi API trực tiếp, bỏ qua giao diện | Cùng kết quả | Toàn bộ script gọi API trực tiếp |
| JWT bị sửa hoặc hết hạn | 401 | `JWT sửa payload`, `JWT alg none`, `JWT quá exp -> 401 TOKEN_EXPIRED` |
| Đổi role trong localStorage hoặc payload | Quyền không đổi | `JWT sửa payload (role: admin) -> 401`; localStorage không chứa role |
| Preflight với Authorization | OPTIONS 204, origin cụ thể | `preflight OPTIONS có authorization -> 204` |
| GET /api/dishes tìm kiếm, phân trang, không token | Như trước | `GET /api/dishes tìm kiếm + phân trang`, script Block 6–7 |
| Đăng ký với `role: admin` | Bản ghi role viewer | `register kèm role: admin -> role viewer` |
| Đăng ký thiếu hoặc sai CAPTCHA | Không tạo user, không gửi OTP | `register thiếu CAPTCHA`, `CAPTCHA sai`, `đã dùng`, `hostname khác` |
| OTP sai, hết hạn, đã dùng | `INVALID_OTP`, vẫn pending | ba dòng `OTP ...` |
| Tài khoản pending đăng nhập | Không có accessToken | `ACCOUNT_NOT_ACTIVATED, không có accessToken` |
| Sai tới ngưỡng, bỏ trường CAPTCHA | `CAPTCHA_REQUIRED` | `tới ngưỡng, bỏ trường CAPTCHA` |
| forgot email có và không có | Cùng nội dung và status | `forgot email có và không có` |
| Vượt giới hạn forgot | 429 | `vượt giới hạn forgot -> 429` |
| Mở /reset chưa gửi form | Token chưa bị tiêu thụ | `mở trang /reset: token chưa bị tiêu thụ` |
| Token cũ, hết hạn, đã dùng | `INVALID_RESET_TOKEN`, password không đổi | `token sai`, `token hết hạn`, `dùng lại token đã dùng` |
| Reset xong | Không có accessToken; đăng nhập bằng password mới; JWT cũ theo chính sách | `reset hợp lệ`, `JWT cấp trước reset -> 401`, `đăng nhập bằng password mới` |

## 8. Lỗi phát hiện khi làm

| Lỗi | Cách phát hiện | Sau khi sửa |
| --- | --- | --- |
| `prisma db push` sẽ xóa index trigram `dishes_name_trgm_idx` của Block 7 | Chạy `prisma migrate diff` trước khi đổi DB | Áp riêng phần thêm bằng `api/prisma/block9-auth.sql`; diff sau đó chỉ còn index trigram (do `search.sql` quản lý) |
| Trang "Về chúng tôi" nhận 401 sau khi khóa `/api/chefs` | Trang công khai gọi `chefsApi.list` | Thêm `GET /api/team`; ảnh chụp trang hiện đủ 5 đầu bếp khi chưa đăng nhập |
| Đặt lại mật khẩu ở SSR không làm mất hiệu lực JWT của SPA | Hai bản chung bảng users, SSR chỉ xóa session | SSR cũng tăng `tokenVersion` và thu hồi refresh token; nghiệm thu SSR 126 PASS |
| Token đặt lại mật khẩu có thể mất trong React StrictMode | Hàm khởi tạo state vừa đọc vừa xóa token khỏi URL, StrictMode gọi hai lần | Đọc token trong state, xóa khỏi URL trong effect |
| Script nghiệm thu Block 6–7 không còn chạy được CRUD | CRUD không token giờ trả 401 | Script đăng nhập bằng tài khoản seed và gắn Bearer |
| SPA đăng xuất người dùng khi mất mạng lúc tự làm mới token | Đọc lại `web/src/auth/session.js`: hẹn giờ gọi `expire()` với mọi kết quả không thành công, kể cả lỗi mạng | Chỉ kết thúc phiên khi refresh nhận 401; lỗi kỹ thuật thì giữ phiên, thử lại sau 15 giây. Test mới fail với code cũ, pass với code mới |
| Refresh token bị thu hồi nhưng giao diện không về `/login` | Cùng lần đọc: `clearLocal()` xóa token trước nên `expire()` không phát sự kiện `expired` | Tách trạng thái "đang đăng nhập" khỏi access token; refresh nhận 401 thì phát `expired`, `RequireAuth` chuyển về `/login?expired=1` |
| Token 60 giây bị làm mới mỗi 5 giây | Công thức hẹn giờ cũ là `expiresIn − 60` với tối thiểu 5 giây | Làm mới sớm `min(60 giây, 1/5 thời hạn)` |

## 9. Bằng chứng nộp

Với mỗi kịch bản: ảnh giao diện, tab Network (OPTIONS 204 rồi request có `Authorization`),
Application → Cookies (`rt` có HttpOnly, không có token trong Local Storage), request trực tiếp
(`api/requests-auth.http` hoặc output của `acceptance:auth`), bản ghi DB (`refresh_tokens`,
`activation_challenges`, `password_resets`, `users.tokenVersion`). Che access token, refresh token,
password, OTP và reset token trong ảnh. Chụp CAPTCHA bằng key thật, không dùng test key.

## 10. Giới hạn đã biết

- Đăng xuất một thiết bị không làm mất hiệu lực bản sao access token ở nơi khác trước `exp`
  (≤ 15 phút). Dùng "đăng xuất mọi nơi" nếu cần chặn ngay.
- XSS trong trang vẫn dùng được access token đang ở bộ nhớ và gọi được `/refresh` khi trang mở.
- `SameSite=Strict` dựa trên việc web và api cùng site (localhost khác cổng vẫn cùng site). Triển
  khai khác site cần `REFRESH_COOKIE_SAMESITE=none` và HTTPS.
- Mỗi request được bảo vệ tốn một truy vấn tải user (đổi lại role và `tokenVersion` luôn mới).
- Không có thời hạn nhàn rỗi: tab để mở vẫn tự làm mới token, nên vẫn đăng nhập tới hết 7 ngày kể từ
  lúc đăng nhập (bản SSR hết hạn sau 2 giờ không thao tác).
- Nếu response của `/refresh` bị mất giữa đường (cookie mới không tới browser), lần refresh sau gửi
  token cũ và bị coi là dùng lại: người dùng phải đăng nhập lại.
- `.env` hiện dùng test key reCAPTCHA của Google; phải thay key thật trước khi chụp bằng chứng.

## 11. Bài 2 — Phân quyền và MFA (bản SSR)

### Cài đặt

```bash
npm install                 # thêm otplib (TOTP), qrcode (vẽ QR ở server)
npm run db:block9-2         # prisma/block9-rbac-mfa.sql: thêm cột, bảng; chạy lại nhiều lần không lỗi
npm run db:seed-user        # 4 tài khoản: admin, viewer, editor đầu bếp A, editor đầu bếp B
```

`.env` cần thêm `MFA_ENC_KEY` (≥ 32 ký tự, khác `SESSION_SECRET`). Không chạy `prisma db push`
(xóa index trigram của Block 7). SSR và API dùng chung database nên SQL chỉ chạy một lần; lần chạy
đầu, mọi món đang có nhận `status = 'published'`, sau đó mặc định của món mới là `draft`.

Seed dùng chung `SEED_USER_PASSWORD`; email viewer / editor mặc định là `<tên>+viewer@...`,
`<tên>+editor-a@...`, `<tên>+editor-b@...` của `SEED_USER_EMAIL` (đặt riêng bằng
`SEED_VIEWER_EMAIL`, `SEED_EDITOR_A_EMAIL`, `SEED_EDITOR_B_EMAIL`). Đầu bếp A, B là Nguyễn Văn Minh
và Trần Quốc Huy; mỗi người có ít nhất hai món draft.

### Dữ liệu

| Bảng / cột | Ý nghĩa |
| --- | --- |
| `dishes.status` | `draft` | `published`; trang công khai (SSR và `GET /api/dishes`) chỉ hiện `published` |
| `users.chefId` | Đầu bếp mà Editor phụ trách; chỉ seed / DB gán, form không đổi được |
| `users.mfaEnabled`, `mfaSecret` | MFA đang bật; secret TOTP mã hóa AES-256-GCM bằng `MFA_ENC_KEY` |
| `users.mfaPendingSecret` | Secret mới chờ xác nhận mã (bật lần đầu hoặc thay thiết bị) |
| `users.mfaLastStep` | Bước 30 giây của mã TOTP đúng gần nhất, chống dùng lại mã |
| `recovery_codes` | `userId`, `codeHash` (HMAC), `usedAt`; 10 mã, hiện một lần |
| `mfa_challenges` | Trạng thái chờ MFA sau khi password đúng (cookie `mfa` 5 phút, tối đa 5 lần thử) |

### RBAC và ABAC

Mọi quyết định nằm ở `src/auth/policy.js`; route và view hỏi cùng một nơi.

| Role | Đọc | Tạo | Sửa | Xóa |
| --- | --- | --- | --- | --- |
| Viewer | ✓ | 403 | 403 | 403 |
| Editor | ✓ | ✓ (món: gán chefId của tài khoản, status draft) | ✓ (món: chỉ draft của đầu bếp mình) | 403 |
| Admin | ✓ | ✓ | ✓ (đổi được chefId, status) | ✓ |

- RBAC chạy cho mọi route `/admin/*` ở `app.js` (`requirePermission`): thao tác suy ra từ method
  và đường dẫn (`GET …/new` = tạo, `GET …/edit` = sửa, `GET …/delete` = xóa, `POST` = tạo,
  `PATCH` = sửa, `DELETE` = xóa). Route mới thêm vào cũng được bảo vệ mà không cần nhớ gắn.
- ABAC cho món (`src/routes/admin/dishes.js`): GET form sửa và PATCH đều kiểm tra. Ở PATCH, điều kiện
  `{ chefId, status: "draft" }` nằm trong WHERE của câu UPDATE (trong transaction cùng việc thay công
  thức), nên Admin đổi status giữa lúc Editor mở form và lúc gửi thì UPDATE không khớp dòng nào → 403.
- `chefId`, `status` trong body chỉ được đọc khi người gửi là Admin (`validateDish(..., { canAssign })`).
  Editor gửi `chefId` của đầu bếp khác hay `status=published` đều bị bỏ qua.
- Role và `chefId` đọc lại từ DB ở mỗi request (`loadSession`), đổi quyền có hiệu lực ngay.
- Editor chưa gắn đầu bếp: không thêm được món, không sửa được món nào.

### MFA

| Bước | Cách làm |
| --- | --- |
| Bật | `/account/security` → tạo secret chờ xác nhận → `/account/mfa/setup` hiện QR (vẽ ở server) và secret nhập tay → nhập đúng mã mới bật, hiện 10 mã khôi phục một lần. Trang có secret / mã gửi `Cache-Control: no-store` |
| Đăng nhập | Password đúng + MFA bật → tạo `mfa_challenges` + cookie `mfa`, chuyển `/login/mfa`, **chưa có session**. Mã TOTP hoặc mã khôi phục đúng mới gọi `createSession` (vẫn là chỗ duy nhất tạo session) |
| Giới hạn thử | 5 lần sai trong một lần chờ → hủy, phải đăng nhập lại; lượt thử được giữ trước khi kiểm tra mã nên request song song không vượt được. Thêm 10 lần / 15 phút theo tài khoản, 50 lần / 15 phút theo IP |
| Chống dùng lại | TOTP: UPDATE `mfaLastStep` có điều kiện "bước mới > bước cũ". Mã khôi phục: UPDATE `usedAt` có điều kiện `usedAt IS NULL` |
| Thay / tắt / tạo lại mã | Xác thực lại bằng password hiện tại + mã TOTP hoặc mã khôi phục (5 lần / 15 phút). Password sai thì không kiểm tra mã, nên không tiêu thụ mã khôi phục. Thay thiết bị: secret cũ dùng tới khi secret mới được xác nhận |
| Sau khi bật / thay / tắt | Hủy các session khác của tài khoản; khi bật / thay còn tăng `tokenVersion` và thu hồi refresh token |

Bản API (Bài 1) không có bước MFA: `POST /api/auth/login` trả `MFA_REQUIRED` cho tài khoản đã bật
MFA và `requireAuth` từ chối token của tài khoản đó, để SPA không thành đường vòng qua MFA.

### Kiểm thử

- `npm test`: thêm `test/policy.test.js` (bảng quyền, ABAC, `validateDish` bỏ qua chefId/status) và
  `test/mfa.test.js` (mã hóa secret, bước TOTP, mã khôi phục, QR).
- `npm run acceptance`: thêm hai phần "Block 9 Bài 2 — RBAC / ABAC" và "Block 9 Bài 2 — MFA". Script tự
  tạo tài khoản `@acceptance.test` có role, chefId và món có nhãn `[nghiệm thu Bài 2]`, xóa khi xong.
  Kịch bản đổi status giữa chừng: Editor mở form, Admin đăng món, Editor gửi → 403.

### Giới hạn của Bài 2

- ABAC chỉ cài trên bản SSR. Qua API, ghi món ăn chỉ dành cho Admin, và `GET /api/dishes` chỉ trả
  món đã đăng nên trang quản trị của SPA không thấy món draft.
- Đổi `MFA_ENC_KEY` làm mọi secret đã lưu không giải mã được: người dùng phải đăng nhập bằng mã khôi
  phục rồi bật lại MFA.
- Bật MFA xong mà đăng xuất ngay trong cùng 30 giây thì phải chờ mã kế tiếp (mã vừa dùng đã bị đánh dấu).
