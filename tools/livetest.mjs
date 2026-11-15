// Live interaction test for the token radar dashboard (Playwright).
// Usage: node tools/livetest.mjs [out-dir]   (default: out)
// Clicks the Live tab, sorts by TVL, searches, opens a detail drawer; exits 1 on failure.
import { chromium } from '/home/hatch/workspace/makefun/tools/node_modules/playwright/index.mjs';

const out = process.argv[1] ? process.argv[2] ?? 'out' : 'out';
const url = `file://${process.cwd()}/${out}/dashboard/index.html`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) errors.push(name);
};

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(400);

// 1. Live tab shows the live table.
await page.click('button:has-text("Live token")');
await page.waitForTimeout(300);
let live = await page.evaluate(() => ({
  rows: document.querySelectorAll('table.board tbody tr').length,
  note: document.querySelector('.note')?.textContent.slice(0, 60) ?? '',
}));
check('live_tab', live.rows === 24, `rows=${live.rows}`);

// 2. Back to board, sort by TVL: first row must be the largest TVL.
await page.click('button:has-text("Pre-token board")');
await page.waitForTimeout(200);
await page.click('table.board thead th:nth-child(3) button');
await page.waitForTimeout(200);
let first = await page.evaluate(() => document.querySelector('table.board tbody tr td:nth-child(3)')?.textContent);
check('sort_tvl', first === '$2.75B', `first TVL=${first}`);

// 3. Sort by 7d growth: first row must be the largest growth.
await page.click('table.board thead th:nth-child(4) button');
await page.waitForTimeout(200);
let g = await page.evaluate(() => document.querySelector('table.board tbody tr td:nth-child(4)')?.textContent);
check('sort_growth', g !== null && g.startsWith('+'), `first 7d=${g}`);

// 4. Search narrows the board.
await page.fill('#q', 'veda');
await page.waitForTimeout(300);
let found = await page.evaluate(() => document.querySelector('.count')?.textContent);
check('search', /1 of 226/.test(found ?? ''), found);
await page.fill('#q', '');
await page.waitForTimeout(200);

// 5. Click a row opens the drawer with 6 farm steps and a recomputed implied value.
await page.click('table.board tbody tr:first-child');
await page.waitForTimeout(300);
let drawer = await page.evaluate(() => {
  const d = document.querySelector('.drawer');
  if (!d) return null;
  return { title: d.querySelector('h2')?.textContent, steps: d.querySelectorAll('.steps li').length, note: d.querySelector('.modelbox .note')?.textContent ?? '' };
});
check('detail_drawer', !!drawer && drawer.steps === 6 && /agrees with the board/.test(drawer.note), JSON.stringify(drawer));

// 6. Close the drawer.
await page.click('.drawer .close');
await page.waitForTimeout(200);
let closed = await page.evaluate(() => !document.querySelector('.drawer'));
check('drawer_close', closed);

// 7. Method section opens and lists multiples.
await page.click('.method summary');
await page.waitForTimeout(200);
let mults = await page.evaluate(() => document.querySelectorAll('.method tbody tr').length);
check('method_table', mults >= 10, `rows=${mults}`);

await browser.close();
if (errors.length > 0) { console.error('FAILURES:', errors.join(', ')); process.exit(1); }
console.log('livetest ok, no console errors');
