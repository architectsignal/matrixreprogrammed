const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const htmlPath = path.join(root, 'ai-speculative-conclusions.html');
const reportPath = path.join(root, 'downloads', 'review-queue-speculation-page-patch.json');

function patchHtml(source) {
  let html = source;
  if (!html.includes('review-queue-auto-publication-v1')) {
    html = html.replace('</style>', `.spec-card[data-status="unverified"]{border:2px solid #e6a23c;background:linear-gradient(145deg,rgba(106,58,0,.25),rgba(0,0,0,.96))}.spec-auto-warning{display:grid;gap:.25rem;border:2px solid #e6a23c;background:#2c1700;color:#ffe5ae;border-radius:12px;padding:.8rem;margin-bottom:.85rem}.spec-auto-warning strong{letter-spacing:.04em}.spec-badge-alert{border-color:#e6a23c;color:#ffd17a}.spec-auto-published h3{color:#ffd17a}/* review-queue-auto-publication-v1 */</style>`);
  }
  html = html.replace(
    'This page publishes machine-generated hypotheses separately from verified intelligence. Every conclusion must show its document link, contrary evidence, missing proof, confidence band and falsification conditions.',
    'This page publishes machine-generated hypotheses separately from verified intelligence. Items entering the editorial review queue are published here automatically as UNVERIFIED SPECULATION, with failed gates, contrary evidence, missing proof and falsification conditions visible.'
  );
  if (!html.includes('Review queue publication rule:')) {
    html = html.replace(
      '<strong>Hard boundary:</strong> These are not established facts, accusations or findings of wrongdoing. Association is not guilt. A person appearing in a file, address book, flight log, email, photograph, court filing or institutional record does not by itself establish misconduct.',
      '<strong>Hard boundary:</strong> These are not established facts, accusations or findings of wrongdoing. Association is not guilt. A person appearing in a file, address book, flight log, email, photograph, court filing or institutional record does not by itself establish misconduct.<br><br><strong>Review queue publication rule:</strong> anything held for review is published only on this quarantined page and must carry the visible label <em>AUTO-PUBLISHED FROM REVIEW QUEUE — UNVERIFIED SPECULATION</em>.'
    );
  }
  if (!html.includes('data-filter="unverified"')) {
    html = html.replace(
      '<button type="button" data-filter="developing">Developing</button>',
      '<button type="button" data-filter="developing">Developing</button><button type="button" data-filter="unverified">Unverified review queue</button>'
    );
  }
  html = html.replace(
    'The AI may publish only to this labelled page when the record passes the structured schema and contains public source routes, explicit uncertainty, counter-evidence, missing records and the statement that criminal conduct is not established.',
    'The AI publishes every editorial-review item to this labelled page as unverified speculation. It may not promote those items to verified evidence, accusation, alarm ranking or confirmed conclusion. Private and sensitive material remains blocked.'
  );
  return html;
}

if (!fs.existsSync(htmlPath)) throw new Error('ai-speculative-conclusions.html is missing');
const original = fs.readFileSync(htmlPath, 'utf8');
const patched = patchHtml(original);
fs.writeFileSync(htmlPath, patched);

const synchronized = [
  'ai-speculative-conclusions.html',
  'ai-speculative-conclusions.js',
  'data/ai-speculative-conclusions.json',
  'data/ai-speculative-conclusions.schema.json',
  'downloads/ai-speculative-conclusions-policy.md'
];
if (fs.existsSync(site)) {
  for (const relative of synchronized) {
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) continue;
    const target = path.join(site, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    if (relative.endsWith('.html')) {
      const extensionless = path.join(site, relative.replace(/\.html$/i, ''));
      if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless);
    }
  }
}
let generatedAt = '1970-01-01T00:00:00.000Z';
try { generatedAt = JSON.parse(fs.readFileSync(path.join(root, 'data', 'ai-speculative-conclusions.json'), 'utf8')).updated || generatedAt; } catch {}
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt,
  pagePatched: true,
  synchronized,
  requiredLabel: 'AUTO-PUBLISHED FROM REVIEW QUEUE — UNVERIFIED SPECULATION',
  factualPromotionAllowed: false
}, null, 2) + '\n');
console.log('Review-queue speculation page patched and synchronized.');
