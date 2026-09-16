"use strict";
const express = require("express");
const { cacheKey } = require("../cache.js");

function createHomeworkRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/homework", async (req, res) => {
    const accountId = Number(req.params.id);
    const { from, to } = req.query;
    const subject = req.query.subject === undefined ? -1 : Number(req.query.subject);

    if (!Number.isInteger(subject)) {
      return res.status(400).json({ error: "subject must be an integer" });
    }

    try {
      const homework = await cache.fetch(
        cacheKey("homework", accountId, subject, from, to),
        () =>
          sessionManager.withSession(accountId, (client) =>
            client.homework.listHomework(subject, from, to)
          )
      );
      res.json(homework);
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus homework fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch homework from Librus" });
    }
  });

  return router;
}

module.exports = { createHomeworkRouter };
