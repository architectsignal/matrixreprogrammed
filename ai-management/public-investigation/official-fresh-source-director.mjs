const MAX_RESPONSE_BYTES = 2_000_000;
const STOP = new Set('a an and are as at be by current describe describes did do document documents does evidence for from how in into is it of official on or record records show shows source sources that the their them this to was were what when where which who why with'.split(' '));

function clean(value, maximum = 1500) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum); }
function list(values, maximum = 30) { return [...new Set((Array.isArray(values) ? values : []).map(value => clean(typeof value === 'string' ? value : value?.title || value?.name, 200)).filter(Boolean))].slice(0, maximum); }
function terms(question) { return [...new Set(clean(question, 1000).toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').split(/\s+/).filter(token => token.length > 2 && !STOP.has(token)))].slice(0, 12); }
function matchingTermCount(item, queryTerms) {
  const text = clean(`${item?.title || ''} ${item?.summary || ''}`, 4000).toLowerCase();
  return queryTerms.filter(term => text.includes(term)).length;
}
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || ''))); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function safeHttps(value, hostname) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' && url.hostname === hostname ? url : null; } catch { return null; } }

async function boundedJson(fetchImpl, url, headers = {}) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: 'application/json', 'user-agent': 'Matrix-Reprogrammed-Public-Record-Retriever', ...headers }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error('response-too-large');
  const text = await response.text();
  const responseBytes = new TextEncoder().encode(text).byteLength;
  if (responseBytes > MAX_RESPONSE_BYTES) throw new Error('response-too-large');
  if (/^\s*</.test(text)) throw new Error('expected-json-received-html');
  return { payload: JSON.parse(text), contentSha256: await sha256(text), responseBytes };
}

function evidenceBase({ adapterId, id, title, url, description, publishedAt, updatedAt, publisher, entities, contentSha256, endpoint, retrievedAt, grade, legalBoundary }) {
  const boundedDescription = clean(description, 1500);
  return {
    evidence_id: `fresh-${adapterId}-${id}`.slice(0, 300),
    title: clean(title, 800),
    summary: boundedDescription || clean(`The official public API returned a record titled "${title}".`, 1800),
    establishes: clean(`The ${publisher} public API returned a record titled "${title}"${publishedAt ? ` with publication date ${publishedAt}` : ''}.${boundedDescription ? ` Its official metadata describes the record as: ${boundedDescription}` : ''}`, 1800),
    does_not_establish: clean(legalBoundary || 'The API metadata does not by itself establish implementation, effectiveness, motive, causation, legal liability or facts beyond the identified publication.', 1400),
    evidence_boundary: clean(legalBoundary || 'Official publication metadata proves the existence and stated metadata of a public record, not every proposition discussed within it.', 1400),
    source_publisher: publisher,
    source_type: 'official-public-api',
    source_route: url,
    matrix_route: url,
    source_asset: endpoint,
    evidence_grade: grade,
    factual_status: 'official_record_metadata',
    claim_class: 'documented_official_record',
    related_entities: list(entities),
    missing_records: ['Review the complete underlying document and any later correction, withdrawal, final rule, implementation report or judicial treatment before drawing a broader conclusion.'],
    publication_date: clean(publishedAt, 80) || null,
    updated_at: clean(updatedAt, 80) || null,
    fresh_source: true,
    retrieval_provenance: {
      adapter_id: adapterId,
      endpoint,
      source_url: url,
      retrieved_at: retrievedAt,
      response_content_sha256: contentSha256,
      monetary_cost_eur: 0,
      authentication_required: false
    }
  };
}

export class GovUkSearchAdapter {
  constructor({ fetchImpl = globalThis.fetch, maximum = 4 } = {}) {
    this.fetchImpl = fetchImpl;
    this.maximum = Math.max(1, Math.min(5, Number(maximum) || 4));
    this.adapterId = 'govuk-search-public-v1';
  }

  async discover(question, { now = new Date().toISOString(), searchPurpose = 'supporting' } = {}) {
    const query = terms(question).join(' ');
    if (!query) return { ok: false, adapter_id: this.adapterId, search_purpose: searchPurpose, evidence: [], failure: 'insufficient-query-terms' };
    const endpoint = new URL('https://www.gov.uk/api/search.json');
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('count', String(this.maximum));
    const { payload, contentSha256, responseBytes } = await boundedJson(this.fetchImpl, endpoint);
    const evidence = [];
    for (const item of Array.isArray(payload?.results) ? payload.results.slice(0, this.maximum) : []) {
      const path = clean(item.link, 1200);
      const source = safeHttps(path.startsWith('http') ? path : `https://www.gov.uk${path.startsWith('/') ? path : `/${path}`}`, 'www.gov.uk');
      if (!source) continue;
      const evidenceId = (await sha256(`${this.adapterId}:${source.href}:${item.public_timestamp || item.updated_at || ''}`)).slice(0, 32);
      evidence.push(evidenceBase({
        adapterId: this.adapterId,
        id: evidenceId,
        title: item.title,
        url: source.href,
        description: item.description,
        publishedAt: item.public_timestamp,
        updatedAt: item.updated_at,
        publisher: 'GOV.UK',
        entities: item.organisations || item.organisations_slugs,
        contentSha256,
        endpoint: endpoint.href,
        retrievedAt: now,
        grade: 'A - official UK government publication metadata'
      }));
    }
    return { ok: true, adapter_id: this.adapterId, search_purpose: searchPurpose, endpoint: endpoint.href, evidence, retrieved_at: now, response_sha256: contentSha256, response_bytes: responseBytes, cost_confirmed_zero: true };
  }
}

