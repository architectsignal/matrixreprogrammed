const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
function fail(message) { failures.push(message); }
function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { fail(`missing ${rel}`); return ''; }
  return fs.readFileSync(file, 'utf8');
}
function count(text, token) { return String(text).split(token).length - 1; }

const videoParts = ['assets/matrix-intro-video-1.txt', 'assets/matrix-intro-video-2.txt'];
const partText = videoParts.map(read);
if (partText.some(part => part.length < 1000)) fail('one or more video asset parts are unexpectedly small');
let decoded = Buffer.alloc(0);
try {
  decoded = Buffer.from(partText.join('').replace(/\s+/g, ''), 'base64');
  if (decoded.length < 10000) fail(`decoded intro video is unexpectedly small: ${decoded.length} bytes`);
  if (decoded.slice(4, 8).toString('ascii') !== 'ftyp') fail('decoded intro asset is not an MP4 file');
} catch (error) {
  fail(`intro video base64 could not be decoded: ${error.message}`);
}

const html = read('index.html');
const css = read('homepage-mask-intro.css');
const js = read('homepage-mask-intro.js');

for (const [token, expected] of [
  ['data-homepage-mask-intro data-mode="video"', 1],
  ['data-homepage-mask-intro-style', 1],
  ['data-homepage-mask-preload=', 0],
  ['data-homepage-mask-intro-runtime', 1],
  ['data-homepage-intro-video', 1],
  ['data-mask-intro-skip', 1]
]) {
  const actual = count(html, token);
  if (actual !== expected) fail(`expected ${expected} occurrence(s) of ${token}, found ${actual}`);
}

if (/<img[^>]+assets\/intro-eye\.svg/i.test(html)) fail('legacy eye image is still rendered');
if (/<img[^>]+assets\/intro-mask\.svg/i.test(html)) fail('legacy mask image is still rendered');
if (/<div[^>]+homepage-intro__burn/i.test(html)) fail('legacy burn layer is still rendered');
if (/<div[^>]+homepage-intro__embers/i.test(html)) fail('legacy ember layer is still rendered');

for (const marker of [
  'matrix-homepage-intro-seen-v3',
  'assets/matrix-intro-video-1.txt',
  'assets/matrix-intro-video-2.txt',
  'data:video/mp4;base64',
  'HTMLVideoElement',
  'video.defaultMuted = true',
  'video.playsInline = true',
  "video.addEventListener('ended'",
  'video-load-error',
  'Escape',
  '15000',
  'prepareWelcomeGate()'
]) {
  if (!js.includes(marker)) fail(`runtime is missing video marker: ${marker}`);
}
if (!js.includes('sessionStorage')) fail('intro is not limited to one display per session');

for (const marker of [
  '.homepage-mask-intro__video',
  'object-fit:contain',
  'intro-video-dissolve',
  '@media(prefers-reduced-motion:reduce)',
  'z-index:2147483000',
  '.homepage-intro__symbol,.homepage-intro__burn,.homepage-intro__embers'
]) {
  if (!css.includes(marker)) fail(`stylesheet is missing video marker: ${marker}`);
}

for (const rel of ['homepage-mask-intro.js', 'scripts/patch-homepage-mask-intro.js', 'scripts/patch-membership-tiers.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, rel)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${rel} syntax check failed: ${String(result.stderr || result.stdout).trim()}`);
}

/* The intro release test also protects the current cumulative membership surface. */
const membership = read('membership.html');
for (const marker of ['Free Member', '€0', '€3', '€6', '€9', 'paypal-membership.js', 'paypal-membership-status']) {
  if (!membership.includes(marker)) fail(`membership page missing ${marker}`);
}
for (const legacy of ['€19/month', '€49/month', 'Coming soon — no payment taken']) {
  if (membership.includes(legacy)) fail(`membership page still contains obsolete marker: ${legacy}`);
}
if (!membership.includes('Everything in Supporter and Free Member')) fail('Intelligence Member is not explicitly cumulative');
if (!membership.includes('Everything in Intelligence Member, Supporter and Free Member')) fail('Research Pro is not explicitly cumulative');
if (!membership.includes('Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.')) fail('membership page does not explain the server-side activation boundary');
for (const slot of ['paypal-button-supporter', 'paypal-button-intelligence', 'paypal-button-research_pro']) {
  if (!membership.includes(slot)) fail(`membership page missing ${slot}`);
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mode: 'video',
  asset: { parts: videoParts.length, decodedBytes: decoded.length, mp4: decoded.slice(4, 8).toString('ascii') === 'ftyp' },
  behavior: { mutedAutoplay: true, playsInline: true, skip: true, escape: true, sessionLimited: true, reducedMotionBypass: true, voiceGatePreserved: true },
  membership: { freeTier: true, paidPrices: [3, 6, 9], checkoutDefault: 'server-gated-disabled' },
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'homepage-mask-intro-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(item => console.error(`INTRO VIDEO RELEASE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Homepage video intro test passed (${decoded.length} decoded MP4 bytes); existing voice gate and membership surface verified.`);
