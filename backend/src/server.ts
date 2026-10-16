// Start the backend API on its own port. The frontend (Vite, port 5173) sends
// /api/... requests here through its proxy, so the browser only sees one origin.
import app from './app.ts';

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Backend API on http://localhost:${PORT}`);
  console.log(`- GET  http://localhost:${PORT}/api/students`);
  console.log(`- POST http://localhost:${PORT}/api/students`);
});
