import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, CircleX, ImagePlus, LoaderCircle, Pencil, Trash2, UploadCloud, X } from "lucide-react";
import { api, ApiError, type Album, type FileError, type Photo, type UploadLimits } from "../../lib/api";
import { ERROR_LABELS, formatBytes, pickVariant, savedPercent } from "../../lib/format";
import { planBatches, uploadBatch, type ServerStage } from "../../lib/upload";
import { EditPhotoDialog } from "../../components/EditPhotoDialog";
import { ErrorBox } from "../../components/Status";
import { useDocumentTitle } from "../../hooks/usePhotoFeed";

type ItemState = "queued" | "uploading" | "waiting" | ServerStage | "done" | "error";

interface Item {
  id: string;
  file: File;
  preview: string;
  title: string;
  altText: string;
  description: string;
  state: ItemState;
  /** 0..1; null = chưa biết (thanh tiến trình không xác định) */
  progress: number | null;
  photo?: Photo;
  error?: FileError;
}

const STAGE_LABEL: Record<ItemState, string> = {
  queued: "Chờ tải lên",
  uploading: "Đang tải lên",
  waiting: "Đã nhận, chờ xử lý",
  validating: "Đang kiểm tra file",
  processing: "Đang tạo WebP 3 kích thước",
  storing: "Đang đẩy lên kho lưu trữ",
  saving: "Đang lưu metadata",
  done: "Hoàn tất",
  error: "Bị từ chối",
};
// Tải lên chiếm 0-50% thanh tiến trình, các bước trên server chiếm phần còn lại
const STAGE_PROGRESS: Partial<Record<ItemState, number>> = { waiting: 0.5, validating: 0.55, processing: 0.65, storing: 0.82, saving: 0.94, done: 1 };
const ACTIVE: ItemState[] = ["uploading", "waiting", "validating", "processing", "storing", "saving"];

const titleFrom = (name: string) => {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[_\-.]+/g, " ").trim();
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1, 120) : "";
};

