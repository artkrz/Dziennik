"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSubject, groupIntoThreads } = require("../src/threads.js");

test("normalizeSubject strips a single Re: prefix", () => {
  assert.equal(normalizeSubject("Re: Zebranie"), "zebranie");
});

test("normalizeSubject strips a single Odp: prefix", () => {
  assert.equal(normalizeSubject("Odp: Zebranie"), "zebranie");
});

test("normalizeSubject strips the real stacked case to the same key as the bare subject", () => {
  assert.equal(
    normalizeSubject("Re: Odp: Rozliczenie Akcji Lato 2026"),
    normalizeSubject("Rozliczenie Akcji Lato 2026")
  );
  assert.equal(normalizeSubject("Re: Odp: Rozliczenie Akcji Lato 2026"), "rozliczenie akcji lato 2026");
});

test("normalizeSubject is case-insensitive and trims", () => {
  assert.equal(normalizeSubject("  RE: Zebranie  "), "zebranie");
  assert.equal(normalizeSubject("re: ZEBRANIE"), "zebranie");
});

test("normalizeSubject leaves a subject with no prefix untouched apart from case/trim", () => {
  assert.equal(normalizeSubject("  Wycieczka Szkolna  "), "wycieczka szkolna");
});

test("normalizeSubject does not strip re: when it merely appears mid-string", () => {
  assert.equal(normalizeSubject("Zebranie: re: sala"), "zebranie: re: sala");
});

test("groupIntoThreads puts a received message and its sent reply in one thread", () => {
  const received = [{ id: 1, user: "Kowalska Anna", title: "Zebranie", date: "2026-09-10", read: true }];
  const sent = [{ id: 2, user: "Rodzic", title: "Re: Zebranie", date: "2026-09-11", read: true }];
  const threads = groupIntoThreads(received, sent);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].messageCount, 2);
});

test("messages are ordered oldest-first inside a thread, threads newest-activity-first", () => {
  const received = [
    { id: 1, user: "A", title: "Temat A", date: "2026-09-01", read: true },
    { id: 3, user: "A", title: "Temat B", date: "2026-09-05", read: true },
  ];
  const sent = [{ id: 2, user: "Rodzic", title: "Re: Temat A", date: "2026-09-03", read: true }];
  const threads = groupIntoThreads(received, sent);

  // "Temat B" (2026-09-05) is more recent activity than "Temat A" thread (2026-09-03)
  assert.equal(threads[0].subject, "Temat B");
  assert.equal(threads[1].subject, "Re: Temat A");

  const tematAThread = threads[1];
  assert.deepEqual(
    tematAThread.messages.map((m) => m.id),
    [1, 2]
  );
});

test("unread is true only when an incoming message is unread", () => {
  const received = [{ id: 1, user: "A", title: "Temat", date: "2026-09-01", read: true }];
  const sentUnread = [{ id: 2, user: "Rodzic", title: "Re: Temat", date: "2026-09-02", read: false }];
  const threads = groupIntoThreads(received, sentUnread);
  assert.equal(threads[0].unread, false);

  const receivedUnread = [{ id: 3, user: "A", title: "Temat2", date: "2026-09-01", read: false }];
  const threads2 = groupIntoThreads(receivedUnread, []);
  assert.equal(threads2[0].unread, true);
});

test("participants de-duplicates", () => {
  const received = [
    { id: 1, user: "Kowalska Anna", title: "Temat", date: "2026-09-01", read: true },
    { id: 2, user: "Kowalska Anna", title: "Re: Temat", date: "2026-09-02", read: true },
  ];
  const threads = groupIntoThreads(received, []);
  assert.deepEqual(threads[0].participants, ["Kowalska Anna"]);
});

test("empty inputs produce an empty array", () => {
  assert.deepEqual(groupIntoThreads([], []), []);
  assert.deepEqual(groupIntoThreads(), []);
});
