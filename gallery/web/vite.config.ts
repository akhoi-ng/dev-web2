import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.GALLERY_API ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    // Cùng origin với SPA: cookie SameSite=Strict và kiểm tra Origin của server hoạt động như bản build
    proxy: {
      "/api": { target: API, changeOrigin: false },
      "/media": { target: API, changeOrigin: false },
    },
  },
  preview: { port: 5174, strictPort: true },
  build: { target: "es2022", sourcemap: true },
});
