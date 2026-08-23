// Reads DATABASE_URL / JWT_SECRET out of Canteen-Backend/.env without dotenv.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// e2e/load/lib -> e2e/load -> e2e -> Canteen-Frontend -> KLH-Canteen
const REPO_ROOT = resolve(HERE, "../../../..");

export const BACKEND_ENV_PATH =
  process.env.LOAD_BACKEND_ENV || resolve(REPO_ROOT, "Canteen-Backend/.env");

function parseDotenv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Process env wins; the backend .env fills the gaps. Throws a message the
 * operator can act on rather than a stack trace.
 */
export function loadBackendEnv() {
  let fileEnv = {};
  if (existsSync(BACKEND_ENV_PATH)) {
    fileEnv = parseDotenv(readFileSync(BACKEND_ENV_PATH, "utf8"));
  }
  const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET || fileEnv.JWT_SECRET;
  const missing = [];
  if (!databaseUrl) missing.push("DATABASE_URL");
  if (!jwtSecret) missing.push("JWT_SECRET");
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(" and ")}.\n` +
        `Looked in process.env and ${BACKEND_ENV_PATH}.\n` +
        `Either fix that file or run with --login to use the real login endpoint.`
    );
  }
  return { databaseUrl, jwtSecret, source: BACKEND_ENV_PATH };
}

export { REPO_ROOT };
