# Photo Gallery (Block 11)

Ứng dụng gallery ảnh end-to-end: admin tải ảnh lên, server kiểm tra và xử lý ảnh, lưu file vào kho
(local filesystem hoặc S3-compatible: SeaweedFS, MinIO, Cloudflare R2, AWS S3), lưu metadata vào
PostgreSQL. Người xem duyệt ảnh trong lưới masonry, mở lightbox, xem trang chi tiết và tải bản gốc.
Admin chỉnh sửa ảnh (cắt, xoay, lật, khôi phục); mỗi lần lưu tạo một version mới.

```
gallery/
├── server/   Express 5 + TypeScript + Prisma 6 + sharp + AWS SDK v3   (cổng 4000)
└── web/      React 18 + Vite + Tailwind + yet-another-react-lightbox (cổng 5174 khi dev)
```

Ứng dụng độc lập với Lửa Hồng: package, schema DB (`?schema=gallery`) và tài khoản admin đều riêng.

## 1. Thông tin nhóm

| STT | Họ và tên | MSSV |
| --- | --- | --- |
| 1 | Nguyễn Tấn Hiệu | 24127373 |
| 2 | La Anh Hào | 24127361 |
| 3 | Trần Nguyễn Tuấn Minh | 24127084 |
| 4 | Nguyễn Anh Khôi | 24127430 |

## 2. Đối chiếu với đề Block 11

