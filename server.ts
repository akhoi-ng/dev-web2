// The one and only server.
//
// It does NOT build HTML for any screen. It has two jobs:
//   1. answer /api/... with JSON,
//   2. in production, hand the browser the built HTML shell + JS bundle.
//
// React then renders every screen in the browser and talks to these JSON
// routes, which is what makes this a client-side-rendered app.
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { readAll, transact, StorageError } from './server/storage.ts';
import { parseStudent, parseStudentUpdate, sameId } from './server/studentRules.ts';
import type { Student } from './src/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const parsedPort = Number.parseInt(process.env.PORT ?? '3000', 10);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

// `npm start` passes --prod: also serve the built bundle from dist/.
// In development the Vite dev server serves the app and proxies /api here.
const IS_PROD = process.argv.includes('--prod');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

/** Every error answer looks the same: { error: "..." } plus a real status code. */
function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

/**
 * What a route decided to do, decided *inside* the transaction so the answer
 * always matches the data that was actually on disk at that moment.
 */
type Outcome<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

function respond<T>(res: Response, outcome: Outcome<T>): void {
  if (outcome.ok) {
    res.status(outcome.status).json(outcome.data);
    return;
  }
  fail(res, outcome.status, outcome.error);
}

// ==========================================
// REST API ROUTES (the React client only talks to these)
// ==========================================

/** All students. The browser filters and sorts them, so there are no query params. */
app.get('/api/students', async (_req: Request, res: Response) => {
  res.json(await readAll());
});

/** One student by ID (case-insensitive). */
app.get('/api/students/:id', async (req: Request<{ id: string }>, res: Response) => {
  const id = req.params.id;
  const students = await readAll();
  const student = students.find((s) => sameId(s.id, id));
  if (!student) {
    fail(res, 404, 'Student record not found');
    return;
  }
  res.json(student);
});

/**
 * Add a student. The unique-ID check and the write happen in one transaction,
 * so two requests arriving at the same moment cannot both "win".
 */
app.post('/api/students', async (req: Request, res: Response) => {
  const parsed = parseStudent(req.body);
  if (!parsed.ok) {
    fail(res, 400, parsed.error);
    return;
  }

  const student = parsed.student;
  const outcome = await transact<Outcome<Student>>((students) => {
    if (students.some((s) => sameId(s.id, student.id))) {
      return { value: { ok: false, status: 409, error: `Student with ID "${student.id}" already exists.` } };
    }
    return { save: [student, ...students], value: { ok: true, status: 201, data: student } };
  });

  respond(res, outcome);
});

/** Update a student. The ID is immutable. */
app.put('/api/students/:id', async (req: Request<{ id: string }>, res: Response) => {
  const id = req.params.id;
  const outcome = await transact<Outcome<Student>>((students) => {
    const index = students.findIndex((s) => sameId(s.id, id));
    if (index === -1) {
      return { value: { ok: false, status: 404, error: 'Student not found' } };
    }

    const parsed = parseStudentUpdate(req.body, students[index]);
    if (!parsed.ok) {
      return { value: { ok: false, status: 400, error: parsed.error } };
    }

    const next = [...students];
    next[index] = parsed.student;
    return { save: next, value: { ok: true, status: 200, data: parsed.student } };
  });

  respond(res, outcome);
});

/** Delete a student. */
app.delete('/api/students/:id', async (req: Request<{ id: string }>, res: Response) => {
  const id = req.params.id;
  const outcome = await transact<Outcome<Student>>((students) => {
    const existing = students.find((s) => sameId(s.id, id));
    if (!existing) {
      return { value: { ok: false, status: 404, error: 'Student not found' } };
    }
    return {
      save: students.filter((s) => !sameId(s.id, id)),
      value: { ok: true, status: 200, data: existing },
    };
  });

  if (!outcome.ok) {
    fail(res, outcome.status, outcome.error);
    return;
  }
  const removed = outcome.data;
  res.json({ success: true, message: `Student ${removed.fullName} (${removed.id}) deleted successfully.` });
});

// ==========================================
// Unknown API routes answer with JSON, never with the HTML shell.
// Registered before the SPA fallback on purpose.
// ==========================================
app.use('/api', (_req: Request, res: Response) => {
  fail(res, 404, 'Unknown API endpoint.');
});

// ==========================================
// CLIENT-SIDE RENDERING
// ==========================================
function serveBuiltApp(): void {
  const distDir = path.resolve(__dirname, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.error('dist/ not found. Run "npm run build" first.');
    process.exit(1);
  }

  app.use(express.static(distDir, { index: false }));

  // Any other GET gets the same HTML shell; the hash router picks the screen.
  // A plain middleware (not app.get('*')) so it cannot swallow the API routes.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Development: Vite serves the app on its own port and proxies /api to us.
function explainToBrowsers(): void {
  app.use((_req: Request, res: Response) => {
    fail(res, 404, 'This is the API server only. Open the app at http://localhost:5173/');
  });
}

// Any error thrown above (including a broken data file) becomes clean JSON.
function handleErrors(): void {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;

    if (err instanceof StorageError) {
      console.error('[storage]', err.message);
      fail(res, 500, err.message);
      return;
    }

    const status = typeof (err as { status?: unknown })?.status === 'number'
      ? (err as { status: number }).status
      : 500;
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (status >= 500) console.error('[error]', err);
    fail(res, status, message);
  });
}

function start(): void {
  if (IS_PROD) serveBuiltApp();
  else explainToBrowsers();
  handleErrors();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UniPortal API (${IS_PROD ? 'production' : 'development'}) listening on http://localhost:${PORT}`);
    if (IS_PROD) {
      console.log(`- React app:  http://localhost:${PORT}/#/students`);
    } else {
      console.log('- REST API:   http://localhost:3000/api/students');
      console.log('- React app:  http://localhost:5173/#/students  (started by "npm run dev")');
    }
    console.log('- JSON persistence: data/students.json');
  });
}

start();
