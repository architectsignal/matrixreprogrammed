'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const canonical = path.join(root, 'data', 'epstein-dossier-overlap-registry.json');
const compatibility = path.join(root, 'data', 'epstein-relationship-registry.json');
const reportPath = path.join(root, 'downloads', 'exposure-integrity-input-report.json');

if (!fs.existsSync(canonical)) throw new Error('Missing canonical data/epstein-dossier-overlap-registry.json');
const data = JSON.parse(fs.readFileSync(canonical, 'utf8'));
if (!data || typeof data !== 'object' || !data.subjects || !Object.keys(data.subjects).length) throw new Error('Canonical Epstein dossier overlap registry is empty or invalid');
fs.writeFileSync(compatibility, `${JSON.stringify(data, null, 2)}\n`);

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  canonical: 'data/epstein-dossier-overlap-registry.json',
  compatibilityAlias: 'data/epstein-relationship-registry.json',
  subjects: Object.keys(data.subjects).length,
  rule: 'The Exposure Integrity Engine consumes the canonical dossier-overlap data through a generated compatibility alias; no Epstein record is replaced or downgraded.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const outputRoot = path.join(root, '_site');
if (fs.existsSync(outputRoot)) {
  for (const relative of ['data/epstein-relationship-registry.json','downloads/exposure-integrity-input-report.json']) {
    const source = path.join(root, relative);
    const destination = path.join(outputRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}
console.log(`Exposure Integrity inputs prepared from canonical Epstein dossier overlap registry: ${report.subjects} subject(s).`);