| Yêu cầu của đề | Cách làm | Ở đâu |
| --- | --- | --- |
| Gửi 1–5 ảnh và trường mô tả trong **một** request multipart | Trường file `photos`, trường text `title`/`altText`/`description` dùng chung hoặc `items` (JSON theo từng file), `albumId`, `tags`, `storage` (kho lưu) | `server/src/upload/multipart.ts`, `web/src/lib/upload.ts` |
| Response trả kết quả riêng cho từng file, gắn với index | `results[i].index`; 201 nếu nhận hết, 207 nếu nhận một phần, 422 nếu từ chối hết | `server/src/upload/service.ts` |
| Lỗi cấp request: không công bố ảnh nào | Quá 5 file → 400 `TOO_MANY_FILES`; tổng > 55 MiB → **413** (chặn ngay theo `Content-Length` hoặc khi đếm bytes vượt ngưỡng); không phải multipart → 415. Ảnh chỉ nằm trong RAM, không ghi file tạm ra đĩa, nên không có gì phải dọn | `multipart.ts` |
| Lỗi cấp file: chỉ từ chối file đó | > 10 MiB → `FILE_TOO_LARGE` (phần đã nhận bị bỏ khỏi bộ nhớ ngay); file rỗng → `EMPTY_FILE`; sai chữ ký → `UNSUPPORTED_TYPE`; > 40 triệu pixel → `TOO_MANY_PIXELS`; ảnh hỏng/thiếu bytes → `DECODE_FAILED` | `service.ts`, `images/` |
| Nhận dạng theo chữ ký, không theo đuôi/MIME | Magic bytes JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, rồi đối chiếu với định dạng sharp đọc từ header | `images/signature.ts`, `images/pipeline.ts` |
| Giới hạn pixel **trước** khi giải mã toàn bộ | Đọc header (`metadata()`), nhân bằng `BigInt`; khi giải mã vẫn đặt `limitInputPixels` | `images/pipeline.ts` |
| Xoay theo EXIF rồi bỏ EXIF/GPS | `.rotate()` (tự xoay theo EXIF Orientation) rồi xuất file không kèm metadata | `normalizeImage()` |
| Tối đa 3 variant WebP 320/960/1600, không phóng lớn, không trùng chiều rộng | Ảnh 800px → 320, 800; ảnh 300px → 300. Lưu kích thước thực tế | `planVariants()`, `generateVariants()` |
| DB tách khỏi file, lưu storage key (không đường dẫn tuyệt đối, không URL, không credential) | `Photo` + `PhotoVariant` (width, height, mime, bytes, `storage_key`) + tên kho (`photos.storage`). URL dựng lúc trả response | `server/prisma/schema.prisma`, `photos/serialize.ts` |
| Ghi đủ file **rồi** mới ghi metadata trong transaction; công bố khi commit | Kiểm tra → chuẩn hóa, sinh variant → tạo `photoId` → ghi mọi file → `$transaction` tạo Photo + PhotoVariant + PhotoVersion | `upload/service.ts` |
| Bù trừ khi lỗi | Ghi file lỗi → xóa mọi key đã thử ghi; DB lỗi → xóa file vừa ghi; xóa bù cũng lỗi → lưu (kho, key) vào bảng `storage_cleanups` (DB cũng lỗi → journal trên đĩa) để dọn lại | `photos/cleanup.ts` |
| Xóa ảnh: ẩn → dọn file → xóa metadata | `DELETING` (gallery và `/media` ngừng phục vụ ngay) → xóa mọi variant (mọi version còn giữ) + bản gốc → xóa bản ghi. Dọn lỗi thì giữ `DELETING` cùng danh sách key, trả 202 | `routes/admin.ts`, `cleanup.ts` |
| Local filesystem giữ file sau restart | Kho `driver=local` với `<TÊN>_ROOT` là đường dẫn tuyệt đối ngoài source code (server cảnh báo nếu nằm trong repo); ghi file tạm rồi rename | `storage/local.ts` |
| Media đúng `Content-Type` và `Cache-Control` | Ảnh công khai: `public, max-age=31536000, immutable` (key chứa version nên URL không đổi nội dung). Ảnh ẩn: `private, no-store`, chỉ admin xem | `routes/media.ts` |
| Gallery responsive: `srcset`, `sizes`, `width`, `height`, `loading`, `alt` | `sizes` tính theo đúng bề rộng ô masonry nên desktop tải 320px, mobile DPR 2 tải 960px; ảnh đầu tiên `fetchpriority="high"`, hàng đầu tải ngay, ảnh còn lại `loading="lazy"` | `web/src/components/BlurImage.tsx`, `Masonry.tsx` |
| Trang chi tiết và thao tác xóa | `/photos/:id`: ảnh lớn, thông số, bảng variant, tải bản gốc; admin sửa thông tin, chỉnh sửa ảnh, ẩn/hiện, xóa | `web/src/pages/PhotoPage.tsx` |
| SeaweedFS / MinIO (tùy chọn) | Một adapter S3 cho SeaweedFS, MinIO, R2, AWS S3. Khai báo nhiều kho trong `.env` lúc khởi động, admin chọn kho khi upload | `storage/s3.ts`, `storage/index.ts` |

### Bonus: chỉnh sửa ảnh và version (đã làm)

| Yêu cầu bonus | Cách làm | Ở đâu |
| --- | --- | --- |
| Cắt, xoay 0/90/180/270, lật ngang, khôi phục | `POST /api/admin/photos/:id/edit`. Vùng cắt tính theo pixel của bản gốc; thứ tự áp dụng: cắt → xoay → lật. Khôi phục = version mới không có thông số chỉnh sửa | `server/src/photos/edit.ts`, `images/edit.ts` |
| Luôn tính từ bản gốc, không chồng lên version trước | Mỗi lần lưu đọc `original.jpg\|png` (bản đã chuẩn hóa), áp thông số rồi sinh lại variant; chất lượng không giảm dần sau nhiều lần sửa | `renderEdit()` |
| Version mới không ghi đè file cũ | Variant ghi dưới `photos/<id>/v<n>/`; file của version cũ vẫn phục vụ được vì browser/CDN có thể còn cache URL cũ | `storage/keys.ts` |
| Đổi version an toàn khi lưu đồng thời | Số version cấp bằng tăng nguyên tử `version_seq`; ghi đủ file rồi mới chạy transaction đổi `current_version` **có điều kiện** `current_version = baseVersion`. Bên thua nhận 409 `VERSION_CONFLICT`, file của nó bị xóa bù | `photos/edit.ts` |
| Dọn version cũ sau thời hạn | File variant của version bị thay thế được giữ `VERSION_RETENTION_HOURS` (mặc định **24 giờ**), sau đó tác vụ dọn xóa file và PhotoVariant, giữ bản ghi PhotoVersion làm lịch sử (`files_cleaned_at`) | `photos/cleanup.ts` |
| Giao diện | Nút **Chỉnh sửa ảnh** ở trang chi tiết: xem trước bằng canvas, kéo chọn vùng cắt (8 tay nắm, kéo để di chuyển, phím mũi tên), xoay trái/phải, lật ngang, bỏ vùng cắt, hoàn tác, khôi phục bản gốc | `web/src/components/ImageEditorDialog.tsx`, `web/src/lib/editGeometry.ts` |

