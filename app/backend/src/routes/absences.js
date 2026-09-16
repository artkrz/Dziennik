"use strict";
const express = require("express");
const { cacheKey } = require("../cache.js");

function createAbsencesRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/absences", async (req, res) => {
    const accountId = Number(req.params.id);

    try {
      const bySemester = await cache.fetch(cacheKey("absences", accountId), () =>
        sessionManager.withSession(accountId, (client) => client.absence.getAbsences())
      );
      // getAbsences resolves to an object keyed by semester group, not an
      // array - wrap it so the response shape stays stable either way.
      res.json({ semesters: bySemester });
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus absences fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch absences from Librus" });
    }
  });

  return router;
}

module.exports = { createAbsencesRouter };
