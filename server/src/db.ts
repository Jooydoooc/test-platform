import { PrismaClient } from "@prisma/client";
import { env } from "./config/env.js";

// Single Prisma instance for the process. Guarded against duplicate instantiation
// during dev hot-reload (tsx watch).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
