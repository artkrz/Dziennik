"use strict";

/** Base class for every error this library raises deliberately. */
class LibrusError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

/** Login was rejected: bad credentials, captcha, or an unexpected response. */
class LibrusAuthError extends LibrusError {}

/** Librus demanded a captcha - a human has to log in once in a browser. */
class LibrusCaptchaError extends LibrusAuthError {}

/** The session cookies are no longer valid; log in again and retry. */
class LibrusSessionExpiredError extends LibrusError {}

module.exports = {
  LibrusError,
  LibrusAuthError,
  LibrusCaptchaError,
  LibrusSessionExpiredError,
};
