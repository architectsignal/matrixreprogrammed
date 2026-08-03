const fs = require('fs');
const os = require('os');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const cleanupPath = path.join(repositoryRoot, 'scripts', 'cleanup-generated-machine-pages.js');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-generated-prune-'));
const previousCwd = process.cwd();

function write(relative, content = '<!doctype html><title>fixture</title>') {
  const file = path.join(temporaryRoot, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function exists(relative) {
  return fs.existsSync(path.join(temporaryRoot, relative));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  for (const prefix of ['', '_site/']) {
    write(`${prefix}entity-briefs/expected-brief.html`);
    write(`${prefix}entity-briefs/expected-brief`);
    write(`${prefix}entity-briefs/control-structure.html`);
    write(`${prefix}entity-briefs/control-structure`);
    write(`${prefix}entity-briefs/manifest.json`, '{}');

    write(`${prefix}entity-exposure/expected-exposure.html`);
    write(`${prefix}entity-exposure/expected-exposure`);
    write(`${prefix}entity-exposure/stale-exposure.html`);
    write(`${prefix}entity-exposure/stale-exposure`);

    write(`${prefix}reports/entity-expected.html`);
    write(`${prefix}reports/entity-expected`);
    write(`${prefix}reports/entity-stale.html`);
    write(`${prefix}reports/entity-stale`);
    write(`${prefix}reports/hand-authored-report.html`);
  }

  process.chdir(temporaryRoot);
  delete require.cache[require.resolve(cleanupPath)];
  const cleanup = require(cleanupPath);
  const removed = cleanup.pruneUnexpectedGeneratedMachinePages({
    entityBriefIds: ['expected-brief'],
    entityExposureIds: ['expected-exposure'],
    eliteReportIds: ['entity-expected']
  });

  assert(removed.entityBriefs.length === 4, `Expected four stale entity brief files removed, got ${removed.entityBriefs.length}.`);
  assert(removed.entityExposure.length === 4, `Expected four stale entity exposure files removed, got ${removed.entityExposure.length}.`);
  assert(removed.eliteReports.length === 4, `Expected four stale elite report files removed, got ${removed.eliteReports.length}.`);

  for (const prefix of ['', '_site/']) {
    assert(exists(`${prefix}entity-briefs/expected-brief.html`), `${prefix} expected entity brief HTML was removed.`);
    assert(exists(`${prefix}entity-briefs/expected-brief`), `${prefix} expected entity brief alias was removed.`);
    assert(!exists(`${prefix}entity-briefs/control-structure.html`), `${prefix} stale entity brief HTML survived.`);
    assert(!exists(`${prefix}entity-briefs/control-structure`), `${prefix} stale entity brief alias survived.`);
    assert(exists(`${prefix}entity-briefs/manifest.json`), `${prefix} non-page entity brief data was removed.`);

    assert(exists(`${prefix}entity-exposure/expected-exposure.html`), `${prefix} expected exposure HTML was removed.`);
    assert(exists(`${prefix}entity-exposure/expected-exposure`), `${prefix} expected exposure alias was removed.`);
    assert(!exists(`${prefix}entity-exposure/stale-exposure.html`), `${prefix} stale exposure HTML survived.`);
    assert(!exists(`${prefix}entity-exposure/stale-exposure`), `${prefix} stale exposure alias survived.`);

    assert(exists(`${prefix}reports/entity-expected.html`), `${prefix} expected elite report HTML was removed.`);
    assert(exists(`${prefix}reports/entity-expected`), `${prefix} expected elite report alias was removed.`);
    assert(!exists(`${prefix}reports/entity-stale.html`), `${prefix} stale elite report HTML survived.`);
    assert(!exists(`${prefix}reports/entity-stale`), `${prefix} stale elite report alias survived.`);
    assert(exists(`${prefix}reports/hand-authored-report.html`), `${prefix} hand-authored report was removed.`);
  }

  console.log('GENERATED MACHINE PAGE PRUNE TEST PASSED');
} finally {
  process.chdir(previousCwd);
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
