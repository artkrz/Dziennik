"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Librus = require("../lib/api.js");
const { LibrusAuthError, LibrusCaptchaError } = require("../lib/errors.js");

/** Minimal stand-in for the axios instance lib/api.js builds. */
function stubCaller({ postFormData }) {
  return {
    get: async () => ({
      request: { res: { responseUrl: "https://api.librus.pl/OAuth/Authorization?client_id=46" } },
      data: "",
    }),
    postForm: async () => ({ data: postFormData }),
    request: async () => ({ data: "" }),
  };
}

test("authorize throws LibrusCaptchaError when the login response demands a captcha", async () => {
  const client = new Librus(undefined, {
    caller: stubCaller({ postFormData: { errors: ["Wymagane jest przepisanie kodu g-recaptcha"] } }),
  });
  await assert.rejects(
    () => client.authorize("user", "pass"),
    (error) => error instanceof LibrusCaptchaError
  );
});

test("authorize throws LibrusAuthError when no redirect target comes back", async () => {
  const client = new Librus(undefined, { caller: stubCaller({ postFormData: {} }) });
  await assert.rejects(
    () => client.authorize("user", "pass"),
    (error) => error instanceof LibrusAuthError && !(error instanceof LibrusCaptchaError)
  );
});

test("authorize resolves with cookies on the happy path", async () => {
  const client = new Librus(undefined, {
    caller: stubCaller({
      postFormData: { goTo: "/OAuth/Authorization?client_id=46&response_type=code&scope=mydata" },
    }),
  });
  const cookies = await client.authorize("user", "pass");
  assert.ok(Array.isArray(cookies));
});

test("detectsCaptcha ignores an ordinary success payload", () => {
  assert.equal(Librus.detectsCaptcha({ goTo: "/OAuth/Authorization?client_id=46" }), false);
});
