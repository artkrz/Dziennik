"use strict";

function createSessionManager({
  accountsStore,
  decryptPassword,
  librusFactory,
  sessionsStore,
  encryptText,
  decryptText,
}) {
  const factory =
    librusFactory || ((options) => new (require("../../../lib/api.js"))(undefined, options));
  const clients = new Map();
  const pendingLogins = new Map();
  // Bumped by forget(). A login that started before the bump must not
  // resurrect the account when it finally resolves.
  const generations = new Map();

  function generationOf(accountId) {
    return generations.get(accountId) || 0;
  }

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

  /** Build a client from the stored jar, but only if it can still fetch. */
  async function adopt(accountId) {
    const session = restoreSession(accountId);
    if (!session) return undefined;
    const client = factory({ session });
    if (typeof client.hasLiveSession === "function" && !(await client.hasLiveSession())) {
      // The jar deserialized fine but its session cookie has expired. Fall
      // through to login(), which reuses this same jar for its DeviceCookie.
      return undefined;
    }
    clients.set(accountId, client);
    return client;
  }

  function login(accountId) {
    const pending = pendingLogins.get(accountId);
    if (pending) return pending;

    const attempt = (async () => {
      const generation = generationOf(accountId);
      const account = accountsStore.get(accountId);
      if (!account) {
        throw new Error(`Unknown account ${accountId}`);
      }
      const password = decryptPassword(account.password_encrypted);
      // Reuse the stored jar even though we are logging in: its session
      // cookie is long dead, but the ~1 year DeviceCookie it carries is what
      // keeps logins free of a captcha challenge.
      const client = factory({ session: restoreSession(accountId) });
      await client.authorize(account.login, password);
      if (generationOf(accountId) !== generation) {
        // forget() ran while this login was in flight - do not resurrect
        // the account's client or re-persist its session.
        return client;
      }
      clients.set(accountId, client);
      persistSession(accountId, client);
      return client;
    })();

    pendingLogins.set(accountId, attempt);
    return attempt.finally(() => {
      // Delete by identity, not by key: forget() may have cleared this entry
      // and a newer login may already own the slot.
      if (pendingLogins.get(accountId) === attempt) pendingLogins.delete(accountId);
    });
  }

  async function withSession(accountId, fn) {
    let client = clients.get(accountId);
    let fresh = false;

    if (client && typeof client.hasLiveSession === "function" && !(await client.hasLiveSession())) {
      // Cached clients outlive their ~10 minute session cookie; without this
      // every later request quietly returns empty data instead of re-logging in.
      clients.delete(accountId);
      client = undefined;
    }

    if (!client) {
      // A restored jar is unproven: if it turns out to be stale, the catch
      // below logs in for real and retries exactly once.
      client = await adopt(accountId);
    }
    if (!client) {
      client = await login(accountId);
      fresh = true;
    }

    try {
      return await fn(client);
    } catch (error) {
      if (fresh) throw error;
      // Without this line a silently doubled login rate looks like a
      // healthy app. Log error.message only - a raw AxiosError carries the
      // plaintext Librus password in error.config.data.
      console.error("retrying account %s after a failed request: %s", accountId, error.message);
      client = await login(accountId);
      return fn(client);
    }
  }

  function forget(accountId) {
    generations.set(accountId, generationOf(accountId) + 1);
    pendingLogins.delete(accountId);
    clients.delete(accountId);
    if (sessionsStore) sessionsStore.remove(accountId);
  }

  return { withSession, login, forget };
}

module.exports = { createSessionManager };
