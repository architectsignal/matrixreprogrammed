'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const touched = [];

function patch(relative, transform) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}

patch('reverse-accountability-search.js', source => {
  let next = source;
  if (!next.includes('const answerClockRoute = record.publicAnswerClockRoute')) {
    next = next.replace(
      "    const redTeamRoute = record.redTeamMirrorRoute || `red-team-mirror.html#red-team-${encodeURIComponent(record.id || '')}`;",
      "    const redTeamRoute = record.redTeamMirrorRoute || `red-team-mirror.html#red-team-${encodeURIComponent(record.id || '')}`;\n    const answerClockRoute = record.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(record.id || '')}`;",
    );
  }
  if (!next.includes('const missingMissionRoute = record.missingRecordMissionsRoute')) {
    next = next.replace(
      "    const answerClockRoute = record.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(record.id || '')}`;",
      "    const answerClockRoute = record.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(record.id || '')}`;\n    const missingMissionRoute = record.missingRecordMissionsRoute || 'missing-record-missions.html';\n    const livedReceiptRoute = record.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${encodeURIComponent(record.id || '')}#submit`;",
    );
  }
  if (!next.includes('>Open answer clock</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>',
      '        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>\n        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
    );
  }
  if (!next.includes('>Solve missing records</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
      '        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>\n        <a href="${escapeHtml(missingMissionRoute)}">Solve missing records</a>\n        <a href="${escapeHtml(livedReceiptRoute)}">Submit a lived receipt</a>',
    );
  }
  return next;
});

patch('power-supply-chain.js', source => {
  let next = source;
  if (!next.includes('const redTeamRoute = chain.redTeamMirrorRoute')) {
    next = next.replace(
      "    const powerDiffRoute = chain.powerDiffRoute || `power-diff.html#diff-${encodeURIComponent(chain.sourceRecordId || '')}`;",
      "    const powerDiffRoute = chain.powerDiffRoute || `power-diff.html#diff-${encodeURIComponent(chain.sourceRecordId || '')}`;\n    const redTeamRoute = chain.redTeamMirrorRoute || `red-team-mirror.html#red-team-${encodeURIComponent(chain.sourceRecordId || '')}`;",
    );
  }
  if (!next.includes('const answerClockRoute = chain.publicAnswerClockRoute')) {
    next = next.replace(
      "    const redTeamRoute = chain.redTeamMirrorRoute || `red-team-mirror.html#red-team-${encodeURIComponent(chain.sourceRecordId || '')}`;",
      "    const redTeamRoute = chain.redTeamMirrorRoute || `red-team-mirror.html#red-team-${encodeURIComponent(chain.sourceRecordId || '')}`;\n    const answerClockRoute = chain.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(chain.sourceRecordId || '')}`;",
    );
  }
  if (!next.includes('const missingMissionRoute = chain.missingRecordMissionsRoute')) {
    next = next.replace(
      "    const answerClockRoute = chain.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(chain.sourceRecordId || '')}`;",
      "    const answerClockRoute = chain.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(chain.sourceRecordId || '')}`;\n    const missingMissionRoute = chain.missingRecordMissionsRoute || 'missing-record-missions.html';\n    const livedReceiptRoute = chain.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${encodeURIComponent(chain.sourceRecordId || '')}#submit`;",
    );
  }
  if (!next.includes('>Challenge the case</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(powerDiffRoute)}">See what changed</a>',
      '        <a href="${escapeHtml(powerDiffRoute)}">See what changed</a>\n        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>',
    );
  }
  if (!next.includes('>Open answer clock</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>',
      '        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>\n        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
    );
  }
  if (!next.includes('>Solve missing records</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
      '        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>\n        <a href="${escapeHtml(missingMissionRoute)}">Solve missing records</a>\n        <a href="${escapeHtml(livedReceiptRoute)}">Submit a lived receipt</a>',
    );
  }
  return next;
});

