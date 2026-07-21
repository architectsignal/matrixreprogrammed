const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sourceRoot = path.resolve(__dirname, '..');
const scripts = [
  'build-epstein-relationship-intelligence.js',
  'enhance-epstein-publication-lanes.js',
  'repair-epstein-relationship-runtime.js',
];

function publication(lane, label, reviewStatus = 'not_queued') {
  return {
    lane,
    label,
    boundary: lane === 'speculation'
      ? 'This item is published as speculation or an editorial research question, not as a factual allegation.'
      : 'This record establishes contact only. It does not establish misconduct.',
    review_status: reviewStatus,
    public_record_unredacted: true,
  };
}

function fixture() {
  return {
    schema_version: '2.0.0', generated_at_utc: '2026-07-21T12:00:00Z',
    title: 'THE EPSTEIN EMAIL NETWORK', subtitle: 'Evidence map',
    evidence_notice: 'Appearance in a released record does not by itself establish misconduct.',
    publication_policy: {
      mode: 'classified_public_record_publication',
      editorial_review_lane: 'speculation',
      public_record_unredacted: true,
      principle: 'Review changes the label and confidence, not whether a public record is visible.',
    },
    source: { name: 'Jmail Data API', dataset_version: 'v1' },
    entities: [
      { entity_id: 'JE:a', name: 'Alice Example', entity_type: 'person', identity_confidence: 'confirmed', aliases: [], public_record_identifiers: [{ scheme: 'email', value: 'alice@example.com' }] },
      { entity_id: 'JE:b', name: 'Bob Example', entity_type: 'person', identity_confidence: 'confirmed', aliases: ['Robert Example'], public_record_identifiers: [{ scheme: 'email', value: 'bob@example.com' }] },
    ],
    relationships: [{
      relationship_id: 'JR:1', source_entity_id: 'JE:a', target_entity_id: 'JE:b',
      relationship_type: 'emailed', direct_or_inferred: 'direct', confidence: 1,
      first_seen: '2014-01-01', last_seen: '2014-01-01',
      public_summary: 'The released record documents direct correspondence.',
      publication: publication('documented_fact', 'Documented fact'),
      strength: { tier: 3, label: 'Confirmed communication', warning: 'Relationship strength is not a guilt score.' },
      evidence: [{ source_url: 'https://jmail.world/mail/1', locator: 'header:to', public_safe_paraphrase: 'A released email records the correspondence.', public_record_excerpt: 'Exact public email excerpt.', evidence_level: 'direct_documentary_fact', confidence: 1 }],
    }],
    events: [],
    financial_records: [],
    mentions: [{
      mention_id: 'JME:1', email_id: 1, raw_mention: 'Unresolved John',
      mention_context: 'John was mentioned in the public email.', identity_confidence: 'unresolved',
      source_url: 'https://jmail.world/mail/1',
      publication: publication('unresolved_identity', 'Unresolved identity'),
    }],
    editorial_review: [{
      review_id: 'JREV:1', item_type: 'relationship', item_id: 'JR:1',
      risk_level: 'medium', reason: 'Context requires review', review_status: 'pending_owner_review',
      public_record_payload: { source_url: 'https://jmail.world/mail/1', statement: 'Public record under review' },
      publication: publication('speculation', 'Speculation / research question', 'pending_owner_review'),
    }],
    counts: {
      entities: 2, relationships: 1, events: 0, financial_records: 0,
      mentions: 1, editorial_review: 1,
      publication_lanes: { documented_fact: 1, supported_inference: 0, strong_inference: 0, unconfirmed_lead: 0, unresolved_identity: 1, speculation: 1 },
    },
  };
}

function runWith(data) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-jmail-public-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  for (const name of scripts) {
    fs.copyFileSync(path.join(sourceRoot, 'scripts', name), path.join(root, 'scripts', name));
  }
  fs.writeFileSync(path.join(root, 'data', 'epstein-relationship-intelligence.json'), JSON.stringify(data));
  fs.writeFileSync(path.join(root, 'epstein-files.html'), '<html><main></main></html>');
  const results = scripts.map(name => spawnSync(
    process.execPath,
    [path.join(root, 'scripts', name)],
    { cwd: root, encoding: 'utf8' },
  ));
  return { root, results };
}

const good = runWith(fixture());
for (const result of good.results) assert.strictEqual(result.status, 0, result.stderr);
const html = fs.readFileSync(path.join(good.root, 'epstein-email-network.html'), 'utf8');
assert(html.includes('Permanent evidence boundary'));
assert(html.includes('Evidence publication lanes'));
assert(html.includes('Editorial review published as speculation'));
assert(html.includes('Speculation / research question'));
assert(html.includes('Unresolved John'));
assert(html.includes('Exact public email excerpt'));
assert(html.includes('https://jmail.world/mail/1'));
assert(html.includes('Relationship strength is not a guilt score'));
assert(html.includes('lane-filter'));
const index = JSON.parse(fs.readFileSync(path.join(good.root, 'data', 'epstein-relationship-profile-index.json')));
assert.strictEqual(index.profiles['JE:a'].connections.length, 1);
const command = fs.readFileSync(path.join(good.root, 'epstein-files.html'), 'utf8');
assert(command.includes('id="epstein-email-network-link"'));

const unsafeData = fixture();
unsafeData.relationships[0].raw_json = 'private investigator database field';
const unsafe = runWith(unsafeData);
assert.notStrictEqual(unsafe.results[0].status, 0);
assert(unsafe.results[0].stderr.includes('Private field'));

const proposal = fixture();
proposal.financial_records = [{
  financial_id: 'F1', financial_type: 'investment', status: 'proposed', amount_text: '$5m',
  evidence_classification: 'direct_documentary_fact', source_urls: ['https://jmail.world/mail/2'],
  publication: publication('documented_fact', 'Documented fact'),
}];
const proposalRun = runWith(proposal);
for (const result of proposalRun.results) assert.strictEqual(result.status, 0, result.stderr);
const proposalHtml = fs.readFileSync(path.join(proposalRun.root, 'epstein-email-network.html'), 'utf8');
assert(proposalHtml.includes('proposed'));
assert(!proposalHtml.includes('<span class="label">investment · completed</span>'));

console.log('Epstein relationship public build tests passed: classified lanes, visible speculation, unresolved mentions, exact source excerpts, evidence links, private-field rejection and proposal-state preservation.');
