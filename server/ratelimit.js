/*
 * Zero-dependency in-memory sliding-window rate limiter.
 *
 * Each key (client IP) gets an array of request timestamps. A request is
 * allowed while the number of timestamps inside the current window is below
 * `max`; otherwise the request is rejected with 429.
 *
 * Memory is bounded three ways:
 *  1. per-request prune: timestamps older than the window are dropped as the
 *     key is touched, and empty keys are deleted;
 *  2. periodic sweep: the whole map is walked at most once per window to
 *     evict stale keys for clients that went quiet;
 *  3. hard key cap: if more than `maxKeys` distinct keys appear, the oldest
 *     (least recently inserted) keys are evicted so a flood of unique IPs
 *     can't grow the map without bound.
 */

const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX = 20; // requests per window per key
const DEFAULT_MAX_KEYS = 5000; // distinct keys kept in memory
const DEFAULT_MESSAGE = "Too many attempts. Try again later.";

export function createRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  maxKeys = DEFAULT_MAX_KEYS,
  message = DEFAULT_MESSAGE,
} = {}) {
  // Map<key, number[]> — timestamps are appended in ascending order, so the
  // oldest entry is always at index 0.
  const hits = new Map();
  let lastSweep = Date.now();

  function prune(arr, now) {
    let i = 0;
    while (i < arr.length && now - arr[i] >= windowMs) i++;
    if (i > 0) arr.splice(0, i);
    return arr.length;
  }

  function sweep(now) {
    lastSweep = now;
    for (const [key, arr] of hits) {
      if (prune(arr, now) === 0) hits.delete(key);
    }
  }

  function evictOldest(count) {
    // Map iterates in insertion order -> front keys are the oldest.
    for (const key of hits.keys()) {
      if (count-- <= 0) break;
      hits.delete(key);
    }
  }

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    if (now - lastSweep >= windowMs) sweep(now);

    const key = req.ip || req.socket?.remoteAddress || "unknown";
    let arr = hits.get(key);
    if (!arr) {
      if (hits.size >= maxKeys) evictOldest(Math.ceil(maxKeys / 10) || 1);
      arr = [];
      hits.set(key, arr);
    }

    prune(arr, now);

    if (arr.length >= max) {
      const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(retryAfter, 1)));
      return res.status(429).json({ error: message });
    }

    arr.push(now);
    next();
  };
}

/**
 * Shared limiter for the credential-bearing auth endpoints (login + signup):
 * 20 requests per 10 minutes per client IP.
 */
export const authLimiter = createRateLimiter();

/**
 * Public share-link fetches (GET /api/share/:token): deliberately lenient and
 * kept in a SEPARATE bucket from the auth limiter, so a shared link going
 * mildly viral can't lock the owner out of logging in — 120 requests per
 * 10 minutes per client IP.
 */
export const shareLimiter = createRateLimiter({ max: 120, message: "Too many requests. Try again later." });
