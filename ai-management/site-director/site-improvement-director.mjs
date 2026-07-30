import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const DEFAULT_IGNORED = new Set(['.git', 'node_modules', '_site', '.wrangler', 'evidence-archive', 'source-snapshots', 'browsertrix-output']);
const PROTECTED_PATH = /(?:^|\/)(?:src|migrations|\.github|netlify|ai-management\/config|data)(?:\/|$)|paypal|billing|membership|member-|auth|forum|evidence-ledger|claim|conclusion|dossier/i;
const SAFE_FIX_TYPES = new Set(['html-lang-missing', 'target-blank-rel-missing', 'meta-description-missing']);

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function visibleText(value) { return String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function titleText(html) { return visibleText((String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || 'Matrix Reprogrammed'); }
function safeDescription(html) {
  const title = titleText(html).replace(/\s*[|–—-]\s*Matrix Reprogrammed.*$/i, '').trim();
  return `${title || 'Matrix Reprogrammed'} — source-led public-record intelligence, evidence trails and clearly labelled analysis.`.slice(0, 155);
}

function walk(root, dir = root, out = [], ignored = DEFAULT_IGNORED) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(root, full, out, ignored);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function duplicateIds(html) {
  const counts = new Map();
  for (const match of String(html).matchAll(/\sid=["']([^"']+)["']/gi)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));
}

function scanHtml(relative, html) {
  const issues = [];
  if (!/<html\b[^>]*\blang=["'][^"']+["']/i.test(html)) issues.push({ type: 'html-lang-missing', severity: 'low', safe_to_apply: true });
  if (!/<title\b[^>]*>[^<]{2,}<\/title>/i.test(html)) issues.push({ type: 'title-missing', severity: 'high', safe_to_apply: false });
  if (!/<meta\b[^>]*name=["']description["'][^>]*content=["'][^"']{20,}["']/i.test(html) && /<head\b/i.test(html)) issues.push({ type: 'meta-description-missing', severity: 'medium', safe_to_apply: true });
  for (const match of html.matchAll(/<a\b([^>]*)target=["']_blank["']([^>]*)>/gi)) {
    const attrs = `${match[1]} ${match[2]}`;
    if (!/\brel=["'][^"']*noopener/i.test(attrs)) issues.push({ type: 'target-blank-rel-missing', severity: 'medium', safe_to_apply: true, index: match.index });
  }
  for (const duplicate of duplicateIds(html)) issues.push({ type: 'duplicate-id', severity: 'high', safe_to_apply: false, ...duplicate });
  const objectPlaceholders = (visibleText(html).match(/\[object Object\]/g) || []).length;
  if (objectPlaceholders) issues.push({ type: 'object-placeholder-visible', severity: 'critical', safe_to_apply: false, count: objectPlaceholders });
  if (/\b(?:TODO|FIXME|lorem ipsum|placeholder copy|awaiting API)\b/i.test(visibleText(html))) issues.push({ type: 'public-scaffold-copy', severity: 'high', safe_to_apply: false });
  const unversionedScripts = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"'?]+\.(?:js|css))["']/gi)].map(match => match[1]);
  if (unversionedScripts.length) issues.push({ type: 'unversioned-static-assets', severity: 'low', safe_to_apply: false, count: unversionedScripts.length, examples: unversionedScripts.slice(0, 5) });
  if (PROTECTED_PATH.test(relative) && issues.some(issue => issue.safe_to_apply)) {
    for (const issue of issues) issue.safe_to_apply = false;
  }
  return issues;
}

function applySafeFixes(html, issues) {
  const allowed = new Set(issues.filter(issue => issue.safe_to_apply && SAFE_FIX_TYPES.has(issue.type)).map(issue => issue.type));
  let next = String(html);
  const applied = [];
  if (allowed.has('html-lang-missing')) {
    next = next.replace(/<html(?![^>]*\blang=)([^>]*)>/i, '<html lang="en"$1>');
    if (next !== html) applied.push('html-lang-missing');
  }
  if (allowed.has('target-blank-rel-missing')) {
    const before = next;
    next = next.replace(/<a\b([^>]*?)target=["']_blank["']([^>]*)>/gi, (tag, left, right) => {
      if (/\brel=["'][^"']*noopener/i.test(`${left} ${right}`)) return tag;
      return `<a${left}target="_blank"${right} rel="noopener noreferrer">`;
    });
    if (next !== before) applied.push('target-blank-rel-missing');
  }
  if (allowed.has('meta-description-missing') && /<head\b/i.test(next)) {
    const before = next;
    const description = safeDescription(next).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    next = next.replace(/<head\b([^>]*)>/i, `<head$1><meta name="description" content="${description}" />`);
    if (next !== before) applied.push('meta-description-missing');
  }
  return { html: next, applied };
}

export class SiteImprovementDirector {
  constructor({ root = process.cwd(), clock = () => new Date(), ignored = DEFAULT_IGNORED } = {}) {
    this.root = root;
    this.clock = clock;
    this.ignored = ignored;
  }

  run({ applySafe = false, maximumChanges = 25, writeReport = true } = {}) {
    const started = this.clock();
    const pages = walk(this.root, this.root, [], this.ignored);
    const findings = [];
    const changes = [];
    let prohibitedChangesAttempted = 0;
    for (const file of pages) {
      const relative = path.relative(this.root, file).replace(/\\/g, '/');
      const before = fs.readFileSync(file, 'utf8');
      const issues = scanHtml(relative, before);
      if (issues.length) findings.push({ file: relative, issues });
      if (!applySafe || changes.length >= maximumChanges) continue;
      const protectedPath = PROTECTED_PATH.test(relative);
      if (protectedPath) {
        prohibitedChangesAttempted += issues.filter(issue => issue.safe_to_apply).length;
        continue;
      }
      const result = applySafeFixes(before, issues);
      if (result.applied.length && result.html !== before) {
        fs.writeFileSync(file, result.html);
        changes.push({ file: relative, fixes: result.applied, before_hash: sha256(before), after_hash: sha256(result.html) });
      }
    }
    const issueCounts = {};
    for (const finding of findings) for (const issue of finding.issues) issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
    const report = {
      ok: true,
      generated_at: this.clock().toISOString(),
      duration_ms: Math.max(0, this.clock().getTime() - started.getTime()),
      scanned_pages: pages.length,
      files_with_findings: findings.length,
      issue_counts: issueCounts,
      total_issues: Object.values(issueCounts).reduce((sum, count) => sum + count, 0),
      apply_safe_requested: applySafe,
      safe_changes_applied: changes.length,
      maximum_changes: maximumChanges,
      prohibited_changes_attempted: prohibitedChangesAttempted,
      changes,
      findings,
      boundaries: {
        protected_paths: String(PROTECTED_PATH),
        safe_fix_types: [...SAFE_FIX_TYPES],
        prohibited: ['payments', 'authentication', 'membership', 'forums', 'evidence claims', 'conclusions', 'dossiers', 'worker runtime', 'migrations', 'deployment configuration', 'secrets']
      }
    };
    if (writeReport) {
      const output = path.join(this.root, 'downloads', 'site-improvement-director.json');
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  }
}

export const siteDirectorInternals = { walk, scanHtml, applySafeFixes, duplicateIds, safeDescription, PROTECTED_PATH, SAFE_FIX_TYPES };
