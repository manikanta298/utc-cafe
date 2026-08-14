// ── Distributed rate-limit store ─────────────────────────────────────
// Audit fix: express-rate-limit defaults to an in-memory store, which
// resets per-process and per-deploy and can be bypassed by hitting a
// different worker/instance. When REDIS_URL is set, limits are shared
// across all workers/instances via Redis. Without it, we fall back to
// the default in-memory store (returning `undefined` tells
// express-rate-limit to use its built-in MemoryStore) so local/dev
// setups keep working without Redis.
//
// IMPORTANT: if Redis becomes unreachable mid-run, rate-limit-redis can
// reject with an uncaught error that crashes the whole process (verified
// against a real local Redis instance during testing). A rate limiter
// should never be a single point of failure for the whole app, so this
// wraps the store to fail OPEN (allow the request through, log a
// warning) rather than let a Redis hiccup take the server down.

const { getRedisClient } = require('./redisClient');

const createRateLimitStore = (prefix) => {
  const redis = getRedisClient();
  if (!redis) return undefined;

  let RedisStore;
  try {
    ({ RedisStore } = require('rate-limit-redis'));
  } catch (err) {
    console.warn('[rateLimitStore] rate-limit-redis unavailable, falling back to in-memory:', err.message);
    return undefined;
  }

  const store = new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args) => redis.call(...args),
  });

  const failOpen = (windowMs) => ({
    totalHits: 0,
    resetTime: new Date(Date.now() + (windowMs || 60000)),
  });

  return {
    // express-rate-limit calls init() once with the resolved options
    init(options) {
      this._windowMs = options?.windowMs;
      store.init(options);
    },
    async increment(key) {
      try {
        return await store.increment(key);
      } catch (err) {
        console.warn(`[rateLimitStore:${prefix}] Redis increment failed, failing open:`, err.message);
        return failOpen(this._windowMs);
      }
    },
    async decrement(key) {
      try {
        await store.decrement(key);
      } catch (err) {
        console.warn(`[rateLimitStore:${prefix}] Redis decrement failed (ignored):`, err.message);
      }
    },
    async resetKey(key) {
      try {
        await store.resetKey(key);
      } catch (err) {
        console.warn(`[rateLimitStore:${prefix}] Redis resetKey failed (ignored):`, err.message);
      }
    },
  };
};

module.exports = { createRateLimitStore };
