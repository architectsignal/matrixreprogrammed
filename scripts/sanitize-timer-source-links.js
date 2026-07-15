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

const before = fs.readFileSync(timerPath, 'utf8');
const rejected = [];
const after = before.replace(/<a\s+href=(['"])(.*?)\1([^>]*)>([\s\S]*?)<\/a>/gi, (match, quote, href, attributes, body) => {
  if (validHref(href)) return match;
  rejected.push({ href: String(href).trim(), text: String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
  return `<span class="clock-source-note" title="Source route withheld because it was not a valid URL or local route">${body}</span>`;
});

fs.writeFileSync(timerPath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  updated: new Date().toISOString(),
  purpose: 'Prevent free-text source instructions from being emitted as hyperlinks on the public timer page.',
  rejectedCount: rejected.length,
  rejected
}, null, 2));

console.log(`Timer source-link sanitization complete: ${rejected.length} invalid route(s) converted to plain text.`);
