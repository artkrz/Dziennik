"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSessionManager } = require("../src/librusSessions.js");

function stubAccountsStore(row) {
  return { get: () => row };
}

test("withSession logs in once and reuses the cached client", async () => {
  let authorizeCalls = 0;
  const client = { authorize: async () => { authorizeCalls += 1; } };
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: () => client,
  });

  const first = await manager.withSession(1, async (c) => { assert.equal(c, client); return "first"; });
  const second = await manager.withSession(1, async (c) => { assert.equal(c, client); return "second"; });

  assert.equal(first, "first");
  assert.equal(second, "second");
  assert.equal(authorizeCalls, 1);
});

test("withSession re-logs in and retries once when fn throws on a cached client", async () => {
  let authorizeCalls = 0;
  const client = { authorize: async () => { authorizeCalls += 1; } };
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: () => client,
  });

  await manager.withSession(1, async () => "warm-up");

  let callCount = 0;
  const result = await manager.withSession(1, async () => {
    callCount += 1;
    if (callCount === 1) throw new Error("network blip");
    return "recovered";
  });

  assert.equal(result, "recovered");
  assert.equal(callCount, 2);
  assert.equal(authorizeCalls, 2);
});

test("withSession shares one in-flight login across concurrent calls for the same account", async () => {
  let authorizeCalls = 0;
  const client = {
    authorize: async () => {
      authorizeCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: () => client,
  });

  const [first, second] = await Promise.all([
    manager.withSession(1, async (c) => { assert.equal(c, client); return "first"; }),
    manager.withSession(1, async (c) => { assert.equal(c, client); return "second"; }),
  ]);

  assert.equal(first, "first");
  assert.equal(second, "second");
  assert.equal(authorizeCalls, 1);
});

test("forget drops the cached client so the next call re-logs in", async () => {
  let authorizeCalls = 0;
  const client = { authorize: async () => { authorizeCalls += 1; } };
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: () => client,
  });

  await manager.withSession(1, async () => "a");
  manager.forget(1);
  await manager.withSession(1, async () => "b");

  assert.equal(authorizeCalls, 2);
});

test("withSession restores a stored session instead of logging in", async () => {
  let authorizeCalls = 0;
  let seenSession;
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: ({ session } = {}) => {
      seenSession = session;
      return { authorize: async () => { authorizeCalls += 1; } };
    },
    sessionsStore: { save() {}, load: () => Buffer.from("blob"), remove() {} },
    encryptText: (text) => Buffer.from(text),
    decryptText: () => "serialized-jar",
  });

  const result = await manager.withSession(1, async () => "ok");

  assert.equal(result, "ok");
  assert.equal(authorizeCalls, 0);
  assert.equal(seenSession, "serialized-jar");
});

test("withSession persists the jar after a real login", async () => {
  const saved = [];
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: () => ({
      authorize: async () => {},
      exportSession: () => "fresh-jar",
    }),
    sessionsStore: { save: (id, blob) => saved.push([id, blob.toString()]), load: () => undefined, remove() {} },
    encryptText: (text) => Buffer.from(text),
    decryptText: () => "",
  });

  await manager.withSession(1, async () => "ok");

  assert.deepEqual(saved, [[1, "fresh-jar"]]);
});

test("withSession falls back to a fresh login when the stored jar is unusable", async () => {
  let authorizeCalls = 0;
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: () => ({ authorize: async () => { authorizeCalls += 1; } }),
    sessionsStore: { save() {}, load: () => Buffer.from("blob"), remove() {} },
    encryptText: (text) => Buffer.from(text),
    decryptText: () => { throw new Error("bad key"); },
  });

  await manager.withSession(1, async () => "ok");

  assert.equal(authorizeCalls, 1);
});
