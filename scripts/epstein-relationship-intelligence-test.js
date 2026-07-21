const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sourceRoot = path.resolve(__dirname, '..');
const builder = path.join(sourceRoot, 'scripts', 'build-epstein-relationship-intelligence.js');

function fixture() {
  return {
    schema_version: '1.0.0', generated_at_utc: '2026-07-21T12:00:00Z',
    title: 'THE EPSTEIN EMAIL NETWORK', subtitle: 'Evidence map',
    evidence_notice: 'Appearance in a released record does not by itself establish misconduct.',
    source: { name: 'Jmail Data API', dataset_version: 'v1' },
    entities: [
      { entity_id: 'JE:a', name: 'Alice Example', entity_type: 'person', identity_confidence: 'confirmed', aliases: [] },
      { entity_id: 'JE:b', name: 'Bob Example', entity_type: 'person', identity_confidence: 'confirmed', aliases: ['Robert Example'] },
    ],
    relationships: [{
      relationship_id: 'JR:1', source_entity_id: 'JE:a', target_entity_id: 'JE:b',
      relationship_type: 'emailed', direct_or_inferred: 'direct', confidence: 1,
      first_seen: '2014-01-01', last_seen: '2014-01-01',
      public_safe_summary: 'The released record documents direct correspondence.',
      strength: { tier: 3, label: 'Confirmed communication', warning: 'Relationship strength is not a guilt score.' },
      evidence: [{ source_url: 'https://jmail.world/mail/1', locator: 'header:to', public_safe_paraphrase: 'A released email records the correspondence.', evidence_level: 'direct_documentary_fact', confidence: 1 }],
    }],
    events: [], financial_records: [],
    counts: { entities: 2, relationships: 1, events: 0, financial_records: 0 },
  };
}

function runWith(data) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-jmail-public-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.copyFileSync(builder, path.join(root, 'scripts', path.basename(builder)));
  fs.writeFileSync(path.join(root, 'data', 'epstein-relationship-intelligence.json'), JSON.stringify(data));
  fs.writeFileSync(path.join(root, 'epstein-files.html'), '<html><main></main></html>');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', path.basename(builder))], { cwd: root, encoding: 'utf8' });
  return { root, result };
}

const good = runWith(fixture());
assert.strictEqual(good.result.status, 0, good.result.stderr);
const html = fs.readFileSync(path.join(good.root, 'epstein-email-network.html'), 'utf8');
assert(html.includes('Permanent evidence boundary'));
assert(html.includes('relationship_id'));
assert(html.includes('https://jmail.world/mail/1'));
assert(html.includes('Relationship strength is not a guilt score'));
assert(!html.includes('content_markdown'));
const index = JSON.parse(fs.readFileSync(path.join(good.root, 'data', 'epstein-relationship-profile-index.json')));
assert.strictEqual(index.profiles['JE:a'].connections.length, 1);
const command = fs.readFileSync(path.join(good.root, 'epstein-files.html'), 'utf8');
assert(command.includes('id="epstein-email-network-link"'));

const unsafeData = fixture();
unsafeData.relationships[0].content_markdown = 'private body';
const unsafe = runWith(unsafeData);
assert.notStrictEqual(unsafe.result.status, 0);
assert(unsafe.result.stderr.includes('Private field'));

const proposal = fixture();
proposal.financial_records = [{ financial_id: 'F1', financial_type: 'investment', status: 'proposed', amount_text: '$5m', evidence_classification: 'direct_documentary_fact', source_urls: ['https://jmail.world/mail/2'] }];
const proposalRun = runWith(proposal);
assert.strictEqual(proposalRun.result.status, 0, proposalRun.result.stderr);
const proposalHtml = fs.readFileSync(path.join(proposalRun.root, 'epstein-email-network.html'), 'utf8');
assert(proposalHtml.includes('proposed'));
assert(!proposalHtml.includes('<span class="label">investment · completed</span>'));

console.log('Epstein relationship public build tests passed: safe export, evidence links, profile index, command-center link, private-field rejection, and proposal-state preservation.');
