import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite turns src/main.tsx (and everything it imports) into the JS bundle
// the browser downloads. Files in public/ (pixel.css) are copied as-is.
// There is no API, so no /api proxy is needed.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
});
