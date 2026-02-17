// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: Pool;
};

function getDatabaseUrl() {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    ""
  );
}

function getPool() {
  if (globalForPrisma.pool) return globalForPrisma.pool;

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    // If this throws on Vercel, you’re missing DB env vars in that environment.
    throw new Error("Missing DATABASE URL (POSTGRES_URL / DATABASE_URL).");
  }

  globalForPrisma.pool = new Pool({ connectionString });
  return globalForPrisma.pool;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(getPool()),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
