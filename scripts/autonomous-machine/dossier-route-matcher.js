'use strict';

const { sha256, stableStringify } = require('./route-registry');

const STOPWORDS = new Set([
  'about','after','again','against','along','also','among','another','around','because','before','being','between','could','court','during','every','first','from','have','into','more','news','official','other','over','press','public','record','release','said','some','source','state','than','that','their','there','these','they','this','through','under','update','what','when','where','which','while','with','would',
]);

function normaliseText(value) {
  return ` ${String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function containsPhrase(haystack, phrase) {
  const needle = normaliseText(phrase).trim();
  return needle.length >= 3 && haystack.includes(` ${needle} `);
}

function phraseTokens(phrase) {
  return normaliseText(phrase).trim().split(' ').filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function confidenceFor(score) {
  if (score >= 75) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function scorePack(record, target, haystack) {
  let score = 0;
  const reasons = [];
  if (record.lane === target.lane) {
    score += 50;
    reasons.push(`existing lane matches ${target.lane}`);
  }
  if (containsPhrase(haystack, target.title) || containsPhrase(haystack, target.lane.replace(/-/g, ' '))) {
    score += 35;
    reasons.push('dossier title or slug appears in the record');
  }

  const groups = [
    ['keyword', target.phrases.keywords, 12],
    ['subject', target.phrases.subjects, 9],
    ['watch', target.phrases.watch, 6],
    ['evidence-upgrade', target.phrases.upgrades, 5],
  ];
  for (const [label, phrases, weight] of groups) {
    let groupMatches = 0;
    for (const phrase of phrases) {
      if (containsPhrase(haystack, phrase)) groupMatches += 1;
      else {
        const tokens = phraseTokens(phrase);
        if (tokens.length >= 2 && tokens.every((token) => haystack.includes(` ${token} `))) groupMatches += 1;
      }
    }
    if (groupMatches) {
      score += Math.min(groupMatches, 4) * weight;
      reasons.push(`${groupMatches} ${label} match${groupMatches === 1 ? '' : 'es'}`);
    }
  }
  return { score, reasons };
}

function matchDossierRoutes(record, registry, options = {}) {
  if (!record || typeof record !== 'object') throw new TypeError('review record is required');
  if (!registry || !Array.isArray(registry.targets)) throw new TypeError('route registry is required');
  const maxPackProposals = Number.isInteger(options.maxPackProposals) ? options.maxPackProposals : 3;
  const haystack = normaliseText([record.title, record.summary, record.lane, record.evidenceBoundary].join(' '));
  const proposals = [];

  for (const target of registry.targets.filter((item) => item.targetType === 'person_tracker')) {
    const matchedName = (target.exactNames || []).find((name) => containsPhrase(haystack, name));
    if (!matchedName) continue;
    proposals.push({
      targetId: target.targetId,
      targetType: target.targetType,
      targetTitle: target.title,
      route: target.route,
      evidenceRoute: target.evidenceRoute,
      score: 100,
      confidence: 'high',
      reasons: [`exact full-name match: ${matchedName}`],
      boundary: target.boundary || 'A name match proposes a research route only and does not establish identity, guilt or conduct.',
    });
  }

  const packRows = registry.targets
    .filter((item) => item.targetType === 'dossier_pack')
    .map((target) => ({ target, ...scorePack(record, target, haystack) }))
    .filter((row) => row.score >= 15)
    .sort((a, b) => b.score - a.score || a.target.targetId.localeCompare(b.target.targetId))
    .slice(0, Math.max(0, maxPackProposals));

  for (const row of packRows) {
    proposals.push({
      targetId: row.target.targetId,
      targetType: row.target.targetType,
      targetTitle: row.target.title,
      route: row.target.route,
      evidenceRoute: row.target.evidenceRoute,
      machineRoute: row.target.machineRoute,
      score: row.score,
      confidence: confidenceFor(row.score),
      reasons: row.reasons,
      boundary: 'A route proposal indicates subject relevance only. It does not prove the record belongs in a dossier or support any allegation.',
    });
  }

  return {
    matcherVersion: 1,
    registryFingerprint: registry.fingerprint,
    reviewRecordId: record.id,
    reviewFingerprint: record.fingerprint,
    proposalFingerprint: sha256(stableStringify(proposals.map((item) => ({
      targetId: item.targetId,
      route: item.route,
      score: item.score,
    })))),
    proposals,
    unmatched: proposals.length === 0,
  };
}

module.exports = {
  confidenceFor,
  containsPhrase,
  matchDossierRoutes,
  normaliseText,
};
