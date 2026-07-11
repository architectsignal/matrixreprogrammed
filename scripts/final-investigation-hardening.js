const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pulseFile = path.join(root, 'investigation-pulse.js');
const ignoredDirs = new Set(['.git', 'node_modules', '_site', '.wrangler']);
const internalPages = new Set([
  'review-dashboard.html', 'deploy-status.html', 'deploy-health.html', 'card-system-health.html', 'site-brain-router.html',
  'card-artwork-automation.html', 'card-artwork-queue.html', 'card-artwork-batches.html', 'information-gathering-system.html',
  'source-intake.html', 'update-monitor.html', 'distribution-center.html', 'launch-room.html', 'offer-center.html',
  'sales-ladder.html', 'schema-index.html', 'machine-index.html', 'campaign-calendar.html', 'card-art-studio.html',
  'funnel-book-path.html', 'monetisation-dashboard.html', 'site-population-audit.html',
  'speculative-conclusion-review-queue.html', 'thank-you-book-path.html'
]);
const report = { generatedAt: new Date().toISOString(), pagesScanned: 0, pulseInjected: 0, pulseRoutesNormalised: 0, noindexApplied: 0, internalLinksHidden: 0, cssPatched: false, pulseScriptPatched: false };

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}
function addNoindex(html) {
  if (/name=["']robots["']/i.test(html)) return html.replace(/<meta\b[^>]*name=["']robots["'][^>]*>/i, '<meta name="robots" content="noindex,nofollow,noarchive"/>');
  return html.includes('</head>') ? html.replace('</head>', '<meta name="robots" content="noindex,nofollow,noarchive"/></head>') : html;
}
function addInternalClass(tag) {
  if (/\bclass\s*=/.test(tag)) return tag.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (match, quote, classes) => `class=${quote}${classes} internal-only${quote}`);
  return tag.replace(/>$/, ' class="internal-only" data-internal-only="true">');
}
function hideInternalLinks(html) {
  return html.replace(/<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>/gi, (tag, quote, href) => {
    const clean = String(href).split(/[?#]/)[0].replace(/^\.\//, '').replace(/^\//, '');
    const base = path.basename(clean.endsWith('.html') ? clean : `${clean}.html`);
    if (!internalPages.has(base) || /\binternal-only\b/.test(tag)) return tag;
    report.internalLinksHidden += 1;
    return addInternalClass(tag);
  });
}
function pulseSrcFor(file) {
  let relative = path.relative(path.dirname(file), pulseFile).replace(/\\/g, '/');
  if (!relative || relative === '.') relative = 'investigation-pulse.js';
  return relative;
}
function injectPulse(html, file) {
  const desired = pulseSrcFor(file);
  const pulseTag = `<script src="${desired}"></script>`;
  const normalised = html.replace(/<script\b[^>]*src=(["'])(?:\/|(?:\.\.\/)*|\.\/)?investigation-pulse\.js\1[^>]*><\/script>/gi, pulseTag);
  if (normalised !== html) report.pulseRoutesNormalised += 1;
  html = normalised;
  if (html.includes(pulseTag)) return html;
  if (!html.includes('</body>')) return html;
  report.pulseInjected += 1;
  return html.replace('</body>', `${pulseTag}</body>`);
}

for (const file of walk(root)) {
  report.pagesScanned += 1;
  const base = path.basename(file);
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  if (internalPages.has(base)) {
    const next = addNoindex(html);
    if (next !== html) report.noindexApplied += 1;
    html = next;
  } else {
    html = hideInternalLinks(html);
    html = injectPulse(html, file);
  }
  if (html !== before) fs.writeFileSync(file, html);
}

if (fs.existsSync(pulseFile)) {
  let pulse = fs.readFileSync(pulseFile, 'utf8');
  const before = pulse;
  pulse = pulse
    .replace(/href=\"investigation-machine\.html\"/g, 'href=\"/investigation-machine.html\"')
    .replace(/href=\"daily-investigation-conclusions\.html\"/g, 'href=\"/daily-investigation-conclusions.html\"')
    .replace(/href=\"weekly-investigation-report\.html\"/g, 'href=\"/weekly-investigation-report.html\"')
    .replace(/href=\"investigation-source-ledger\.html\"/g, 'href=\"/investigation-source-ledger.html\"')
    .replace(/href=\"search\.html\"/g, 'href=\"/search.html\"');
  if (pulse !== before) {
    fs.writeFileSync(pulseFile, pulse);
    report.pulseScriptPatched = true;
  }
}

const cssPath = path.join(root, 'fixes.css');
if (fs.existsSync(cssPath)) {
  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('/* investigation-pulse */')) {
    css += `\n/* investigation-pulse */\n.investigation-pulse{margin:1.25rem auto;padding:.85rem 1rem;border:1px solid rgba(216,181,106,.35);border-radius:14px;background:rgba(0,0,0,.82);font-size:.9rem;line-height:1.55}.investigation-pulse a{color:#f0cf7a;text-decoration:underline}.investigation-pulse strong{letter-spacing:.04em}\n`;
    fs.writeFileSync(cssPath, css);
    report.cssPatched = true;
  }
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'final-investigation-hardening.json'), JSON.stringify(report, null, 2));
console.log(`Final investigation hardening: ${report.pagesScanned} HTML pages scanned, ${report.pulseInjected} pulse scripts injected, ${report.pulseRoutesNormalised} pulse routes normalised, ${report.noindexApplied} internal pages noindexed, ${report.internalLinksHidden} internal links hidden.`);
