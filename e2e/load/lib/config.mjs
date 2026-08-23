// CLI + env configuration for the canteen load / demo harness.
// Dependency-free: plain Node, built-in fetch.

const DEFAULTS = {
  api: process.env.LOAD_API || process.env.VITE_API_URL || "http://localhost:8787",
  users: intEnv("LOAD_USERS", 25),
  ordersMin: intEnv("LOAD_ORDERS_MIN", 1),
  ordersMax: intEnv("LOAD_ORDERS_MAX", 3),
  jitterMin: intEnv("LOAD_JITTER_MIN", 50),
  jitterMax: intEnv("LOAD_JITTER_MAX", 400),
  maxQty: intEnv("LOAD_MAX_QTY", 1),
  itemsPerOrder: intEnv("LOAD_ITEMS_PER_ORDER", 2), // upper bound, >=1 chosen
  failThreshold: floatEnv("LOAD_FAIL_THRESHOLD", 5),
  timeout: intEnv("LOAD_TIMEOUT", 30000),
  concurrency: intEnv("LOAD_CONCURRENCY", 0), // max simultaneous POST /orders; 0 = unlimited
  mode: "mint", // "mint" (default, offline tokens) | "login" (real POST /auth/login)
  refreshTokens: false,
  watchAdmin: false,
  watchOnly: false,
  watchInterval: intEnv("LOAD_WATCH_INTERVAL", 2000),
  adminIdentifier: process.env.LOAD_ADMIN || "snacks_admin@klh.edu.in",
  adminPassword: process.env.LOAD_ADMIN_PASSWORD || "changeme123",
  studentPassword: process.env.LOAD_STUDENT_PASSWORD || "klh@123",
  spoofIp: true,
  kitchen: null, // SNACKS | MEALS | null (both)
  dryRun: false,
  plain: !(process.stdout.isTTY || process.env.LOAD_FORCE_TTY === "1"),
  help: false,
};

function intEnv(name, fallback) {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function floatEnv(name, fallback) {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

const HELP = `
KLH Canteen — concurrent order load / demo harness

  node e2e/load/run.mjs [options]
  npm run load -- [options]

Auth modes
  (default)              Mint JWTs offline from the DB + JWT_SECRET in
                         Canteen-Backend/.env. Never touches /auth/login,
                         so the login rate limiter cannot break the demo.
  --login                Use the real POST /auth/login endpoint instead.
  --refresh-tokens       Ignore the local token cache and re-mint.

Load shape
  --users N              Virtual students        (default 25)
  --orders-min N         Min orders per student  (default 1)
  --orders-max N         Max orders per student  (default 3)
  --items N              Max distinct items per order (default 2)
  --max-qty N            Max qty per line item   (default 1)
  --jitter-min MS        Min stagger between actions (default 50)
  --jitter-max MS        Max stagger between actions (default 400)
  --kitchen SNACKS|MEALS Only order items from one kitchen
  --concurrency N        Cap simultaneous POST /orders (default 0 = unlimited).
                         Use ~8 for a smooth demo; leave unlimited to see
                         how the backend behaves under a true thundering herd.

Admin kitchen-board watcher
  --watch-admin          Poll GET /admin/orders alongside the load run
  --watch-only           Only run the watcher (no orders placed)
  --watch-interval MS    Poll interval          (default 2000)
  --admin IDENT          Admin identifier (default snacks_admin@klh.edu.in)

Run control
  --api URL              Backend base URL       (default http://localhost:8787)
  --fail-threshold PCT   Exit non-zero above this failure rate (default 5)
  --timeout MS           Per-request timeout    (default 30000)
  --no-spoof-ip          Send real headers; the per-IP rate limiter will bite
  --dry-run              Do everything except POST /orders
  --plain                No ANSI redraw (for CI / piping to a file)
  LOAD_FORCE_TTY=1       Force the ANSI live frame even when piped
  -h, --help             This message

Exit codes
  0  failure rate <= threshold
  1  failure rate  > threshold
  2  harness could not start (no tokens, no menu, backend unreachable)
`;

export function parseArgs(argv = process.argv.slice(2)) {
  const cfg = { ...DEFAULTS };
  const next = (i) => {
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`Missing value for ${argv[i]}`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h": case "--help": cfg.help = true; break;
      case "--api": cfg.api = next(i); i++; break;
      case "--users": case "-n": cfg.users = Number.parseInt(next(i), 10); i++; break;
      case "--orders-min": cfg.ordersMin = Number.parseInt(next(i), 10); i++; break;
      case "--orders-max": cfg.ordersMax = Number.parseInt(next(i), 10); i++; break;
      case "--items": cfg.itemsPerOrder = Number.parseInt(next(i), 10); i++; break;
      case "--max-qty": cfg.maxQty = Number.parseInt(next(i), 10); i++; break;
      case "--jitter-min": cfg.jitterMin = Number.parseInt(next(i), 10); i++; break;
      case "--jitter-max": cfg.jitterMax = Number.parseInt(next(i), 10); i++; break;
      case "--fail-threshold": cfg.failThreshold = Number.parseFloat(next(i)); i++; break;
      case "--timeout": cfg.timeout = Number.parseInt(next(i), 10); i++; break;
      case "--concurrency": cfg.concurrency = Number.parseInt(next(i), 10); i++; break;
      case "--watch-interval": cfg.watchInterval = Number.parseInt(next(i), 10); i++; break;
      case "--admin": cfg.adminIdentifier = next(i); i++; break;
      case "--kitchen": cfg.kitchen = next(i).toUpperCase(); i++; break;
      case "--login": cfg.mode = "login"; break;
      case "--reuse-tokens": cfg.mode = "mint"; break;
      case "--refresh-tokens": cfg.refreshTokens = true; break;
      case "--watch-admin": cfg.watchAdmin = true; break;
      case "--watch-only": cfg.watchOnly = true; cfg.watchAdmin = true; break;
      case "--no-spoof-ip": cfg.spoofIp = false; break;
      case "--dry-run": cfg.dryRun = true; break;
      case "--plain": cfg.plain = true; break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    }
  }
  return validate(cfg);
}

function validate(cfg) {
  const problems = [];
  if (!Number.isFinite(cfg.users) || cfg.users < 1) problems.push("--users must be >= 1");
  if (cfg.ordersMin < 1) problems.push("--orders-min must be >= 1");
  if (cfg.ordersMax < cfg.ordersMin) problems.push("--orders-max must be >= --orders-min");
  if (cfg.jitterMax < cfg.jitterMin) problems.push("--jitter-max must be >= --jitter-min");
  if (cfg.itemsPerOrder < 1) problems.push("--items must be >= 1");
  if (cfg.maxQty < 1) problems.push("--max-qty must be >= 1");
  if (!Number.isFinite(cfg.concurrency) || cfg.concurrency < 0) problems.push("--concurrency must be >= 0");
  if (cfg.failThreshold < 0 || cfg.failThreshold > 100) problems.push("--fail-threshold must be 0..100");
  if (cfg.kitchen && !["SNACKS", "MEALS"].includes(cfg.kitchen)) problems.push("--kitchen must be SNACKS or MEALS");
  if (problems.length) throw new Error(`Invalid options:\n  - ${problems.join("\n  - ")}`);
  cfg.api = cfg.api.replace(/\/+$/, "");
  return cfg;
}

export { HELP };
