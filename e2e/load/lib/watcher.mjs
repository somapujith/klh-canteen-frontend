// Admin kitchen-board watcher: polls GET /admin/orders and reports how many
// orders the board currently shows, broken down by status.
//
// GET /admin/orders is cursor-paginated (default 50 rows, active statuses
// only) and answers in two shapes: a bare JSON array plus X-Next-Cursor /
// X-Has-More headers, or `{data, nextCursor, hasMore}` under
// ?format=envelope. Counting one page would silently cap the board at the
// page size, so the watcher walks the cursor and handles both shapes — and
// still works against a backend that has no pagination at all.
import { ipFor } from "./http.mjs";

const WATCHER_IP = ipFor(60001);
const PAGE_LIMIT = 200; // MAX_ORDER_PAGE_SIZE on the backend
const MAX_PAGES = 10; // hard stop so a broken cursor can't spin forever

export class AdminWatcher {
  /**
   * @param {(path: string, opts?: object) => Promise<any>} client
   * @param {{token: string, email?: string, kitchen?: string|null, role?: string}} admin
   */
  constructor(client, admin, intervalMs) {
    this.client = client;
    this.admin = admin;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.polling = false;
    this.label = `${admin.email || admin.id} · ${admin.kitchen || admin.role || "ALL"}`;
    this.state = { total: null, byStatus: {}, polls: 0, error: null, delta: 0, lastMs: 0, pages: 0, truncated: false };
    this.history = [];
  }

  start() {
    const tick = async () => {
      if (this.polling) return;
      this.polling = true;
      try {
        await this.poll();
      } catch (err) {
        this.state.error = `watcher: ${err?.message || err}`;
      } finally {
        this.polling = false;
      }
    };
    void tick();
    this.timer = setInterval(tick, this.intervalMs);
    if (this.timer.unref) this.timer.unref();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async poll() {
    const started = performance.now();
    const orders = [];
    let cursor = null;
    let pages = 0;
    let truncated = false;

    while (pages < MAX_PAGES) {
      const query = new URLSearchParams({ format: "envelope", limit: String(PAGE_LIMIT) });
      if (cursor) query.set("cursor", cursor);
      const res = await this.client(`/admin/orders?${query}`, { token: this.admin.token, ip: WATCHER_IP });
      pages++;
      if (!res.ok) {
        this.state.polls++;
        this.state.error = `${res.status || "---"} ${res.code}: ${res.message}`;
        this.state.lastMs = performance.now() - started;
        return this.state;
      }
      const { rows, nextCursor, hasMore } = readPage(res);
      orders.push(...rows);
      if (!hasMore || !nextCursor) break;
      cursor = nextCursor;
      if (pages === MAX_PAGES) truncated = true;
    }

    const byStatus = {};
    for (const order of orders) {
      const status = order?.status || "UNKNOWN";
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    const previous = this.state.total ?? orders.length;
    this.state = {
      total: orders.length,
      byStatus,
      polls: this.state.polls + 1,
      error: null,
      delta: orders.length - previous,
      lastMs: performance.now() - started,
      pages,
      truncated,
    };
    this.history.push({ at: Date.now(), total: orders.length, byStatus });
    return this.state;
  }

  /** Orders the board gained between the first and last successful poll. */
  growth() {
    if (this.history.length < 2) return null;
    return this.history[this.history.length - 1].total - this.history[0].total;
  }
}

/** Normalises the envelope shape, the bare-array + headers shape, and legacy. */
function readPage(res) {
  const body = res.body;
  if (body && !Array.isArray(body) && Array.isArray(body.data)) {
    return { rows: body.data, nextCursor: body.nextCursor ?? null, hasMore: Boolean(body.hasMore) };
  }
  const rows = Array.isArray(body) ? body : [];
  const headerCursor = res.headers?.get?.("X-Next-Cursor") || null;
  const headerHasMore = res.headers?.get?.("X-Has-More");
  return {
    rows,
    nextCursor: headerCursor || null,
    hasMore: headerHasMore === "true" && Boolean(headerCursor),
  };
}
