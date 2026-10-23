import { createBrowserRouter, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

// Các route trang (Task 8–11) được thêm vào mảng children bên dưới.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dishes" replace /> },
      { path: "admin", element: <Navigate to="/admin/dishes" replace /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
