const { PrismaClient } = require("@prisma/client");

// LOG_SQL=1: in mọi câu SQL Prisma gửi tới PostgreSQL (bằng chứng "query thực hiện tại PostgreSQL").
const options = process.env.LOG_SQL === "1" ? { log: [{ emit: "stdout", level: "query" }] } : {};

// Dùng một instance duy nhất cho toàn ứng dụng (tránh mở nhiều pool khi dev --watch).
const globalForPrisma = globalThis;
const prisma = globalForPrisma.__prisma || new PrismaClient(options);
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

module.exports = prisma;
