'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const publicManifestDir = path.join(root, 'downloads', 'report-manifests');
const internalManifestDir = path.join(root, 'data', 'report-manifests');
const builderPath = path.join(root, 'scripts', 'build-deep-pdf-intelligence.mjs');
const publicBuilderLine = "const manifests=path.join(downloads,'report-manifests');";
const internalBuilderLine = "const manifests=path.join(root,'data','report-manifests');";

fs.mkdirSync(internalManifestDir, { recursive: true });

let moved = 0;
let builderPatched = false;

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

if (!fs.existsSync(builderPath)) {
  throw new Error('Deep PDF intelligence builder is missing');
}

let builder = fs.readFileSync(builderPath, 'utf8');
if (builder.includes(publicBuilderLine)) {
  builder = builder.replace(publicBuilderLine, internalBuilderLine);
  fs.writeFileSync(builderPath, builder);
  builderPatched = true;
} else if (!builder.includes(internalBuilderLine)) {
  throw new Error('Deep PDF report-manifest path could not be verified');
}

if (fs.existsSync(publicManifestDir)) {
  throw new Error('Public PDF report-manifest directory still exists after relocation');
}
if (!fs.readFileSync(builderPath, 'utf8').includes(internalBuilderLine)) {
  throw new Error('Deep PDF builder is not using the internal report-manifest directory');
}

console.log(`PDF report manifests stored internally: ${moved} file(s) migrated; builder ${builderPatched ? 'updated' : 'already current'}.`);
