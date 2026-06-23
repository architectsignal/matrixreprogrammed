const fs = require('fs');
const path = require('path');

const root = process.cwd();
const updatePath = path.join(root, 'social', 'facebook', 'page-update.json');

async function main() {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const mode = (process.env.FACEBOOK_PAGE_UPDATE_MODE || 'live').toLowerCase();

  if (!fs.existsSync(updatePath)) throw new Error('Missing social/facebook/page-update.json');
  const update = JSON.parse(fs.readFileSync(updatePath, 'utf8'));

  const message = update.message;
  const link = update.link || 'https://matrixreprogrammed.com/';

  if (!message || message.trim().length < 20) throw new Error('Facebook update message is missing or too short.');

  if (!pageId || !token) {
    console.log('Facebook secrets missing. Skipping live Facebook Page update.');
    console.log('Required secrets: META_PAGE_ID, META_PAGE_ACCESS_TOKEN');
    return;
  }

  if (mode === 'dry-run') {
    console.log('FACEBOOK PAGE UPDATE DRY RUN');
    console.log(`Page ID: ${pageId}`);
    console.log('--- MESSAGE ---');
    console.log(message);
    console.log('--- LINK ---');
    console.log(link);
    return;
  }

  const endpoint = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/feed`;
  const body = new URLSearchParams({
    access_token: token,
    message,
    link
  });

  const res = await fetch(endpoint, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const safe = JSON.stringify(json).replace(token, '[REDACTED]');
    throw new Error(`Facebook Page update failed: HTTP ${res.status} ${safe}`);
  }

  console.log(`Facebook Page update published: ${json.id || 'unknown-id'}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
