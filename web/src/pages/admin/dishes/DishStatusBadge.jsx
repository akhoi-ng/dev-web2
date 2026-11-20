// Block 10: trạng thái đăng của món (draft chỉ thấy ở trang quản trị; khách chỉ thấy published)
export const DISH_STATUS_LABELS = { draft: "Nháp", published: "Đã đăng" };

export default function DishStatusBadge({ status }) {
  const cls =
    status === "published"
      ? "bg-sky-100 text-sky-700"
      : "bg-amber-100 text-amber-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`} data-dish-status={status}>
      {DISH_STATUS_LABELS[status] || status}
    </span>
  );
}

// Giao diện chỉ ẩn / hiện nút; API vẫn kiểm tra quyền ở mỗi request ghi
export const canCreateDishUi = (user) =>
  Boolean(user && (user.role === "admin" || (user.role === "editor" && Number.isInteger(user.chefId))));
