const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function writeFailure(message, extra = {}) {
  const report = { ok: false, generatedAt: new Date().toISOString(), error: message, ...extra };
  fs.writeFileSync(path.join(reportDir, 'newsletter-persistence-test.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportDir, 'newsletter-persistence-test.md'), `# Newsletter Persistence Test\n\nResult: FAIL\n\n- ${message}\n`);
  console.error(message);
  process.exit(1);
}

const patch = runNode('scripts/patch-worker-newsletter-system.js');
if (patch.status !== 0) writeFailure('Membership foundation/authentication patch chain failed before persistence test', { patchStatus: patch.status });

const membershipTest = runNode('scripts/membership-foundation-test.js');
const membershipReportPath = path.join(reportDir, 'membership-foundation-test.json');
if (!fs.existsSync(membershipReportPath)) writeFailure('Membership foundation test report missing', { testStatus: membershipTest.status });

let membershipReport;
try {
  membershipReport = JSON.parse(fs.readFileSync(membershipReportPath, 'utf8'));
} catch (error) {
  writeFailure('Membership foundation report could not be parsed', { parseError: error.message, testStatus: membershipTest.status });
}

const authTest = runNode('scripts/membership-auth-test.js');
const authReportPath = path.join(reportDir, 'membership-auth-test.json');
if (!fs.existsSync(authReportPath)) writeFailure('Membership authentication test report missing', { authTestStatus: authTest.status });
let authReport;
try {
  authReport = JSON.parse(fs.readFileSync(authReportPath, 'utf8'));
} catch (error) {
  writeFailure('Membership authentication report could not be parsed', { parseError: error.message, authTestStatus: authTest.status });
}

const newsletterChecks = (membershipReport.checks || []).filter(check =>
  /signup|consent|email|storage|subscriber|member list|health|fallback|migration/i.test(check.name || '')
);
const authChecks = authReport.checks || [];
const checks = [...newsletterChecks, ...authChecks];
const report = {
  ok: membershipTest.status === 0 && membershipReport.ok === true && authTest.status === 0 && authReport.ok === true && checks.every(check => check.ok),
  generatedAt: new Date().toISOString(),
  checks,
  membershipFoundation: {
    ok: membershipReport.ok,
    d1MemberCount: membershipReport.d1MemberCount,
    d1ConsentCount: membershipReport.d1ConsentCount
  },
  authentication: {
    ok: authReport.ok,
    verificationEmails: authReport.verificationEmails,
    loginEmails: authReport.loginEmails
  },
  boundary: 'Newsletter and membership capture are healthy only when D1 persistence, explicit consent, email verification, one-use magic links, secure sessions, logout revocation, truthful delivery status and administrator-only member lists all pass.'
};

fs.writeFileSync(path.join(reportDir, 'newsletter-persistence-test.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(reportDir, 'newsletter-persistence-test.md'), '# Newsletter and Membership Test\n\nGenerated: '+report.generatedAt+'\nResult: '+(report.ok?'PASS':'FAIL')+'\n\n'+checks.map(c=>`- ${c.ok?'PASS':'FAIL'}: ${c.name}`).join('\n'));

if (!report.ok) {
  console.error('NEWSLETTER / MEMBERSHIP AUTHENTICATION TEST FAILED');
  checks.filter(check => !check.ok).forEach(check => console.error(`- ${check.name}`));
  process.exit(1);
}
console.log('NEWSLETTER / MEMBERSHIP AUTHENTICATION TEST PASSED');
