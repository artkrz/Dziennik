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

test("GET /api/accounts/:id/agenda flattens the per-day arrays", async () => {
  const nested = [
    [{ id: 1, day: "2026-09-10", title: "Sprawdzian" }],
    undefined,
    [{ id: 2, day: "2026-09-12", title: "Wycieczka" }],
  ];
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: { getCalendar: async () => nested },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/agenda`);
    assert.deepEqual(await res.json(), [
      { id: 1, day: "2026-09-10", title: "Sprawdzian" },
      { id: 2, day: "2026-09-12", title: "Wycieczka" },
    ]);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/agenda rejects a non-numeric month", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: { getCalendar: async () => [] },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/agenda?month=abc`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
