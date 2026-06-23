const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const packagePath = path.join(root, 'data', 'latest-video-package.json');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function xml(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function wrapWords(s = '', max = 28, lines = 8) {
  const words = String(s).replace(/\s+/g, ' ').trim().split(' ');
  const out = [];
  let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > max) {
      if (cur) out.push(cur);
      cur = word;
    } else cur = (cur + ' ' + word).trim();
    if (out.length >= lines) break;
  }
  if (cur && out.length < lines) out.push(cur);
  return out;
}
function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}
function hasFile(p) { return fs.existsSync(p) && fs.statSync(p).size > 1000; }
function durationSeconds(mediaPath) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', mediaPath], { encoding: 'utf8' });
    const n = Number.parseFloat(out.trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
function sceneSvg(pack, scene, idx, total) {
  const titleLines = wrapWords(scene.title || `Scene ${idx}`, 20, 3);
  const headlineLines = wrapWords(pack.title || '', 24, 7);
  const label = pack.evidenceLabel || 'Signal';
  const source = pack.source || 'Matrix Reprogrammed';
  const accent = idx % 2 === 0 ? '#00ff66' : '#d7b35a';
  const yTitle = 240;
  const titleText = titleLines.map((line, i) => `<text x="90" y="${yTitle + i * 70}" fill="#eaffef" font-family="Georgia,serif" font-size="62" font-weight="bold">${xml(line.toUpperCase())}</text>`).join('');
  const yHead = 620;
  const headlineText = headlineLines.map((line, i) => `<text x="90" y="${yHead + i * 56}" fill="#cffff0" font-family="Arial,sans-serif" font-size="42" font-weight="700">${xml(line)}</text>`).join('');
  const code = Array.from({ length: 70 }).map((_, i) => {
    const x = 20 + ((i * 83) % 1040);
    const y = 60 + ((i * 149) % 1780);
    const op = (0.055 + (i % 7) * 0.018).toFixed(3);
    return `<text x="${x}" y="${y}" fill="#00ff66" opacity="${op}" font-family="monospace" font-size="${18 + (i % 6) * 7}">DOG MATRIX FILE</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#010302"/>
  <defs>
    <radialGradient id="g" cx="50%" cy="30%" r="80%"><stop offset="0%" stop-color="#063d1f"/><stop offset="45%" stop-color="#020604"/><stop offset="100%" stop-color="#000"/></radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1080" height="1920" fill="url(#g)" opacity="0.92"/>
  ${code}
  <rect x="54" y="70" width="972" height="1780" fill="rgba(0,0,0,.28)" stroke="#00ff66" stroke-opacity="0.60" stroke-width="3"/>
  <rect x="82" y="100" width="916" height="1720" fill="none" stroke="#d7b35a" stroke-opacity="0.45" stroke-width="2"/>
  <text x="90" y="160" fill="#d7b35a" font-family="monospace" font-size="34" letter-spacing="5">MATRIX REPROGRAMMED</text>
  <text x="90" y="196" fill="#00ff66" font-family="monospace" font-size="22">SCENE ${String(idx).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${xml(label.toUpperCase())}</text>
  ${titleText}
  <line x1="90" y1="520" x2="990" y2="520" stroke="${accent}" stroke-width="3" opacity="0.75"/>
  ${headlineText}
  <circle cx="540" cy="1295" r="185" fill="none" stroke="#00ff66" stroke-opacity="0.42" stroke-width="5" filter="url(#glow)"/>
  <path d="M420 1350 C405 1260 470 1170 540 1170 C610 1170 675 1260 660 1350 C625 1405 455 1405 420 1350 Z" fill="none" stroke="#eaffef" stroke-opacity="0.82" stroke-width="8"/>
  <circle cx="490" cy="1282" r="18" fill="#00ff66" opacity="0.85"/><circle cx="590" cy="1282" r="18" fill="#00ff66" opacity="0.85"/>
  <text x="395" y="1528" fill="#eaffef" font-family="Georgia,serif" font-size="96" font-weight="bold">D.O.G</text>
  <text x="90" y="1668" fill="#d7b35a" font-family="monospace" font-size="28">SOURCE: ${xml(source.toUpperCase()).slice(0, 55)}</text>
  <text x="90" y="1718" fill="#00ff66" font-family="monospace" font-size="28">THE TRUTH IS NOT HIDDEN. IT IS ENCODED.</text>
  <text x="90" y="1770" fill="#cffff0" font-family="monospace" font-size="24">BLACK FILE · DOG THE ARCHITECT · INTEL DESK</text>
  </svg>`;
}

if (!fs.existsSync(packagePath)) throw new Error('Missing data/latest-video-package.json. Run build-weekly-dog-video-package first.');
const pack = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const outDir = path.join(root, 'video-packages', pack.slug);
ensureDir(outDir);

const scenes = Array.isArray(pack.scenes) && pack.scenes.length ? pack.scenes : [{ title: 'THE SIGNAL', prompt: pack.title }];
const audioPath = path.join(outDir, 'voiceover.mp3');
const silentPath = path.join(outDir, 'silence.m4a');
let finalAudio = audioPath;
let audioDuration = hasFile(audioPath) ? durationSeconds(audioPath) : 0;

if (!audioDuration) {
  finalAudio = silentPath;
  audioDuration = 45;
  run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-t', String(audioDuration), '-c:a', 'aac', silentPath]);
}

const perScene = Math.max(6, Math.ceil(audioDuration / scenes.length));
const listPath = path.join(outDir, 'image-list.txt');
let listContent = '';

scenes.forEach((scene, i) => {
  const svgPath = path.join(outDir, `scene-${String(i + 1).padStart(2, '0')}.svg`);
  const pngPath = path.join(outDir, `scene-${String(i + 1).padStart(2, '0')}.png`);
  fs.writeFileSync(svgPath, sceneSvg(pack, scene, i + 1, scenes.length));
  run('rsvg-convert', ['-w', '1080', '-h', '1920', svgPath, '-o', pngPath]);
  listContent += `file '${pngPath.replace(/'/g, "'\\''")}'\n`;
  listContent += `duration ${perScene}\n`;
});
const lastPng = path.join(outDir, `scene-${String(scenes.length).padStart(2, '0')}.png`);
listContent += `file '${lastPng.replace(/'/g, "'\\''")}'\n`;
fs.writeFileSync(listPath, listContent);

const outMp4 = path.join(outDir, 'weekly-dog-transmission.mp4');
run('ffmpeg', [
  '-y',
  '-f', 'concat', '-safe', '0', '-i', listPath,
  '-i', finalAudio,
  '-vf', 'scale=1080:1920,format=yuv420p',
  '-r', '30',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '22',
  '-c:a', 'aac',
  '-b:a', '160k',
  '-shortest',
  '-movflags', '+faststart',
  outMp4
]);

const stats = fs.statSync(outMp4);
console.log(`Rendered MP4: ${outMp4}`);
console.log(`MP4 bytes: ${stats.size}`);
