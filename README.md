# Báo cáo cấu hình Client-Side Rendering - UniPortal nhóm 2

## 1. Thông tin nhóm

| STT | Họ và tên | MSSV |
| --- | --- | --- |
| 1 | Nguyễn Anh Khôi | 24127430 |
| 2 | Nguyễn Tấn Hiệu | 24127373 |
| 3 | La Anh Hào | 24127361 |
| 4 | Trần Nguyễn Tuấn Minh | 24127084 |

## 2. Yêu cầu đề bài

Nhóm xây dựng ứng dụng UniPortal: một màn hình Student List được **render ở phía client** (client-side rendering - CSR).

- Danh sách sinh viên phải được render từ state, không phải từ HTML do server dựng sẵn.
- Form Add Student dùng **controlled inputs**.
- Thêm sinh viên phải cập nhật giao diện ngay trong trình duyệt, **không reload** trang.
- Bản này giữ thêm các tính năng của Block 1 (search, filter, thống kê, sửa, xóa, theme pixel art) và lưu dữ liệu trên server để dữ liệu còn nguyên sau khi F5.

## 3. Client-side rendering trong đồ án này

Điểm mấu chốt để phân biệt CSR và SSR rất đơn giản: **ai là người dựng HTML của trang?**

- SSR (Block 1): template engine trên server dựng ra cả một document HTML đã chứa sẵn tên sinh viên.
- CSR (đồ án này): server chỉ gửi một HTML shell gần như trống; React dựng toàn bộ giao diện trong trình duyệt từ dữ liệu JSON mà nó tự fetch về.

Việc có một API JSON **không** làm ứng dụng trở thành server-rendered. Server-side rendering nghĩa là server tạo ra HTML của trang; server ở đây chỉ tạo ra **dữ liệu**.

Khi mở `http://localhost:5173/#/students`, thứ tự công việc diễn ra như sau:

1. Trình duyệt gửi một document request. Server trả về `index.html` - HTML shell chỉ có `<div id="root"></div>` và một thẻ `<script>`.
2. Trình duyệt tải JS bundle và `pixel.css`.
3. JS bundle chạy, React mount, gọi `GET /api/students`, rồi dựng toàn bộ giao diện vào `#root`.

Toàn bộ phần cấu hình bên dưới chỉ phục vụ đúng ba bước đó, và mỗi phần đều có cách kiểm tra riêng.

## 4. Cấu hình tầng build/dev bằng Vite

File cấu hình: `vite.config.ts`. Đây là nơi quyết định bundle được tạo ra thế nào và dev server chạy ra sao.

Các điểm chính trong cấu hình:

- `plugins: [react()]`: Vite dùng plugin React để biên dịch `src/main.tsx` (và mọi file nó import) thành JS bundle mà trình duyệt tải về.
- `build.outDir: 'dist'`: thư mục nhận HTML shell và JS bundle sau khi build, cũng là thư mục mà server production phục vụ.
- `server.proxy: { '/api': 'http://localhost:3000' }`: dev server chuyển tiếp mọi request `/api` sang Express đang chạy ở cổng 3000, nên trình duyệt chỉ thấy **một origin** và không bao giờ cần CORS.
- File trong `public/` (`pixel.css`) được copy nguyên vào `dist/`, không qua bước bundle.

Cách kiểm tra: chạy `npm run dev`, mở `http://localhost:5173`. Trong DevTools, tab Network, request `/api/students` phải trả về **JSON** (không phải HTML), và trang vẫn hiển thị đủ danh sách.

## 5. Cấu hình HTML shell bằng index.html

File cấu hình: `index.html`. Đây là **tất cả** HTML mà server gửi cho mỗi màn hình - có thể kiểm chứng bằng View Page Source.

Các điểm chính trong cấu hình:

- `<div id="root"></div>`: điểm neo duy nhất để React dựng giao diện vào. Trong file không hề có tên sinh viên.
- `<script type="module" src="/src/main.tsx">`: entry point của bundle client, chính là lúc CSR bắt đầu.
- `<noscript>UniPortal needs JavaScript to render (client-side rendering).</noscript>`: nhắc rằng khi tắt JavaScript thì không có gì để hiển thị.
- Một đoạn `<script>` nhỏ chạy **trước** React: đọc `localStorage` khóa `up-theme` và gắn `data-theme` lên `<html>` để tránh chớp sai theme (theme flash).
- Các thẻ `<link>`: Google Fonts (Handjet, VT323), bộ icon Phosphor và `/pixel.css`.

Cách kiểm tra: chuột phải chọn **View Page Source** - chỉ thấy `<div id="root">` rỗng, không có tên sinh viên. Trong tab Elements của DevTools mới thấy đầy đủ các card do React dựng ra.

## 6. Cấu hình server bằng server.ts

File cấu hình: `server.ts` (kèm `.env.example`). Server **không** dựng HTML cho bất kì màn hình nào; nó chỉ có hai việc: trả JSON cho `/api/...` và, ở production, giao cho trình duyệt HTML shell + JS bundle đã build.

