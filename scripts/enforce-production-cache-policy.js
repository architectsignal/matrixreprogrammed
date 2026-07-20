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
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/*.js
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/*.png
  Cache-Control: public, max-age=31536000, immutable

/*.jpg
  Cache-Control: public, max-age=31536000, immutable

/*.jpeg
  Cache-Control: public, max-age=31536000, immutable

/*.webp
  Cache-Control: public, max-age=31536000, immutable

/*.svg
  Cache-Control: public, max-age=31536000, immutable

/*.woff
  Cache-Control: public, max-age=31536000, immutable

/*.woff2
  Cache-Control: public, max-age=31536000, immutable

/search-index.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=600, stale-while-revalidate=86400

/data/evidence-network-map.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/data/*.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=300, stale-while-revalidate=3600

/data/live-intel.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-cache, max-age=0, must-revalidate

/data/daily-epstein-update.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-cache, max-age=0, must-revalidate

/data/live-machine-status.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-cache, max-age=0, must-revalidate

/data/daily-power-conclusions.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-cache, max-age=0, must-revalidate

/data/daily-investigation-conclusions.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-cache, max-age=0, must-revalidate

/data/daily-brain-brief.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-cache, max-age=0, must-revalidate

/data/outcome-briefings.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-cache, max-age=0, must-revalidate

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

/daily-epstein-update
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
  Cache-Control: public, max-age=600, stale-while-revalidate=3600

/downloads/*.md
  Content-Disposition: attachment
  Content-Type: text/markdown
  Cache-Control: public, max-age=600, stale-while-revalidate=3600

/downloads/*.txt
  Content-Disposition: attachment
  Content-Type: text/plain
  Cache-Control: public, max-age=600, stale-while-revalidate=3600

/feeds/*.xml
  Content-Type: application/xml
  Cache-Control: public, max-age=600, stale-while-revalidate=3600

/feeds/*.json
  Content-Type: application/feed+json
  Cache-Control: public, max-age=600, stale-while-revalidate=3600
`;

fs.writeFileSync(path.join(root, '_headers'), headers);
const site = path.join(root, '_site');
if (fs.existsSync(site)) fs.writeFileSync(path.join(site, '_headers'), headers);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-cache-policy.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  criticalHtml: 'revalidate every request',
  criticalLiveJson: 'revalidate every request',
  searchIndex: '10-minute browser/edge cache with one-day stale-while-revalidate',
  evidenceNetwork: 'one-hour browser/edge cache with one-day stale-while-revalidate',
  javascriptAndCss: 'one-day cache with seven-day stale-while-revalidate; HTML references are content-hash versioned',
  immutableMedia: 'images and fonts only',
  deployManifest: 'no-store',
  deployHealth: 'no-store',
  membership: 'no-cache with runtime-gated checkout',
  boundary: 'Fresh intelligence, health and account surfaces always revalidate. Large static indexes and fingerprinted assets are cached to reduce startup latency without hiding new releases.'
}, null, 2));
console.log('Optimized production cache policy enforced: current intelligence revalidates, fingerprinted assets cache safely, and health proof remains no-store.');
