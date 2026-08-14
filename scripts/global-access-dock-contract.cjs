'use strict';

const STYLE_MARKER = 'data-matrix-access-dock-asset="style"';
const SCRIPT_MARKER = 'data-matrix-access-dock-asset="script"';
const STYLE_TAG = `<link rel="stylesheet" href="/matrix-access-dock.css" ${STYLE_MARKER}>`;
const SCRIPT_TAG = `<script src="/matrix-access-dock.js" defer ${SCRIPT_MARKER}></script>`;

function count(text, needle) {
  return String(text).split(needle).length - 1;
}

function injectBefore(html, closingPattern, tag) {
  const match = closingPattern.exec(html);
  if (!match) return `${html}${tag}`;
  return `${html.slice(0, match.index)}${tag}${html.slice(match.index)}`;
}

function injectGlobalAccessDock(document) {
  let html = String(document || '');
  if (!html.includes(STYLE_MARKER)) {
    html = injectBefore(html, /<\/head\s*>/i, STYLE_TAG);
  }
  if (!html.includes(SCRIPT_MARKER)) {
    html = injectBefore(html, /<\/body\s*>/i, SCRIPT_TAG);
  }
  return html;
}

function auditGlobalAccessDock(document) {
  const html = String(document || '');
  const styleCount = count(html, STYLE_MARKER);
  const scriptCount = count(html, SCRIPT_MARKER);
  return {
    ok: styleCount === 1 && scriptCount === 1,
    styleCount,
    scriptCount
  };
}

module.exports = {
  SCRIPT_MARKER,
  SCRIPT_TAG,
  STYLE_MARKER,
  STYLE_TAG,
  auditGlobalAccessDock,
  injectGlobalAccessDock
};
