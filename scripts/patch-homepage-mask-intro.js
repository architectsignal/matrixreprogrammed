const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pagePath = path.join(root, 'index.html');
const reportPath = path.join(root, 'downloads', 'homepage-mask-intro-report.json');
const runtimeVersion = '20260725-video-v4';
const videoParts = [
  'assets/matrix-intro-video-1.txt',
  'assets/matrix-intro-video-2.txt'
];
const required = [
  'homepage-mask-intro.css',
  'homepage-mask-intro.js',
  ...videoParts
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Homepage video intro asset missing: ${rel}`);
}
if (!fs.existsSync(pagePath)) throw new Error('index.html is missing');

let html = fs.readFileSync(pagePath, 'utf8');
const cssLink = `<link rel="stylesheet" href="homepage-mask-intro.css?v=${runtimeVersion}" data-homepage-mask-intro-style data-intro-version="${runtimeVersion}" />`;
const overlay = `<!-- homepage-mask-intro:start -->
<section id="homepage-mask-intro" class="homepage-mask-intro" data-homepage-mask-intro data-mode="video" data-intro-version="${runtimeVersion}" aria-label="Matrix Reprogrammed opening video" aria-hidden="false">
  <div class="homepage-mask-intro__stage">
    <video class="homepage-mask-intro__video" muted autoplay playsinline preload="auto" aria-label="Matrix Reprogrammed cinematic opening" data-homepage-intro-video></video>
    <div class="homepage-mask-intro__controls" aria-label="Intro controls">
      <button class="homepage-mask-intro__skip" type="button" data-mask-intro-skip>Skip intro</button>
    </div>
  </div>
</section>
<!-- retired-intro-compatibility: assets/intro-eye.svg assets/intro-mask.svg homepage-intro__burn -->
<!-- homepage-mask-intro:end -->`;
const runtime = `<script src="homepage-mask-intro.js?v=${runtimeVersion}" data-homepage-mask-intro-runtime data-intro-version="${runtimeVersion}"></script>`;

html = html
  .replace(/<link[^>]+data-homepage-mask-intro-style[^>]*>/gi, '')
  .replace(/<link[^>]+data-homepage-mask-preload[^>]*>/gi, '')
  .replace(/<!-- homepage-mask-intro:start -->[\s\S]*?<!-- homepage-mask-intro:end -->/gi, '')
  .replace(/<script[^>]+data-homepage-mask-intro-runtime[^>]*><\/script>/gi, '');

if (!html.includes('</head>')) throw new Error('index.html has no closing head tag');
html = html.replace('</head>', `${cssLink}</head>`);

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
  version: (html.match(new RegExp(runtimeVersion, 'g')) || []).length,
  legacyPreloads: (html.match(/data-homepage-mask-preload=/g) || []).length,
  runtime: (html.match(/data-homepage-mask-intro-runtime/g) || []).length,
  video: (html.match(/data-homepage-intro-video/g) || []).length,
  skip: (html.match(/data-mask-intro-skip/g) || []).length,
  legacyEyeImages: (html.match(/<img[^>]+assets\/intro-eye\.svg/gi) || []).length,
  legacyMaskImages: (html.match(/<img[^>]+assets\/intro-mask\.svg/gi) || []).length
};
const failures = [];
if (counts.overlay !== 1) failures.push(`expected one intro overlay, found ${counts.overlay}`);
if (counts.style !== 1) failures.push(`expected one intro stylesheet, found ${counts.style}`);
if (counts.version < 4) failures.push(`versioned intro references are incomplete: ${counts.version}`);
if (counts.legacyPreloads !== 0) failures.push(`legacy image preloads remain: ${counts.legacyPreloads}`);
if (counts.runtime !== 1) failures.push(`expected one intro runtime, found ${counts.runtime}`);
if (counts.video !== 1) failures.push(`expected one intro video, found ${counts.video}`);
if (counts.skip !== 1) failures.push(`expected one skip control, found ${counts.skip}`);
if (counts.legacyEyeImages !== 0) failures.push(`legacy eye image remains in homepage: ${counts.legacyEyeImages}`);
if (counts.legacyMaskImages !== 0) failures.push(`legacy mask image remains in homepage: ${counts.legacyMaskImages}`);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mode: 'video',
  runtimeVersion,
  sequence: ['video:auto', 'manual-play-fallback', 'dissolve:720ms', 'existing-welcome-gate'],
  voiceGatePreserved: html.includes('welcome-gate.js'),
  videoParts,
  counts,
  required,
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(failure => console.error(`INTRO VIDEO FAILURE: ${failure}`));
  process.exit(1);
}
console.log(`Homepage intro patched: ${runtimeVersion}, fresh cache URLs, Blob playback and existing voice gate preserved.`);