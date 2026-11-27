# Photo Gallery (Block 11)

Ứng dụng gallery ảnh end-to-end: admin tải ảnh lên, server kiểm tra và xử lý ảnh, lưu file vào kho
(local filesystem hoặc S3-compatible: SeaweedFS, MinIO, Cloudflare R2, AWS S3), lưu metadata vào
PostgreSQL. Người xem duyệt ảnh trong lưới masonry, mở lightbox, xem trang chi tiết và tải bản gốc.

```
gallery/
├── server/   Express 5 + TypeScript + Prisma + sharp + AWS SDK v3   (cổng 4000)
└── web/      React 18 + Vite + Tailwind + yet-another-react-lightbox (cổng 5174 khi dev)
```

Ứng dụng độc lập với Lửa Hồng: package, schema DB (`?schema=gallery`) và tài khoản admin đều riêng.

## 1. Đối chiếu với đề Block 11

| Yêu cầu của đề | Cách làm | Ở đâu |
| --- | --- | --- |
| Gửi 1–5 ảnh và trường mô tả trong **một** request multipart | Trường file `photos`, trường text `title`/`altText`/`description` dùng chung hoặc `items` (JSON theo từng file), `albumId`, `tags` | `server/src/upload/multipart.ts`, `web/src/lib/upload.ts` |
| Response trả kết quả riêng cho từng file, gắn với index | `results[i].index`; 201 nếu nhận hết, 207 nếu nhận một phần, 422 nếu từ chối hết | `server/src/upload/service.ts` |
| Lỗi cấp request: không công bố ảnh nào | Quá 5 file → 400 `TOO_MANY_FILES`; tổng > 55 MiB → **413** (chặn ngay theo `Content-Length` hoặc khi đếm bytes vượt ngưỡng); dọn sạch file tạm | `multipart.ts` |
| Lỗi cấp file: chỉ từ chối file đó | > 10 MiB → `FILE_TOO_LARGE` (phần đã nhận bị xóa ngay); sai chữ ký → `UNSUPPORTED_TYPE`; > 40 triệu pixel → `TOO_MANY_PIXELS`; ảnh hỏng/thiếu bytes → `DECODE_FAILED` | `service.ts`, `images/` |
| Nhận dạng theo chữ ký, không theo đuôi/MIME | Magic bytes JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, rồi đối chiếu với định dạng sharp đọc từ header | `images/signature.ts`, `images/pipeline.ts` |
| Giới hạn pixel **trước** khi giải mã toàn bộ | Đọc header (`metadata()`), nhân bằng `BigInt`; khi giải mã vẫn đặt `limitInputPixels` | `images/pipeline.ts` |
| Xoay theo EXIF rồi bỏ EXIF/GPS | `.rotate()` (tự xoay theo EXIF Orientation) rồi xuất file không kèm metadata | `normalizeImage()` |
| Tối đa 3 variant WebP 320/960/1600, không phóng lớn, không trùng chiều rộng | Ảnh 800px → 320, 800; ảnh 300px → 300. Lưu kích thước thực tế | `planVariants()`, `generateVariants()` |
| DB tách khỏi file, lưu storage key (không đường dẫn tuyệt đối, không URL, không credential) | `Photo` + `PhotoVariant` (width, height, mime, bytes, `storage_key`). URL dựng lúc trả response | `server/prisma/schema.prisma`, `photos/serialize.ts` |
| Ghi đủ file **rồi** mới ghi metadata trong transaction; công bố khi commit | Kiểm tra → tạo `photoId` → sinh variant → ghi mọi file → `$transaction` tạo Photo + PhotoVariant | `upload/service.ts` |
| Bù trừ khi lỗi | Ghi file lỗi → xóa các file đã ghi; DB lỗi → xóa file vừa ghi; xóa bù cũng lỗi → lưu key vào bảng `storage_cleanups` (DB cũng lỗi → journal trên đĩa) để dọn lại | `photos/cleanup.ts` |
| Xóa ảnh: ẩn → dọn file → xóa metadata | `DELETING` (gallery và `/media` ngừng phục vụ ngay) → xóa mọi variant + bản gốc → xóa bản ghi. Dọn lỗi thì giữ `DELETING` cùng danh sách key, trả 202 | `routes/admin.ts`, `cleanup.ts` |
| Local filesystem giữ file sau restart | `LOCAL_STORAGE_ROOT` là đường dẫn tuyệt đối ngoài source code; ghi file tạm rồi rename | `storage/local.ts` |
| Media đúng `Content-Type` và `Cache-Control` | Ảnh công khai: `public, max-age=31536000, immutable` (key chứa version nên URL không đổi nội dung). Ảnh ẩn: `private, no-store`, chỉ admin xem | `routes/media.ts` |
| Gallery responsive: `srcset`, `sizes`, `width`, `height`, `loading`, `alt` | `sizes` tính theo đúng bề rộng ô masonry nên desktop tải 320px, mobile DPR 2 tải 960px; ảnh đầu tiên `fetchpriority="high"`, ảnh dưới màn hình `loading="lazy"` | `web/src/components/BlurImage.tsx`, `Masonry.tsx` |
| Trang chi tiết và thao tác xóa | `/photos/:id`: ảnh lớn, thông số, bảng variant, tải bản gốc; admin sửa/ẩn/xóa | `web/src/pages/PhotoPage.tsx` |
| SeaweedFS / MinIO (tùy chọn) | Một adapter S3 cho SeaweedFS, MinIO, R2, AWS S3; chọn bằng `.env` lúc khởi động | `storage/s3.ts` |

