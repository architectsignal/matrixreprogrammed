const { getStore } = require('@netlify/blobs');

function getForumStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;

  if (siteID && token) {
    return getStore({ name: 'matrix-forum', siteID, token });
  }

  return getStore('matrix-forum');
}

function storageError(error) {
  const message = String(error && error.message ? error.message : error || 'Unknown storage error');
  return {
    error: 'Forum storage is not configured yet.',
    detail: message,
    fix: 'Add NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN in Netlify environment variables, then redeploy.'
  };
}

module.exports = { getForumStore, storageError };
