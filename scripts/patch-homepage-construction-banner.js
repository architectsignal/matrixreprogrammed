const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const output = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'homepage-construction-banner.json');
const startMarker = '<!-- construction-banner:start -->';
const endMarker = '<!-- construction-banner:end -->';
const blockPattern = /<!-- construction-banner:start -->[\s\S]*?<!-- construction-banner:end -->/g;

const banner = `${startMarker}<section id="matrix-construction-banner" class="matrix-construction-banner" role="status" aria-label="Matrix Reprogrammed is under construction"><style>
.matrix-construction-banner{position:relative;z-index:20;margin:.75rem auto 1.25rem;width:min(1180px,calc(100% - 1.5rem));overflow:hidden;border:1px solid rgba(224,183,92,.68);border-radius:18px;background:linear-gradient(110deg,rgba(10,7,2,.98),rgba(45,7,7,.96) 48%,rgba(6,6,6,.98));box-shadow:0 0 30px rgba(190,55,55,.18),inset 0 0 28px rgba(224,183,92,.06)}
.matrix-construction-banner:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 46px,rgba(224,183,92,.035) 47px 48px);pointer-events:none}
.matrix-construction-banner:after{content:'';position:absolute;top:0;bottom:0;width:32%;left:-38%;background:linear-gradient(90deg,transparent,rgba(255,235,172,.13),transparent);animation:matrixConstructionScan 5.5s linear infinite;pointer-events:none}
.matrix-construction-inner{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:1rem;padding:.9rem 1rem}
.matrix-construction-status{display:inline-flex;align-items:center;gap:.48rem;border:1px solid rgba(255,105,105,.62);border-radius:999px;padding:.38rem .68rem;color:#ffd2d2;font-size:.75rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.matrix-construction-status:before{content:'';width:.62rem;height:.62rem;border-radius:50%;background:#ff4a4a;box-shadow:0 0 14px #ff4a4a;animation:matrixConstructionPulse 1.5s ease-in-out infinite}
.matrix-construction-copy strong{display:block;color:#fff4d2;font-size:clamp(.98rem,2vw,1.24rem);letter-spacing:.035em}
.matrix-construction-copy span{display:block;margin-top:.2rem;color:#d8ccb0;font-size:.9rem;line-height:1.45}
.matrix-construction-action{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:.65rem .9rem;border:1px solid rgba(224,183,92,.68);border-radius:12px;color:#fff3c6;text-decoration:none;font-weight:850;white-space:nowrap;background:rgba(224,183,92,.08)}
.matrix-construction-action:hover,.matrix-construction-action:focus-visible{background:rgba(224,183,92,.17);outline:none;box-shadow:0 0 18px rgba(224,183,92,.18)}
@keyframes matrixConstructionScan{to{left:106%}}
@keyframes matrixConstructionPulse{50%{opacity:.38;transform:scale(.78)}}
@media(max-width:760px){.matrix-construction-inner{grid-template-columns:1fr;gap:.65rem}.matrix-construction-action{width:100%}}
@media(prefers-reduced-motion:reduce){.matrix-construction-banner:after,.matrix-construction-status:before{animation:none}}
</style><div class="matrix-construction-inner"><span class="matrix-construction-status">Build Active</span><div class="matrix-construction-copy"><strong>UNDER CONSTRUCTION — THE MACHINE IS STILL BUILDING.</strong><span>Live intelligence, evidence routes and member services remain available while the final system is connected.</span></div><a class="matrix-construction-action" href="live-intel.html">Open Live Intel</a></div></section>${endMarker}`;

function patchHtml(html) {
  const cleaned = String(html).replace(blockPattern, '');
  if (/<\/header>/i.test(cleaned)) return cleaned.replace(/<\/header>/i, `</header>${banner}`);
  if (/<body[^>]*>/i.test(cleaned)) return cleaned.replace(/(<body[^>]*>)/i, `$1${banner}`);
  throw new Error('Homepage construction banner could not find a header or body insertion point');
}

function ensureOne(file) {
  const html = fs.readFileSync(file, 'utf8');
  const banners = (html.match(/id=["']matrix-construction-banner["']/g) || []).length;
  const starts = (html.match(/<!-- construction-banner:start -->/g) || []).length;
  const ends = (html.match(/<!-- construction-banner:end -->/g) || []).length;
  if (banners !== 1 || starts !== 1 || ends !== 1) throw new Error(`${path.relative(root, file)} does not contain exactly one construction banner`);
}

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

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  bannerId: 'matrix-construction-banner',
  message: 'UNDER CONSTRUCTION — THE MACHINE IS STILL BUILDING.',
  liveRoute: 'live-intel.html',
  structuralPowerBuild: 'scripts/build-behind-the-curtain.js',
  patched
}, null, 2)}\n`);

console.log(`Homepage construction banner secured across ${patched.join(', ')}; Behind the Curtain structural-power model rebuilt first.`);
