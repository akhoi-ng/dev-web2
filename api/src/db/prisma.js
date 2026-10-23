const { PrismaClient } = require("@prisma/client");

// Dùng một instance duy nhất cho toàn ứng dụng (tránh mở nhiều pool khi dev --watch).
const globalForPrisma = globalThis;
const prisma = globalForPrisma.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

module.exports = prisma;
