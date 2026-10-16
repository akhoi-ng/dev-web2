# UniPortal - Student List dạng client-rendered

Báo cáo bài tập tuần 2 của nhóm 2. Ứng dụng được tách thành hai phần như sơ đồ của buổi
học:

- **Backend (API)** trong `backend/`: Express, chỉ trả JSON. Luồng xử lý:
  Router → Handler → Database → `res.json()`.
- **Frontend (bundle JS)** trong `frontend/`: React + Vite, dựng giao diện trong trình
  duyệt. Luồng xử lý: `fetch()` → state → Component → DOM.

Frontend không bao giờ đụng vào file dữ liệu. Mọi thao tác đọc ghi đi qua API của backend:
`GET /api/students` để đọc, `POST /api/students` để ghi. Không dùng database server; "database"
của nhóm là file `backend/data/students.json`, giống Block 1.

Stack: React 19, Vite 8, TypeScript, Express 4, npm workspaces.

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

Theo sơ đồ "Ranh giới giữa BE và FE", phần SSR của Block 1 được chia ra:

| Phần của SSR (Block 1) | Chuyển sang | Trong project này |
| --- | --- | --- |
| Router (khớp method, path) | BE | `backend/src/routes/students.routes.ts` |
| Handler (xử lý, validate) | BE | `backend/src/handlers/students.handler.ts` |
| Database (đọc, ghi dữ liệu) | BE | `backend/src/db/students.db.ts` + `backend/data/students.json` |
| Template engine (data thành HTML) | FE, thành component | `frontend/src/components/*.tsx` (JSX thay template) |
| (mới) trả dữ liệu | BE | `res.json()` thay cho `res.render()` |
| (mới) gọi API | FE | `frontend/src/api.ts` (`fetch()`) |
| (mới) giữ dữ liệu trong trình duyệt | FE | state `students` trong `frontend/src/App.tsx` |

## 3. Cách chạy

```bash
npm install
npm run dev
```

Mở `http://localhost:5173/`.

`npm install` ở thư mục gốc cài cho cả `backend/` và `frontend/` (npm workspaces).
`npm run dev` chạy **hai server cùng lúc** (dùng `concurrently`, log có nhãn `[BE]` và `[FE]`):

| Server | Thư mục | Cổng | Nhiệm vụ |
| --- | --- | --- | --- |
| Backend | `backend/` | 3000 | API JSON: `GET` và `POST /api/students` |
| Frontend | `frontend/` | 5173 | Vite dev server: HTML shell + JS bundle |

Trình duyệt chỉ mở cổng 5173. Vite **proxy** mọi request `/api/...` sang cổng 3000, nên với
trình duyệt chỉ có một địa chỉ và không cần cấu hình CORS.

| Script (ở thư mục gốc) | Nhiệm vụ |
| --- | --- |
| `npm run dev` | Chạy backend (`tsx watch`) và frontend (Vite) cùng lúc |
| `npm run build` | Build frontend (HTML shell + JS bundle) vào `frontend/dist/` |
| `npm start` | Chạy backend và `vite preview` (bản đã build, cổng 4173, cũng proxy `/api`) |
| `npm run lint` | Type-check cả backend và frontend bằng `tsc --noEmit` |
| `npm run reset-data` | Đưa `backend/data/students.json` về 9 sinh viên ban đầu |

Ở production:

```bash
npm run build
npm start
```

Mở `http://localhost:4173/`.

Vì sinh viên mới được ghi vào `backend/data/students.json`, file sẽ thay đổi khi thử. Trước
khi quay video hoặc nộp bài, chạy `npm run reset-data`. Lệnh này chép
`backend/data/students.seed.json` (bản gốc 9 sinh viên, không bao giờ bị ghi) đè lên
`backend/data/students.json`.

## 4. Công nghệ sử dụng

