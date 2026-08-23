#!/usr/bin/env node
// KLH Canteen — concurrent order load / demo harness.
//
//   npm run load                      25 students, tokens minted offline
//   npm run load -- --watch-admin     …plus a live kitchen-board watcher
//   node e2e/load/run.mjs --help      all options
//
// Plain Node + built-in fetch. No new npm dependencies.
import { parseArgs, HELP } from "./lib/config.mjs";
import { makeClient } from "./lib/http.mjs";
import { acquireIdentities } from "./lib/identities.mjs";
import { Stats } from "./lib/stats.mjs";
import { Reporter, c } from "./lib/reporter.mjs";
import { AdminWatcher } from "./lib/watcher.mjs";
import { createSemaphore } from "./lib/semaphore.mjs";

const EXIT_OK = 0;
const EXIT_THRESHOLD = 1;
const EXIT_CANNOT_START = 2;
const RENDER_INTERVAL_MS = 120;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function log(message) {
  process.stdout.write(`  ${c.dim("·")} ${c.dim(message)}\n`);
}

function fatal(message) {
  process.stdout.write(`\n  ${c.red("✘ cannot start")} ${message}\n\n`);
  process.exit(EXIT_CANNOT_START);
}

/** Flattens GET /menu into an orderable item pool. */
export function buildItemPool(menu, kitchenFilter) {
  const categories = menu?.categories;
  if (!Array.isArray(categories)) return [];
  const pool = [];
  for (const category of categories) {
    if (kitchenFilter && category.kitchen !== kitchenFilter) continue;
    for (const item of category.items || []) {
      if (item.isAvailable === false) continue;
      if (typeof item.stockQty === "number" && item.stockQty <= 0) continue;
      pool.push({ id: item.id, name: item.name, price: item.price, kitchen: category.kitchen, category: category.name });
    }
  }
  return pool;
}

/** Random basket of 1..itemsPerOrder distinct items. */
export function randomBasket(pool, cfg) {
  const count = Math.min(pool.length, randInt(1, cfg.itemsPerOrder));
  const chosen = new Map();
  let guard = 0;
  while (chosen.size < count && guard++ < count * 10) {
    const item = pick(pool);
    if (!chosen.has(item.id)) chosen.set(item.id, { menuItemId: item.id, qty: randInt(1, cfg.maxQty) });
  }
  return [...chosen.values()];
}

async function main() {
  let cfg;
  try {
    cfg = parseArgs();
  } catch (err) {
    process.stdout.write(`\n  ${c.red(err.message)}\n${HELP}`);
    process.exit(EXIT_CANNOT_START);
  }
  if (cfg.help) {
    process.stdout.write(HELP);
    return EXIT_OK;
  }

  process.stdout.write(`\n  ${c.bold(c.magenta("KLH CANTEEN LOAD HARNESS"))}\n`);
  log(`api ${cfg.api}`);
  if (cfg.spoofIp) log("per-student X-Forwarded-For / CF-Connecting-IP spoofing ON (spreads the per-IP rate limiter)");
  else log("ip spoofing OFF — the per-IP rate limiter will throttle this run");

  const client = makeClient({ baseUrl: cfg.api, timeout: cfg.timeout, spoofIp: cfg.spoofIp });

  // 1. Reachability — fail fast with a readable message instead of 25 timeouts.
  const health = await client("/health");
  if (!health.ok) {
    fatal(`GET ${cfg.api}/health -> ${health.status || "no response"} ${health.code}: ${health.message}`);
  }
  log(`backend healthy (${Math.round(health.ms)}ms)`);

  // 2. Identities.
  let identities;
  try {
    identities = await acquireIdentities(cfg, log);
  } catch (err) {
    fatal(err.message);
  }
  if (!identities.students.length) {
    fatal("no student tokens were obtained — try --refresh-tokens, or --login if the DB is unreachable");
  }
  log(`${identities.students.length} student identities ready (${identities.mode})`);

  // 3. Menu.
  const menuRes = await client("/menu", { ip: identities.students[0].ip });
  if (!menuRes.ok) fatal(`GET /menu -> ${menuRes.status} ${menuRes.code}: ${menuRes.message}`);
  const pool = buildItemPool(menuRes.body, cfg.kitchen);
  if (!pool.length) fatal(`GET /menu returned no orderable items${cfg.kitchen ? ` for kitchen ${cfg.kitchen}` : ""}`);
  log(`menu loaded: ${pool.length} orderable items across ${menuRes.body.categories.length} categories (${Math.round(menuRes.ms)}ms)`);

  // 4. Watcher.
  let watcher = null;
  if (cfg.watchAdmin && identities.admin) {
    watcher = new AdminWatcher(client, identities.admin, cfg.watchInterval).start();
    log(`watching kitchen board as ${watcher.label}`);
  } else if (cfg.watchAdmin) {
    log("WARN: watcher requested but no admin token available — continuing without it");
  }

  const stats = new Stats();
  const reporter = new Reporter(cfg, {
    api: cfg.api,
    authMode: identities.mode,
    studentCount: identities.students.length,
  });

  if (cfg.watchOnly) return watchOnly(cfg, reporter, stats, watcher);

  // 5. Plan the rush.
  const plans = identities.students.map((student) => ({ student, orders: randInt(cfg.ordersMin, cfg.ordersMax) }));
  const totalPlanned = plans.reduce((sum, plan) => sum + plan.orders, 0);
  const gate = createSemaphore(cfg.concurrency);
  log(
    `placing ${totalPlanned} orders across ${plans.length} students` +
      `${cfg.concurrency ? ` · max ${cfg.concurrency} in flight` : " · unlimited concurrency"}` +
      `${cfg.dryRun ? " (DRY RUN — no POST /orders)" : ""}`
  );
  process.stdout.write("\n");

  const timer = setInterval(() => reporter.render(stats, watcher, { totalPlanned }), RENDER_INTERVAL_MS);
  if (timer.unref) timer.unref();

  let interrupted = false;
  const onSigint = () => { interrupted = true; };
  process.on("SIGINT", onSigint);

  await Promise.all(plans.map((plan) => runStudent(plan, { cfg, client, pool, stats, gate, isStopped: () => interrupted })));

  stats.finish();
  clearInterval(timer);
  if (watcher) await watcher.poll().catch(() => {});
  reporter.render(stats, watcher, { totalPlanned, done: true });
  if (watcher) watcher.stop();
  process.off("SIGINT", onSigint);

  return printVerdict(cfg, stats, watcher, totalPlanned, interrupted);
}

