'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normaliseUrl } = require('./validation');

class SourceRegistry {
  constructor(filePath) {
    if (!filePath) throw new TypeError('SourceRegistry requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      this.save({ version: 1, sources: [] });
    }
  }

  load() {
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!Array.isArray(parsed.sources)) throw new Error('Source registry must contain a sources array');
    return parsed;
  }

  save(registry) {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }

  add(source) {
    if (!source || typeof source !== 'object') throw new TypeError('source must be an object');
    if (!source.id || !source.baseUrl || !source.name) {
      throw new TypeError('source requires id, name and baseUrl');
    }
    const registry = this.load();
    if (registry.sources.some((item) => item.id === source.id)) {
      throw new Error(`Source already exists: ${source.id}`);
    }
    const normalised = {
      id: source.id,
      name: source.name,
      baseUrl: normaliseUrl(source.baseUrl),
      enabled: source.enabled !== false,
      lawfulBasis: source.lawfulBasis || 'public_web',
      termsReviewed: source.termsReviewed === true,
      automationAllowed: source.automationAllowed === true,
      rateLimitPerHour: Number.isInteger(source.rateLimitPerHour) ? source.rateLimitPerHour : 60,
      reliability: source.reliability || 'unrated',
      notes: source.notes || '',
    };
    registry.sources.push(normalised);
    this.save(registry);
    return normalised;
  }

  get(sourceId) {
    return this.load().sources.find((source) => source.id === sourceId) || null;
  }

  assertUsable(sourceId) {
    const source = this.get(sourceId);
    if (!source) throw new Error(`Source is not registered: ${sourceId}`);
    if (!source.enabled) throw new Error(`Source is disabled: ${sourceId}`);
    if (!source.termsReviewed) throw new Error(`Source terms have not been reviewed: ${sourceId}`);
    if (!source.automationAllowed) throw new Error(`Automated access is not approved: ${sourceId}`);
    return source;
  }

  assertUrlAllowed(sourceId, candidateUrl) {
    const source = this.assertUsable(sourceId);
    const base = new URL(source.baseUrl);
    const candidate = new URL(normaliseUrl(candidateUrl));
    if (candidate.protocol !== 'https:') throw new Error('Only HTTPS sources are allowed');
    if (candidate.hostname !== base.hostname && !candidate.hostname.endsWith(`.${base.hostname}`)) {
      throw new Error(`URL host is outside the registered source boundary: ${candidate.hostname}`);
    }
    return true;
  }
}

module.exports = { SourceRegistry };