| Phần | Dùng gì | Vì sao |
| --- | --- | --- |
| Thư viện UI | React 19 | Slide yêu cầu một React starter hoặc framework component tương đương. React dựng trang từ component, và khi state đổi thì chỉ cập nhật phần DOM đã thay đổi. |
| Build tool và dev server (FE) | Vite 8 | Phục vụ HTML shell và build ra một JS bundle. Có sẵn proxy `/api` sang backend. |
| Backend | Express 4, chạy bằng `tsx` | Giống Block 1 nhưng chỉ trả JSON. Chia lớp Router, Handler, Database như sơ đồ. |
| Ngôn ngữ | TypeScript | Kiểu `Student` giữ cho hai bên khớp tên field. Mỗi bên có bản `types.ts` riêng: BE và FE chỉ chia sẻ **hình dạng JSON**, không chia sẻ code. |
| Dữ liệu | `backend/data/students.json` | Ban đầu là 9 sinh viên giống hệt file của Block 1. Chỉ lớp Database của backend đọc và ghi file này. |
| Chạy hai server | npm workspaces + `concurrently` | Một lệnh `npm install`, một lệnh `npm run dev` cho cả hai thư mục. |

## 5. Cấu trúc

```text
package.json                    # workspaces + script chạy cả hai phần
backend/                        # BACKEND (API), cổng 3000
├── data/
│   ├── students.json           # "database": BE đọc và ghi file này
│   └── students.seed.json      # bản gốc 9 sinh viên (dùng cho npm run reset-data)
└── src/
    ├── server.ts               # khởi động API ở cổng 3000
    ├── app.ts                  # express.json(), gắn router, 404 và lỗi đều trả JSON
    ├── routes/
    │   └── students.routes.ts  # ROUTER: GET / và POST / dưới /api/students
    ├── handlers/
    │   └── students.handler.ts # HANDLER: xử lý, validate, trả res.json()
    ├── db/
    │   └── students.db.ts      # DATABASE: findAll(), insert() trên file JSON
    ├── validation/
    │   └── student.validation.ts # luật kiểm tra phía server (400, 409)
    └── types.ts                # kiểu Student
frontend/                       # FRONTEND (bundle JS), cổng 5173
├── index.html                  # HTML shell: chỉ có <div id="root">
├── vite.config.ts              # proxy /api -> http://localhost:3000
├── public/pixel.css            # theme pixel
└── src/
    ├── main.tsx                # mount React vào <div id="root">
    ├── api.ts                  # FETCH: fetchStudents() (GET), createStudent() (POST)
    ├── App.tsx                 # STATE: chủ sở hữu danh sách students
    ├── studentUtils.ts         # kiểm tra nhanh ở client, thống kê
    ├── types.ts                # kiểu Student, StudentInput, StudentStats
    └── components/             # COMPONENT: JSX thay template
        ├── AddStudentForm.tsx  # chủ sở hữu state của form
        ├── StudentList.tsx     # map danh sách ra các StudentRow
        └── StudentRow.tsx      # hiển thị một sinh viên
evidence/                       # minh chứng
```

Hai nơi giữ state ở frontend:

- `App` giữ danh sách sinh viên qua `useState<Student[]>`. `App` có thêm `loadStatus`
  (`loading`, `ready`, `error`) và `loadError` để hiện trạng thái tải. Hai biến này không
  phải bản sao của danh sách.
- `AddStudentForm` giữ nội dung đang nhập (`values`), lỗi (`error`), thông báo
  (`message`) và `saving` (đang chờ backend trả lời).

`StudentList` và `StudentRow` không giữ state, chỉ đọc props.

Luồng dữ liệu trong frontend:

- Dữ liệu đi xuống bằng **props**.
- Sự kiện đi lên bằng **callback** (`onAdd`).

`AddStudentForm` không tự sửa danh sách. Nó gọi `onAdd(values)`, tức hàm `addStudent`
trong `App`, và `App` là nơi duy nhất gọi `setStudents`.

## 6. Luồng dữ liệu

### Đọc danh sách (`GET /api/students`)

1. Trình duyệt mở `http://localhost:5173/`, nhận HTML shell và JS bundle từ frontend.
2. React chạy, `App` bắt đầu với `students = []` và `loadStatus = 'loading'`. Màn hình
   hiện "Loading students…", form bị khóa, thống kê hiện "…".
