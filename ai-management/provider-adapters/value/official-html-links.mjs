export const OFFICIAL_HTML_VALUE_ADAPTER = Object.freeze({
  adapter_id: 'official-html-links-v1',
  adapter_version: '1.0.0',
  supported_job_types: ['value-lead.discover'],
  approved_data_classes: ['public'],
  monetary_cost_per_unit_eur: 0,
  external_charge_possible: false,
  maximum_response_bytes: 1024 * 1024,
  timeout_ms: 8000,
  maximum_leads: 50,
  fallback: 'retain-existing-leads-and-report-source-failure'
});

function clean(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function allowedOfficialHost(hostname, allowed) {
  const host = clean(hostname, 300).toLowerCase();
  const boundary = clean(allowed, 300).toLowerCase();
  return Boolean(host && boundary && (host === boundary || host.endsWith(`.${boundary}`)));
}

export function extractOfficialValueLeads(source, html) {
  const metadata = parseJson(source.metadata_json, {});
  const expectedHost = clean(metadata.allowed_host, 300).toLowerCase();
  const terms = (Array.isArray(metadata.link_terms) ? metadata.link_terms : []).map(term => clean(term, 80).toLowerCase()).filter(Boolean);
  const leads = new Map();
  const anchors = String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const match of anchors) {
    let url;
    try { url = new URL(match[1], source.official_url); } catch { continue; }
    if (url.protocol !== 'https:' || !allowedOfficialHost(url.hostname, expectedHost)) continue;
    url.hash = '';
    const title = clean(String(match[2] || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/gi, '&').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"'), 300);
    const material = `${title} ${url.pathname}`.toLowerCase();
    if (title.length < 5 || (terms.length && !terms.some(term => material.includes(term)))) continue;
    leads.set(url.toString(), { title, url: url.toString() });
    if (leads.size >= OFFICIAL_HTML_VALUE_ADAPTER.maximum_leads) break;
  }
  return [...leads.values()];
}

export class OfficialHtmlValueLeadAdapter {
  constructor({ fetchImpl = globalThis.fetch } = {}) { this.fetchImpl = fetchImpl; }

  describe() { return OFFICIAL_HTML_VALUE_ADAPTER; }

  async execute({ job_type = 'value-lead.discover', data_class = 'public', source, monetary_ceiling_eur = 0 } = {}) {
    if (job_type !== 'value-lead.discover') return { ok: false, reason: 'unsupported-job-type', leads: [] };
    if (data_class !== 'public') return { ok: false, reason: 'public-data-only', leads: [] };
    if (Number(monetary_ceiling_eur) !== 0) return { ok: false, reason: 'zero-spend-ceiling-required', leads: [] };
    if (typeof this.fetchImpl !== 'function') return { ok: false, reason: 'fetch-unavailable', leads: [] };
    const metadata = parseJson(source?.metadata_json, {});
    const expectedHost = clean(metadata.allowed_host, 300).toLowerCase();
    let requested;
    try { requested = new URL(source?.official_url); } catch { return { ok: false, reason: 'invalid-official-url', leads: [] }; }
    if (requested.protocol !== 'https:' || !allowedOfficialHost(requested.hostname, expectedHost)) return { ok: false, reason: 'official-host-not-allowlisted', leads: [] };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OFFICIAL_HTML_VALUE_ADAPTER.timeout_ms);
    try {
      const response = await this.fetchImpl(source.official_url, {
        method: 'GET', redirect: 'follow', signal: controller.signal,
        headers: { accept: 'text/html,text/plain;q=0.9', 'user-agent': 'MatrixReprogrammedValueHunter/1.0 contact@matrixreprogrammed.com' }
      });
      const finalUrl = new URL(response.url || source.official_url);
      if (!allowedOfficialHost(finalUrl.hostname, expectedHost)) return { ok: false, reason: 'redirect-left-official-host', leads: [] };
      const declared = integer(response.headers.get('content-length'), 0);
      if (declared > OFFICIAL_HTML_VALUE_ADAPTER.maximum_response_bytes) return { ok: false, reason: 'official-page-too-large', leads: [] };
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > OFFICIAL_HTML_VALUE_ADAPTER.maximum_response_bytes) return { ok: false, reason: 'official-page-too-large', leads: [] };
      const leads = extractOfficialValueLeads(source, new TextDecoder().decode(bytes));
      return {
        ok: response.ok, status: response.status, leads,
        cost_confirmed_zero: true,
        provenance: {
          source_url: source.official_url, final_url: finalUrl.toString(), retrieved_at: new Date().toISOString(),
          adapter_id: OFFICIAL_HTML_VALUE_ADAPTER.adapter_id, adapter_version: OFFICIAL_HTML_VALUE_ADAPTER.adapter_version,
          data_class: 'public', bytes: bytes.byteLength
        }
      };
    } catch (error) {
      return { ok: false, reason: clean(error?.message || error, 300), leads: [], cost_confirmed_zero: true };
    } finally { clearTimeout(timer); }
  }
}
