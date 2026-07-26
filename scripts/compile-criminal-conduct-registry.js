const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const subjectsDir = path.join(root, 'data', 'criminal-conduct-subjects');
const reportPath = path.join(root, 'downloads', 'criminal-conduct-registry-compile.json');

if (!fs.existsSync(registryPath)) throw new Error('Missing data/criminal-conduct-registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
if (registry.schemaVersion !== 1 || !registry.categories) throw new Error('Invalid criminal conduct registry schema');

const inlineSubjects = registry.subjects && typeof registry.subjects === 'object' ? registry.subjects : {};
const subjects = { ...inlineSubjects };
const sourceFiles = [];
const failures = [];

if (fs.existsSync(subjectsDir)) {
  for (const name of fs.readdirSync(subjectsDir).filter(name => name.endsWith('.json')).sort()) {
    const file = path.join(subjectsDir, name);
    let payload;
    try { payload = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { failures.push(`${name}: invalid JSON (${error.message})`); continue; }
    const key = String(payload.key || payload.slug || '').trim();
    const subject = payload.subject && typeof payload.subject === 'object' ? payload.subject : payload;
    if (!key) { failures.push(`${name}: missing key or slug`); continue; }
    if (!subject.name || !Array.isArray(subject.records) || !Array.isArray(subject.powerRoles)) {
      failures.push(`${name}: subject requires name, powerRoles[] and records[]`);
      continue;
    }
    if (subjects[key] && JSON.stringify(subjects[key]) !== JSON.stringify(subject)) {
      failures.push(`${name}: duplicate subject key ${key}`);
      continue;
    }
    subjects[key] = subject;
    sourceFiles.push({ file: path.relative(root, file).replace(/\\/g, '/'), key, records: subject.records.length, powerRoles: subject.powerRoles.length });
  }
}

if (failures.length) {
  failures.forEach(item => console.error(`CRIMINAL CONDUCT REGISTRY COMPILE FAILURE: ${item}`));
  process.exit(1);
}

registry.subjects = subjects;
registry.updated = new Date().toISOString().slice(0, 10);
registry.modularSubjectDirectory = 'data/criminal-conduct-subjects';
registry.modularSubjectFiles = sourceFiles.map(item => item.file);
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

const result = {
  ok: true,
  generatedAt: new Date().toISOString(),
  subjectCount: Object.keys(subjects).length,
  recordCount: Object.values(subjects).reduce((sum, subject) => sum + (subject.records || []).length, 0),
  powerRoleCount: Object.values(subjects).reduce((sum, subject) => sum + (subject.powerRoles || []).length, 0),
  sourceFiles
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Criminal conduct registry compiled from ${sourceFiles.length} modular file(s): ${result.subjectCount} subject(s), ${result.recordCount} record(s), ${result.powerRoleCount} sourced power role(s).`);
