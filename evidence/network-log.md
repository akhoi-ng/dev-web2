# Network log: before and after submit

Recorded automatically with Chromium (Playwright) on the **production build**
(`npm run build` + `npm run preview`, http://localhost:4173).

Requests made by the test machine's antivirus browser extension are excluded; they are
not part of the app.

## 1. Before submit: first page load

| Method | Type | Status | URL |
|---|---|---|---|
| GET | document | 200 | http://localhost:4173/ |
| GET | stylesheet | 200 | http://localhost:4173/pixel.css |
| GET | script | 200 | http://localhost:4173/assets/index-CxMWZUZ9.js |
| GET | stylesheet | 200 | https://fonts.googleapis.com/css2?family=Handjet:wght@400..800&family=VT323&display=swap |
| GET | font | 200 | https://fonts.gstatic.com/s/handjet/v23/oY108eXHq7n1OnbQrOY_2FrEwYEMLlcdP1mCtZaLaTutCwcIhGZelk3Fgt0.woff2 |
| GET | font | 200 | https://fonts.gstatic.com/s/handjet/v23/oY108eXHq7n1OnbQrOY_2FrEwYEMLlcdP1mCtZaLaTutCwcIhGZel03Fgt0.woff2 |
| GET | font | 200 | https://fonts.gstatic.com/s/handjet/v23/oY108eXHq7n1OnbQrOY_2FrEwYEMLlcdP1mCtZaLaTutCwcIhGZemE3F.woff2 |
| GET | font | 200 | https://fonts.gstatic.com/s/vt323/v18/pxiKyp0ihIEF2isfFJU.woff2 |

- Document requests: **1** (the HTML shell `/`).
- App requests (origin http://localhost:4173): **3**. The rest are fonts from Google Fonts.
- The page itself is **not** in the HTML: the shell only has `<div id="root">`.
- Cards rendered after load: **9** (the seed in `src/seed.ts`).

## 2. After submit: adding a student

Filled the form (Full name "Đỗ Thị Ngọc Anh", ID `STU-2026-777`, email, major) and
pressed **Add student**.

| Method | Type | Status | URL |
|---|---|---|---|
| GET | font | 200 | https://fonts.gstatic.com/s/vt323/v18/pxiKyp0ihIEF2isRFJXGdg.woff2 |
| GET | font | 200 | https://fonts.gstatic.com/s/vt323/v18/pxiKyp0ihIEF2isQFJXGdg.woff2 |


- **App requests: 0.** There is no API, so the app sends nothing.
- Document requests: **0**, so the page was not reloaded.
- Cards now: **10**. First card in the list: **Đỗ Thị Ngọc Anh**.
- Form after submit: Full name = "" (empty).

## 3. After pressing F5

| | Cards |
|---|---|
| Before F5 | 10 |
| After F5 | **9** |

There is no server, so the new student is not kept. After F5 the list is back to the
9 sample students from `src/seed.ts`. This is the expected behaviour
for an in-memory client-side app.

## Screenshots and recording

- `state-before-submit.png`: the list with the seed students.
- `state-after-submit.png`: the new student first, total is 10, form reset.
- `demo.webm`: real screen recording on the computer with DevTools open on the Network tab (demonstrating no page reload and no new app requests after submit).