Các điểm chính trong cấu hình:

- `app.use(express.json({ limit: '100kb' }))` và `app.disable('x-powered-by')`: server chỉ đọc/hiểu JSON và giấu header của Express.
- Các route REST trả JSON: `GET/POST /api/students`, `GET/PUT/DELETE /api/students/:id`. Đây là các route duy nhất mà React client gọi tới.
- `const IS_PROD = process.argv.includes('--prod')`: cờ `--prod` do `npm start` truyền vào quyết định chế độ chạy.
- `serveBuiltApp()` (chế độ production): dùng `express.static(distDir, { index: false })` để phục vụ file tĩnh trong `dist/`, rồi một middleware SPA fallback trả `index.html` cho mọi request `GET`/`HEAD` còn lại - để hash router tự chọn màn hình.
- `explainToBrowsers()` (chế độ dev): server chỉ trả JSON 404 kèm lời nhắn mở app ở `http://localhost:5173/`, vì giao diện do Vite phục vụ.
- `handleErrors()`: mọi lỗi (kể cả file dữ liệu hỏng) đều trở thành JSON `{ error: "..." }` cùng status code rõ ràng, không bao giờ là HTML.
- Route `/api` không khớp thì trả JSON 404, và được đăng kí **trước** fallback SPA để không bị nuốt.
- `PORT` đọc từ `process.env.PORT` (mặc định `3000`, xem `.env.example`); `app.listen(PORT, '0.0.0.0', ...)`.

Cách kiểm tra: `npm start` rồi mở `http://localhost:3000/#/students` - server trả shell + bundle và cả API. Còn khi chỉ chạy `npm run dev`, mở thẳng `http://localhost:3000/` sẽ thấy JSON 404 hướng dẫn sang cổng 5173.

## 7. Cấu hình phía client trong thư mục src/

Toàn bộ code dựng giao diện nằm trong `src/` và chạy trong trình duyệt.

- `src/main.tsx`: entry point của CSR. `createRoot(document.getElementById('root')!).render(<App />)` lấy `<div id="root">` từ shell và vẽ app vào đó.
- `src/App.tsx`: **chủ sở hữu state duy nhất** của danh sách qua `useState<Student[]>([])`. Mọi thay đổi đều đi qua `addStudent`, `updateStudent`, `deleteStudent`, và chỉ `App` mới gọi `setStudents`.
- `src/router.ts`: hash router tự viết, không dùng thư viện. Phần sau dấu `#` không bao giờ gửi lên server, nên chuyển màn hình chỉ đổi hash chứ không load document mới (`#/students`, `#/students/new`, `#/students/edit/:id`).
- `src/api.ts`: **nơi duy nhất** trình duyệt nói chuyện với server, qua các hàm `fetch` mỏng (`listStudents`, `createStudent`, `updateStudent`, `deleteStudent`) trả JSON.
- `src/components/StudentForm.tsx`: các input do component cha sở hữu giá trị (`value={values[...]}`) và nhận từng thay đổi qua `onChange` - controlled inputs; `form` gọi `e.preventDefault()` nên không có document request nào khi submit.
- Dữ liệu đi xuống bằng **props**, sự kiện đi lên bằng **callbacks** (`onAdd`, `onUpdate`, `onDelete`); logic thuần nằm ở `src/studentUtils.ts`, các trang ở `src/pages/`.
- `src/types.ts`: interface `Student` dùng chung cho **cả** client lẫn server, nên hai bên luôn khớp tên field.

Cấu hình TypeScript cũng tách hai phía:

- `tsconfig.json`: type-check code trình duyệt, `exclude` cả `server.ts` và `server/`.
- `tsconfig.server.json`: type-check phía Node (`server.ts`, `server/**/*.ts`) và chỉ lấy thêm `src/types.ts` để dùng chung kiểu.

Bảng đối chiếu hai loại script:

| | Server-side script | Client-side script |
| --- | --- | --- |
| File | `server.ts`, `server/storage.ts`, `server/studentRules.ts` | Toàn bộ `src/` (`App.tsx`, components, pages, `router.ts`, `studentUtils.ts`, `sprite.ts`, `api.ts`) |
| Chạy ở đâu | Node.js trên server | Trình duyệt của người dùng |
| Được dùng | File system, biến trong `.env` | DOM, React state, `localStorage` (theme), canvas, `confirm()` |
| Người dùng đọc được code? | Không | Có, trong tab Sources của DevTools |

Cách kiểm tra: chạy `npm run lint` để type-check đồng thời cả hai phía; sau đó trong DevTools, tab Sources, xác nhận code trong `src/` hiển thị được còn logic server thì không.

## 8. Cấu hình dữ liệu bằng data/students.json

Nguồn dữ liệu duy nhất là `data/students.json`, được đọc/ghi bởi `server/storage.ts`. Trình duyệt không bao giờ chạm vào file này, nó chỉ hỏi API.

Các điểm chính trong cấu hình:

