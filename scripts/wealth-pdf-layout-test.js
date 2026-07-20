const fs = require('fs');
const path = require('path');

const root = process.cwd();
const full = rel => path.join(root, rel);
const failures = [];
const fail = message => failures.push(message);
const json = rel => { try { return JSON.parse(fs.readFileSync(full(rel), 'utf8')); } catch { return null; } };
const unescapePdf = value => String(value || '').replace(/\\([\\()])/g, '$1');

const index = json('downloads/wealth-guides/index.json');
if (!index || !Array.isArray(index.guides)) fail('wealth guide index is unavailable');

for (const guide of index?.guides || []) {
  const rel = `downloads/wealth-guides/${guide.slug}.pdf`;
  if (!fs.existsSync(full(rel))) { fail(`${guide.slug}: PDF missing`); continue; }
  const pdf = fs.readFileSync(full(rel), 'latin1');
  if (pdf.includes('0 -0 Td')) fail(`${guide.slug}: zero-distance text movement can cause heading overlap`);
  const streams = [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(match => match[1]);
  const pageStreams = streams.filter(stream => stream.includes('42 720 Td') && stream.includes('0 758 595 84 re f'));
  if (pageStreams.length !== Number(guide.pageCount || 0)) fail(`${guide.slug}: found ${pageStreams.length} page streams but index reports ${guide.pageCount}`);
  pageStreams.forEach((stream, pageIndex) => {
    const main = stream.split("ET\nq\n0.94 0.94 0.94 rg")[0];
    const lines = main.split('\n');
    let y = 720;
    let previousTextY = null;
    let activeSize = 9;
    for (const line of lines) {
      const font = line.match(/^\/F[12] (\d+(?:\.\d+)?) Tf$/);
      if (font) activeSize = Number(font[1]);
      const move = line.match(/^0 -(\d+(?:\.\d+)?) Td$/);
      if (move) { y -= Number(move[1]); continue; }
      const text = line.match(/^\((.*)\) Tj$/);
      if (!text) continue;
      const decoded = unescapePdf(text[1]);
      if (decoded.length > 100) fail(`${guide.slug} page ${pageIndex + 1}: unwrapped line has ${decoded.length} characters`);
      if (y < 52) fail(`${guide.slug} page ${pageIndex + 1}: main text reaches y=${y}, too close to footer`);
      if (previousTextY !== null && Math.abs(previousTextY - y) < Math.max(8, activeSize * 0.9)) {
        fail(`${guide.slug} page ${pageIndex + 1}: text baselines overlap at y=${y}`);
      }
      previousTextY = y;
    }
  });
}

const builder = fs.existsSync(full('scripts/build-detailed-wealth-guides.js')) ? fs.readFileSync(full('scripts/build-detailed-wealth-guides.js'), 'utf8') : '';
for (const marker of [
  'layout-v2: every printable line is wrapped',
  "'heading': { font: 'F2', size: 12, advance: 21 }",
  'const capacity = 630;',
  "itemsFor('cover-body'",
  "itemsFor('continued'"
]) if (!builder.includes(marker)) fail(`builder missing layout marker: ${marker}`);
if (builder.includes("'heading': ['/F2 12 Tf\\n', 0]")) fail('builder still contains zero-advance heading layout');

const allBuilder = fs.existsSync(full('scripts/build-all-branded-download-pdfs.js')) ? fs.readFileSync(full('scripts/build-all-branded-download-pdfs.js'), 'utf8') : '';
if (!allBuilder.includes("run('wealth-pdf-layout-test.js')")) fail('complete branded PDF pipeline does not run the layout regression test');

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  guideCount: index?.guides?.length || 0,
  checkedPages: (index?.guides || []).reduce((sum, guide) => sum + Number(guide.pageCount || 0), 0),
  failures
};
fs.mkdirSync(full('downloads'), { recursive: true });
fs.writeFileSync(full('downloads/wealth-pdf-layout-test.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error('WEALTH PDF LAYOUT TEST FAILED');
  failures.forEach(problem => console.error(`- ${problem}`));
  process.exit(1);
}
console.log(`Wealth PDF layout test passed: ${report.guideCount} guides and ${report.checkedPages} pages checked for wrapping, baseline spacing and footer clearance.`);
