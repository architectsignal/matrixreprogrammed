const { getStore } = require('@netlify/blobs');

function openForumStore() {
  const siteID = process.env.FORUM_NETLIFY_SITE_ID || process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.FORUM_NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return getStore('matrix-forum', { siteID, token });
  }

  return getStore('matrix-forum');
}

module.exports = { openForumStore };
