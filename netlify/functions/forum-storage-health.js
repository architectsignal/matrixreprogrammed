const { openForumStore, forumStorageError } = require('./_forum-store');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

  try {
    const store = openForumStore();
    const key = 'storage-health.json';
    const payload = {
      ok: true,
      checkedAt: new Date().toISOString(),
      store: 'matrix-forum',
      mode: process.env.FORUM_NETLIFY_SITE_ID || process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID ? 'manual-env-or-netlify-env' : 'automatic-netlify-context',
      message: 'Forum storage write/read check passed.'
    };

    await store.setJSON(key, payload);
    const readBack = await store.get(key, { type: 'json' });

    if (!readBack || readBack.ok !== true) {
      return json(500, {
        ok: false,
        store: 'matrix-forum',
        error: 'Storage write completed but readback failed.'
      });
    }

    const approved = await store.get('approved-posts.json', { type: 'json' }) || [];
    const reports = await store.get('reported-posts.json', { type: 'json' }) || [];
    const hidden = await store.get('hidden-posts.json', { type: 'json' }) || [];

    return json(200, {
      ok: true,
      store: 'matrix-forum',
      checkedAt: readBack.checkedAt,
      mode: readBack.mode,
      counts: {
        publicPosts: Array.isArray(approved) ? approved.length : 0,
        reports: Array.isArray(reports) ? reports.length : 0,
        hiddenPosts: Array.isArray(hidden) ? hidden.length : 0
      }
    });
  } catch (error) {
    return json(500, {
      ok: false,
      store: 'matrix-forum',
      ...forumStorageError(error)
    });
  }
};
