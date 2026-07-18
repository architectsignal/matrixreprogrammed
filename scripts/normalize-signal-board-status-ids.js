const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const pages = ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html'];
const written = [];
const checks = [];

function normalize(html) {
  let next = String(html || '');
  let canonicalSeen = false;
  next = next.replace(/id=["']forum-member-status["']/gi, () => {
    if (!canonicalSeen) {
      canonicalSeen = true;
      return 'id="forum-member-status"';
    }
    return 'id="signal-pass-status"';
  });
  if (!canonicalSeen && /id=["']signal-pass-status["']/i.test(next)) {
    next = next.replace(/<p([^>]*?)id=["']signal-pass-status["']([^>]*)>/i, '<p$1id="forum-member-status" data-signal-pass-status$2>');
    canonicalSeen = true;
  }

  let aliasSeen = false;
  next = next.replace(/id=["']signal-pass-status["']/gi, () => {
    if (!aliasSeen) {
      aliasSeen = true;
      return 'id="signal-pass-status"';
    }
    return 'data-signal-pass-status-compat="duplicate-removed"';
  });
  if (!aliasSeen) {
    next = next.replace(/(<p[^>]*id=["']forum-member-status["'][^>]*>[\s\S]*?<\/p>)/i, '$1<span id="signal-pass-status" class="sr-only" aria-live="polite">Reading is public and open to everyone.</span>');
  }
  return next;
}

for (const base of [root, site]) {
  if (!fs.existsSync(base)) continue;
  for (const rel of pages) {
    const target = path.join(base, rel);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) continue;
    const before = fs.readFileSync(target, 'utf8');
    const after = normalize(before);
    if (after !== before) {
      fs.writeFileSync(target, after);
      written.push(path.relative(root, target).replace(/\\/g, '/'));
    }
    const canonical = (after.match(/id=["']forum-member-status["']/gi) || []).length;
    const alias = (after.match(/id=["']signal-pass-status["']/gi) || []).length;
    checks.push({ file: path.relative(root, target).replace(/\\/g, '/'), canonical, alias, ok: canonical === 1 && alias === 1 });
  }
}

const ok = checks.length >= 3 && checks.every(item => item.ok);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'signal-board-status-id-normalization.json'), JSON.stringify({ ok, generatedAt: new Date().toISOString(), written, checks }, null, 2));
if (!ok) throw new Error(`Signal Board status ID normalization failed: ${JSON.stringify(checks)}`);
console.log(`Signal Board status IDs normalized: ${written.length} file(s) changed; one canonical and one legacy alias per page.`);
