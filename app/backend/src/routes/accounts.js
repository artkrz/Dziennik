"use strict";
const express = require("express");

function createAccountsRouter({ accountsStore, encryptPassword, sessionManager, librusFactory, cache }) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json(accountsStore.list());
  });

  router.post("/", async (req, res) => {
    const { label, login, password } = req.body || {};
    if (!label || !login || !password) {
      return res.status(400).json({ error: "label, login and password are required" });
    }

    const client = librusFactory();
    try {
      await client.authorize(login, password);
    } catch (error) {
      // Log only error.message — the raw error can carry the plaintext Librus password in error.config.data
      console.error("librus auth failed for account %s: %s", login, error.message);
      return res.status(401).json({ error: "Invalid Librus credentials" });
    }

    try {
      const id = accountsStore.insert(label, login, encryptPassword(password));
      res.status(201).json({ id, label, login });
    } catch (error) {
      console.error("failed to save account %s: %s", login, error.message);
      res.status(500).json({ error: "Failed to save account" });
    }
  });

  router.patch("/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { label, password } = req.body || {};

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "id must be a positive integer" });
    }
    if (!label) {
      return res.status(400).json({ error: "label is required" });
    }

    const existing = accountsStore.get(id);
    if (!existing) {
      return res.status(404).json({ error: "Account not found" });
    }

    // A new password is verified against Librus before it is stored, so a
    // typo cannot lock the account out of every future background refresh.
    if (password) {
      const client = librusFactory();
      try {
        await client.authorize(existing.login, password);
      } catch (error) {
        // Log only error.message - the raw error can carry the plaintext Librus password.
        console.error("librus auth failed for account %s: %s", existing.login, error.message);
        return res.status(401).json({ error: "Invalid Librus credentials" });
      }
    }

    try {
      accountsStore.update(id, label, password ? encryptPassword(password) : null);
    } catch (error) {
      console.error("failed to update account %s: %s", id, error.message);
      return res.status(500).json({ error: "Failed to update account" });
    }

    // A changed password invalidates the cached client and the persisted
    // jar; cached data is keyed per account and may now be stale either way.
    if (password) sessionManager.forget(id);
    if (cache) cache.invalidateAccount(id);

    res.json({ id, label, login: existing.login });
  });

  router.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    accountsStore.remove(id);
    sessionManager.forget(id);
    // Otherwise a deleted student's grades, absences, agenda, homework and
    // inbox keep being served for the rest of the cache TTL.
    if (cache) cache.invalidateAccount(id);
    res.status(204).end();
  });

  return router;
}

module.exports = { createAccountsRouter };
