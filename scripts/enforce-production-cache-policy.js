const fs = require('fs');
const path = require('path');

const root = process.cwd();
const headers = `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/*.html
  Cache-Control: no-cache, max-age=0, must-revalidate

/*.css
  Cache-Control: public, max-age=300, must-revalidate

/*.js
  Cache-Control: public, max-age=300, must-revalidate

/data/*.json
  Cache-Control: no-cache, max-age=0, must-revalidate
  Content-Type: application/json; charset=utf-8

/deploy-manifest.json
  Cache-Control: no-store, max-age=0
  Content-Type: application/json; charset=utf-8

/deploy-manifest
  Cache-Control: no-store, max-age=0
  Content-Type: application/json; charset=utf-8

/deploy-health.html
  Cache-Control: no-store, max-age=0

/deploy-health
  Cache-Control: no-store, max-age=0

/deploy-health.json
  Cache-Control: no-store, max-age=0
  Content-Type: application/json; charset=utf-8

/downloads/deploy-health.json
  Cache-Control: no-store, max-age=0
  Content-Type: application/json; charset=utf-8
  Content-Disposition: attachment

/
  Cache-Control: no-cache, max-age=0, must-revalidate

/start-here
  Cache-Control: no-cache, max-age=0, must-revalidate

/membership
  Cache-Control: no-cache, max-age=0, must-revalidate

/live-intel
  Cache-Control: no-cache, max-age=0, must-revalidate

/daily-power-conclusions
  Cache-Control: no-cache, max-age=0, must-revalidate

/daily-investigation-conclusions
  Cache-Control: no-cache, max-age=0, must-revalidate

/daily-brain-brief
  Cache-Control: no-cache, max-age=0, must-revalidate

/outcome-briefings
  Cache-Control: no-cache, max-age=0, must-revalidate

/security-privacy
  Cache-Control: no-cache, max-age=0, must-revalidate

/dark-web-safety
  Cache-Control: no-cache, max-age=0, must-revalidate

/geographic-power-atlas
  Cache-Control: no-cache, max-age=0, must-revalidate

/data-lab
  Cache-Control: no-cache, max-age=0, must-revalidate

/evidence-archive
  Cache-Control: no-cache, max-age=0, must-revalidate

/search
  Cache-Control: no-cache, max-age=0, must-revalidate

/downloads/*.pdf
  Content-Disposition: attachment
  Content-Type: application/pdf
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/downloads/*.json
  Content-Disposition: attachment
  Content-Type: application/json
  Cache-Control: public, max-age=300, must-revalidate

/downloads/*.md
  Content-Disposition: attachment
  Content-Type: text/markdown
  Cache-Control: public, max-age=300, must-revalidate

/feeds/*.xml
  Content-Type: application/xml
  Cache-Control: public, max-age=300, must-revalidate

/feeds/*.json
  Content-Type: application/feed+json
  Cache-Control: public, max-age=300, must-revalidate
`;
fs.writeFileSync(path.join(root, '_headers'), headers);
const site = path.join(root, '_site');
if (fs.existsSync(site)) fs.writeFileSync(path.join(site, '_headers'), headers);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-cache-policy.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  criticalHtml: 'no-cache',
  liveJson: 'no-cache',
  deployManifest: 'no-store',
  deployHealth: 'no-store',
  membership: 'no-cache with checkout disabled',
  unversionedAssets: '5-minute revalidation'
}, null, 2));
console.log('Final production cache policy enforced after legacy generators, including uncached health proof.');
