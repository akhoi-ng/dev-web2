# Network log: tải trang, submit và F5

Ghi tự động bằng Chromium (Playwright) trên **bản production**: `npm run build` rồi `npm start`.
`npm start` chạy hai server: **frontend** (Vite preview, `http://localhost:4173`) và **backend** (Express API, `http://localhost:3000`).
Trình duyệt chỉ nói chuyện với frontend; frontend chuyển (proxy) mọi request `/api/...` sang backend.
Vì vậy trong tab Network, request API vẫn có địa chỉ `http://localhost:4173/api/students`.

Bảng chỉ liệt kê request tới ứng dụng (`http://localhost:4173`). Request font tới Google Fonts không được
liệt kê vì máy test không truy cập được Google Fonts; đó không phải request của ứng dụng.

## 1. Lần tải trang đầu

| Method | Type | Status | URL |
|---|---|---|---|
| GET | document | 200 | `/` |
| GET | stylesheet | 200 | `/pixel.css` |
| GET | script | 200 | `/assets/index-BLmN9gbm.js` |
| GET | fetch | 200 | `/api/students` |

- Document request: **1** (HTML shell `/`, chỉ có `<div id="root">`).
- `/assets/index-BLmN9gbm.js` là JS bundle. React chạy xong mới gọi **`GET /api/students`** (type `fetch`).
- Backend: Router `/api/students` → Handler `listStudents` → Database (đọc `backend/data/students.json`) → `res.json()`.
- Số card sau khi tải: **9**.

## 2. Sau khi submit (thêm một sinh viên)

Nhập Full name "Đỗ Thị Ngọc Anh", ID `STU-2026-111`, email, major, rồi bấm **Add student**.

| Method | Type | Status | URL |
|---|---|---|---|
| POST | fetch | 201 | `/api/students` |

- Request tới ứng dụng: **1**, kiểu `fetch` (`POST /api/students`, trả `201` kèm JSON sinh viên đã lưu). Document request: **0**.
- Backend: Router → Handler `createStudent` (validate) → Database (ghi vào file) → `res.status(201).json(...)`.
- Frontend: nhận JSON → `setStudents` → component render lại → DOM có thêm một card.
- `performance.getEntriesByType('navigation').length` = **1**: trang không load lại.
- Số card: **10**. Card đầu tiên: **Đỗ Thị Ngọc Anh**. Thông báo trong form: "Student saved on the server and added to the list."
- Form sau khi submit: Full name = "" (đã reset).
- Số sinh viên trong `backend/data/students.json` sau khi submit: **10**.

## 3. Sau khi nhấn F5

| Method | Type | Status | URL |
|---|---|---|---|
| GET | document | 200 | `/` |
| GET | stylesheet | 304 | `/pixel.css` |
| GET | script | 304 | `/assets/index-BLmN9gbm.js` |
| GET | fetch | 200 | `/api/students` |

- F5 tải lại HTML shell, JS bundle, và React lại gọi `GET /api/students`.
- Số card sau F5: **10**. Card đầu tiên: **Đỗ Thị Ngọc Anh**. Sinh viên vừa thêm vẫn còn, vì backend đã ghi vào file.

Sau khi ghi log, dữ liệu được trả về 9 sinh viên ban đầu bằng `npm run reset-data`.