export function UploadTab() {
  useDocumentTitle("Tải ảnh lên");
  const formId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [limits, setLimits] = useState<UploadLimits | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [albumId, setAlbumId] = useState("");
  const [tags, setTags] = useState("");
  // Kho admin chọn cho lượt tải; rỗng = chưa tải xong giới hạn (dùng kho mặc định của server)
  const [storage, setStorage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    api<UploadLimits>("/api/admin/upload-limits")
      .then((l) => {
        setLimits(l);
        setStorage((current) => current || l.defaultStorage);
      })
      .catch(() => setLoadError("Không tải được giới hạn upload"));
    api<Album[]>("/api/admin/albums").then(setAlbums).catch(() => setAlbums([]));
  }, []);
  // Thu hồi object URL của ảnh xem trước khi rời trang
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  const update = (id: string, patch: Partial<Item>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const addFiles = (list: FileList | File[]) => {
    const files = [...list];
    if (!files.length) return;
    setItems((prev) => [
      ...prev,
      ...files.map<Item>((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        title: titleFrom(file.name),
        altText: "",
        description: "",
        state: "queued",
        progress: 0,
      })),
    ]);
  };

  const removeItem = (id: string) =>
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const start = async () => {
    if (!limits) return;
    const pending = items.filter((i) => i.state === "queued");
    if (!pending.length) return;
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const batches = planBatches(pending, limits.maxFiles, limits.maxRequestBytes);
    let accepted = 0;
    let rejected = 0;
    setStatus(`Đang gửi ${pending.length} ảnh trong ${batches.length} request…`);

    for (const [b, batch] of batches.entries()) {
      if (controller.signal.aborted) break;
      batch.forEach((i) => update(i.id, { state: "uploading", progress: 0, error: undefined }));
      try {
        const res = await uploadBatch(
          batch.map((i) => i.file),
          {
            items: batch.map((i) => ({ title: i.title.trim(), altText: i.altText.trim(), description: i.description.trim() })),
            ...(albumId ? { albumId } : {}),
            ...(tags.trim() ? { tags } : {}),
            ...(storage ? { storage } : {}),
          },
          (evt) => {
            if (evt.type === "upload-progress") {
              const p = (evt.loaded / evt.total) * 0.5;
              batch.forEach((i) => update(i.id, { state: evt.loaded >= evt.total ? "waiting" : "uploading", progress: p }));
            } else if (evt.type === "received") {
              batch.forEach((i) => update(i.id, { state: "waiting", progress: STAGE_PROGRESS.waiting ?? 0.5 }));
            } else if (evt.type === "stage") {
              const item = batch[evt.index];
              if (item) update(item.id, { state: evt.stage, progress: STAGE_PROGRESS[evt.stage] ?? null });
            } else if (evt.type === "file") {
              const item = batch[evt.result.index];
              if (!item) return;
              if (evt.result.ok) update(item.id, { state: "done", progress: 1, photo: evt.result.photo });
              else update(item.id, { state: "error", progress: 1, error: evt.result.error });
            }
          },
          controller.signal,
        );
        accepted += res.summary.accepted;
        rejected += res.summary.rejected;
        // Đồng bộ lần cuối theo kết quả tổng (phòng khi mất một sự kiện stream)
        res.results.forEach((r) => {
          const item = batch[r.index];
          if (!item) return;
          if (r.ok) update(item.id, { state: "done", progress: 1, photo: r.photo });
          else update(item.id, { state: "error", progress: 1, error: r.error });
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          batch.forEach((i) => update(i.id, { state: "queued", progress: 0 }));
          break;
        }
        // Lỗi cấp request (413, 400...): không ảnh nào trong lượt này được công bố
        const error: FileError =
          err instanceof ApiError ? { code: err.code, message: err.message } : { code: "NETWORK_ERROR", message: "Lỗi kết nối" };
        batch.forEach((i) => update(i.id, { state: "error", progress: 1, error }));
        rejected += batch.length;
      }
      setStatus(`Đã xử lý ${b + 1}/${batches.length} request: ${accepted} ảnh đã đăng, ${rejected} ảnh bị từ chối.`);
    }
    setRunning(false);
    abortRef.current = null;
  };

  const queued = items.filter((i) => i.state === "queued").length;
  const doneCount = items.filter((i) => i.state === "done").length;
  const batchCount = limits ? planBatches(items.filter((i) => i.state === "queued"), limits.maxFiles, limits.maxRequestBytes).length : 0;

  return (
    <div className="space-y-6">
      {loadError && <ErrorBox>{loadError}</ErrorBox>}

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={onDrop}
        className={`grid place-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line bg-surface"
        }`}
      >
        <UploadCloud aria-hidden className={`size-10 ${dragging ? "text-accent" : "text-muted"}`} />
        <div>
          <p className="font-medium">Kéo thả ảnh vào đây</p>
          <p className="mt-1 text-sm text-muted">
            {limits
              ? `JPEG hoặc PNG, tối đa ${formatBytes(limits.maxFileBytes)} và ${(limits.maxPixels / 1e6).toLocaleString("vi-VN")} triệu pixel mỗi ảnh. Mỗi request gửi tối đa ${limits.maxFiles} ảnh; hàng đợi dài hơn được chia thành nhiều request.`
              : "Đang tải giới hạn…"}
          </p>
        </div>
        <input
          ref={inputRef}
          id={`${formId}-files`}
          type="file"
          multiple
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <label htmlFor={`${formId}-files`} className="btn-primary cursor-pointer">
          <ImagePlus aria-hidden className="size-4" /> Chọn ảnh
        </label>
      </div>

      {items.length > 0 && (
        <section aria-labelledby={`${formId}-queue`} className="space-y-4">
          <div className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <div>
              <label htmlFor={`${formId}-storage`} className="label">
                Lưu lên kho / CDN
              </label>
              <select
                id={`${formId}-storage`}
                className="input"
                value={storage}
                onChange={(e) => setStorage(e.target.value)}
                disabled={running || !limits}
                aria-describedby={`${formId}-storage-hint`}
              >
                {limits?.storages.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.label}
                    {s.isDefault ? " (mặc định)" : ""}
                  </option>
                ))}
              </select>
              <p id={`${formId}-storage-hint`} className="mt-1 text-xs text-muted">
                Ảnh gốc và 3 bản WebP đều được đẩy lên kho này.
              </p>
            </div>
            <div>
              <label htmlFor={`${formId}-album`} className="label">
                Album cho lượt tải này
              </label>
              <select id={`${formId}-album`} className="input" value={albumId} onChange={(e) => setAlbumId(e.target.value)} disabled={running}>
                <option value="">Không thuộc album</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${formId}-tags`} className="label">
                Tag (cách nhau dấu phẩy)
              </label>
              <input id={`${formId}-tags`} className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="du lịch, biển" disabled={running} />
            </div>
            <div className="flex gap-2">
              {running ? (
                <button type="button" className="btn-secondary" onClick={() => abortRef.current?.abort()}>
                  <X aria-hidden className="size-4" /> Hủy
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={start} disabled={!queued || !limits}>
                  <UploadCloud aria-hidden className="size-4" />
                  Tải lên {queued} ảnh{batchCount > 1 ? ` (${batchCount} request)` : ""}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`${formId}-queue`} className="font-semibold">
              Hàng đợi ({items.length})
            </h2>
            {doneCount > 0 && !running && (
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() =>
                  setItems((prev) => {
                    prev.filter((i) => i.state === "done").forEach((i) => URL.revokeObjectURL(i.preview));
                    return prev.filter((i) => i.state !== "done");
                  })
                }
              >
                Bỏ {doneCount} ảnh đã xong khỏi danh sách
              </button>
            )}
          </div>
          <p role="status" className="text-sm text-muted">
            {status}
          </p>

          <ul className="grid gap-3 lg:grid-cols-2" role="list">
            {items.map((item) => (
              <UploadCard
                key={item.id}
                item={item}
                limits={limits}
                locked={running}
                onChange={(patch) => update(item.id, patch)}
                onRemove={() => removeItem(item.id)}
                onEdit={() => item.photo && setEditing(item.photo)}
              />
            ))}
          </ul>
        </section>
      )}

      <EditPhotoDialog
        photo={editing}
        onClose={() => setEditing(null)}
        onSaved={(p) => setItems((prev) => prev.map((i) => (i.photo?.id === p.id ? { ...i, photo: p, title: p.title, altText: p.altText } : i)))}
      />
    </div>
  );
}

function UploadCard({
  item,
  limits,
  locked,
  onChange,
  onRemove,
  onEdit,
}: {
  item: Item;
  limits: UploadLimits | null;
  locked: boolean;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const id = useId();
  const active = ACTIVE.includes(item.state);
  const editable = (item.state === "queued" || item.state === "error") && !locked;
  const warnings: string[] = [];
  if (limits && item.file.size > limits.maxFileBytes) warnings.push(`Lớn hơn ${formatBytes(limits.maxFileBytes)}: server sẽ từ chối`);
  if (item.file.type && !["image/jpeg", "image/png"].includes(item.file.type)) warnings.push(`Loại ${item.file.type}: server chỉ nhận JPEG/PNG`);
  const medium = item.photo ? pickVariant(item.photo.variants, 960) : undefined;
  const label =
    item.state === "uploading" && item.progress !== null ? `${STAGE_LABEL.uploading} ${Math.round((item.progress / 0.5) * 100)}%` : STAGE_LABEL[item.state];

  return (
    <li className="card flex gap-3 p-3">
      <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:size-28">
        <img
          src={item.photo ? item.photo.variants[0]?.url : item.preview}
          alt=""
          width={112}
          height={112}
          className="size-full object-cover"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium" title={item.file.name}>
            {item.file.name}
            <span className="ml-2 font-normal text-muted">{formatBytes(item.file.size)}</span>
          </p>
          {!active && (
            <button type="button" className="btn-ghost -mr-1 -mt-1 p-1.5" aria-label={`Bỏ ${item.file.name} khỏi hàng đợi`} onClick={onRemove} disabled={locked}>
              <Trash2 aria-hidden className="size-4" />
            </button>
          )}
        </div>

        {editable ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-t`} className="sr-only">
                Tiêu đề của {item.file.name}
              </label>
              <input id={`${id}-t`} className="input py-1.5" placeholder="Tiêu đề" maxLength={120} value={item.title} onChange={(e) => onChange({ title: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`${id}-a`} className="sr-only">
                Văn bản thay thế (alt) của {item.file.name}
              </label>
              <input
                id={`${id}-a`}
                className="input py-1.5"
                placeholder="Alt: mô tả nội dung ảnh"
                maxLength={300}
                value={item.altText}
                onChange={(e) => onChange({ altText: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-d`} className="sr-only">
                Mô tả của {item.file.name}
              </label>
              <input id={`${id}-d`} className="input py-1.5" placeholder="Mô tả (không bắt buộc)" maxLength={2000} value={item.description} onChange={(e) => onChange({ description: e.target.value })} />
            </div>
          </div>
        ) : item.photo ? (
          <p className="truncate text-sm">{item.photo.title}</p>
        ) : null}

        {warnings.map((w) => (
          <p key={w} className="text-xs text-warning">
            {w}
          </p>
        ))}

        {item.state !== "queued" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span id={`${id}-p`} className={item.state === "error" ? "text-danger" : item.state === "done" ? "text-success" : "text-muted"}>
                {item.state === "done" && <CircleCheck aria-hidden className="mr-1 inline size-3.5" />}
                {item.state === "error" && <CircleX aria-hidden className="mr-1 inline size-3.5" />}
                {label}
              </span>
              {active && <LoaderCircle aria-hidden className="size-3.5 animate-spin text-muted motion-reduce:animate-none" />}
            </div>
            <progress
              className="bar"
              aria-labelledby={`${id}-p`}
              max={1}
              data-state={item.state === "error" ? "error" : item.state === "done" ? "done" : undefined}
              {...(item.progress !== null ? { value: item.progress } : {})}
            />
          </div>
        )}

        {item.state === "error" && item.error && (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-danger">
              <strong>{ERROR_LABELS[item.error.code] ?? item.error.code}:</strong> {item.error.message}
            </p>
            {!locked && (
              <button type="button" className="text-xs font-medium text-accent" onClick={() => onChange({ state: "queued", progress: 0, error: undefined })}>
                Đưa lại vào hàng đợi
              </button>
            )}
          </div>
        )}

        {item.state === "done" && item.photo && medium && (
          <div className="space-y-1.5 text-xs">
            <p>
              Gốc {formatBytes(item.photo.source.bytes)} → WebP {medium.width}px {formatBytes(medium.bytes)}{" "}
              <strong className="text-success">tiết kiệm {savedPercent(medium.bytes, item.photo.source.bytes)}%</strong>
            </p>
            <p className="text-muted">
              {item.photo.variants.map((v) => `${v.width}w ${formatBytes(v.bytes)}`).join(" · ")}
              {` · gốc ${item.photo.width}×${item.photo.height}px`}
            </p>
            <p className="text-muted">
              Đã lưu lên <strong className="text-fg">{item.photo.storage.label}</strong>
            </p>
            <div className="flex gap-3 pt-0.5">
              <button type="button" className="inline-flex items-center gap-1 font-medium text-accent" onClick={onEdit}>
                <Pencil aria-hidden className="size-3.5" /> Sửa thông tin
              </button>
              <Link to={`/photos/${item.photo.id}`} className="font-medium text-accent">
                Xem ảnh
              </Link>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
