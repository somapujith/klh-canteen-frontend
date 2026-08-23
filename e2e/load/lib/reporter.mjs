// Live-updating console reporter. Built for a screen-share demo: one stable
// block that redraws in place, no scrolling wall of log lines.
const useColor =
  (process.stdout.isTTY || process.env.LOAD_FORCE_TTY === "1") && !process.env.NO_COLOR;

const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const c = {
  dim: paint("2"),
  bold: paint("1"),
  green: paint("32"),
  red: paint("31"),
  yellow: paint("33"),
  cyan: paint("36"),
  magenta: paint("35"),
  blue: paint("34"),
};

const WIDTH = 74;
const STATUS_ORDER = ["PENDING", "PREPARING", "COOKED", "DELIVERED"];

function visibleLength(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function pad(text, width) {
  const gap = Math.max(0, width - visibleLength(text));
  return text + " ".repeat(gap);
}

function bar(fraction, width = 30) {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return c.cyan("█".repeat(filled)) + c.dim("░".repeat(width - filled));
}

function ms(value) {
  if (!value) return "   -  ";
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

export class Reporter {
  constructor(cfg, meta) {
    this.cfg = cfg;
    this.meta = meta;
    this.lastLineCount = 0;
    this.plain = cfg.plain;
    this.lastPlainAt = 0;
  }

  header(lines) {
    for (const line of lines) process.stdout.write(`${line}\n`);
  }

  render(stats, watcher, { totalPlanned, done = false } = {}) {
    if (this.plain) return this.renderPlain(stats, watcher, { totalPlanned, done });
    const lines = this.buildFrame(stats, watcher, { totalPlanned, done });
    if (this.lastLineCount) process.stdout.write(`\x1b[${this.lastLineCount}A`);
    for (const line of lines) process.stdout.write(`\x1b[2K${line}\n`);
    this.lastLineCount = lines.length;
  }

  renderPlain(stats, watcher, { totalPlanned, done }) {
    const now = Date.now();
    if (!done && now - this.lastPlainAt < 2000) return;
    this.lastPlainAt = now;
    const p = stats.percentiles();
    const board = watcher?.state?.total != null ? ` board=${watcher.state.total}` : "";
    process.stdout.write(
      `[${(stats.elapsedMs / 1000).toFixed(1)}s] attempted=${stats.attempted}/${totalPlanned} ok=${stats.succeeded} ` +
        `fail=${stats.failed} (${stats.failRate.toFixed(1)}%) p50=${Math.round(p.p50)}ms p95=${Math.round(p.p95)}ms${board}\n`
    );
  }

  buildFrame(stats, watcher, { totalPlanned, done }) {
    if (this.cfg.watchOnly) return this.buildWatchFrame(stats, watcher);
    const p = stats.percentiles();
    const finished = stats.succeeded + stats.failed;
    const fraction = totalPlanned ? finished / totalPlanned : 0;
    const title = done ? "KLH CANTEEN · RUSH COMPLETE" : "KLH CANTEEN · LUNCH RUSH SIMULATOR";
    const clock = `${(stats.elapsedMs / 1000).toFixed(1)}s`;
    const failColor = stats.failRate > this.cfg.failThreshold ? c.red : c.green;

    const lines = [];
    lines.push("");
    lines.push(`  ${c.dim("┏" + "━".repeat(WIDTH) + "┓")}`);
    lines.push(`  ${c.dim("┃")} ${pad(c.bold(c.magenta(title)), WIDTH - 12)}${pad(c.dim("⏱ " + clock), 10)} ${c.dim("┃")}`);
    lines.push(`  ${c.dim("┗" + "━".repeat(WIDTH) + "┛")}`);
    lines.push(
      `   ${c.dim("target  ")}${pad(this.meta.api, 30)}${c.dim("auth    ")}${this.meta.authMode}`
    );
    lines.push(
      `   ${c.dim("students")} ${pad(String(this.meta.studentCount), 29)}${c.dim("orders  ")}` +
        `${this.cfg.ordersMin}-${this.cfg.ordersMax} each · ≤${this.cfg.itemsPerOrder} items`
    );
    lines.push("");
    lines.push(
      `   ${c.bold("ORDERS")}  ${bar(fraction)}  ${pad(`${(fraction * 100).toFixed(0)}%`, 5)}` +
        c.dim(`${finished} / ${totalPlanned}`)
    );
    lines.push("");
    lines.push(
      `     ${c.dim("placed")}   ${pad(c.green(String(stats.succeeded)), 10)}` +
        `${c.dim("failed")}   ${pad(stats.failed ? c.red(String(stats.failed)) : c.green("0"), 10)}` +
        `${c.dim("in flight")} ${stats.inFlight}`
    );
    lines.push(
      `     ${c.dim("rate")}     ${pad(`${stats.throughput.toFixed(1)}/s`, 10)}` +
        `${c.dim("failrate")} ${pad(failColor(`${stats.failRate.toFixed(1)}%`), 10)}` +
        `${c.dim("db orders")} ${stats.ordersCreated}`
    );
    lines.push("");
    lines.push(
      `   ${c.bold("LATENCY")}  ${c.dim("p50")} ${pad(ms(p.p50), 10)}${c.dim("p95")} ${pad(ms(p.p95), 10)}` +
        `${c.dim("max")} ${ms(p.max)}`
    );

    const failures = stats.failureRows();
    lines.push("");
    if (failures.length) {
      lines.push(`   ${c.bold(c.red("FAILURES"))}`);
      for (const row of failures.slice(0, 6)) {
        const status = row.status === 0 ? "---" : String(row.status);
        lines.push(
          `     ${c.red(pad(status, 5))}${pad(c.yellow(row.code), 24)}${pad(c.dim("×" + row.count), 7)}` +
            c.dim(clip(row.message, 30))
        );
      }
      if (failures.length > 6) lines.push(c.dim(`     … ${failures.length - 6} more failure kinds`));
    } else {
      lines.push(`   ${c.bold("FAILURES")}  ${c.green("none")}`);
    }

    if (watcher) lines.push(...this.watcherLines(watcher));
    lines.push("");
    return lines;
  }

  /** --watch-only: just the board, no load-generator panels. */
  buildWatchFrame(stats, watcher) {
    const clock = `${(stats.elapsedMs / 1000).toFixed(1)}s`;
    const lines = [""];
    lines.push(`  ${c.dim("┏" + "━".repeat(WIDTH) + "┓")}`);
    lines.push(
      `  ${c.dim("┃")} ${pad(c.bold(c.blue("KLH CANTEEN · KITCHEN BOARD WATCHER")), WIDTH - 12)}` +
        `${pad(c.dim("⏱ " + clock), 10)} ${c.dim("┃")}`
    );
    lines.push(`  ${c.dim("┗" + "━".repeat(WIDTH) + "┛")}`);
    lines.push(`   ${c.dim("target  ")}${pad(this.meta.api, 30)}${c.dim("poll    ")}GET /admin/orders`);
    lines.push(...(watcher ? this.watcherLines(watcher) : ["", `   ${c.red("no admin token")}`]));
    lines.push("");
    lines.push(`   ${c.dim("Ctrl-C to stop")}`);
    lines.push("");
    return lines;
  }

  watcherLines(watcher) {
    const s = watcher.state;
    const out = ["", `   ${c.bold(c.blue("KITCHEN BOARD"))}  ${c.dim(`${watcher.label} · polled ${s.polls}× every ${this.cfg.watchInterval}ms`)}`];
    if (s.error) {
      out.push(`     ${c.red(s.error)}`);
      return out;
    }
    if (s.total == null) {
      out.push(`     ${c.dim("waiting for first poll…")}`);
      return out;
    }
    const breakdown = STATUS_ORDER.filter((k) => s.byStatus[k])
      .map((k) => `${c.dim(k)} ${c.bold(String(s.byStatus[k]))}`)
      .join(c.dim("  ·  "));
    const pages = s.pages > 1 ? c.dim(` (${s.pages} pages${s.truncated ? ", truncated" : ""})`) : "";
    out.push(
      `     ${c.bold(c.cyan(String(s.total)))} active orders${pages}   ${breakdown || c.dim("board empty")}` +
        (s.delta > 0 ? c.green(`   +${s.delta} since last poll`) : "")
    );
    return out;
  }
}

function clip(text, max) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export { pad, clip, WIDTH };
