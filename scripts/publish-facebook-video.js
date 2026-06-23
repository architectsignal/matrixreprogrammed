const fs = require('fs');
const path = require('path');

const root = process.cwd();
const packagePath = path.join(root, 'data', 'latest-video-package.json');

async function main() {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const mode = (process.env.FACEBOOK_VIDEO_MODE || 'live').toLowerCase();

  if (!fs.existsSync(packagePath)) throw new Error('Missing data/latest-video-package.json.');
  const pack = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const outDir = path.join(root, 'video-packages', pack.slug);
  const videoPath = path.join(outDir, 'weekly-dog-transmission.mp4');
  if (!fs.existsSync(videoPath)) throw new Error(`Missing rendered MP4: ${videoPath}`);

  const description = pack.facebook && pack.facebook.caption ? pack.facebook.caption : `${pack.title}\n\n${pack.readerPath.localUrl}`;
  const title = pack.title || 'Weekly D.O.G Transmission';

  if (!pageId || !token) {
    console.log('Facebook secrets missing. Skipping Facebook video upload.');
    console.log('Required secrets: META_PAGE_ID, META_PAGE_ACCESS_TOKEN');
    return;
  }

  if (mode === 'dry-run') {
    console.log('FACEBOOK VIDEO DRY RUN');
    console.log(`Page ID: ${pageId}`);
    console.log(`Video path: ${videoPath}`);
    console.log(`Title: ${title}`);
    console.log(description);
    return;
  }

  const endpoint = `https://graph-video.facebook.com/v20.0/${encodeURIComponent(pageId)}/videos`;
  const videoBuffer = fs.readFileSync(videoPath);
  const form = new FormData();
  form.append('access_token', token);
  form.append('title', title);
  form.append('description', description);
  form.append('published', 'true');
  form.append('source', new Blob([videoBuffer], { type: 'video/mp4' }), 'weekly-dog-transmission.mp4');

  const res = await fetch(endpoint, { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const safe = JSON.stringify(json).replace(token, '[REDACTED]');
    throw new Error(`Facebook video upload failed: HTTP ${res.status} ${safe}`);
  }

  console.log(`Facebook video uploaded: ${json.id || 'unknown-id'}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