patch('evidence-half-life.js', source => {
  let next = source;
  if (!next.includes('const redTeamRoute = entry.redTeamMirrorRoute')) {
    next = next.replace(
      "    const powerDiffRoute = entry.powerDiffRoute || `power-diff.html#diff-${encodeURIComponent(entry.sourceRecordId || '')}`;",
      "    const powerDiffRoute = entry.powerDiffRoute || `power-diff.html#diff-${encodeURIComponent(entry.sourceRecordId || '')}`;\n    const redTeamRoute = entry.redTeamMirrorRoute || `red-team-mirror.html#red-team-${encodeURIComponent(entry.sourceRecordId || '')}`;",
    );
  }
  if (!next.includes('const answerClockRoute = entry.publicAnswerClockRoute')) {
    next = next.replace(
      "    const redTeamRoute = entry.redTeamMirrorRoute || `red-team-mirror.html#red-team-${encodeURIComponent(entry.sourceRecordId || '')}`;",
      "    const redTeamRoute = entry.redTeamMirrorRoute || `red-team-mirror.html#red-team-${encodeURIComponent(entry.sourceRecordId || '')}`;\n    const answerClockRoute = entry.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(entry.sourceRecordId || '')}`;",
    );
  }
  if (!next.includes('const missingMissionRoute = entry.missingRecordMissionsRoute')) {
    next = next.replace(
      "    const answerClockRoute = entry.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(entry.sourceRecordId || '')}`;",
      "    const answerClockRoute = entry.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(entry.sourceRecordId || '')}`;\n    const missingMissionRoute = entry.missingRecordMissionsRoute || 'missing-record-missions.html';\n    const livedReceiptRoute = entry.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${encodeURIComponent(entry.sourceRecordId || '')}#submit`;",
    );
  }
  if (!next.includes('>Challenge the case</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(powerDiffRoute)}">See what changed</a>',
      '        <a href="${escapeHtml(powerDiffRoute)}">See what changed</a>\n        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>',
    );
  }
  if (!next.includes('>Open answer clock</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>',
      '        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>\n        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
    );
  }
  if (!next.includes('>Solve missing records</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
      '        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>\n        <a href="${escapeHtml(missingMissionRoute)}">Solve missing records</a>\n        <a href="${escapeHtml(livedReceiptRoute)}">Submit a lived receipt</a>',
    );
  }
  return next;
});

patch('power-diff.js', source => {
  let next = source;
  if (!next.includes('const redTeamAction = entry.redTeamMirrorRoute')) {
    next = next.replace(
      "    const changes = Array.isArray(entry.changes) ? entry.changes : [];",
      "    const changes = Array.isArray(entry.changes) ? entry.changes : [];\n    const redTeamAction = entry.redTeamMirrorRoute ? `<a href=\"${escapeHtml(entry.redTeamMirrorRoute)}\">Challenge the case</a>` : '';",
    );
  }
  if (!next.includes('const answerClockAction = entry.publicAnswerClockRoute')) {
    next = next.replace(
      "    const redTeamAction = entry.redTeamMirrorRoute ? `<a href=\"${escapeHtml(entry.redTeamMirrorRoute)}\">Challenge the case</a>` : '';",
      "    const redTeamAction = entry.redTeamMirrorRoute ? `<a href=\"${escapeHtml(entry.redTeamMirrorRoute)}\">Challenge the case</a>` : '';\n    const answerClockAction = entry.publicAnswerClockRoute ? `<a href=\"${escapeHtml(entry.publicAnswerClockRoute)}\">Open answer clock</a>` : '';",
    );
  }
  if (!next.includes('const missingMissionAction = entry.missingRecordMissionsRoute')) {
    next = next.replace(
      "    const answerClockAction = entry.publicAnswerClockRoute ? `<a href=\"${escapeHtml(entry.publicAnswerClockRoute)}\">Open answer clock</a>` : '';",
      "    const answerClockAction = entry.publicAnswerClockRoute ? `<a href=\"${escapeHtml(entry.publicAnswerClockRoute)}\">Open answer clock</a>` : '';\n    const missingMissionAction = entry.missingRecordMissionsRoute ? `<a href=\"${escapeHtml(entry.missingRecordMissionsRoute)}\">Solve missing records</a>` : '';\n    const livedReceiptAction = entry.livedConsequenceReceiptsRoute ? `<a href=\"${escapeHtml(entry.livedConsequenceReceiptsRoute)}\">Submit a lived receipt</a>` : '';",
    );
  }
  if (!next.includes('${redTeamAction}')) {
    next = next.replace(
      '        <a href="${escapeHtml(entry.evidenceHalfLifeRoute || \'evidence-half-life.html\')}">Open Evidence Half-Life</a>',
      '        <a href="${escapeHtml(entry.evidenceHalfLifeRoute || \'evidence-half-life.html\')}">Open Evidence Half-Life</a>\n        ${redTeamAction}',
    );
  }
  if (!next.includes('${answerClockAction}')) next = next.replace('        ${redTeamAction}', '        ${redTeamAction}\n        ${answerClockAction}');
  if (!next.includes('${missingMissionAction}')) next = next.replace('        ${answerClockAction}', '        ${answerClockAction}\n        ${missingMissionAction}\n        ${livedReceiptAction}');
  return next;
});

