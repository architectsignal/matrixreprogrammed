const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dropPath = path.join(root, 'data', 'latest-drop.json');

async function main() {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const mode = (process.env.FACEBOOK_POST_MODE || 'live').toLowerCase();

  if (!fs.existsSync(dropPath)) throw new Error('Missing data/latest-drop.json. Run intel-drop-engine first.');
  const drop = JSON.parse(fs.readFileSync(dropPath, 'utf8'));
  const message = drop.social && drop.social.facebook ? drop.social.facebook : `Matrix Reprogrammed Signal Drop: ${drop.title}\n${drop.book.localUrl}`;
  const link = drop.book && drop.book.localUrl ? drop.book.localUrl : 'https://matrixreprogrammed.com/black-file.html';

  if (!pageId || !token) {
    console.log('Facebook secrets missing. Skipping live Facebook publish.');
    console.log('Required secrets: META_PAGE_ID, META_PAGE_ACCESS_TOKEN');
    return;
  }

  if (mode === 'dry-run') {
    console.log('FACEBOOK DRY RUN');
    console.log(`Page ID: ${pageId}`);
    console.log(message);
    console.log(`Link: ${link}`);
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
    throw new Error(`Facebook publish failed: HTTP ${res.status} ${safe}`);
  }

  console.log(`Facebook post published: ${json.id || 'unknown-id'}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
