'use strict';

const fs = require('fs');
const path = require('path');
const root = process.cwd();
const at = value => path.join(root, value);
const exists = value => fs.existsSync(at(value));
const read = value => exists(value) ? fs.readFileSync(at(value), 'utf8') : '';
const readJson = (value, fallback = {}) => { try { return JSON.parse(read(value)); } catch { return fallback; } };
const clean = (value, max = 3000) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const array = value => Array.isArray(value) ? value : [];
const validHttp = value => { try { const url = new URL(String(value || '')); return ['http:','https:'].includes(url.protocol); } catch { return false; } };
const markerStart = '<!-- daily-mission-watch:start -->';
const genericOrDocumentTitle = /^(?:the\s+)?(?:first|second|third|final|new|latest|current)\s+(?:phase|release|batch|set|wave)\b|\b(?:files?|library|dataset|document|report|briefing|release|disclosure|archive|index|timeline|dossier|finding|complaint|judgment|notice|case files?)\b/i;

const standard = readJson('data/mission-orchestration-standard.json', {});
const watch = readJson('data/daily-watch.json', {});
const dossiers = readJson('data/daily-watch-dossiers.json', {});
const incumbents = readJson('data/daily-watch-incumbents.json', {});
const history = readJson('data/daily-watch-history.json', {});
const weeklyDelta = readJson('data/weekly-watch-delta.json', {});
const graph = readJson('data/evidence-weighted-relationship-graph.json', { edges: [] });
const wall = readJson('data/clock-wall.json', { clocks: [] });
const ledger = readJson('data/investigation-ledger.json', { findings: [] });
const archive = readJson('data/investigation-ledger-archive.json', { findings: [] });
const state = readJson('data/investigation-source-state.json', { sources: {} });
const pull = readJson('data/investigation-source-pulls/daily-latest.json', { results: [] });
const repair = readJson('downloads/investigation-data-integrity-repair.json', {});
const resolution = readJson('downloads/daily-watch-entity-resolution-report.json', {});
const publication = readJson('downloads/daily-watch-publication-report.json', {});
const checks = [];
const add = (id, ok, detail, fix = '') => checks.push({ id, ok: Boolean(ok), detail, fix });

add('authoritative-standard', standard.status === 'authoritative-build-contract', `Standard status: ${standard.status || 'missing'}.`, 'Restore the authoritative mission standard.');
add('required-pipeline', array(standard.requiredPipeline).length >= 10, `${array(standard.requiredPipeline).length} orchestration stages declared.`, 'Require capture, verification, contradiction search, conclusion, propagation, review and versioning.');
add('required-conclusion-fields', array(standard.requiredConclusionFields).length >= 12, `${array(standard.requiredConclusionFields).length} conclusion fields declared.`, 'Restore the full conclusion contract.');
add('stable-hit-list-standard', /do not rotate|does not rotate/i.test(standard.dailyWatch?.stabilityRule || '') && Number(standard.dailyWatch?.defaultPromotionMargin) > 0, `Promotion margin: ${standard.dailyWatch?.defaultPromotionMargin || 'missing'}.`, 'Lock a positive evidence promotion margin and ban novelty rotation.');
add('dossier-standard', array(standard.dailyWatch?.requiredDossierSections).length >= 9, `${array(standard.dailyWatch?.requiredDossierSections).length} required dossier sections.`, 'Require legal, safeguarding, money, power, connections, timeline, counter-evidence, sources and next questions.');
add('data-integrity-repair', repair.ok === true, `Repair status: ${repair.ok === true ? 'ready' : 'missing or failed'}; active findings: ${repair.ledger?.active || 0}.`, 'Run the investigation data repair first.');
add('authoritative-entity-resolution', resolution.ok === true, `Resolved person=${resolution.selected?.person || 'missing'}; institution=${resolution.selected?.institution || 'missing'}; family=${resolution.selected?.family || 'missing'}.`, 'Run build-daily-watch.js and reject document, report, archive, case or finding titles.');

const pullIds = array(pull.results).map(item => item.sourceId).filter(Boolean);
const missingAttempts = pullIds.filter(id => !state.sources?.[id]?.lastAttempt);
add('source-attempt-state', missingAttempts.length === 0, `${pullIds.length} attempted sources; ${missingAttempts.length} missing durable attempt state.`, 'Record all attempts, including failures.');

