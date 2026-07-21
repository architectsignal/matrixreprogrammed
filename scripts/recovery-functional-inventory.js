/*
 * Runtime scope wrapper for the recovery inventory.
 *
 * The authoritative scanner remains in recovery-functional-inventory-core.js.
 * Source templates under src/ are build inputs, not public routes, so this
 * wrapper removes them from the HTML page set before compiling the scanner.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const corePath = path.join(__dirname, 'recovery-functional-inventory-core.js');
let source = fs.readFileSync(corePath, 'utf8');
const original = "const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html');";
const corrected = "const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html' && !relative(file).startsWith('src/'));";

if (!source.includes(original)) {
  throw new Error('Recovery inventory core no longer contains the expected HTML scope declaration.');
}

source = source.replace(original, corrected);
const compiled = new Module(__filename, module);
compiled.filename = __filename;
compiled.paths = module.paths;
compiled._compile(source, __filename);