3. **FE `fetch()`**: `useEffect` gọi `fetchStudents()`, tức `GET /api/students`. Vite chuyển
   request sang backend.
4. **BE Router** khớp `GET /api/students` → **Handler** `listStudents` → **Database**
   `findAll()` đọc file → **`res.json()`** trả mảng sinh viên.
5. **FE state**: `App` gọi `setStudents(list)`, `loadStatus = 'ready'`.
6. **FE Component → DOM**: React render 9 card, form mở.

### Ghi một sinh viên mới (`POST /api/students`)

1. Người dùng bấm **Add student**. `AddStudentForm` gọi `e.preventDefault()` (không gửi form
   kiểu cũ, không tải trang mới), rồi gọi `onAdd(values)`.
2. **FE kiểm tra nhanh** (`checkNewStudent`): thiếu field, email sai, GPA ngoài 0 đến 4 hoặc
   ID đã có trong danh sách thì báo lỗi ngay, **không gửi request**.
3. **FE `fetch()`**: `createStudent(values)` gửi `POST /api/students` với body JSON. Nút đổi
   thành "Saving…" và form bị khóa trong lúc chờ.
4. **BE Router** khớp `POST /api/students` → **Handler** `createStudent` kiểm tra lại toàn
   bộ (`400` nếu sai) → **Database** `insert()` kiểm tra ID trùng (`409`) rồi ghi sinh viên
   vào đầu file → **`res.status(201).json(...)`** trả sinh viên đã lưu.
5. **FE state**: khi nhận `201`, `App` gọi `setStudents([saved, ...current])` với đúng dữ
   liệu backend đã lưu.
6. **FE Component → DOM**: React thêm một card mới ở đầu danh sách. Form reset, hiện
   "Student saved on the server and added to the list.", card mới được cuộn vào tầm nhìn.

Nếu backend trả lỗi (`400`, `409`, `500`), state **không đổi**: không có card mới, lỗi hiện
trong form và nội dung đã gõ vẫn còn trong các ô nhập. Như vậy màn hình không bao giờ hiện
một sinh viên mà file không có.

Vì sinh viên đã được ghi vào file, nhấn F5 sẽ gọi lại `GET /api/students` và **vẫn thấy**
sinh viên vừa thêm.

### Ghi file an toàn

Lớp Database ghi ra file tạm rồi mới đổi tên, nên không bao giờ để lại file ghi dở. Các lần
đọc-sửa-ghi chạy lần lượt (`oneAtATime`), và việc kiểm tra ID trùng nằm trong cùng bước đó,
nên hai request thêm cùng lúc không ghi đè lên nhau và không thể cùng lọt qua kiểm tra trùng.

## 7. Các điểm kiến thức của buổi học

### Ranh giới giữa BE và FE

- **FE không truy cập dữ liệu trực tiếp.** Trong `frontend/` không có đoạn code nào đọc
  `students.json`. Mọi thao tác đọc ghi đi qua API: `GET /api/students` để đọc,
  `POST /api/students` để ghi.
- **BE không dựng HTML.** Backend chỉ trả JSON, kể cả khi lỗi: đường dẫn không tồn tại trả
  `404` JSON, body không phải JSON trả `400` JSON.
- **Hai bên chỉ chia sẻ hợp đồng JSON** (tên field của `Student`, mã trạng thái, `{ error }`),
  không chia sẻ code. Mỗi bên có `types.ts` riêng.
- **API là ranh giới tin cậy.** FE kiểm tra để phản hồi nhanh, nhưng BE luôn kiểm tra lại,
  vì request có thể gửi thẳng không qua form (ví dụ bằng `curl`).

### HTML shell và JS bundle

Khi trình duyệt mở `http://localhost:5173/`, thứ tự công việc diễn ra như sau:

