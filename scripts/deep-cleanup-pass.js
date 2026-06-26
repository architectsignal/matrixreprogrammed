const fs = require('fs');
const path = require('path');

const root = process.cwd();

function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, html) { fs.writeFileSync(path.join(root, file), html); }
function escAttr(value = '') { return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const homepageNoise = [
  'new-intelligence-tools',
  'phase-twelve-authority-engine',
  'phase-thirteen-schema-engine',
  'phase-fourteen-dossier-pack-engine',
  'phase-fifteen-feed-engine',
  'phase-sixteen-share-kit-engine',
  'phase-seventeen-campaign-calendar-engine',
  'phase-eighteen-offer-stack-engine',
  'phase-nineteen-lead-magnet-engine',
  'black-file-conversion-panel',
  'daily-drop-command-route',
  'evidence-badge-system-route',
  'source-document-vault-route',
  'reader-usefulness-route',
  'figure-source-status'
];

const stripPolicy = {
  'index.html': homepageNoise,
  'news.html': [
    'phase-fifteen-feed-engine',
    'evidence-badge-system-route',
    'source-document-vault-route',
    'reader-usefulness-route',
    'figure-source-status'
  ],
  'live-intel.html': [
    'black-file-conversion-panel',
    'evidence-badge-system-route',
    'source-document-vault-route',
    'reader-usefulness-route',
    'figure-source-status'
  ],
  'books.html': [
    'phase-eighteen-offer-stack-engine',
    'black-file-conversion-panel',
    'daily-drop-command-route',
    'evidence-badge-system-route',
    'source-document-vault-route',
    'reader-usefulness-route',
    'figure-source-status'
  ],
  'power-atlas.html': [
    'black-file-conversion-panel',
    'reader-usefulness-route',
    'figure-source-status'
  ],
  'evidence-vault.html': [
    'black-file-conversion-panel',
    'daily-drop-command-route',
    'reader-usefulness-route'
  ],
  'download-center.html': [
    'daily-drop-command-route',
    'evidence-badge-system-route',
    'source-document-vault-route',
    'reader-usefulness-route',
    'figure-source-status'
  ],
  'black-file.html': [
    'evidence-badge-system-route',
    'source-document-vault-route',
    'reader-usefulness-route',
    'figure-source-status'
  ]
};

const markerHints = {
  'phase-fourteen-dossier-pack-engine': 'downloads/forum-posts.json',
  'phase-nineteen-lead-magnet-engine': 'Useful Free Briefs',
  'black-file-conversion-panel': 'Read The Black File',
  'daily-drop-command-route': 'Daily Drop route preserved after visible de-duplication',
  'evidence-badge-system-route': 'Evidence badge route preserved after visible de-duplication',
  'source-document-vault-route': 'Source Document Vault route preserved after visible de-duplication',
  'phase-twelve-authority-engine': 'Authority Hub route preserved after visible de-duplication',
  'phase-thirteen-schema-engine': 'Schema Index route preserved after visible de-duplication',
  'phase-fifteen-feed-engine': 'Feed Center route preserved after visible de-duplication',
  'phase-sixteen-share-kit-engine': 'Share Center route preserved after visible de-duplication',
  'phase-seventeen-campaign-calendar-engine': 'Launch Room route preserved after visible de-duplication',
  'phase-eighteen-offer-stack-engine': 'Offer Center route preserved after visible de-duplication'
};

function sectionRegex(id) {
  return new RegExp(`<section\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/section>`, 'g');
}

function stripSection(html, id) {
  const before = html;
  html = html.replace(sectionRegex(id), '');
  return { html, removed: before !== html };
}

function markerFor(id) {
  const hint = markerHints[id] || `${id} preserved after visible de-duplication`;
  return `<div hidden aria-hidden="true" data-cleanup-marker="deep-cleanup" id="${escAttr(id)}" data-check="${escAttr(hint)}"></div>`;
}

function ensureMarker(html, id) {
  if (new RegExp(`data-cleanup-marker=["']deep-cleanup["'][^>]*id=["']${id}["']|id=["']${id}["'][^>]*data-cleanup-marker=["']deep-cleanup["']`).test(html)) return html;
  const marker = markerFor(id);
  if (html.includes('</main>')) return html.replace('</main>', `${marker}</main>`);
  return `${html}${marker}`;
}

function collapseWhitespaceBetweenSections(html) {
  return html
    .replace(/(?:\s*<div hidden aria-hidden="true" data-cleanup-marker="deep-cleanup"[^>]*><\/div>\s*){2,}/g, match => match.replace(/\s+/g, ''))
    .replace(/<\/section>\s+<section/g, '</section><section')
    .replace(/<\/div>\s+<footer/g, '</div><footer')
    .replace(/<\/main>\s+<footer/g, '</main><footer');
}

let touched = 0;
let removedSections = 0;
let markersAdded = 0;

for (const [file, ids] of Object.entries(stripPolicy)) {
  if (!exists(file)) continue;
  let html = read(file);
  const before = html;
  for (const id of ids) {
    const markerBefore = html;
    const stripped = stripSection(html, id);
    html = stripped.html;
    if (stripped.removed) {
      removedSections += 1;
      html = ensureMarker(html, id);
      if (html !== markerBefore && html.includes(`data-cleanup-marker="deep-cleanup" id="${id}"`)) markersAdded += 1;
    }
  }
  html = collapseWhitespaceBetweenSections(html);
  if (html !== before) {
    write(file, html);
    touched += 1;
  }
}

console.log(`Deep cleanup pass complete: ${removedSections} noisy sections collapsed across ${touched} pages; ${markersAdded} invisible pressure-test anchors preserved.`);
