const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const output = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'homepage-construction-banner.json');
const startMarker = '<!-- construction-banner:start -->';
const endMarker = '<!-- construction-banner:end -->';
const blockPattern = /<!-- construction-banner:start -->[\s\S]*?<!-- construction-banner:end -->/g;
const navRepairPattern = /<style id=["']homepage-primary-nav-recovery["']>[\s\S]*?<\/style>/g;
const supportUrl = 'https://gofund.me/0a3c74fc9';

const navRepair = `<style id="homepage-primary-nav-recovery">@media(min-width:901px){header.topbar{display:flex!important;visibility:visible!important;opacity:1!important;min-height:52px}header.topbar .nav-shell{display:flex!important;visibility:visible!important;opacity:1!important}header.topbar .nav-primary{display:flex!important;visibility:visible!important;opacity:1!important;min-height:32px}header.topbar .nav-primary a{display:inline-flex!important;visibility:visible!important;opacity:1!important;min-height:28px;align-items:center}}</style>`;

const banner = `${startMarker}<section id="matrix-construction-banner" class="matrix-construction-banner" role="status" aria-label="Matrix Reprogrammed is under construction and accepting project support"><style>
.matrix-construction-banner{position:relative;z-index:20;margin:.75rem auto 1.25rem;width:min(1180px,calc(100% - 1.5rem));overflow:hidden;border:1px solid rgba(224,183,92,.68);border-radius:18px;background:linear-gradient(110deg,rgba(10,7,2,.98),rgba(45,7,7,.96) 48%,rgba(6,6,6,.98));box-shadow:0 0 30px rgba(190,55,55,.18),inset 0 0 28px rgba(224,183,92,.06)}
.matrix-construction-banner:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 46px,rgba(224,183,92,.035) 47px 48px);pointer-events:none}
.matrix-construction-banner:after{content:'';position:absolute;top:0;bottom:0;width:32%;left:-38%;background:linear-gradient(90deg,transparent,rgba(255,235,172,.13),transparent);animation:matrixConstructionScan 5.5s linear infinite;pointer-events:none}
.matrix-construction-inner{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:1rem;padding:1rem}
.matrix-construction-status{display:inline-flex;align-items:center;gap:.48rem;border:1px solid rgba(255,105,105,.62);border-radius:999px;padding:.38rem .68rem;color:#ffd2d2;font-size:.75rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.matrix-construction-status:before{content:'';width:.62rem;height:.62rem;border-radius:50%;background:#ff4a4a;box-shadow:0 0 14px #ff4a4a;animation:matrixConstructionPulse 1.5s ease-in-out infinite}
.matrix-construction-copy strong{display:block;color:#fff4d2;font-size:clamp(1rem,2vw,1.28rem);letter-spacing:.035em}
.matrix-construction-copy span{display:block;margin-top:.28rem;max-width:760px;color:#d8ccb0;font-size:.9rem;line-height:1.5}
.matrix-construction-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.55rem}
.matrix-construction-action{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:.68rem .92rem;border:1px solid rgba(224,183,92,.68);border-radius:12px;color:#fff3c6;text-decoration:none;font-weight:850;white-space:nowrap;background:rgba(224,183,92,.08)}
.matrix-construction-action.primary{border-color:rgba(255,112,112,.82);color:#fff;background:linear-gradient(135deg,rgba(161,24,24,.96),rgba(92,10,10,.98));box-shadow:0 0 20px rgba(190,55,55,.22)}
.matrix-construction-action:hover,.matrix-construction-action:focus-visible{background:rgba(224,183,92,.17);outline:none;box-shadow:0 0 18px rgba(224,183,92,.18)}
.matrix-construction-action.primary:hover,.matrix-construction-action.primary:focus-visible{background:linear-gradient(135deg,rgba(190,35,35,.98),rgba(112,12,12,.98));box-shadow:0 0 24px rgba(220,70,70,.34)}
@keyframes matrixConstructionScan{to{left:106%}}
@keyframes matrixConstructionPulse{50%{opacity:.38;transform:scale(.78)}}
@media(max-width:900px){.matrix-construction-inner{grid-template-columns:1fr;gap:.7rem}.matrix-construction-actions{justify-content:flex-start}}
@media(max-width:560px){.matrix-construction-actions{display:grid;grid-template-columns:1fr}.matrix-construction-action{width:100%;white-space:normal;text-align:center}}
@media(prefers-reduced-motion:reduce){.matrix-construction-banner:after,.matrix-construction-status:before{animation:none}}
</style><div class="matrix-construction-inner"><span class="matrix-construction-status">Build Active</span><div class="matrix-construction-copy"><strong>UNDER CONSTRUCTION — HELP US BUILD THE MACHINE.</strong><span>Matrix Reprogrammed is expanding its independent public-record intelligence system. Support helps fund high-memory GPUs, secure computing infrastructure, storage and the processing capacity required to analyse and connect large evidence archives. Every contribution helps us build faster and keep the core research accessible.</span></div><div class="matrix-construction-actions"><a class="matrix-construction-action primary" href="${supportUrl}" target="_blank" rel="noopener noreferrer" aria-label="Support Matrix Reprogrammed on GoFundMe">Support the Build</a><a class="matrix-construction-action" href="live-intel.html">Open Live Intel</a></div></div></section>${endMarker}`;

function patchHtml(html) {
  let cleaned = String(html).replace(blockPattern, '').replace(navRepairPattern, '');
  cleaned = cleaned.replace(/<a href=["']power-atlas\.html["']>Control System<\/a>/i, '<a href="control-structure.html">Control System</a>');
  if (/<\/head>/i.test(cleaned)) cleaned = cleaned.replace(/<\/head>/i, `${navRepair}</head>`);
  else throw new Error('Homepage construction banner could not find a head insertion point for navigation recovery');
  if (/<\/header>/i.test(cleaned)) return cleaned.replace(/<\/header>/i, `</header>${banner}`);
  if (/<body[^>]*>/i.test(cleaned)) return cleaned.replace(/(<body[^>]*>)/i, `$1${banner}`);
  throw new Error('Homepage construction banner could not find a header or body insertion point');
}

function ensureOne(file) {
  const html = fs.readFileSync(file, 'utf8');
  const banners = (html.match(/id=["']matrix-construction-banner["']/g) || []).length;
  const starts = (html.match(/<!-- construction-banner:start -->/g) || []).length;
  const ends = (html.match(/<!-- construction-banner:end -->/g) || []).length;
  const bannerBlocks = html.match(blockPattern) || [];
  const bannerSupportLinks = bannerBlocks.length === 1 ? (bannerBlocks[0].match(/https:\/\/gofund\.me\/0a3c74fc9/g) || []).length : 0;
  const navRepairs = (html.match(/id=["']homepage-primary-nav-recovery["']/g) || []).length;
  if (banners !== 1 || starts !== 1 || ends !== 1 || bannerBlocks.length !== 1) throw new Error(`${path.relative(root, file)} does not contain exactly one construction banner`);
  if (bannerSupportLinks !== 1) throw new Error(`${path.relative(root, file)} construction banner does not contain exactly one GoFundMe support link`);
  if (navRepairs !== 1) throw new Error(`${path.relative(root, file)} does not contain exactly one desktop primary-navigation recovery rule`);
  if (!/<a href=["']control-structure\.html["']>Control System<\/a>/i.test(html)) throw new Error(`${path.relative(root, file)} does not expose the canonical Control System route`);
}

function safeId(value) {
  return String(value || 'contract').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 150) || 'contract';
}

function repairConsequenceControls(file) {
  if (!fs.existsSync(file)) return { file:path.relative(root, file), skipped:true, repaired:0 };
  const before = fs.readFileSync(file, 'utf8');
  const used = new Map();
  let repaired = 0;
  const after = before.replace(/<button\b([^>]*)>/gi, (tag, rawAttrs) => {
    const followMatch = rawAttrs.match(/\bdata-follow-id\s*=\s*["']([^"']+)["']/i);
    if (!followMatch) return tag;
    const followId = safeId(followMatch[1]);
    const occurrence = (used.get(followId) || 0) + 1;
    used.set(followId, occurrence);
    const buttonId = `follow-${followId}${occurrence > 1 ? `-${occurrence}` : ''}`;
    let attrs = rawAttrs.replace(/\s+id\s*=\s*["'][^"']*["']/i, '');
    if (!/\bdata-action\s*=/i.test(attrs)) attrs += ' data-action="follow-checkpoints"';
    attrs += ` id="${buttonId}"`;
    repaired += 1;
    return `<button${attrs}>`;
  });
  if (after !== before) fs.writeFileSync(file, after);
  const followButtons = [...after.matchAll(/<button\b([^>]*)>/gi)].map(match => match[1]).filter(attrs => /\bdata-follow-id\s*=/i.test(attrs));
  const ids = followButtons.map(attrs => (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1]).filter(Boolean);
  if (followButtons.some(attrs => !/\bdata-action\s*=\s*["']follow-checkpoints["']/i.test(attrs))) throw new Error(`${path.relative(root, file)} contains a follow control without an explicit data-action binding`);
  if (ids.length !== followButtons.length || new Set(ids).size !== ids.length) throw new Error(`${path.relative(root, file)} contains missing or duplicate follow-control IDs`);
  return { file:path.relative(root, file), skipped:false, repaired:followButtons.length };
}

const moneyDepthBuild = spawnSync(process.execPath, [path.join(root, 'scripts', 'finalize-money-intelligence-depth.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe', env: process.env });
if (moneyDepthBuild.stdout) process.stdout.write(moneyDepthBuild.stdout);
if (moneyDepthBuild.stderr) process.stderr.write(moneyDepthBuild.stderr);
if (moneyDepthBuild.status !== 0) throw new Error('Money intelligence depth and overlap integration failed before homepage finalization');

const structuralPowerBuild = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-behind-the-curtain.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe', env: process.env });
if (structuralPowerBuild.stdout) process.stdout.write(structuralPowerBuild.stdout);
if (structuralPowerBuild.stderr) process.stderr.write(structuralPowerBuild.stderr);
if (structuralPowerBuild.status !== 0) throw new Error('Behind the Curtain structural-power build failed before homepage finalization');

const source = path.join(root, 'index.html');
if (!fs.existsSync(source)) throw new Error('index.html is missing');
const before = fs.readFileSync(source, 'utf8');
const after = patchHtml(before);
if (after !== before) fs.writeFileSync(source, after);
ensureOne(source);

const patched = ['index.html'];
if (fs.existsSync(output)) {
  for (const relative of ['index.html', 'index']) {
    const target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, after);
    ensureOne(target);
    patched.push(`_site/${relative}`);
  }
}

const consequenceRepairs = [repairConsequenceControls(path.join(root, 'public-consequence-contracts.html'))];
if (fs.existsSync(output)) {
  for (const relative of ['public-consequence-contracts.html', 'public-consequence-contracts']) {
    consequenceRepairs.push(repairConsequenceControls(path.join(output, relative)));
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  bannerId: 'matrix-construction-banner',
  message: 'UNDER CONSTRUCTION — HELP US BUILD THE MACHINE.',
  liveRoute: 'live-intel.html',
  supportRoute: supportUrl,
  supportPurpose: 'High-memory GPUs, secure computing infrastructure, storage and evidence-processing capacity',
  supportLinkPolicy: 'Exactly one GoFundMe CTA inside the construction banner; other clearly labelled support routes elsewhere on the homepage are permitted.',
  navigationRecovery: 'Desktop primary navigation and its links are explicitly visible and measurable after the welcome gate closes, including the canonical control-structure.html route.',
  consequenceControlRecovery: consequenceRepairs,
  moneyDepthBuild: 'scripts/finalize-money-intelligence-depth.js',
  structuralPowerBuild: 'scripts/build-behind-the-curtain.js',
  patched
}, null, 2)}\n`);

console.log(`Homepage construction and support banner secured across ${patched.join(', ')}; desktop navigation visibility and canonical Control System route repaired; consequence follow controls repaired; money intelligence depth, overlap propagation and Behind the Curtain structural-power model rebuilt first.`);
