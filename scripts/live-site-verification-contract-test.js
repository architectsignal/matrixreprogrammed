'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const verifier = read('scripts/live-site-verification.js');
const worker = read('src/worker-production.js');
const aliasOwner = read('scripts/patch-public-route-aliases.js');
const bridgeOwner = read('scripts/patch-public-static-route-bridge.js');

for (const marker of [
  "{ path: '/', markers: ['A PUBLIC MEMORY.'], mustInclude: ['POWER SHOULD HAVE']",
  "{ path: '/deploy-status', allowedStatuses: [401], markers: [], requireOrigin: true }",
  "{ path: '/search', markers: ['START WITH WHAT HAPPENED.'] }",
  "mustInclude: ['downloads/dossier-pack-black-file-starter.pdf']",
  "{ path: '/geographic-power-atlas.js', markers: ['loadMapLibraries']",
  "{ path: '/optin-center', markers: ['OPT-IN CENTER.'] }"
]) assert.ok(verifier.includes(marker), `live verifier is missing current contract: ${marker}`);

for (const [file, source] of [
  ['src/worker-production.js', worker],
  ['scripts/patch-public-route-aliases.js', aliasOwner],
  ['scripts/patch-public-static-route-bridge.js', bridgeOwner]
]) {
  assert.ok(source.includes("['/epstein', '/epstein-files.html']"), `${file} must preserve the /epstein public alias`);
}

for (const [file, marker] of [
  ['index.html', 'POWER SHOULD HAVE'],
  ['index.html', 'A PUBLIC MEMORY.'],
  ['search.html', 'START WITH WHAT HAPPENED.'],
  ['download-center.html', 'downloads/dossier-pack-black-file-starter.pdf'],
  ['geographic-power-atlas.js', 'loadMapLibraries'],
  ['geographic-power-atlas.js', 'fetchAtlasData'],
  ['geographic-power-atlas.js', 'Interactive map unavailable'],
  ['optin-center.html', 'OPT-IN CENTER.'],
  ['epstein-files.html', 'THE EPSTEIN FILES COMMAND CENTER']
]) assert.ok(read(file).includes(marker), `${file} is missing verifier-backed content: ${marker}`);

console.log(JSON.stringify({
  ok: true,
  currentPublicContracts: true,
  protectedDeployDashboard: true,
  epsteinWorkerAlias: true
}, null, 2));
