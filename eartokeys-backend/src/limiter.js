'use strict';
/** Fixed-window in-memory rate limiter. (Single process; use Redis if you run several servers.) */
function createLimiter(enabled) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, 60000);
  timer.unref();
  return {
    /** returns 0 if allowed, otherwise seconds until retry */
    check(key, max, windowMs) {
      if (!enabled) return 0;
      const now = Date.now();
      let e = hits.get(key);
      if (!e || e.reset <= now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
      e.count++;
      return e.count > max ? Math.ceil((e.reset - now) / 1000) : 0;
    },
    clear() { hits.clear(); },
    stop() { clearInterval(timer); },
  };
}
module.exports = { createLimiter };
