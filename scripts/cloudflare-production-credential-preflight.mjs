import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'cloudflare-production-credential-preflight.json');
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const adminToken = String(process.env.AI_MANAGEMENT_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || '').trim();
const databaseName = 'matrix-members';
const report = {
  ok: false,
  checkedAt: new Date().toISOString(),
  mode: 'read-only-production-credential-preflight',
  database: databaseName,
  localConfiguration: {},
  secrets: {
    cloudflareApiTokenPresent: Boolean(token),
    cloudflareAccountIdPresent: Boolean(accountId),
    ownerVerificationTokenPresent: Boolean(adminToken),
    ownerVerificationTokenLengthValid: adminToken.length >= 32
  },
  checks: [],
  failures: [],
  nextAction: '',
  boundary: 'This preflight performs Cloudflare identity, D1 metadata and D1 Time Travel metadata reads only. It does not deploy, execute SQL, mutate D1, write secrets, change routes or modify application data.'
};

function writeReport() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function redact(value = '') {
  let text = String(value || '');
  if (token) text = text.split(token).join('[redacted-token]');
  if (accountId) text = text.split(accountId).join('[redacted-account]');
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
  text = text.replace(/[0-9a-f]{32}/gi, '[redacted-id]');
  return text.replace(/\s+/g, ' ').trim().slice(0, 700);
}

function classifyFailure(label, output) {
  const text = String(output || '');
  if (/Authentication error|code:\s*10000|unauthori[sz]ed|invalid.*token/i.test(text)) {
    return `${label}: Cloudflare rejected the token or the token lacks the required account permission.`;
  }
  if (/not found|no.*database|database.*missing/i.test(text)) {
    return `${label}: ${databaseName} was not found in the configured Cloudflare account.`;
  }
  if (/D1|database|time.?travel|bookmark/i.test(text)) {
    return `${label}: the token cannot read the ${databaseName} D1 database or its rollback metadata.`;
  }
  return `${label}: Cloudflare read-only verification failed.`;
}

function runWrangler(label, args) {
  const result = spawnSync('npx', ['--yes', 'wrangler@latest', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  const item = {
    label,
    commandClass: args.slice(0, 3).join(' '),
    ok: result.status === 0,
    exitCode: result.status,
    diagnostic: result.status === 0 ? 'read-only check passed' : redact(combined)
  };
  report.checks.push(item);
  if (!item.ok) report.failures.push(classifyFailure(label, combined));
  return item.ok;
}

try {
  const wranglerPath = path.join(root, 'wrangler.toml');
  const wrangler = fs.existsSync(wranglerPath) ? fs.readFileSync(wranglerPath, 'utf8') : '';
  report.localConfiguration = {
    wranglerPresent: Boolean(wrangler),
    membersBindingPresent: /binding\s*=\s*["']MEMBERS_DB["']/i.test(wrangler),
    matrixMembersDatabasePresent: new RegExp(`database_name\\s*=\\s*["']${databaseName}["']`, 'i').test(wrangler)
  };

  if (!report.localConfiguration.wranglerPresent) report.failures.push('wrangler.toml is missing.');
  if (!report.localConfiguration.membersBindingPresent) report.failures.push('wrangler.toml does not expose the MEMBERS_DB binding.');
  if (!report.localConfiguration.matrixMembersDatabasePresent) report.failures.push(`wrangler.toml does not name the ${databaseName} database.`);
  if (!token) report.failures.push('CLOUDFLARE_API_TOKEN is missing from the production environment.');
  if (!accountId) report.failures.push('CLOUDFLARE_ACCOUNT_ID is missing from the production environment.');
  if (!adminToken) report.failures.push('AI_MANAGEMENT_ADMIN_TOKEN or ADMIN_API_TOKEN is missing from the production environment.');
  else if (adminToken.length < 32) report.failures.push('The owner verification token is shorter than the 32-character production minimum.');

  if (report.failures.length === 0) {
    runWrangler('Cloudflare identity', ['whoami']);
    if (report.failures.length === 0) runWrangler('D1 database access', ['d1', 'info', databaseName]);
    if (report.failures.length === 0) runWrangler('D1 rollback metadata access', ['d1', 'time-travel', 'info', databaseName, '--json']);
  }

  report.ok = report.failures.length === 0 && report.checks.length === 3 && report.checks.every(check => check.ok);
  report.nextAction = report.ok
    ? 'Credentials are ready for the controlled build, rollback capture, migrations and deployment gates.'
    : 'Replace the production environment Cloudflare token with one scoped to the correct account and D1 access, then rerun this preflight. No deployment was attempted.';
  writeReport();

  if (!report.ok) {
    console.error('CLOUDFLARE PRODUCTION CREDENTIAL PREFLIGHT FAILED');
    report.failures.forEach(failure => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log(`CLOUDFLARE PRODUCTION CREDENTIAL PREFLIGHT PASSED: identity, ${databaseName} access, rollback metadata and owner verification token are ready.`);
} catch (error) {
  report.failures.push(String(error?.message || error));
  report.nextAction = 'Inspect the sanitized preflight artifact. No deployment or D1 mutation was attempted.';
  writeReport();
  console.error(`CLOUDFLARE PRODUCTION CREDENTIAL PREFLIGHT FAILED: ${error?.message || error}`);
  process.exit(1);
}
