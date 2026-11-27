import { useEffect, useRef, useState } from "react";
import type { Photo } from "../lib/api";

interface Props {
  photo: Photo;
  /** Mô tả chiều rộng hiển thị để browser chọn variant trong srcset */
  sizes: string;
  /** Ảnh trong màn hình đầu tiên: không lazy */
  eager?: boolean;
  /** Ứng viên LCP (tối đa 1-2 ảnh mỗi trang): fetchpriority="high" */
  highPriority?: boolean;
  className?: string;
  imgClassName?: string;
}

/**
 * Ảnh responsive: srcset liệt kê đúng các variant đã sinh kèm chiều rộng thật, width/height của ảnh
 * gốc giữ chỗ (không giật layout), ảnh 16px làm nền mờ cho tới khi ảnh thật tải xong.
 */
export function BlurImage({ photo, sizes, eager = false, highPriority = false, className = "", imgClassName = "" }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Ảnh đã có trong cache có thể xong trước khi React gắn onLoad
    if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, [photo.src]);

  return (
    <div className={`relative overflow-hidden bg-surface-2 ${className}`} style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
      {photo.blurDataUrl && !loaded && (
        <span
          aria-hidden
          className="absolute inset-0 scale-110 bg-cover bg-center blur-xl"
          style={{ backgroundImage: `url("${photo.blurDataUrl}")` }}
        />
      )}
      <img
        ref={ref}
        src={photo.src}
        srcSet={photo.srcSet}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={photo.altText}
        loading={eager || highPriority ? "eager" : "lazy"}
        decoding="async"
        {...(highPriority ? ({ fetchpriority: "high" } as object) : {})}
        data-loaded={loaded}
        onLoad={() => setLoaded(true)}
        className={`blur-up relative block h-full w-full object-cover ${imgClassName}`}
      />
    </div>
  );
}