patch('red-team-mirror.js', source => {
  let next = source;
  if (!next.includes('const answerClockRoute = mirror.publicAnswerClockRoute')) {
    next = next.replace(
      "    const sourceUrl = mirror.source?.url || '';",
      "    const sourceUrl = mirror.source?.url || '';\n    const answerClockRoute = mirror.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(mirror.sourceRecordId || '')}`;",
    );
  }
  if (!next.includes('const missingMissionRoute = mirror.missingRecordMissionsRoute')) {
    next = next.replace(
      "    const answerClockRoute = mirror.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(mirror.sourceRecordId || '')}`;",
      "    const answerClockRoute = mirror.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${encodeURIComponent(mirror.sourceRecordId || '')}`;\n    const missingMissionRoute = mirror.missingRecordMissionsRoute || 'missing-record-missions.html';\n    const livedReceiptRoute = mirror.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${encodeURIComponent(mirror.sourceRecordId || '')}#submit`;",
    );
  }
  if (!next.includes('>Open answer clock</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(mirror.powerDiffRoute || \'power-diff.html\')}">Open Power Diff</a>',
      '        <a href="${escapeHtml(mirror.powerDiffRoute || \'power-diff.html\')}">Open Power Diff</a>\n        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
    );
  }
  if (!next.includes('>Solve missing records</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
      '        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>\n        <a href="${escapeHtml(missingMissionRoute)}">Solve missing records</a>\n        <a href="${escapeHtml(livedReceiptRoute)}">Submit a lived receipt</a>',
    );
  }
  return next;
});

patch('public-answer-clock.js', source => {
  let next = source;
  if (!next.includes('const missingMissionRoute = clock.missingRecordMissionsRoute')) {
    next = next.replace(
      "    const events = Array.isArray(clock.events) ? clock.events : [];",
      "    const events = Array.isArray(clock.events) ? clock.events : [];\n    const missingMissionRoute = clock.missingRecordMissionsRoute || 'missing-record-missions.html';\n    const livedReceiptRoute = clock.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${encodeURIComponent(clock.sourceRecordId || '')}#submit`;",
    );
  }
  if (!next.includes('>Solve missing records</a>')) {
    next = next.replace(
      '        <a href="accountability-review-inbox.html">Open human review inbox</a>',
      '        <a href="accountability-review-inbox.html">Open human review inbox</a>\n        <a href="${escapeHtml(missingMissionRoute)}">Solve missing records</a>\n        <a href="${escapeHtml(livedReceiptRoute)}">Submit a lived receipt</a>',
    );
  }
  return next;
});

patch('missing-record-missions.js', source => {
  let next = source;
  if (!next.includes('const livedReceiptRoute = mission.livedConsequenceReceiptsRoute')) {
    next = next.replace(
      "    const accepted = Array.isArray(mission.submissionsAccepted) ? mission.submissionsAccepted : [];",
      "    const accepted = Array.isArray(mission.submissionsAccepted) ? mission.submissionsAccepted : [];\n    const livedReceiptRoute = mission.livedConsequenceReceiptsRoute || `lived-consequence-receipts.html?record=${encodeURIComponent(mission.sourceRecordId || '')}#submit`;",
    );
  }
  if (!next.includes('>Submit a lived receipt</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(mission.publicAnswerClockRoute || \'public-answer-clock.html\')}">Open answer clock</a>',
      '        <a href="${escapeHtml(mission.publicAnswerClockRoute || \'public-answer-clock.html\')}">Open answer clock</a>\n        <a href="${escapeHtml(livedReceiptRoute)}">Submit a lived receipt</a>',
    );
  }
  return next;
});

const upstreamToRedTeam = ['reverse-accountability-search.js', 'power-supply-chain.js', 'evidence-half-life.js', 'power-diff.js'];
for (const relative of upstreamToRedTeam) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('red-team-mirror.html') || !source.includes('Challenge the case')) throw new Error(`${path.relative(root, file)} is not connected to Red-Team Mirror`);
  }
}

const answerClockSources = [...upstreamToRedTeam, 'red-team-mirror.js'];
for (const relative of answerClockSources) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('public-answer-clock.html') || !source.includes('Open answer clock')) throw new Error(`${path.relative(root, file)} is not connected to Public Answer Clock`);
  }
}

const missingMissionSources = [...answerClockSources, 'public-answer-clock.js'];
for (const relative of missingMissionSources) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('missing-record-missions.html') || !source.includes('Solve missing records')) throw new Error(`${path.relative(root, file)} is not connected to Missing Record Missions`);
  }
}

const livedReceiptSources = [...missingMissionSources, 'missing-record-missions.js'];
for (const relative of livedReceiptSources) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('lived-consequence-receipts.html') || !source.includes('Submit a lived receipt')) throw new Error(`${path.relative(root, file)} is not connected to Lived Consequence Receipts`);
  }
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'accountability-innovation-link-finalization.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  touched: [...new Set(touched)],
  linkedSystems: ['reverse-accountability-search', 'power-supply-chain', 'evidence-half-life', 'power-diff', 'red-team-mirror', 'public-answer-clock', 'missing-record-missions', 'lived-consequence-receipts']
}, null, 2) + '\n');
console.log(`Accountability innovation links finalized across ${[...new Set(touched)].length} file(s).`);
