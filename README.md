# UniPortal - Student List (Client-Side Rendering)

## 1. Thông tin nhóm

| STT | Họ và tên | MSSV |
| --- | --- | --- |
| 1 | Nguyễn Anh Khôi | 24127430 |
| 2 | Nguyễn Tấn Hiệu | 24127373 |
| 3 | La Anh Hào | 24127361 |
| 4 | Trần Nguyễn Tuấn Minh | 24127084 |

## 2. Yêu cầu đề bài

Nhóm xây dựng màn hình Student List **render ở phía client** (client-side rendering):

- Danh sách sinh viên render từ state, không phải từ HTML dựng sẵn.
- Form Add Student dùng controlled inputs.
- Thêm sinh viên cập nhật giao diện ngay trong trình duyệt, không reload trang.

Không dùng API và không dùng database. Toàn bộ dữ liệu nằm trong React state.

## 3. Cách chạy

```bash
npm install
npm run dev
```

Mở `http://localhost:5173/`.

| Script | Nhiệm vụ |
| --- | --- |
| `npm run dev` | Chạy Vite dev server, có hot reload |
| `npm run build` | Build HTML shell và JS bundle vào `dist/` |
| `npm run preview` | Chạy thử bản đã build |
| `npm run lint` | Type-check bằng `tsc --noEmit` |

## 4. Cấu trúc

```text
src/
├── main.tsx                    # entry point: mount React vào <div id="root">
├── App.tsx                     # chủ sở hữu state danh sách sinh viên
├── seed.ts                     # dữ liệu mẫu khởi tạo
├── types.ts                    # kiểu Student, StudentInput, StudentStats
├── studentUtils.ts             # hàm thuần: validate, chuyển đổi, thống kê
└── components/
    ├── AddStudentForm.tsx      # chủ sở hữu state của form
    ├── StudentList.tsx         # map danh sách ra các StudentRow
    └── StudentRow.tsx          # hiển thị một sinh viên
```

Hai nơi giữ state:

- `App` giữ danh sách sinh viên qua `useState<Student[]>`.
- `AddStudentForm` giữ nội dung đang nhập trong form.

`StudentList` và `StudentRow` không giữ state, chỉ đọc props.

## 5. Dữ liệu

Dữ liệu mẫu nằm trong `src/seed.ts`. Khi `App` khởi động, nó sao chép mảng này vào
state một lần duy nhất. Sau đó mọi thay đổi chỉ nằm trong bộ nhớ trình duyệt.

Vì không có server, nhấn F5 sẽ đưa danh sách về đúng dữ liệu mẫu ban đầu.

## 6. Cách kiểm tra

- Tắt JavaScript: trang trắng, chỉ hiện thông báo `<noscript>`.
- View Page Source: chỉ thấy `<div id="root">` rỗng, không có tên sinh viên.
- Elements panel: thấy đầy đủ các card do React dựng.
- Thêm một sinh viên hợp lệ: card mới xuất hiện đầu danh sách, tổng số tăng, form reset.
- ID trùng hoặc dữ liệu sai: hiện thông báo lỗi, không thêm sinh viên.
- Submit: không có request mới, trang không reload.
- F5: danh sách trở về 9 sinh viên mẫu.

## 7. Minh chứng

| File | Nội dung |
| --- | --- |
| `evidence/component-diagram.png` | Sơ đồ component và chủ sở hữu state |
| `evidence/network-log.md` | Log request trước và sau khi submit |
| `evidence/state-before-submit.png` | Giao diện trước khi submit |
| `evidence/state-after-submit.png` | Giao diện sau khi submit |
| `evidence/demo.webm` | Video thao tác thêm sinh viên |