const findings = array(ledger.findings);
const ids = findings.map(item => item.id);
const required = array(standard.requiredConclusionFields);
const badFindings = findings.filter(item => {
  const missing = required.filter(field => Array.isArray(item[field]) ? item[field].length === 0 : !clean(item[field], 5000));
  return !item.id || !item.title || !validHttp(item.itemUrl || item.sourceUrl) || !item.evidenceGrade || !item.status || !clean(item.evidenceBoundary,1200) || !clean(item.mechanism,1600) || array(item.nextRecords).length < 2 || missing.length;
});
add('active-ledger-bounded', findings.length > 0 && findings.length <= Number(ledger.activeLimit || 2500) && new Set(ids).size === ids.length, `${findings.length} active findings; ${ids.length - new Set(ids).size} duplicate IDs.`, 'Deduplicate and cap the active ledger while preserving archive history.');
add('active-ledger-mission-fields', badFindings.length === 0, `${badFindings.length} active findings fail provenance, legal status, mechanism, boundary or conclusion fields.`, 'Block publication until every active finding satisfies the contract.');
add('ledger-archive-preserved', exists('data/investigation-ledger-archive.json') && clean(archive.boundary,1000), `${array(archive.findings).length} archived findings retained.`, 'Preserve overflow, duplicates and invalid-provenance history.');

add('daily-watch-data', watch.ok && watch.person && watch.institution && watch.family, `Watch status: ${watch.ok ? 'ready' : 'missing'}.`, 'Build all three slots.');
for (const slot of ['person','institution','family']) {
  const item = watch[slot] || {};
  const missing = required.filter(field => Array.isArray(item[field]) ? item[field].length === 0 : !clean(item[field],5000));
  add(`watch-${slot}-fields`, missing.length === 0, `${slot}: ${item.name || 'missing'}; missing ${missing.join(', ') || 'none'}.`, `Complete every conclusion field for ${slot}.`);
  add(`watch-${slot}-rank`, Number(item.rankingScore) > 0 && clean(item.rankingStatus,200), `${slot} score ${item.rankingScore ?? 'missing'}; status ${item.rankingStatus || 'missing'}.`, 'Run the stable ranking and dossier builder.');
  add(`watch-${slot}-sources`, array(item.sourceRoutes).length > 0, `${array(item.sourceRoutes).length} source routes attached.`, 'Attach direct source or explicit missing-record route.');
  add(`watch-${slot}-boundary`, clean(item.whatItDoesNotProve,1000).length > 40, `${slot} limitation ${clean(item.whatItDoesNotProve,1000).length > 40 ? 'present' : 'missing'}.`, 'State what selection does not prove.');
  add(`watch-${slot}-resolved-class`, clean(item.entityResolution?.status,200).length > 0 && !genericOrDocumentTitle.test(clean(item.name,300)), `${slot} resolution=${item.entityResolution?.status || 'missing'}; name=${item.name || 'missing'}.`, 'Require a registry-resolved entity and reject document-like labels.');
}
add('person-class-exact', /resolved/i.test(watch.person?.entityResolution?.status || '') && !genericOrDocumentTitle.test(watch.person?.name || ''), `Person: ${watch.person?.name || 'missing'}.`, 'Only an authoritative Person or verified person-profile node may occupy this slot.');
add('institution-class-exact', /resolved/i.test(watch.institution?.entityResolution?.status || '') && !genericOrDocumentTitle.test(watch.institution?.name || ''), `Institution: ${watch.institution?.name || 'missing'}.`, 'Only an authoritative organization, company, agency, foundation, trust or contractor may occupy this slot.');
add('distinct-watch-entities', watch.person?.name !== watch.institution?.name, `Person ${watch.person?.name}; institution ${watch.institution?.name}.`, 'Do not reuse an unresolved entity across slots.');
add('stable-ranking-policy', watch.rankingPolicy?.mode === 'stable-incumbent-evidence-promotion' && Number(watch.rankingPolicy?.promotionMargin) > 0, `Mode ${watch.rankingPolicy?.mode || 'missing'}; margin ${watch.rankingPolicy?.promotionMargin || 'missing'}.`, 'Use evidence promotion, never daily rotation.');
add('incumbent-state', ['person','institution','family'].every(slot => incumbents.slots?.[slot]?.item?.name && Number(incumbents.slots?.[slot]?.rankingScore) > 0), 'All three incumbent states checked.', 'Persist incumbent identities, scores and decisions.');
add('family-selection-boundary', /structural watch|direct|current evidence/i.test(watch.family?.selectionBasis || ''), `Family basis: ${clean(watch.family?.selectionBasis,320) || 'missing'}.`, 'Distinguish direct evidence from structural lane overlap.');

