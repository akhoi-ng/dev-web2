# Network log: before and after submit

Recorded automatically with Chromium (Playwright) on the **production build**
(`npm run build` + `npm start`, http://localhost:3100), 2026-10-13.

Requests made by the test machine's antivirus browser extension are excluded; they are
not part of the app.

## 1. Before submit: first page load

| # | Method | Type | Status | URL |
|---|---|---|---|---|
| 1 | GET | document | 200 | `/` |
| 2 | GET | stylesheet | 200 | `/pixel.css` |
| 3 | GET | script | 200 | `/assets/index-Cuoka0qx.js` |
| 4 | GET | stylesheet | 200 | `https://fonts.googleapis.com/css2?family=Handjet:wght@400..800&family=VT323&display=swap` |
| 5 | GET | stylesheet | 200 | `https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css` |
| 6 | GET | fetch | 200 | `/api/students` |
| 7-11 | GET | font | 200 | `fonts.gstatic.com`, `unpkg.com` (the icon font) |

- Document requests: **1** (the HTML shell `/`).
- The page itself is **not** in the HTML: the shell only has `<div id="root">`.
- The student data arrives as **JSON** from `GET /api/students`, and React renders
  the cards from it.
- Document navigations: **1**.
- Cards rendered after load: **9**.

## 2. After submit: adding a student

Filled the form (Full name "Network Log Test", ID `STU-2026-888`, email, major) and
pressed **Add student**.

| # | Method | Type | Status | URL |
|---|---|---|---|---|
| 1 | POST | fetch | 201 | `/api/students` |

- Requests: **1**, and it is a JSON `fetch`, not a form post.
- Document requests: **0**. Document navigations: **1** (still only the first load),
  so the page was not reloaded.
- Cards now: **10**. First card in the list: **Network Log Test** (marked "New").
- Form after submit: Full name = "" (empty), suggested ID = `STU-2026-889`.

## 3. After pressing F5

| | Cards |
|---|---|
| Before F5 | 10 |
| After F5 | **10** |

The page reloads the shell and the bundle, React calls `GET /api/students` again, and
the extra student is still there because the server saved it to `data/students.json`.

This is the difference from a plain in-memory CSR app, where F5 would go back to the
original records.

## Note on development mode

In `npm run dev`, React's `<StrictMode>` runs effects twice on purpose, so the first
load shows two `GET /api/students` calls. That is a development-only behaviour; the
production build above makes a single call. The second call is harmless because
loading the list is read-only.

## Screenshots

`state-before-submit.png` and `state-after-submit.png` were taken for the earlier,
API-less version. They must be re-taken: the wording under the list and the Network
panel (which now shows the `POST`) have changed.
