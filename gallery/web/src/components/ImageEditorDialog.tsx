import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Crop, FlipHorizontal2, History, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { api, ApiError, type EditResult, type Photo } from "../lib/api";
import {
  IDENTITY,
  MIN_EDGE,
  clamp,
  isFullFrame,
  resultSize,
  sameState,
  toOriginal,
  toView,
  viewSize,
  type EditState,
  type Rect,
  type Rotation,
} from "../lib/editGeometry";
import { numberFmt } from "../lib/format";
import { Dialog } from "./Dialog";
import { ErrorBox, Spinner } from "./Status";

interface Props {
  /** null = đóng */
  photo: Photo | null;
  onClose: () => void;
  onSaved: (photo: Photo) => void;
}

/**
 * Trình chỉnh sửa ảnh (bonus Block 11): cắt, xoay 90°, lật ngang, khôi phục bản gốc.
 * Xem trước ngay trên browser từ bản gốc đã chuẩn hóa (thu nhỏ), rồi gửi ĐẦY ĐỦ trạng thái hiện tại
 * cho server; server kiểm tra lại thông số và sinh version mới từ bản gốc.
 */
export function ImageEditorDialog({ photo, onClose, onSaved }: Props) {
  const titleId = useId();
  return (
    <Dialog open={photo !== null} onClose={onClose} title="Chỉnh sửa ảnh" titleId={titleId} size="xl">
      {photo && <Editor key={photo.id} photo={photo} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

type DragMode = "new" | "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: DragMode[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_POS: Record<string, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

function stateOf(photo: Photo): EditState {
  return photo.edit ? { crop: photo.edit.crop, rotate: photo.edit.rotate, flipH: photo.edit.flipH } : IDENTITY;
}

function Editor({ photo, onClose, onSaved }: { photo: Photo; onClose: () => void; onSaved: (photo: Photo) => void }) {
  const W = photo.original.width;
  const H = photo.original.height;
  const published = stateOf(photo);
  const [state, setState] = useState<EditState>(published);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: DragMode; start: [number, number]; startRect: Rect; pointerId: number } | null>(null);

  // Version đang công bố đổi (ví dụ sau 409 đã nạp version mới nhất): bắt đầu lại từ trạng thái đó
  const publishedKey = JSON.stringify(published);
  useEffect(() => {
    setState(JSON.parse(publishedKey) as EditState);
  }, [photo.version, publishedKey]);

  // Bản gốc thu nhỏ: cùng origin nên vẽ lên canvas không cần CORS
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetch(`/api/admin/photos/${photo.id}/source?max=1600`, { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => !cancelled && setImg(image);
        image.onerror = () => !cancelled && setLoadError("Không đọc được bản gốc");
        image.src = url;
      })
      .catch(() => !cancelled && setLoadError("Không tải được bản gốc để chỉnh sửa"));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo.id]);

  // Vẽ bản gốc đã xoay rồi lật (đúng thứ tự server áp dụng)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const pw = img.naturalWidth;
    const ph = img.naturalHeight;
    const size = viewSize(pw, ph, state.rotate);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.translate(size.width / 2, size.height / 2);
    if (state.flipH) ctx.scale(-1, 1);
    ctx.rotate((state.rotate * Math.PI) / 180);
    ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
  }, [img, state.rotate, state.flipH]);

  const view = viewSize(W, H, state.rotate);
  const viewRect = state.crop ? toView(state.crop, W, H, state.rotate, state.flipH) : null;
  const result = resultSize(state, W, H);
  const dirty = !sameState(state, published, W, H);
  const isOriginal = sameState(published, IDENTITY, W, H);

  const setViewRect = useCallback(
    (r: Rect | null) => {
      setState((s) => {
        if (!r) return { ...s, crop: null };
        const crop = toOriginal(r, W, H, s.rotate, s.flipH);
        return { ...s, crop: isFullFrame(crop, W, H) ? null : crop };
      });
    },
    [W, H],
  );

  /** Tọa độ con trỏ -> pixel trên view (bản gốc đã xoay/lật, chưa thu nhỏ) */
  const pointToView = (e: { clientX: number; clientY: number }): [number, number] => {
    const box = frameRef.current!.getBoundingClientRect();
    return [clamp(((e.clientX - box.left) / box.width) * view.width, 0, view.width), clamp(((e.clientY - box.top) / box.height) * view.height, 0, view.height)];
  };

  const onPointerDown = (mode: DragMode) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || !img) return;
    e.stopPropagation();
    e.preventDefault();
    frameRef.current?.setPointerCapture(e.pointerId);
    const start = pointToView(e);
    drag.current = { mode, start, startRect: viewRect ?? { x: 0, y: 0, width: view.width, height: view.height }, pointerId: e.pointerId };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const [px, py] = pointToView(e);
    const min = MIN_EDGE;
    if (d.mode === "new") {
      const x = Math.min(d.start[0], px);
      const y = Math.min(d.start[1], py);
      const w = Math.abs(px - d.start[0]);
      const h = Math.abs(py - d.start[1]);
      if (w >= min && h >= min) setViewRect({ x, y, width: w, height: h });
      return;
    }
    const r = d.startRect;
    const dx = px - d.start[0];
    const dy = py - d.start[1];
    if (d.mode === "move") {
      setViewRect({ ...r, x: clamp(r.x + dx, 0, view.width - r.width), y: clamp(r.y + dy, 0, view.height - r.height) });
      return;
    }
    let left = r.x;
    let top = r.y;
    let right = r.x + r.width;
    let bottom = r.y + r.height;
    if (d.mode.includes("w")) left = clamp(r.x + dx, 0, right - min);
    if (d.mode.includes("e")) right = clamp(r.x + r.width + dx, left + min, view.width);
    if (d.mode.includes("n")) top = clamp(r.y + dy, 0, bottom - min);
    if (d.mode.includes("s")) bottom = clamp(r.y + r.height + dy, top + min, view.height);
    setViewRect({ x: left, y: top, width: right - left, height: bottom - top });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  // Bàn phím trên khung chọn: mũi tên dời 1% (Shift: 10%)
  const onCropKey = (e: KeyboardEvent) => {
    if (!viewRect) return;
    const step = (e.shiftKey ? 0.1 : 0.01) * Math.max(view.width, view.height);
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const dlt = delta[e.key];
    if (!dlt) return;
    e.preventDefault();
    setViewRect({ ...viewRect, x: clamp(viewRect.x + dlt[0], 0, view.width - viewRect.width), y: clamp(viewRect.y + dlt[1], 0, view.height - viewRect.height) });
  };

  const rotateBy = (deg: 90 | -90) => setState((s) => ({ ...s, rotate: ((((s.rotate + deg) % 360) + 360) % 360) as Rotation }));

  const send = async (kind: "save" | "restore") => {
    setSaving(kind);
    setError(null);
    try {
      const body =
        kind === "restore"
          ? { baseVersion: photo.version, restore: true }
          : { baseVersion: photo.version, crop: isFullFrame(state.crop, W, H) ? null : state.crop, rotate: state.rotate, flipH: state.flipH };
      const res = await api<EditResult>(`/api/admin/photos/${photo.id}/edit`, { method: "POST", json: body });
      onSaved(res.photo);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        setError(`${err.message}. Đã tải version mới nhất, thay đổi chưa lưu của bạn bị bỏ.`);
        // Nạp version mới nhất; effect theo photo.version đặt lại trạng thái chỉnh sửa
        api<Photo>(`/api/admin/photos/${photo.id}`).then(onSaved).catch(() => {});
      } else {
        setError(err instanceof ApiError ? err.message : "Không lưu được chỉnh sửa");
      }
    } finally {
      setSaving(null);
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Công cụ chỉnh sửa">
        <button type="button" className="btn-secondary" onClick={() => rotateBy(-90)} disabled={!img}>
          <RotateCcw aria-hidden className="size-4" /> Xoay trái
        </button>
        <button type="button" className="btn-secondary" onClick={() => rotateBy(90)} disabled={!img}>
          <RotateCw aria-hidden className="size-4" /> Xoay phải
        </button>
        <button type="button" className="btn-secondary" aria-pressed={state.flipH} onClick={() => setState((s) => ({ ...s, flipH: !s.flipH }))} disabled={!img}>
          <FlipHorizontal2 aria-hidden className="size-4" /> Lật ngang
        </button>
        <button type="button" className="btn-secondary" onClick={() => setViewRect(null)} disabled={!img || !state.crop}>
          <Crop aria-hidden className="size-4" /> Bỏ vùng cắt
        </button>
        <button type="button" className="btn-ghost" onClick={() => setState(published)} disabled={!dirty}>
          <Undo2 aria-hidden className="size-4" /> Hoàn tác
        </button>
      </div>

      <div className="grid place-items-center rounded-lg bg-surface-2 p-3">
        {loadError ? (
          <ErrorBox>{loadError}</ErrorBox>
        ) : !img ? (
          <Spinner label="Đang tải bản gốc…" className="py-16" />
        ) : (
          <div
            ref={frameRef}
            className="relative inline-block touch-none select-none"
            onPointerDown={onPointerDown("new")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} className="block max-h-[58dvh] max-w-full cursor-crosshair" aria-label="Xem trước ảnh sau khi xoay và lật" role="img" />
            {viewRect && (
              <>
                {/* Phần bị cắt bỏ tối đi */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/55" style={{ clipPath: holePath(viewRect, view) }} />
                <div
                  tabIndex={0}
                  role="group"
                  aria-label="Vùng cắt. Kéo để di chuyển, dùng phím mũi tên để dời"
                  onKeyDown={onCropKey}
                  onPointerDown={onPointerDown("move")}
                  className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
                  style={{ left: pct(viewRect.x, view.width), top: pct(viewRect.y, view.height), width: pct(viewRect.width, view.width), height: pct(viewRect.height, view.height) }}
                >
                  <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                    {Array.from({ length: 9 }, (_, i) => (
                      <span key={i} className="border border-white/25" />
                    ))}
                  </div>
                  {HANDLES.map((h) => (
                    <span key={h} aria-hidden onPointerDown={onPointerDown(h)} className={`absolute size-3.5 rounded-sm border border-black/50 bg-white ${HANDLE_POS[h]}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-muted">
        Kéo trên ảnh để chọn vùng cắt. Kết quả:{" "}
        <strong className="text-fg">
          {numberFmt.format(result.width)} × {numberFmt.format(result.height)} px
        </strong>
        {state.crop && (
          <>
            {" "}
            · vùng cắt trên bản gốc {numberFmt.format(state.crop.x)}, {numberFmt.format(state.crop.y)} – {numberFmt.format(state.crop.width)} × {numberFmt.format(state.crop.height)} px
          </>
        )}
        {state.rotate !== 0 && <> · xoay {state.rotate}°</>}
        {state.flipH && <> · lật ngang</>}. Đang ở v{photo.version}; lưu sẽ tạo v{photo.version + 1} từ bản gốc.
      </p>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => send("restore")}
          disabled={saving !== null || isOriginal}
          title={isOriginal ? "Ảnh đang hiển thị đúng bản gốc" : "Sinh lại variant từ bản gốc, bỏ mọi chỉnh sửa"}
        >
          <History aria-hidden className="size-4" /> {saving === "restore" ? "Đang khôi phục…" : "Khôi phục bản gốc"}
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving !== null}>
            Hủy
          </button>
          <button type="button" className="btn-primary" onClick={() => send("save")} disabled={saving !== null || !dirty || !img}>
            {saving === "save" ? "Đang tạo version mới…" : "Lưu chỉnh sửa"}
          </button>
        </div>
      </div>
    </div>
  );
}

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

/** Lớp tối phủ ngoài vùng cắt: đa giác khung ngoài + lỗ hình chữ nhật (quy tắc evenodd). */
function holePath(r: Rect, view: { width: number; height: number }): string {
  const l = pct(r.x, view.width);
  const t = pct(r.y, view.height);
  const rr = pct(r.x + r.width, view.width);
  const b = pct(r.y + r.height, view.height);
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l} ${t}, ${l} ${b}, ${rr} ${b}, ${rr} ${t}, ${l} ${t})`;
}
