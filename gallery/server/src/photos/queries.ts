import type { Prisma, PrismaClient, PhotoStatus } from "@prisma/client";
import { z } from "zod";
import { photoInclude, toPhotoDto, type UrlBuilder } from "./serialize.js";

export const ListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  album: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(30).optional(),
  status: z.enum(["PUBLISHED", "HIDDEN", "DELETING"]).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type ListQuery = z.infer<typeof ListQuerySchema>;

/** Danh sách ảnh, phân trang theo con trỏ (createdAt giảm dần, id giảm dần). */
export async function listPhotos(prisma: PrismaClient, urls: UrlBuilder, query: ListQuery, opts: { admin: boolean }) {
  const where: Prisma.PhotoWhereInput = {};
  if (opts.admin) {
    if (query.status) where.status = query.status as PhotoStatus;
  } else {
    where.status = "PUBLISHED";
  }
  if (query.q) where.title = { contains: query.q, mode: "insensitive" };
  if (query.tag) where.tags = { has: query.tag.toLowerCase() };
  if (query.album) {
    where.album = z.uuid().safeParse(query.album).success ? { id: query.album } : { slug: query.album };
  }
  const rows = await prisma.photo.findMany({
    where,
    include: photoInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    items: page.map((p) => toPhotoDto(p, urls, { admin: opts.admin })),
    nextCursor: hasMore ? page.at(-1)!.id : null,
  };
}

/** Tag của ảnh công khai kèm số ảnh, nhiều nhất trước. */
export async function listTags(prisma: PrismaClient) {
  const rows = await prisma.photo.findMany({
    where: { status: "PUBLISHED", NOT: { tags: { isEmpty: true } } },
    select: { tags: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const counts = new Map<string, number>();
  for (const row of rows) for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 50);
}

export async function listAlbums(prisma: PrismaClient, urls: UrlBuilder, opts: { admin: boolean }) {
  const photoWhere: Prisma.PhotoWhereInput = opts.admin ? { status: { not: "DELETING" } } : { status: "PUBLISHED" };
  const albums = await prisma.album.findMany({
    orderBy: { title: "asc" },
    include: {
      _count: { select: { photos: { where: photoWhere } } },
      photos: { where: photoWhere, orderBy: { createdAt: "desc" }, take: 1, include: photoInclude },
    },
  });
  return albums
    .filter((a) => opts.admin || a._count.photos > 0)
    .map((a) => {
      const cover = a.photos[0];
      const dto = cover ? toPhotoDto(cover, urls) : null;
      return {
        id: a.id,
        title: a.title,
        slug: a.slug,
        description: a.description,
        photoCount: a._count.photos,
        cover: dto ? { src: dto.variants[0]?.url ?? dto.src, blurDataUrl: dto.blurDataUrl, altText: dto.altText } : null,
        createdAt: a.createdAt.toISOString(),
      };
    });
}
