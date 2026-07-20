'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const publicManifestDir = path.join(root, 'downloads', 'report-manifests');
const internalManifestDir = path.join(root, 'data', 'report-manifests');

fs.mkdirSync(internalManifestDir, { recursive: true });

let moved = 0;

function migrateDirectory(sourceDir, relativeDir = '') {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const relative = path.join(relativeDir, entry.name);
    const destination = path.join(internalManifestDir, relative);

    if (entry.isDirectory()) {
      fs.mkdirSync(destination, { recursive: true });
      migrateDirectory(source, relative);
      continue;
    }

    if (!entry.isFile()) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    moved += 1;
  }
}

if (fs.existsSync(publicManifestDir)) {
  migrateDirectory(publicManifestDir);
  fs.rmSync(publicManifestDir, { recursive: true, force: true });
}

if (fs.existsSync(publicManifestDir)) {
  throw new Error('Public PDF report-manifest directory still exists after relocation');
}

console.log(`PDF report manifests stored internally: ${moved} file(s) migrated to data/report-manifests.`);
