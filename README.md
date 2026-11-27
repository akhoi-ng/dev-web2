# Photo Gallery (Block 11)

Bài Block 11 của nhóm: ứng dụng gallery ảnh end-to-end. Admin tải 1–5 ảnh trong một request, server
kiểm tra chữ ký file và giới hạn, xoay theo EXIF rồi bỏ EXIF, sinh variant WebP, lưu file vào kho
(ổ đĩa server, Cloudflare R2, SeaweedFS, MinIO, AWS S3) và metadata vào PostgreSQL. Người xem duyệt ảnh
trong lưới masonry, lightbox và trang chi tiết. Bonus: cắt, xoay, lật, khôi phục ảnh theo version.

Toàn bộ code, hướng dẫn chạy và đối chiếu với đề nằm trong [`gallery/`](gallery/), xem
[`gallery/README.md`](gallery/README.md). Trước khi chạy bản nộp, xem "Ghi chú khi chạy bản nộp" ở mục
3 của README đó: cần chỉnh đường dẫn `LOCAL_ROOT` và database trong `gallery/server/.env.production`
cho đúng máy chạy server.

## Thông tin nhóm

| STT | Họ và tên | MSSV |
| --- | --- | --- |
| 1 | Nguyễn Tấn Hiệu | 24127373 |
| 2 | La Anh Hào | 24127361 |
| 3 | Trần Nguyễn Tuấn Minh | 24127084 |
| 4 | Nguyễn Anh Khôi | 24127430 |

## Các block trước

Code của các block trước (web nhà hàng Lửa Hồng) nằm ở các nhánh `Block-5` … `Block-10` của
repository này, không có trong nhánh `Block-11`.

## Bằng chứng

Link thư mục Google Drive của nhóm ở [`evidence/ggdrive_link.txt`](evidence/ggdrive_link.txt).
