const fs = require('fs');
const path = require('path');

const root = process.cwd();
const brainPath = path.join(root, 'data', 'site-brain.json');
const problems = [];

function rel(file) {
  return path.join(root, file);
}

function exists(file) {
  return fs.existsSync(rel(file));
}

function read(file) {
  return fs.readFileSync(rel(file), 'utf8');
}

function fail(message) {
  problems.push(message);
}

function count(text, needle) {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

function loadBrain() {
  if (!fs.existsSync(brainPath)) {
    fail('data/site-brain.json missing');
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(brainPath, 'utf8'));
  } catch (error) {
    fail(`data/site-brain.json invalid JSON: ${error.message}`);
    return null;
  }
}

const brain = loadBrain();
if (brain) {
  const requiredFiles = brain.buildGuards && Array.isArray(brain.buildGuards.requiredFiles) ? brain.buildGuards.requiredFiles : [];
  for (const file of requiredFiles) {
    if (!exists(file)) fail(`missing required source file: ${file}`);
  }

  const workerFile = 'src/worker.js';
  if (exists(workerFile)) {
    const worker = read(workerFile);
    for (const forbidden of brain.cloudflare && brain.cloudflare.forbiddenOrigins ? brain.cloudflare.forbiddenOrigins : []) {
      if (worker.includes(forbidden)) fail(`Worker still contains forbidden origin marker: ${forbidden}`);
    }
    if (!worker.includes('env.ASSETS.fetch')) fail('Worker does not serve bundled Cloudflare ASSETS');
    if (!worker.includes('X-Matrix-Origin')) fail('Worker does not mark asset origin responses');
  }

  if (exists('wrangler.toml')) {
    const wrangler = read('wrangler.toml');
    if (!wrangler.includes(`name = "${brain.cloudflare.workerName}"`)) fail(`wrangler.toml worker name is not ${brain.cloudflare.workerName}`);
    if (!wrangler.includes(`directory = "./${brain.cloudflare.assetDirectory}"`)) fail(`wrangler.toml asset directory is not ./${brain.cloudflare.assetDirectory}`);
    if (!wrangler.includes(`binding = "${brain.cloudflare.assetBinding}"`)) fail(`wrangler.toml missing ${brain.cloudflare.assetBinding} binding`);
  }

  if (exists('index.html')) {
    const home = read('index.html');
    const marker = brain.freshness && brain.freshness.homepageCurrentMarker;
    if (marker && !home.includes(marker)) fail(`homepage missing current marker: ${marker}`);
    for (const stale of brain.freshness && brain.freshness.forbiddenStaleText ? brain.freshness.forbiddenStaleText : []) {
      if (home.includes(stale)) fail(`homepage contains stale text: ${stale}`);
    }
    for (const guard of brain.freshness && brain.freshness.duplicateGuards ? brain.freshness.duplicateGuards : []) {
      const found = count(home, guard.text);
      if (found > guard.max) fail(`homepage duplicate guard failed for ${guard.text}: ${found} > ${guard.max}`);
    }
  }

  if (exists('_site')) {
    for (const file of brain.buildGuards && brain.buildGuards.requiredOutputRoutes ? brain.buildGuards.requiredOutputRoutes : []) {
      if (!exists(file)) fail(`missing generated Cloudflare output route: ${file}`);
    }
    for (const file of brain.buildGuards && brain.buildGuards.forbiddenOutputFiles ? brain.buildGuards.forbiddenOutputFiles : []) {
      if (exists(file)) fail(`forbidden generated output file present: ${file}`);
    }
  }

  const report = {
    ok: problems.length === 0,
    checkedAt: new Date().toISOString(),
    brainVersion: brain.version,
    productionUrl: brain.productionUrl,
    problems
  };

  fs.writeFileSync(rel('site-brain-health-report.json'), JSON.stringify(report, null, 2));
}

if (problems.length) {
  console.error('\nMATRIX SITE BRAIN HEALTH CHECK FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}

console.log('MATRIX SITE BRAIN HEALTH CHECK PASSED');
console.log('Checked central brain config, stale homepage markers, duplicate guards, Cloudflare Worker asset serving, Wrangler config, source files, and generated _site routes when present.');
