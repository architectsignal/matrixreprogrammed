'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'black-file.html');
const siteDir = path.join(root, '_site');

const primaryLinks = [
  ['start-here.html', 'Start Here'], ['books.html', 'Books'],
  ['amazon-store-books.html', 'Amazon Store'], ['power-atlas.html', 'Control System'],
  ['evidence-vault.html', 'Declassified Files'], ['live-intel.html', 'Live Intel'],
  ['videos.html', 'Rumble Channels'], ['search.html', 'Search']
];
const secondaryGroups = [
  ['Sell / Capture', [['optin-center.html', 'Opt-in Center'], ['offer-center.html', 'Offer Center']]],
  ['Evidence & Trust', [['trust-center.html', 'Trust Center'], ['black-file.html', 'Black File']]],
  ['Freedom Ecosystem', [['forum.html', 'Signal Board'], ['news.html', 'Intel Desk']]]
];

function link([href, label]) { return `<a href="${href}">${label}</a>`; }
const drawer = secondaryGroups.map(([label, links]) => `<div class="nav-group"><strong>${label}</strong>${links.map(link).join('')}</div>`).join('');
const nav = `<nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary">${primaryLinks.map(link).join('')}</div><details class="nav-more"><summary>More</summary><div class="nav-drawer">${drawer}</div></details></nav>`;
const header = `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a>${nav}</header>`;
const hero = '<!-- black-file-public-hero:start --><section class="hero wrap" data-black-file-public-hero="canonical"><div class="eyebrow">Free reader-initiation file</div><h1>THE BLACK FILE</h1><p class="lead" id="black-file-public-lead">The world does not run on headlines. It runs on systems. Enter the archive through public records, source trails and clearly separated analysis.</p><div class="cta-row"><a class="btn" href="#request">Request Access</a><a class="btn alt" href="downloads/the-black-file-matrix-reprogrammed.pdf" download>Download The PDF</a><a class="btn alt" href="books.html">Enter Archive</a></div></section><!-- black-file-public-hero:end -->';
const request = '<section class="section wrap"><div id="request" class="card redline"><h2>OPEN THE BLACK FILE</h2><p>Use the public PDF or continue into the archive. This route does not elevate allegations, associations or speculation into facts.</p><div class="cta-row"><a class="btn" href="downloads/the-black-file-matrix-reprogrammed.pdf" download>Download The PDF</a><a class="btn alt" href="books.html">Enter Archive</a></div></div></section>';

function isCompleteDocument(html) {
  return /<!doctype\s+html/i.test(html)
    && /<html\b/i.test(html)
    && /<body\b/i.test(html)
    && /<main\b/i.test(html)
    && /<header\b/i.test(html)
    && /\bnav-shell\b/i.test(html)
    && /data-black-file-public-hero=["']canonical["']/i.test(html)
    && /\bid=["']request["']/i.test(html);
}

function recoverContent(html) {
  let content = String(html || '').replace(/â†’/g, '→').replace(/â€”/g, '—');
  content = content
    .replace(/<!doctype[\s\S]*?<body\b[^>]*>/i, '')
    .replace(/<!--[\s]*black-file-public-hero:start[\s]*-->[\s\S]*?<!--[\s]*black-file-public-hero:end[\s]*-->/gi, '')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/^[\s\S]*?(?=<section\b)/i, '')
    .replace(/<\/main>[\s\S]*$/i, '')
    .trim();
  return content || '<section class="section wrap"><h2>Evidence route</h2><p>Open the evidence vault and source-document archive to continue the investigation.</p><div class="cta-row"><a class="btn" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="source-document-vault.html">Source Documents</a></div></section>';
}

if (!fs.existsSync(sourcePath)) throw new Error('Black File source is missing');
const before = fs.readFileSync(sourcePath, 'utf8');
let output = before;
if (!isCompleteDocument(before)) {
  const recovered = recoverContent(before);
  output = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>The Black File | Matrix Reprogrammed</title><meta name="description" content="A source-led gateway into the Matrix Reprogrammed evidence archive." /><link rel="stylesheet" href="styles.css" /><link rel="stylesheet" href="fixes.css" /><link rel="stylesheet" href="cinematic-pathways.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${header}<main>${hero}${request}${recovered}</main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Public records, official sources, sourced journalism, analysis and speculation remain explicitly separated.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script><script src="newsletter.js"></script><script src="investigation-pulse.js"></script></body></html>`;
  fs.writeFileSync(sourcePath, output);
}

if (fs.existsSync(siteDir)) {
  for (const relative of ['black-file.html', 'black-file']) {
    const target = path.join(siteDir, relative);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) throw new Error(`${target} is unexpectedly a directory`);
    fs.writeFileSync(target, output);
  }
}

console.log(`Black File document shell ${output === before ? 'verified' : 'repaired'}; protected navigation, request route and evidence boundary are present.`);

