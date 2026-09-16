"use strict";
const express = require("express");
const { cacheKey } = require("../cache.js");

function createInfoRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/lucky-number", async (req, res) => {
    const accountId = Number(req.params.id);

    try {
      const luckyNumber = await cache.fetch(cacheKey("lucky", accountId), () =>
        sessionManager.withSession(accountId, (client) => client.info.getLuckyNumber())
      );
      res.json({ luckyNumber });
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus lucky number fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch the lucky number from Librus" });
    }
  });

  router.get("/:id/announcements", async (req, res) => {
    const accountId = Number(req.params.id);

    try {
      const announcements = await cache.fetch(cacheKey("announcements", accountId), () =>
        sessionManager.withSession(accountId, (client) => client.inbox.listAnnouncements())
      );
      res.json(announcements);
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus announcements fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch announcements from Librus" });
    }
  });

  return router;
}

module.exports = { createInfoRouter };
