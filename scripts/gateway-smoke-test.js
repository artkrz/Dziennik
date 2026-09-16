#!/usr/bin/env node
"use strict";

/**
 * Hand-run probe for the Librus JSON gateway.
 *
 * Usage:
 *   LIBRUS_LOGIN=1234567u LIBRUS_PASS='...' node scripts/gateway-smoke-test.js
 *
 * Read-only: one GET per endpoint, nothing written, nothing scheduled.
 * Prints SHAPES ONLY (status, key names, counts) - never a value - so the
 * output is safe to share.
 */

const Librus = require("../lib/api.js");

const GATEWAY = "https://synergia.librus.pl/gateway/api/2.0";

const ENDPOINTS = [
  "Me",
  "Grades",
  "Grades/Categories",
  "Grades/Comments",
  "Grades/Types",
  "PointGrades",
  "DescriptiveGrades",
  "TextGrades",
  "Notes",
  "Notes/Categories",
  "BehaviourGrades/Points",
  "BehaviourGrades/Points/Categories",
  "BehaviourGrades/Points/Comments",
  "Attendances",
  "Attendances/Types",
  "Timetables",
  "HomeWorks",
  "HomeWorks/Categories",
  "HomeWorkAssignments",
  "SchoolNotices",
  "LuckyNumbers",
  "Subjects",
  "Users",
  "Classrooms",
  "Schools",
  "Classes",
  "VirtualClasses",
  "SchoolFreeDays",
  "ClassFreeDays",
  "ParentTeacherConferences",
  "Units",
];

/** Describe a payload without revealing any of its values. */
function describe(payload) {
  if (payload === null || payload === undefined) return "empty";
  if (Array.isArray(payload)) {
    return `bare array (${payload.length}) first item keys: ${itemKeys(payload[0])}`;
  }
  if (typeof payload !== "object") return typeof payload;

  const keys = Object.keys(payload);
  const parts = [`keys: [${keys.join(", ")}]`];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      parts.push(`${key}[] count=${value.length} item keys: ${itemKeys(value[0])}`);
    }
  }
  return parts.join(" | ");
}

function itemKeys(item) {
  if (!item || typeof item !== "object") return "-";
  return `[${Object.keys(item).join(", ")}]`;
}

async function main() {
  const login = process.env.LIBRUS_LOGIN;
  const pass = process.env.LIBRUS_PASS;
  if (!login || !pass) {
    console.error("Set LIBRUS_LOGIN and LIBRUS_PASS in the environment.");
    process.exit(1);
  }

  const client = new Librus();
  try {
    await client.authorize(login, pass);
  } catch (error) {
    // Only error.message - the raw error can carry the plaintext password.
    console.error(`Login failed: ${error.message}`);
    process.exit(1);
  }
  console.log("Login OK. Probing gateway endpoints...\n");

  let reachable = 0;
  for (const endpoint of ENDPOINTS) {
    let line;
    try {
      const response = await client.caller.get(`${GATEWAY}/${endpoint}`, {
        validateStatus: null,
        headers: { Accept: "application/json" },
      });
      if (response.status === 200) reachable += 1;
      const shape = response.status === 200 ? describe(response.data) : "";
      line = `${String(response.status).padEnd(4)} ${endpoint.padEnd(34)} ${shape}`;
    } catch (error) {
      line = `ERR  ${endpoint.padEnd(34)} ${error.message}`;
    }
    console.log(line);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  console.log(`\n${reachable}/${ENDPOINTS.length} endpoints returned 200.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
