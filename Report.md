# Bài tập tuần 2: Student List dạng client-rendered

Group: 2

| MSSV | Họ và tên |
|---|---|
| 24127430 | Nguyễn Anh Khôi |
| 24127373 | Nguyễn Tấn Hiệu |
| 24127361 | La Anh Hào |
| 24127084 | Trần Nguyễn Tuấn Minh |

Project: UniPortal (`university_magager_another/CSR`)  
Stack: React 19, Vite 8, TypeScript, Express 5. The pages are built in the browser; a small JSON API reads and writes `data/students.json`.

## 1. The task

The task is to build the same Student List as Block 1 (our SSR version), but rendered on the client. The list must be rendered from state, the Add Student form must use controlled inputs, and adding a student must update the UI in the browser without reloading the page.

Our project does this, and it also keeps the extra features of Block 1 (search, filters, stats, edit, delete and the pixel art theme). On top of that, the records are stored on the server, so they are still there after a reload.

The block notes say we do *not need* an API or a database. We added a small one anyway, because the old SSR version saved the students to `data/students.json` and we did not want to lose that. This does not change how the page is rendered: the server still never builds a page, it only answers with JSON.

## 2. Tech stack and why we chose it

| Part | What we use | Why |
|---|---|---|
| UI library | React 19 | The slides ask for a React starter or an equivalent component framework. React builds the page from components, and when the state changes it updates only the parts of the DOM that changed. |
| Build tool and dev server | Vite 8 | Vite gives a small React starter, serves the HTML shell in dev mode (`localhost:5173`, like the explainer) and builds one JS bundle for production. |
| Language | TypeScript | The `Student` type in `src/types.ts` makes sure every component and the API use the same field names. Two configs type-check the two sides: `tsconfig.json` (browser) and `tsconfig.server.json` (Node). |
| Data | `data/students.json`, read and written by the API | The file is the single source of the records. The browser never touches it; it only asks the API for JSON. |
| Router | Our own hash router (`src/router.ts`) | Changing the part of the URL after `#` never loads a new document. We use it for the edit screen and to keep the filters in the URL. |
| Server | Express 5 (`server.ts`) | It has two jobs: answer `/api/...` with JSON, and in production hand the browser the built `dist/` files. It never renders HTML for a screen. |
| Styles | The same `pixel.css` as Block 1 | The look stays the same, so it is easy to compare the two versions. |

### Why this is still client-side rendering

The test is simple: **who builds the HTML of the page?**

- Block 1 (SSR): the EJS template engine on the server built a full HTML document containing the student names.
- Here: the server sends an almost empty shell. React builds every screen in the browser, using data it fetched as JSON.

Having an API does not make an app server-rendered. Server-side rendering means the server produces the page's HTML. Our server only produces data.

## 3. What shows the ideas of this week's lesson

### HTML shell and JS bundle

When the browser opens `http://localhost:5173/`, the order of work is:

1. The browser sends one document request. The server answers with `index.html`, the HTML shell. It only has `<div id="root"></div>` and a `<script>` tag.
2. The browser downloads the JS bundle and `pixel.css`.
3. The JS engine runs the bundle. React mounts, calls `GET /api/students`, and renders the whole page into `#root`.

You can see the difference between what the server sent and what the user sees:

- **View Page Source** shows only the empty `<div id="root">`. No student names.
- **Elements panel** in DevTools shows the full DOM that React built, with all the cards.
- If you turn off JavaScript, the page is blank and only shows the `<noscript>` message.

In Block 1 (SSR), View Page Source already had all the names, and the page still worked without JavaScript.

### State and rendering

In CSR, the UI is a result of the state: React takes the `students` array and renders one card for each item. To change the page we never touch the DOM by hand. We only change the state with `setStudents(...)`, and React renders again.

There is **only one source of state for the list**: `const [students, setStudents] = useState<Student[]>([])` in `src/App.tsx`. It starts empty and is filled once by `GET /api/students`. Everything else is **derived** from it on each render and is not stored as extra state:

- the filtered list (`filterStudents(students, filters)`),
- the stats (total, active, average GPA),
- the lists of majors and years for the filter boxes,
- the student shown on the edit screen (`students.find(...)`).

### Controlled inputs

