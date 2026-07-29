'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function assertSafeRoute(route, field = 'route') {
  if (typeof route !== 'string' || !route.trim()) throw new TypeError(`${field} must be a non-empty string`);
  const value = route.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//') || value.startsWith('/') || value.includes('\\')) {
    throw new Error(`${field} must be a root-relative site route`);
  }
  const pathname = value.split(/[?#]/, 1)[0];
  if (pathname.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`${field} contains an unsafe path segment`);
  }
  if (/[^\x20-\x7e]/.test(value)) throw new Error(`${field} contains control or non-ASCII characters`);
  return value;
}

function resolveInsideRoot(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Registry path escapes repository root: ${relativePath}`);
  }
  return target;
}

function readJson(rootDir, relativePath) {
  const filePath = resolveInsideRoot(rootDir, relativePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  return { filePath, raw, parsed: JSON.parse(raw) };
}

function collectPackPhrases(pack) {
  return {
    keywords: Array.isArray(pack.keywords) ? pack.keywords : [],
    subjects: Array.isArray(pack.subjectMap) ? pack.subjectMap : [],
    watch: Array.isArray(pack.weeklyWatch) ? pack.weeklyWatch : [],
    upgrades: Array.isArray(pack.evidenceUpgradePath) ? pack.evidenceUpgradePath : [],
  };
}

function loadRouteRegistry(rootDir) {
  const packsFile = readJson(rootDir, 'data/dossier-packs.json');
  const peopleFile = readJson(rootDir, 'data/epstein-people-index.json');
  const packs = packsFile.parsed.packs;
  const people = peopleFile.parsed.people;
  if (!Array.isArray(packs)) throw new Error('Dossier registry must contain packs');
  if (!Array.isArray(people)) throw new Error('People registry must contain people');

  const targets = [];
  const ids = new Set();
  for (const pack of packs) {
    if (!pack || typeof pack.slug !== 'string' || typeof pack.title !== 'string') {
      throw new Error('Every dossier pack requires slug and title');
    }
    const slug = slugify(pack.slug);
    if (!slug || slug !== pack.slug) throw new Error(`Dossier pack slug is not canonical: ${pack.slug}`);
    const targetId = `dossier-pack:${slug}`;
    if (ids.has(targetId)) throw new Error(`Duplicate route target: ${targetId}`);
    ids.add(targetId);
    targets.push({
      targetId,
      targetType: 'dossier_pack',
      title: pack.title,
      lane: slug,
      route: assertSafeRoute(`dossier-pack-${slug}.html`, `${targetId}.route`),
      evidenceRoute: assertSafeRoute(pack.evidenceRoute, `${targetId}.evidenceRoute`),
      machineRoute: assertSafeRoute(pack.machineRoute, `${targetId}.machineRoute`),
      phrases: collectPackPhrases(pack),
    });
  }

  for (const person of people) {
    if (!person || typeof person.name !== 'string' || !person.name.trim()) {
      throw new Error('Every person route target requires a name');
    }
    const slug = slugify(person.name);
    const targetId = `epstein-person:${slug}`;
    if (ids.has(targetId)) throw new Error(`Duplicate route target: ${targetId}`);
    ids.add(targetId);
    targets.push({
      targetId,
      targetType: 'person_tracker',
      title: person.name.trim(),
      exactNames: [person.name.trim()],
      route: assertSafeRoute('epstein-files.html#epstein-people-tracker', `${targetId}.route`),
      evidenceRoute: assertSafeRoute('downloads/epstein-people-index.json', `${targetId}.evidenceRoute`),
      evidenceClass: person.evidenceClass || '',
      boundary: person.boundary || '',
    });
  }

  const fingerprint = sha256(stableStringify({
    dossierPacks: sha256(packsFile.raw),
    peopleIndex: sha256(peopleFile.raw),
    targetIds: targets.map((target) => target.targetId),
  }));

  return {
    version: 1,
    fingerprint,
    loadedAt: new Date().toISOString(),
    sourceFiles: ['data/dossier-packs.json', 'data/epstein-people-index.json'],
    targets,
  };
}

module.exports = {
  assertSafeRoute,
  loadRouteRegistry,
  resolveInsideRoot,
  sha256,
  slugify,
  stableStringify,
};
