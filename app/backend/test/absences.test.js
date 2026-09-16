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

test("GET /api/accounts/:id/absences wraps the semester-keyed object", async () => {
  const bySemester = {
    0: [{ date: "2026-05-10", table: [], info: [] }],
    1: [{ date: "2026-02-03", table: [], info: [] }],
  };
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    absence: { getAbsences: async () => bySemester },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/absences`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { semesters: bySemester });
  } finally {
    server.close();
  }
});