/** One virtual student: stagger in, then place their orders with jitter. */
async function runStudent({ student, orders }, { cfg, client, pool, stats, gate, isStopped }) {
  await sleep(randInt(cfg.jitterMin, cfg.jitterMax));
  for (let i = 0; i < orders; i++) {
    if (isStopped()) return;
    const items = randomBasket(pool, cfg);
    if (cfg.dryRun) {
      stats.begin();
      await sleep(randInt(5, 40));
      stats.record({ ok: true, status: 201, ms: 1, code: "DRY_RUN" }, items.length ? 1 : 0);
    } else {
      // begin() runs inside the gate so "in flight" means genuinely in flight,
      // not "queued behind --concurrency".
      await gate.run(async () => {
        stats.begin();
        const res = await client("/orders", { method: "POST", token: student.token, body: { items }, ip: student.ip });
        stats.record(res, Array.isArray(res.body) ? res.body.length : res.ok ? 1 : 0);
      });
    }
    if (i < orders - 1) await sleep(randInt(cfg.jitterMin, cfg.jitterMax));
  }
}

/** --watch-only: no orders, just the live kitchen board until Ctrl-C. */
async function watchOnly(cfg, reporter, stats, watcher) {
  if (!watcher) fatal("--watch-only needs an admin token (check --admin / credentials)");
  process.stdout.write(`\n  ${c.dim("watching kitchen board — Ctrl-C to stop")}\n\n`);
  let running = true;
  process.on("SIGINT", () => { running = false; });
  while (running) {
    reporter.render(stats, watcher, { totalPlanned: 0 });
    await sleep(RENDER_INTERVAL_MS);
  }
  watcher.stop();
  process.stdout.write("\n");
  return EXIT_OK;
}

function printVerdict(cfg, stats, watcher, totalPlanned, interrupted) {
  const p = stats.percentiles();
  const pass = stats.failRate <= cfg.failThreshold;
  const wall = (stats.elapsedMs / 1000).toFixed(2);

  process.stdout.write(`  ${c.dim("─".repeat(76))}\n`);
  process.stdout.write(
    `  attempted ${c.bold(String(stats.attempted))}/${totalPlanned}   ` +
      `succeeded ${c.green(String(stats.succeeded))}   failed ${stats.failed ? c.red(String(stats.failed)) : "0"}   ` +
      `wall ${c.bold(wall + "s")}   p50 ${Math.round(p.p50)}ms  p95 ${Math.round(p.p95)}ms  max ${Math.round(p.max)}ms\n`
  );
  if (watcher?.state?.total != null) {
    const growth = watcher.growth();
    process.stdout.write(
      `  kitchen board: ${c.bold(String(watcher.state.total))} orders visible to ${watcher.label}` +
        (growth != null ? c.dim(` (+${growth} during this run)`) : "") + "\n"
    );
  }
  if (interrupted) process.stdout.write(`  ${c.yellow("interrupted by Ctrl-C — numbers above are partial")}\n`);

  if (pass) {
    process.stdout.write(`  ${c.green("✔ PASS")} failure rate ${stats.failRate.toFixed(2)}% ≤ threshold ${cfg.failThreshold}%\n\n`);
    return EXIT_OK;
  }
  process.stdout.write(`  ${c.red("✘ FAIL")} failure rate ${c.red(stats.failRate.toFixed(2) + "%")} > threshold ${cfg.failThreshold}%\n`);
  for (const row of stats.failureRows()) {
    process.stdout.write(`    ${c.red(String(row.status || "---"))} ${c.yellow(row.code)} ×${row.count} — ${row.message}\n`);
  }
  process.stdout.write("\n");
  return EXIT_THRESHOLD;
}

main()
  .then((code) => process.exit(code ?? EXIT_OK))
  .catch((err) => {
    process.stdout.write(`\n  ${c.red("harness crashed:")} ${err?.stack || err}\n\n`);
    process.exit(EXIT_CANNOT_START);
  });
