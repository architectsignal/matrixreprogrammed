const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const targets = [
  path.join(root, 'templates', 'phase6-membership.template'),
  path.join(root, 'membership.html')
];
const newsletterPath = path.join(root, 'newsletter.js');
const newsletterRepairPath = path.join(root, 'scripts', 'repair-newsletter-preference-runtime.js');
const reportPath = path.join(root, 'downloads', 'membership-brief-preferences-patch.json');
const sitePath = path.join(root, '_site');
const changed = [];
const synchronized = [];
const failures = [];
const newsletterMarkers = [
  'public_daily_brief:preferences.daily',
  'public_weekly_digest:preferences.weekly',
  'release_notices:preferences.release',
  'Select at least one briefing or release-notice preference.',
  "wordingVersion:'newsletter-explicit-consent-v3'"
];

const preferenceBlock = `          <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden">
          <div class="newsletter-preferences" role="group" aria-labelledby="free-brief-preferences-label">
            <strong id="free-brief-preferences-label">Choose your free emails</strong>
            <label><input type="checkbox" name="public_daily_brief" value="true" checked data-default-checked="true"> Daily Control Brief</label>
            <label><input type="checkbox" name="release_notices" value="true" checked data-default-checked="true"> Release notices</label>
            <label><input type="checkbox" name="public_weekly_digest" value="true"> Weekly Signal Drop</label>
          </div>`;

function patchMembership(file) {
  if (!fs.existsSync(file)) {
    failures.push(`missing ${path.relative(root, file)}`);
    return;
  }
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  html = html.replace(
    '.email-capture input{min-width:220px;flex:1;',
    '.email-capture input:not([type="checkbox"]){min-width:220px;flex:1;'
  );

  if (!html.includes('.newsletter-preferences{')) {
    html = html.replace(
      '.form-status{width:100%;font-size:.82rem;color:#c8b98c}',
      '.newsletter-preferences{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:.55rem;width:100%;padding:.8rem;border:1px solid rgba(216,181,106,.24);border-radius:12px;background:rgba(0,0,0,.28)}.newsletter-preferences strong{grid-column:1/-1;color:#d8b56a}.newsletter-preferences label{display:flex;align-items:center;gap:.45rem;font-size:.88rem;color:#eadcae}.newsletter-preferences input[type="checkbox"]{width:1rem;height:1rem;min-width:1rem;flex:0 0 auto;accent-color:#d8b56a}.form-status{width:100%;font-size:.82rem;color:#c8b98c}'
    );
  }

  html = html.replace(
    '<form id="newsletter-form" data-newsletter-form class="email-capture">',
    '<form id="newsletter-form" data-newsletter-form data-source="membership-daily-control-brief" data-default-daily="true" data-default-release="true" class="email-capture">'
  );

  if (!html.includes('id="free-brief-preferences-label"')) {
    const emailLine = '          <input type="email" name="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address" required>';
    if (!html.includes(emailLine)) failures.push(`${path.relative(root, file)} missing membership email input anchor`);
    else html = html.replace(emailLine, `${emailLine}\n${preferenceBlock}`);
  }

  html = html.replace(
    'Your email and consent are stored only when the signup service confirms success.',
    'Daily Control Brief and release notices are preselected. Verify your email to activate them; the Weekly Signal Drop is optional.'
  );

  for (const marker of [
    'data-source="membership-daily-control-brief"',
    'data-default-daily="true"',
    'data-default-release="true"',
    'name="public_daily_brief"',
    'name="release_notices"',
    'name="public_weekly_digest"',
    'data-default-checked="true"',
    'id="free-brief-preferences-label"'
  ]) if (!html.includes(marker)) failures.push(`${path.relative(root, file)} missing ${marker}`);

  if (html !== before) {
    fs.writeFileSync(file, html);
    changed.push(path.relative(root, file));
  }
}

function newsletterMissingMarkers() {
  if (!fs.existsSync(newsletterPath)) return newsletterMarkers.slice();
  const newsletter = fs.readFileSync(newsletterPath, 'utf8');
  return newsletterMarkers.filter(marker => !newsletter.includes(marker));
}

function repairNewsletterRuntime() {
  if (!fs.existsSync(newsletterRepairPath)) {
    failures.push('missing scripts/repair-newsletter-preference-runtime.js');
    return;
  }
  const result = spawnSync(process.execPath, [newsletterRepairPath], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) failures.push(`newsletter preference runtime repair failed with status ${result.status || 1}`);
}

targets.forEach(patchMembership);

let missingNewsletterMarkers = newsletterMissingMarkers();
if (missingNewsletterMarkers.length) {
  repairNewsletterRuntime();
  missingNewsletterMarkers = newsletterMissingMarkers();
}
for (const marker of missingNewsletterMarkers) failures.push(`newsletter.js missing ${marker}`);

if (!failures.length && fs.existsSync(sitePath) && fs.statSync(sitePath).isDirectory()) {
  for (const relative of ['membership.html', 'newsletter.js']) {
    const source = path.join(root, relative);
    const destination = path.join(sitePath, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    synchronized.push(`_site/${relative}`);
  }
  const extensionless = path.join(sitePath, 'membership');
  if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) {
    fs.copyFileSync(path.join(root, 'membership.html'), extensionless);
    synchronized.push('_site/membership');
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  changed,
  synchronized,
  newsletterRuntimeSelfHeal: true,
  defaultPreferences: {
    publicDailyBrief: true,
    releaseNotices: true,
    publicWeeklyDigest: false
  },
  explicitChoiceVisible: true,
  consentRequired: true,
  preferencesSentBySharedScript: true,
  failures,
  boundary: 'The membership capture explicitly identifies Daily Control Brief and release-notice preferences. Users may add the Weekly Signal Drop, and verification, preference management and unsubscribe remain mandatory.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) throw new Error(`Membership brief preference patch failed: ${failures.join('; ')}`);
console.log(`Membership Daily Control Brief preference form patched: ${changed.length ? changed.join(', ') : 'already current'}; newsletter runtime verified.`);
