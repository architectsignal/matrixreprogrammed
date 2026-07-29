const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const site = path.join(root, '_site');
const payloadDir = path.join(__dirname, 'power-family-payload');
const payloadBase64 = fs.readdirSync(payloadDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(payloadDir, name), 'utf8').trim())
  .join('');

const outputs = JSON.parse(
  zlib.gunzipSync(Buffer.from(payloadBase64, 'base64')).toString('utf8')
);

function write(relativePath, content, base) {
  const target = path.join(base, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.endsWith('\n') ? content : `${content}\n`);
  if (base === site && relativePath.endsWith('.html')) {
    const extensionless = path.join(base, relativePath.replace(/\.html$/i, ''));
    if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) {
      fs.copyFileSync(target, extensionless);
    }
  }
}

function ensureSectionAnchor(html, sectionId, anchorId) {
  if (html.includes(`id="${anchorId}"`) || html.includes(`id='${anchorId}'`)) return html;
  const section = new RegExp(`(<section\\b[^>]*\\bid=["']${sectionId}["'][^>]*>)`, 'i');
  if (!section.test(html)) {
    throw new Error(`behind-the-curtain-capstone.html missing section required for ${anchorId}: ${sectionId}`);
  }
  return html.replace(section, `$1<span id="${anchorId}" aria-hidden="true"></span>`);
}

function canonicalizeOutput(relativePath, content) {
  if (relativePath !== 'behind-the-curtain-capstone.html') return content;
  let html = String(content)
    .replace(/\s*<script\s+src=["']search-system\.js["']\s*><\/script>/gi, '')
    .replace(/\n{3,}/g, '\n\n');
  html = ensureSectionAnchor(html, 'current-map', 'wallenberg-ecosystem');
  html = ensureSectionAnchor(html, 'institutional', 'investor-board');
  html = ensureSectionAnchor(html, 'capital', 'investor-ownership');
  return html;
}

for (const [relativePath, rawContent] of Object.entries(outputs)) {
  const content = canonicalizeOutput(relativePath, rawContent);
  write(relativePath, content, root);
  if (fs.existsSync(site)) write(relativePath, content, site);
}

const contracts = [
  ['behind-the-curtain-capstone.html', [
    'POWER-FAMILY INTELLIGENCE LAYER',
    'id="current-map"',
    'id="wallenberg-ecosystem"',
    'id="institutional"',
    'id="investor-board"',
    'id="capital"',
    'id="investor-ownership"',
    'id="directory"',
    'id="claims"',
    'id="questions"',
    'power-family-intelligence-layer.js'
  ]],
  ['power-family-intelligence-layer.js', [
    'Proximity-to-Power Assessment',
    'familyPersonLinks',
    'localStorage',
    'data-open-person',
    'fails closed'
  ]],
  ['data/power-family-intelligence-layer.json', [
    'Documented Fact',
    'Deep Speculation',
    'reviewTriggers',
    'monitoringTargets'
  ]]
];

for (const [relativePath, needles] of contracts) {
  const text = fs.readFileSync(path.join(root, relativePath), 'utf8');
  for (const needle of needles) {
    if (!text.includes(needle)) {
      throw new Error(`${relativePath} missing required contract: ${needle}`);
    }
  }
  if (relativePath === 'behind-the-curtain-capstone.html' && text.includes('search-system.js')) {
    throw new Error('behind-the-curtain-capstone.html contains obsolete missing runtime search-system.js');
  }
  if (fs.existsSync(site)) {
    const deployed = fs.readFileSync(path.join(site, relativePath), 'utf8');
    for (const needle of needles) {
      if (!deployed.includes(needle)) throw new Error(`_site/${relativePath} missing required contract: ${needle}`);
    }
    if (relativePath === 'behind-the-curtain-capstone.html' && deployed.includes('search-system.js')) {
      throw new Error('_site/behind-the-curtain-capstone.html contains obsolete missing runtime search-system.js');
    }
  }
}

JSON.parse(fs.readFileSync(path.join(root, 'data/power-family-intelligence-layer.json'), 'utf8'));
if (fs.existsSync(site)) JSON.parse(fs.readFileSync(path.join(site, 'data/power-family-intelligence-layer.json'), 'utf8'));
console.log(`Power-Family Intelligence Layer generated, canonicalized, validated and ${fs.existsSync(site) ? 'synchronized to _site' : 'prepared for the site build'}.`);
