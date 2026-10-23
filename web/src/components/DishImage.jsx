import { useState } from "react";
import { DEFAULT_DISH_IMAGE } from "../lib/restaurant.js";

// Ảnh món ăn; lỗi tải ảnh (hoặc không có src) thì dùng ảnh mặc định.
// Ghi nhớ src nào bị lỗi (thay vì cờ true/false) để src mới tự động được thử lại, không nháy ảnh mặc định.
export default function DishImage({ src, alt, className }) {
  const [failedSrc, setFailedSrc] = useState(null);

  return (
    <img
      src={!src || failedSrc === src ? DEFAULT_DISH_IMAGE : src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
