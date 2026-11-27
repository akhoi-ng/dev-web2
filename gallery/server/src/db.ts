import { PrismaClient } from "@prisma/client";

export type { Prisma, PhotoStatus } from "@prisma/client";

let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  client ??= new PrismaClient({
    log: process.env.LOG_SQL === "1" ? ["query", "warn", "error"] : ["warn", "error"],
  });
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
