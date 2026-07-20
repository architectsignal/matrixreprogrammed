const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [path.join(root, 'index.html'), path.join(root, '_site', 'index.html')];
const reportPath = path.join(root, 'downloads', 'homepage-ai-detective-route.json');
const start = '<!-- ai-detective-home:start -->';
const end = '<!-- ai-detective-home:end -->';
const section = `${start}<section id="ai-detective-epstein" class="section wrap" aria-labelledby="ai-detective-title"><style>#ai-detective-epstein{margin-top:1rem}.ai-detective-panel{position:relative;overflow:hidden;border:2px solid rgba(190,55,55,.72);border-radius:24px;padding:clamp(1.15rem,3vw,2rem);background:radial-gradient(circle at 88% 18%,rgba(190,55,55,.22),transparent 32%),linear-gradient(145deg,rgba(48,3,3,.96),rgba(0,0,0,.98));box-shadow:0 0 38px rgba(190,55,55,.17)}.ai-detective-live{display:inline-flex;align-items:center;gap:.48rem;border:1px solid rgba(255,110,110,.55);border-radius:999px;padding:.38rem .68rem;color:#ffd4d4;font-size:.78rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.ai-detective-live:before{content:'';width:.62rem;height:.62rem;border-radius:50%;background:#ff4b4b;box-shadow:0 0 14px #ff4b4b;animation:aiDetectivePulse 1.6s ease-in-out infinite}.ai-detective-panel h2{font-size:clamp(1.9rem,5vw,4rem);line-height:.96;margin:.85rem 0}.ai-detective-panel .lead{max-width:850px}.ai-detective-button{display:inline-flex;align-items:center;justify-content:center;min-height:58px;padding:.9rem 1.2rem!important;font-size:clamp(1rem,2.3vw,1.32rem)!important;font-weight:900;letter-spacing:.035em;text-align:center;box-shadow:0 0 28px rgba(190,55,55,.34)}.ai-detective-boundary{max-width:900px;margin-top:1rem;color:#d6c9aa;font-size:.91rem}@keyframes aiDetectivePulse{50%{opacity:.35;transform:scale(.78)}}@media (prefers-reduced-motion:reduce){.ai-detective-live:before{animation:none}}</style><div class="ai-detective-panel"><span class="ai-detective-live">Live AI investigation</span><div class="eyebrow">AI Detective · Epstein Files</div><h2 id="ai-detective-title">THE MACHINE IS INVESTIGATING.</h2><p class="lead">Open the dedicated AI detective page to follow developing Epstein-file hypotheses, supporting public records, contrary evidence, missing proof, confidence bands and the tests that could confirm or reject each theory.</p><div class="cta-row"><a class="btn ai-detective-button" href="ai-speculative-conclusions.html" aria-label="Open the AI Detective Epstein files investigation">OPEN THE AI DETECTIVE — EPSTEIN FILES</a><a class="btn alt" href="epstein-files.html">Verified Epstein File Hub</a></div><p class="ai-detective-boundary"><strong>Evidence boundary:</strong> the detective page publishes clearly labelled hypotheses, not verdicts. Association is not guilt, and no allegation is treated as established without supporting evidence.</p></div></section>${end}`;

const changed = [];
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  const existing = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (existing.test(after)) {
    after = after.replace(existing, section);
  } else if (after.includes('<!-- cinematic-command:end -->')) {
    after = after.replace('<!-- cinematic-command:end -->', `<!-- cinematic-command:end -->${section}`);
  } else if (/<main\b/i.test(after)) {
    after = after.replace(/<main\b/i, `${section}<main`);
  } else {
    throw new Error(`${path.relative(root, file)} has no safe homepage insertion anchor`);
  }
  for (const marker of ['id="ai-detective-epstein"', 'ai-speculative-conclusions.html', 'OPEN THE AI DETECTIVE — EPSTEIN FILES', 'hypotheses, not verdicts']) {
    if (!after.includes(marker)) throw new Error(`${path.relative(root, file)} is missing AI detective marker: ${marker}`);
  }
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(path.relative(root, file).replace(/\\/g, '/'));
  }
}

if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Homepage source is missing');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  route: 'ai-speculative-conclusions.html',
  homepageAnchor: 'ai-detective-epstein',
  label: 'AI Detective — Epstein Files',
  boundary: 'The homepage advertises a live hypothesis-review route while preserving the distinction between public evidence, inference, speculation and established findings.'
}, null, 2)}\n`);
console.log(`Homepage AI detective route ${changed.length ? `updated ${changed.join(', ')}` : 'already current'}.`);
