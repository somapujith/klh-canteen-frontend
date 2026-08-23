// Token acquisition for the virtual students.
//
//   mint  (default) — read DATABASE_URL + JWT_SECRET from Canteen-Backend/.env,
//                     SELECT the student rows, and sign HS256 tokens locally
//                     with the same claims as src/lib/jwt.ts. Zero calls to
//                     /auth/login, so the login rate limiter is irrelevant.
//   login           — hit the real POST /auth/login endpoint.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBackendEnv } from "./env.mjs";
import { openDb } from "./db.mjs";
import { signToken, isExpiringWithin } from "./jwt.mjs";
import { ipFor } from "./http.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(HERE, "../.cache");
const CACHE_FILE = resolve(CACHE_DIR, "tokens.json");
const REFRESH_MARGIN_SECONDS = 60 * 60; // re-mint when under an hour of life left
const LOGIN_CONCURRENCY = 4;

/** Roll numbers of the seeded student accounts (gaps are real). */
export function seededRollNumbers() {
  const gaps = new Set([129, 133, 134, 137]);
  const rolls = [];
  for (let i = 1; i <= 154; i++) {
    if (gaps.has(i)) continue;
    rolls.push(`242009${String(i).padStart(4, "0")}`);
  }
  return rolls;
}

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function secretFingerprint(secret) {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

function readCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(data) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

function cacheUsable(cache, fingerprint) {
  if (!cache || cache.fingerprint !== fingerprint) return false;
  const all = [...(cache.students || []), ...Object.values(cache.admins || {})];
  if (!all.length) return false;
  return all.every((entry) => entry.token && !isExpiringWithin(entry.token, REFRESH_MARGIN_SECONDS));
}

/**
 * @returns {Promise<{students: Array, admin: Object|null, mode: string, note: string}>}
 */
export async function acquireIdentities(cfg, log) {
  if (cfg.mode === "login") return loginIdentities(cfg, log);
  return mintIdentities(cfg, log);
}

async function mintIdentities(cfg, log) {
  const { databaseUrl, jwtSecret, source } = loadBackendEnv();
  const fingerprint = secretFingerprint(jwtSecret);
  const wantAdmin = cfg.adminIdentifier;

  const cache = cfg.refreshTokens ? null : readCache();
  if (cacheUsable(cache, fingerprint) && cache.students.length >= cfg.users && (!cfg.watchAdmin || cache.admins?.[wantAdmin])) {
    log(`reusing cached tokens (${cache.students.length} students, minted ${new Date(cache.mintedAt).toLocaleTimeString()})`);
    return {
      students: attachIps(shuffled(cache.students).slice(0, cfg.users)),
      admin: cache.admins?.[wantAdmin] || null,
      mode: "minted (cached)",
      note: `HS256 tokens signed from ${source}`,
    };
  }

  log(`minting tokens offline from ${source}`);
  const db = await openDb(databaseUrl);
  try {
    const rows = await db.students(Math.max(cfg.users, 200));
    if (!rows.length) throw new Error("No STUDENT rows with a rollNumber found in the database.");
    const students = rows.map((row) => ({
      id: row.id,
      rollNumber: row.rollNumber,
      name: row.name,
      token: signToken({ sub: row.id, role: "STUDENT", kitchen: null }, jwtSecret),
    }));

    // Keep admin tokens minted for *other* --admin identifiers, so switching
    // between snacks/meals/superadmin doesn't force a full re-mint each time.
    const admins = cache?.fingerprint === fingerprint ? { ...(cache.admins || {}) } : {};
    const adminRows = await db.admin(wantAdmin);
    const adminRow = Array.isArray(adminRows) ? adminRows[0] : adminRows;
    if (adminRow) {
      admins[wantAdmin] = {
        id: adminRow.id,
        name: adminRow.name,
        email: adminRow.email,
        role: adminRow.role,
        kitchen: adminRow.kitchen ?? null,
        token: signToken({ sub: adminRow.id, role: adminRow.role, kitchen: adminRow.kitchen ?? null }, jwtSecret),
      };
    } else if (cfg.watchAdmin) {
      log(`WARN: no ADMIN/SUPERADMIN row matched "${wantAdmin}" — watcher disabled`);
    }

    writeCache({ fingerprint, mintedAt: Date.now(), students, admins });
    log(`minted ${students.length} student tokens${adminRow ? " + 1 admin token" : ""}`);
    return {
      students: attachIps(shuffled(students).slice(0, cfg.users)),
      admin: admins[wantAdmin] || null,
      mode: `minted via ${db.driver}`,
      note: `HS256 tokens signed from ${source}`,
    };
  } finally {
    await db.close().catch(() => {});
  }
}

async function loginIdentities(cfg, log) {
  const { makeClient } = await import("./http.mjs");
  const client = makeClient({ baseUrl: cfg.api, timeout: cfg.timeout, spoofIp: cfg.spoofIp });
  const rolls = shuffled(seededRollNumbers()).slice(0, cfg.users);
  const students = [];
  const failures = [];

  log(`logging in ${rolls.length} students via POST /auth/login (concurrency ${LOGIN_CONCURRENCY})`);
  let cursor = 0;
  async function worker() {
    while (cursor < rolls.length) {
      const index = cursor++;
      const rollNumber = rolls[index];
      const res = await client("/auth/login", {
        method: "POST",
        body: { identifier: rollNumber, password: cfg.studentPassword },
        ip: ipFor(index),
      });
      if (res.ok && res.body?.token) {
        students.push({ id: res.body.id, rollNumber, name: res.body.name, token: res.body.token, ip: ipFor(index) });
      } else {
        failures.push(`${rollNumber}: ${res.status} ${res.code} ${res.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LOGIN_CONCURRENCY, rolls.length) }, worker));

  if (failures.length) {
    log(`WARN: ${failures.length}/${rolls.length} logins failed — e.g. ${failures[0]}`);
  }

  let admin = null;
  if (cfg.watchAdmin) {
    const res = await client("/auth/login", {
      method: "POST",
      body: { identifier: cfg.adminIdentifier, password: cfg.adminPassword },
      ip: ipFor(9999),
    });
    if (res.ok && res.body?.token) {
      admin = { id: res.body.id, name: res.body.name, email: cfg.adminIdentifier, role: res.body.role, kitchen: res.body.kitchen, token: res.body.token };
    } else {
      log(`WARN: admin login failed (${res.status} ${res.code} ${res.message}) — watcher disabled`);
    }
  }

  return {
    students: attachIps(students),
    admin,
    mode: "real /auth/login",
    note: failures.length ? `${failures.length} login(s) rejected` : "all logins accepted",
  };
}

function attachIps(students) {
  return students.map((student, index) => ({ ...student, ip: student.ip || ipFor(index) }));
}
