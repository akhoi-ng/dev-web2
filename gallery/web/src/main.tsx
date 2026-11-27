import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { AuthProvider, RequireAdmin } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { GalleryPage } from "./pages/GalleryPage";
import { LoginPage, NotFoundPage } from "./pages/LoginPage";
import { PhotoPage } from "./pages/PhotoPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AlbumsTab } from "./pages/admin/AlbumsTab";
import { LibraryTab } from "./pages/admin/LibraryTab";
import { StorageTab } from "./pages/admin/StorageTab";
import { UploadTab } from "./pages/admin/UploadTab";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<GalleryPage />} />
            <Route path="photos/:id" element={<PhotoPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route
              path="admin"
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route index element={<Navigate to="upload" replace />} />
              <Route path="upload" element={<UploadTab />} />
              <Route path="library" element={<LibraryTab />} />
              <Route path="albums" element={<AlbumsTab />} />
              <Route path="storage" element={<StorageTab />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