Every `<input>` and `<select>` in the forms is controlled: it shows `value={values.fullName}` from state, and every keystroke calls `onChange`, which updates the state. So the state is always the truth, not the DOM. This lets us:

- reset the form by setting the state back to empty values,
- keep what the user typed when there is a validation error,
- suggest the next free ID (`STU-2026-111`, then `STU-2026-112`, ...).

### Data goes down, events go up

Components get data through **props** (down) and report events through **callbacks** (up). `AddStudentForm` does not change the list itself. It calls `onAdd(values)`, which is `addStudent` in `App`, and `App` is the only place that calls `setStudents`. The same pattern is used for edit (`onUpdate`) and delete (`onDelete`).

### No reload

The page never loads a new document after the first load:

- The form handler calls `e.preventDefault()`, so the browser does not send the form to a server.
- The new student is sent with `POST /api/students`. The server saves it and answers with the saved record.
- `App` puts that record into state, and React adds one new card to the DOM. The old cards are kept because each card has `key={student.id}`.
- Moving between the list and the edit screen only changes the `#hash`, which never loads a new document.

So there *are* network requests now, but they are `fetch` calls that return JSON. None of them is a document request, and the page never reloads.

### Reload and state transition

The records live in `data/students.json` on the server:

- **Before submit:** the API returns 9 records (the seed).
- **After submit:** the server saves a 10th record and answers with it. `students` becomes a new array with 10 items, the new one first. The page shows it right away.
- **After pressing F5:** the browser loads the HTML shell and the bundle again, React calls `GET /api/students` and gets **10** records. The new student is still there.

This is the part that got better than the plain CSR version: because the server saves the data, a reload no longer throws our work away.

### SSR and CSR side by side

| | Block 1: SSR (EJS) | Block 2: CSR (React) |
|---|---|---|
| Where HTML is built | Server, with a template engine | Browser, with components |
| What the server returns | Full HTML with the data | HTML shell + JS bundle, and JSON from `/api` |
| View Page Source | Full content | Only `<div id="root">` |
| JavaScript turned off | Page still works | Blank page |
| Add a student | Form POST, redirect, then a new HTML document | `preventDefault`, `POST /api/students`, then update state |
| Requests when adding | `POST` + redirect + `GET` (new document) | One `POST /api/students` (JSON, no new document) |
| Where the list is stored | `data/students.json` on the server | `data/students.json` on the server, mirrored in React state |
| After F5 | New data is still there | New data is still there |

### Server-side script and client-side script

| | Server-side script | Client-side script |
|---|---|---|
| Files | `server.ts`, `server/storage.ts`, `server/studentRules.ts` | All of `src/` (`App.tsx`, components, pages, `router.ts`, `studentUtils.ts`, `sprite.ts`, `api.ts`) |
| Runs in | Node.js on the server | The user's browser |
| Can use | The file system, `.env` settings | The DOM, React state, `localStorage` (theme), canvas, `confirm()` |
| Can the user read the code? | No | Yes, in DevTools (Sources tab) |

In Block 1 almost everything was server-side. Here the server is only a data store, and everything that makes the page is client-side.

## 4. Starting conditions

| # | Requirement (slide 11) | Our project | Result |
|---|---|---|---|
| 01 | React starter or an equivalent component framework | React 19 + Vite 8 starter (`index.html`, `src/main.tsx`) | Done |
| 02 | Seed data exactly like Block 1 | The same `data/students.json` used by Block 1 (9 students), now read by the API instead of being bundled | Done |
| 03 | Student has `id`, `name`, `email` | Has `id`, `fullName`, `email` and 10 more fields | Done (our field is called `fullName`, same as Block 1) |
| 04 | No API or database in this block | The block says we do not need one. We kept a small JSON API so the old save behaviour is preserved; the page rendering is still 100% client-side | Extra, on purpose |

## 5. Functional requirements

### 01. Render Student List from state

`App` owns `students`. `StudentsPage` filters it, and `StudentList` maps it to `StudentRow` components: `students.map(s => <StudentRow key={s.id} student={s} ... />)`. The stats at the top are also computed from the same state.

### 02. Add Student form uses controlled inputs

`AddStudentForm` owns the form state (`values`, `error`). `StudentForm` draws the inputs: every input has `value={values[...]}` and `onChange`, and it has no state of its own. The form is placed next to the list (on a phone it is above the list), so the user can see the new student appear.

