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

test("GET /api/accounts/:id/agenda/:eventId returns the event from getEvent", async () => {
  const eventDetail = {
    lesson: "Matematyka",
    date: "2026-09-10",
    lessonNumber: "3",
    teacher: "Kowalski Jan",
    type: "Sprawdzian",
    subject: "Matematyka",
    room: "12",
    description: "Sprawdzian z ułamków",
    added: "2026-09-01",
    timespan: "09:40 - 10:25",
  };
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: { getEvent: async () => eventDetail },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/agenda/42`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), eventDetail);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/agenda/:eventId calls getEvent with the numeric event id", async () => {
  let requestedId;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: {
      getEvent: async (id) => {
        requestedId = id;
        return { lesson: "X" };
      },
    },
  }));
  try {
    const account = await createAccount(base);
    await fetch(`${base}/api/accounts/${account.id}/agenda/42`);
    assert.equal(requestedId, 42);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/agenda/:eventId rejects a non-numeric eventId without calling Librus", async () => {
  let called = false;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: {
      getEvent: async () => {
        called = true;
        return { lesson: "X" };
      },
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/agenda/abc`);
    assert.equal(res.status, 400);
    assert.equal(called, false);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/agenda/:eventId rejects a zero or negative eventId", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: { getEvent: async () => ({ lesson: "X" }) },
  }));
  try {
    const account = await createAccount(base);
    const zeroRes = await fetch(`${base}/api/accounts/${account.id}/agenda/0`);
    assert.equal(zeroRes.status, 400);
    const negativeRes = await fetch(`${base}/api/accounts/${account.id}/agenda/-5`);
    assert.equal(negativeRes.status, 400);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/agenda/:eventId returns 404 for an all-empty event object", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: { getEvent: async () => ({}) },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/agenda/42`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/agenda/:eventId returns 502 when Librus keeps failing", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: {
      getEvent: async () => {
        throw new Error("boom");
      },
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/agenda/42`);
    assert.equal(res.status, 502);
  } finally {
    server.close();
  }
});
