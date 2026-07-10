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
    maxBuffer: 20 * 1024 * 1024
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

const patch = runNode('scripts/patch-worker-membership-foundation.js');
if (patch.status !== 0) writeFailure('Membership foundation patch failed before newsletter persistence test', { patchStatus: patch.status });

const membershipTest = runNode('scripts/membership-foundation-test.js');
const membershipReportPath = path.join(reportDir, 'membership-foundation-test.json');
if (!fs.existsSync(membershipReportPath)) writeFailure('Membership foundation test report missing', { testStatus: membershipTest.status });

let membershipReport;
try {
  membershipReport = JSON.parse(fs.readFileSync(membershipReportPath, 'utf8'));
} catch (error) {
  writeFailure('Membership foundation report could not be parsed', { parseError: error.message, testStatus: membershipTest.status });
}

const newsletterChecks = (membershipReport.checks || []).filter(check =>
  /signup|consent|email|storage|subscriber|member list|health|fallback|migration/i.test(check.name || '')
);
const report = {
  ok: membershipTest.status === 0 && membershipReport.ok === true && newsletterChecks.every(check => check.ok),
  generatedAt: new Date().toISOString(),
  checks: newsletterChecks,
  membershipFoundation: {
    ok: membershipReport.ok,
    d1MemberCount: membershipReport.d1MemberCount,
    d1ConsentCount: membershipReport.d1ConsentCount
  },
  boundary: 'Newsletter and free-member capture are healthy only when D1 persistence, explicit consent, truthful storage status, KV compatibility fallback and administrator-only member lists all pass.'
};

fs.writeFileSync(path.join(reportDir, 'newsletter-persistence-test.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(reportDir, 'newsletter-persistence-test.md'), '# Newsletter Persistence Test\n\nGenerated: '+report.generatedAt+'\nResult: '+(report.ok?'PASS':'FAIL')+'\n\n'+newsletterChecks.map(c=>`- ${c.ok?'PASS':'FAIL'}: ${c.name}`).join('\n'));

if (!report.ok) {
  console.error('NEWSLETTER / MEMBERSHIP PERSISTENCE TEST FAILED');
  newsletterChecks.filter(check => !check.ok).forEach(check => console.error(`- ${check.name}`));
  process.exit(1);
}
console.log('NEWSLETTER / MEMBERSHIP PERSISTENCE TEST PASSED');