### Thêm từ master prompt (không mâu thuẫn với đề)

- Đăng nhập admin (`/login`, JWT trong cookie HttpOnly SameSite=Strict, bcrypt, giới hạn 10 lần sai / 15 phút), không có đăng ký công khai.
- Lưới masonry theo tỉ lệ thật, blur-up placeholder (ảnh WebP 16px dạng data URL), cuộn vô hạn, lọc album/tag, tìm theo tiêu đề.
- Lightbox: phím mũi tên, vuốt, zoom, bảng thông số (kích thước gốc, dung lượng từng variant, % tiết kiệm, ngày đăng), nút tải ảnh gốc.
- Admin: kéo thả nhiều ảnh, hàng đợi tự chia thành các request ≤ 5 ảnh, thanh tiến trình theo bước (tải lên → kiểm tra → tạo WebP → ghi vào kho → lưu metadata → hoàn tất), thống kê tiết kiệm dung lượng; quản lý ảnh, album; tab Lưu trữ & CDN có một thẻ cho mỗi kho, nút **Kiểm tra kết nối** riêng (ghi → đọc → đọc qua URL công khai → xóa object thử); ô **Lưu lên kho / CDN** khi upload chọn kho cho cả lượt.

### Chỗ khác master prompt và lý do

| Master prompt | Bản này | Lý do |
| --- | --- | --- |
| Variant 400/1200/2048 | 320/960/1600 (đổi được bằng `VARIANTS`) | Theo đề |
| Nhận TIFF/WEBP/RAW, giữ EXIF bản gốc, cho tải bản gốc có EXIF | Chỉ JPEG/PNG; “bản gốc” để tải là bản đã **chuẩn hóa** (đúng hướng, không EXIF/GPS) | Đề yêu cầu file công khai không còn GPS |
| Nhập cấu hình S3 trong Admin, lưu secret (AES-256-GCM) vào DB, đổi kho không restart | Cấu hình trong `.env`, chọn lúc khởi động; Admin chỉ xem cấu hình (đã che secret) và kiểm tra kết nối | Đề: “DB không giữ thông tin xác thực kết nối S3”, “ứng dụng chọn nơi lưu khi khởi động”; tự đổi kho dễ làm file nằm rải ở hai nơi |
| Lưu `raw_url`, `thumb_url`... | Lưu storage key, dựng URL khi trả response | Đề: DB không lưu URL/đường dẫn; đổi CDN không phải sửa dữ liệu |
| Mỗi file một request | 1–5 file một request, kết quả theo index | Theo đề |

## 2. Chạy thử

Cần Node.js ≥ 20.12 (đã thử với Node 26) và PostgreSQL.

