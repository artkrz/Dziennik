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

test("GET /api/accounts/:id/grades returns the subject list", async () => {
  const grades = [
    { name: "Matematyka", semester: [], tempAverage: 4.2, average: 4.0 },
    { name: "Polski", semester: [], tempAverage: 3.5, average: 3.6 },
  ];
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    info: { getGrades: async () => grades },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/grades`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), grades);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/grades reports a Librus failure as 502", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    info: { getGrades: async () => { throw new Error("librus down"); } },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/grades`);
    assert.equal(res.status, 502);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/grades hits Librus once for two requests", async () => {
  let calls = 0;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    info: { getGrades: async () => { calls += 1; return []; } },
  }));
  try {
    const account = await createAccount(base);
    await fetch(`${base}/api/accounts/${account.id}/grades`);
    await fetch(`${base}/api/accounts/${account.id}/grades`);
    assert.equal(calls, 1);
  } finally {
    server.close();
  }
});
