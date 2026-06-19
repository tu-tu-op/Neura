import { PrismaClient } from "@prisma/client";

declare global {
  var dataloopPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.dataloopPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.dataloopPrisma = prisma;
}
