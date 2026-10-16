import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend is a static app: Vite serves the HTML shell and the JS bundle.
// It never touches data/students.json. Every read and write goes through the
// backend API. The proxy forwards /api/... to the backend on port 3000, so the
// browser talks to one origin (localhost:5173) and no CORS setup is needed.
const api = { '/api': 'http://localhost:3000' };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: api },   // npm run dev
  preview: { port: 4173, proxy: api },  // npm run preview (after build)
  build: { outDir: 'dist' },
});