Chi tiết ở mục 5.

### Thêm từ master prompt (không mâu thuẫn với đề)

- Đăng nhập admin (`/login`, JWT trong cookie HttpOnly SameSite=Strict, bcrypt, giới hạn 10 lần sai / 15 phút / IP), không có đăng ký công khai.
- Lưới masonry theo tỉ lệ thật, blur-up placeholder (ảnh WebP 16px dạng data URL), cuộn vô hạn, lọc album/tag, tìm theo tiêu đề.
- Lightbox: phím mũi tên, vuốt, zoom, bảng thông số (kích thước gốc và kích thước đang hiển thị nếu đã chỉnh sửa, dung lượng file tải lên, dung lượng từng variant, % tiết kiệm, ngày đăng), nút tải ảnh gốc.
- Admin: kéo thả nhiều ảnh, hàng đợi tự chia thành các request ≤ 5 ảnh và ≤ 55 MiB, thanh tiến trình theo bước (tải lên → kiểm tra → tạo WebP → ghi vào kho → lưu metadata → hoàn tất), thống kê tiết kiệm dung lượng; quản lý ảnh, album; tab Lưu trữ & CDN có một thẻ cho mỗi kho, nút **Kiểm tra kết nối** riêng (ghi → đọc → đọc qua URL công khai → xóa object thử), mục **Dọn file** (key chờ dọn, ảnh đang xóa, version cũ còn giữ file); ô **Lưu lên kho / CDN** khi upload chọn kho cho cả lượt.

### Chỗ khác master prompt và lý do

| Master prompt | Bản này | Lý do |
| --- | --- | --- |
| Variant 400/1200/2048 | 320/960/1600 (đổi được bằng `VARIANTS`) | Theo đề |
| Nhận TIFF/WEBP/RAW, giữ EXIF bản gốc, cho tải bản gốc có EXIF | Chỉ JPEG/PNG; “bản gốc” để tải là bản đã **chuẩn hóa** (đúng hướng, không EXIF/GPS) | Đề yêu cầu file công khai không còn GPS |
| Nhập cấu hình S3 trong Admin, lưu secret (AES-256-GCM) vào DB, đổi kho không restart | Các kho khai báo trong `.env`, nạp lúc khởi động; admin chọn kho khi upload, Admin chỉ xem cấu hình (đã che secret) và kiểm tra kết nối | Đề: “DB không giữ thông tin xác thực kết nối S3”, “ứng dụng chọn nơi lưu khi khởi động”; không tự chuyển kho khi lỗi để file không nằm rải ở hai nơi |
| Lưu `raw_url`, `thumb_url`... | Lưu storage key và tên kho, dựng URL khi trả response | Đề: DB không lưu URL/đường dẫn; đổi CDN không phải sửa dữ liệu |
| Mỗi file một request | 1–5 file một request, kết quả theo index | Theo đề |

## 3. Chạy thử

Cần Node.js ≥ 20.12 (đã chạy với Node 24) và PostgreSQL.

