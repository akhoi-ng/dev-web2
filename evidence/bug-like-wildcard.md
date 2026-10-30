# Lỗi: tìm `%` hoặc `_` trả về toàn bộ thực đơn

## Mô tả

Ô tìm kiếm món (`GET /api/dishes?q=...`, dùng ở `/dishes`) lọc bằng Prisma
`name: { contains: q, mode: "insensitive" }`. Prisma sinh `name ILIKE '%' || q || '%'` nhưng
**không escape** `%` và `_` trong `q`, nên hai ký tự này vẫn là ký tự đại diện của `LIKE`:

- `q=%` → mẫu `%%%` khớp mọi tên món.
- `q=_` → mẫu `%_%` khớp mọi tên có ít nhất một ký tự.

Người dùng gõ một ký tự đặc biệt lại nhận về toàn bộ thực đơn (deck Block 7, slide 25: "% và _ do
người dùng nhập không được mở rộng phạm vi tìm kiếm").

## Cách tái hiện

Database có seed Block 6 (51 món, không món nào chứa `%` hay `_` trong tên):

```bash
curl "http://localhost:3000/api/dishes?q=%25&page=1&pageSize=1"   # q=%
curl "http://localhost:3000/api/dishes?q=%5F&page=1&pageSize=1"   # q=_
```

Kỳ vọng: `meta.total = 0`. Thực tế: `meta.total = 51`.

## Trước khi sửa (commit chứa dòng acceptance mới, chưa có bản sửa)

`npm run acceptance`:

```text
PASS dishes: tổng số món
FAIL dishes: q=% là ký tự thường — total = 51, bằng toàn bộ 51 món
FAIL dishes: q=_ là ký tự thường — total = 51, bằng toàn bộ 51 món

2 dòng thất bại
```

Phản hồi (rút gọn):

```json
{"ok":true,"meta":{"page":1,"totalPages":51,"total":51,"pageSize":1},"firstItem":{"id":214,"name":"Salad Caesar"}}
{"ok":true,"meta":{"page":1,"totalPages":51,"total":51,"pageSize":1},"firstItem":{"id":214,"name":"Salad Caesar"}}
```

## Sửa

`escapeLike(text)` trong `api/src/utils/helpers.js` thêm dấu gạch ngược trước gạch ngược, `%`
và `_`, rồi `GET /api/dishes` truyền `contains: escapeLike(q)`. PostgreSQL dùng gạch ngược làm
ký tự escape mặc định của `LIKE`/`ILIKE`, nên `%` và `_` được so khớp như ký tự thường. Unit test
`escapeLike` ở `api/test/helpers.test.js` giữ hành vi này.

## Sau khi sửa

`npm run acceptance`:

```text
PASS dishes: tổng số món
PASS dishes: q=% là ký tự thường
PASS dishes: q=_ là ký tự thường
...
Tất cả dòng đều PASS
```

Phản hồi:

```json
{"ok":true,"data":[],"meta":{"page":1,"totalPages":1,"total":0,"pageSize":1}}
{"ok":true,"data":[],"meta":{"page":1,"totalPages":1,"total":0,"pageSize":1}}
```
