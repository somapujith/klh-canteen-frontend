// Minimal HS256 JWT signer, byte-compatible with the backend's
// src/lib/jwt.ts -> jsonwebtoken.sign(payload, secret, { expiresIn: "12h" }).
// Hand-rolled with node:crypto so the harness stays dependency-free.
import { createHmac } from "node:crypto";

const TWELVE_HOURS = 12 * 60 * 60;

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

/**
 * @param {{sub: string, role: string, kitchen?: string|null}} payload
 * @param {string} secret
 * @param {number} expiresInSeconds
 */
export function signToken(payload, secret, expiresInSeconds = TWELVE_HOURS) {
  if (!secret) throw new Error("JWT_SECRET not set");
  if (!payload?.sub) throw new Error("signToken: payload.sub is required");
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat, exp: iat + expiresInSeconds }));
  const signingInput = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

/** Decodes without verifying — used only to check cached tokens for expiry. */
export function decodeToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function isExpiringWithin(token, seconds) {
  const payload = decodeToken(token);
  if (!payload?.exp) return true;
  return payload.exp - Math.floor(Date.now() / 1000) < seconds;
}
