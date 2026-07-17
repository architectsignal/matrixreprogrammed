const fs = require('fs');
const path = require('path');

const root = process.cwd();
const stableMapLibreVersion = '5.24.0';
const legacyMapLibreVersion = '6.0.0-20';
const stablePmtilesVersion = '4.4.1';
const mapLibreScriptUrl = `https://unpkg.com/maplibre-gl@${stableMapLibreVersion}/dist/maplibre-gl.js`;
const mapLibreCssUrl = `https://unpkg.com/maplibre-gl@${stableMapLibreVersion}/dist/maplibre-gl.css`;
const pmtilesModuleUrl = `https://unpkg.com/pmtiles@${stablePmtilesVersion}/dist/esm/index.js`;
const files = {
  page: path.join(root, 'geographic-power-atlas.html'),
  runtime: path.join(root, 'geographic-power-atlas.js'),
  protectedRuntime: path.join(root, 'templates', 'geographic-power-atlas.runtime.js'),
  builder: path.join(root, 'scripts', 'build-geographic-power-atlas.js'),
  seed: path.join(root, 'data', 'geographic-power-atlas-seed.json'),
  manifest: path.join(root, 'data', 'geographic-power-atlas.json'),
  geojson: path.join(root, 'data', 'geographic-power-atlas.geojson'),
  alias: path.join(root, 'data', 'geographic-power-atlas-data.json'),
  report: path.join(root, 'downloads', 'geographic-power-atlas-runtime-test.json')
};

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Geographic atlas file missing: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function patchMapLibreAssets(source) {
  return String(source)
    .replace(/https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm)\/maplibre-gl@[^/]+\/dist\/maplibre-gl\.(?:mjs|js)/g, mapLibreScriptUrl)
    .replace(/https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm)\/maplibre-gl@[^/]+\/dist\/maplibre-gl\.css/g, mapLibreCssUrl)
    .replace(/https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm)\/pmtiles@[^/]+\/dist\/esm\/index\.js/g, pmtilesModuleUrl)
    .split(`maplibre-gl@${legacyMapLibreVersion}`).join(`maplibre-gl@${stableMapLibreVersion}`);
}
function patchPageSource(source) {
  let next = patchMapLibreAssets(source)
    .replace(/<script\b[^>]*src=["'][^"']*maplibre-gl@[^"']*\/dist\/maplibre-gl\.(?:mjs|js)["'][^>]*><\/script>/gi, '');
  const localRuntime = /<script\s+type=["']module["']\s+src=["']geographic-power-atlas\.js["']><\/script>/i;
  const loader = `<script src="${mapLibreScriptUrl}"></script>`;
  if (localRuntime.test(next) && !next.includes(loader)) next = next.replace(localRuntime, `${loader}<script type="module" src="geographic-power-atlas.js"></script>`);
  return next;
}
function patchRuntimeSource(source) {
  let next = patchMapLibreAssets(source)
    .replace(/^const MAPLIBRE_MODULE_URL\s*=.*(?:\r?\n)+/m, '')
    .replace(/^const PMTILES_MODULE_URL\s*=.*$/m, `const PMTILES_MODULE_URL = '${pmtilesModuleUrl}';`);
  const replacement = `async function waitForMapLibre(timeoutMs=15000) {
  const deadline=Date.now()+timeoutMs;
  while ((!globalThis.maplibregl || typeof globalThis.maplibregl.Map !== 'function') && Date.now()<deadline) {
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  return globalThis.maplibregl;
}
async function loadMapLibraries() {
  const maplibregl=await waitForMapLibre();
  if (!maplibregl || typeof maplibregl.Map !== 'function') throw new Error('MapLibre browser bundle loaded without a usable Map constructor.');
  state.maplibregl=maplibregl;
  if ((state.manifest.pmtilesSources || []).some(source=>source && source.enabled)) {
    try {
      const pmModule=await import(PMTILES_MODULE_URL);
      state.Protocol=pmModule.Protocol || pmModule.default?.Protocol || null;
      if (state.Protocol) {
        const protocol=new state.Protocol();
        state.maplibregl.addProtocol('pmtiles',protocol.tile);
      }
    } catch (error) {
      console.warn('Optional PMTiles support did not load:',error);
    }
  }
}
async function init`;
  const pattern = /async function loadMapLibraries\(\) \{[\s\S]*?\n\}\nasync function init/;
  if (!pattern.test(next)) throw new Error('Geographic Atlas loadMapLibraries function could not be located.');
  return next.replace(pattern, replacement);
}
function updateFile(file, transform) {
  if (!fs.existsSync(file)) return false;
  const before = read(file);
  const after = transform(before);
  if (after !== before) write(file, after);
  return after !== before;
}
function updateEngineVersion(file) {
  if (!fs.existsSync(file)) return false;
  const json = JSON.parse(read(file));
  if (!json.engines || !json.engines.maplibre) return false;
  const changed = json.engines.maplibre.version !== stableMapLibreVersion;
  json.engines.maplibre.version = stableMapLibreVersion;
  if (changed) write(file, `${JSON.stringify(json, null, 2)}\n`);
  return changed;
}
function isCanonicalRuntime(source) {
  return [
    'const PMTILES_MODULE_URL',
    'async function waitForMapLibre',
    'globalThis.maplibregl',
    'MapLibre browser bundle loaded without a usable Map constructor.',
    'fetchAtlasData',
    'loadMapLibraries',
    'geographic-power-atlas-data.json',
    'geographic-power-atlas.geojson',
    'Accessible list updated.',
    'Interactive map unavailable'
  ].every(marker => source.includes(marker))
    && !source.includes('MAPLIBRE_MODULE_URL')
    && !source.includes('maplibre-gl.mjs')
    && !source.includes('mapModule.default || mapModule')
    && !source.includes('import * as maplibregl');
}

const changed = {
  page: updateFile(files.page, patchPageSource),
  builder: updateFile(files.builder, patchPageSource),
  runtime: updateFile(files.runtime, patchRuntimeSource),
  protectedRuntime: false,
  seed: updateEngineVersion(files.seed),
  manifest: updateEngineVersion(files.manifest),
  aliasSynced: false,
  protectedRuntimeCreated: false
};

const runtime = read(files.runtime);
if (!isCanonicalRuntime(runtime)) throw new Error('Geographic Atlas runtime could not be normalized to the supported MapLibre browser bundle.');
if (!fs.existsSync(files.protectedRuntime) || read(files.protectedRuntime) !== runtime) {
  write(files.protectedRuntime, runtime);
  changed.protectedRuntime = true;
  changed.protectedRuntimeCreated = true;
}

if (fs.existsSync(files.geojson)) {
  const source = read(files.geojson);
  if (!fs.existsSync(files.alias) || read(files.alias) !== source) {
    write(files.alias, source);
    changed.aliasSynced = true;
  }
}

const page = read(files.page);
const builder = read(files.builder);
const manifest = JSON.parse(read(files.manifest));
const data = JSON.parse(read(files.alias));
const failures = [];
for (const marker of [
  mapLibreCssUrl,
  mapLibreScriptUrl,
  'id="atlas-search"',
  'id="atlas-category"',
  'id="atlas-country"',
  'id="atlas-precision"',
  'id="atlas-reset"',
  'id="power-atlas-map"',
  'id="power-atlas-list"',
  'geographic-power-atlas.js'
]) if (!page.includes(marker)) failures.push(`geographic-power-atlas.html missing ${marker}`);
for (const marker of [mapLibreCssUrl,mapLibreScriptUrl,'geographic-power-atlas.js']) if (!builder.includes(marker)) failures.push(`build-geographic-power-atlas.js missing ${marker}`);
if (!isCanonicalRuntime(runtime)) failures.push('geographic-power-atlas.js is not the canonical browser-bundle runtime');
for (const forbidden of [
  `maplibre-gl@${legacyMapLibreVersion}`,
  'maplibre-gl.mjs',
  'MAPLIBRE_MODULE_URL',
  'mapModule.default || mapModule',
  'import * as maplibregl',
  'import {Protocol}'
]) if (page.includes(forbidden) || runtime.includes(forbidden) || builder.includes(forbidden)) failures.push(`atlas contains obsolete runtime marker ${forbidden}`);
if (!fs.existsSync(files.protectedRuntime)) failures.push('protected Geographic Atlas runtime template was not created');
if (manifest.engines?.maplibre?.version !== stableMapLibreVersion) failures.push('atlas manifest does not use stable MapLibre version');
if (!Array.isArray(data.features) || data.features.length < 1) failures.push('atlas GeoJSON contains no features');
for (const feature of data.features || []) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2 || !coords.every(Number.isFinite)) failures.push(`invalid coordinates for ${feature?.id || 'unknown feature'}`);
  const p = feature?.properties || {};
  if (!p.name || !p.country || !p.category || !p.precision || !p.sourceUrl) failures.push(`incomplete properties for ${feature?.id || 'unknown feature'}`);
}
const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mapLibreVersion: stableMapLibreVersion,
  mapLibreScriptUrl,
  mapLibreCssUrl,
  pmtilesModuleUrl,
  locations: Array.isArray(data.features) ? data.features.length : 0,
  countries: manifest.counts?.countries || 0,
  categories: manifest.counts?.categories || 0,
  runtimeMode: 'Official MapLibre browser bundle with global maplibregl, accessible-list-first rendering and local dark-grid fallback',
  changed,
  failures
};
write(files.report, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`GEOGRAPHIC ATLAS FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Geographic Power Atlas runtime passed: ${report.locations} locations, MapLibre ${stableMapLibreVersion} official browser bundle enabled.`);