```bash
# Server
cd gallery/server
npm install
cp .env.example .env        # điền DATABASE_URL, DIRECT_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, LOCAL_STORAGE_ROOT
npm run db:migrate          # tạo schema "gallery" và các bảng (prisma migrate deploy)
npm run dev                 # http://localhost:4000 ; tạo admin từ .env nếu DB chưa có user

# Web (terminal khác)
cd gallery/web
npm install
npm run dev                 # http://localhost:5174 (proxy /api và /media sang :4000)
```

Bản production: điền key vào `server/.env.production` (đã gitignore; `JWT_SECRET` sinh sẵn), rồi:

```bash
cd gallery/web && npm ci && npm run build            # SPA -> web/dist
cd ../server && npm ci && npm run build              # TypeScript -> server/dist
npm run db:migrate:prod                              # tạo/cập nhật bảng
npm run db:seed:prod                                 # tạo admin từ ADMIN_EMAIL / ADMIN_PASSWORD
npm run storage:check:prod                           # thử ghi-đọc-xóa trên từng kho
npm run start:prod                                   # chạy server
```

Các script `:prod` nạp `.env.production` bằng `node --env-file`. Server phục vụ luôn `web/dist`
cùng origin với API, nên cookie SameSite=Strict hoạt động mà không cần CORS. Đặt HTTPS (nginx/Caddy)
phía trước và cho body tới 56 MB (`client_max_body_size 56m;` với nginx).

Supabase: `DATABASE_URL` dùng pooler Transaction (cổng 6543) kèm `&pgbouncer=true&schema=gallery`;
`DIRECT_URL` dùng Session/Direct (cổng 5432) kèm `?schema=gallery` để chạy migrate.

| Lệnh (trong `server/`) | Việc |
| --- | --- |
| `npm test` | 36 unit test: chữ ký file, giới hạn pixel, EXIF, variant, multipart (413, quá số file, file quá lớn), storage local, config |
| `npm run fixtures` | Sinh dữ liệu kiểm thử vào `fixtures/` |
| `npm run acceptance` | Nghiệm thu đầu cuối (61 kiểm tra), ghi `acceptance-out/report.md` |
| `npm run db:report` | In Photo, PhotoVariant, storage key và đối chiếu với file thật trong kho |
| `npm run storage:check` | Kiểm tra kết nối mọi kho (`--storage <tên>` để chọn một kho) |
| `npm run cleanup` | Chạy dọn file một lần |
| `npm run db:seed` | Tạo/đặt lại mật khẩu admin từ `.env` |

## 3. Cấu hình kho lưu trữ (nhiều kho, admin chọn khi upload)

Khai báo nhiều kho trong `.env`; admin chọn kho cho từng lượt tải trong tab **Tải ảnh lên**. Mỗi ảnh
ghi tên kho của nó trong DB (cột `photos.storage`), nên hiển thị, tải bản gốc và xóa luôn đi đúng
kho. Không có cơ chế tự chuyển kho khi lỗi.

```env
STORAGE_PROFILES=r2,seaweedfs     # tên kho; mỗi kho khai báo bằng các biến <TÊN>_...
STORAGE_DEFAULT=r2                # kho dùng khi upload không chọn
```

```
photos/<photoId>/original.jpg|png     bản gốc đã chuẩn hóa (tải về; không phục vụ qua /media)
photos/<photoId>/v1/320.webp          variant (v2, v3... dành cho phần chỉnh sửa ảnh)
photos/<photoId>/v1/960.webp
photos/<photoId>/v1/1600.webp
```

Bộ key giống nhau ở mọi kho, nên chuyển ảnh giữa hai kho chỉ là chép nguyên thư mục `photos/` rồi đổi
cột `storage` của ảnh (`UPDATE "photos" SET "storage" = r2 WHERE "storage" = local`).

### Cloudflare R2

```env
R2_DRIVER=s3
R2_PROVIDER=r2
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com   # API dùng ghi/xóa
R2_REGION=auto
R2_BUCKET=gallery
R2_ACCESS_KEY_ID=...                                       # R2 API token quyền Object Read & Write
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_BASE_URL=https://cdn.example.com                 # browser tải ảnh thẳng từ domain này
R2_DOWNLOAD_MODE=presigned                                 # proxy | presigned
```

