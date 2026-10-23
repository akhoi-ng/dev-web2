import { createBrowserRouter, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import RouteErrorPage, { RootErrorPage } from "./pages/RouteErrorPage.jsx";
import MenuPage from "./pages/MenuPage.jsx";
import DishPage from "./pages/DishPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import NewBookingPage from "./pages/bookings/NewBookingPage.jsx";
import BookingPage from "./pages/bookings/BookingPage.jsx";
import AdminBookingsPage from "./pages/admin/bookings/AdminBookingsPage.jsx";
import DishListPage from "./pages/admin/dishes/DishListPage.jsx";
import DishNewPage from "./pages/admin/dishes/DishNewPage.jsx";
import DishShowPage from "./pages/admin/dishes/DishShowPage.jsx";
import DishEditPage from "./pages/admin/dishes/DishEditPage.jsx";
import DishDeletePage from "./pages/admin/dishes/DishDeletePage.jsx";

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
          { path: "bookings/new", element: <NewBookingPage /> },
          { path: "bookings/:code", element: <BookingPage /> },
          { path: "admin", element: <Navigate to="/admin/dishes" replace /> },
          { path: "admin/bookings", element: <AdminBookingsPage /> },
          { path: "admin/dishes", element: <DishListPage /> },
          { path: "admin/dishes/new", element: <DishNewPage /> },
          { path: "admin/dishes/:id", element: <DishShowPage /> },
          { path: "admin/dishes/:id/edit", element: <DishEditPage /> },
          { path: "admin/dishes/:id/delete", element: <DishDeletePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