const dossierSections = ['legalAndWrongdoingRecord','epsteinAndChildSafeguardingOverlaps','moneyOwnershipAndContracts','authorityAccessAndInstitutions','documentedConnections','timeline','contradictionsAndCounterEvidence','openQuestions','sourceRoutes'];
for (const slot of ['person','institution','family']) {
  const dossier = dossiers[slot] || {};
  const missing = dossierSections.filter(field => !Array.isArray(dossier[field]));
  add(`dossier-${slot}-structure`, dossier.name === watch[slot]?.name && missing.length === 0 && clean(dossier.dossierBoundary,1000), `${slot} dossier ${dossier.name || 'missing'}; missing arrays ${missing.join(', ') || 'none'}.`, 'Build the complete dropdown dossier from site records.');
  add(`dossier-${slot}-assessment`, ['whatWasFound','whyItMatters','howItFits','whatItPointsToward','alternativeExplanation','whatItDoesNotProve'].every(field => clean(dossier.executiveAssessment?.[field],1800)), `${slot} executive assessment checked.`, 'Explain evidence, mechanism, direction, alternative and limitation.');
}
add('history-and-weekly-delta', history.ok && weeklyDelta.ok && array(history.entries).length > 0, `${array(history.entries).length} history entries; weekly delta ${weeklyDelta.ok ? 'ready' : 'missing'}.`, 'Retain ranking history and weekly changes.');
add('publication-surfaces', publication.ok && array(publication.pages).length >= 3 && publication.firstPostIntroHomepageSurface === true, `${array(publication.pages).length} public surfaces; first-post-intro ${publication.firstPostIntroHomepageSurface}.`, 'Publish the watch data to its dedicated page and expose it through the canonical homepage and Live Intel routes.');