1. Trình duyệt gửi một document request. Frontend trả về `index.html`, HTML shell chỉ có `<div id="root"></div>` và một thẻ `<script>`.
2. Trình duyệt tải JS bundle và `pixel.css`.
3. JS bundle chạy. React mount và dựng khung trang vào `#root` (đang tải).
4. React gửi `GET /api/students` (type `fetch`). Backend trả JSON, không phải HTML.
5. React đưa JSON vào state và render các card.

Phân biệt cái server gửi và cái người dùng thấy:

- **View Page Source** chỉ thấy `<div id="root">` rỗng, không có tên sinh viên.
- **Elements panel** trong DevTools thấy đầy đủ DOM do React dựng, gồm tất cả các card.
- Mở thẳng `http://localhost:5173/api/students` (hoặc `http://localhost:3000/api/students`) sẽ thấy danh sách dạng JSON: dữ liệu đi riêng, không nằm trong HTML.
- Tắt JavaScript thì trang trắng, chỉ hiện thông báo `<noscript>`.

Ở Block 1 (SSR), View Page Source đã có sẵn tên sinh viên, và trang vẫn chạy khi tắt
JavaScript.

### State và render

Trong CSR, giao diện là kết quả của state: React lấy mảng `students` và render một card
cho mỗi phần tử. Muốn đổi trang thì không sửa DOM bằng tay. Ta chỉ đổi state bằng
`setStudents(...)`, rồi React render lại.

Chỉ có **một nguồn state cho danh sách**:
`const [students, setStudents] = useState<Student[]>([])` trong `frontend/src/App.tsx`. Mọi
thứ khác được **suy ra** từ nó ở mỗi lần render, không lưu thành state riêng:

- số lượng sinh viên,
- thống kê (tổng, đang học, GPA trung bình),
- card của từng sinh viên trong `StudentList`.

### Controlled inputs

Mọi `<input>` trong form đều controlled: nó hiện `value={values.fullName}` lấy từ state,
và mỗi lần gõ gọi `onChange`, hàm này cập nhật state. Vậy state luôn là nguồn đúng, không
phải DOM. Nhờ đó ta reset form bằng cách đưa state về giá trị rỗng, và giữ nguyên nội dung
đã gõ khi backend báo lỗi.

### Không reload

Trang không load document mới sau lần tải đầu:

- Hàm xử lý form gọi `e.preventDefault()`, nên trình duyệt không gửi form và không tải trang mới.
- Khi submit chỉ có **một request `fetch`** (`POST /api/students`). Đó không phải document request.
- Backend trả JSON, `App` đưa bản ghi mới vào state, React thêm một card mới vào DOM. Các card cũ được giữ vì mỗi card có `key={student.id}`.

### Cập nhật state bất biến

Mảng `students` được thay bằng một mảng **mới** có sinh viên mới ở đầu:

```tsx
setStudents((current) => [saved, ...current]);
```

Ta không dùng `students.push(...)`. React so mảng cũ với mảng mới để biết có cần render
lại không. Mảng mới báo cho React biết dữ liệu đã đổi, còn push sẽ sửa mảng cũ tại chỗ và
React không nhận ra.

### CSR và SSR đặt cạnh nhau

| | Block 1: SSR (EJS) | Block 2: CSR (React) + API |
| --- | --- | --- |
| Số ứng dụng | Một ứng dụng chạy trên server | Hai phần: backend (API) và frontend (bundle JS) |
| Nơi dựng HTML | Server, bằng template engine | Trình duyệt, bằng component |
| Server trả về gì | HTML đầy đủ kèm dữ liệu | Frontend: HTML shell + JS bundle. Backend: JSON |
| View Page Source | Nội dung đầy đủ | Chỉ có `<div id="root">` |
| Tắt JavaScript | Trang vẫn chạy | Trang trắng |
| Thêm sinh viên | Form POST, redirect, rồi tải một document HTML mới | `preventDefault`, `fetch` POST JSON, rồi cập nhật state |
| Request khi thêm | `POST` (form) cộng redirect cộng `GET` (document mới) | Một `fetch` `POST /api/students`, không có document request |
| Server trả về khi thêm | `302` rồi một trang HTML đầy đủ | `201` kèm JSON sinh viên đã lưu |
| Lỗi validate | Server render lại cả trang form kèm lỗi | `400`/`409` kèm JSON lỗi; nội dung đã gõ còn trong state |
| Nơi lưu danh sách | `data/students.json` trên server | `backend/data/students.json`, và state trong trình duyệt |
| Sau khi F5 | Dữ liệu mới vẫn còn | Dữ liệu mới vẫn còn |

