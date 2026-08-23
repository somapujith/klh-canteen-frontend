// Timed HTTP client over Node's built-in fetch. Never throws for a failed
// request — every outcome comes back as a normalised result object so the
// harness can report failures as data instead of crashing.

/**
 * @typedef {Object} Result
 * @property {boolean} ok
 * @property {number} status      HTTP status, or 0 for transport failures
 * @property {number} ms          wall time for the request
 * @property {any}    body        parsed JSON (or raw text under `.raw`)
 * @property {Headers|undefined} headers  response headers (pagination cursors)
 * @property {string} code        error code: API code, NETWORK, TIMEOUT, ...
 * @property {string} message     human readable failure reason
 */

export function ipFor(index) {
  // Deterministic private-range address per virtual user. The backend's
  // rate limiter keys on CF-Connecting-IP / X-Forwarded-For, so distinct
  // values per student mimic 25 phones on campus wifi instead of one box.
  const n = 2 + (index % 60000);
  return `10.${20 + Math.floor(n / 65536)}.${Math.floor(n / 256) % 256}.${n % 256}`;
}

export function makeClient({ baseUrl, timeout, spoofIp }) {
  return async function request(path, { method = "GET", token, body, ip, headers = {} } = {}) {
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const started = performance.now();

    const finalHeaders = { Accept: "application/json", ...headers };
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
    if (spoofIp && ip) {
      finalHeaders["X-Forwarded-For"] = ip;
      finalHeaders["CF-Connecting-IP"] = ip;
    }

    try {
      const res = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      const ms = performance.now() - started;
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { raw: text };
      }
      if (res.ok) return { ok: true, status: res.status, ms, body: parsed, headers: res.headers, code: "OK", message: "" };
      return {
        ok: false,
        status: res.status,
        ms,
        body: parsed,
        headers: res.headers,
        code: parsed?.error?.code || `HTTP_${res.status}`,
        message: parsed?.error?.message || truncate(text) || res.statusText,
      };
    } catch (err) {
      const ms = performance.now() - started;
      const aborted = err?.name === "AbortError";
      return {
        ok: false,
        status: 0,
        ms,
        body: null,
        code: aborted ? "TIMEOUT" : transportCode(err),
        message: aborted ? `No response within ${timeout}ms` : transportMessage(err),
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

function transportCode(err) {
  const cause = err?.cause?.code;
  if (cause === "ECONNREFUSED") return "CONN_REFUSED";
  if (cause === "ECONNRESET") return "CONN_RESET";
  if (cause) return String(cause);
  return "NETWORK";
}

function transportMessage(err) {
  const cause = err?.cause?.code;
  if (cause === "ECONNREFUSED") return "Backend refused the connection — is wrangler dev running?";
  return err?.cause?.message || err?.message || "Transport failure";
}

function truncate(text, max = 120) {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