const index = read('index.html');
const dailyPage = read('daily-watch.html');
const dailyBrief = read('daily-command-brief.html');
const liveIntel = read('live-intel.html');
const headerEnd = index.search(/<\/header>/i);
const legacyMarker = index.indexOf(markerStart);
const construction = index.indexOf('<!-- construction-banner:start -->');
const searchIndex = index.indexOf('id="accountability-search"');
const hitListIndex = index.indexOf('id="accountability-hit-list"');
const searchFirstHome = /<body[^>]*class=["'][^"']*\baccountability-home\b/i.test(index)
  && searchIndex > headerEnd
  && /action=["']search\.html["'][^>]*method=["']get["']/i.test(index)
  && /name=["']q["']/i.test(index)
  && /My Watchlist/i.test(index);
const legacyCinematicHome = legacyMarker > headerEnd
  && (construction < 0 || legacyMarker < construction)
  && /THE DAILY INTELLIGENCE HIT LIST/.test(index);

add(
  'homepage-first-hook',
  searchFirstHome ? hitListIndex > searchIndex : legacyCinematicHome,
  searchFirstHome
    ? `Search-first homepage: headerEnd=${headerEnd}; search=${searchIndex}; accountabilityHitList=${hitListIndex}.`
    : `Legacy homepage: headerEnd=${headerEnd}; hitList=${legacyMarker}; nextLegacyPanel=${construction}.`,
  'Keep the canonical search-first homepage search and accountability queue immediately accessible, or preserve the legacy cinematic hook before feature panels.'
);

const accountabilityCards = (index.match(/class=["'][^"']*\baccountability-hit-card\b/gi) || []).length;
const cinematicCards = (index.match(/OPEN COMPLETE DOSSIER/g) || []).length;
add(
  'accountability-card-ui',
  searchFirstHome
    ? accountabilityCards >= 3 && /data-accountability-hit-list/.test(index) && /href=["']hit-list\.html["']/.test(index)
    : /THE DAILY INTELLIGENCE HIT LIST/.test(index) && cinematicCards === 3 && /cinematic-daily-hit-list-style/.test(index),
  searchFirstHome ? `${accountabilityCards} search-first accountability cards found.` : `${cinematicCards} cinematic dossier cards found.`,
  'Render at least three bounded accountability cards on the search-first homepage, with the full dossier list on hit-list.html.'
);
add('dedicated-dossier-page', /THE DAILY INTELLIGENCE HIT LIST/.test(dailyPage) && (dailyPage.match(/OPEN COMPLETE DOSSIER/g) || []).length === 3, 'Dedicated hit-list page checked.', 'Build daily-watch.html with all dossiers.');
add(
  'support-conversion',
  searchFirstHome
    ? /member-dashboard\.html|membership\.html/.test(index) && /contact-the-machine\.html/.test(index) && /optin-center\.html/.test(index) && /hit-list\.html/.test(index)
    : /Support the Machine/.test(index) && /membership\.html/.test(index) && /contact-the-machine\.html/.test(index) && /weekly-watch-delta\.html/.test(index),
  'Watchlist or membership, evidence submission, brief and full accountability list actions checked.',
  'Keep watchlist or membership, evidence submission, brief and full-list conversion paths visible without hiding evidence boundaries.'
);
add(
  'surface-daily-command-brief.html',
  new RegExp(markerStart).test(dailyBrief) || (/DAILY|BRIEF/i.test(dailyBrief) && /daily-watch\.html|hit-list\.html|data\/daily-watch\.json/i.test(dailyBrief)),
  'Daily command brief exposes the current watch directly or through a stable route.',
  'Expose the current watch from the Daily Brief without requiring duplicated cinematic markup.'
);
add(
  'surface-live-intel.html',
  new RegExp(markerStart).test(liveIntel) || (/LIVE INTEL/i.test(liveIntel) && /downloads\/live-intel-latest\.json/i.test(liveIntel)),
  'Live Intel exposes the current intelligence feed; duplicated homepage hit-list markup is not required.',
  'Preserve the Live Intel feed and machine-readable route.'
);

const edges = array(graph.edges);
const badEdges = edges.filter(edge => !clean(edge.relationshipType || edge.type || edge.predicate,200) || !clean(edge.evidenceGrade || edge.grade || edge.status,200) || !clean(edge.evidenceBoundary || edge.boundary,800) || (!array(edge.sourceRoutes).length && !clean(edge.sourceRoute || edge.evidenceRoute || edge.route || edge.missingSourceReason,800)));
add('relationship-contracts', edges.length > 0 && badEdges.length === 0, `${edges.length} edges; ${badEdges.length} contract failures.`, 'Restore type, grade, source and boundary for each edge.');
const clocks = array(wall.clocks);
const badClocks = clocks.filter(clock => !clean(clock.lastMovement,1000) || !clean(clock.controlSystemMeaning,1400) || !clean(clock.boundary || clock.evidenceBoundary || clock.claimBoundary,900) || (!array(clock.evidenceInputs).length && !(clean(clock.noMovementReason,900) && clock.scoreChanged === false)));
add('clock-meaning-contracts', clocks.length > 0 && badClocks.length === 0, `${clocks.length} clocks; ${badClocks.length} contract failures.`, 'Require evidence movement or explicit no-movement state.');

const sensitive = [...findings.filter(item => item.sensitiveReviewRequired),watch.person,watch.institution,watch.family].filter(Boolean);
const unsafe = sensitive.filter(item => /child sexual|child abuse|child exploitation|child trafficking|minor offence|minor offense|csam/i.test(JSON.stringify(item)) && (!/convict|charg|indict|judgment|complaint|investigat|acquit|dismiss|sanction|do-not-publicly-flag/i.test(JSON.stringify(item).toLowerCase()) || !/does not prove|not prove|do not publicly flag/i.test(JSON.stringify(item).toLowerCase())));
add('sensitive-claim-safeguard', unsafe.length === 0, `${sensitive.length} sensitive items; ${unsafe.length} unsafe.`, 'Require exact status, provenance, limitation and review.');

const failures = checks.filter(check => !check.ok);
const report = { ok:failures.length === 0,generatedAt:new Date().toISOString(),overall:failures.length ? 'blocked' : 'ready',summary:{total:checks.length,passed:checks.length-failures.length,failed:failures.length},homepageMode:searchFirstHome ? 'search-first-accountability' : 'legacy-cinematic',watch:{date:watch.date,person:watch.person?.name,institution:watch.institution?.name,family:watch.family?.name,promotionMargin:watch.rankingPolicy?.promotionMargin},dataDepth:{activeFindings:findings.length,archivedFindings:array(archive.findings).length,relationshipEdges:edges.length,clocks:clocks.length,badFindings:badFindings.length,badEdges:badEdges.length,badClocks:badClocks.length},checks,failures };
fs.mkdirSync(at('downloads'),{recursive:true});
fs.writeFileSync(at('downloads/mission-orchestration-audit.json'),JSON.stringify(report,null,2));
fs.writeFileSync(at('downloads/mission-orchestration-audit.md'),['# Mission Orchestration Audit','',`Generated: ${report.generatedAt}`,`Overall: ${report.overall}`,`Homepage mode: ${report.homepageMode}`,`Passed: ${report.summary.passed}/${report.summary.total}`,'',`Person: ${report.watch.person}`,`Institution: ${report.watch.institution}`,`Family: ${report.watch.family}`,`Promotion margin: ${report.watch.promotionMargin}`,'','## Checks','',...checks.map(check => `- **${check.ok ? 'PASS' : 'FAIL'} · ${check.id}:** ${check.detail}${check.ok || !check.fix ? '' : ` Fix: ${check.fix}`}`)].join('\n'));
if (failures.length) { console.error(`MISSION ORCHESTRATION AUDIT FAILED: ${failures.length}`); for (const failure of failures) console.error(`- ${failure.id}: ${failure.detail}`); process.exit(1); }
console.log(`Mission orchestration audit passed: ${checks.length} checks; ${report.homepageMode} public accountability surfaces ready.`);