```bash
# Server
cd gallery/server
npm install
cp .env.example .env        # điền DATABASE_URL, DIRECT_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD và các kho (mục 4)
npm run db:local            # (tùy chọn) PostgreSQL cục bộ, xem bên dưới; để terminal này chạy
npm run db:migrate          # tạo schema "gallery" và các bảng (prisma migrate deploy)
npm run dev                 # http://localhost:4000 ; tạo admin từ .env nếu DB chưa có user

# Web (terminal khác)
cd gallery/web
npm install
npm run dev                 # http://localhost:5174 (proxy /api và /media sang :4000)
```

Chưa có PostgreSQL: `npm run db:local` chạy PostgreSQL nhúng (gói `embedded-postgres`, không cần cài
gì thêm) ở cổng 55432, user/password `gallery`/`gallery`, database `gallery`. Dữ liệu nằm cố định ở
`D:\gallery-data\postgres` (Windows) hoặc `~/gallery-data/postgres`; đổi bằng `DB_LOCAL_DIR`,
`DB_LOCAL_PORT`. Khi đó:
`DATABASE_URL=DIRECT_URL=postgresql://gallery:gallery@localhost:55432/gallery?schema=gallery`.
Tắt bằng Ctrl+C hoặc `npm run db:local -- --stop`.

Sau khi pull bản có migration mới (ví dụ `20261128000000_photo_versions` của phần chỉnh sửa ảnh),
chạy lại `npm run db:migrate` (hoặc `db:migrate:prod`). Migration tự tạo PhotoVersion v1 cho ảnh cũ.

Bản production: điền key vào `server/.env.production` (đã gitignore), rồi:

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
phía trước và cho body tới 56 MB (`client_max_body_size 56m;` với nginx). Mở bằng
`http://localhost:4000` khi chạy trên máy: browser chấp nhận cookie `Secure` trên `localhost` nhưng
không chấp nhận trên `http://<IP>`.

Supabase: `DATABASE_URL` dùng pooler Transaction (cổng 6543) kèm `&pgbouncer=true&schema=gallery`;
`DIRECT_URL` dùng Session/Direct (cổng 5432) kèm `?schema=gallery` để chạy migrate.

