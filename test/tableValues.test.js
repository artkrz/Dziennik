"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Librus = require("../lib/api.js");

test("tableValues maps header cells through the keys translation", () => {
  const $ = Librus._loadDocument(`
    <table><tbody>
      <tr><th>Nauczyciel:</th><td>Anna Kowalska</td></tr>
      <tr><th>Termin:</th><td>2026-09-20</td></tr>
    </tbody></table>`);
  const result = Librus.tableValues($("table"), {
    "Nauczyciel:": "teacher",
    "Termin:": "due",
  });
  assert.deepEqual(result, { teacher: "Anna Kowalska", due: "2026-09-20" });
});

// Guard, not a red test: JS keeps only the LAST declaration, so arity is
// already 2 today. This exists to fail if anyone ever re-adds an overload
// above the real one and silently shadows it again.
test("tableValues takes exactly two parameters - no shadowing overload", () => {
  assert.equal(Librus.tableValues.length, 2);
});

test("mapTableValues zips the second column onto positional keys", () => {
  const $ = Librus._loadDocument(`
    <table><tbody>
      <tr><td>Id:</td><td>23</td></tr>
      <tr><td>Name:</td><td>test</td></tr>
    </tbody></table>`);
  assert.deepEqual(Librus.mapTableValues($("table"), ["id", "name"]), { id: "23", name: "test" });
});
