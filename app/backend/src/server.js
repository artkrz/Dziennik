"use strict";
const express = require("express");
const { getEncryptionKey, encryptText, decryptText } = require("./crypto.js");
const { createDb, makeAccountsStore, makeSessionsStore } = require("./db.js");
const { createSessionManager } = require("./librusSessions.js");
const { createCache } = require("./cache.js");
const { createAccountsRouter } = require("./routes/accounts.js");
const { createTimetableRouter } = require("./routes/timetable.js");
const { createMessagesRouter } = require("./routes/messages.js");
const { createGradesRouter } = require("./routes/grades.js");
const { createAbsencesRouter } = require("./routes/absences.js");
const { createAgendaRouter } = require("./routes/agenda.js");
const { createHomeworkRouter } = require("./routes/homework.js");
const { createInfoRouter } = require("./routes/info.js");

process.on("unhandledRejection", (err) => {
  // Only err.message - a raw AxiosError carries the plaintext Librus
  // password in error.config.data.
  console.error("Unhandled rejection: %s", err?.message || err);
});

function createApp({
  dbPath = process.env.DB_PATH || "/data/accounts.db",
  librusFactory = (options) => new (require("../../../lib/api.js"))(undefined, options),
  cacheTtlMs = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000,
} = {}) {
  getEncryptionKey();

  const db = createDb(dbPath);
  const accountsStore = makeAccountsStore(db);
  const sessionsStore = makeSessionsStore(db);
  const sessionManager = createSessionManager({
    accountsStore,
    decryptPassword: decryptText,
    librusFactory,
    sessionsStore,
    encryptText,
    decryptText,
  });
  const cache = createCache({ ttlMs: cacheTtlMs });

  const app = express();
  app.use(express.json());
  app.locals.accountsStore = accountsStore;
  app.locals.sessionManager = sessionManager;

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    "/api/accounts",
    createAccountsRouter({ accountsStore, encryptPassword: encryptText, sessionManager, librusFactory })
  );

  app.use("/api/accounts", createTimetableRouter({ sessionManager, cache }));

  app.use("/api/accounts", createMessagesRouter({ sessionManager, cache }));

  app.use("/api/accounts", createGradesRouter({ sessionManager, cache }));

  app.use("/api/accounts", createAbsencesRouter({ sessionManager, cache }));

  app.use("/api/accounts", createAgendaRouter({ sessionManager, cache }));

  app.use("/api/accounts", createHomeworkRouter({ sessionManager, cache }));

  app.use("/api/accounts", createInfoRouter({ sessionManager, cache }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error("Unhandled error in request handler:", err.message);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log(`Backend listening on port ${port}`));
}

module.exports = { createApp };
