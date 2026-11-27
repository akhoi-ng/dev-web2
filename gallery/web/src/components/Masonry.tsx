import { useEffect, useMemo, useState } from "react";
import type { Photo } from "../lib/api";
import { BlurImage } from "./BlurImage";

// Số cột theo bề rộng viewport; `sizes` dùng cùng ngưỡng để browser chọn đúng variant
const BREAKPOINTS = [
  { query: "(min-width: 1280px)", columns: 5 },
  { query: "(min-width: 1024px)", columns: 4 },
  { query: "(min-width: 640px)", columns: 3 },
];
const DEFAULT_COLUMNS = 2;
/**
 * Bề rộng thật của một ô = (bề rộng nội dung - các khoảng gap) / số cột. Nội dung có padding 2×24px
 * (2×12px trên mobile), gap 12px (8px trên mobile), rộng tối đa 1600px. Tính sát để desktop DPR 1
 * dùng thumbnail 320px thay vì tải 960px.
 */
export const GRID_SIZES = [
  "(min-width: 1600px) 301px",
  "(min-width: 1280px) calc((100vw - 96px) / 5)",
  "(min-width: 1024px) calc((100vw - 84px) / 4)",
  "(min-width: 640px) calc((100vw - 72px) / 3)",
  "calc((100vw - 32px) / 2)",
].join(", ");

function currentColumns(): number {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  return BREAKPOINTS.find((b) => window.matchMedia(b.query).matches)?.columns ?? DEFAULT_COLUMNS;
}

function useColumns(): number {
  const [columns, setColumns] = useState(currentColumns);
  useEffect(() => {
    const lists = BREAKPOINTS.map((b) => window.matchMedia(b.query));
    const update = () => setColumns(currentColumns());
    lists.forEach((l) => l.addEventListener("change", update));
    return () => lists.forEach((l) => l.removeEventListener("change", update));
  }, []);
  return columns;
}

interface Props {
  photos: Photo[];
  onOpen: (index: number) => void;
}

/**
 * Masonry theo tỉ lệ khung hình thật (width/height đã lưu): mỗi ảnh vào cột đang thấp nhất, nên
 * hàng trên vẫn theo thứ tự mới nhất và không ảnh nào bị cắt.
 */
export function Masonry({ photos, onOpen }: Props) {
  const columns = useColumns();
  const layout = useMemo(() => {
    const cols: { photo: Photo; index: number }[][] = Array.from({ length: columns }, () => []);
    const heights = new Array<number>(columns).fill(0);
    photos.forEach((photo, index) => {
      let target = 0;
      for (let c = 1; c < columns; c++) if (heights[c]! < heights[target]! - 0.01) target = c;
      cols[target]!.push({ photo, index });
      heights[target]! += photo.height / photo.width;
    });
    return cols;
  }, [photos, columns]);

  return (
    <div className="flex gap-2 sm:gap-3">
      {layout.map((col, c) => (
        <ul key={c} className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3" role="list">
          {col.map(({ photo, index }) => (
            <li key={photo.id}>
              <a
                href={`/photos/${photo.id}`}
                onClick={(e) => {
                  // Giữ hành vi mở tab mới bằng Ctrl/Cmd/chuột giữa
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onOpen(index);
                }}
                className="group relative block overflow-hidden rounded-lg focus-visible:outline-offset-4"
              >
                <BlurImage
                  photo={photo}
                  sizes={GRID_SIZES}
                  eager={index < columns}
                  highPriority={index === 0}
                  imgClassName="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {photo.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
