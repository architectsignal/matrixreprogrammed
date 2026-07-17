const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'daily-control-brief-email-test.json');

if (!fs.existsSync(workerPath)) throw new Error('Email lifecycle Worker is missing');
const source = fs.readFileSync(workerPath, 'utf8');

const checks = {
  version: source.includes("const DAILY_CONTROL_BRIEF_VERSION='daily-control-brief-v3';"),
  dailyBrainSource: source.includes("'/data/daily-brain-brief.json'"),
  dailyCommandSource: source.includes("'/data/daily-command-brief.json'"),
  speculativeSynthesisSource: source.includes("'/data/speculative-intelligence-synthesis.json'"),
  publicDropsSource: source.includes("'/data/latest-public-drops.json'"),
  namedActors: source.includes('Named people and institutions in the record') && source.includes('Documented role:'),
  actorContext: source.includes('Why this name matters:'),
  currentDevelopments: source.includes('What changed and why it matters'),
  evidenceStatus: source.includes('evidence status shown in source'),
  speculationDesk: source.includes('Speculation desk — testable, not decorative'),
  confirmationTest: source.includes('What would strengthen it:'),
  disconfirmationTest: source.includes('What would weaken it:'),
  priorityRecords: source.includes('Records to pull next'),
  watchNext: source.includes('Watch next'),
  usefulSubject: source.includes('subjectSuffix') && source.includes('clean(rendered.subjectSuffix,82)'),
  fullBoundary: source.includes('Named roles do not establish guilt, shared motive or central command.'),
  auditVersion: source.includes('briefVersion:DAILY_CONTROL_BRIEF_VERSION')
};

const failures = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  version: 'daily-control-brief-v3',
  checks,
  failures,
  contract: {
    maximumNamedActors: 8,
    maximumDevelopments: 6,
    maximumScenarios: 4,
    scenarioRequirements: ['trajectory', 'evidence needed', 'disconfirming evidence', 'boundary'],
    evidenceRule: 'Names require a documented role or source-linked relationship; inclusion is not an accusation.'
  }
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Daily Control Brief v3 contract failed: ${failures.join(', ')}`);
console.log(`Daily Control Brief v3 contract passed: ${Object.keys(checks).length} checks.`);
