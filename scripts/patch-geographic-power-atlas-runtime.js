const fs = require('fs');
const path = require('path');

const root = process.cwd();
const stableMapLibreVersion = '5.24.0';
const legacyMapLibreVersion = '6.0.0-20';
const stablePmtilesVersion = '4.4.1';
const mapLibreModuleUrl = `https://cdn.jsdelivr.net/npm/maplibre-gl@${stableMapLibreVersion}/dist/maplibre-gl.mjs`;
const mapLibreCssUrl = `https://cdn.jsdelivr.net/npm/maplibre-gl@${stableMapLibreVersion}/dist/maplibre-gl.css`;
const pmtilesModuleUrl = `https://cdn.jsdelivr.net/npm/pmtiles@${stablePmtilesVersion}/dist/esm/index.js`;
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
function patchAtlasAssetUrls(file) {
  if (!fs.existsSync(file)) return false;
  const before = fs.readFileSync(file, 'utf8');
  let after = before
    .replace(/https:\/\/unpkg\.com\/maplibre-gl@[^/]+\/dist\/maplibre-gl\.mjs/g, mapLibreModuleUrl)
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl@[^/]+\/dist\/maplibre-gl\.mjs/g, mapLibreModuleUrl)
    .replace(/https:\/\/unpkg\.com\/maplibre-gl@[^/]+\/dist\/maplibre-gl\.css/g, mapLibreCssUrl)
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl@[^/]+\/dist\/maplibre-gl\.css/g, mapLibreCssUrl)
    .replace(/https:\/\/unpkg\.com\/pmtiles@[^/]+\/dist\/esm\/index\.js/g, pmtilesModuleUrl)
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pmtiles@[^/]+\/dist\/esm\/index\.js/g, pmtilesModuleUrl)
    .split(`maplibre-gl@${legacyMapLibreVersion}`).join(`maplibre-gl@${stableMapLibreVersion}`);
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
const canonicalRuntimeMarkers = [
  mapLibreModuleUrl,
  pmtilesModuleUrl,
  'const MAPLIBRE_MODULE_URL',
  'mapModule.default || mapModule',
  'fetchAtlasData',
  'loadMapLibraries',
  'geographic-power-atlas-data.json',
  'geographic-power-atlas.geojson',
  'Accessible list updated.',
  'Interactive map unavailable'
];
function isCanonicalRuntime(source) {
  return canonicalRuntimeMarkers.every(marker => source.includes(marker))
    && !source.includes('https://unpkg.com/maplibre-gl@')
    && !source.includes('https://unpkg.com/pmtiles@')
    && !source.includes(`maplibre-gl@${legacyMapLibreVersion}`)
    && !source.includes('import * as maplibregl');
}

const changed = {
  page: patchAtlasAssetUrls(files.page),
  builder: patchAtlasAssetUrls(files.builder),
  runtimeCdn: patchAtlasAssetUrls(files.runtime),
  protectedRuntimeCdn: patchAtlasAssetUrls(files.protectedRuntime),
  seed: updateEngineVersion(files.seed),
  manifest: updateEngineVersion(files.manifest),
  aliasSynced: false,
  protectedRuntimeCreated: false,
  runtimeRestored: false
};

let runtimeBefore = read(files.runtime);
if (!fs.existsSync(files.protectedRuntime) && isCanonicalRuntime(runtimeBefore)) {
  write(files.protectedRuntime, runtimeBefore);
  changed.protectedRuntimeCreated = true;
}
if (!isCanonicalRuntime(runtimeBefore) && fs.existsSync(files.protectedRuntime)) {
  patchAtlasAssetUrls(files.protectedRuntime);
  const protectedSource = read(files.protectedRuntime);
  if (!isCanonicalRuntime(protectedSource)) throw new Error('Protected Geographic Atlas runtime is not canonical or CORS-safe.');
  write(files.runtime, protectedSource);
  runtimeBefore = protectedSource;
  changed.runtimeRestored = true;
}
if (!isCanonicalRuntime(runtimeBefore)) throw new Error('Geographic Atlas runtime could not be normalized to the CORS-safe canonical build.');

if (fs.existsSync(files.geojson)) {
  const source = read(files.geojson);
  if (!fs.existsSync(files.alias) || read(files.alias) !== source) {
    write(files.alias, source);
    changed.aliasSynced = true;
  }
}

const page = read(files.page);
const runtime = read(files.runtime);
const manifest = JSON.parse(read(files.manifest));
const data = JSON.parse(read(files.alias));
const failures = [];
for (const marker of [
  mapLibreCssUrl,
  'id="atlas-search"',
  'id="atlas-category"',
  'id="atlas-country"',
  'id="atlas-precision"',
  'id="atlas-reset"',
  'id="power-atlas-map"',
  'id="power-atlas-list"',
  'geographic-power-atlas.js'
]) if (!page.includes(marker)) failures.push(`geographic-power-atlas.html missing ${marker}`);
for (const marker of canonicalRuntimeMarkers) if (!runtime.includes(marker)) failures.push(`geographic-power-atlas.js missing ${marker}`);
for (const forbidden of [
  `maplibre-gl@${legacyMapLibreVersion}`,
  'https://unpkg.com/maplibre-gl@',
  'https://unpkg.com/pmtiles@',
  'import * as maplibregl',
  'import {Protocol}'
]) if (page.includes(forbidden) || runtime.includes(forbidden)) failures.push(`atlas contains obsolete or CORS-unsafe runtime marker ${forbidden}`);
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
  mapLibreModuleUrl,
  pmtilesModuleUrl,
  locations: Array.isArray(data.features) ? data.features.length : 0,
  countries: manifest.counts?.countries || 0,
  categories: manifest.counts?.categories || 0,
  runtimeMode: 'CORS-safe jsDelivr MapLibre runtime with accessible-list-first and local dark-grid fallback',
  changed,
  failures
};
write(files.report, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`GEOGRAPHIC ATLAS FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Geographic Power Atlas runtime passed: ${report.locations} locations, stable MapLibre ${stableMapLibreVersion}, CORS-safe module delivery enabled.`);
