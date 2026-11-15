// Take the token radar's three screenshots with Playwright (Chromium in this VM).
// Usage: node tools/shot.mjs [out-dir] [quality]   (defaults: out, 85)
// Screenshots: 1-board.jpg (the board), 2-detail.jpg (a protocol's detail view),
// 3-filtered.jpg (a filtered view). Each 1280x800 JPEG. Exits 1 on console errors.
import { chromium } from '/home/hatch/workspace/makefun/tools/node_modules/playwright/index.mjs';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'out';
const quality = Number(process.argv[3] ?? 85);
const page_url = `file://${process.cwd()}/${out}/dashboard/index.html`;
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')).rows;
const topSlug = board[0].slug;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

async function shot(name, hash, check) {
  await page.goto('about:blank');
  await page.goto(`${page_url}${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const info = await page.evaluate(check);
  await page.screenshot({ path: `screenshots/${name}`, type: 'jpeg', quality });
  const bytes = statSync(`screenshots/${name}`).size;
  console.log(`${name}: ${bytes} bytes (${Math.round(bytes / 1024)}KB) — ${info}`);
  return bytes;
}

await shot('1-board.jpg', '', () => {
  const rows = document.querySelectorAll('table.board tbody tr').length;
  const h1 = document.querySelector('h1')?.textContent ?? '';
  return `board rows=${rows} h1="${h1.slice(0, 40)}"`;
});
await shot('2-detail.jpg', `#p=${topSlug}`, () => {
  const d = document.querySelector('.drawer');
  return d ? `drawer="${d.querySelector('h2')?.textContent}" steps=${d.querySelectorAll('.steps li').length}` : 'NO DRAWER';
});
await shot('3-filtered.jpg', '#category=Lending', () => {
  const rows = document.querySelectorAll('table.board tbody tr').length;
  const count = document.querySelector('.count')?.textContent ?? '';
  return `filtered rows=${rows} count="${count}"`;
});

await browser.close();
if (errors.length > 0) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('shots ok, no console errors');
