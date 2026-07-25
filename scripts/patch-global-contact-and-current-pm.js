const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const rootExcluded = new Set(['.git', 'node_modules', '_site', 'downloads', '.wrangler']);
const siteExcluded = new Set([]);
const currentPm = {
  name: 'Andy Burnham',
  styledName: 'The Rt Hon Andy Burnham MP',
  office: 'Prime Minister of the United Kingdom',
  inOfficeSince: '2026-07-20',
  checked: '2026-07-25',
  source: 'https://www.gov.uk/government/ministers/prime-minister'
};

function walk(dir, excluded, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, excluded, out);
    else out.push(full);
  }
  return out;
}

function relativeHref(file, targetRoot, target) {
  const rel = path.relative(path.dirname(file), path.join(targetRoot, target)).replace(/\\/g, '/');
  return rel || target;
}

function patchNavigation(file, html, targetRoot) {
  if (!/\.html$/i.test(file) || /contact-the-machine\.html$/i.test(file)) return html;
  const href = relativeHref(file, targetRoot, 'contact-the-machine.html');
  const contact = `<a href="${href}">Contact</a>`;
  let changed = false;
  html = html.replace(/(<div\s+class=["'][^"']*\bnav-primary\b[^"']*["'][^>]*>)([\s\S]*?)(<\/div>)/i, (match, open, body, close) => {
    if (/href=["'][^"']*contact-the-machine\.html["']/i.test(body)) return match;
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
      if (/href=["'][^"']*contact-the-machine\.html["']/i.test(body)) return match;
      changed = true;
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

function patchTree(baseDir, excluded, targetRoot, label) {
  const navTouched = [];
  const pmTouched = [];
  for (const file of walk(baseDir, excluded)) {
    const ext = path.extname(file).toLowerCase();
    if (!['.html', '.json', '.js', '.md'].includes(ext)) continue;
    const before = fs.readFileSync(file, 'utf8');
    let after = before;
    if (ext === '.html') {
      const navPatched = patchNavigation(file, after, targetRoot);
      if (navPatched !== after) navTouched.push(path.relative(baseDir, file).replace(/\\/g, '/'));
      after = navPatched;
    }
    if (ext === '.json') {
      try {
        const parsed = JSON.parse(after);
        const patched = patchJson(parsed);
        const rendered = JSON.stringify(patched, null, 2) + '\n';
        if (rendered !== after && /keir starmer|currentPrimeMinister/i.test(after)) {
          after = rendered;
          pmTouched.push(path.relative(baseDir, file).replace(/\\/g, '/'));
        }
      } catch {
        const patched = patchCurrentPmText(after);
        if (patched !== after) pmTouched.push(path.relative(baseDir, file).replace(/\\/g, '/'));
        after = patched;
      }
    } else {
      const patched = patchCurrentPmText(after);
      if (patched !== after) pmTouched.push(path.relative(baseDir, file).replace(/\\/g, '/'));
      after = patched;
    }
    if (after !== before) fs.writeFileSync(file, after);
  }
  return { label, navTouched, pmTouched };
}

const sourceResult = patchTree(root, rootExcluded, root, 'source');
const siteResult = fs.existsSync(site) ? patchTree(site, siteExcluded, site, 'deployable') : { label: 'deployable', navTouched: [], pmTouched: [] };

const officeHolderPath = path.join(root, 'data', 'current-uk-prime-minister.json');
fs.mkdirSync(path.dirname(officeHolderPath), { recursive: true });
fs.writeFileSync(officeHolderPath, JSON.stringify(currentPm, null, 2) + '\n');
if (fs.existsSync(site)) {
  const builtOfficeHolderPath = path.join(site, 'data', 'current-uk-prime-minister.json');
  fs.mkdirSync(path.dirname(builtOfficeHolderPath), { recursive: true });
  fs.copyFileSync(officeHolderPath, builtOfficeHolderPath);
}

const indexPath = path.join(root, 'index.html');
const builtIndexPath = path.join(site, 'index.html');
const sourceIndexOk = fs.existsSync(indexPath) && /nav-primary[\s\S]*contact-the-machine\.html/i.test(fs.readFileSync(indexPath, 'utf8'));
const builtIndexOk = !fs.existsSync(site) || (fs.existsSync(builtIndexPath) && /nav-primary[\s\S]*contact-the-machine\.html/i.test(fs.readFileSync(builtIndexPath, 'utf8')));
if (!sourceIndexOk || !builtIndexOk) throw new Error('Contact navigation did not survive on the source and deployable homepage');

const reportPath = path.join(root, 'downloads', 'contact-nav-current-pm-report.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  contactRoute: 'contact-the-machine.html',
  sourceContactNavigationFilesUpdated: sourceResult.navTouched,
  deployableContactNavigationFilesUpdated: siteResult.navTouched,
  currentPrimeMinister: currentPm,
  sourcePrimeMinisterFilesUpdated: [...new Set(sourceResult.pmTouched)],
  deployablePrimeMinisterFilesUpdated: [...new Set(siteResult.pmTouched)],
  homepageChecks: { source: sourceIndexOk, deployable: builtIndexOk }
}, null, 2) + '\n');

console.log(`Contact navigation added to ${sourceResult.navTouched.length} source pages and ${siteResult.navTouched.length} deployable pages; current UK Prime Minister patches applied to ${new Set([...sourceResult.pmTouched, ...siteResult.pmTouched]).size} files.`);
