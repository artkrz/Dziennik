"use strict";

/**
 * Small TTL cache with in-flight deduplication.
 *
 * Every entry here is one live Librus request saved. The project's own
 * README warns against systematic scraping, so treat a cache miss as
 * something to avoid rather than as the normal path.
 *
 * In memory on purpose: a cold cache after a restart costs one request per
 * card, which is cheaper than persisting student data we would then have to
 * reason about.
 *
 * @param ttlMs  How long a resolved value stays fresh (default 5 minutes)
 * @param now    Clock, injectable for tests
 */
function createCache({ ttlMs = 5 * 60 * 1000, now = Date.now } = {}) {
  const entries = new Map();

  function fetch(key, producer) {
    const hit = entries.get(key);
    if (hit && (hit.pending || hit.expiresAt > now())) return hit.value;

    const value = Promise.resolve().then(producer);
    const entry = { value, pending: true, expiresAt: 0 };
    entries.set(key, entry);

    value.then(
      () => {
        entry.pending = false;
        entry.expiresAt = now() + ttlMs;
      },
      () => {
        // Never cache a failure - the next caller should try Librus again.
        if (entries.get(key) === entry) entries.delete(key);
      }
    );

    return value;
  }

  function invalidate(key) {
    entries.delete(key);
  }

  function clear() {
    entries.clear();
  }

  return { fetch, invalidate, clear };
}

module.exports = { createCache };
