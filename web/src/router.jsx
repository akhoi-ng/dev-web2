import { createBrowserRouter, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import RouteErrorPage, { RootErrorPage } from "./pages/RouteErrorPage.jsx";
import MenuPage from "./pages/MenuPage.jsx";
import DishPage from "./pages/DishPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";

// Các route trang (Task 9–11) được thêm vào mảng children bên dưới.
// Route không đường dẫn bọc các trang con để lỗi khi hiển thị trang vẫn giữ header/footer.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <RootErrorPage />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <Navigate to="/dishes" replace /> },
          { path: "dishes", element: <MenuPage /> },
          { path: "dishes/:id", element: <DishPage /> },
          { path: "about", element: <AboutPage /> },
          { path: "admin", element: <Navigate to="/admin/dishes" replace /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
