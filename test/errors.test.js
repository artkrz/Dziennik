"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LibrusError,
  LibrusAuthError,
  LibrusCaptchaError,
  LibrusSessionExpiredError,
} = require("../lib/errors.js");

test("every error is an Error and names itself", () => {
  assert.ok(new LibrusError("x") instanceof Error);
  assert.equal(new LibrusCaptchaError("x").name, "LibrusCaptchaError");
  assert.equal(new LibrusSessionExpiredError("x").name, "LibrusSessionExpiredError");
});

test("captcha is an auth failure, expiry is not", () => {
  assert.ok(new LibrusCaptchaError("x") instanceof LibrusAuthError);
  assert.ok(new LibrusAuthError("x") instanceof LibrusError);
  assert.ok(!(new LibrusSessionExpiredError("x") instanceof LibrusAuthError));
});