## 8. Đối chiếu yêu cầu

### Điều kiện đầu vào (slide 11)

| # | Yêu cầu | Dự án của nhóm | Kết quả |
| --- | --- | --- | --- |
| 01 | React starter hoặc framework component tương đương | React 19 và Vite 8 (`frontend/`) | Đạt |
| 02 | Seed data đúng như Block 1 | `backend/data/students.seed.json` giống hệt file của Block 1 (9 sinh viên), tải qua `GET /api/students` | Đạt |
| 03 | Sinh viên có `id`, `name`, `email` | Có `id`, `fullName`, `email` và thêm field khác | Đạt (field tên của nhóm là `fullName`, giống Block 1) |
| 04 | Không cần API hay database ở block này | Không có database server. Nhóm **thêm** backend API (`GET`/`POST /api/students`) theo sơ đồ "Ranh giới giữa BE và FE", dữ liệu nằm trong file JSON | Khác slide 11 có chủ đích, theo sơ đồ BE/FE của buổi học |

### Yêu cầu chức năng (slide 12)

**01. Render danh sách sinh viên từ state.**
`App` tải danh sách từ `GET /api/students` rồi lưu vào `students`. `StudentList` map nó ra
các `StudentRow`: `students.map(s => <StudentRow key={s.id} student={s} />)`. Hàng thống kê
ở trên cũng suy ra từ cùng state đó.

**02. Form Add Student dùng controlled inputs.**
`AddStudentForm` sở hữu state của form (`values`, `error`, `message`, `saving`). Mọi input
có `value={values[...]}` và `onChange`, không input nào giữ state riêng.

**03. Submit cập nhật UI ở client.**
Xem mục 6, "Ghi một sinh viên mới". Backend lưu và trả JSON; trình duyệt tự cập nhật state
và DOM, không nhận HTML nào từ server.

**04. Trang không reload khi thêm sinh viên.**
Không có document request và không có điều hướng khi submit. Request duy nhất là một
`fetch` `POST /api/students`. Xem minh chứng Network ở mục 10.

### Tiêu chí nghiệm thu (slide 14)

| # | Tiêu chí | Cách kiểm tra | Kết quả |
| --- | --- | --- | --- |
| 01 | Sinh viên mới xuất hiện ngay sau khi submit | Ngay khi backend trả `201`, card mới ở đầu danh sách, tổng số tăng từ 9 lên 10, card được cuộn vào tầm nhìn | Đạt |
| 02 | Network không có document request mới | Submit chỉ tạo một request `fetch` (`POST /api/students`, `201`), không có document request; `performance.getEntriesByType('navigation').length` vẫn là 1 | Đạt |
| 03 | Form được reset sau khi thêm | Họ tên, email, ID và ngành trống lại, GPA về giá trị mặc định | Đạt |
| 04 | Code chỉ có một nguồn state cho danh sách | Chỉ có một `useState<Student[]>` trong `frontend/src/App.tsx`; thống kê và danh sách card đọc từ đó | Đạt |

Ngoài ra nhóm đã thử:

- ID trùng với danh sách đang có: lỗi hiện ngay ở form, không gửi request.
- ID trùng với sinh viên do người khác vừa thêm (chưa có trong danh sách của trình duyệt):
  backend trả `409`, lỗi hiện trong form, không có card mới.
- Backend lỗi khi lưu (`500`): không có card mới, lỗi hiện trong form, nội dung đã gõ vẫn còn.
- Backend chậm: nút hiện "Saving…", form bị khóa, card chỉ hiện khi backend trả `201`.
- Gửi thẳng `POST` dữ liệu sai bằng `curl`: backend trả `400` (thiếu field, email sai,
  GPA trống) hoặc `409` (trùng ID); body không phải JSON trả `400` JSON.