- Không có bản sao dữ liệu nào hardcode trong code, nên file và code không thể lệch nhau.
- `readStudents()`: file thiếu được hiểu là "chưa có bản ghi nào" (trả `[]`), chứ không âm thầm dùng lại seed cũ; JSON không hợp lệ thì báo lỗi rõ ràng.
- `writeAtomically()`: ghi ra file tạm rồi `rename` đè lên `students.json`, nên crash giữa chừng không để lại file viết dở.
- `transact()`: mọi thao tác đọc-sửa-ghi được xếp hàng chạy lần lượt, nên hai người lưu cùng lúc không ghi đè lên nhau.
- File được giữ đúng kiểu xuống dòng sẵn có (CRLF trên Windows, LF trong git) và indent 2 khoảng trắng, để một lần lưu không làm cả file thành diff.

Cách kiểm tra: chạy app, thêm một sinh viên, mở `data/students.json` xem bản ghi mới; sau đó F5 lại trang và thấy sinh viên đó vẫn còn.

## 9. Cách kiểm tra tổng hợp

Có thể chứng minh sản phẩm đúng là client-side rendering bằng vài thao tác:

- **View Page Source**: chỉ thấy `<div id="root">` rỗng, không có tên sinh viên - nghĩa là HTML không được dựng sẵn.
- **Elements panel**: hiển thị đầy đủ DOM mà React đã dựng, gồm tất cả các card.
- **Tắt JavaScript**: trang trắng, chỉ hiện thông báo `<noscript>`.
- **Network panel, tab Fetch/XHR**: khi submit form chỉ có một request `POST /api/students` trả JSON, không có document request và trang không bị reload.
- **F5**: dữ liệu vẫn còn nguyên vì đã được server lưu xuống `data/students.json`.

## 10. Minh chứng

| File | Nội dung |
| --- | --- |
| `evidence/component-diagram.png` | Sơ đồ component và chủ sở hữu state (`App` giữ danh sách, `AddStudentForm` giữ giá trị form) |
| `evidence/network-log.md` | Log request trước và sau khi submit (1 document request khi tải, 1 fetch JSON khi thêm) |
| `evidence/state-before-submit.png` | Ảnh trạng thái trước khi submit |
| `evidence/state-after-submit.png` | Ảnh trạng thái sau khi submit |

## 11. Danh sách file trong bài nộp

| File | Nội dung |
| --- | --- |
| `index.html` | HTML shell - tất cả HTML mà server gửi cho mọi màn hình |
| `vite.config.ts` | Cấu hình build và dev server (proxy `/api`, đầu ra `dist/`) |
| `server.ts` | API JSON và việc phục vụ bundle ở production |
| `server/storage.ts` | Đọc/ghi `data/students.json` an toàn (atomic, xếp hàng) |
| `server/studentRules.ts` | Kiểm tra dữ liệu phía server (nguồn quyết định cuối cùng) |
| `src/main.tsx` | Entry point của bundle client - nơi CSR bắt đầu |
| `src/App.tsx` | Chủ sở hữu state của danh sách sinh viên |
| `src/router.ts` | Hash router - chuyển màn hình không load document mới |
| `src/api.ts` | Nơi duy nhất client gọi server bằng `fetch` |
| `src/types.ts` | Kiểu `Student` dùng chung cho client và server |
| `data/students.json` | Nguồn dữ liệu duy nhất của danh sách sinh viên |
| `tsconfig.json`, `tsconfig.server.json` | Cấu hình type-check cho phía trình duyệt và phía Node |
| `.env.example` | Mẫu biến môi trường (`PORT`, mặc định `3000`) |

## How to run

Yêu cầu: Node.js.

Chạy ở chế độ phát triển (CSR):

```bash
npm install
npm run dev
```

Lệnh này chạy đồng thời Vite dev server (`http://localhost:5173`) và Express API (`http://localhost:3000`). Mở `http://localhost:5173/#/students` để xem danh sách sinh viên.

| Tiến trình | URL | Nhiệm vụ |
| --- | --- | --- |
| Vite (`dev:web`) | `http://localhost:5173` | Phục vụ HTML shell + JS bundle và hot-reload code React. Đây là địa chỉ bạn mở. |
| Express API (`dev:api`) | `http://localhost:3000` | Trả JSON cho `/api/...`. Vite chuyển tiếp `/api` sang đây, nên trình duyệt thấy một origin. |

Cũng có thể chạy riêng bằng `npm run dev:api` và `npm run dev:web` ở hai terminal.

Chạy ở chế độ production:

```bash
npm run build
npm start
```

`npm run build` tạo HTML shell và JS bundle vào `dist/`, sau đó `npm start` phục vụ bundle và API từ một server duy nhất. Mở `http://localhost:3000/#/students`.

Các script khác:

| Script | Nhiệm vụ |
| --- | --- |
| `npm run lint` | Type-check cả code trình duyệt lẫn code server |
| `npm run build` | Build HTML shell và JS bundle vào `dist/` |
| `npm start` | Phục vụ bundle đã build và API (`server.ts --prod`) |
| `npm run dev:api` | Chỉ chạy Express API |
| `npm run dev:web` | Chỉ chạy Vite dev server |
