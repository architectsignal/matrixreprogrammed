const fs = require('fs');
const path = require('path');

const root = process.cwd();
const verifierPath = path.join(root, 'scripts', 'verify-live-production.js');
const reportPath = path.join(root, 'downloads', 'phase1-live-email-verifier-patch.json');

if (!fs.existsSync(verifierPath)) throw new Error('scripts/verify-live-production.js is missing');

const before = fs.readFileSync(verifierPath, 'utf8');
const replacement = `async function verifyEmailAutomationBoundary() {
  const deployLogPath = path.join(root, 'wrangler-deploy.log');
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
    adminHealth: { status: response.status, origin: response.headers['x-matrix-origin'] || null, data },
    requiredRuntimeValue: false,
    boundary: 'Phase 1 passes only when Wrangler proves the deployed Worker binding is EMAIL_AUTOMATION_ENABLED=false, no true binding appears, and the administrator email-health route remains protected.'
  };
}`;

const pattern = /async function verifyEmailAutomationBoundary\(\) \{[\s\S]*?\n\}\nasync function verifyBootstrapBoundary/;
let after = before;
let changed = false;
if (!after.includes('deploymentLogPresent: Boolean(deployLog)')) {
  if (!pattern.test(after)) throw new Error('Phase 1 live email verifier patch target not found');
  after = after.replace(pattern, `${replacement}\nasync function verifyBootstrapBoundary`);
  changed = true;
}

for (const marker of [
  "path.join(root, 'wrangler-deploy.log')",
  'deployedFalse && !deployedTrue && adminHealthProtected',
  'EMAIL_AUTOMATION_ENABLED=false'
]) {
  if (!after.includes(marker)) throw new Error(`Phase 1 live email verifier missing marker: ${marker}`);
}

if (changed) fs.writeFileSync(verifierPath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  verifier: 'scripts/verify-live-production.js',
  boundary: 'Live verification must prove the actual deployed email automation binding is false, not merely the repository configuration.'
}, null, 2)}\n`);
console.log(`Phase 1 live email verifier ${changed ? 'patched' : 'already current'}.`);