- F5: vẫn thấy sinh viên vừa thêm. `npm run reset-data`: file về 9 sinh viên.

## 9. Cách kiểm tra

- Tắt JavaScript: trang trắng, chỉ hiện thông báo `<noscript>`.
- View Page Source: chỉ thấy `<div id="root">` rỗng, không có tên sinh viên.
- Elements panel: thấy đầy đủ các card do React dựng.
- Tab Network khi tải trang: có đúng một request `fetch` `GET /api/students`.
- Thêm một sinh viên hợp lệ: tab Network chỉ có một `fetch` `POST /api/students` (status `201`), không có document request. Card mới xuất hiện đầu danh sách, tổng số tăng, form reset. Mở `backend/data/students.json` thấy sinh viên mới ở đầu file.
- ID trùng hoặc dữ liệu sai: hiện thông báo lỗi, không thêm sinh viên.
- GPA để trống: hiện lỗi field bắt buộc và **không** thêm sinh viên (không bị nhận với GPA 0.00). GPA nhập chữ hoặc ngoài khoảng 0 đến 4 cũng bị từ chối.
- F5: tab Network có lại document request và `GET /api/students`, sinh viên vừa thêm vẫn còn.
- Mở `http://localhost:3000/api/students`: thấy JSON trực tiếp từ backend.
- `npm run reset-data`: file trở về 9 sinh viên ban đầu.

## 10. Minh chứng

| File | Nội dung |
| --- | --- |
| `evidence/component-diagram.png` (và `.svg`) | Sơ đồ BE/FE, cây component và chủ sở hữu state |
| `evidence/network-log.md` | Log request khi tải trang, sau khi submit và sau F5 |
| `evidence/state-before-submit.png` | Giao diện trước khi submit |
| `evidence/state-after-submit.png` | Giao diện sau khi submit |
| `evidence/demo.webm` | Video thao tác thêm sinh viên |

### 01. Sơ đồ component và chủ sở hữu state

![Component diagram](evidence/component-diagram.png)

Sơ đồ vẽ theo sơ đồ của buổi học. Cột nâu là backend: Router → Handler → Database →
`res.json()`. Cột xanh là frontend: `fetch()` → state → Component → DOM. Mũi tên "request"
đi từ `fetch()` sang Router, mũi tên đứt "JSON" đi từ `res.json()` về `fetch()`. Bên phải
là cây component: `App` và `AddStudentForm` (màu vàng) giữ state; `StudentList`,
`StudentRow` và các input không có state. Nét liền là props đi xuống, nét đứt là callback
`onAdd(values)` đi lên `App`.

### 02. Video

`evidence/demo.webm` ghi lại màn hình trong khi thực hiện các bước sau:

0. Chạy `npm run reset-data` để file có đúng 9 sinh viên, rồi `npm run dev`.
1. Mở DevTools ở tab Network (filter **All**, ô lọc để trống), rồi mở `http://localhost:5173/`. Cho thấy request `fetch` `GET /api/students` và 9 sinh viên.
2. Bấm nút xóa log trong tab Network.
3. Nhập Full name, ID, Email, Major và GPA, rồi bấm **Add student**.
4. Cho thấy tab Network chỉ có một `fetch` `POST /api/students` (status `201`), không có document request; card mới ở đầu danh sách, tổng số là 10, form trống.
5. Bấm vào request `POST` trong tab Network: tab Payload là JSON gửi đi, tab Response là JSON sinh viên backend đã lưu.
6. Mở `backend/data/students.json` trong editor: sinh viên mới nằm ở đầu file.
7. Nhấn F5: tab Network có document request và `GET /api/students`, sinh viên vừa thêm vẫn còn.

Lưu ý: video hiện tại được quay trước khi tách backend và frontend, nên chưa có request
`/api/students`. Nhóm cần quay lại theo các bước trên.

