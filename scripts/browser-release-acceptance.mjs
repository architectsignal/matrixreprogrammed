import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = process.cwd();
const deploy = path.resolve(root, process.env.DEPLOY_DIR || '_site');
const baseUrl = process.env.RELEASE_BASE_URL || 'http://127.0.0.1:4173';
const concurrency = Math.max(1, Number(process.env.RELEASE_BROWSER_CONCURRENCY || 4));
const timeout = Math.max(2000, Number(process.env.RELEASE_BROWSER_TIMEOUT || 8000));
const problems = [];
const warnings = [];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}
function relative(file) { return path.relative(deploy, file).split(path.sep).join('/'); }
function route(file) {
  const rel = relative(file);
  return rel === 'index.html' ? '/' : `/${rel.replace(/\.html$/i, '')}`;
}
function addProblem(value) { problems.push(value); }

if (!fs.existsSync(deploy)) throw new Error(`Deploy directory missing: ${deploy}`);
const files = walk(deploy).sort();
const browser = await chromium.launch({ headless: true });
let cursor = 0;
let checked = 0;

async function worker(workerId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', async routeHandler => {
    const url = new URL(routeHandler.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return routeHandler.continue();
    return routeHandler.abort();
  });
  while (true) {
    const index = cursor++;
    if (index >= files.length) break;
    const file = files[index];
    const rel = relative(file);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') warnings.push(`${rel}: console error: ${message.text()}`); });
    try {
      const response = await page.goto(`${baseUrl}${route(file)}`, { waitUntil: 'domcontentloaded', timeout });
      if (!response || response.status() >= 400) addProblem(`${rel}: route returned ${response ? response.status() : 'no response'}`);
      const metrics = await page.evaluate(() => ({
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
        clientWidth: document.documentElement.clientWidth,
        title: document.title,
        loadingText: /Loading boundary|Loading lanes|The operational board is loading/i.test(document.body?.innerText || ''),
        visibleEscapedNewline: /\\n/.test((document.body?.innerText || '').replace(/https?:\/\/\S+/g, ''))
      }));
      if (metrics.scrollWidth > metrics.clientWidth + 3) addProblem(`${rel}: mobile horizontal overflow ${metrics.scrollWidth}px > ${metrics.clientWidth}px`);
      if (!metrics.title.trim()) addProblem(`${rel}: empty browser title`);
      if (/case-status-dashboard/i.test(rel) && metrics.loadingText) addProblem(`${rel}: loading placeholder remains visible`);
      if (metrics.visibleEscapedNewline) addProblem(`${rel}: escaped newline is visible in rendered copy`);
      if (pageErrors.length) addProblem(`${rel}: uncaught page error: ${pageErrors.join(' | ')}`);
      const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
      for (const violation of results.violations) {
        if (!['critical', 'serious'].includes(violation.impact || '')) continue;
        addProblem(`${rel}: accessibility ${violation.impact} ${violation.id} (${violation.nodes.length} node(s))`);
      }
      checked += 1;
    } catch (error) {
      addProblem(`${rel}: browser audit failed: ${error.message}`);
    } finally {
      await page.close();
    }
  }
  await context.close();
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
await browser.close();

if (problems.length) {
  console.error('\nMOBILE AND ACCESSIBILITY ACCEPTANCE FAILED\n');
  problems.slice(0, 300).forEach(problem => console.error(`- ${problem}`));
  console.error(`\nChecked ${checked}/${files.length} HTML routes; ${problems.length} problem(s), ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`MOBILE AND ACCESSIBILITY ACCEPTANCE PASSED: ${checked} HTML routes; ${warnings.length} non-blocking console warning(s).`);
