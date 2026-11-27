import { useEffect, useId, useState, type FormEvent } from "react";
import { api, ApiError, type Album, type Photo } from "../lib/api";
import { Dialog } from "./Dialog";
import { ErrorBox } from "./Status";

interface Props {
  /** null = đóng */
  photo: Photo | null;
  onClose: () => void;
  onSaved: (photo: Photo) => void;
}

export function EditPhotoDialog({ photo, onClose, onSaved }: Props) {
  const titleId = useId();
  return (
    <Dialog open={photo !== null} onClose={onClose} title="Sửa thông tin ảnh" titleId={titleId}>
      {photo && <EditForm photo={photo} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function EditForm({ photo, onClose, onSaved }: { photo: Photo; onClose: () => void; onSaved: (photo: Photo) => void }) {
  const id = useId();
  const [title, setTitle] = useState(photo.title);
  const [altText, setAltText] = useState(photo.altText);
  const [description, setDescription] = useState(photo.description ?? "");
  const [albumId, setAlbumId] = useState(photo.album?.id ?? "");
  const [tags, setTags] = useState(photo.tags.join(", "));
  const [status, setStatus] = useState<"PUBLISHED" | "HIDDEN">(photo.status === "HIDDEN" ? "HIDDEN" : "PUBLISHED");
  const [albums, setAlbums] = useState<Album[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Album[]>("/api/admin/albums").then(setAlbums).catch(() => setAlbums([]));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Photo>(`/api/admin/photos/${photo.id}`, {
        method: "PATCH",
        json: { title, altText, description: description || null, albumId: albumId || null, tags, status },
      });
      onSaved(updated);
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
        <label htmlFor={`${id}-title`} className="label">
          Tiêu đề
        </label>
        <input id={`${id}-title`} className="input" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus />
      </div>
      <div>
        <label htmlFor={`${id}-alt`} className="label">
          Văn bản thay thế (alt)
        </label>
        <input
          id={`${id}-alt`}
          className="input"
          required
          maxLength={300}
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          aria-describedby={`${id}-alt-hint`}
        />
        <p id={`${id}-alt-hint`} className="mt-1 text-xs text-muted">
          Mô tả nội dung ảnh cho người dùng trình đọc màn hình, không lặp lại tên file.
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-desc`} className="label">
          Mô tả
        </label>
        <textarea id={`${id}-desc`} className="input min-h-20" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-album`} className="label">
            Album
          </label>
          <select id={`${id}-album`} className="input" value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
            <option value="">Không thuộc album</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-status`} className="label">
            Hiển thị
          </label>
          <select id={`${id}-status`} className="input" value={status} onChange={(e) => setStatus(e.target.value as "PUBLISHED" | "HIDDEN")}>
            <option value="PUBLISHED">Công khai</option>
            <option value="HIDDEN">Ẩn khỏi gallery</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-tags`} className="label">
          Tag
        </label>
        <input id={`${id}-tags`} className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="biển, hoàng hôn" aria-describedby={`${id}-tags-hint`} />
        <p id={`${id}-tags-hint`} className="mt-1 text-xs text-muted">
          Cách nhau bằng dấu phẩy, tối đa 10 tag.
        </p>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Hủy
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
