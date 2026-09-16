"use strict";
const express = require("express");

function createTimetableRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/timetable", async (req, res) => {
    const accountId = Number(req.params.id);
    const { from, to } = req.query;

    try {
      const timetable = await cache.fetch(`timetable:${accountId}:${from || ""}:${to || ""}`, () =>
        sessionManager.withSession(accountId, (client) => client.calendar.getTimetable(from, to))
      );
      res.json(timetable);
    } catch (error) {
      // Log only error.message — the raw error can carry the plaintext Librus password in error.config.data
      console.error("librus timetable fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch timetable from Librus" });
    }
  });

  return router;
}

module.exports = { createTimetableRouter };
