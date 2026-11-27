import type { Album, Photo, PhotoVariant, PhotoVersion } from "@prisma/client";
import type { StorageRegistry } from "../storage/index.js";
import { joinUrl } from "../storage/keys.js";

/** `versions` chỉ chứa version đang công bố (supersededAt = null), xem photoInclude. */
export type PhotoRecord = Photo & { variants: PhotoVariant[]; album: Album | null; versions: PhotoVersion[] };

export interface UrlBuilder {
  /** URL công khai của một key trong kho `storage` */
  media(storage: string, key: string): string;
  storageLabel(storage: string): string;
}

/**
 * URL được dựng lúc trả response từ tên kho + storage key; DB không lưu URL nên đổi CDN/domain
 * không phải sửa dữ liệu. Kho có URL công khai (CDN/bucket public) -> URL thẳng tới đó; kho không
 * có -> web server phục vụ qua /media.
 */
export function createUrlBuilder(storages: StorageRegistry, mediaBaseUrl: string): UrlBuilder {
  return {
    media: (storage, key) => storages.tryGet(storage)?.directPublicUrl(key) ?? joinUrl(mediaBaseUrl, key),
    storageLabel: (storage) => storages.profile(storage)?.label ?? `${storage} (không còn cấu hình)`,
  };
}

export interface VariantDto {
  width: number;
  height: number;
  bytes: number;
  mime: string;
  url: string;
  storageKey?: string;
}

export interface PhotoDto {
  id: string;
  title: string;
  altText: string;
  description: string | null;
  tags: string[];
  status: Photo["status"];
  /** Kho đang chứa file của ảnh */
  storage: { name: string; label: string };
  album: { id: string; title: string; slug: string } | null;
  /** Kích thước ảnh đang công bố (sau chỉnh sửa); bản gốc nằm ở `original` */
  width: number;
  height: number;
  blurDataUrl: string | null;
  /** Variant mặc định cho thuộc tính src (gần 960px nhất) */
  src: string;
  srcSet: string;
  variants: VariantDto[];
  original: { width: number; height: number; bytes: number; mime: string; downloadUrl: string; storageKey?: string };
  source: { filename: string; format: string; bytes: number };
  version: number;
  /** Thông số chỉnh sửa của version đang công bố (chỉ trả cho admin) */
  edit?: { crop: { x: number; y: number; width: number; height: number } | null; rotate: number; flipH: boolean; editedAt: string };
  createdAt: string;
  updatedAt: string;
}

export function toPhotoDto(photo: PhotoRecord, urls: UrlBuilder, opts: { admin?: boolean } = {}): PhotoDto {
  const variants = photo.variants
    .filter((v) => v.version === photo.currentVersion)
    .sort((a, b) => a.width - b.width)
    .map<VariantDto>((v) => ({
      width: v.width,
      height: v.height,
      bytes: v.bytes,
      mime: v.mime,
      url: urls.media(photo.storage, v.storageKey),
      ...(opts.admin ? { storageKey: v.storageKey } : {}),
    }));
  // src mặc định: variant nhỏ nhất có chiều rộng >= 960, nếu không có thì variant lớn nhất
  const fallback = variants.find((v) => v.width >= 960) ?? variants.at(-1);
  const current = photo.versions.find((v) => v.version === photo.currentVersion);
  return {
    id: photo.id,
    title: photo.title,
    altText: photo.altText,
    description: photo.description,
    tags: photo.tags,
    status: photo.status,
    storage: { name: photo.storage, label: urls.storageLabel(photo.storage) },
    album: photo.album ? { id: photo.album.id, title: photo.album.title, slug: photo.album.slug } : null,
    width: current?.width ?? photo.width,
    height: current?.height ?? photo.height,
    blurDataUrl: photo.blurDataUrl,
    src: fallback?.url ?? "",
    srcSet: variants.map((v) => `${v.url} ${v.width}w`).join(", "),
    variants,
    original: {
      width: photo.width,
      height: photo.height,
      bytes: photo.originalBytes,
      mime: photo.originalMime,
      downloadUrl: `/api/photos/${photo.id}/download`,
      ...(opts.admin ? { storageKey: photo.originalKey } : {}),
    },
    source: { filename: photo.sourceFilename, format: photo.sourceFormat, bytes: photo.sourceBytes },
    version: photo.currentVersion,
    ...(opts.admin && current
      ? {
          edit: {
            crop:
              current.cropX !== null && current.cropY !== null && current.cropWidth !== null && current.cropHeight !== null
                ? { x: current.cropX, y: current.cropY, width: current.cropWidth, height: current.cropHeight }
                : null,
            rotate: current.rotate,
            flipH: current.flipH,
            editedAt: current.createdAt.toISOString(),
          },
        }
      : {}),
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.updatedAt.toISOString(),
  };
}

export const photoInclude = {
  variants: true,
  album: true,
  versions: { where: { supersededAt: null }, take: 1 },
} as const;
