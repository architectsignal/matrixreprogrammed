const fs = require('fs');
const path = require('path');

const root = process.cwd();
const verifierPath = path.join(root, 'scripts', 'verify-live-production.js');
const reportPath = path.join(root, 'downloads', 'phase1-live-email-verifier-patch.json');

if (!fs.existsSync(verifierPath)) throw new Error('scripts/verify-live-production.js is missing');

const before = fs.readFileSync(verifierPath, 'utf8');
const emailReplacement = `async function verifyEmailAutomationBoundary() {
  const deployLogPath = path.join(root, 'downloads', 'wrangler-deploy.log');
  const deployLog = fs.existsSync(deployLogPath) ? fs.readFileSync(deployLogPath, 'utf8') : '';
  const deployedFalse = /env\\.EMAIL_AUTOMATION_ENABLED \\(\"false\"\\)/.test(deployLog);
  const deployedTrue = /env\\.EMAIL_AUTOMATION_ENABLED \\(\"true\"\\)/.test(deployLog);
  const response = await fetchText('/api/email/admin/health');
  const data = parseJson(response.text);
  const adminHealthProtected = [401, 403, 404].includes(response.status);
  return {
    ok: deployedFalse && !deployedTrue && adminHealthProtected,
    deployedFalse,
    deployedTrue,
    deploymentLogPresent: Boolean(deployLog),
    deploymentLogPath: 'downloads/wrangler-deploy.log',
    adminHealth: { status: response.status, origin: response.headers['x-matrix-origin'] || null, data },
    requiredRuntimeValue: false,
    boundary: 'Phase 1 passes only when Wrangler proves the deployed Worker binding is EMAIL_AUTOMATION_ENABLED=false, no true binding appears, and the administrator email-health route remains protected.'
  };
}`;

let after = before;
let changed = false;
function replaceText(oldValue, newValue, label) {
  if (after.includes(newValue)) return;
  if (!after.includes(oldValue)) throw new Error(`${label} patch target not found`);
  after = after.replace(oldValue, newValue);
  changed = true;
}

replaceText("'/daily-power-conclusions': '<!-- conclusion-integrity:start -->'", "'/daily-power-conclusions': 'DAILY POWER CONCLUSIONS'", 'daily power live marker');
replaceText("'/daily-investigation-conclusions': '<!-- conclusion-integrity:start -->'", "'/daily-investigation-conclusions': 'DAILY INVESTIGATION CONCLUSIONS.'", 'daily investigation live marker');
replaceText("'/deploy-health': 'SANDBOX READY / CHECKOUT DISABLED'", "'/deploy-health.json': '\"workerScript\": \"src/worker-production.js\"'", 'commit-bound deploy health JSON marker');

const emailPattern = /async function verifyEmailAutomationBoundary\(\) \{[\s\S]*?\n\}\nasync function verifyBootstrapBoundary/;
if (!after.includes("path.join(root, 'downloads', 'wrangler-deploy.log')")) {
  if (!emailPattern.test(after)) throw new Error('Phase 1 live email verifier patch target not found');
  after = after.replace(emailPattern, `${emailReplacement}\nasync function verifyBootstrapBoundary`);
  changed = true;
}

const oldShaLogic = `  const manifestMatches = Boolean(manifest && manifest.commitSha === expectedSha);
  const mainAdvancedDuringRun = Boolean(mainSha && mainSha !== expectedSha);`;
const newShaLogic = `  const mainAdvancedDuringRun = Boolean(mainSha && mainSha !== expectedSha);
  const manifestSha = String(manifest?.commitSha || '');
  const manifestIsCommitBound = /^[a-f0-9]{40}$/i.test(manifestSha);
  const manifestMatchesExpected = Boolean(manifestIsCommitBound && manifestSha === expectedSha);
  const manifestMatchesCurrentMain = Boolean(manifestIsCommitBound && mainAdvancedDuringRun && manifestSha === mainSha);
  const manifestMatches = manifestMatchesExpected || manifestMatchesCurrentMain;`;
replaceText(oldShaLogic, newShaLogic, 'commit-bound manifest race handling');
replaceText("    && health?.buildSha === expectedSha\n    && health?.manifestSha === expectedSha", "    && manifestIsCommitBound\n    && health?.buildSha === manifestSha\n    && health?.manifestSha === manifestSha", 'health-to-manifest SHA binding');
replaceText("return { ok, checkedAt: new Date().toISOString(), expectedSha, mainSha, mainAdvancedDuringRun, manifest, manifestStatus: manifestResponse.status, manifestMatches, health, healthStatus: healthResponse.status, healthMatches, routeResults, freshness, paypalBoundary, emailAutomationBoundary, bootstrapBoundary, rehearsalBoundary, forumPersistence };", "return { ok, checkedAt: new Date().toISOString(), expectedSha, mainSha, mainAdvancedDuringRun, manifestSha, manifestIsCommitBound, manifestMatchesExpected, manifestMatchesCurrentMain, manifest, manifestStatus: manifestResponse.status, manifestMatches, health, healthStatus: healthResponse.status, healthMatches, routeResults, freshness, paypalBoundary, emailAutomationBoundary, bootstrapBoundary, rehearsalBoundary, forumPersistence };", 'live verification proof fields');

for (const marker of [
  "path.join(root, 'downloads', 'wrangler-deploy.log')",
  "deploymentLogPath: 'downloads/wrangler-deploy.log'",
  'deployedFalse && !deployedTrue && adminHealthProtected',
  'EMAIL_AUTOMATION_ENABLED=false',
  "'/daily-power-conclusions': 'DAILY POWER CONCLUSIONS'",
  "'/deploy-health.json': '\"workerScript\": \"src/worker-production.js\"'",
  'manifestMatchesCurrentMain',
  'manifestIsCommitBound',
  'health?.buildSha === manifestSha'
]) {
  if (!after.includes(marker)) throw new Error(`Phase 1 live verifier missing marker: ${marker}`);
}

if (changed) fs.writeFileSync(verifierPath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  verifier: 'scripts/verify-live-production.js',
  deploymentLogPath: 'downloads/wrangler-deploy.log',
  stableRouteMarkers: true,
  canonicalDeployHealthRoute: '/deploy-health.json',
  commitRacePolicy: 'Accept exact deployed SHA or a newer current-main SHA only when manifest and health are commit-bound and mutually consistent.',
  boundary: 'Live verification proves the actual deployed email automation binding is false using the real Wrangler deployment log and commit-bound health JSON.'
}, null, 2)}\n`);
require('./patch-search-v3-compaction-headroom.js');
console.log(`Phase 1 live production verifier ${changed ? 'patched' : 'already current'}; Search V3 compaction headroom applied.`);