`r2.dev` là domain thử nghiệm, Cloudflare giới hạn tốc độ; khi chạy thật nên gắn custom domain.

### SeaweedFS trên VPS khác

```env
SEAWEEDFS_DRIVER=s3
SEAWEEDFS_PROVIDER=seaweedfs
SEAWEEDFS_ENDPOINT=https://cdn.example.com   # API S3 dùng ghi/xóa (hoặc http://10.0.0.5:8333 nội bộ)
SEAWEEDFS_REGION=us-east-1
SEAWEEDFS_BUCKET=cdn
SEAWEEDFS_ACCESS_KEY_ID=...
SEAWEEDFS_SECRET_ACCESS_KEY=...
SEAWEEDFS_FORCE_PATH_STYLE=true              # https://host/<bucket>/<key>, không dùng subdomain
SEAWEEDFS_PUBLIC_BASE_URL=https://cdn.example.com/cdn   # URL công khai của bucket
SEAWEEDFS_DOWNLOAD_MODE=presigned
```

Tạo bucket và cấp quyền (file `-s3.config` của SeaweedFS). Tài khoản của ứng dụng cần
Read/Write/List trên bucket; chỉ thêm identity `anonymous` khi bucket cho đọc công khai:

```json
{
  "identities": [
    {
      "name": "gallery-app",
      "credentials": [{ "accessKey": "GALLERY_KEY", "secretKey": "GALLERY_SECRET" }],
      "actions": ["Read:gallery", "Write:gallery", "List:gallery"]
    },
    { "name": "anonymous", "actions": ["Read:gallery"] }
  ]
}
```

Hai lỗi thường gặp của SeaweedFS sau nginx:

- **HEAD trả 403 qua domain**: nginx (BT Panel) bật `proxy_cache` chạy HEAD thành GET làm sai chữ ký
  SigV4. Ứng dụng không dùng HEAD: kiểm tra object bằng `ListObjectsV2`. Sửa hẳn thì thêm
  `proxy_cache off;` cho vhost, reload nginx.
- **Cloudflare chặn User-Agent lập trình (lỗi 1010)**: bước "Kiểm tra kết nối" và script nghiệm thu gửi
  User-Agent giống trình duyệt. Nếu vẫn bị chặn, tạo WAF rule hoặc dùng Cloudflare Service Token.

### AWS S3 (+ CloudFront), MinIO, ổ đĩa

```env
AWS_DRIVER=s3
AWS_PROVIDER=aws
AWS_REGION=ap-southeast-1
AWS_BUCKET=gallery-photos
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_PUBLIC_BASE_URL=https://dxxxxxxxx.cloudfront.net

LOCAL_DRIVER=local
LOCAL_ROOT=/srv/gallery-uploads              # tuyệt đối, ngoài source code; Docker: một volume
```

Muốn một kho phục vụ qua web server (bucket private) thì bỏ `<TÊN>_PUBLIC_BASE_URL`: ảnh đi qua
`/media`, và ảnh đang ẩn chỉ admin xem được. `MEDIA_BASE_URL` đổi được khi đặt CDN trước web server.

Ghi chú chung:

- Adapter đặt `requestChecksumCalculation: "WHEN_REQUIRED"`: AWS SDK v3 mặc định gửi checksum CRC32
  cho mọi PutObject và một số bản SeaweedFS/MinIO cũ từ chối header này.
- Xóa từng object bằng `DeleteObject` (idempotent) thay vì `DeleteObjects`, vì `DeleteObjects` bắt
  buộc header checksum mà các kho tương thích hỗ trợ không đồng đều.
- Object variant ghi kèm `Content-Type: image/webp` và `Cache-Control: public, max-age=31536000, immutable`,
  nên đi thẳng qua bucket/CDN vẫn đúng header.
- `presigned`: nút tải bản gốc chuyển hướng tới URL có chữ ký hạn 5 phút; endpoint phải truy cập được
  từ browser, endpoint chỉ có trong mạng nội bộ thì dùng `proxy`.

