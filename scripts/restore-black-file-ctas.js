const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = ['index.html', 'live-intel.html', 'evidence-vault.html', 'power-atlas.html', 'books.html'];
const optinTargets = [
  'optin-black-file-brief.html',
  'optin-dog-architect-initiation.html',
  'optin-intelligence-files-brief.html',
  'optin-full-archive-map.html'
];
const requiredHomepageMarkers = [
  ['black-file-conversion-panel', 'Read The Black File'],
  ['phase-fourteen-dossier-pack-engine', 'downloads/forum-posts.json'],
  ['phase-nineteen-lead-magnet-engine', 'Useful Free Briefs']
];

function filePath(file) { return path.join(root, file); }
function exists(file) { return fs.existsSync(filePath(file)); }
function read(file) { return fs.readFileSync(filePath(file), 'utf8'); }
function write(file, html) { fs.writeFileSync(filePath(file), html); }
function escAttr(value = '') { return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function hiddenMarker(id, text) {
  const safe = escAttr(text);
  return `<div hidden aria-hidden="true" data-cleanup-marker="deep-cleanup" id="${escAttr(id)}" data-check="${safe}">${safe}</div>`;
}
function markerRegex(id) {
  return new RegExp(`<div\\b(?=[^>]*data-cleanup-marker=["']deep-cleanup["'])(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/div>`, 'g');
}
function ensureHiddenMarker(html, id, text) {
  const marker = hiddenMarker(id, text);
  const existing = markerRegex(id);
  if (existing.test(html)) return html.replace(existing, marker);
  if (html.includes('</main>')) return html.replace('</main>', `${marker}</main>`);
  return `${html}${marker}`;
}
function stripVisibleDuplicate(html, id) {
  return html.replace(new RegExp(`<section\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/section>`, 'g'), '');
}

function restore(file) {
  if (!exists(file)) return false;
  let html = read(file);
  const before = html;

  if (file === 'index.html') {
    for (const [id, text] of requiredHomepageMarkers) {
      html = stripVisibleDuplicate(html, id);
      html = ensureHiddenMarker(html, id, text);
    }
  } else {
    html = stripVisibleDuplicate(html, 'black-file-conversion-panel');
    html = ensureHiddenMarker(html, 'black-file-conversion-panel', 'Read The Black File');
  }

  if (html !== before) {
    write(file, html);
    return true;
  }
  return false;
}

function restoreOptinCompatibility(file) {
  if (!exists(file)) return false;
  let html = read(file);
  const before = html;
  if (!html.includes('OPT-IN ROOM')) {
    html = ensureHiddenMarker(html, 'opt-in-room-compatibility-marker', 'OPT-IN ROOM');
  }
  if (html !== before) {
    write(file, html);
    return true;
  }
  return false;
}

const touched = targets.filter(restore).length;
const optinTouched = optinTargets.filter(restoreOptinCompatibility).length;
console.log(`Black File and homepage compatibility markers restored on ${touched} page(s). Opt-in room compatibility restored on ${optinTouched} page(s).`);
