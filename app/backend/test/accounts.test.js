"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createApp } = require("../src/server.js");

function startApp(librusFactory) {
  process.env.ACCOUNTS_ENC_KEY = crypto.randomBytes(32).toString("base64");
  const app = createApp({ dbPath: ":memory:", librusFactory });
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test("POST /api/accounts rejects invalid Librus credentials without saving", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => { throw new Error("bad login"); },
  }));
  try {
    const res = await fetch(`${base}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jas", login: "jas", password: "wrong" }),
    });
    assert.equal(res.status, 401);

    const list = await (await fetch(`${base}/api/accounts`)).json();
    assert.deepEqual(list, []);
  } finally {
    server.close();
  }
});

test("POST then GET /api/accounts returns the account without the password", async () => {
  const { server, base } = startApp(() => ({ authorize: async () => {} }));
  try {
    const created = await (
      await fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Jas", login: "jas123", password: "correct" }),
      })
    ).json();
    assert.equal(created.label, "Jas");
    assert.equal(created.login, "jas123");
    assert.equal(created.password, undefined);

    const list = await (await fetch(`${base}/api/accounts`)).json();
    assert.deepEqual(list, [{ id: created.id, label: "Jas", login: "jas123" }]);
  } finally {
    server.close();
  }
});

test("POST /api/accounts requires label, login and password", async () => {
  const { server, base } = startApp(() => ({ authorize: async () => {} }));
  try {
    const res = await fetch(`${base}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jas" }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("DELETE /api/accounts/:id removes the account", async () => {
  const { server, base } = startApp(() => ({ authorize: async () => {} }));
  try {
    const created = await (
      await fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Ola", login: "ola", password: "pw" }),
      })
    ).json();

    const del = await fetch(`${base}/api/accounts/${created.id}`, { method: "DELETE" });
    assert.equal(del.status, 204);

    const list = await (await fetch(`${base}/api/accounts`)).json();
    assert.deepEqual(list, []);
  } finally {
    server.close();
  }
});

test("DELETE /api/accounts/:id invalidates that account's cached data", async () => {
  let gradesCalls = 0;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    info: {
      getGrades: async () => {
        gradesCalls += 1;
        return [{ subject: "Matematyka", grades: [] }];
      },
    },
  }));
  try {
    const create = async (label, login) =>
      (
        await fetch(`${base}/api/accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, login, password: "pw" }),
        })
      ).json();

    const jas = await create("Jas", "jas");
    const ola = await create("Ola", "ola");

    // Warm both caches.
    assert.equal((await fetch(`${base}/api/accounts/${jas.id}/grades`)).status, 200);
    assert.equal((await fetch(`${base}/api/accounts/${ola.id}/grades`)).status, 200);
    assert.equal(gradesCalls, 2);

    // A second read is served from the cache.
    assert.equal((await fetch(`${base}/api/accounts/${jas.id}/grades`)).status, 200);
    assert.equal(gradesCalls, 2);

    assert.equal((await fetch(`${base}/api/accounts/${jas.id}`, { method: "DELETE" })).status, 204);

    // The deleted account's grades are no longer served from the cache: the
    // request goes back to Librus, which now fails because the account is
    // gone. Before the fix this returned 200 with the cached grades.
    const afterDelete = await fetch(`${base}/api/accounts/${jas.id}/grades`);
    assert.equal(afterDelete.status, 502);

    // The other account's cache is untouched.
    assert.equal((await fetch(`${base}/api/accounts/${ola.id}/grades`)).status, 200);
    assert.equal(gradesCalls, 2);
  } finally {
    server.close();
  }
});

test("PATCH /api/accounts/:id with a new label renames the account", async () => {
  const { server, base } = startApp(() => ({ authorize: async () => {} }));
  try {
    const created = await (
      await fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Jas", login: "jas", password: "pw" }),
      })
    ).json();

    const patched = await fetch(`${base}/api/accounts/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jasiu" }),
    });
    assert.equal(patched.status, 200);

    const list = await (await fetch(`${base}/api/accounts`)).json();
    assert.deepEqual(list, [{ id: created.id, label: "Jasiu", login: "jas" }]);
  } finally {
    server.close();
  }
});

