'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const sourceFile = path.join(__dirname, 'publish-release-metadata-assets-legacy.js');
let source = fs.readFileSync(sourceFile, 'utf8').replace(/\r\n/g, '\n');
const before = "if (health.data.workerScript !== 'src/worker-production.js') {\n  throw new Error('deploy-health.json does not identify the strict production Worker');\n}";
const after = "const healthModules = Array.isArray(health.data.modules) ? health.data.modules : [];\nconst supportedWorkerEntry = ['src/worker-production.js', 'src/worker-production-autonomy.js'].includes(health.data.workerScript);\nconst strictProductionWorkerReady = healthModules.some(module => module.file === 'src/worker-production.js' && module.ready === true);\nconst autonomyWrapperRequired = health.data.workerScript === 'src/worker-production-autonomy.js';\nconst autonomyWrapperReady = !autonomyWrapperRequired || healthModules.some(module => module.file === 'src/worker-production-autonomy.js' && module.ready === true);\nif (!supportedWorkerEntry || !strictProductionWorkerReady || !autonomyWrapperReady) {\n  throw new Error('deploy-health.json does not prove the strict production Worker and verified deployment entry');\n}";
const first = source.indexOf(before);
if (first < 0) throw new Error('Release metadata compatibility repair target is missing');
if (source.indexOf(before, first + before.length) >= 0) throw new Error('Release metadata compatibility repair target is duplicated');
source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;

const compiled = new Module(__filename, module.parent);
compiled.filename = __filename;
compiled.paths = module.paths;
compiled._compile(source, __filename);