### 03. Submit updates the UI on the client

When the user presses **Add student**:

1. `preventDefault()` stops the normal form submit.
2. `AddStudentForm` calls `onAdd(values)`.
3. `App.addStudent` checks the values in the browser (required fields, email format, GPA 0 to 4, unique ID) so the error appears instantly.
4. It then calls `POST /api/students`. The server checks everything again and saves the record.
5. React renders again. The new card is first in the list, has a "New" tag and scrolls into view. The stats go up by one and a message appears.
6. `AddStudentForm` resets its fields and puts the cursor back in "Full name".

If the data is wrong, the state does not change, the error is shown above the form, and what the user typed stays in the inputs. The server is the final judge: if it refuses the record, its message is shown instead.

### 04. The page does not reload when adding a student

There is no document request and no navigation after submit (see the Network evidence in section 8). Only a `fetch` call to `/api/students` happens. The URL only changes inside the `#hash` when needed.

## 6. How we built it (the 40-minute process)

| Step (slide 13) | What we did |
|---|---|
| 01. State model: choose the owner for students and for the form | `students` belongs to `App`, because the list, the stats, the add form and the edit screen all need it. The form values belong to `AddStudentForm`, because only the form needs them while the user is typing. |
| 02. Split components: list, row and add form | `StudentList` (list + infinite scroll), `StudentRow` (one card), `AddStudentForm` (form state) and `StudentForm` (the inputs). |
| 03. Connect events: push the new student up to the owner | `AddStudentForm` calls `onAdd(values)`; `App.addStudent` validates, saves through the API and calls `setStudents`. Edit and delete use `onUpdate` and `onDelete` the same way. |
| 04. Observe: check reload and state transition | We checked the Network panel (a `fetch` on submit, but no document request) and pressed F5 to see the saved data come back. |

## 7. Acceptance criteria

| # | Criterion (slide 14) | How we checked | Result |
|---|---|---|---|
| 01 | The new student appears right after submit | After submit the new card is first in the list with a "New" tag, and the total goes from 9 to 10 | Pass |
| 02 | Network has no new document request | The submit makes one `fetch` to `/api/students`; `performance.getEntriesByType('navigation').length` stays 1 | Pass |
| 03 | The form is reset after adding | Full name, email and major are empty again, and the suggested ID moves to the next number | Pass |
| 04 | The code has only one source of state for the list | Only `useState<Student[]>` is in `App.tsx`; filters, stats and the edit screen read from it | Pass |

We also tested: a duplicate ID shows an error and keeps the typed values, edit and delete update the same state, the filters still work, and F5 brings back the saved list.

## 8. Evidence

### 01. Component diagram and state owner

![Component diagram](evidence/component-diagram.png)

The two yellow boxes are state owners. `App` owns the list (`students`). `AddStudentForm` owns the form (`values`). Solid arrows are props going down, dashed arrows are callbacks going up. `StudentForm` and `StudentRow` have no state.

### 02. Recording of adding a student

The group records the screen while doing these steps (DevTools open on the Network tab, filter "Fetch/XHR"):

1. Open `http://localhost:5173/#/students`. Show 9 students.
2. Press the clear button in the Network tab.
3. Fill Full name, Email and Major, then press **Add student**.
4. Show one `POST /api/students` request, the new card at the top, the total is 10, and the form is empty.
5. Press F5 and show that the list still has 10 students, now loaded from the API.

### 03. Network before and after submit

The full log is in `evidence/network-log.md`. Summary:

| | Document requests | Other requests |
|---|---|---|
| First page load | 1 (`/`) | `pixel.css`, the JS bundle, fonts and icons, plus `GET /api/students` |
| After submit | 0 | 1 (`POST /api/students`, JSON) |

The screenshots `evidence/state-before-submit.png` and `evidence/state-after-submit.png` were taken for the earlier, API-less version and must be re-taken (the on-screen wording and the Network panel have changed).

### 04. Code from the agent that the group must explain

This is the code that makes a new student appear without a page reload. It is in three files.

`src/components/AddStudentForm.tsx`, runs when the form is submitted:

```tsx
const submit = async () => {
  if (submittingRef.current) return;   // ignore a second click while saving
  submittingRef.current = true;
  setSaving(true);
  try {
    const err = await onAdd(values);   // 1. send the new student to the owner
    if (err) {
      setError(err);                   // 2a. invalid: keep what the user typed
      return;
    }
    setError(null);
    // 2b. added: reset the form, with a fresh suggested ID
    setValues(emptyInput(nextStudentId([toStudent(values), ...students])));
    firstInputRef.current?.focus();
  } finally {
    submittingRef.current = false;
    setSaving(false);
  }
};
```

`src/App.tsx`, the state owner:

```tsx
const [students, setStudents] = useState<Student[]>([]);

const addStudent = async (input: StudentInput): Promise<string | null> => {
  const localError = validateStudent(toStudent(input), students);
  if (localError) return localError;          // instant feedback in the browser

  try {
    const created = await api.createStudent(input);   // server saves it
    setStudents((prev) => [created, ...prev]);        // new array, new student first
    setLastAddedId(created.id);
    navigate('/students', `Student ${created.fullName} added. Saved to the server, no page reload.`);
    return null;
  } catch (err) {
    return message(err);                      // show whatever the server said
  }
};
```

`src/api.ts`, the only place the browser talks to the server:

```tsx
createStudent(input: StudentInput) {
  return request<Student>('/api/students', { method: 'POST', body: JSON.stringify(input) });
}
```

Explanation:

- `useState<Student[]>([])` creates the only list state. It starts empty and is filled by `loadStudents()`.
- `submit` does not change the list itself. It sends the form values up with `onAdd(values)`. This is "push the new student up to the owner".
- `validateStudent` is a **second, faster check** in the browser. The real check is `parseStudent` in `server/studentRules.ts`, because a user can send any request to the API.
- `api.createStudent` is a `fetch` that returns JSON. It is not a form submit, so the browser does not navigate.
- `setStudents((prev) => [created, ...prev])` makes a **new** array with the new student first. We do not use `students.push(...)`, because React compares the old and new array to know that something changed. A new array tells React to render again.
- React then renders the list again. Because each card has `key={student.id}`, React keeps the old cards and only creates one new card in the DOM.
- `setLastAddedId` remembers the new ID so the new card gets the "New" tag.
- `navigate('/students', ...)` only changes the `#hash` and shows a message. It does not load a new document.
- Back in `submit`, `onAdd` returned `null`, so the form calls `setValues(emptyInput(...))`. Because the inputs are controlled, the fields become empty right away, and the next free ID is suggested.

### 05. Concurrency and safety (server side)

- `transact()` in `server/storage.ts` runs every read-modify-write one at a time, so two people saving at the same moment cannot overwrite each other.
- Writes go to a temporary file and are then renamed over `students.json`, so a crash cannot leave a half-written file.
- The ID is forced to the stored value on update, so a client cannot rename a record.
- Unknown fields in a request body are ignored, so extra keys cannot be smuggled into the file.
- If `students.json` is unreadable or contains invalid JSON, the API returns a clear 500 error instead of pretending the data is the old seed.

## 9. Extra features (more than the task asks)

- Search by name, ID, email, major or department, and filters for major, status, cohort year and minimum GPA, all computed from state. The filters are kept in the URL hash.
- Stats at the top: total, active, average GPA, filtered count, also computed from state.
- Edit (`#/students/edit/:id`) and delete with confirmation, both changing the same state through `App`.
- The new card has a "New" tag and scrolls into view; a message shows for 4 seconds.
- Pixel art theme with light and dark mode, a pixel character for each student (`sprite.ts`, drawn on a canvas), and a list that shows 12 more cards while scrolling.
- Loading and error states for the first data load, with a "Try again" button.

## 10. Summary

| Part | Status |
|---|---|
| Starting conditions (React, seed from Block 1, `id`/`name`/`email`) | Done |
| Render Student List from state | Done |
| Add Student form with controlled inputs | Done |
| Submit updates the UI on the client | Done |
| No reload when adding a student | Done (no document request) |
| Acceptance criteria 01 to 04 | All pass |
| Evidence | Diagram and network log in this report; the recording is made by the group |

## How to run

```bash
npm install
npm run dev
```

This starts the Vite dev server (`http://localhost:5173`) and the Express API (`http://localhost:3000`) together. Open `http://localhost:5173`. The app opens the student list (`#/students`).

For production:

```bash
npm run build
npm start
```

Open `http://localhost:3000`.
