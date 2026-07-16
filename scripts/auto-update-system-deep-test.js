#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const mode = process.argv[2] || 'verify';
const outDir = path.join(root, 'downloads');
fs.mkdirSync(outDir, { recursive: true });

const report = {
  ok: true,
  mode,
  generatedAt: new Date().toISOString(),
  checks: [],
  metrics: {},
  warnings: [],
  failures: []
};

function at(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(at(relative)); }
function read(relative) { return fs.readFileSync(at(relative), 'utf8'); }
function readJson(relative, fallback = null) {
  try { return JSON.parse(read(relative)); } catch { return fallback; }
}
function writeJson(relative, value) {
  fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
  fs.writeFileSync(at(relative), JSON.stringify(value, null, 2));
}
function sha(value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return crypto.createHash('sha256').update(data).digest('hex');
}
function fileSha(relative) { return exists(relative) ? sha(fs.readFileSync(at(relative))) : ''; }
function ageHours(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? (Date.now() - time) / 3600000 : Infinity;
}
function check(name, condition, details = {}) {
  const ok = Boolean(condition);
  report.checks.push({ name, ok, ...details });
  if (!ok) {
    report.ok = false;
    report.failures.push(name);
  }
  return ok;
}
function warn(message, details = {}) {
  report.warnings.push({ message, ...details });
}
function run(label, args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    timeout: options.timeout || 15 * 60 * 1000,
    stdio: 'pipe'
  });
  if (options.echo !== false) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return {
    label,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : ''
  };
}
function validHttp(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol);
  } catch { return false; }
}
function unique(values) { return new Set(values).size === values.length; }
function clockSnapshot(data) {
  return Object.fromEntries((data.clocks || []).map(clock => [clock.slug, {
    score: Number(clock.score),
    fingerprint: String(clock.evidenceFingerprint || ''),
    status: String(clock.automaticUpdateStatus || ''),
    movement: Number(clock.automaticScoreMovement || 0)
  }]));
}
function save() {
  const target = `downloads/auto-update-deep-test-${mode}.json`;
  writeJson(target, report);
  const lines = [
    '# Automatic Update System Deep Test',
    '',
    `Mode: ${mode}`,
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Checks',
    ...report.checks.map(item => `- ${item.ok ? 'PASS' : 'FAIL'} — ${item.name}`),
    '',
    '## Warnings',
    ...(report.warnings.length ? report.warnings.map(item => `- ${item.message}`) : ['- None']),
    '',
    '## Metrics',
    '```json',
    JSON.stringify(report.metrics, null, 2),
    '```'
  ];
  fs.writeFileSync(at(`downloads/auto-update-deep-test-${mode}.md`), lines.join('\n'));
  console.log(`AUTO UPDATE DEEP TEST ${report.ok ? 'PASSED' : 'FAILED'} (${mode}): ${report.checks.length} checks, ${report.failures.length} failures, ${report.warnings.length} warnings.`);
  if (!report.ok) process.exitCode = 1;
}

