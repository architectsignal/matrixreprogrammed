'use strict';

const fs = require('node:fs');
const { normaliseUrl, stableStringify } = require('./validation');

function loadApprovedSourceConfig(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || !Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    throw new Error('Approved source config must contain a non-empty sources array');
  }
  return parsed;
}

function criticalShape(source) {
  return {
    id: source.id,
    name: source.name,
    baseUrl: normaliseUrl(source.baseUrl),
    enabled: source.enabled === true,
    allowSubdomains: source.allowSubdomains === true,
    allowedPathPrefixes: Array.isArray(source.allowedPathPrefixes)
      ? source.allowedPathPrefixes.map((value) => value.startsWith('/') ? value : `/${value}`)
      : [],
    termsReviewed: source.termsReviewed === true,
    automationAllowed: source.automationAllowed === true,
    rateLimitPerHour: source.rateLimitPerHour,
    reliability: source.reliability || 'unrated',
  };
}

function ensureConfiguredSources(sourceRegistry, config) {
  const results = [];
  for (const source of config.sources) {
    const existing = sourceRegistry.get(source.id);
    if (existing) {
      if (stableStringify(criticalShape(existing)) !== stableStringify(criticalShape(source))) {
        throw new Error(`Registered source security settings drifted from approved config: ${source.id}`);
      }
      results.push({ source: existing, created: false });
      continue;
    }
    results.push({ source: sourceRegistry.add(source), created: true });
  }
  return results;
}

module.exports = {
  criticalShape,
  ensureConfiguredSources,
  loadApprovedSourceConfig,
};
