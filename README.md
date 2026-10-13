<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your UniPortal app (Client-Side Rendering)

Every screen is rendered in the browser. The server never builds a page: it sends an HTML shell plus a JavaScript bundle, and React draws the whole UI from the data it fetches.

Student data is served as JSON by a small Express API that reads and writes `data/students.json`. Because the records are stored on the server, adding, editing or deleting a student is saved and **survives a page reload**.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app (starts the API and the Vite dev server together):
   `npm run dev`
3. Open the app in your browser:
   `http://localhost:5173/#/students`

`npm run dev` runs two processes at once:

| Process | URL | What it does |
|---|---|---|
| Vite (`dev:web`) | `http://localhost:5173` | Serves the HTML shell + JS bundle and hot-reloads the React code. This is the address you open. |
| Express API (`dev:api`) | `http://localhost:3000` | Answers `/api/...` with JSON. Vite forwards `/api` to it, so the browser sees one origin. |

You can also run them in separate terminals with `npm run dev:api` and `npm run dev:web`.

## Build for Production

1. Build the HTML shell and JS bundle into `dist/`:
   `npm run build`
2. Serve the built app (and the API) from one server:
   `npm start`
3. Open the app:
   `http://localhost:3000/#/students`

## Other scripts

| Script | What it does |
|---|---|
| `npm run lint` | Type-checks the browser code and the server code. |
| `npm run dev:api` | Runs only the Express API. |
| `npm run dev:web` | Runs only the Vite dev server. |

## Where things live

| Path | Role |
|---|---|
| `index.html` | The HTML shell. It only contains `<div id="root">`; the server sends this as-is. |
| `src/` | All the browser code. React components, pages, the hash router and the pure helpers. |
| `src/api.ts` | The only place the browser talks to the server (`fetch`). |
| `server.ts` | The Express API. It only returns JSON (and, in production, the built files). |
| `server/` | Server-only storage and validation. Never imported by `src/`. |
| `data/students.json` | The stored records — the single source of data. |

> If `data/students.json` is missing or invalid, the API reports the problem instead of quietly serving old demo data.
