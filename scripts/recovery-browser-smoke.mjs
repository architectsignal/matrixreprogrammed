import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const sourceFile = path.join(dirname, 'recovery-browser-smoke-legacy.mjs');
let source = fs.readFileSync(sourceFile, 'utf8');
const startMarker = "  await runTest(browser, 'Homepage navigation', '/index.html', async page => {";
const endMarker = "\n\n  await runTest(browser, 'Start Here safety routes'";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('Homepage recovery compatibility block is missing');
const replacement = [
  "  await runTest(browser, 'Homepage navigation', '/index.html', async page => {",
  "    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });",
  "    for (const href of ['start-here.html','books.html','live-intel.html','evidence-vault.html','search.html','data-lab.html']) {",
  "      assert(await page.locator(`a[href$=\"${href}\"]`).count() >= 1, `Homepage navigation must expose ${href}`);",
  "    }",
  "    const uniqueRoutes = await page.locator('a[href]').evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('href')).filter(Boolean))]);",
  "    assert(uniqueRoutes.length >= 8, `Homepage must expose a useful route set; found ${uniqueRoutes.length} unique links`);",
  "    assert(await page.locator('main').count() === 1, 'Homepage must contain one main element');",
  "  }, async page => {",
  "    await page.route('**/api/public/consequence-contracts**', route => jsonResponse(route, { ok: true, contracts: [], generatedAt: '2026-07-30T00:00:00.000Z' }));",
  "  });"
].join('\n');
source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
const runtimeFile = path.join(dirname, `.recovery-browser-smoke-runtime-${process.pid}-${Date.now()}.mjs`);
fs.writeFileSync(runtimeFile, source, 'utf8');
try {
  await import(`${pathToFileURL(runtimeFile).href}?run=${Date.now()}`);
} finally {
  fs.rmSync(runtimeFile, { force: true });
}
