import {
  ScenarioProbabilityError,
  forecastScenario,
  probabilityMethodology,
  scenarioProbabilityEngineVersion
} from './scenario-probability-engine.js';

const ORIGIN = 'cloudflare-worker-scenario-probability';
const ROUTES = new Set([
  '/api/public/probability/health',
  '/api/public/probability/methodology',
  '/api/public/probability/forecast',
  '/api/public/scenarios',
  '/api/public/scenarios/surveillance-state'
]);

function responseHeaders(request) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    pragma: 'no-cache',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-matrix-origin': ORIGIN
  };
  const origin = request?.headers?.get('origin') || '';
  if (/^https:\/\/(?:www\.)?matrixreprogrammed\.com$/i.test(origin) || /^http:\/\/localhost(?::\d+)?$/i.test(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  return headers;
}

function json(request, value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { ...responseHeaders(request), ...extraHeaders }
  });
}

function errorStatus(error) {
  if (!(error instanceof ScenarioProbabilityError)) return 500;
  if (['unsupported-scenario-family', 'question-too-short', 'invalid-horizon', 'horizon-too-distant'].includes(error.code)) return 422;
  return 400;
}

async function readJson(request, maximumBytes = 64 * 1024) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximumBytes) throw new ScenarioProbabilityError('request-too-large', 'The forecast request exceeds 64 KiB.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new ScenarioProbabilityError('request-too-large', 'The forecast request exceeds 64 KiB.');
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ScenarioProbabilityError('invalid-json', 'The forecast request is not valid JSON.');
  }
}

function runtimeConfig(env) {
  const raw = String(env?.PROBABILITY_MODEL_CONFIG_JSON || '').trim();
  if (!raw || raw.length > 96 * 1024) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function health(env) {
  return {
    ok: true,
    engineVersion: scenarioProbabilityEngineVersion,
    persistent: false,
    d1Connected: false,
    paidFallbackPossible: false,
    externalModelUsed: false,
    modelMode: String(env?.PROBABILITY_MODEL_CONFIG_JSON || '').trim() ? 'private-runtime' : 'public-generic-seed',
    supportedScenarioFamilies: ['surveillance_state'],
    boundary: 'The public forecast endpoint is stateless. It does not mutate D1, call external AI providers or let an LLM choose the percentage.',
    checkedAt: new Date().toISOString()
  };
}

async function fetchHandler(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...responseHeaders(request),
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600'
      }
    });
  }

  try {
    if (path === '/api/public/probability/health' && (request.method === 'GET' || request.method === 'HEAD')) {
      return json(request, health(env));
    }
    if (path === '/api/public/probability/methodology' && request.method === 'GET') {
      return json(request, { ok: true, ...probabilityMethodology() });
    }
    if (path === '/api/public/scenarios' && request.method === 'GET') {
      return json(request, {
        ok: true,
        scenarios: [{
          id: 'surveillance_state',
          slug: 'surveillance-state',
          label: 'Surveillance State',
          status: 'research-preview',
          forecastRoute: '/api/public/probability/forecast'
        }]
      });
    }
    if (path === '/api/public/scenarios/surveillance-state' && request.method === 'GET') {
      return json(request, { ok: true, scenario: probabilityMethodology() });
    }
    if (path === '/api/public/probability/forecast' && request.method === 'POST') {
      return json(request, forecastScenario(await readJson(request), runtimeConfig(env)));
    }
    return json(request, { ok: false, error: 'Method not allowed', route: path }, 405);
  } catch (error) {
    const known = error instanceof ScenarioProbabilityError;
    return json(request, {
      ok: false,
      error: known ? error.message : 'Probability engine failed safely.',
      code: known ? error.code : 'internal-error',
      details: known ? error.details : {},
      engineVersion: scenarioProbabilityEngineVersion
    }, errorStatus(error));
  }
}

export function isScenarioProbabilityRoute(path = '') {
  return ROUTES.has(String(path || '').replace(/\/+$/, '') || '/');
}

export default { fetch: fetchHandler };
