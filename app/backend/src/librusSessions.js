"use strict";

function createSessionManager({
  accountsStore,
  decryptPassword,
  librusFactory,
  sessionsStore,
  encryptText,
  decryptText,
}) {
  const factory = librusFactory || (() => new (require("../../../lib/api.js"))());
  const clients = new Map();
  const pendingLogins = new Map();

  /** Decrypt a stored jar, or undefined if there isn't a usable one. */
  function restoreSession(accountId) {
    if (!sessionsStore || !decryptText) return undefined;
    const blob = sessionsStore.load(accountId);
    if (!blob) return undefined;
    try {
      return decryptText(Buffer.from(blob)) || undefined;
    } catch (error) {
      // A jar we cannot decrypt (rotated key, truncated row) is not fatal -
      // drop it and log in fresh. Log only error.message.
      console.error("discarding unreadable session for account %s: %s", accountId, error.message);
      sessionsStore.remove(accountId);
      return undefined;
    }
  }

  function persistSession(accountId, client) {
    if (!sessionsStore || !encryptText || typeof client.exportSession !== "function") return;
    const serialized = client.exportSession();
    if (!serialized) return;
    try {
      sessionsStore.save(accountId, encryptText(serialized));
    } catch (error) {
      // Persisting is an optimization; a failure must not fail the request.
      console.error("failed to persist session for account %s: %s", accountId, error.message);
    }
  }

  /** Build a client from the stored jar without hitting Librus. */
  function adopt(accountId) {
    const session = restoreSession(accountId);
    if (!session) return undefined;
    const client = factory({ session });
    clients.set(accountId, client);
    return client;
  }

  function login(accountId) {
    const pending = pendingLogins.get(accountId);
    if (pending) return pending;

    const attempt = (async () => {
      const account = accountsStore.get(accountId);
      if (!account) {
        throw new Error(`Unknown account ${accountId}`);
      }
      const password = decryptPassword(account.password_encrypted);
      const client = factory({});
      await client.authorize(account.login, password);
      clients.set(accountId, client);
      persistSession(accountId, client);
      return client;
    })();

    pendingLogins.set(accountId, attempt);
    return attempt.finally(() => pendingLogins.delete(accountId));
  }

  async function withSession(accountId, fn) {
    let client = clients.get(accountId);
    let fresh = false;

    if (!client) {
      // A restored jar is unproven: if it turns out to be stale, the catch
      // below logs in for real and retries exactly once.
      client = adopt(accountId);
    }
    if (!client) {
      client = await login(accountId);
      fresh = true;
    }

    try {
      return await fn(client);
    } catch (error) {
      if (fresh) throw error;
      client = await login(accountId);
      return fn(client);
    }
  }

  function forget(accountId) {
    clients.delete(accountId);
    if (sessionsStore) sessionsStore.remove(accountId);
  }

  return { withSession, login, forget };
}

module.exports = { createSessionManager };
