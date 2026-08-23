// Read-only user lookups for offline token minting.
//
// Uses the Neon serverless driver that Canteen-Backend already depends on
// (resolved by absolute path, so the frontend gains no new npm dependency),
// and falls back to Prisma if the driver is unavailable. STRICTLY SELECTs —
// this harness never writes to the database directly.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { REPO_ROOT } from "./env.mjs";

const NEON_ENTRY = resolve(REPO_ROOT, "Canteen-Backend/node_modules/@neondatabase/serverless/index.mjs");
const PRISMA_ENTRY = resolve(REPO_ROOT, "Canteen-Backend/node_modules/@prisma/client/default.js");
const PRISMA_ADAPTER = resolve(REPO_ROOT, "Canteen-Backend/node_modules/@prisma/adapter-neon/dist/index.mjs");

async function neonQuery(databaseUrl) {
  if (!existsSync(NEON_ENTRY)) return null;
  const { neon } = await import(pathToFileURL(NEON_ENTRY).href);
  const sql = neon(databaseUrl);
  return {
    students: (limit) =>
      sql`SELECT id, "rollNumber", name FROM "User"
          WHERE role = 'STUDENT' AND "rollNumber" IS NOT NULL
          ORDER BY "rollNumber" ASC LIMIT ${limit}`,
    admin: (identifier) =>
      sql`SELECT id, email, name, role, kitchen FROM "User"
          WHERE (email = ${identifier} OR "rollNumber" = ${identifier})
            AND role IN ('ADMIN', 'SUPERADMIN') LIMIT 1`,
    driver: "@neondatabase/serverless",
    close: async () => {},
  };
}

async function prismaQuery(databaseUrl) {
  if (!existsSync(PRISMA_ENTRY) || !existsSync(PRISMA_ADAPTER)) return null;
  const { PrismaClient } = await import(pathToFileURL(PRISMA_ENTRY).href);
  const { PrismaNeon } = await import(pathToFileURL(PRISMA_ADAPTER).href);
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: databaseUrl }) });
  return {
    students: (limit) =>
      prisma.user.findMany({
        where: { role: "STUDENT", rollNumber: { not: null } },
        select: { id: true, rollNumber: true, name: true },
        orderBy: { rollNumber: "asc" },
        take: limit,
      }),
    admin: async (identifier) =>
      prisma.user.findMany({
        where: {
          role: { in: ["ADMIN", "SUPERADMIN"] },
          OR: [{ email: identifier }, { rollNumber: identifier }],
        },
        select: { id: true, email: true, name: true, role: true, kitchen: true },
        take: 1,
      }),
    driver: "@prisma/client",
    close: () => prisma.$disconnect(),
  };
}

export async function openDb(databaseUrl) {
  const errors = [];
  for (const factory of [neonQuery, prismaQuery]) {
    try {
      const db = await factory(databaseUrl);
      if (db) return db;
    } catch (err) {
      errors.push(`${factory.name}: ${err.message}`);
    }
  }
  throw new Error(
    `Could not open a database client for offline token minting.\n` +
      (errors.length ? `  ${errors.join("\n  ")}\n` : "") +
      `Install Canteen-Backend dependencies, or run with --login.`
  );
}