### CORS trên bucket

Giao diện hiện tại **không cần CORS**: thẻ `<img>` không có `crossorigin`, tải bản gốc là điều hướng
trang, và upload đi qua server để kiểm tra trước khi công bố. Chỉ cần CORS khi đọc ảnh bằng
JavaScript hoặc canvas (ví dụ phần xem trước khi chỉnh sửa ảnh), hoặc khi đổi sang upload thẳng từ
browser lên bucket. Khi đó chỉ mở GET/HEAD cho đúng origin của site:

AWS S3 (`aws s3api put-bucket-cors --bucket gallery-photos --cors-configuration file://cors.json`):

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://gallery.example.com"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length"],
      "MaxAgeSeconds": 86400
    }
  ]
}
```

Cloudflare R2 (Dashboard → R2 → bucket → Settings → CORS Policy):

```json
[
  {
    "AllowedOrigins": ["https://gallery.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 86400
  }
]
```

SeaweedFS: S3 gateway có cờ `-allowedOrigins` (danh sách origin, phân tách bằng dấu phẩy) cho header
CORS ở cấp gateway; các bản mới còn hỗ trợ `PutBucketCors` nên dùng được cùng lệnh `aws s3api
put-bucket-cors --endpoint-url http://10.0.0.5:8333 ...` như trên. Kiểm tra bằng `weed version` và
tài liệu của đúng phiên bản. Nếu đặt nginx/Caddy làm CDN trước gateway, có thể thêm header
`Access-Control-Allow-Origin` ở đó.

## 4. API

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/api/photos?q=&album=&tag=&cursor=&limit=` | Công khai | Ảnh công khai, phân trang theo con trỏ |
| GET | `/api/photos/:id` | Công khai (ảnh ẩn: admin) | Chi tiết ảnh kèm URL variant |
| GET | `/api/photos/:id/download` | Công khai (ảnh ẩn: admin) | Bản gốc chuẩn hóa, `Content-Disposition: attachment` |
| GET | `/api/albums`, `/api/tags` | Công khai | Album có ảnh công khai, tag kèm số ảnh |
| GET | `/media/<storage key>` | Công khai (ảnh ẩn: admin) | Variant WebP |
| POST | `/api/auth/login`, `/api/auth/logout`; GET `/api/auth/me` | | Phiên admin |
| POST | `/api/admin/photos` | Admin | Upload multipart; `Accept: application/x-ndjson` để nhận tiến trình theo dòng |
| GET/PATCH/DELETE | `/api/admin/photos[/:id]` | Admin | Thư viện, sửa (tiêu đề, alt, mô tả, album, tag, ẩn/hiện), xóa |
| GET/POST/PATCH/DELETE | `/api/admin/albums[/:id]` | Admin | Album |
| GET | `/api/admin/overview`, `/api/admin/upload-limits` | Admin | Các kho (đã che secret), giới hạn, thống kê |
| POST | `/api/admin/storage/test?storage=<tên>`, `/api/admin/cleanup` | Admin | Kiểm tra kết nối một kho, chạy dọn file |

Request ghi (POST/PATCH/DELETE) phải có header `X-Requested-With: XMLHttpRequest` và cùng origin
(lớp chống CSRF thứ hai bên cạnh cookie SameSite=Strict).

Ví dụ upload bằng curl (sau khi đăng nhập, cookie lưu trong `jar.txt`):

```bash
curl -c jar.txt -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" \
     -d '{"email":"admin@example.com","password":"..."}' http://localhost:4000/api/auth/login
curl -b jar.txt -H "X-Requested-With: XMLHttpRequest" \
     -F title="Bờ biển" -F altText="Bãi biển lúc chiều" \
     -F photos=@fixtures/01-landscape.jpg -F photos=@fixtures/05-text-renamed.jpg \
     http://localhost:4000/api/admin/photos
```

```jsonc
// HTTP 207: file 0 được nhận, file 1 bị từ chối
{
  "summary": { "received": 2, "accepted": 1, "rejected": 1 },
  "results": [
    { "index": 0, "filename": "01-landscape.jpg", "ok": true, "photo": { "id": "…", "variants": [ /* 320, 960, 1600 */ ] } },
    { "index": 1, "filename": "05-text-renamed.jpg", "ok": false,
      "error": { "code": "UNSUPPORTED_TYPE", "message": "Chỉ nhận ảnh JPEG hoặc PNG (kiểm tra theo chữ ký file, không theo đuôi file)" } }
  ]
}
```

## 5. Nghiệm thu và bằng chứng

`npm run acceptance` tự khởi động server (cổng 4100), chạy toàn bộ kịch bản qua HTTP thật, rồi đối
chiếu response với DB và kho file. Nó khởi động lại server với `FAULT_INJECTION` để giả lập lỗi.
Kết quả cùng các JSON làm bằng chứng nằm trong `acceptance-out/report.md`. Đã chạy: 67/67 (1 mục bỏ
qua) với cấu hình hai kho — mặc định Cloudflare R2 (ảnh và bản gốc qua presigned URL) và
SeaweedFS trên VPS (upload, hiển thị, tải bản gốc, xóa đều đi đúng kho). Mục "ảnh ẩn bị chặn ở
`/media`" được đánh dấu bỏ qua vì cả hai kho đều cho tải thẳng từ CDN công khai (xem mục 6). Chạy với `.env.production`:
`node --env-file=.env.production --import tsx scripts/acceptance.ts --clean` (cần `ADMIN_EMAIL`,
`ADMIN_PASSWORD` trong file hoặc biến môi trường).

| Bằng chứng đề yêu cầu | Lấy từ |
| --- | --- |
| Network của multipart, response từng file, GET media | DevTools → Network khi upload ở `/admin/upload` (request `photos` có Content-Type `multipart/form-data; boundary=…`); click một ảnh `/media/...` để xem `Content-Type` và `Cache-Control` |
| Photo, PhotoVariant và danh sách key | `npm run db:report` (bảng Photo, PhotoVariant, cột `in_storage`, file mồ côi) |
| File giả, file thiếu bytes, ảnh vượt giới hạn | Upload các file trong `fixtures/` (05–09) cùng một ảnh hợp lệ; hoặc mục tương ứng trong `report.md` |
| Sau restart và sau khi dọn file do lỗi lưu | Mục "Khởi động lại web server", "DB lỗi sau khi ghi file", "Chạy lại tác vụ dọn" trong `report.md` |
| DOM có `srcset`, `sizes`, `width`, `height`, `loading`, `alt`; Network tải variant phù hợp | DevTools → Elements trên trang chủ; Console: `$$('main img').map(i => i.currentSrc)` |
| Cấu hình mẫu không chứa thông tin xác thực thật | `server/.env.example` |

Giả lập lỗi bằng tay (bị bỏ qua khi `NODE_ENV=production`):

```bash
FAULT_INJECTION=db-commit npm run dev                 # DB lỗi sau khi ghi file -> file vừa ghi bị xóa
FAULT_INJECTION=db-commit,cleanup-delete npm run dev  # xóa bù cũng lỗi -> key vào storage_cleanups
npm run dev && npm run cleanup                        # chạy lại khi kho bình thường -> dọn sạch
```

## 6. Giới hạn đã biết

- Dùng `S3_PUBLIC_BASE_URL` (browser tải thẳng từ bucket/CDN): ẩn ảnh không chặn được URL đã biết,
  vì bucket công khai không biết trạng thái ảnh. Cần chặn ngay thì bỏ trống biến này để mọi ảnh đi
  qua `/media` của web server.
- Xóa ảnh ở origin không xóa bản đã nằm trong cache của browser/CDN (`max-age` 1 năm). Phải purge
  CDN nếu cần gỡ ngay.
- Chỉ nhận JPEG và PNG theo đề (không HEIC/RAW).
- Phần bonus (crop, xoay, lật, khôi phục, version) chưa làm. Schema đã có `currentVersion`,
  `PhotoVariant.version` và `originalKey` (bản gốc chuẩn hóa) để làm tiếp mà không phải migrate lại.
