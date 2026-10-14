# Bài tập tuần 2: Student List dạng client-rendered

Group: 2

| MSSV | Họ và tên |
|---|---|
| 24127430 | Nguyễn Anh Khôi |
| 24127373 | Nguyễn Tấn Hiệu |
| 24127361 | La Anh Hào |
| 24127084 | Trần Nguyễn Tuấn Minh |

Project: UniPortal  
Stack: React 19, Vite 8, TypeScript. No API, no database. The student list lives in React state.

## 1. The task

Build the Student List from Block 1, but rendered on the client. The list must be
rendered from state, the Add Student form must use controlled inputs, and adding a
student must update the UI without reloading the page.

Our project does this. The sample students are stored in `src/seed.ts`, `App`
copies them into state once, and every later change happens in the browser.

The block notes say we do not need an API or a database. We follow that: there is
no server, and the browser never sends a request when you add a student.

## 2. Tech stack and why we chose it

| Part | What we use | Why |
|---|---|---|
| UI library | React 19 | The slides ask for a React starter or an equivalent component framework. React builds the page from components, and when the state changes it updates only the parts of the DOM that changed. |
| Build tool and dev server | Vite 8 | Vite gives a small React starter, serves the HTML shell in dev mode (`localhost:5173`, like the explainer) and builds one JS bundle for production. |
| Language | TypeScript | The `Student` type in `src/types.ts` keeps every component on the same field names. `tsconfig.json` type-checks the browser code. |
| Data | `src/seed.ts` | The sample students. `App` copies them into state once. There is no file or database write. |

## 3. What shows the ideas of this week's lesson

### HTML shell and JS bundle

When the browser opens `http://localhost:5173/`, the order of work is:

1. The browser sends one document request. The server answers with `index.html`, the HTML shell. It only has `<div id="root"></div>` and a `<script>` tag.
2. The browser downloads the JS bundle and `pixel.css`.
3. The JS engine runs the bundle. React mounts and renders the whole page into `#root`.

You can see the difference between what was sent and what the user sees:

- **View Page Source** shows only the empty `<div id="root">`. No student names.
- **Elements panel** in DevTools shows the full DOM that React built, with all the cards.
- If you turn off JavaScript, the page is blank and only shows the `<noscript>` message.

In Block 1 (SSR), View Page Source already had all the names, and the page still worked without JavaScript.

### State and rendering

In CSR, the UI is a result of the state: React takes the `students` array and renders
one card for each item. To change the page we never touch the DOM by hand. We only
change the state with `setStudents(...)`, and React renders again.

There is **only one source of state for the list**: `const [students, setStudents] =
useState<Student[]>(...)` in `src/App.tsx`. Everything else is **derived** from it on
each render and is not stored as extra state:

- the count of students,
- the stats (total, active, average GPA),
- the card for each student in `StudentList`.

### Controlled inputs

Every `<input>` in the form is controlled: it shows `value={values.fullName}` from
state, and every keystroke calls `onChange`, which updates the state. So the state is
always the truth, not the DOM. This lets us reset the form by setting the state back
to empty values.

### Data goes down, events go up

Components get data through **props** (down) and report events through **callbacks**
(up). `AddStudentForm` does not change the list itself. It calls `onAdd(values)`,
which is `addStudent` in `App`, and `App` is the only place that calls `setStudents`.

### No reload

The page never loads a new document after the first load:

- The form handler calls `e.preventDefault()`, so the browser does not send the form to a server.
- `App` puts the new record into state, and React adds one new card to the DOM. The old cards are kept because each card has `key={student.id}`.
- There is no request at all on submit, because nothing talks to a server.

### State transition

The `students` array is replaced with a **new** array that has the new student first:

```tsx
setStudents((current) => [student, ...current]);
```

We do not use `students.push(...)`. React compares the old array with the new one to
decide whether to render again. A new array tells React that something changed; a push
would change the old array in place and React would not notice.

Because there is no server, pressing F5 loads the shell and the bundle again and the
list goes back to the 9 sample students. This is expected for an in-memory CSR app.

### SSR and CSR side by side

| | Block 1: SSR (EJS) | Block 2: CSR (React) |
|---|---|---|
| Where HTML is built | Server, with a template engine | Browser, with components |
| What the server returns | Full HTML with the data | HTML shell + JS bundle |
| View Page Source | Full content | Only `<div id="root">` |
| JavaScript turned off | Page still works | Blank page |
| Add a student | Form POST, redirect, then a new HTML document | `preventDefault`, then update state |
| Requests when adding | `POST` + redirect + `GET` (new document) | None |
| Where the list is stored | `data/students.json` on the server | React state, seeded from `src/seed.ts` |
| After F5 | New data is still there | Back to the seed |

## 4. Starting conditions

| # | Requirement (slide 11) | Our project | Result |
|---|---|---|---|
| 01 | React starter or an equivalent component framework | React 19 + Vite 8 starter (`index.html`, `src/main.tsx`) | Done |
| 02 | Seed data exactly like Block 1 | The same 9 students, moved into `src/seed.ts` | Done |
| 03 | Student has `id`, `name`, `email` | Has `id`, `fullName`, `email` and more fields | Done (our field is called `fullName`, same as Block 1) |
| 04 | No API or database in this block | No server, no database; data lives in React state | Done |

## 5. Functional requirements

### 01. Render Student List from state

