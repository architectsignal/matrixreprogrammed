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
  if (!next.includes('>Open answer clock</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>',
      '        <a href="${escapeHtml(redTeamRoute)}">Challenge the case</a>\n        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
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
  if (!next.includes('${redTeamAction}')) {
    next = next.replace(
      '        <a href="${escapeHtml(entry.evidenceHalfLifeRoute || \'evidence-half-life.html\')}">Open Evidence Half-Life</a>',
      '        <a href="${escapeHtml(entry.evidenceHalfLifeRoute || \'evidence-half-life.html\')}">Open Evidence Half-Life</a>\n        ${redTeamAction}',
    );
  }
  if (!next.includes('${answerClockAction}')) {
    next = next.replace('        ${redTeamAction}', '        ${redTeamAction}\n        ${answerClockAction}');
  }
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
  if (!next.includes('>Open answer clock</a>')) {
    next = next.replace(
      '        <a href="${escapeHtml(mirror.powerDiffRoute || \'power-diff.html\')}">Open Power Diff</a>',
      '        <a href="${escapeHtml(mirror.powerDiffRoute || \'power-diff.html\')}">Open Power Diff</a>\n        <a href="${escapeHtml(answerClockRoute)}">Open answer clock</a>',
    );
  }
  return next;
});

const linkedFiles = ['reverse-accountability-search.js', 'power-supply-chain.js', 'evidence-half-life.js', 'power-diff.js', 'red-team-mirror.js'];
for (const relative of linkedFiles) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('red-team-mirror.html') || !source.includes('Challenge the case')) {
      throw new Error(`${path.relative(root, file)} is not connected to Red-Team Mirror`);
    }
    if (!source.includes('public-answer-clock.html') || !source.includes('Open answer clock')) {
      throw new Error(`${path.relative(root, file)} is not connected to Public Answer Clock`);
    }
  }
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'accountability-innovation-link-finalization.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  touched: [...new Set(touched)],
  linkedSystems: ['reverse-accountability-search', 'power-supply-chain', 'evidence-half-life', 'power-diff', 'red-team-mirror', 'public-answer-clock']
}, null, 2) + '\n');
console.log(`Accountability innovation links finalized across ${[...new Set(touched)].length} file(s).`);
