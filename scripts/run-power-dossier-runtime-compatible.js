'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const runtimePath = path.join(root, 'scripts', 'patch-power-dossier-runtime.js');

if (!fs.existsSync(registryPath)) throw new Error('Missing data/criminal-conduct-registry.json');
if (!fs.existsSync(runtimePath)) throw new Error('Missing scripts/patch-power-dossier-runtime.js');

const originalText = fs.readFileSync(registryPath, 'utf8');
const registry = JSON.parse(originalText);
const originalVersion = Number(registry.schemaVersion || 1);

try {
  if (originalVersion >= 2) {
    registry.schemaVersion = 1;
    registry.compatibilitySchemaVersion = originalVersion;
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  }

  const result = spawnSync(process.execPath, [runtimePath], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 50
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exitCode = result.status || 1;
} finally {
  fs.writeFileSync(registryPath, originalText);
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Power dossier runtime completed with criminal registry schema v${originalVersion} restored.`);
