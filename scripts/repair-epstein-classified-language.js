const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pagePath = path.join(root, 'epstein-email-network.html');
const commandPath = path.join(root, 'epstein-files.html');

function replaceAll(text, replacements) {
  let output = text;
  for (const [from, to] of replacements) output = output.split(from).join(to);
  return output;
}

if (!fs.existsSync(pagePath)) throw new Error('Missing Epstein email network page');

let page = fs.readFileSync(pagePath, 'utf8');
page = replaceAll(page, [
  ['Evidence-led map of approved Epstein email correspondence', 'Evidence-led map of classified Epstein email correspondence'],
  ['Approved investigator export:', 'Classified investigator export:'],
  ['No approved records released yet', 'No classified records released yet'],
  ['approved entities', 'classified entities'],
  ['documented edges', 'classified evidence edges'],
  ['Approved documented links:', 'Classified public-record links:'],
  ['Approved links:', 'Classified links:'],
  ['Search and filter the approved record', 'Search and filter the classified public record'],
  ['The graph will activate after approved records are exported.', 'The graph will activate after classified records are exported.'],
  ['No entities have passed owner review for public release.', 'No classified entities are available yet.'],
  ['No relationship edges have passed owner review for public release.', 'No classified relationship edges are available yet.'],
  ['No event records have passed owner review.', 'No classified event records are available yet.'],
  ['No financial records have passed owner review.', 'No classified financial records are available yet.'],
  ['No public evidence attached; this edge should not have been approved.', 'No public evidence attached; a visible edge must retain a source record.'],
  ['Only records individually approved in the private investigator are included.', 'All source-backed public records are included under visible evidence, identity and speculation lanes.'],
  ['Open approved public dataset', 'Open classified public-record dataset'],
  ['Approved public dataset', 'Classified public-record dataset'],
  ['Approved JSON downloads', 'Classified public-record JSON downloads'],
]);
fs.writeFileSync(pagePath, page);

if (fs.existsSync(commandPath)) {
  let command = fs.readFileSync(commandPath, 'utf8');
  command = replaceAll(command, [
    ['Search approved correspondence, introductions, meetings, institutions and financial references.', 'Search classified correspondence, introductions, meetings, institutions and financial references.'],
    ['Approved public data', 'Classified public-record data'],
  ]);
  fs.writeFileSync(commandPath, command);
}

console.log('Repaired Epstein relationship language for classified public-record publication.');
