"use strict";

// Polish and English reply/forward prefixes, repeated and in any order:
// "Re: Odp: Rozliczenie..." is one real subject seen on live data.
const PREFIX = /^\s*(re|odp|fw|fwd|pd|odpowiedź)\s*:\s*/i;

/** Strip every leading reply/forward prefix and normalise for comparison. */
function normalizeSubject(title) {
  let text = String(title || "");
  let previous;
  do {
    previous = text;
    text = text.replace(PREFIX, "");
  } while (text !== previous);
  return text.trim().toLowerCase();
}

/**
 * Group received and sent messages into conversations.
 *
 * Librus exposes no thread id, so messages are grouped by normalised
 * subject. The counterparty is deliberately NOT part of the key: a thread
 * legitimately has two participants, and keying on sender would split every
 * conversation into one thread per direction.
 *
 * @param received  listInbox(RECEIVED) rows
 * @param sent      listInbox(SENT) rows
 * @returns {Array} threads, newest activity first
 */
function groupIntoThreads(received = [], sent = []) {
  const tagged = [
    ...received.map((m) => ({ ...m, folder: "received", direction: "in" })),
    ...sent.map((m) => ({ ...m, folder: "sent", direction: "out" })),
  ];

  const byKey = new Map();
  for (const message of tagged) {
    const key = normalizeSubject(message.title);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(message);
  }

  return [...byKey.entries()]
    .map(([key, messages]) => {
      const ordered = [...messages].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const newest = ordered[ordered.length - 1];
      return {
        key,
        // The most recent subject keeps whatever prefixes it really has.
        subject: newest.title,
        participants: [...new Set(ordered.map((m) => m.user).filter(Boolean))],
        messageCount: ordered.length,
        lastDate: newest.date,
        unread: ordered.some((m) => m.direction === "in" && !m.read),
        messages: ordered,
      };
    })
    .sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)));
}

module.exports = { normalizeSubject, groupIntoThreads };
