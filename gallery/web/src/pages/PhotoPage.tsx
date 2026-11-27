import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Eye, EyeOff, Pencil, Tag, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError, type Photo } from "../lib/api";
import { formatBytes, formatDateTime, numberFmt, savedPercent } from "../lib/format";
import { BlurImage } from "../components/BlurImage";
import { ConfirmDialog } from "../components/Dialog";
import { EditPhotoDialog } from "../components/EditPhotoDialog";
import { ErrorBox, Spinner, StatusBadge } from "../components/Status";
import { useDocumentTitle } from "../hooks/usePhotoFeed";

export function PhotoPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useDocumentTitle(photo?.title ?? "");

  useEffect(() => {
    setPhoto(null);
    setError(null);
    api<Photo>(`/api/photos/${id}`)
      .then(setPhoto)
      .catch((err: unknown) => setError(err instanceof ApiError && err.status === 404 ? "Ảnh không tồn tại hoặc đã bị ẩn." : "Không tải được ảnh."));
  }, [id, user]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10">
        <ErrorBox>{error}</ErrorBox>
        <Link to="/" className="btn-secondary">
          <ArrowLeft aria-hidden className="size-4" /> Về thư viện
        </Link>
      </div>
    );
  }
  if (!photo) return <Spinner label="Đang tải ảnh…" className="py-10" />;

  const toggleHidden = async () => {
    setBusy(true);
    try {
      setPhoto(await api<Photo>(`/api/admin/photos/${photo.id}`, { method: "PATCH", json: { status: photo.status === "HIDDEN" ? "PUBLISHED" : "HIDDEN" } }));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Không đổi được trạng thái");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const r = await api<{ status: string; message?: string }>(`/api/admin/photos/${photo.id}`, { method: "DELETE" });
      if (r.status === "DELETED") navigate("/", { replace: true });
      else {
        setConfirmDelete(false);
        setNotice(r.message ?? "Ảnh đã ẩn, đang chờ dọn file.");
        setPhoto({ ...photo, status: "DELETING" });
      }
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Không xóa được ảnh");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Thư viện
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:items-start">
        <figure className="overflow-hidden rounded-xl bg-surface-2">
          <BlurImage
            photo={photo}
            sizes="(min-width: 1600px) 1040px, (min-width: 1024px) 66vw, 100vw"
            highPriority
            className="mx-auto max-h-[80dvh]"
            imgClassName="!object-contain"
          />
        </figure>

        <div className="space-y-5">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {photo.status !== "PUBLISHED" && <StatusBadge status={photo.status} />}
              {photo.album && (
                <Link to={`/?album=${photo.album.slug}`} className="text-sm font-medium text-accent">
                  {photo.album.title}
                </Link>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{photo.title}</h1>
            {photo.description && <p className="whitespace-pre-line text-muted">{photo.description}</p>}
            {photo.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Tag">
                {photo.tags.map((t) => (
                  <li key={t}>
                    <Link to={`/?tag=${encodeURIComponent(t)}`} className="chip text-xs">
                      <Tag aria-hidden className="size-3" /> {t}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </header>

          <a href={photo.original.downloadUrl} download className="btn-primary w-full sm:w-auto">
            <Download aria-hidden className="size-4" />
            Tải ảnh gốc ({photo.original.mime === "image/png" ? "PNG" : "JPEG"}, {formatBytes(photo.original.bytes)})
          </a>

          {notice && <ErrorBox>{notice}</ErrorBox>}

          <section className="card divide-y divide-line text-sm">
            <h2 className="px-4 py-3 font-semibold">Thông số</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3">
              <dt className="text-muted">Kích thước gốc</dt>
              <dd>
                {numberFmt.format(photo.width)} × {numberFmt.format(photo.height)} px
              </dd>
              <dt className="text-muted">File tải lên</dt>
              <dd className="break-all">
                {photo.source.filename} · {photo.source.format.toUpperCase()} · {formatBytes(photo.source.bytes)}
              </dd>
              <dt className="text-muted">Kho lưu trữ</dt>
              <dd>{photo.storage.label}</dd>
              <dt className="text-muted">Ngày đăng</dt>
              <dd>
                <time dateTime={photo.createdAt}>{formatDateTime(photo.createdAt)}</time>
              </dd>
            </dl>
            <div className="px-4 py-3">
              <table className="w-full text-sm">
                <caption className="mb-2 text-left font-medium">Variant WebP đã sinh</caption>
                <thead className="text-xs text-muted">
                  <tr>
                    <th scope="col" className="pb-1 text-left font-normal">
                      Kích thước
                    </th>
                    <th scope="col" className="pb-1 text-right font-normal">
                      Dung lượng
                    </th>
                    <th scope="col" className="pb-1 text-right font-normal">
                      Tiết kiệm
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {photo.variants.map((v) => (
                    <tr key={v.width} className="border-t border-line">
                      <td className="py-1.5">
                        <a href={v.url} className="hover:text-accent" target="_blank" rel="noreferrer">
                          {v.width} × {v.height}
                        </a>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatBytes(v.bytes)}</td>
                      <td className="py-1.5 text-right tabular-nums text-success">−{savedPercent(v.bytes, photo.source.bytes)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {user && photo.status !== "DELETING" && (
            <section className="flex flex-wrap gap-2" aria-label="Quản trị ảnh">
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden className="size-4" /> Sửa thông tin
              </button>
              <button type="button" className="btn-secondary" onClick={toggleHidden} disabled={busy}>
                {photo.status === "HIDDEN" ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
                {photo.status === "HIDDEN" ? "Công bố lại" : "Ẩn khỏi gallery"}
              </button>
              <button type="button" className="btn-secondary text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden className="size-4" /> Xóa ảnh
              </button>
            </section>
          )}
        </div>
      </div>

      <EditPhotoDialog photo={editing ? photo : null} onClose={() => setEditing(false)} onSaved={setPhoto} />
      <ConfirmDialog
        open={confirmDelete}
        title="Xóa ảnh này?"
        confirmLabel="Xóa vĩnh viễn"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      >
        Ảnh “{photo.title}” sẽ biến mất khỏi gallery, rồi {photo.variants.length} variant WebP và bản gốc bị xóa khỏi kho lưu trữ. Không hoàn tác được.
      </ConfirmDialog>
    </article>
  );
}
