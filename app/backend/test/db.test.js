"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb, makeAccountsStore } = require("../src/db.js");

function freshStore() {
  const db = createDb(":memory:");
  return makeAccountsStore(db);
}

test("insert then list returns account without password", () => {
  const store = freshStore();
  const id = store.insert("Jas", "jas123", Buffer.from("cipher"));
  assert.equal(typeof id, "number");

  const rows = store.list();
  assert.deepEqual(rows, [{ id, label: "Jas", login: "jas123" }]);
});

test("get returns full row including encrypted password", () => {
  const store = freshStore();
  const id = store.insert("Kasia", "kasia456", Buffer.from("cipher-2"));

  const row = store.get(id);
  assert.equal(row.label, "Kasia");
  assert.equal(row.login, "kasia456");
  assert.ok(Buffer.from(row.password_encrypted).equals(Buffer.from("cipher-2")));
});

test("get returns undefined for unknown id", () => {
  const store = freshStore();
  assert.equal(store.get(999), undefined);
});

test("remove deletes the account", () => {
  const store = freshStore();
  const id = store.insert("Ola", "ola789", Buffer.from("cipher-3"));
  store.remove(id);
  assert.equal(store.get(id), undefined);
  assert.deepEqual(store.list(), []);
});

test("a label-only update leaves the stored password untouched", () => {
  const store = freshStore();
  const id = store.insert("Jas", "jas", Buffer.from("cipher"));

  store.update(id, "Jaś nowy", null);

  const row = store.get(id);
  assert.equal(row.label, "Jaś nowy");
  assert.ok(Buffer.from(row.password_encrypted).equals(Buffer.from("cipher")));
});

test("an update with a new password replaces it", () => {
  const store = freshStore();
  const id = store.insert("Jas", "jas", Buffer.from("cipher"));

  store.update(id, "Jas", Buffer.from("new-cipher"));

  assert.ok(Buffer.from(store.get(id).password_encrypted).equals(Buffer.from("new-cipher")));
});
