"use strict";
const express = require("express");
const { cacheKey } = require("../cache.js");

function createHomeworkRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/homework", async (req, res) => {
    const accountId = Number(req.params.id);
    const { from, to } = req.query;
    const rawSubject = req.query.subject;
    const subject = rawSubject === undefined || rawSubject === "" ? -1 : Number(rawSubject);

    if (!Number.isInteger(subject)) {
      return res.status(400).json({ error: "subject must be an integer" });
    }
    if ((from === undefined) !== (to === undefined)) {
      return res.status(400).json({ error: "from and to must be supplied together" });
    }

    // An absent range must reach Librus as "" (the empty-filter value the
    // Librus form itself submits), not as the literal value undefined -
    // form-data would stringify that to the literal text "undefined".
    const dateFrom = from === undefined ? "" : from;
    const dateTo = to === undefined ? "" : to;

    try {
      const homework = await cache.fetch(
        // Keep the raw from/to (not dateFrom/dateTo) here so an absent range
        // and an explicitly empty range stay distinguishable in the cache.
        cacheKey("homework", accountId, subject, from, to),
        () =>
          sessionManager.withSession(accountId, (client) =>
            client.homework.listHomework(subject, dateFrom, dateTo)
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
