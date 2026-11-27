import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Tag, X } from "lucide-react";
import { api, type Album, type TagCount } from "../lib/api";
import { GalleryLightbox } from "../components/GalleryLightbox";
import { Masonry } from "../components/Masonry";
import { EmptyState, ErrorBox, Spinner } from "../components/Status";
import { useDebounced, useDocumentTitle, useInfiniteScroll, usePhotoFeed } from "../hooks/usePhotoFeed";

export function GalleryPage() {
  const [params, setParams] = useSearchParams();
  const album = params.get("album") ?? "";
  const tag = params.get("tag") ?? "";
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);
  const debounced = useDebounced(search.trim(), 300);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [lightbox, setLightbox] = useState(-1);

  const filters = useMemo(() => ({ q, album, tag }), [q, album, tag]);
  const feed = usePhotoFeed("/api/photos", filters, 30);
  const sentinel = useInfiniteScroll(feed.loadMore, feed.hasMore && !feed.error, feed.items.length);
  const activeAlbum = albums.find((a) => a.slug === album);
  useDocumentTitle(activeAlbum?.title ?? (tag ? `#${tag}` : ""));

  useEffect(() => {
    api<Album[]>("/api/albums").then(setAlbums).catch(() => setAlbums([]));
    api<TagCount[]>("/api/tags").then(setTags).catch(() => setTags([]));
  }, []);

  // Ô tìm kiếm -> URL (?q=) sau khi ngừng gõ 300ms
  useEffect(() => {
    if (debounced === q) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debounced) next.set("q", debounced);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }, [debounced, q, setParams]);

  const setFilter = (name: "album" | "tag", value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && prev.get(name) !== value) next.set(name, value);
      else next.delete(name);
      return next;
    });
  };

  const filtered = Boolean(q || album || tag);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{activeAlbum ? activeAlbum.title : "Thư viện ảnh"}</h1>
          <p className="mt-1 text-sm text-muted">
            {activeAlbum?.description ?? "Bấm vào ảnh để xem lớn, dùng phím mũi tên hoặc vuốt để chuyển ảnh."}
          </p>
        </div>
        <form role="search" className="relative w-full sm:w-80" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="gallery-search" className="sr-only">
            Tìm theo tiêu đề
          </label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            id="gallery-search"
            type="search"
            className="input pl-9"
            placeholder="Tìm theo tiêu đề…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            enterKeyHint="search"
          />
        </form>
      </section>

      {(albums.length > 0 || tags.length > 0) && (
        <section aria-label="Bộ lọc" className="space-y-3">
          {albums.length > 0 && (
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              <button type="button" className="chip" aria-pressed={!album} onClick={() => setFilter("album", "")}>
                Tất cả
              </button>
              {albums.map((a) => (
                <button key={a.id} type="button" className="chip" aria-pressed={album === a.slug} onClick={() => setFilter("album", a.slug)}>
                  {a.title}
                  <span className="text-xs text-muted">{a.photoCount}</span>
                </button>
              ))}
            </div>
          )}
          {tags.length > 0 && (
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {tags.map((t) => (
                <button key={t.tag} type="button" className="chip text-xs" aria-pressed={tag === t.tag} onClick={() => setFilter("tag", t.tag)}>
                  <Tag aria-hidden className="size-3" />
                  {t.tag}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {filtered && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted" aria-live="polite">
          {feed.loading && feed.items.length === 0 ? "Đang lọc…" : `${feed.items.length}${feed.hasMore ? "+" : ""} ảnh khớp bộ lọc`}
          <button type="button" className="inline-flex items-center gap-1 font-medium text-accent" onClick={() => { setSearch(""); setParams({}); }}>
            <X aria-hidden className="size-3.5" /> Xóa bộ lọc
          </button>
        </p>
      )}

      {feed.error && <ErrorBox onRetry={feed.reload}>{feed.error}</ErrorBox>}

      {!feed.loading && !feed.error && feed.items.length === 0 ? (
        <EmptyState title={filtered ? "Không có ảnh khớp bộ lọc" : "Chưa có ảnh nào"}>
          {filtered ? "Thử từ khóa khác hoặc bỏ bớt bộ lọc." : "Đăng nhập quản trị để tải ảnh lên."}
        </EmptyState>
      ) : (
        <Masonry photos={feed.items} onOpen={setLightbox} />
      )}

      <div ref={sentinel} className="flex justify-center py-6">
        {feed.loading ? (
          <Spinner label="Đang tải ảnh…" />
        ) : feed.hasMore && feed.items.length > 0 ? (
          <button type="button" className="btn-secondary" onClick={feed.loadMore}>
            Tải thêm ảnh
          </button>
        ) : null}
      </div>

      <GalleryLightbox photos={feed.items} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(-1)} onNearEnd={feed.loadMore} />
    </div>
  );
}
