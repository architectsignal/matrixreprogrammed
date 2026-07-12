const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pagePath = path.join(root, 'index.html');
const reportPath = path.join(root, 'downloads', 'homepage-mask-intro-report.json');
const required = ['homepage-mask-intro.css', 'homepage-mask-intro.js', 'assets/homepage-mask.webp'];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Homepage mask intro asset missing: ${rel}`);
}
if (!fs.existsSync(pagePath)) throw new Error('index.html is missing');

let html = fs.readFileSync(pagePath, 'utf8');
const cssLink = '<link rel="stylesheet" href="homepage-mask-intro.css" data-homepage-mask-intro-style />';
const preload = '<link rel="preload" as="image" href="assets/homepage-mask.webp" type="image/webp" fetchpriority="high" data-homepage-mask-preload />';
const overlay = '<!-- homepage-mask-intro:start --><section id="homepage-mask-intro" class="homepage-mask-intro" data-homepage-mask-intro aria-label="Matrix Reprogrammed opening sequence" aria-hidden="false"><div class="homepage-mask-intro__stage"><img class="homepage-mask-intro__mask" src="assets/homepage-mask.webp" width="220" height="268" alt="" aria-hidden="true" decoding="async" fetchpriority="high" /><p class="homepage-mask-intro__wordmark">Matrix Reprogrammed</p><button class="homepage-mask-intro__skip" type="button" data-mask-intro-skip>Skip intro</button></div></section><!-- homepage-mask-intro:end -->';
const runtime = '<script src="homepage-mask-intro.js" data-homepage-mask-intro-runtime></script>';

html = html
  .replace(/<link[^>]+data-homepage-mask-intro-style[^>]*>/gi, '')
  .replace(/<link[^>]+data-homepage-mask-preload[^>]*>/gi, '')
  .replace(/<!-- homepage-mask-intro:start -->[\s\S]*?<!-- homepage-mask-intro:end -->/gi, '')
  .replace(/<script[^>]+data-homepage-mask-intro-runtime[^>]*><\/script>/gi, '');

if (!html.includes('</head>')) throw new Error('index.html has no closing head tag');
html = html.replace('</head>', `${preload}${cssLink}</head>`);

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
  preload: (html.match(/data-homepage-mask-preload/g) || []).length,
  runtime: (html.match(/data-homepage-mask-intro-runtime/g) || []).length,
  asset: (html.match(/assets\/homepage-mask\.webp/g) || []).length
};
const failures = [];
if (counts.overlay !== 1) failures.push(`expected one mask overlay, found ${counts.overlay}`);
if (counts.style !== 1) failures.push(`expected one mask stylesheet, found ${counts.style}`);
if (counts.preload !== 1) failures.push(`expected one mask preload, found ${counts.preload}`);
if (counts.runtime !== 1) failures.push(`expected one mask runtime, found ${counts.runtime}`);
if (counts.asset < 2) failures.push('mask asset is not both preloaded and rendered');
if (!html.includes('data-mask-intro-skip')) failures.push('skip control missing');

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), counts, required, failures };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(failure => console.error(`MASK INTRO FAILURE: ${failure}`));
  process.exit(1);
}
console.log('Homepage mask intro patched: 3.6-second hold, 1.2-second dissolve, once per session.');
