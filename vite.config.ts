import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite turns src/main.tsx (and everything it imports) into the JS bundle
// the browser downloads. Files in public/ (pixel.css) are copied as-is.
//
// /api is forwarded to the Express server (npm run dev starts both), so the
// browser sees one origin and never needs CORS.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
