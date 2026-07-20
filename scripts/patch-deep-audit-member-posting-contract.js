const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'scripts', 'repair-deep-audit-public-defects.js');
const report = path.join(root, 'downloads', 'deep-audit-member-posting-contract.json');
if (!fs.existsSync(target)) throw new Error('scripts/repair-deep-audit-public-defects.js is required');

const before = fs.readFileSync(target, 'utf8');
let source = before;

const oldFunction = /function repairSignalPass\(html\) \{[\s\S]*?\n\}/;
const replacement = `function repairMemberPosting(html) {
  const loginUrl = 'https://matrixreprogrammed.com/member-login.html?return=' + encodeURIComponent('/epstein-sighting-submit.html');
  const section = '<section id="signal-pass" class="section wrap split"><div class="card redline"><h2>Verified Member Posting</h2><p>The board is free to read. A verified Free Member account unlocks posting across devices and gives you session controls.</p><p id="forum-member-status" class="form-status pending">Checking your member session…</p><div class="cta-row small"><a class="btn" href="' + loginUrl + '">Sign In</a><a class="btn alt" href="membership.html">Create Free Account</a></div></div><aside class="card"><h2>What to include</h2><p>Source URL, claimed location/date, media link, why it matters, and any counter-source or debunk.</p></aside></section>';
  let next = html;
  if (/<section id="signal-pass" class="section wrap split">[\\s\\S]*?<\\/section>/i.test(next)) next = next.replace(/<section id="signal-pass" class="section wrap split">[\\s\\S]*?<\\/section>/i, section);
  else if (next.includes('<section id="submit-signal"')) next = next.replace('<section id="submit-signal"', section + '<section id="submit-signal"');
  next = next
    .replace(/\\s+signal-locked(?=["'])/g, '')
    .replace('Posting is locked until Signal Pass is unlocked on this device.', 'Posting requires a verified free member account.')
    .replace(/<script id="signal-pass-unlock-runtime">[\\s\\S]*?<\\/script>/gi, '')
    .replace(/<script src="forum\\.js(?:\\?[^\"]*)?"><\\/script>/g, '<script src="forum.js?v=20260720-forum-member-posting-v3"></script>');
  return next;
}`;

if (source.includes('function repairSignalPass(html)')) {
  if (!oldFunction.test(source)) throw new Error('Obsolete Signal Pass repair function shape is not recognized');
  source = source.replace(oldFunction, replacement);
}
source = source.replace("patchAliases(base, 'epstein-sighting-submit.html', repairSignalPass);", "patchAliases(base, 'epstein-sighting-submit.html', repairMemberPosting);");

const oldCheck = `checks.push({ file: display(file), ok: html.includes('id="signal-pass-unlock-runtime"') && html.includes("button.addEventListener('click',unlock)") });`;
const newCheck = `checks.push({ file: display(file), ok: html.includes('id="forum-member-status"') && html.includes('Verified Member Posting') && html.includes('member-login.html?return=') && html.includes('forum-member-posting-v3') && !html.includes('unlock-signal-pass') && !html.includes('paypal.me/njmgroup/1') && !html.includes('signal-pass-unlock-runtime') });`;
if (source.includes(oldCheck)) source = source.replace(oldCheck, newCheck);

for (const marker of [
  'function repairMemberPosting(html)',
  "patchAliases(base, 'epstein-sighting-submit.html', repairMemberPosting);",
  "html.includes('id=\"forum-member-status\"')",
  "!html.includes('paypal.me/njmgroup/1')"
]) {
  if (!source.includes(marker)) throw new Error(`Deep audit member-posting marker missing: ${marker}`);
}
for (const banned of ['function repairSignalPass(html)', 'signal-pass-unlock-runtime\") && html.includes']) {
  if (source.includes(banned)) throw new Error(`Obsolete Signal Pass audit marker remains: ${banned}`);
}

if (source !== before) fs.writeFileSync(target, source);
fs.mkdirSync(path.dirname(report), { recursive: true });
fs.writeFileSync(report, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  contract: 'verified-free-member-posting',
  retired: ['paid browser Signal Pass', 'sessionStorage unlock runtime'],
  boundary: 'The sighting board remains free to read; posting requires a verified member session and all claims remain unverified until separately reviewed.'
}, null, 2)}\n`);
console.log(`Deep audit member-posting contract ${source === before ? 'already current' : 'updated'}.`);
