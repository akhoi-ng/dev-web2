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
import ChefListPage from "./pages/admin/chefs/ChefListPage.jsx";
import ChefNewPage from "./pages/admin/chefs/ChefNewPage.jsx";
import ChefShowPage from "./pages/admin/chefs/ChefShowPage.jsx";
import ChefEditPage from "./pages/admin/chefs/ChefEditPage.jsx";
import ChefDeletePage from "./pages/admin/chefs/ChefDeletePage.jsx";
import IngredientListPage from "./pages/admin/ingredients/IngredientListPage.jsx";
import IngredientNewPage from "./pages/admin/ingredients/IngredientNewPage.jsx";
import IngredientShowPage from "./pages/admin/ingredients/IngredientShowPage.jsx";
import IngredientEditPage from "./pages/admin/ingredients/IngredientEditPage.jsx";
import IngredientDeletePage from "./pages/admin/ingredients/IngredientDeletePage.jsx";

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
          { path: "admin/chefs", element: <ChefListPage /> },
          { path: "admin/chefs/new", element: <ChefNewPage /> },
          { path: "admin/chefs/:id", element: <ChefShowPage /> },
          { path: "admin/chefs/:id/edit", element: <ChefEditPage /> },
          { path: "admin/chefs/:id/delete", element: <ChefDeletePage /> },
          { path: "admin/ingredients", element: <IngredientListPage /> },
          { path: "admin/ingredients/new", element: <IngredientNewPage /> },
          { path: "admin/ingredients/:id", element: <IngredientShowPage /> },
          { path: "admin/ingredients/:id/edit", element: <IngredientEditPage /> },
          { path: "admin/ingredients/:id/delete", element: <IngredientDeletePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
