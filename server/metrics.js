/*
 * Zero-dependency Prometheus-style metrics (RED: Rate, Errors, Duration).
 *
 * Hand-rolled to avoid a `prom-client` dependency (AGENTS.md #5, and the same
 * ethos as ratelimit.js/logger.js). Exposes the minimum that makes an
 * on-call useful: request rate by method+status, request-duration histogram,
 * and process uptime/memory. Scrape at GET /metrics.
 *
 * Nothing sensitive is exported — only aggregate counts and timings.
 */

const requestsTotal = new Map(); // `${method}|${status}` -> count
const DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const bucketCounts = new Array(DURATION_BUCKETS_MS.length).fill(0); // cumulative per bucket
let durationSum = 0;
let durationCount = 0;

/** Record one completed HTTP request. */
export function recordHttp(method, status, ms) {
  const key = `${method}|${status}`;
  requestsTotal.set(key, (requestsTotal.get(key) || 0) + 1);
  durationCount += 1;
  durationSum += ms;
  for (let i = 0; i < DURATION_BUCKETS_MS.length; i++) {
    if (ms <= DURATION_BUCKETS_MS[i]) bucketCounts[i] += 1;
  }
}

/** Test/reset hook. */
export function resetMetrics() {
  requestsTotal.clear();
  bucketCounts.fill(0);
  durationSum = 0;
  durationCount = 0;
}

/** Render the current metrics as Prometheus text exposition format. */
export function renderMetrics() {
  const lines = [];

  lines.push("# HELP http_requests_total Total HTTP requests by method and status.");
  lines.push("# TYPE http_requests_total counter");
  for (const [key, n] of requestsTotal) {
    const [method, status] = key.split("|");
    lines.push(`http_requests_total{method="${method}",status="${status}"} ${n}`);
  }

  lines.push("# HELP http_request_duration_ms HTTP request duration in milliseconds.");
  lines.push("# TYPE http_request_duration_ms histogram");
  for (let i = 0; i < DURATION_BUCKETS_MS.length; i++) {
    lines.push(`http_request_duration_ms_bucket{le="${DURATION_BUCKETS_MS[i]}"} ${bucketCounts[i]}`);
  }
  lines.push(`http_request_duration_ms_bucket{le="+Inf"} ${durationCount}`);
  lines.push(`http_request_duration_ms_sum ${durationSum}`);
  lines.push(`http_request_duration_ms_count ${durationCount}`);

  const mem = process.memoryUsage();
  lines.push("# HELP process_uptime_seconds Process uptime in seconds.");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${Math.round(process.uptime())}`);
  lines.push("# HELP process_resident_memory_bytes Resident memory size in bytes.");
  lines.push("# TYPE process_resident_memory_bytes gauge");
  lines.push(`process_resident_memory_bytes ${mem.rss}`);

  return lines.join("\n") + "\n";
}
