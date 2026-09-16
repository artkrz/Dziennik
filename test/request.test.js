"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Librus = require("../lib/api.js");
const { LibrusSessionExpiredError } = require("../lib/errors.js");

const LOGIN_PAGE = `
  <html><body>
    <form id="login-form" action="/loguj">
      <input type="text" name="login" />
      <input type="password" name="pass" />
    </form>
  </body></html>`;

const REAL_PAGE = `
  <html><body><table class="decorated"><tbody><tr><td>Matematyka</td></tr></tbody></table></body></html>`;

function clientReturning(data, responseUrl) {
  return new Librus(undefined, {
    caller: {
      request: async () => ({ data, request: { res: { responseUrl } } }),
    },
  });
}

test("_request throws LibrusSessionExpiredError when handed a login page", async () => {
  const client = clientReturning(LOGIN_PAGE, "https://synergia.librus.pl/loguj");
  await assert.rejects(
    () => client._request("get", "przegladaj_oceny/uczen"),
    (error) => error instanceof LibrusSessionExpiredError
  );
});

test("_request throws when redirected to the OAuth authorization page", async () => {
  const client = clientReturning(REAL_PAGE, "https://api.librus.pl/OAuth/Authorization?client_id=46");
  await assert.rejects(
    () => client._request("get", "przegladaj_oceny/uczen"),
    (error) => error instanceof LibrusSessionExpiredError
  );
});

test("_request returns the parsed document for a real page", async () => {
  const client = clientReturning(REAL_PAGE, "https://synergia.librus.pl/przegladaj_oceny/uczen");
  const $ = await client._request("get", "przegladaj_oceny/uczen");
  assert.equal($("table.decorated td").text().trim(), "Matematyka");
});

test("looksLikeLoginPage ignores a page that merely mentions logging in", () => {
  const $ = Librus._loadDocument("<html><body><p>Zostales wylogowany. Zaloguj sie ponownie.</p></body></html>");
  assert.equal(Librus.looksLikeLoginPage($, "https://synergia.librus.pl/uczen_index"), false);
});