| Lệnh (trong `server/`) | Việc |
| --- | --- |
| `npm test` | 65 unit test: chữ ký file, giới hạn pixel, EXIF, variant, multipart (413, quá số file, file quá lớn), storage local, config, chỉnh sửa ảnh (16 tổ hợp cắt/xoay/lật đối chiếu từng pixel, kiểm tra thông số, variant sau chỉnh sửa) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run fixtures` | Sinh dữ liệu kiểm thử vào `fixtures/` |
| `npm run acceptance` | Nghiệm thu đầu cuối (109 kiểm tra), ghi `acceptance-out/report.md` |
| `npm run db:local` | PostgreSQL nhúng cho máy dev (cổng 55432) |
| `npm run db:report` | In Photo, PhotoVariant, storage key và đối chiếu với file thật trong từng kho (`-- --json` để in JSON) |
| `npm run storage:check` | Kiểm tra kết nối mọi kho (`-- --storage <tên>` để chọn một kho) |
| `npm run cleanup` | Chạy dọn file một lần (hàng đợi, ảnh DELETING, version cũ hết hạn) |
| `npm run db:seed` | Tạo/đặt lại mật khẩu admin từ `.env` |

Các lệnh `db:migrate`, `db:seed`, `storage:check`, `cleanup` đều có bản `:prod` dùng `.env.production`
(chạy sau `npm run build`).

## 4. Cấu hình kho lưu trữ (nhiều kho, admin chọn khi upload)

Khai báo nhiều kho trong `.env`; admin chọn kho cho từng lượt tải trong tab **Tải ảnh lên**. Mỗi ảnh
ghi tên kho của nó trong DB (cột `photos.storage`), nên hiển thị, tải bản gốc, chỉnh sửa và xóa luôn
đi đúng kho. Không có cơ chế tự chuyển kho khi lỗi.

```env
STORAGE_PROFILES=r2,seaweedfs,local   # tên kho; mỗi kho khai báo bằng các biến <TÊN>_...
STORAGE_DEFAULT=r2                    # kho dùng khi upload không chọn
```

Mỗi kho có `<TÊN>_DRIVER` (`local` | `s3`), `<TÊN>_LABEL` (tên hiển thị trong Admin) và
`<TÊN>_DOWNLOAD_MODE` (`proxy` mặc định | `presigned`, chỉ với s3). Không đặt `STORAGE_PROFILES` thì
server đọc kiểu cũ một kho (`STORAGE_DRIVER`, `LOCAL_STORAGE_ROOT`, `S3_*`) thành kho tên `default`.

```
photos/<photoId>/original.jpg|png     bản gốc đã chuẩn hóa (tải về, nguồn của mọi lần chỉnh sửa; không phục vụ qua /media)
photos/<photoId>/v1/320.webp          variant của bản upload
photos/<photoId>/v1/960.webp
photos/<photoId>/v1/1600.webp
photos/<photoId>/v2/...               variant của mỗi lần chỉnh sửa (v3, v4...)
```

Bộ key giống nhau ở mọi kho, nên chuyển ảnh giữa hai kho chỉ là chép nguyên thư mục
`photos/<photoId>/` rồi đổi cột `storage` của ảnh
(`UPDATE "gallery"."photos" SET "storage" = 'r2' WHERE "storage" = 'local';`).

### Ổ đĩa của web server

```env
LOCAL_LABEL="Ổ đĩa server"
LOCAL_DRIVER=local
LOCAL_ROOT=/srv/gallery-uploads              # tuyệt đối, ngoài source code; Windows: D:\gallery-data\uploads; Docker: một volume
```

Kho local không có URL công khai: ảnh đi qua `/media` của web server, nên ảnh đang ẩn bị chặn ngay.

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
      "actions": ["Read:cdn", "Write:cdn", "List:cdn"]
    },
    { "name": "anonymous", "actions": ["Read:cdn"] }
  ]
}
```

Hai lỗi thường gặp của SeaweedFS sau nginx:

- **HEAD trả 403 qua domain**: nginx (BT Panel) bật `proxy_cache` chạy HEAD thành GET làm sai chữ ký
  SigV4. Ứng dụng không dùng HEAD: kiểm tra object bằng `ListObjectsV2`. Sửa hẳn thì thêm
  `proxy_cache off;` cho vhost, reload nginx.
- **Cloudflare chặn User-Agent lập trình (lỗi 1010)**: bước "Kiểm tra kết nối" và script nghiệm thu gửi
  User-Agent giống trình duyệt. Nếu vẫn bị chặn, tạo WAF rule hoặc dùng Cloudflare Service Token.

### AWS S3 (+ CloudFront), MinIO

```env
AWS_DRIVER=s3
AWS_PROVIDER=aws
AWS_REGION=ap-southeast-1
AWS_BUCKET=gallery-photos
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_PUBLIC_BASE_URL=https://dxxxxxxxx.cloudfront.net

MINIO_DRIVER=s3
MINIO_PROVIDER=minio
MINIO_ENDPOINT=http://10.0.0.6:9000
MINIO_BUCKET=gallery
MINIO_ACCESS_KEY_ID=...
MINIO_SECRET_ACCESS_KEY=...
```

Muốn một kho S3 phục vụ qua web server (bucket private) thì bỏ `<TÊN>_PUBLIC_BASE_URL`: ảnh đi qua
`/media`, và ảnh đang ẩn chỉ admin xem được. `MEDIA_BASE_URL` đổi được khi đặt CDN trước web server.

Ghi chú chung:

