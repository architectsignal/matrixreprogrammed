'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const sourceFile = path.join(__dirname, 'audit-site-legacy.js');
let source = fs.readFileSync(sourceFile, 'utf8');

function replaceExact(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`Audit compatibility repair target missing: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`Audit compatibility repair target duplicated: ${label}`);
  return `${text.slice(0, first)}${after}${text.slice(first + before.length)}`;
}

source = replaceExact(
  source,
  "function isExternalOrProtocol(href) { return /^(https?:|mailto:|tel:|javascript:|data:)/i.test(href) || href.startsWith('#') || href === ''; }",
  "function isExternalOrProtocol(href) { return /^(https?:|mailto:|tel:|javascript:|data:)/i.test(href) || href.startsWith('//') || href.startsWith('#') || href === ''; }",
  'protocol-relative URL handling'
);
source = replaceExact(
  source,
  String.raw`    const resolved = path.normalize(path.join(path.dirname(file), target)).replace(/\\/g, '/');`,
  String.raw`    const resolved = target.startsWith('/')
      ? path.normalize(target === '/' ? 'index.html' : target.slice(1)).replace(/\\/g, '/')
      : path.normalize(path.join(path.dirname(file), target)).replace(/\\/g, '/');`,
  'root-relative site link resolution'
);

const compiled = new Module(__filename, module.parent);
compiled.filename = __filename;
compiled.paths = module.paths;
compiled._compile(source, __filename);
