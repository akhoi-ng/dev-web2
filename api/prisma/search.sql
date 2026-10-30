-- Block 7: cấu hình PostgreSQL cho tìm kiếm món (chạy sau mỗi lần `npm run db:push`).
-- Chạy: npm run db:search   (prisma db execute --file prisma/search.sql)
-- Idempotent: chạy lại nhiều lần không lỗi.

-- Tìm gần đúng (fuzzy) dùng similarity / word_similarity của pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Full-text: biểu thức PHẢI trùng y hệt biểu thức trong truy vấn (api/src/db/dish-search.js)
-- thì PostgreSQL mới dùng được index. description có thể NULL nên dùng coalesce.
CREATE INDEX IF NOT EXISTS dishes_fts_idx ON dishes
  USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));

-- Trigram trên tên: tăng tốc ILIKE '%...%' của basic/advanced
CREATE INDEX IF NOT EXISTS dishes_name_trgm_idx ON dishes USING GIN (name gin_trgm_ops);
