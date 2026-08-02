'use strict';

const fs = require('fs');
const path = require('path');

const HANDOFF_FILE = 'search-query-handoff.js';
const HANDOFF_RUNTIME = `(()=>{const q=new URLSearchParams(location.search).get('q');if(!q)return;const apply=()=>{const input=document.getElementById('archive-search');if(!input)return false;input.value=q;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();return true};if(!apply())document.addEventListener('DOMContentLoaded',apply,{once:true})})();\n`;

function ensureSearchQueryHandoff(root = process.cwd()) {
  const outputRoot = path.join(root, '_site');
  const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
  const changes = [];

  for (const base of roots) {
    const relativeBase = path.relative(root, base) || '.';
    const handoffPath = path.join(base, HANDOFF_FILE);
    if (!fs.existsSync(handoffPath) || fs.readFileSync(handoffPath, 'utf8') !== HANDOFF_RUNTIME) {
      fs.writeFileSync(handoffPath, HANDOFF_RUNTIME);
      changes.push(`${relativeBase}/${HANDOFF_FILE}`);
    }

    const searchPath = path.join(base, 'search.html');
    if (!fs.existsSync(searchPath)) continue;
    let html = fs.readFileSync(searchPath, 'utf8');
    if (!html.includes(HANDOFF_FILE)) {
      const searchRuntime = /<script\b([^>]*)src=["']search\.js(?:\?[^"']*)?["']([^>]*)><\/script>/i;
      if (!searchRuntime.test(html)) {
        throw new Error(`${relativeBase}/search.html has no search.js insertion anchor for the query handoff.`);
      }
      html = html.replace(searchRuntime, `<script src="${HANDOFF_FILE}"></script>$&`);
      fs.writeFileSync(searchPath, html);
      changes.push(`${relativeBase}/search.html`);
    }
    if ((html.match(/search-query-handoff\.js/g) || []).length !== 1) {
      throw new Error(`${relativeBase}/search.html must contain exactly one query handoff.`);
    }
  }

  return { ok: true, changes };
}

if (require.main === module) {
  const result = ensureSearchQueryHandoff();
  console.log(`Search query handoff verified across canonical and Cloudflare outputs; ${result.changes.length} repair(s).`);
}

module.exports = { HANDOFF_FILE, HANDOFF_RUNTIME, ensureSearchQueryHandoff };
