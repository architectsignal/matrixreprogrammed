const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const rendererPath = path.join(root, 'src', 'worker-daily-brief-email.js');
const graphPath = path.join(root, 'data', 'investigation-knowledge-graph.json');
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

// This module is loaded inside build-cloudflare-output.js immediately before assets
// are copied. Require the graph projector in the same process so the compact public
// projection remains staged until the Cloudflare bundle is complete, then restores
// the full build-time graph on process exit.
require('./patch-cloudflare-oversized-graph-contract.js');

for (const file of [workerPath, rendererPath, graphPath]) if (!fs.existsSync(file)) throw new Error(`Campaign-quality source missing: ${path.relative(root, file)}`);
const worker = fs.readFileSync(workerPath, 'utf8');
const renderer = fs.readFileSync(rendererPath, 'utf8');
const graphBytes = fs.statSync(graphPath).size;
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const legacyFirstBrief = worker.includes('queueImmediateDailyBrief') && worker.includes("messageKind:'first_daily_brief'");
const currentFirstBrief = worker.includes('sendFirstDailyBrief') && worker.includes('public_daily_brief!==1') && worker.includes('daily-control-brief:${member.id}:') && worker.includes('firstDailyBrief');
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
  immediateFirstBrief: legacyFirstBrief || currentFirstBrief,
  dailyDeduplication: worker.includes('daily-control-brief:${member.id}:') && worker.includes("campaign.kind==='daily'"),
  normalCampaignIdempotency: worker.includes('`${campaign.id}:${member.id}`'),
  zeroRecipientCompletion: worker.includes("const status=recipients.length?'sending':'sent'") || (worker.includes("status='sending'") && worker.includes('recipientCount:recipients.length')),
  parisSchedule: worker.includes("timeZone:'Europe/Paris'") && worker.includes("parts.hour==='08'&&parts.minute==='05'") && worker.includes("parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15'"),
  cloudflareGraphWithinLimit: graphBytes <= 24 * 1024 * 1024,
  cloudflareGraphSchemaCompatible: graph.ok === true && Array.isArray(graph.entities) && Array.isArray(graph.relationships) && graph.totals && graph.evidenceBoundary,
  cloudflareGraphProjectionDeclared: graphBytes < 25 * 1024 * 1024 && (graph.publicProjection?.compact === true || graphBytes < 24 * 1024 * 1024)
};
const failures = Object.entries(checks).filter(([,ok]) => !ok).map(([name]) => name);
if (failures.length) throw new Error(`Canonical campaign/Cloudflare quality contract incomplete: ${failures.join(', ')}`);
for (const file of [workerPath, rendererPath]) {
  const syntax = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error(`${path.relative(root, file)} syntax failed: ${syntax.stderr || syntax.stdout}`);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  legacyPatchRetired: true,
  authoritativeOwners: ['scripts/patch-deep-email-automation.js','scripts/patch-list-unsubscribe-headers.js','src/worker-daily-brief-email.js','scripts/patch-cloudflare-oversized-graph-contract.js'],
  checks,
  stagedGraphBytes: graphBytes,
  boundary: 'Campaign quality is enforced through structured evidence fields, verified consent/preferences, suppression, personalised controls, one-click unsubscribe and D1 idempotency. The public graph remains schema-compatible under Cloudflare limits while the full graph is restored after the build.'
}, null, 2));
console.log(`Legacy campaign-quality patch routed to v3 lifecycle; compact graph staged at ${(graphBytes / 1024 / 1024).toFixed(1)} MiB for Cloudflare.`);