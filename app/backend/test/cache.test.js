"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCache, cacheKey } = require("../src/cache.js");

test("fetch caches a resolved value for the TTL", async () => {
  let calls = 0;
  let clock = 1000;
  const cache = createCache({ ttlMs: 500, now: () => clock });
  const producer = async () => { calls += 1; return calls; };

  assert.equal(await cache.fetch("k", producer), 1);
  assert.equal(await cache.fetch("k", producer), 1);
  assert.equal(calls, 1);

  clock += 501;
  assert.equal(await cache.fetch("k", producer), 2);
  assert.equal(calls, 2);
});

test("concurrent fetches share one producer run", async () => {
  let calls = 0;
  const cache = createCache({ ttlMs: 500 });
  const producer = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "value";
  };

  const [a, b] = await Promise.all([cache.fetch("k", producer), cache.fetch("k", producer)]);

  assert.equal(a, "value");
  assert.equal(b, "value");
  assert.equal(calls, 1);
});

test("a rejected producer is not cached", async () => {
  let calls = 0;
  const cache = createCache({ ttlMs: 500 });
  const producer = async () => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
    return "recovered";
  };

  await assert.rejects(() => cache.fetch("k", producer));
  assert.equal(await cache.fetch("k", producer), "recovered");
  assert.equal(calls, 2);
});

test("keys are independent and invalidate drops just one", async () => {
  const cache = createCache({ ttlMs: 500 });
  await cache.fetch("a", async () => "A");
  await cache.fetch("b", async () => "B");
  cache.invalidate("a");
  assert.equal(await cache.fetch("a", async () => "A2"), "A2");
  assert.equal(await cache.fetch("b", async () => "B2"), "B");
});

test("cacheKey does not collide when a value contains the separator", () => {
  assert.notEqual(
    cacheKey("timetable", 1, "a:b", "c"),
    cacheKey("timetable", 1, "a", "b:c")
  );
});

test("cacheKey distinguishes an absent part from an empty string", () => {
  assert.notEqual(cacheKey("timetable", 1, undefined), cacheKey("timetable", 1, ""));
});

test("cacheKey is stable for identical inputs", () => {
  assert.equal(cacheKey("timetable", 1, "2026-09-14", "2026-09-20"),
               cacheKey("timetable", 1, "2026-09-14", "2026-09-20"));
});
