import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Pencil, Search, Trash2 } from "lucide-react";
import { api, ApiError, type Album, type Photo } from "../../lib/api";
import { formatBytes, formatDateTime, pickVariant } from "../../lib/format";
import { ConfirmDialog } from "../../components/Dialog";
import { EditPhotoDialog } from "../../components/EditPhotoDialog";
import { EmptyState, ErrorBox, Spinner, StatusBadge } from "../../components/Status";
import { useDebounced, useDocumentTitle, useInfiniteScroll, usePhotoFeed } from "../../hooks/usePhotoFeed";

export function LibraryTab() {
  useDocumentTitle("Thư viện ảnh");
  const id = useId();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [status, setStatus] = useState("");
  const [album, setAlbum] = useState("");
  const [albums, setAlbums] = useState<Album[]>([]);
  const filters = useMemo(() => ({ q, status, album }), [q, status, album]);
  const feed = usePhotoFeed("/api/admin/photos", filters, 24);
  const sentinel = useInfiniteScroll(feed.loadMore, feed.hasMore && !feed.error, feed.items.length);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<Album[]>("/api/admin/albums").then(setAlbums).catch(() => setAlbums([]));
  }, []);

  const replace = (p: Photo) => feed.setItems((prev) => prev.map((x) => (x.id === p.id ? p : x)));

  const toggle = async (p: Photo) => {
    try {
      replace(await api<Photo>(`/api/admin/photos/${p.id}`, { method: "PATCH", json: { status: p.status === "HIDDEN" ? "PUBLISHED" : "HIDDEN" } }));
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Không đổi được trạng thái" });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const r = await api<{ status: string; deletedKeys: string[]; message?: string }>(`/api/admin/photos/${deleting.id}`, { method: "DELETE" });
      if (r.status === "DELETED") {
        feed.setItems((prev) => prev.filter((x) => x.id !== deleting.id));
        setMessage({ kind: "ok", text: `Đã xóa “${deleting.title}” và ${r.deletedKeys.length} file trong kho.` });
      } else {
        replace({ ...deleting, status: "DELETING" });
        setMessage({ kind: "error", text: r.message ?? "Ảnh đã ẩn nhưng chưa dọn hết file; tác vụ dọn sẽ thử lại." });
      }
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Không xóa được ảnh" });
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <label htmlFor={`${id}-q`} className="sr-only">
            Tìm theo tiêu đề
          </label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input id={`${id}-q`} type="search" className="input pl-9" placeholder="Tìm theo tiêu đề…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-s`} className="sr-only">
            Trạng thái
          </label>
          <select id={`${id}-s`} className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Mọi trạng thái</option>
            <option value="PUBLISHED">Công khai</option>
            <option value="HIDDEN">Đang ẩn</option>
            <option value="DELETING">Đang dọn file</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-a`} className="sr-only">
            Album
          </label>
          <select id={`${id}-a`} className="input" value={album} onChange={(e) => setAlbum(e.target.value)}>
            <option value="">Mọi album</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div role="status">
        {message && (
          <p className={`rounded-lg px-4 py-2.5 text-sm ${message.kind === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{message.text}</p>
        )}
      </div>
      {feed.error && <ErrorBox onRetry={feed.reload}>{feed.error}</ErrorBox>}

      {!feed.loading && feed.items.length === 0 && !feed.error ? (
        <EmptyState title="Không có ảnh">
          <Link to="/admin/upload" className="text-accent">
            Tải ảnh lên
          </Link>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" role="list">
          {feed.items.map((p) => {
            const thumb = pickVariant(p.variants, 320);
            const total = p.variants.reduce((n, v) => n + v.bytes, 0);
            return (
              <li key={p.id} className="card flex flex-col overflow-hidden">
                <Link to={`/photos/${p.id}`} className="relative block aspect-[4/3] overflow-hidden bg-surface-2">
                  {thumb && (
                    <img
                      src={thumb.url}
                      srcSet={p.srcSet}
                      sizes="(min-width: 1536px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                      width={p.width}
                      height={p.height}
                      loading="lazy"
                      decoding="async"
                      alt={p.altText}
                      className="size-full object-cover"
                    />
                  )}
                  <span className="absolute left-2 top-2">
                    <StatusBadge status={p.status} />
                  </span>
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
                  <div>
                    <p className="truncate font-medium" title={p.title}>
                      {p.title}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {p.album ? `${p.album.title} · ` : ""}
                      {formatDateTime(p.createdAt)}
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    {p.width}×{p.height} · gốc {formatBytes(p.source.bytes)} · {p.variants.length} variant {formatBytes(total)} · {p.storage.label}
                  </p>
                  {p.status !== "DELETING" && (
                    <div className="mt-auto flex gap-1 pt-1">
                      <button type="button" className="btn-ghost px-2 py-1.5" onClick={() => setEditing(p)} aria-label={`Sửa ${p.title}`}>
                        <Pencil aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost px-2 py-1.5"
                        onClick={() => toggle(p)}
                        aria-label={p.status === "HIDDEN" ? `Công bố lại ${p.title}` : `Ẩn ${p.title}`}
                        title={p.status === "HIDDEN" ? "Công bố lại" : "Ẩn khỏi gallery"}
                      >
                        {p.status === "HIDDEN" ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
                      </button>
                      <button type="button" className="btn-ghost ml-auto px-2 py-1.5 text-danger" onClick={() => setDeleting(p)} aria-label={`Xóa ${p.title}`}>
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={sentinel} className="flex justify-center py-4">
        {feed.loading ? (
          <Spinner label="Đang tải…" />
        ) : feed.hasMore && feed.items.length > 0 ? (
          <button type="button" className="btn-secondary" onClick={feed.loadMore}>
            Tải thêm
          </button>
        ) : null}
      </div>

      <EditPhotoDialog photo={editing} onClose={() => setEditing(null)} onSaved={replace} />
      <ConfirmDialog open={deleting !== null} title="Xóa ảnh này?" confirmLabel="Xóa vĩnh viễn" busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)}>
        {deleting && (
          <>
            Ảnh “{deleting.title}” bị ẩn ngay, sau đó {deleting.variants.length} variant và bản gốc bị xóa khỏi kho lưu trữ. Không hoàn tác được.
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
