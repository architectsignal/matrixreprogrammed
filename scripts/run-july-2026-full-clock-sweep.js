'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const basePath = path.join(root, 'data', 'july-2026-speculative-source-catalog.json');
const supplementPath = path.join(root, 'data', 'july-2026-speculative-source-catalog-supplement.json');
const original = fs.readFileSync(basePath, 'utf8');
const base = JSON.parse(original);
const supplement = JSON.parse(fs.readFileSync(supplementPath, 'utf8'));
const merged = {
  ...base,
  sourceCatalog: {
    ...(base.sourceCatalog || {}),
    ...(supplement.sourceCatalog || {})
  }
};
fs.writeFileSync(basePath, JSON.stringify(merged, null, 2));
try {
  require('./apply-july-2026-full-clock-sweep.js');
} finally {
  fs.writeFileSync(basePath, original);
}
