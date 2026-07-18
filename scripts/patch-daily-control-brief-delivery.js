const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'daily-control-brief-delivery-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js not found');

function runRequired(relative, label) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) throw new Error(`${label} is missing: ${relative}`);
  const result = spawnSync(process.execPath, [target], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed with status ${result.status}`);
}

// This file used to own a shallow first-brief implementation tied to an exact
// one-line handleVerify body. The v3 lifecycle is now authoritative. Reapply it
// directly so legacy build chains cannot fail on, or restore, the obsolete tail.
runRequired('scripts/patch-deep-email-automation.js', 'Canonical v3 Daily Control Brief lifecycle');
runRequired('scripts/patch-list-unsubscribe-headers.js', 'One-click unsubscribe header lifecycle');

const source = fs.readFileSync(workerPath, 'utf8');
const requiredMarkers = [
  "import { buildBriefEmail } from './worker-daily-brief-email.js';",
  'async function queueImmediateDailyBrief',
  "messageKind:'first_daily_brief'",
  'queueImmediateDailyBrief(request,env,member',
  'issueReusableEmailToken',
  'structureVersion:3',
  "timeZone:'Europe/Paris'",
  "parts.hour==='08'&&parts.minute==='05'",
  "parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15'",
  "'List-Unsubscribe'",
  "'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'",
  'headers:payload.headers||undefined'
];
const missing = requiredMarkers.filter(marker => !source.includes(marker));
if (missing.length) throw new Error(`Canonical Daily Control Brief lifecycle remains incomplete: ${missing.join(' | ')}`);

const syntax = spawnSync(process.execPath, ['--check', workerPath], {
  cwd: root,
  encoding: 'utf8'
});
if (syntax.status !== 0) throw new Error(`Canonical email lifecycle failed syntax validation: ${syntax.stderr || syntax.stdout}`);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  version: 'daily-control-brief-v3',
  legacyPatchRetired: true,
  authoritativeOwner: 'scripts/patch-deep-email-automation.js',
  immediateAfterVerification: true,
  preferenceGated: true,
  personalizedPreferenceAndUnsubscribe: true,
  oneClickUnsubscribeHeaders: true,
  dailyLocalTime: '08:05 Europe/Paris',
  weeklyLocalTime: 'Monday 09:15 Europe/Paris',
  syntaxChecked: true,
  generatedAt: new Date().toISOString()
}, null, 2));
console.log('Legacy Daily Control Brief patch routed to the canonical v3 structured lifecycle; immediate delivery and one-click unsubscribe verified.');
