"use strict";
const express = require("express");
const { cacheKey } = require("../cache.js");

/** Parse an optional numeric query param, returning null when absent. */
function optionalNumber(raw) {
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : NaN;
}

function createAgendaRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/agenda", async (req, res) => {
    const accountId = Number(req.params.id);
    const month = optionalNumber(req.query.month);
    const year = optionalNumber(req.query.year);

    if (Number.isNaN(month) || (month !== null && (month < 1 || month > 12))) {
      return res.status(400).json({ error: "month must be an integer between 1 and 12" });
    }
    if (Number.isNaN(year) || (year !== null && (year < 2000 || year > 2100))) {
      return res.status(400).json({ error: "year must be an integer between 2000 and 2100" });
    }

    try {
      const nested = await cache.fetch(cacheKey("agenda", accountId, month, year), () =>
        sessionManager.withSession(accountId, (client) =>
          client.calendar.getCalendar(month ?? undefined, year ?? undefined)
        )
      );
      // getCalendar yields one array per day cell, with gaps for empty days.
      const events = (nested || []).flat().filter(Boolean);
      res.json(events);
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus agenda fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch the agenda from Librus" });
    }
  });

  return router;
}

module.exports = { createAgendaRouter };
