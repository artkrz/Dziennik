"use strict";
const express = require("express");
const { cacheKey } = require("../cache.js");

function createAgendaEventRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/agenda/:eventId", async (req, res) => {
    const accountId = Number(req.params.id);
    const eventId = Number(req.params.eventId);

    // eventId is interpolated into an outbound Librus URL path.
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: "eventId must be a positive integer" });
    }

    try {
      const event = await cache.fetch(cacheKey("agenda-event", accountId, eventId), () =>
        sessionManager.withSession(accountId, (client) => client.calendar.getEvent(eventId))
      );

      // An event the scraper could not read (wrong detail table, e.g. a
      // teacher-absence entry) resolves to a falsy or all-empty object.
      const hasContent =
        event && Object.values(event).some((value) => value !== undefined && value !== "");
      if (!hasContent) {
        return res.status(404).json({ error: "Event not found" });
      }

      res.json(event);
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus agenda event fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch the event from Librus" });
    }
  });

  return router;
}

module.exports = { createAgendaEventRouter };
