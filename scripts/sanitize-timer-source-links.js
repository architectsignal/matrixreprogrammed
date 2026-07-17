const fs = require('fs');
const path = require('path');

const root = process.cwd();
const timerPath = path.join(root, 'timers.html');
const reportPath = path.join(root, 'data', 'timer-link-sanitization.json');

if (!fs.existsSync(timerPath)) throw new Error('timers.html is required before timer-link sanitization');

function validHref(value) {
  const href = String(value || '').trim();
  if (!href || /^javascript:/i.test(href) || /\s/.test(href)) return false;
  if (/^https?:\/\//i.test(href)) return true;
  if (/^(?:\.\.\/|\.\/|\/)?[a-z0-9][a-z0-9_./%:+?&=#~-]*$/i.test(href)) return true;
  return false;
}
function cleanLocal(value) {
  return String(value || '').split('#')[0].split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
}
function localTargetExists(value) {
  const clean = cleanLocal(value);
  if (!clean) return true;
  const direct = path.join(root, clean);
  const candidates = [direct];
  if (!path.extname(direct)) candidates.push(`${direct}.html`, path.join(direct, 'index.html'));
  return candidates.some(candidate => fs.existsSync(candidate));
}
function labelFromEntityRoute(value, body) {
  const clean = cleanLocal(value);
  const match = clean.match(/^entity-(?:briefs|exposure)\/([^/]+?)(?:\.html)?$/i);
  if (!match) return String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return decodeURIComponent(match[1]).replace(/-mapmdref$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const before = fs.readFileSync(timerPath, 'utf8');
const rejected = [];
const repaired = [];
const after = before.replace(/<a\s+href=(['"])(.*?)\1([^>]*)>([\s\S]*?)<\/a>/gi, (match, quote, href, attributes, body) => {
  const route = String(href).trim();
  if (!validHref(route)) {
    rejected.push({ href: route, text: String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), reason: 'invalid-syntax' });
    return `<span class="clock-source-note" title="Source route withheld because it was not a valid URL or local route">${body}</span>`;
  }
  if (/^https?:\/\//i.test(route) || localTargetExists(route)) return match;
  if (/^(?:\.\.\/|\.\/|\/)?entity-(?:briefs|exposure)\//i.test(route)) {
    const label = labelFromEntityRoute(route, body);
    const replacement = `search.html?q=${encodeURIComponent(label)}`;
    repaired.push({ href: route, replacement, label, reason: 'missing-generated-entity-route' });
    return `<a href="${replacement}"${attributes}>${body}</a>`;
  }
  rejected.push({ href: route, text: String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), reason: 'missing-local-target' });
  return `<span class="clock-source-note" title="Source route withheld because the local target was not generated">${body}</span>`;
});

fs.writeFileSync(timerPath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  updated: new Date().toISOString(),
  purpose: 'Prevent free-text or stale generated source instructions from being emitted as broken hyperlinks on the public timer page.',
  rejectedCount: rejected.length,
  repairedCount: repaired.length,
  rejected,
  repaired
}, null, 2));

console.log(`Timer source-link sanitization complete: ${rejected.length} invalid/missing route(s) converted to plain text; ${repaired.length} stale entity route(s) redirected to search.`);