export class FederalRegisterSearchAdapter {
  constructor({ fetchImpl = globalThis.fetch, maximum = 4 } = {}) {
    this.fetchImpl = fetchImpl;
    this.maximum = Math.max(1, Math.min(5, Number(maximum) || 4));
    this.adapterId = 'federal-register-public-v1';
  }

  async discover(question, { now = new Date().toISOString(), searchPurpose = 'supporting' } = {}) {
    const query = terms(question).join(' ');
    if (!query) return { ok: false, adapter_id: this.adapterId, search_purpose: searchPurpose, evidence: [], failure: 'insufficient-query-terms' };
    const endpoint = new URL('https://www.federalregister.gov/api/v1/documents.json');
    endpoint.searchParams.set('per_page', String(this.maximum));
    endpoint.searchParams.set('order', 'relevance');
    endpoint.searchParams.set('conditions[term]', query);
    const { payload, contentSha256, responseBytes } = await boundedJson(this.fetchImpl, endpoint);
    const evidence = [];
    for (const item of Array.isArray(payload?.results) ? payload.results.slice(0, this.maximum) : []) {
      const source = safeHttps(item.html_url, 'www.federalregister.gov');
      if (!source || !clean(item.document_number, 100)) continue;
      const evidenceId = (await sha256(`${this.adapterId}:${item.document_number}:${item.publication_date || ''}`)).slice(0, 32);
      evidence.push(evidenceBase({
        adapterId: this.adapterId,
        id: evidenceId,
        title: item.title,
        url: source.href,
        description: item.abstract,
        publishedAt: item.publication_date,
        updatedAt: item.publication_date,
        publisher: 'U.S. Federal Register',
        entities: (item.agencies || []).map(agency => agency?.name),
        contentSha256,
        endpoint: endpoint.href,
        retrievedAt: now,
        grade: 'B - FederalRegister.gov metadata linked to the official PDF edition',
        legalBoundary: 'FederalRegister.gov identifies itself as an unofficial informational rendition. Legal research must be verified against the linked official Federal Register edition on govinfo.gov.'
      }));
    }
    return { ok: true, adapter_id: this.adapterId, search_purpose: searchPurpose, endpoint: endpoint.href, evidence, retrieved_at: now, response_sha256: contentSha256, response_bytes: responseBytes, cost_confirmed_zero: true };
  }
}

export class OfficialFreshSourceDirector {
  constructor(adapters = []) {
    this.adapters = adapters.length ? adapters : [new GovUkSearchAdapter(), new FederalRegisterSearchAdapter()];
  }

  async discover(question, { now = new Date().toISOString(), maximumEvidence = 8 } = {}) {
    const reports = [];
    const evidence = [];
    const qualifyingEvidence = [];
    const qualifyingQuestion = `${clean(question, 800)} correction withdrawal review contrary evidence`;
    for (const adapter of this.adapters.slice(0, 4)) {
      for (const [searchPurpose, searchQuestion] of [['supporting', question], ['qualifying', qualifyingQuestion]]) {
        let report;
        try {
          report = await adapter.discover(searchQuestion, { now, searchPurpose });
        } catch (error) {
          report = {
            ok: false,
            adapter_id: adapter.adapterId || 'unknown',
            search_purpose: searchPurpose,
            endpoint: null,
            evidence: [],
            retrieved_at: now,
            failure: clean(error?.message || error, 300),
            cost_confirmed_zero: true
          };
        }
        reports.push({ ...report, evidence: undefined, result_count: report.evidence?.length || 0 });
        if (searchPurpose === 'supporting') evidence.push(...(report.evidence || []));
        else qualifyingEvidence.push(...(report.evidence || []));
      }
    }
    const limit = Math.max(1, Math.min(12, Number(maximumEvidence) || 8));
    const coreTerms = terms(question);
    const minimumMatches = Math.max(1, Math.min(3, Math.ceil(coreTerms.length / 2)));
    const relevantEvidence = evidence.filter(item => matchingTermCount(item, coreTerms) >= minimumMatches);
    const relevantQualifyingEvidence = qualifyingEvidence.filter(item => {
      const text = clean(`${item?.title || ''} ${item?.summary || ''}`, 4000).toLowerCase();
      return matchingTermCount(item, coreTerms) >= minimumMatches && /(correct|withdraw|review|revis|amend|update|supersed)/.test(text);
    });
    const unique = [...new Map(relevantEvidence.map(item => [item.evidence_id, item])).values()].slice(0, limit);
    const uniqueQualifying = [...new Map(relevantQualifyingEvidence.map(item => [item.evidence_id, item])).values()].slice(0, 8);
    return {
      evidence: unique,
      qualifying_evidence: uniqueQualifying,
      adapter_reports: reports,
      retrieved_at: now,
      fresh_retrieval_occurred: unique.length > 0,
      independent_publishers: new Set(unique.map(item => item.source_publisher)).size,
      qualifying_search_performed: reports.some(report => report.search_purpose === 'qualifying'),
      cost_confirmed_zero: true
    };
  }
}

export const officialFreshSourceInternals = { MAX_RESPONSE_BYTES, clean, list, terms, matchingTermCount, sha256, safeHttps, boundedJson, evidenceBase };
