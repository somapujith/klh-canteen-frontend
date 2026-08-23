// Latency percentiles + failure grouping for the run summary.

export class Stats {
  constructor() {
    this.latencies = [];
    this.attempted = 0;
    this.succeeded = 0;
    this.failed = 0;
    this.inFlight = 0;
    /** @type {Map<string, {status:number, code:string, message:string, count:number}>} */
    this.failures = new Map();
    this.ordersCreated = 0;
    this.startedAt = performance.now();
    this.finishedAt = null;
  }

  begin() {
    this.attempted++;
    this.inFlight++;
  }

  record(result, ordersCreated = 0) {
    this.inFlight--;
    this.latencies.push(result.ms);
    if (result.ok) {
      this.succeeded++;
      this.ordersCreated += ordersCreated;
      return;
    }
    this.failed++;
    const key = `${result.status}|${result.code}`;
    const existing = this.failures.get(key);
    if (existing) existing.count++;
    else this.failures.set(key, { status: result.status, code: result.code, message: result.message, count: 1 });
  }

  finish() {
    this.finishedAt = performance.now();
  }

  get elapsedMs() {
    return (this.finishedAt ?? performance.now()) - this.startedAt;
  }

  get failRate() {
    const done = this.succeeded + this.failed;
    return done === 0 ? 0 : (this.failed / done) * 100;
  }

  get throughput() {
    const seconds = this.elapsedMs / 1000;
    return seconds > 0 ? (this.succeeded + this.failed) / seconds : 0;
  }

  percentiles() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted.length ? sorted[sorted.length - 1] : 0,
      min: sorted.length ? sorted[0] : 0,
    };
  }

  failureRows() {
    return [...this.failures.values()].sort((a, b) => b.count - a.count);
  }
}

/** Nearest-rank percentile over an ascending array. */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}
