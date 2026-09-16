"use strict";
const express = require("express");
const config = require("../../../../lib/config.js");
const { cacheKey } = require("../cache.js");
const { groupIntoThreads } = require("../threads.js");

const RECEIVED = config.folder.RECEIVED;
const SENT = config.folder.SENT;

function createMessagesRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/messages", async (req, res) => {
    const accountId = Number(req.params.id);

    try {
      const messages = await cache.fetch(cacheKey("messages", accountId), () =>
        sessionManager.withSession(accountId, (client) => client.inbox.listInbox(RECEIVED))
      );
      res.json(messages);
    } catch (error) {
      // Log only error.message — the raw error can carry the plaintext Librus password in error.config.data
      console.error("librus inbox fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch messages from Librus" });
    }
  });

  // MUST be registered before "/:id/messages/:messageId" - otherwise Express
  // matches that route first and "sent" fails the integer check.
  router.get("/:id/messages/sent", async (req, res) => {
    const accountId = Number(req.params.id);
    try {
      const messages = await cache.fetch(cacheKey("messages-sent", accountId), () =>
        sessionManager.withSession(accountId, (client) => client.inbox.listInbox(SENT))
      );
      res.json(messages);
    } catch (error) {
      // Log only error.message — the raw error can carry the plaintext Librus password in error.config.data
      console.error("librus sent fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch sent messages from Librus" });
    }
  });

  router.get("/:id/threads", async (req, res) => {
    const accountId = Number(req.params.id);
    try {
      const threads = await cache.fetch(cacheKey("threads", accountId), async () => {
        const [received, sent] = await Promise.all([
          sessionManager.withSession(accountId, (client) => client.inbox.listInbox(RECEIVED)),
          sessionManager.withSession(accountId, (client) => client.inbox.listInbox(SENT)),
        ]);
        return groupIntoThreads(received, sent);
      });
      res.json(threads);
    } catch (error) {
      // Log only error.message — the raw error can carry the plaintext Librus password in error.config.data
      console.error("librus threads fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch conversations from Librus" });
    }
  });

  router.get("/:id/messages/:messageId", async (req, res) => {
    const accountId = Number(req.params.id);
    const messageId = Number(req.params.messageId);

    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ error: "messageId must be a positive integer" });
    }

    const folder = req.query.folder === "sent" ? SENT : RECEIVED;

    try {
      const message = await sessionManager.withSession(accountId, (client) =>
        client.inbox.getMessage(folder, messageId)
      );

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Only plain-text content crosses this boundary: message.html is third-party
      // markup and rendering it in the browser would be an XSS vector.
      res.json({
        id: messageId,
        title: message.title,
        user: message.user,
        date: message.date,
        content: message.content,
      });
    } catch (error) {
      // Log only error.message — the raw error can carry the plaintext Librus password in error.config.data
      console.error("librus message fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch message from Librus" });
    }
  });

  return router;
}

module.exports = { createMessagesRouter };
