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

async function createAccount(base) {
  return (
    await fetch(`${base}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jas", login: "jas", password: "pw" }),
    })
  ).json();
}

test("GET /api/accounts/:id/messages returns the inbox list", async () => {
  const inboxRows = [
    { id: 7, user: "Kowalska Anna", title: "Zebranie", date: "2026-09-10", read: false },
    { id: 8, user: "Nowak Jan", title: "Wycieczka", date: "2026-09-11", read: true },
  ];
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: { listInbox: async () => inboxRows },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/messages`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), inboxRows);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/messages asks Librus for the RECEIVED folder", async () => {
  let requestedFolder;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: {
      listInbox: async (folderId) => {
        requestedFolder = folderId;
        return [{ id: 1, user: "u", title: "t", date: "d", read: true }];
      },
    },
  }));
  try {
    const account = await createAccount(base);
    await fetch(`${base}/api/accounts/${account.id}/messages`);
    assert.equal(requestedFolder, 5);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/messages returns 502 when Librus keeps failing", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: {
      listInbox: async () => {
        throw new Error("boom");
      },
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/messages`);
    assert.equal(res.status, 502);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/messages/:messageId returns the message without raw html", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: {
      getMessage: async () => ({
        title: "Zebranie",
        url: "wiadomosci/1/5/7",
        id: 7,
        folderId: 5,
        date: "2026-09-10",
        user: "Kowalska Anna",
        content: "Zapraszamy na zebranie.",
        html: "<b>Zapraszamy na zebranie.</b><script>alert(1)</script>",
        read: true,
        files: [{ name: "plan.pdf", path: "wiadomosci/pobierz_zalacznik/1/2" }],
      }),
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/messages/7`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.deepEqual(body, {
      id: 7,
      title: "Zebranie",
      user: "Kowalska Anna",
      date: "2026-09-10",
      content: "Zapraszamy na zebranie.",
    });
    assert.equal(body.html, undefined);
    assert.equal(body.files, undefined);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/messages/:messageId rejects a non-numeric id without calling Librus", async () => {
  let called = false;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: {
      getMessage: async () => {
        called = true;
        return { title: "x", user: "u", date: "d", content: "c" };
      },
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/messages/not-a-number`);
    assert.equal(res.status, 400);
    assert.equal(called, false);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/messages/:messageId returns 404 when the message is missing", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: { getMessage: async () => 0 },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/messages/7`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

// Route-ordering regression test: if "/:id/messages/sent" were registered
// after "/:id/messages/:messageId", Express would match the parameterised
// route first, Number("sent") would be NaN, and this would 400 instead of
// returning the sent list.
test("GET /api/accounts/:id/messages/sent returns the sent list and asks Librus for folder 6", async () => {
  const sentRows = [{ id: 9, user: "Rodzic", title: "Re: Zebranie", date: "2026-09-12", read: true }];
  let requestedFolder;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: {
      listInbox: async (folderId) => {
        requestedFolder = folderId;
        return sentRows;
      },
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/messages/sent`);
    assert.equal(res.status, 200);
    assert.notEqual(res.status, 400);
    assert.deepEqual(await res.json(), sentRows);
    assert.equal(requestedFolder, 6);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/threads returns grouped threads from both folders", async () => {
  const received = [{ id: 1, user: "Kowalska Anna", title: "Zebranie", date: "2026-09-10", read: true }];
  const sent = [{ id: 2, user: "Rodzic", title: "Re: Zebranie", date: "2026-09-11", read: true }];
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: {
      listInbox: async (folderId) => (folderId === 6 ? sent : received),
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/threads`);
    assert.equal(res.status, 200);
    const threads = await res.json();
    assert.equal(threads.length, 1);
    assert.equal(threads[0].messageCount, 2);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/messages/:messageId?folder=sent asks Librus for folder 6, and without it for folder 5", async () => {
  let requestedFolder;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: {
      getMessage: async (folderId) => {
        requestedFolder = folderId;
        return { title: "t", user: "u", date: "d", content: "c" };
      },
    },
  }));
  try {
    const account = await createAccount(base);

    await fetch(`${base}/api/accounts/${account.id}/messages/7?folder=sent`);
    assert.equal(requestedFolder, 6);

    await fetch(`${base}/api/accounts/${account.id}/messages/7`);
    assert.equal(requestedFolder, 5);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/threads returns 502 when Librus keeps failing", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    inbox: {
      listInbox: async () => {
        throw new Error("boom");
      },
    },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/threads`);
    assert.equal(res.status, 502);
  } finally {
    server.close();
  }
});
