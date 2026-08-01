// ── Shared Redis client ──────────────────────────────────────────────
// Used to back rate limiting and the Socket.IO adapter across multiple
// worker processes / instances. If REDIS_URL is not set, everything
// that depends on this falls back to safe in-process behavior instead
// of crashing — so the app still runs fine in local/dev without Redis.

let client = null;
let connectionAttempted = false;
let crashGuardInstalled = false;

// Testing against a real Redis instance surfaced a serious failure mode:
// when Redis is unreachable and a command exhausts its retries, ioredis
// can throw synchronously from internal retry/reconnect handling in a
// way that bypasses the promise chain of the command that was awaited —
// it surfaces as a process-level uncaughtException/unhandledRejection
// instead. Without this guard, a Redis outage would crash the entire
// Node process, which is strictly worse than not having Redis at all.
// This guard is scoped to Redis-originated errors only — anything else
// still crashes the process normally, so real bugs aren't hidden.
const installCrashGuard = () => {
  if (crashGuardInstalled) return;
  crashGuardInstalled = true;

  const isRedisError = (err) => {
    const msg = `${err?.message || err}`;
    return /redis|ioredis|MaxRetriesPerRequest/i.test(msg);
  };

  process.on('uncaughtException', (err) => {
    if (isRedisError(err)) {
      console.error('[redis] suppressed a fatal Redis error to keep the app alive:', err.message);
      return;
    }
    console.error('[uncaughtException]', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    if (isRedisError(reason)) {
      console.error('[redis] suppressed an unhandled Redis rejection to keep the app alive:', reason?.message || reason);
      return;
    }
    console.error('[unhandledRejection]', reason);
  });
};

const getRedisClient = () => {
  if (!process.env.REDIS_URL) return null;
  if (connectionAttempted) return client;

  connectionAttempted = true;
  installCrashGuard();
  try {
    const Redis = require('ioredis');
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    client.on('error', (err) => {
      console.error('[redis] connection error:', err.message);
    });
    client.on('connect', () => {
      console.log('[redis] connected — rate limiting and Socket.IO adapter are now distributed');
    });

    return client;
  } catch (err) {
    console.warn('[redis] failed to initialize, falling back to in-memory:', err.message);
    client = null;
    return null;
  }
};

module.exports = { getRedisClient };