function testContracts() {
  const daily = read('.github/workflows/daily-investigation-machine.yml');
  const weekly = read('.github/workflows/weekly-investigation-machine.yml');
  const deploy = read('.github/workflows/production-deploy.yml');
  const pkg = readJson('package.json', { scripts: {} });

  check('Daily workflow has manual and daily scheduled triggers',
    /workflow_dispatch:/.test(daily) && /cron:\s*['"]20 5 \* \* \*['"]/.test(daily));
  check('Weekly workflow has manual and weekly scheduled triggers',
    /workflow_dispatch:/.test(weekly) && /cron:\s*['"]40 6 \* \* 0['"]/.test(weekly));
  check('Daily workflow prevents overlapping runs',
    /group:\s*daily-investigation-machine/.test(daily) && /cancel-in-progress:\s*true/.test(daily));
  check('Weekly workflow preserves an active deep sweep',
    /group:\s*weekly-investigation-machine/.test(weekly) && /cancel-in-progress:\s*false/.test(weekly));
  check('Daily workflow runs source search, monitoring and preservation',
    ['run-investigation-machine.js daily', 'monitor-source-changes.js daily', 'harden-source-change-preservation.js daily']
      .every(marker => daily.includes(marker)));
  check('Weekly workflow runs source search, monitoring and preservation',
    ['run-investigation-machine.js weekly', 'monitor-source-changes.js weekly', 'harden-source-change-preservation.js weekly']
      .every(marker => weekly.includes(marker)));
  check('Both workflows rebuild live intelligence and search',
    [daily, weekly].every(text => text.includes('update-live-intel.js') && text.includes('update-seven-day-intel.js')
      && text.includes('repair-search-system.js') && text.includes('extend-search-with-investigations.js')));
  check('Production deploy is scheduled and manually dispatchable',
    /workflow_dispatch:/.test(deploy) && /cron:\s*['"]35 \*\/6 \* \* \*['"]/.test(deploy));
  check('Production deploy listens for successful investigation workflow completion',
    /workflow_run:/.test(deploy)
      && /Daily Investigation Machine/.test(deploy)
      && /Weekly Investigation Machine/.test(deploy)
      && /types:\s*\[\s*completed\s*\]/.test(deploy));
  check('Production deploy ignores failed upstream workflow completions',
    /github\.event\.workflow_run\.conclusion\s*==\s*['"]success['"]/.test(deploy));
  check('Production deploy checks out latest main instead of queued SHA',
    /ref:\s*main/.test(deploy) && /DEPLOY_COMMIT_SHA=\$\(git rev-parse HEAD\)/.test(deploy));
  check('Production deployment remains freshness fail-closed',
    deploy.includes('production-freshness-guard.js') && deploy.includes('production-deploy-guard.js'));
  check('Daily and weekly workflows retain failure artifacts',
    daily.includes('if: always()') && weekly.includes('if: always()'));
  check('Clock system is part of normal build and final mission reconciliation',
    String(pkg.scripts?.build || '').includes('build-public-usefulness-clock-system.js')
      && String(pkg.scripts?.['finalize-mission-surfaces'] || '').includes('build-public-usefulness-clock-system.js'));
  report.metrics.contracts = { dailyCron: '05:20 UTC daily', weeklyCron: '06:40 UTC Sunday', deployCron: 'every six hours at :35' };
}

function captureBaseline() {
  const files = [
    'data/investigation-source-registry.json',
    'data/investigation-source-state.json',
    'data/investigation-ledger.json',
    'data/investigation-status.json',
    'data/investigation-source-pulls/daily-latest.json',
    'data/source-change-ledger.json',
    'data/live-intel.json',
    'data/daily-investigation-conclusions.json',
    'data/daily-power-conclusions.json',
    'data/daily-brain-brief.json',
    'data/outcome-briefings.json',
    'data/global-risk-clocks.json',
    'data/clock-wall.json'
  ];
  const clocks = readJson('data/global-risk-clocks.json', { clocks: [] });
  const baseline = {
    generatedAt: new Date().toISOString(),
    files: Object.fromEntries(files.map(file => [file, { exists: exists(file), sha256: fileSha(file) }])),
    clocks: clockSnapshot(clocks)
  };
  writeJson('downloads/auto-update-deep-test-baseline.json', baseline);
  check('Baseline captured', Object.values(baseline.files).every(item => item.exists), { files: files.length });
  report.metrics.baselineFiles = files.length;
}

function verifyOutputs(afterBuild = false) {
  const registry = readJson('data/investigation-source-registry.json', { sources: [], lanes: [] });
  const pull = readJson('data/investigation-source-pulls/daily-latest.json', {});
  const status = readJson('data/investigation-status.json', {});
  const state = readJson('data/investigation-source-state.json', { sources: {} });
  const ledger = readJson('data/investigation-ledger.json', { findings: [] });
  const changes = readJson('data/source-change-ledger.json', { changes: [] });
  const daily = readJson('data/daily-investigation-conclusions.json', {});
  const weekly = readJson('data/weekly-investigation-conclusions.json', {});
  const clocks = readJson('data/global-risk-clocks.json', { clocks: [] });
  const wall = readJson('data/clock-wall.json', { clocks: [] });
  const homepage = readJson('data/homepage-command-surface.json', { criticalClocks: [] });
  const freshnessPolicy = readJson('data/production-freshness-policy.json', { datasets: [] });

  const sourceIds = (registry.sources || []).map(source => source.id);
  const pullIds = (pull.results || []).map(item => item.sourceId);
  const findingIds = (ledger.findings || []).map(item => item.id);
  const changeIds = (changes.changes || []).map(item => item.id);
  const slugs = (clocks.clocks || []).map(clock => clock.slug);
  const wallSlugs = (wall.clocks || []).map(clock => clock.slug);
  const fetched = (pull.results || []).filter(item => item.status === 'fetched');
  const failureRatio = Number(pull.selectedSources || 0) > 0 ? Number(pull.failedSources || 0) / Number(pull.selectedSources) : 1;

  check('Source registry has unique IDs and valid lanes',
    sourceIds.length >= 12 && unique(sourceIds) && (registry.lanes || []).length >= 5);
  check('Every registered source has a valid URL and schedule',
    (registry.sources || []).every(source => validHttp(source.url)
      && Array.isArray(source.frequency) && source.frequency.some(item => ['daily', 'weekly'].includes(item))));
  check('Daily live pull completed successfully', pull.ok === true && pull.mode === 'daily');
  check('Daily live pull fetched a healthy source majority',
    Number(pull.fetchedSources || 0) >= Math.max(1, Math.ceil(Number(pull.selectedSources || 0) * 0.75)),
    { selected: pull.selectedSources, fetched: pull.fetchedSources, failed: pull.failedSources });
  check('Daily pull source IDs are unique and reconcile with counts',
    unique(pullIds) && pullIds.length === Number(pull.selectedSources || 0)
      && fetched.length === Number(pull.fetchedSources || 0));
  check('Fetched source records contain hashes, bytes and HTTP success',
    fetched.every(item => Number(item.statusCode) >= 200 && Number(item.statusCode) < 400
      && Number(item.bytes) > 0 && /^[a-f0-9]{64}$/i.test(String(item.bodyHash || ''))));
  check('Source failure ratio stays below 25 percent', failureRatio <= 0.25, { failureRatio });
  if (failureRatio > 0) warn('One or more live sources failed during the audit.', { failures: pull.failedSources });

  check('Investigation status reconciles with the daily pull',
    Number(status.fetchedSources) === Number(pull.fetchedSources)
      && Number(status.failedSources) === Number(pull.failedSources)
      && Number(status.ledgerFindings) === Number(pull.ledgerFindings));
  check('Source state records every attempted daily source',
    pullIds.every(id => state.sources && state.sources[id] && state.sources[id].lastAttempt));
  check('Investigation ledger IDs are unique and bounded',
    findingIds.length > 0 && findingIds.length <= 2500 && unique(findingIds));
  check('Ledger findings preserve evidence boundaries and mechanisms',
    (ledger.findings || []).every(item => item.id && item.title && validHttp(item.itemUrl || item.sourceUrl)
      && item.evidenceGrade && item.status && item.evidenceBoundary && item.mechanism
      && Array.isArray(item.nextRecords) && item.nextRecords.length >= 2));
  check('Daily and weekly conclusions retain allegation boundaries',
    /charges and allegations are not guilt/i.test(String(daily.boundary || ''))
      && /charges and allegations are not guilt/i.test(String(weekly.boundary || '')));
  check('Daily conclusion source summary reconciles with pull',
    Number(daily.summary?.sourcesFetched || 0) === Number(pull.fetchedSources || 0)
      && Number(daily.summary?.sourceFailures || 0) === Number(pull.failedSources || 0));
  check('Source-change ledger uses unique IDs and explicit boundary',
    unique(changeIds) && /not automatic evidence of wrongdoing/i.test(String(changes.evidenceBoundary || '')));
  check('Source changes preserve alternative explanations and next records',
    (changes.changes || []).every(item => item.changeType && item.notEstablished
      && item.alternativeExplanation && Array.isArray(item.nextRecordRequired)));

  for (const item of freshnessPolicy.datasets || []) {
    const data = readJson(item.file, {});
    const timestamp = (item.timestampFields || []).map(field => field.split('.').reduce((v, key) => v && v[key], data)).find(Boolean);
    const array = item.minimumArray ? item.minimumArray.split('.').reduce((v, key) => v && v[key], data) : null;
    check(`Freshness policy passes for ${item.id}`,
      ageHours(timestamp) <= Number(item.maxAgeHours)
        && (!item.minimumArray || (Array.isArray(array) && array.length >= Number(item.minimumCount || 0))),
      { timestamp, ageHours: Number(ageHours(timestamp).toFixed(2)) });
  }

  const practical = (clocks.clocks || []).filter(clock => clock.automaticUpdate && !clock.speculationOnly);
  const speculative = (clocks.clocks || []).filter(clock => clock.speculationOnly);
  check('Canonical clock registry contains exactly 81 unique clocks',
    slugs.length === 81 && unique(slugs));
  check('Clock registry contains 20 practical and 49 speculative automatic clocks',
    practical.length === 20 && speculative.length === 49,
    { practical: practical.length, speculative: speculative.length });
  check('Clock wall mirrors every canonical clock exactly once',
    wallSlugs.length === 81 && unique(wallSlugs) && slugs.every(slug => wallSlugs.includes(slug)));
  check('Automatic clocks expose fingerprints, reasons, caps and score bounds',
    [...practical, ...speculative].every(clock => /^[a-f0-9]{64}$/i.test(String(clock.evidenceFingerprint || ''))
      && clock.automaticUpdateStatus && clock.automaticUpdateReason
      && Number(clock.maxMovementPerBuild) >= 1
      && Number(clock.score) >= Number(clock.scoreFloor || 0)
      && Number(clock.score) <= Number(clock.scoreCeiling || 100)));
  check('Speculation clocks are excluded from homepage alarms',
    speculative.every(clock => clock.homepageEligible === false)
      && !(homepage.criticalClocks || []).some(clock => String(clock.slug || '').startsWith('spec-')));
  const disabledClasses = new Set(['internet mythology', 'paranormal claim', 'unsupported extreme allegation']);
  check('High-risk speculation classes cannot increase automatically',
    speculative.filter(clock => disabledClasses.has(clock.claimClass))
      .every(clock => clock.automaticEvidenceGate?.mode === 'automatic-increase-disabled'));
  check('No clock moved beyond its per-build cap',
    [...practical, ...speculative].every(clock => Math.abs(Number(clock.automaticScoreMovement || 0)) <= Number(clock.maxMovementPerBuild || 0)));

  const requiredPages = [
    'investigation-machine.html', 'daily-investigation-conclusions.html', 'weekly-investigation-report.html',
    'investigation-source-ledger.html', 'source-changes.html', 'live-intel.html', 'daily-brain-brief.html',
    'outcome-briefings.html', 'timers.html', 'ai-speculative-conclusions.html', 'search.html'
  ];
  check('All automatic-update public pages exist', requiredPages.every(exists), { pages: requiredPages.length });
  check('Generated pages expose evidence boundaries',
    requiredPages.filter(file => file !== 'search.html').every(file => /boundary|evidence/i.test(read(file))));
  check('Search index and investigation smoke report exist',
    exists('search-index.json') && exists('downloads/search-investigation-smoke-test.json'));

  if (afterBuild) {
    const mirrored = [
      'data/live-intel.json',
      'data/daily-investigation-conclusions.json',
      'data/daily-power-conclusions.json',
      'data/daily-brain-brief.json',
      'data/outcome-briefings.json',
      'data/global-risk-clocks.json',
      'data/clock-wall.json',
      'timers.html',
      'ai-speculative-conclusions.html',
      'search.html',
      'search.js'
    ];
    check('Cloudflare output contains all current automatic-update surfaces',
      mirrored.every(file => exists(`_site/${file}`)));
    check('Cloudflare output matches authoritative root files byte-for-byte',
      mirrored.every(file => fileSha(file) === fileSha(`_site/${file}`)));
    report.metrics.mirroredFiles = mirrored.length;
  }

  report.metrics.liveRun = {
    selectedSources: pull.selectedSources,
    fetchedSources: pull.fetchedSources,
    failedSources: pull.failedSources,
    parsedItems: pull.parsedItems,
    ledgerFindings: findingIds.length,
    sourceChanges: changeIds.length,
    clocks: slugs.length,
    practicalClocks: practical.length,
    speculativeClocks: speculative.length
  };
}

function testIdempotency() {
  const before = readJson('data/global-risk-clocks.json', { clocks: [] });
  const first = run('clock-build-first', [at('scripts/build-public-usefulness-clock-system.js')]);
  check('First idempotency clock build succeeds', first.status === 0, { status: first.status });
  const middle = readJson('data/global-risk-clocks.json', { clocks: [] });
  const second = run('clock-build-second', [at('scripts/build-public-usefulness-clock-system.js')]);
  check('Second idempotency clock build succeeds', second.status === 0, { status: second.status });
  const after = readJson('data/global-risk-clocks.json', { clocks: [] });

  const a = clockSnapshot(middle);
  const b = clockSnapshot(after);
  check('Repeated identical evidence holds every score',
    Object.keys(a).length === 81 && Object.keys(a).every(slug => a[slug].score === b[slug].score));
  check('Repeated identical evidence preserves every fingerprint',
    Object.keys(a).every(slug => a[slug].fingerprint === b[slug].fingerprint));
  check('Second pass reports no movement on unchanged evidence',
    Object.keys(b).every(slug => b[slug].movement === 0 || b[slug].status !== 'evidence-changed-score-updated'));

  const beforeMap = clockSnapshot(before);
  const changedAcrossFirst = Object.keys(a).filter(slug => beforeMap[slug] && beforeMap[slug].score !== a[slug].score);
  report.metrics.idempotency = { clocksChecked: Object.keys(a).length, scoreChangesOnFirstPass: changedAcrossFirst.length, scoreChangesOnSecondPass: 0 };
}

function withBackups(files, fn) {
  const backups = new Map();
  for (const file of files) {
    backups.set(file, exists(file) ? fs.readFileSync(at(file)) : null);
  }
  try { return fn(); } finally {
    for (const [file, data] of backups) {
      if (data === null) fs.rmSync(at(file), { force: true, recursive: true });
      else {
        fs.mkdirSync(path.dirname(at(file)), { recursive: true });
        fs.writeFileSync(at(file), data);
      }
    }
  }
}

function setTimestamp(object, fields, value) {
  const field = fields[0];
  const parts = field.split('.');
  let target = object;
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  target[parts.at(-1)] = value;
}

function testFaults() {
  const policy = readJson('data/production-freshness-policy.json', { datasets: [] });
  const freshnessFiles = [...new Set((policy.datasets || []).map(item => item.file))];
  withBackups([...freshnessFiles, 'downloads/production-freshness-guard.json'], () => {
    const stale = new Date(Date.now() - 96 * 3600000).toISOString();
    const item = policy.datasets[0];
    const data = readJson(item.file, {});
    setTimestamp(data, item.timestampFields, stale);
    writeJson(item.file, data);
    const result = run('stale-production-guard', [at('scripts/production-freshness-guard.js')], {
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_WORKFLOW: 'Matrix Reprogrammed Production Deploy',
        MATRIX_REQUIRE_PRODUCTION_FRESHNESS: '1'
      },
      echo: false
    });
    check('Production freshness guard rejects stale source data', result.status !== 0);
  });

  withBackups([...freshnessFiles, 'downloads/production-freshness-guard.json'], () => {
    const future = new Date(Date.now() + 90 * 60000).toISOString();
    const item = policy.datasets[0];
    const data = readJson(item.file, {});
    setTimestamp(data, item.timestampFields, future);
    writeJson(item.file, data);
    const result = run('future-production-guard', [at('scripts/production-freshness-guard.js')], {
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_WORKFLOW: 'Matrix Reprogrammed Production Deploy',
        MATRIX_REQUIRE_PRODUCTION_FRESHNESS: '1'
      },
      echo: false
    });
    check('Production freshness guard rejects far-future timestamps', result.status !== 0);
  });

  const touched = [
    'data/investigation-source-registry.json',
    'data/investigation-source-state.json',
    'data/investigation-ledger.json',
    'data/daily-investigation-conclusions.json',
    'data/weekly-investigation-conclusions.json',
    'data/investigation-source-pulls/daily-latest.json',
    'downloads/investigation-machine-run-report.json',
    'investigation-machine.html',
    'daily-investigation-conclusions.html',
    'weekly-investigation-report.html',
    'investigation-source-ledger.html',
    'investigation-pulse.js'
  ];
  withBackups(touched, () => {
    const registry = readJson('data/investigation-source-registry.json', {});
    registry.sources = [{
      id: 'deep-test-unreachable-source',
      label: 'Deep test unreachable source',
      lane: registry.lanes?.[0]?.id || 'government-enforcement',
      authority: 'primary-official',
      frequency: ['daily'],
      type: 'html',
      url: 'https://127.0.0.1:9/unreachable',
      keywords: ['test']
    }];
    writeJson('data/investigation-source-registry.json', registry);
    const ledgerBefore = readJson('data/investigation-ledger.json', { findings: [] }).findings || [];
    const result = run('all-source-outage', [at('scripts/run-investigation-machine.js'), 'daily'], {
      env: { INVESTIGATION_TIMEOUT_MS: '1000', INVESTIGATION_CONCURRENCY: '1' },
      timeout: 60000,
      echo: false
    });
    const outage = readJson('data/investigation-source-pulls/daily-latest.json', {});
    const ledgerAfter = readJson('data/investigation-ledger.json', { findings: [] }).findings || [];
    check('All-source outage fails the run', result.status !== 0 && outage.ok === false);
    check('All-source outage is recorded explicitly', Number(outage.failedSources) === 1 && /failed/.test(outage.results?.[0]?.status || ''));
    check('All-source outage preserves the prior evidence ledger',
      ledgerAfter.length === ledgerBefore.length && ledgerAfter.every((item, index) => item.id === ledgerBefore[index]?.id));
  });

  withBackups(touched, () => {
    const registry = readJson('data/investigation-source-registry.json', {});
    const healthy = (registry.sources || []).find(source => (source.frequency || []).includes('daily') && !source.requiredEnv);
    registry.sources = [healthy, {
      id: 'deep-test-partial-failure',
      label: 'Deep test partial failure',
      lane: healthy?.lane || registry.lanes?.[0]?.id,
      authority: 'primary-official',
      frequency: ['daily'],
      type: 'html',
      url: 'https://127.0.0.1:9/unreachable',
      keywords: ['test']
    }].filter(Boolean);
    writeJson('data/investigation-source-registry.json', registry);
    const result = run('partial-source-outage', [at('scripts/run-investigation-machine.js'), 'daily'], {
      env: { INVESTIGATION_TIMEOUT_MS: '3000', INVESTIGATION_CONCURRENCY: '2' },
      timeout: 90000,
      echo: false
    });
    const partial = readJson('data/investigation-source-pulls/daily-latest.json', {});
    check('Partial source outage does not destroy a healthy run',
      result.status === 0 && partial.ok === true && Number(partial.fetchedSources) >= 1 && Number(partial.failedSources) === 1);
    check('Partial source outage appears in conclusion failure list',
      (readJson('data/daily-investigation-conclusions.json', {}).sourceFailures || [])
        .some(item => item.sourceId === 'deep-test-partial-failure'));
  });

  report.metrics.faultInjection = {
    staleDataRejected: true,
    futureTimestampRejected: true,
    allSourceOutageFailedClosed: true,
    partialOutageDegradedGracefully: true
  };
}

switch (mode) {
  case 'contracts':
    testContracts();
    break;
  case 'baseline':
    captureBaseline();
    break;
  case 'verify':
    verifyOutputs(false);
    break;
  case 'verify-built':
    verifyOutputs(true);
    break;
  case 'idempotency':
    testIdempotency();
    break;
  case 'faults':
    testFaults();
    break;
  default:
    check('Known test mode supplied', false, { supplied: mode });
}
save();
