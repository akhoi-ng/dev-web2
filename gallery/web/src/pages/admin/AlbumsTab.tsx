import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, ApiError, type Album } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { ConfirmDialog, Dialog } from "../../components/Dialog";
import { EmptyState, ErrorBox, Spinner } from "../../components/Status";
import { useDocumentTitle } from "../../hooks/usePhotoFeed";

export function AlbumsTab() {
  useDocumentTitle("Album");
  const id = useId();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Album | null>(null);
  const [deleting, setDeleting] = useState<Album | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Album[]>("/api/admin/albums")
      .then(setAlbums)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Không tải được album"));
  }, []);
  useEffect(load, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api("/api/admin/albums", { method: "POST", json: { title, description: description || null } });
      setTitle("");
      setDescription("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tạo được album");
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/admin/albums/${deleting.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không xóa được album");
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
      <form onSubmit={create} className="card space-y-3 p-4">
        <h2 className="font-semibold">Tạo album</h2>
        <div>
          <label htmlFor={`${id}-t`} className="label">
            Tên album
          </label>
          <input id={`${id}-t`} className="input" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-d`} className="label">
            Mô tả
          </label>
          <textarea id={`${id}-d`} className="input min-h-20" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={creating}>
          <Plus aria-hidden className="size-4" /> {creating ? "Đang tạo…" : "Tạo album"}
        </button>
      </form>

      <section className="space-y-3" aria-label="Danh sách album">
        {error && <ErrorBox>{error}</ErrorBox>}
        {albums === null ? (
          <Spinner label="Đang tải album…" />
        ) : albums.length === 0 ? (
          <EmptyState title="Chưa có album">Tạo album rồi chọn album khi tải ảnh lên hoặc khi sửa ảnh.</EmptyState>
        ) : (
          <ul className="card divide-y divide-line" role="list">
            {albums.map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-3">
                <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {a.cover && <img src={a.cover.src} alt="" width={56} height={56} loading="lazy" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/?album=${a.slug}`} className="font-medium hover:text-accent">
                    {a.title}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    /{a.slug} · {a.photoCount} ảnh · tạo {formatDate(a.createdAt)}
                  </p>
                  {a.description && <p className="truncate text-sm text-muted">{a.description}</p>}
                </div>
                <button type="button" className="btn-ghost px-2 py-1.5" aria-label={`Sửa album ${a.title}`} onClick={() => setEditing(a)}>
                  <Pencil aria-hidden className="size-4" />
                </button>
                <button type="button" className="btn-ghost px-2 py-1.5 text-danger" aria-label={`Xóa album ${a.title}`} onClick={() => setDeleting(a)}>
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EditAlbumDialog album={editing} onClose={() => setEditing(null)} onSaved={load} />
      <ConfirmDialog open={deleting !== null} title="Xóa album?" confirmLabel="Xóa album" busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)}>
        {deleting && <>Album “{deleting.title}” bị xóa. {deleting.photoCount} ảnh trong album vẫn còn, chỉ không thuộc album nào nữa.</>}
      </ConfirmDialog>
    </div>
  );
}

function EditAlbumDialog({ album, onClose, onSaved }: { album: Album | null; onClose: () => void; onSaved: () => void }) {
  const titleId = useId();
  return (
    <Dialog open={album !== null} onClose={onClose} title="Sửa album" titleId={titleId}>
      {album && <EditAlbumForm album={album} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function EditAlbumForm({ album, onClose, onSaved }: { album: Album; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [title, setTitle] = useState(album.title);
  const [slug, setSlug] = useState(album.slug);
  const [description, setDescription] = useState(album.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/admin/albums/${album.id}`, {
        method: "PATCH",
        json: { title, description: description || null, ...(slug !== album.slug ? { slug } : {}) },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor={`${id}-t`} className="label">
          Tên album
        </label>
        <input id={`${id}-t`} className="input" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus />
      </div>
      <div>
        <label htmlFor={`${id}-s`} className="label">
          Đường dẫn (slug)
        </label>
        <input id={`${id}-s`} className="input" maxLength={60} value={slug} onChange={(e) => setSlug(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${id}-d`} className="label">
          Mô tả
        </label>
        <textarea id={`${id}-d`} className="input min-h-20" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Hủy
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </form>
  );
}
