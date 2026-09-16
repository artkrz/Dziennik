"use strict";
const express = require("express");
const { cacheKey } = require("../cache.js");

function createGradesRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/grades", async (req, res) => {
    const accountId = Number(req.params.id);

    try {
      const grades = await cache.fetch(cacheKey("grades", accountId), () =>
        sessionManager.withSession(accountId, (client) => client.info.getGrades())
      );
      res.json(grades);
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus grades fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch grades from Librus" });
    }
  });

  return router;
}

module.exports = { createGradesRouter };