- Adapter đặt `requestChecksumCalculation: "WHEN_REQUIRED"`: AWS SDK v3 mặc định gửi checksum CRC32
  cho mọi PutObject và một số bản SeaweedFS/MinIO cũ từ chối header này.
- SeaweedFS/MinIO mặc định path-style, R2/AWS mặc định virtual-hosted; đổi bằng `<TÊN>_FORCE_PATH_STYLE`.
- Xóa từng object bằng `DeleteObject` (idempotent) thay vì `DeleteObjects`, vì `DeleteObjects` bắt
  buộc header checksum mà các kho tương thích hỗ trợ không đồng đều.
- Object variant ghi kèm `Content-Type: image/webp` và `Cache-Control: public, max-age=31536000, immutable`,
  nên đi thẳng qua bucket/CDN vẫn đúng header. Bản gốc ghi kèm `private, no-store` và
  `Content-Disposition: attachment`.
- `presigned`: nút tải bản gốc chuyển hướng tới URL có chữ ký hạn 5 phút; endpoint phải truy cập được
  từ browser, endpoint chỉ có trong mạng nội bộ thì dùng `proxy`.

### CORS trên bucket

Giao diện hiện tại **không cần CORS**: thẻ `<img>` không có `crossorigin`, tải bản gốc là điều hướng
trang, upload đi qua server để kiểm tra trước khi công bố, và trình chỉnh sửa ảnh lấy ảnh xem trước từ
`/api/admin/photos/:id/source` cùng origin (không đọc từ bucket). Chỉ cần CORS khi đọc ảnh từ bucket
bằng JavaScript hoặc canvas, hoặc khi đổi sang upload thẳng từ browser lên bucket. Khi đó chỉ mở
GET/HEAD cho đúng origin của site:

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

## 5. Chỉnh sửa ảnh và version (bonus)

```
Photo ──< PhotoVersion (version, width, height, crop_x/y/width/height, rotate, flip_h,
                        superseded_at, files_cleaned_at)
      ──< PhotoVariant (version, width, height, bytes, storage_key)
photos.current_version   version đang công bố
photos.version_seq       số version lớn nhất đã cấp (tăng nguyên tử)
```

Luồng lưu một chỉnh sửa (`server/src/photos/edit.ts`):

1. Kiểm tra `baseVersion` bằng version đang công bố, nếu không thì 409 `VERSION_CONFLICT`. Kiểm tra
   thông số: vùng cắt là số nguyên, nằm trong ảnh, mỗi cạnh ≥ 16px; góc xoay chỉ 0/90/180/270. Sai thì
   422 `INVALID_EDIT`, ảnh không đổi. Thông số trùng version hiện tại thì trả 200, không tạo version.
2. Cấp số version mới bằng `UPDATE ... SET version_seq = version_seq + 1`.
3. Đọc bản gốc chuẩn hóa từ kho của ảnh, cắt → xoay → lật, sinh variant WebP (không phóng lớn) và blur
   placeholder. Dùng chung semaphore `PROCESSING_CONCURRENCY` với upload.
4. Ghi đủ file dưới `photos/<id>/v<n>/`. Ghi lỗi thì xóa bù, trả 502 `STORAGE_WRITE_FAILED`.
5. Transaction: đổi `current_version` với điều kiện `current_version = baseVersion` và ảnh chưa
   `DELETING`; đánh dấu version cũ `superseded_at`; thêm PhotoVersion và PhotoVariant. Đụng độ thì 409,
   DB lỗi thì 500 `DB_WRITE_FAILED`; cả hai đều xóa bù file vừa ghi, ảnh vẫn công bố version cũ.

Ghi chú:

