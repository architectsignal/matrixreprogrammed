'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const source = path.join(root, 'data', 'public-consequence-contracts.json');
if (!fs.existsSync(source)) throw new Error('data/public-consequence-contracts.json is required');

const ledger = JSON.parse(fs.readFileSync(source, 'utf8'));
const contracts = Array.isArray(ledger.contracts) ? ledger.contracts : [];
const MAX_ACTIVE_MANIFEST = 12;
const clean = (value, max = 1200) => String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const dateValue = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Number.MAX_SAFE_INTEGER;

function writeEverywhere(relative, content) {
  for (const base of roots) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

const compact = contracts.map(contract => {
  const checkpoints = (Array.isArray(contract.checkpoints) ? contract.checkpoints : []).map(item => ({
    daysAfterAction: Number(item.daysAfterAction || 0),
    dueAt: clean(item.dueAt, 80),
    reviewQuestion: clean(item.reviewQuestion, 600)
  })).filter(item => [30, 90, 365].includes(item.daysAfterAction) && Number.isFinite(Date.parse(item.dueAt)));
  const record = {
    id: clean(contract.id, 180),
    title: clean(contract.title, 500),
    route: clean(contract.followTarget?.route || `public-consequence-contracts.html#${contract.id}`, 700),
    actionDate: clean(contract.actionDate, 80),
    sourceUrl: clean(contract.source?.url, 1200),
    evidenceRoute: clean(contract.source?.evidenceRoute, 700),
    accountabilityQuestion: clean(contract.accountabilityQuestion, 800),
    evidenceBoundary: clean(contract.evidenceBoundary, 1000),
    termsLock: clean(contract.termsLock, 120),
    outcomeVerdict: clean(contract.outcomeVerdict, 120),
    checkpoints
  };
  return { ...record, contentHash: hash(record) };
}).filter(contract => contract.id && contract.title && contract.checkpoints.length === 3)
  .sort((a, b) => dateValue(a.checkpoints[0]?.dueAt) - dateValue(b.checkpoints[0]?.dueAt))
  .slice(0, MAX_ACTIVE_MANIFEST);

if (compact.length < 3) throw new Error(`Only ${compact.length} consequence contracts qualified for the due index`);

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  title: 'Public Consequence Due Index',
  purpose: 'A compact bounded manifest for the Cloudflare Free tracking runtime. Historical contracts persist in D1 after they leave this current manifest.',
  freeTierBudget: {
    activeManifestMaximum: MAX_ACTIVE_MANIFEST,
    scheduledRunsPerDay: 1,
    dueContractsPerRunMaximum: 4,
    perFollowerWrites: 0,
    aiInferenceInsideWorker: false
  },
  count: compact.length,
  contracts: compact
};

writeEverywhere('data/public-consequence-due-index.json', `${JSON.stringify(manifest, null, 2)}\n`);
writeEverywhere('downloads/public-consequence-due-index-report.json', `${JSON.stringify({
  ok: true,
  generatedAt: manifest.generatedAt,
  indexedContracts: manifest.count,
  checkpoints: compact.reduce((sum, item) => sum + item.checkpoints.length, 0),
  freeTierBudget: manifest.freeTierBudget
}, null, 2)}\n`);

require('./harden-consequence-tracking-runtime.js');
console.log(`Public Consequence Due Index built: ${manifest.count} active contracts, bounded to ${MAX_ACTIVE_MANIFEST} for Cloudflare Free.`);
