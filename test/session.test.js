"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Librus = require("../lib/api.js");

test("exportSession round-trips through importSession", async () => {
  const source = new Librus(undefined, { caller: {} });
  await source.cookie.setCookie("DZIENNIKSID=abc123; Path=/", "https://synergia.librus.pl");
  const serialized = source.exportSession();
  assert.equal(typeof serialized, "string");
  assert.ok(serialized.length > 0);

  const restored = new Librus(undefined, { caller: {}, session: serialized });
  const cookies = await restored.cookie.getCookies("https://synergia.librus.pl");
  const names = cookies.map((c) => c.key);
  assert.ok(names.includes("DZIENNIKSID"));
});

test("importSession keeps cookies from other Librus domains", async () => {
  const source = new Librus(undefined, { caller: {} });
  await source.cookie.setCookie("DeviceCookie=dev-1; Path=/", "https://api.librus.pl");
  const restored = new Librus(undefined, { caller: {}, session: source.exportSession() });
  const cookies = await restored.cookie.getCookies("https://api.librus.pl");
  assert.ok(cookies.map((c) => c.key).includes("DeviceCookie"));
});

test("importSession returns false for junk instead of throwing", () => {
  const client = new Librus(undefined, { caller: {} });
  assert.equal(client.importSession("not json"), false);
  assert.equal(client.importSession(""), false);
  assert.equal(client.importSession(null), false);
});

test("a restored session builds the HTTP caller exactly once", async () => {
  const source = new Librus(undefined, { caller: {} });
  await source.cookie.setCookie("DZIENNIKSID=abc123; Path=/", "https://synergia.librus.pl");
  const serialized = source.exportSession();

  const original = Librus.prototype._initializeCaller;
  let calls = 0;
  Librus.prototype._initializeCaller = function (...args) {
    calls += 1;
    return original.apply(this, args);
  };
  try {
    new Librus(undefined, { caller: {}, session: serialized });
  } finally {
    Librus.prototype._initializeCaller = original;
  }

  assert.equal(calls, 1);
});

test("an unusable session still leaves the client with a caller", async () => {
  const client = new Librus(undefined, { caller: { marker: true }, session: "not json" });
  assert.deepEqual(client.caller, { marker: true });
  await client._callerReady;
  assert.deepEqual(client.caller, { marker: true });
});