`App` owns `students`. `StudentList` maps it to `StudentRow` components:
`students.map(s => <StudentRow key={s.id} student={s} />)`. The stats at the top are
also derived from the same state.

### 02. Add Student form uses controlled inputs

`AddStudentForm` owns the form state (`values`, `error`). Every input has
`value={values[...]}` and `onChange`, and no input keeps its own state.

### 03. Submit updates the UI on the client

When the user presses **Add student**:

1. `preventDefault()` stops the normal form submit.
2. `AddStudentForm` calls `onAdd(values)`.
3. `App.addStudent` checks the values in the browser (required fields, email format, GPA 0 to 4, unique ID).
4. If the values are good, `App` calls `setStudents` and React renders again. The new card is first in the list and the stats go up by one.
5. `AddStudentForm` resets its fields and puts the cursor back in "Full name".

If the data is wrong, the state does not change, the error is shown above the form, and
what the user typed stays in the inputs.

### 04. The page does not reload when adding a student

There is no document request and no navigation on submit. See the Network evidence in
section 7.

## 6. Acceptance criteria

| # | Criterion (slide 14) | How we checked | Result |
|---|---|---|---|
| 01 | The new student appears right after submit | After submit the new card is first in the list, and the total goes from 9 to 10 | Pass |
| 02 | Network has no new document request | The submit makes no request at all; `performance.getEntriesByType('navigation').length` stays 1 | Pass |
| 03 | The form is reset after adding | Full name, email, major and ID are empty again, and GPA is back to its default | Pass |
| 04 | The code has only one source of state for the list | Only `useState<Student[]>` is in `App.tsx`; the stats read from it | Pass |

We also tested: a duplicate ID shows an error and keeps the typed values, and F5 brings
back the sample list.

## 7. Evidence

### 01. Component diagram and state owner

![Component diagram](evidence/component-diagram.png)

The yellow boxes are state owners. `App` owns the list (`students`).
`AddStudentForm` owns the form (`values`). Solid arrows are props going down, dashed
arrows are callbacks going up. `StudentList` and `StudentRow` have no state.

### 02. Recording of adding a student

`evidence/demo.webm` shows the screen while doing these steps with DevTools open on the
Network tab:

1. Open `http://localhost:5173/`. Show 9 students.
2. Press the clear button in the Network tab.
3. Fill Full name, ID, Email, Major and GPA, then press **Add student**.
4. Show no new request, the new card at the top, the total is 10, and the form is empty.

### 03. Network before and after submit

The full log is in `evidence/network-log.md`. Summary:

| | Document requests | Other requests |
|---|---|---|
| First page load | 1 (`/`) | `pixel.css`, the JS bundle and fonts |
| After submit | 0 | 0 |

### 04. Code from the agent that the group must explain

This is the code that makes a new student appear without a page reload. It is in two files.

`src/components/AddStudentForm.tsx`, the submit handler:

```tsx
const submit = (e: FormEvent) => {
  e.preventDefault();      // 1. stop the browser from loading a new document

  const err = onAdd(values);   // 2. send the new student up to the owner
  if (err) {
    setError(err);             // 3a. invalid: keep what the user typed, show the error
    return;
  }
  setError(null);
  setValues(emptyInput(''));   // 3b. added: reset the fields
  firstInputRef.current?.focus();
};
```

`src/App.tsx`, the state owner:

```tsx
const [students, setStudents] = useState<Student[]>(() => seedStudents.map((s) => ({ ...s })));

const addStudent = (input: StudentInput): string | null => {
  const student = toStudent(input);
  const error = validateStudent(student, students);
  if (error) return error;                     // instant check in the browser

  setStudents((current) => [student, ...current]);  // new array, new student first
  return null;
};
```

One controlled input, so the group can point at the mechanism:

```tsx
<input
  name="fullName"
  value={values.fullName}          // state -> input
  onChange={handleChange}          // input -> state
  placeholder="e.g. Maya Lin"
/>
```

Explanation:

- `useState<Student[]>(...)` creates the only list state. It starts from the seed.
- `submit` does not change the list itself. It sends the form values up with `onAdd(values)`. This is "push the new student up to the owner".
- `validateStudent` checks required fields, the email format, the GPA range and the unique ID before anything is added.
- `e.preventDefault()` stops the browser from sending the form and loading a new document. This is why there is no reload.
- `setValues(emptyInput(''))` resets the form, and because the inputs are controlled, the fields become empty right away.
- `setStudents((current) => [student, ...current])` makes a **new** array with the new student first, which tells React to render again.
- React then renders the list again. Because each card has `key={student.id}`, React keeps the old cards and only creates one new card in the DOM.

## 8. Extra scope we left out

To keep the assignment focused on the lesson, the final version has only the list and
the add form. Search, filters, edit, delete, the hash router and the pixel sprite
drawing were removed. The pixel theme and the stats row are kept, because the stats are
derived from the same state and cost nothing extra.

## 9. Summary

| Part | Status |
|---|---|
| Starting conditions (React, seed from Block 1, `id`/`name`/`email`) | Done |
| Render Student List from state | Done |
| Add Student form with controlled inputs | Done |
| Submit updates the UI on the client | Done |
| No reload when adding a student | Done (no request at all) |
| Acceptance criteria 01 to 04 | All pass |
| Evidence | Diagram, network log, screenshots and recording |

## How to run

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`. The app opens the student list.

For production:

```bash
npm run build
npm run preview
```
