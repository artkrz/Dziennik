"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb, makeSessionsStore } = require("../src/db.js");

function freshStore() {
  return makeSessionsStore(createDb(":memory:"));
}

test("save then load round-trips the blob", () => {
  const store = freshStore();
  store.save(1, Buffer.from("cipher"));
  assert.ok(Buffer.from(store.load(1)).equals(Buffer.from("cipher")));
});

test("save twice keeps only the newest blob", () => {
  const store = freshStore();
  store.save(1, Buffer.from("old"));
  store.save(1, Buffer.from("new"));
  assert.ok(Buffer.from(store.load(1)).equals(Buffer.from("new")));
});

test("load returns undefined for an unknown account", () => {
  assert.equal(freshStore().load(99), undefined);
});

test("remove deletes the row", () => {
  const store = freshStore();
  store.save(1, Buffer.from("cipher"));
  store.remove(1);
  assert.equal(store.load(1), undefined);
});