### 03. Network trước và sau submit

Log đầy đủ ở `evidence/network-log.md`. Tóm tắt:

| | Document request | Request tới app | Request khác |
| --- | --- | --- | --- |
| Lần tải trang đầu | 1 (`/`) | `pixel.css`, JS bundle, `GET /api/students` | Font từ Google Fonts |
| Sau submit | 0 | `POST /api/students` (`fetch`, `201`) | Có thể có font từ Google Fonts |
| Sau F5 | 1 (`/`) | `pixel.css`, JS bundle, `GET /api/students` (đã có sinh viên mới) | Font từ Google Fonts |

Sau submit, trình duyệt có thể tải thêm ký tự font VT323 từ Google Fonts (khi tên mới có
chữ tiếng Việt). Đó không phải request của ứng dụng. Điểm cần chứng minh vẫn đúng: submit
không tạo document request; request duy nhất của app là một `fetch` để lưu dữ liệu.

## 11. Đoạn code do AI sinh cần giải thích

Đây là đoạn code đi hết một vòng thêm sinh viên: từ form ở frontend, qua API, xuống file ở
backend, rồi quay lại state và DOM.

**Backend, Router** (`backend/src/routes/students.routes.ts`):

```ts
const router = Router();

router.get('/', listStudents);   // GET  /api/students -> read
router.post('/', createStudent); // POST /api/students -> write
```

**Backend, Handler** (`backend/src/handlers/students.handler.ts`):

```ts
/** POST /api/students -> 201 + saved student | 400 invalid | 409 duplicate ID */
export async function createStudent(req: Request, res: Response) {
  const parsed = parseStudent(req.body);
  if (parsed.error !== null) return res.status(400).json({ error: parsed.error });

  try {
    const result = await db.insert(parsed.student, (current) => duplicateIdError(parsed.student.id, current));
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.status(201).json(result.student);
  } catch (err) {
    console.error('Cannot write data/students.json:', err);
    res.status(500).json({ error: 'Cannot save the student on the server.' });
  }
}
```

**Backend, Database** (`backend/src/db/students.db.ts`):

```ts
export function insert(
  student: Student,
  canInsert: (current: Student[]) => string | null,
): Promise<{ ok: true; student: Student } | { ok: false; error: string }> {
  return oneAtATime(async () => {
    const students = await readFile();
    const error = canInsert(students);
    if (error) return { ok: false as const, error };
    students.unshift(student);
    await writeFile(students);
    return { ok: true as const, student };
  });
}
```

**Frontend, fetch()** (`frontend/src/api.ts`):

```ts
export async function createStudent(input: StudentInput): Promise<Student> {
  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res)); // 400 invalid, 409 duplicate ID, 500 cannot save
  return res.json(); // 201 Created + the saved student
}
```

**Frontend, state** (`frontend/src/App.tsx`):

```tsx
const [students, setStudents] = useState<Student[]>([]);

const addStudent = async (input: StudentInput): Promise<string | null> => {
  // The unique-ID check needs the full list, so wait until it has loaded.
  if (loadStatus !== 'ready') return 'The student list is still loading. Please wait a moment.';

  // 1. Quick check in the browser: clearly wrong data is not even sent.
  const check = checkNewStudent(input, students);
  if (check.error !== null) return check.error;

  // 2. fetch(): POST /api/students. The backend validates again and writes the file.
  let saved: Student;
  try {
    saved = await createStudent(input); // 201 + the saved student as JSON
  } catch (err) {
    return (err as Error).message; // 400 / 409 / 500: nothing changes, the form keeps what was typed
  }

  // 3. state: put the student the server saved into a NEW array (newest first).
  //    A new array tells React to render again; students.push(...) would change
  //    the old array in place and React would not notice.
  setStudents((current) => [saved, ...current]);
  return null;
};
```

**Frontend, component** (`frontend/src/components/AddStudentForm.tsx`):

