const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const rendererPath = path.join(root, 'src', 'worker-daily-brief-email.js');
const reportPath = path.join(root, 'downloads', 'email-campaign-quality-patch.json');

function runRequired(relative, label) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) throw new Error(`${label} is missing: ${relative}`);
  const result = spawnSync(process.execPath, [target], { cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed with status ${result.status}`);
}

// The original patch owned a shallow campaign renderer and exact one-line status
// expressions. The v3 structured renderer and lifecycle are authoritative now.
runRequired('scripts/patch-deep-email-automation.js', 'Canonical v3 campaign lifecycle');
runRequired('scripts/patch-list-unsubscribe-headers.js', 'One-click unsubscribe and same-day Daily Brief deduplication');

for (const file of [workerPath, rendererPath]) if (!fs.existsSync(file)) throw new Error(`Campaign-quality source missing: ${path.relative(root, file)}`);
const worker = fs.readFileSync(workerPath, 'utf8');
const renderer = fs.readFileSync(rendererPath, 'utf8');
const checks = {
  structuredV3: worker.includes('structureVersion:3'),
  deepRenderer: ['Trigger','Primary record','Established facts','Mechanism of power','Solid conclusion','Speculative conclusion','Counter-analysis','Missing evidence','Watch next'].every(marker => renderer.includes(marker)),
  sourceFailsClosed: renderer.includes('No verified source changes were available') || renderer.includes('No evidence-graded briefings were available'),
  verifiedRecipients: worker.includes('email_verified_at IS NOT NULL'),
  consentRequired: worker.includes("marketing_status='subscribed'"),
  preferenceSegmented: worker.includes('segmentKey'),
  suppressionRequired: worker.includes('email_suppressions'),
  personalisedControls: worker.includes('subscriber-dashboard.html?token=') && worker.includes('/api/email/unsubscribe?token='),
  oneClickHeaders: worker.includes("'List-Unsubscribe'") && worker.includes("'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'"),
  immediateFirstBrief: worker.includes('queueImmediateDailyBrief') && worker.includes("messageKind:'first_daily_brief'"),
  dailyDeduplication: worker.includes('daily-control-brief:${member.id}:') && worker.includes("campaign.kind==='daily'"),
  normalCampaignIdempotency: worker.includes('`${campaign.id}:${member.id}`'),
  zeroRecipientCompletion: worker.includes("const status=recipients.length?'sending':'sent'") || (worker.includes("status='sending'") && worker.includes('recipientCount:recipients.length')),
  parisSchedule: worker.includes("timeZone:'Europe/Paris'") && worker.includes("parts.hour==='08'&&parts.minute==='05'") && worker.includes("parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15'")
};
const failures = Object.entries(checks).filter(([,ok]) => !ok).map(([name]) => name);
if (failures.length) throw new Error(`Canonical campaign quality contract incomplete: ${failures.join(', ')}`);
for (const file of [workerPath, rendererPath]) {
  const syntax = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error(`${path.relative(root, file)} syntax failed: ${syntax.stderr || syntax.stdout}`);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  legacyPatchRetired: true,
  authoritativeOwners: ['scripts/patch-deep-email-automation.js','scripts/patch-list-unsubscribe-headers.js','src/worker-daily-brief-email.js'],
  checks,
  boundary: 'Campaign quality is enforced through structured evidence fields, verified consent/preferences, suppression, personalised controls, one-click unsubscribe and D1 idempotency. No shallow legacy renderer is restored.'
}, null, 2));
console.log('Legacy campaign-quality patch routed to the structured v3 lifecycle; evidence quality, delivery controls and idempotency verified.');