- Số version tăng dần nhưng có thể nhảy cóc: lần lưu thua đụng độ hoặc bị lỗi vẫn đã chiếm một số.
- Khôi phục không quay lại thư mục `v1` cũ (có thể đã bị dọn) mà tạo version mới từ bản gốc.
- Lật dọc = lật ngang + xoay 180°, nên giao diện chỉ có lật ngang.
- sharp luôn áp dụng `extract → flop → rotate` dù gọi theo thứ tự nào, nên "xoay θ rồi lật" được viết
  thành `flop()` + `rotate(360 − θ)` (cùng kết quả). Unit test đối chiếu từng pixel cả 16 tổ hợp. Khung
  xem trước trên browser (`web/src/lib/editGeometry.ts`) dùng cùng quy ước: vùng cắt luôn lưu theo tọa
  độ bản gốc, chỉ đổi sang tọa độ màn hình khi vẽ.
- Biến môi trường: `VERSION_RETENTION_HOURS` (mặc định 24, `0` = dọn ở lần chạy kế tiếp). Tác vụ dọn
  chạy mỗi `CLEANUP_INTERVAL_MS` (mặc định 10 phút), bằng `npm run cleanup` hoặc nút trong tab Lưu trữ.

Ví dụ (ảnh 2400x1600, cắt 1200x900 rồi xoay 90° và lật ngang):

```bash
curl -b jar.txt -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" \
     -d '{"baseVersion":1,"crop":{"x":600,"y":350,"width":1200,"height":900},"rotate":90,"flipH":true}' \
     http://localhost:4000/api/admin/photos/<id>/edit
```

```jsonc
// HTTP 201
{
  "status": 201, "changed": true, "version": 2,
  "photo": { "width": 900, "height": 1200, "version": 2, "variants": [ /* v2/320.webp, v2/900.webp */ ],
             "original": { "width": 2400, "height": 1600 }, "edit": { "crop": { … }, "rotate": 90, "flipH": true } },
  "supersededVersion": 1,
  "oldFilesDeleteAfter": "2026-11-28T08:00:00.000Z"   // file của v1 được giữ tới thời điểm này
}
```

Khôi phục: `{"baseVersion": 2, "restore": true}`.

## 6. API

| Method | Đường dẫn | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/healthz` | Công khai | Kiểm tra server sống |
| GET | `/api/photos?q=&album=&tag=&cursor=&limit=` | Công khai | Ảnh công khai, phân trang theo con trỏ |
| GET | `/api/photos/:id` | Công khai (ảnh ẩn: admin) | Chi tiết ảnh kèm URL variant của version đang công bố |
| GET | `/api/photos/:id/download` | Công khai (ảnh ẩn: admin) | Bản gốc chuẩn hóa, `Content-Disposition: attachment` (hoặc 302 tới presigned URL) |
| GET | `/api/albums`, `/api/tags` | Công khai | Album có ảnh công khai, tag kèm số ảnh |
| GET | `/media/<storage key>` | Công khai (ảnh ẩn: admin) | Variant WebP (ảnh trong kho không có URL công khai) |
| POST | `/api/auth/login`, `/api/auth/logout`; GET `/api/auth/me` | | Phiên admin |
| POST | `/api/admin/photos` | Admin | Upload multipart; `Accept: application/x-ndjson` để nhận tiến trình theo dòng |
| GET/PATCH/DELETE | `/api/admin/photos[/:id]` | Admin | Thư viện, sửa (tiêu đề, alt, mô tả, album, tag, ẩn/hiện), xóa |
| POST | `/api/admin/photos/:id/edit` | Admin | Chỉnh sửa ảnh: `{baseVersion, crop, rotate, flipH}` hoặc `{baseVersion, restore: true}` (mục 5) |
| GET | `/api/admin/photos/:id/source?max=1600` | Admin | Bản gốc thu nhỏ (WebP, 200–2400px) cho khung xem trước của trình chỉnh sửa |
| GET/POST/PATCH/DELETE | `/api/admin/albums[/:id]` | Admin | Album |
| GET | `/api/admin/overview`, `/api/admin/upload-limits` | Admin | Các kho (đã che secret), giới hạn, thống kê, việc dọn file đang chờ |
| POST | `/api/admin/storage/test?storage=<tên>`, `/api/admin/cleanup` | Admin | Kiểm tra kết nối một kho, chạy dọn file |

Request ghi (POST/PATCH/DELETE) phải có header `X-Requested-With: XMLHttpRequest` và cùng origin
(lớp chống CSRF thứ hai bên cạnh cookie SameSite=Strict).

Ví dụ upload bằng curl (sau khi đăng nhập, cookie lưu trong `jar.txt`):

```bash
curl -c jar.txt -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" \
     -d '{"email":"admin@example.com","password":"..."}' http://localhost:4000/api/auth/login
