import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";
import { Download, ExternalLink, Info } from "lucide-react";
import type { Photo } from "../lib/api";
import { formatBytes, formatDateTime, numberFmt, savedPercent } from "../lib/format";

interface Props {
  photos: Photo[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Gần tới ảnh cuối: tải thêm trang tiếp theo */
  onNearEnd?: () => void;
}

/**
 * Lightbox: phím mũi tên, vuốt trên mobile, zoom (pinch, cuộn chuột, nhấp đúp). srcSet đưa cả 3
 * variant để lightbox chọn 960px hay 1600px tùy kích thước màn hình và mật độ điểm ảnh.
 */
export function GalleryLightbox({ photos, index, onIndexChange, onClose, onNearEnd }: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const current = index >= 0 ? photos[index] : undefined;

  const slides = useMemo(
    () =>
      photos.map((p) => {
        const largest = p.variants.at(-1)!;
        return {
          src: largest.url,
          width: largest.width,
          height: largest.height,
          alt: p.altText,
          title: p.title,
          ...(p.description ? { description: p.description } : {}),
          srcSet: p.variants.map((v) => ({ src: v.url, width: v.width, height: v.height })),
        };
      }),
    [photos],
  );

  return (
    <Lightbox
      open={index >= 0}
      index={Math.max(index, 0)}
      close={onClose}
      slides={slides}
      plugins={[Captions, Counter, Zoom]}
      on={{
        view: ({ index: i }) => {
          onIndexChange(i);
          if (i >= photos.length - 3) onNearEnd?.();
        },
      }}
      carousel={{ finite: true, preload: 2 }}
      controller={{ closeOnBackdropClick: true }}
      zoom={{ maxZoomPixelRatio: 1.5, scrollToZoom: true }}
      captions={{ descriptionTextAlign: "start", descriptionMaxLines: 3 }}
      labels={{
        Previous: "Ảnh trước",
        Next: "Ảnh sau",
        Close: "Đóng (Esc)",
        Lightbox: "Trình xem ảnh",
        Carousel: "Băng chuyền ảnh",
        Slide: "Ảnh",
        "Photo gallery": "Bộ sưu tập ảnh",
        "{index} of {total}": "{index} / {total}",
        "Zoom in": "Phóng to",
        "Zoom out": "Thu nhỏ",
      }}
      toolbar={{
        buttons: [
          <button
            key="info"
            type="button"
            className="yarl__button"
            aria-label={showInfo ? "Ẩn thông số ảnh" : "Xem thông số ảnh"}
            aria-pressed={showInfo}
            title="Thông số ảnh"
            onClick={() => setShowInfo((v) => !v)}
          >
            <Info aria-hidden />
          </button>,
          current ? (
            <a key="download" className="yarl__button" href={current.original.downloadUrl} download aria-label="Tải ảnh gốc" title="Tải ảnh gốc">
              <Download aria-hidden />
            </a>
          ) : null,
          current ? (
            <Link key="detail" className="yarl__button" to={`/photos/${current.id}`} aria-label="Mở trang chi tiết" title="Trang chi tiết">
              <ExternalLink aria-hidden />
            </Link>
          ) : null,
          "zoom",
          "close",
        ],
      }}
      render={{
        controls: () => (showInfo && current ? <InfoPanel photo={current} /> : null),
      }}
    />
  );
}

function InfoPanel({ photo }: { photo: Photo }) {
  const medium = photo.variants.find((v) => v.width >= 960) ?? photo.variants.at(-1)!;
  return (
    <aside
      aria-label="Thông số ảnh"
      className="absolute right-3 top-16 z-10 w-[min(20rem,calc(100%-1.5rem))] rounded-xl bg-black/75 p-4 text-sm text-white shadow-xl backdrop-blur"
    >
      <h2 className="mb-3 font-semibold">{photo.title}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-white/60">Kích thước gốc</dt>
        <dd>
          {numberFmt.format(photo.width)} × {numberFmt.format(photo.height)} px
        </dd>
        <dt className="text-white/60">File tải lên</dt>
        <dd>
          {photo.source.format.toUpperCase()} · {formatBytes(photo.source.bytes)}
        </dd>
        <dt className="text-white/60">WebP {medium.width}px</dt>
        <dd>
          {formatBytes(medium.bytes)} <span className="text-emerald-300">(−{savedPercent(medium.bytes, photo.source.bytes)}%)</span>
        </dd>
        <dt className="text-white/60">Ngày đăng</dt>
        <dd>{formatDateTime(photo.createdAt)}</dd>
        {photo.album && (
          <>
            <dt className="text-white/60">Album</dt>
            <dd>{photo.album.title}</dd>
          </>
        )}
      </dl>
      <table className="mt-3 w-full text-xs">
        <caption className="mb-1 text-left text-white/60">Các variant WebP</caption>
        <tbody>
          {photo.variants.map((v) => (
            <tr key={v.width} className="border-t border-white/10">
              <td className="py-1">
                {v.width} × {v.height}
              </td>
              <td className="py-1 text-right">{formatBytes(v.bytes)}</td>
              <td className="py-1 text-right text-emerald-300">−{savedPercent(v.bytes, photo.source.bytes)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}
