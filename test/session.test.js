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

test("_request waits for the real caller instead of dereferencing undefined", async () => {
  // Every other test injects options.caller, which makes _initializeCaller
  // assign this.caller before its first await. On the production path the
  // dynamic import() of axios-cookiejar-support makes the assignment
  // asynchronous, so _request has to wait for _callerReady itself.
  const source = new Librus(undefined, { caller: {} });
  await source.cookie.setCookie("DeviceCookie=dev-1; Path=/", "https://api.librus.pl");
  const serialized = source.exportSession();

  const client = new Librus(undefined, { session: serialized, requestTimeout: 2000 });
  // The seam this test exists for: the real caller is not there yet.
  assert.equal(client.caller, undefined);

  // A closed local port keeps this offline and instant: the request must
  // get far enough to fail with a connection error, not a TypeError on an
  // undefined caller.
  await assert.rejects(
    () => client._request("get", "https://127.0.0.1:1/przegladaj_oceny/uczen"),
    (error) => {
      assert.ok(
        !(error instanceof TypeError),
        `expected a transport error, got ${error.name}: ${error.message}`
      );
      assert.ok(
        !/Cannot read properties of undefined/.test(error.message),
        `expected a transport error, got ${error.name}: ${error.message}`
      );
      return true;
    }
  );

  // The restored jar must still be intact once the caller is built.
  const cookies = await client.cookie.getCookies("https://api.librus.pl");
  assert.ok(cookies.map((c) => c.key).includes("DeviceCookie"));
});
