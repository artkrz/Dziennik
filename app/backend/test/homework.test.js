"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createApp } = require("../src/server.js");

function startApp(librusFactory) {
  process.env.ACCOUNTS_ENC_KEY = crypto.randomBytes(32).toString("base64");
  const app = createApp({ dbPath: ":memory:", librusFactory });
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function createAccount(base) {
  return (
    await fetch(`${base}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jas", login: "jas", password: "pw" }),
    })
  ).json();
}

test("GET /api/accounts/:id/homework returns the assignment list", async () => {
  const homework = [
    { id: 1, subject: "Matematyka", user: "Jan Kowalski", title: "Zad. 1-5", type: "Praca domowa", from: "2026-09-01", to: "2026-09-08", status: "" },
  ];
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    homework: { listHomework: async () => homework },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/homework`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), homework);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/homework?subject= (empty) filters to -1, not 0", async () => {
  let receivedSubject;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    homework: {
      listHomework: async (subject) => {
        receivedSubject = subject;
        return [];
      },
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/homework?subject=`);
    assert.equal(res.status, 200);
    assert.equal(receivedSubject, -1);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/homework?from= without to is rejected", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    homework: { listHomework: async () => [] },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/homework?from=2026-09-01`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/homework with no query sends empty date strings, not undefined", async () => {
  let receivedFrom;
  let receivedTo;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    homework: {
      listHomework: async (subject, from, to) => {
        receivedFrom = from;
        receivedTo = to;
        return [];
      },
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/homework`);
    assert.equal(res.status, 200);
    assert.equal(receivedFrom, "");
    assert.equal(receivedTo, "");
    assert.notEqual(receivedFrom, undefined);
    assert.notEqual(receivedTo, undefined);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/homework reports a Librus failure as 502", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    homework: { listHomework: async () => { throw new Error("librus down"); } },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/homework`);
    assert.equal(res.status, 502);
  } finally {
    server.close();
  }
});
