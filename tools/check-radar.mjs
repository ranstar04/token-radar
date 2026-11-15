// Local replica of the token-radar-01 gate, run against an output directory.
// Usage: node tools/check-radar.mjs [out-dir]   (default: out)
// Exits 1 on any failure, printing each failed row with its detail.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'out';
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`PASS ${name}`);
  else { console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); failures.push(name); }
};

const snap = JSON.parse(readFileSync(process.argv[3] ?? '../token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const snapSlugs = new Set(snap.protocols.map((p) => p.slug));

// --- dashboard_files ---
const dashDir = join(out, 'dashboard');
let dashFiles = [];
try {
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.isFile()) dashFiles.push(p); } };
  walk(dashDir);
} catch { /* handled below */ }
const dashBytes = dashFiles.reduce((n, f) => n + statSync(f).size, 0);
const hasIndex = dashFiles.some((f) => f.endsWith('/index.html'));
const hasCss = dashFiles.some((f) => f.endsWith('.css'));
const hasJs = dashFiles.some((f) => f.endsWith('.js'));
const nameRe = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const badName = dashFiles.find((f) => { const rel = f.slice(dashDir.length + 1); return rel.split('/').some((part) => !nameRe.test(part) || part.startsWith('.')); });
const netRe = /(?:href|src|action)\s*=\s*["']https?:\/\/|@import\s+["']https?:\/\/|url\(\s*["']?https?:\/\/|from\s+["']https?:\/\/|import\(\s*["']https?:\/\/|require\(\s*["']https?:\/\//;
const netFile = dashFiles.find((f) => /\.(html|css|js)$/.test(f) && netRe.test(readFileSync(f, 'utf8')));
ok('dashboard_files', hasIndex && hasCss && hasJs && dashFiles.length <= 400 && dashBytes <= 4 * 1024 * 1024 && !badName && !netFile,
  !hasIndex ? 'no index.html' : !hasCss ? 'no .css' : !hasJs ? 'no .js' : dashFiles.length > 400 ? 'too many files' : dashBytes > 4 * 1024 * 1024 ? 'too many bytes' : badName ? `bad name ${badName}` : netFile ? `network address in ${netFile}` : '');
const dashTextBytes = dashFiles.filter((f) => /\.(html|css|js|json|mjs|svg|md|txt)$/.test(f)).reduce((n, f) => n + statSync(f).size, 0);
ok('dashboard_source_under_64k', dashTextBytes < 65536, `${dashTextBytes} bytes`);

// --- board_file + sorted_by_value + coverage + farm_steps ---
const boardPath = join(out, 'board.json');
let rows = [];
try {
  const b = JSON.parse(readFileSync(boardPath, 'utf8'));
  rows = Array.isArray(b) ? b : b.rows;
} catch (e) { ok('board_file', false, String(e)); }
const boardBytes = existsSync(boardPath) ? statSync(boardPath).size : 0;
const badSlug = rows.find((r) => !snapSlugs.has(r.slug));
const badRow = rows.find((r) => typeof r.name !== 'string' || !r.name || !Number.isSafeInteger(r.rank) || r.rank <= 0 || !Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14 || !Array.isArray(r.farm_steps));
ok('board_file', rows.length >= 100 && rows.length <= 4000 && boardBytes <= 8 * 1024 * 1024 && !badSlug && !badRow,
  rows.length < 100 ? `only ${rows.length} rows` : badSlug ? `invented slug ${badSlug.slug}` : badRow ? `bad row ${badRow.slug}` : `${rows.length} rows`);
const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
const ranksOk = ranks.every((v, i) => v === i + 1);
const sortedOk = rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd);
const allSame = rows.length >= 2 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd);
ok('sorted_by_value', ranksOk && sortedOk && !allSame, !ranksOk ? 'ranks not 1..N' : !sortedOk ? 'implied value rises with rank' : 'all implied values equal');
const rowSlugs = new Set(rows.map((r) => r.slug));
const missing = snap.watchlist.filter((s) => !rowSlugs.has(s));
ok('coverage', missing.length === 0, missing.length ? `missing ${missing.slice(0, 5).join(', ')}` : `${snap.watchlist.length}/${snap.watchlist.length}`);
const badSteps = rows.find((r) => r.farm_steps.length < 3 || r.farm_steps.length > 12 || r.farm_steps.some((s) => typeof s !== 'string' || s.trim().length < 20 || s.trim().length > 600));
ok('farm_steps', !badSteps, badSteps ? `${badSteps.slug} has a bad step` : `${rows.length} rows x ${rows[0]?.farm_steps.length ?? 0} steps`);

// --- screenshots ---
const shotsDir = join(out, 'screenshots');
let shots = [];
try { shots = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort(); } catch { /* no dir */ }
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: (buf[i + 5] << 8) | buf[i + 6], w: (buf[i + 7] << 8) | buf[i + 8] };
    }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    i += 2 + len;
  }
  return null;
}
function pngSize(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
let shotsOk = shots.length >= 3 && shots.length <= 4;
let shotDetail = '';
for (const name of shots) {
  const p = join(shotsDir, name);
  const st = statSync(p);
  const buf = readFileSync(p);
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const dims = isJpeg ? jpegSize(buf) : isPng ? pngSize(buf) : null;
  if (!nameRe.test(name) || st.size > 524288 || !dims || Math.max(dims.w, dims.h) > 1440 || Math.min(dims.w, dims.h) < 800) {
    shotsOk = false;
    shotDetail = `${name}: ${st.size} bytes, ${dims ? `${dims.w}x${dims.h}` : 'not an image'}`;
    break;
  }
}
ok('screenshots', shotsOk, shots.length < 3 ? `only ${shots.length}` : shotDetail || shots.map((s) => `${s} ${Math.round(statSync(join(shotsDir, s)).size / 1024)}KB`).join(', '));

// --- dossier_matches ---
const dossierPath = join(out, 'dossier.json');
let dossierOk = false;
try {
  const { buildDossier } = await import('../vendor/makefun-board.ts');
  const rebuilt = buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
  const onDisk = readFileSync(dossierPath);
  dossierOk = Buffer.compare(Buffer.from(rebuilt), onDisk) === 0;
  ok('dossier_matches', dossierOk, dossierOk ? `${onDisk.length} bytes` : `rebuilt ${rebuilt.length} bytes vs disk ${onDisk.length} bytes`);
} catch (e) { ok('dossier_matches', false, String(e)); }

console.log(failures.length === 0 ? 'ALL GATE ROWS PASS' : `${failures.length} FAILURES: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
