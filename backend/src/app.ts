// The backend is an API only: it answers with JSON and never sends HTML.
// Request flow: Router -> Handler -> Database -> res.json()
import express, { type NextFunction, type Request, type Response } from 'express';
import studentsRouter from './routes/students.routes.ts';

const app = express();

app.use(express.json()); // read JSON request bodies into req.body

app.use('/api/students', studentsRouter);

// Any other path -> JSON 404. The backend never sends HTML pages.
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Body that is not valid JSON (or any other error) -> JSON error.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'Request body must be valid JSON.' });
  console.error(err);
  res.status(500).json({ error: 'Server error.' });
});

export default app;
