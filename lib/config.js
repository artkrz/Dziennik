var config = {};

/** URL to desktop website */
config.page_url = "https://synergia.librus.pl";

/** Cookie that actually carries the Synergia session (~10 minute lifetime). */
config.session_cookie = "oauth_token";

/** Folder indexes */
config.folder = {
  RECEIVED: 5,
  SENT: 6,
};

/** Exports */
module.exports = config;