test("PATCH /api/accounts/:id with no label returns 400", async () => {
  const { server, base } = startApp(() => ({ authorize: async () => {} }));
  try {
    const created = await (
      await fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Jas", login: "jas", password: "pw" }),
      })
    ).json();

    const res = await fetch(`${base}/api/accounts/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("PATCH /api/accounts/:id for an unknown id returns 404", async () => {
  const { server, base } = startApp(() => ({ authorize: async () => {} }));
  try {
    const res = await fetch(`${base}/api/accounts/999999`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Ktoś" }),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("PATCH /api/accounts/:id with a password calls authorize with the existing login and new password", async () => {
  const authorizeCalls = [];
  const { server, base } = startApp(() => ({
    authorize: async (login, password) => {
      authorizeCalls.push({ login, password });
    },
  }));
  try {
    const created = await (
      await fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Jas", login: "jas", password: "oldpw" }),
      })
    ).json();
    assert.equal(authorizeCalls.length, 1);

    const res = await fetch(`${base}/api/accounts/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jas", password: "newpw" }),
    });
    assert.equal(res.status, 200);

    assert.equal(authorizeCalls.length, 2);
    assert.deepEqual(authorizeCalls[1], { login: "jas", password: "newpw" });
  } finally {
    server.close();
  }
});

test("PATCH /api/accounts/:id with a password Librus rejects returns 401 and leaves the label unchanged", async () => {
  const { server, base } = startApp(() => ({
    authorize: async (login, password) => {
      if (password === "wrong") throw new Error("bad login");
    },
  }));
  try {
    const created = await (
      await fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Jas", login: "jas", password: "correct" }),
      })
    ).json();

    const res = await fetch(`${base}/api/accounts/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Nowa etykieta", password: "wrong" }),
    });
    assert.equal(res.status, 401);

    const list = await (await fetch(`${base}/api/accounts`)).json();
    assert.deepEqual(list, [{ id: created.id, label: "Jas", login: "jas" }]);
  } finally {
    server.close();
  }
});

test("PATCH /api/accounts/:id without a password does not call authorize", async () => {
  let authorizeCalls = 0;
  const { server, base } = startApp(() => ({
    authorize: async () => {
      authorizeCalls += 1;
    },
  }));
  try {
    const created = await (
      await fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Jas", login: "jas", password: "pw" }),
      })
    ).json();
    assert.equal(authorizeCalls, 1);

    const res = await fetch(`${base}/api/accounts/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jasiu" }),
    });
    assert.equal(res.status, 200);
    assert.equal(authorizeCalls, 1);
  } finally {
    server.close();
  }
});

test("PATCH /api/accounts/:id invalidates that account's cached data", async () => {
  let gradesCalls = 0;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    info: {
      getGrades: async () => {
        gradesCalls += 1;
        return [{ subject: "Matematyka", grades: [] }];
      },
    },
  }));
  try {
    const created = await (
      await fetch(`${base}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Jas", login: "jas", password: "pw" }),
      })
    ).json();

    // Warm the cache.
    assert.equal((await fetch(`${base}/api/accounts/${created.id}/grades`)).status, 200);
    assert.equal(gradesCalls, 1);

    // A second read is served from the cache.
    assert.equal((await fetch(`${base}/api/accounts/${created.id}/grades`)).status, 200);
    assert.equal(gradesCalls, 1);

    const patched = await fetch(`${base}/api/accounts/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jasiu" }),
    });
    assert.equal(patched.status, 200);

    // The PATCH invalidated the cache, so the next read goes back to Librus.
    assert.equal((await fetch(`${base}/api/accounts/${created.id}/grades`)).status, 200);
    assert.equal(gradesCalls, 2);
  } finally {
    server.close();
  }
});
