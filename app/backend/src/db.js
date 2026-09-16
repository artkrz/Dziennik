"use strict";
const Database = require("better-sqlite3");

function createDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      login TEXT NOT NULL,
      password_encrypted BLOB NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      account_id INTEGER PRIMARY KEY,
      session_encrypted BLOB NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}

function makeAccountsStore(db) {
  const insertStmt = db.prepare(
    "INSERT INTO accounts (label, login, password_encrypted, created_at) VALUES (?, ?, ?, ?)"
  );
  const listStmt = db.prepare("SELECT id, label, login FROM accounts ORDER BY id");
  const getStmt = db.prepare(
    "SELECT id, label, login, password_encrypted FROM accounts WHERE id = ?"
  );
  const deleteStmt = db.prepare("DELETE FROM accounts WHERE id = ?");
  const updateWithPasswordStmt = db.prepare(
    "UPDATE accounts SET label = ?, password_encrypted = ? WHERE id = ?"
  );
  const updateLabelStmt = db.prepare("UPDATE accounts SET label = ? WHERE id = ?");

  return {
    insert(label, login, passwordEncrypted) {
      const info = insertStmt.run(label, login, passwordEncrypted, new Date().toISOString());
      return Number(info.lastInsertRowid);
    },
    list() {
      return listStmt.all();
    },
    get(id) {
      return getStmt.get(id);
    },
    remove(id) {
      deleteStmt.run(id);
    },
    update(id, label, passwordEncrypted) {
      const info = passwordEncrypted
        ? updateWithPasswordStmt.run(label, passwordEncrypted, id)
        : updateLabelStmt.run(label, id);
      return info.changes > 0;
    },
  };
}

function makeSessionsStore(db) {
  const saveStmt = db.prepare(
    `INSERT INTO sessions (account_id, session_encrypted, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       session_encrypted = excluded.session_encrypted,
       updated_at = excluded.updated_at`
  );
  const loadStmt = db.prepare("SELECT session_encrypted FROM sessions WHERE account_id = ?");
  const removeStmt = db.prepare("DELETE FROM sessions WHERE account_id = ?");

  return {
    save(accountId, blob) {
      saveStmt.run(accountId, blob, new Date().toISOString());
    },
    load(accountId) {
      return loadStmt.get(accountId)?.session_encrypted;
    },
    remove(accountId) {
      removeStmt.run(accountId);
    },
  };
}

module.exports = { createDb, makeAccountsStore, makeSessionsStore };
