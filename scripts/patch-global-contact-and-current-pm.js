const fs = require('fs');
const path = require('path');

const root = process.cwd();
const excluded = new Set(['.git', 'node_modules', '_site', 'downloads', '.wrangler']);
const currentPm = {
  name: 'Andy Burnham',
  styledName: 'The Rt Hon Andy Burnham MP',
  office: 'Prime Minister of the United Kingdom',
  inOfficeSince: '2026-07-20',
  checked: '2026-07-24',
  source: 'https://www.gov.uk/government/ministers/prime-minister'
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function relativeHref(file, target) {
  const rel = path.relative(path.dirname(file), path.join(root, target)).replace(/\\/g, '/');
  return rel || target;
}

function patchNavigation(file, html) {
  if (!/\.html$/i.test(file) || /contact-the-machine\.html$/i.test(file)) return html;
  if (/href=["'][^"']*contact-the-machine\.html["']/i.test(html)) return html;
  const href = relativeHref(file, 'contact-the-machine.html');
  const contact = `<a href="${href}">Contact</a>`;
  let changed = false;
  html = html.replace(/(<div\s+class=["'][^"']*\bnav-primary\b[^"']*["'][^>]*>)([\s\S]*?)(<\/div>)/i, (match, open, body, close) => {
    changed = true;
    if (/<a\b[^>]*href=["'][^"']*search\.html["']/i.test(body)) {
      body = body.replace(/(<a\b[^>]*href=["'][^"']*search\.html["'][^>]*>)/i, `${contact}$1`);
    } else {
      body += contact;
    }
    return open + body + close;
  });
  if (!changed) {
    html = html.replace(/(<nav\b[^>]*aria-label=["']Primary navigation["'][^>]*>)([\s\S]*?)(<\/nav>)/i, (match, open, body, close) => {
      if (/contact-the-machine\.html/i.test(body)) return match;
      return open + body + contact + close;
    });
  }
  return html;
}

function patchCurrentPmText(text) {
  const replacements = [
    [/current\s+(?:UK|British|United Kingdom)\s+Prime Minister\s+(?:Sir\s+)?Keir Starmer/gi, `current UK Prime Minister ${currentPm.name}`],
    [/(?:UK|British|United Kingdom)\s+Prime Minister\s+(?:Sir\s+)?Keir Starmer\s+\(current\)/gi, `UK Prime Minister ${currentPm.name} (current)`],
    [/current\s+Prime Minister\s+(?:Sir\s+)?Keir Starmer/gi, `current Prime Minister ${currentPm.name}`],
    [/Prime Minister\s+(?:Sir\s+)?Keir Starmer\s+since\s+5\s+July\s+2024/gi, `Prime Minister ${currentPm.name} since 20 July 2026`],
    [/The Rt Hon Sir Keir Starmer KCB KC MP(?=[^\n]{0,140}\bcurrent\b[^\n]{0,140}\bPrime Minister\b)/gi, currentPm.styledName],
    [/(\bcurrent(?:ly)?\b[^.\n]{0,120}\bPrime Minister\b[^.\n]{0,60})\bKeir Starmer\b/gi, `$1${currentPm.name}`],
    [/(\bPrime Minister\b[^.\n]{0,60})\bKeir Starmer\b([^.\n]{0,120}\bcurrent(?:ly)?\b)/gi, `$1${currentPm.name}$2`]
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text;
}

function patchJson(value) {
  if (Array.isArray(value)) return value.map(patchJson);
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, item] of Object.entries(value)) next[key] = patchJson(item);
  const role = String(next.role || next.office || next.position || next.title || '').toLowerCase();
  const status = String(next.status || next.state || '').toLowerCase();
  const explicitlyCurrent = next.current === true || next.isCurrent === true || /\bcurrent|active|incumbent\b/.test(status);
  if (explicitlyCurrent && /prime minister/.test(role) && /^(sir\s+)?keir starmer$/i.test(String(next.name || ''))) {
    next.name = currentPm.name;
    if ('styledName' in next) next.styledName = currentPm.styledName;
    if ('since' in next) next.since = currentPm.inOfficeSince;
    if ('startDate' in next) next.startDate = currentPm.inOfficeSince;
    next.checked = currentPm.checked;
    next.sourceUrl = next.sourceUrl || currentPm.source;
  }
  if (typeof next.currentPrimeMinister === 'string' && /keir starmer/i.test(next.currentPrimeMinister)) {
    next.currentPrimeMinister = currentPm.name;
    next.currentPrimeMinisterSince = currentPm.inOfficeSince;
    next.currentPrimeMinisterSource = currentPm.source;
  }
  return next;
}

const files = walk(root);
const navTouched = [];
const pmTouched = [];
for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (!['.html', '.json', '.js', '.md'].includes(ext)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  if (ext === '.html') {
    const navPatched = patchNavigation(file, after);
    if (navPatched !== after) navTouched.push(path.relative(root, file).replace(/\\/g, '/'));
    after = navPatched;
  }
  if (ext === '.json') {
    try {
      const parsed = JSON.parse(after);
      const patched = patchJson(parsed);
      const rendered = JSON.stringify(patched, null, 2) + '\n';
      if (rendered !== after && /keir starmer|currentPrimeMinister/i.test(after)) {
        after = rendered;
        pmTouched.push(path.relative(root, file).replace(/\\/g, '/'));
      }
    } catch {
      const patched = patchCurrentPmText(after);
      if (patched !== after) pmTouched.push(path.relative(root, file).replace(/\\/g, '/'));
      after = patched;
    }
  } else {
    const patched = patchCurrentPmText(after);
    if (patched !== after) pmTouched.push(path.relative(root, file).replace(/\\/g, '/'));
    after = patched;
  }
  if (after !== before) fs.writeFileSync(file, after);
}

const officeHolderPath = path.join(root, 'data', 'current-uk-prime-minister.json');
fs.mkdirSync(path.dirname(officeHolderPath), { recursive: true });
fs.writeFileSync(officeHolderPath, JSON.stringify(currentPm, null, 2) + '\n');

const reportPath = path.join(root, 'downloads', 'contact-nav-current-pm-report.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  contactRoute: 'contact-the-machine.html',
  contactNavigationFilesUpdated: navTouched,
  currentPrimeMinister: currentPm,
  primeMinisterFilesUpdated: [...new Set(pmTouched)]
}, null, 2) + '\n');

console.log(`Contact navigation added to ${navTouched.length} pages; current UK Prime Minister patches applied to ${new Set(pmTouched).size} files.`);
