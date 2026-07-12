const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pagePath = path.join(root, 'index.html');
const reportPath = path.join(root, 'downloads', 'homepage-mask-intro-report.json');
const required = [
  'homepage-mask-intro.css',
  'homepage-mask-intro.js',
  'assets/intro-eye.svg',
  'assets/intro-mask.svg'
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Homepage intro asset missing: ${rel}`);
}
if (!fs.existsSync(pagePath)) throw new Error('index.html is missing');

let html = fs.readFileSync(pagePath, 'utf8');
const cssLink = '<link rel="stylesheet" href="homepage-mask-intro.css" data-homepage-mask-intro-style />';
const preloads = [
  '<link rel="preload" as="image" href="assets/intro-eye.svg" type="image/svg+xml" fetchpriority="high" data-homepage-mask-preload="eye" />',
  '<link rel="preload" as="image" href="assets/intro-mask.svg" type="image/svg+xml" fetchpriority="high" data-homepage-mask-preload="mask" />'
].join('');
const overlay = `<!-- homepage-mask-intro:start -->
<section id="homepage-mask-intro" class="homepage-mask-intro phase-eye" data-homepage-mask-intro data-phase="eye" aria-label="Matrix Reprogrammed opening sequence" aria-hidden="false">
  <div class="homepage-mask-intro__stage">
    <img class="homepage-intro__symbol homepage-intro__eye" src="assets/intro-eye.svg" width="1200" height="1200" alt="" aria-hidden="true" decoding="async" fetchpriority="high" data-intro-asset="eye" />
    <img class="homepage-intro__symbol homepage-intro__mask" src="assets/intro-mask.svg" width="1000" height="1200" alt="" aria-hidden="true" decoding="async" fetchpriority="high" data-intro-asset="mask" />
    <div class="homepage-intro__burn" aria-hidden="true"></div>
    <div class="homepage-intro__embers" aria-hidden="true"></div>
    <p class="homepage-mask-intro__wordmark">Matrix Reprogrammed</p>
    <button class="homepage-mask-intro__skip" type="button" data-mask-intro-skip>Skip intro</button>
  </div>
</section>
<!-- homepage-mask-intro:end -->`;
const runtime = '<script src="homepage-mask-intro.js" data-homepage-mask-intro-runtime></script>';

html = html
  .replace(/<link[^>]+data-homepage-mask-intro-style[^>]*>/gi, '')
  .replace(/<link[^>]+data-homepage-mask-preload[^>]*>/gi, '')
  .replace(/<!-- homepage-mask-intro:start -->[\s\S]*?<!-- homepage-mask-intro:end -->/gi, '')
  .replace(/<script[^>]+data-homepage-mask-intro-runtime[^>]*><\/script>/gi, '');

if (!html.includes('</head>')) throw new Error('index.html has no closing head tag');
html = html.replace('</head>', `${preloads}${cssLink}</head>`);

const bodyMatch = html.match(/<body[^>]*>/i);
if (!bodyMatch) throw new Error('index.html has no body tag');
html = html.replace(bodyMatch[0], `${bodyMatch[0]}${overlay}`);

if (!html.includes('welcome-gate.js')) throw new Error('Homepage welcome gate runtime is missing');
if (!html.includes('</body>')) throw new Error('index.html has no closing body tag');
html = html.replace('</body>', `${runtime}</body>`);
fs.writeFileSync(pagePath, html);

const counts = {
  overlay: (html.match(/data-homepage-mask-intro(?:\s|>)/g) || []).length,
  style: (html.match(/data-homepage-mask-intro-style/g) || []).length,
  preloads: (html.match(/data-homepage-mask-preload=/g) || []).length,
  runtime: (html.match(/data-homepage-mask-intro-runtime/g) || []).length,
  eye: (html.match(/assets\/intro-eye\.svg/g) || []).length,
  mask: (html.match(/assets\/intro-mask\.svg/g) || []).length,
  assets: (html.match(/data-intro-asset=/g) || []).length
};
const failures = [];
if (counts.overlay !== 1) failures.push(`expected one intro overlay, found ${counts.overlay}`);
if (counts.style !== 1) failures.push(`expected one intro stylesheet, found ${counts.style}`);
if (counts.preloads !== 2) failures.push(`expected two image preloads, found ${counts.preloads}`);
if (counts.runtime !== 1) failures.push(`expected one intro runtime, found ${counts.runtime}`);
if (counts.eye !== 2) failures.push(`eye must be preloaded and rendered, found ${counts.eye}`);
if (counts.mask !== 2) failures.push(`mask must be preloaded and rendered, found ${counts.mask}`);
if (counts.assets !== 2) failures.push(`expected two independent intro assets, found ${counts.assets}`);
if (!html.includes('homepage-intro__burn')) failures.push('burn transition layer missing');
if (!html.includes('homepage-intro__embers')) failures.push('ember transition layer missing');
if (!html.includes('data-mask-intro-skip')) failures.push('skip control missing');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  sequence: ['eye:3000ms', 'burn:1100ms', 'mask:3000ms', 'dissolve:1200ms'],
  counts,
  required,
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(failure => console.error(`INTRO SEQUENCE FAILURE: ${failure}`));
  process.exit(1);
}
console.log('Homepage intro patched: 3s eye, burn reveal, 3s mask, welcome dissolve.');
