import { useEffect, useState } from "react";
import { DEFAULT_DISH_IMAGE } from "../lib/restaurant.js";

// Ảnh món ăn; lỗi tải ảnh (hoặc không có src) thì dùng ảnh mặc định.
export default function DishImage({ src, alt, className }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <img
      src={failed || !src ? DEFAULT_DISH_IMAGE : src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