curl -b jar.txt -H "X-Requested-With: XMLHttpRequest" \
     -F title="Bờ biển" -F altText="Bãi biển lúc chiều" -F storage=local \
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

## 7. Nghiệm thu và bằng chứng

`npm run acceptance` tự khởi động server (cổng 4100), chạy toàn bộ kịch bản qua HTTP thật, rồi đối
chiếu response với DB và kho file. Nó khởi động lại server với `FAULT_INJECTION` để giả lập lỗi và với
`VERSION_RETENTION_HOURS=0` để kiểm tra việc dọn version cũ. Kết quả cùng các JSON làm bằng chứng nằm
trong `acceptance-out/report.md`. Đã chạy: **109/109**, không mục nào bỏ qua, với cấu hình ba kho:
mặc định Cloudflare R2 (ảnh và bản gốc qua presigned URL), SeaweedFS trên VPS và ổ đĩa server
(upload, hiển thị, tải bản gốc, chỉnh sửa, xóa đều đi đúng kho). Mục "ảnh ẩn bị chặn ở `/media`" chạy
trên kho local vì kho mặc định cho tải thẳng từ CDN công khai (xem mục 8). Phần bonus có hai mục
riêng: chỉnh sửa (thông số sai, đụng độ, nội dung variant khớp phép biến đổi, khôi phục) và dọn version
cũ. Chạy với `.env.production`:
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
FAULT_INJECTION=db-commit npm run dev                 # DB lỗi sau khi ghi file (upload hoặc lưu chỉnh sửa) -> file vừa ghi bị xóa
FAULT_INJECTION=db-commit,cleanup-delete npm run dev  # xóa bù cũng lỗi -> key vào storage_cleanups
FAULT_INJECTION=storage-write npm run dev             # ghi bản gốc lỗi -> các variant đã ghi bị xóa
npm run dev                                           # chạy lại khi kho bình thường, rồi ở terminal khác:
npm run cleanup                                       # dọn sạch hàng đợi
```

## 8. Giới hạn đã biết

- Kho có `<TÊN>_PUBLIC_BASE_URL` (browser tải thẳng từ bucket/CDN): ẩn ảnh không chặn được URL đã
  biết, vì bucket công khai không biết trạng thái ảnh. Cần chặn ngay thì bỏ trống biến này hoặc upload
  vào kho local để mọi ảnh đi qua `/media` của web server.
- Xóa ảnh, hoặc dọn version cũ, ở origin không xóa bản đã nằm trong cache của browser/CDN (`max-age` 1
  năm). Phải purge CDN nếu cần gỡ ngay. Với kho có URL công khai, file version cũ vẫn mở được trực
  tiếp trong thời hạn giữ (24 giờ).
- Chỉ nhận JPEG và PNG theo đề (không HEIC/RAW).
- Chỉnh sửa ảnh chỉ có cắt, xoay 90° và lật ngang (không xoay góc tự do, không chỉnh màu). Khôi phục
  chỉ về bản gốc, không chọn một version cũ bất kỳ.
- Chỉnh sửa đọc toàn bộ bản gốc vào RAM (tối đa 256 MiB, bản gốc ≤ 40 triệu pixel nên thực tế nhỏ hơn
  nhiều) và chạy chung giới hạn `PROCESSING_CONCURRENCY` với upload.
