import assert from 'node:assert/strict';
import { OfficialFreshSourceDirector } from '../ai-management/public-investigation/official-fresh-source-director.mjs';

const calls = [];
const fetchImpl = async input => {
  const url = new URL(String(input));
  calls.push(url);
  if (url.hostname === 'www.gov.uk') {
    return Response.json({ results: [{
      title: url.searchParams.get('q').includes('correction') ? 'AI policy correction review' : 'Artificial intelligence safety policy',
      link: '/government/publications/artificial-intelligence-safety-policy',
      description: 'Current official artificial intelligence safety policy record and review.',
      public_timestamp: '2026-08-12T09:00:00Z',
      updated_at: '2026-08-12T10:00:00Z',
      organisations: [{ title: 'Department for Science, Innovation and Technology' }]
    }, {
      title: 'Rejected unsafe route', link: 'https://attacker.example/record', description: 'must be rejected'
    }] });
  }
  if (url.hostname === 'www.federalregister.gov') {
    return Response.json({ results: [{
      document_number: url.searchParams.get('conditions[term]').includes('correction') ? '2026-QUALIFY' : '2026-SUPPORT',
      title: url.searchParams.get('conditions[term]').includes('correction') ? 'Review of artificial intelligence policy' : 'Artificial Intelligence Safety Policy Notice',
      abstract: 'Current official record concerning artificial intelligence safety policy.',
      html_url: `https://www.federalregister.gov/documents/2026/08/12/${url.searchParams.get('conditions[term]').includes('correction') ? '2026-qualify' : '2026-support'}/ai-policy`,
      publication_date: '2026-08-12',
      agencies: [{ name: 'National Institute of Standards and Technology' }]
    }] });
  }
  throw new Error(`Unexpected host ${url.hostname}`);
};

const adapters = (await import('../ai-management/public-investigation/official-fresh-source-director.mjs'));
const director = new OfficialFreshSourceDirector([
  new adapters.GovUkSearchAdapter({ fetchImpl }),
  new adapters.FederalRegisterSearchAdapter({ fetchImpl })
]);
const report = await director.discover('What current official records describe artificial intelligence safety policy?', {
  now: '2026-08-13T12:00:00.000Z'
});

assert.equal(calls.length, 4, 'supporting and qualifying searches must run against both official adapters');
assert.equal(report.evidence.length, 2);
assert.equal(report.qualifying_evidence.length, 2);
assert.equal(report.independent_publishers, 2);
assert.equal(report.qualifying_search_performed, true);
assert.equal(report.cost_confirmed_zero, true);
assert.ok(report.evidence.every(item => item.fresh_source && item.retrieval_provenance.response_content_sha256.length === 64));
assert.ok(report.evidence.every(item => new URL(item.source_route).hostname !== 'attacker.example'));
assert.ok(report.adapter_reports.every(item => item.cost_confirmed_zero === true));
console.log('Official fresh source director test passed: two independent public authorities, supporting plus qualifying searches, provenance hashes, zero-cost receipts and strict source-host boundaries.');
