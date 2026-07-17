const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const bases = [root, site].filter((value, index, all) => fs.existsSync(value) && all.indexOf(value) === index);
const changed = [];
const removed = [];
const checks = [];

function display(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function patch(base, relative, transform) {
  const file = path.join(base, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(display(file));
  }
}
function patchAliases(base, htmlRoute, transform) {
  patch(base, htmlRoute, transform);
  patch(base, htmlRoute.replace(/\.html$/i, ''), transform);
}
function remove(base, relative) {
  const file = path.join(base, relative);
  if (!fs.existsSync(file)) return;
  fs.rmSync(file, { recursive: true, force: true });
  removed.push(display(file));
}
function epsteinForm() {
  return `<form id="epstein-source-intake-form" class="ep-card" method="post" action="/submit-forum-post"><input type="hidden" name="board" value="main"/><input type="hidden" name="category" value="Epstein Source Intake"/><input type="hidden" name="title" value="Epstein Source Intake Lead"/><input type="hidden" name="body" value=""/><div class="form-grid"><label>Submitter name optional<input name="name" maxlength="80" autocomplete="name"/></label><label>Email optional<input name="email" type="email" maxlength="240" autocomplete="email"/></label><label>Source URL<input name="sourceUrl" type="url" placeholder="https://..."/></label><label>Document title<input name="leadTitle" maxlength="180" required/></label><label>Source type<select name="sourceType" required><option value="flight log">Flight log</option><option value="address book">Address book</option><option value="phone book">Phone book</option><option value="calendar">Calendar</option><option value="email">Email</option><option value="court filing">Court filing</option><option value="deposition">Deposition</option><option value="transcript">Transcript</option><option value="exhibit">Exhibit</option><option value="official record">Official record</option><option value="settlement document">Settlement document</option><option value="judgment">Judgment</option><option value="civil complaint">Civil complaint</option><option value="financial record">Financial record</option><option value="property record">Property record</option><option value="company record">Company record</option><option value="press report">Press report</option><option value="official release">Official release</option><option value="archive item">Archive item</option><option value="unclear / needs review">Unclear / needs review</option></select></label><label>Page number if known<input name="pageNumber" maxlength="50"/></label><label>Document date if known<input name="sourceDate" maxlength="80"/></label></div><label>Entity names mentioned<textarea name="entities" maxlength="1600"></textarea></label><label>What the source shows<textarea name="shows" maxlength="1600" required></textarea></label><label>What the source does not show<textarea name="doesNotShow" maxlength="1200" required></textarea></label><label>Missing record or next check<textarea name="missingRecord" maxlength="1200"></textarea></label><label>Additional review note<textarea name="note" maxlength="1600" required></textarea></label><label><input name="legalSensitive" value="yes" type="checkbox" style="width:auto"/> Legal-sensitive</label><label><input name="correction" value="yes" type="checkbox" style="width:auto"/> Correction / downgrade request</label><p class="mini">Submissions enter pending review. They do not alter a page, evidence grade, card or conclusion until checked.</p><button class="btn" type="submit">Submit for Pending Review</button></form>`;
}
function epsteinScript() {
  return `<script id="epstein-source-intake-runtime">(()=>{const form=document.getElementById('epstein-source-intake-form');if(!form)return;form.addEventListener('submit',()=>{const value=name=>form.elements[name]?.value?.trim?.()||'';form.elements.body.value=["[EPSTEIN SOURCE INTAKE]","Document: "+value('leadTitle'),"Source type: "+value('sourceType'),"Source URL: "+(value('sourceUrl')||'not supplied'),"Source date: "+(value('sourceDate')||'not supplied'),"Page: "+(value('pageNumber')||'not supplied'),"Entities: "+(value('entities')||'not supplied'),"What it shows: "+value('shows'),"What it does not show: "+value('doesNotShow'),"Missing record / next check: "+(value('missingRecord')||'not supplied'),"Legal-sensitive: "+(form.elements.legalSensitive.checked?'yes':'no'),"Correction / downgrade: "+(form.elements.correction.checked?'yes':'no'),"Review note: "+value('note')].join('\\n')})})();</script>`;
}
function repairEpstein(html) {
  let next = html;
  next = next.replace(/<form class="ep-card">[\s\S]*?<\/form>/i, epsteinForm());
  if (!next.includes('id="epstein-source-intake-runtime"')) next = next.replace('</main>', `${epsteinScript()}</main>`);
  if (!next.includes('src="intake-fallback.js"')) next = next.replace('<script src="matrix.js"></script>', '<script src="intake-fallback.js"></script><script src="matrix.js"></script>');
  next = next.replace(/AI\/OCR pipeline is a placeholder until processing is connected\./gi, 'Source review uses the live intake endpoint with a downloadable local recovery package if the endpoint is unavailable.');
  next = next.replace(/Save Pending Review Placeholder/gi, 'Submit for Pending Review');
  return next;
}
function repairTrackerJavaScript(html) {
  return html
    .replace(/\bdata\.book links\b/g, 'data.moneyRoutes')
    .replace(/\bitem\.book links\b/g, 'item.moneyRoutes')
    .replace(/\bp\.book links\b/g, 'p.moneyRoutes')
    .replace(/\bm\.book links\b/g, 'm.moneyRoutes');
}
function repairWrongdoing(html) {
  return repairTrackerJavaScript(html)
    .replace(/<h1>WRONGDOING TRACKER\.<br>FOLLOW THE FILES\.<\/h1>/i, '<h1>WRONGDOING TRACKER.</h1>')
    .replace(/FOLLOW THE FILES\./g, 'MAP THE STRUCTURE. READ THE SIGNALS.');
}
function repairDeployStatus(html) {
  return html.replace(/FOLLOW THE FILES\./g, 'MAP THE STRUCTURE. READ THE SIGNALS.');
}

const trackerPages = ['case-status-dashboard.html', 'epstein-billionaire-tracker.html', 'tracker-core.html', 'wrongdoing-tracker.html'];
for (const base of bases) {
  patchAliases(base, 'epstein-upload-check.html', repairEpstein);
  for (const route of trackerPages) patchAliases(base, route, route === 'wrongdoing-tracker.html' ? repairWrongdoing : repairTrackerJavaScript);
  patchAliases(base, 'deploy-status.html', repairDeployStatus);
  for (const relative of ['reports/entity-object-object.html', 'reports/entity-object-object']) remove(base, relative);
}

for (const base of bases) {
  for (const route of ['epstein-upload-check.html', 'epstein-upload-check']) {
    const file = path.join(base, route);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const html = fs.readFileSync(file, 'utf8');
    const retiredPlaceholder = /Save Pending Review Placeholder|AI\/OCR pipeline is a placeholder until processing is connected/i.test(html);
    checks.push({ file: display(file), ok: html.includes('id="epstein-source-intake-form"') && html.includes('action="/submit-forum-post"') && html.includes('intake-fallback.js') && !retiredPlaceholder });
  }
  for (const route of trackerPages.flatMap(value => [value, value.replace(/\.html$/i, '')])) {
    const file = path.join(base, route);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const html = fs.readFileSync(file, 'utf8');
    checks.push({ file: display(file), ok: !/\b(?:data|item|p|m)\.book links\b/.test(html) && (!/tracker/i.test(route) || html.includes('moneyRoutes')) });
  }
  for (const route of ['deploy-status.html', 'deploy-status']) {
    const file = path.join(base, route);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const html = fs.readFileSync(file, 'utf8');
    checks.push({ file: display(file), ok: !html.includes('FOLLOW THE FILES') && html.includes('MAP THE STRUCTURE. READ THE SIGNALS.') });
  }
  for (const relative of ['reports/entity-object-object.html', 'reports/entity-object-object']) checks.push({ file: display(path.join(base, relative)), ok: !fs.existsSync(path.join(base, relative)) });
}

const ok = checks.length > 0 && checks.every(item => item.ok);
const report = {
  ok,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  removed: [...new Set(removed)],
  checks,
  boundary: 'The Epstein intake submits public-source leads to the reviewed forum endpoint with local fail-safe recovery. Canonical tracker pages and every extensionless alias use the valid moneyRoutes field. Dead feature placeholders, malformed object routes, stale mission copy and broken tracker JavaScript are excluded after every generator.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'deep-audit-public-defect-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!ok) throw new Error(`Deep audit public defect repair failed: ${JSON.stringify(checks.filter(item => !item.ok))}`);
console.log(`Deep audit public defects repaired: ${changed.length} file mutation(s), ${removed.length} malformed route(s) removed.`);