```tsx
const submit = async (e: FormEvent) => {
  e.preventDefault(); // stop the browser from sending the form and loading a new document
  if (saving) return;

  setSaving(true);
  setMessage(null);
  const err = await onAdd(values); // 1. send the new student to the owner (App calls the API)
  setSaving(false);
  if (err) {
    setError(err); // 2a. invalid: keep what the user typed and show the error
    setMessage(null);
    return;
  }
  setError(null);
  const newId = values.id.trim(); // capture before the fields are reset
  setValues(emptyInput('')); // 2b. added: reset the fields
  setMessage('Student saved on the server and added to the list.');
  // 3. bring the new card into view ...
};
```

Giải thích:

- **Router** chỉ quyết định handler nào chạy cho mỗi method và path. Nó được gắn ở
  `app.use('/api/students', studentsRouter)` trong `app.ts`, nên `router.post('/')` nghĩa là
  `POST /api/students`.
- **Handler** đọc `req.body` (đã được `express.json()` chuyển từ JSON), kiểm tra bằng
  `parseStudent` và trả `400` nếu sai. Handler không tự đụng vào file; nó gọi lớp Database.
- **Database** `insert()` đọc file, gọi `canInsert` để kiểm tra ID trùng, `unshift` sinh viên
  vào đầu mảng rồi ghi lại file. Cả bước này chạy trong `oneAtATime`, nên hai request cùng lúc
  không ghi đè nhau. Nếu trùng ID, handler trả `409`.
- **`res.status(201).json(...)`** trả lại sinh viên đã lưu dạng JSON, không phải HTML.
- **`createStudent` ở FE** gửi `fetch` `POST` với body JSON. Nếu status không phải 2xx thì
  ném lỗi chứa `error` từ JSON của backend.
- **`addStudent` ở `App`** kiểm tra nhanh ở client trước (dữ liệu sai rõ ràng thì không gửi),
  rồi `await createStudent(input)`. Chỉ khi nhận `201` mới gọi `setStudents` với **bản backend
  đã lưu**. Nếu lỗi thì trả thông báo về form và state không đổi.
- **`setStudents((current) => [saved, ...current])`** tạo một mảng **mới** với sinh viên mới ở
  đầu, báo cho React render lại. Vì mỗi card có `key={student.id}`, React giữ các card cũ và
  chỉ tạo một card mới trong DOM.
- **`submit` ở form** chặn `preventDefault()` (lý do không reload), khóa form bằng `saving`
  trong lúc chờ, rồi reset form khi thành công. Khi lỗi, `values` không bị đổi nên nội dung
  đã gõ vẫn còn. Vì các input là controlled, `setValues(emptyInput(''))` làm các ô trống ngay.

## 12. Phạm vi đã bỏ

Để tập trung vào bài học, bản cuối chỉ có danh sách và form thêm. Nhóm đã bỏ search,
filter, sửa, xóa, hash router và vẽ sprite pixel. Theme pixel và hàng thống kê được giữ
lại, vì thống kê suy ra từ cùng state và không tốn thêm gì. Backend chỉ có hai route
`GET` và `POST /api/students`.

## 13. Tổng kết

| Phần | Trạng thái |
| --- | --- |
| Tách Backend (Router, Handler, Database, `res.json`) và Frontend (`fetch`, state, Component, DOM) | Đạt (`backend/` và `frontend/`) |
| Điều kiện đầu vào (React, seed từ Block 1, `id`/`name`/`email`) | Đạt |
| Đọc danh sách qua `GET /api/students` | Đạt |
| Ghi sinh viên mới qua `POST /api/students` vào `backend/data/students.json` | Đạt (`201`, `400`, `409`) |
| Render danh sách sinh viên từ state | Đạt |
| Form Add Student dùng controlled inputs | Đạt |
| Submit cập nhật UI ở client | Đạt |
| Không reload khi thêm sinh viên | Đạt (không có document request; chỉ một `fetch` để lưu) |
| Tiêu chí nghiệm thu 01 đến 04 | Đạt hết |
| Minh chứng | Sơ đồ, network log, ảnh chụp; video cần quay lại sau khi tách BE/FE |
