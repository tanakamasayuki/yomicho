// @ts-check
// 実験用。既存ツールの出力と新しい build の出力を突き合わせる。
// 使い方: node scripts/experiment-diff.js <corpus-dir> <words.txt> [--show <n>]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { annotate, buildMatcher, stripRuby } from '../src/index.js';
import { loadDicts } from '../src/node/index.js';

const [corpus, dictPath] = process.argv.slice(2);
const showIdx = process.argv.indexOf('--show');
const show = showIdx > 0 ? Number(process.argv[showIdx + 1]) : 6;
if (!corpus || !dictPath) {
  process.stderr.write('usage: experiment-diff.js <corpus-dir> <words.txt> [--show n]\n');
  process.exit(1);
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walk(path));
    else if (name.endsWith('_strip.md')) out.push(path);
  }
  return out;
}

const { dict, errors } = loadDicts([dictPath]);
if (errors.length) {
  process.stdout.write(`辞書のエラー ${errors.length} 件\n`);
  for (const e of errors.slice(0, 10)) process.stdout.write(`  ${e.line}: ${e.message} — ${e.text}\n`);
}
const matcher = buildMatcher(dict.values());
process.stdout.write(`辞書 ${dict.size} エントリ\n\n`);

const RUBY = /<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/g;
/** @param {string} s */
const rubies = (s) => [...s.matchAll(RUBY)].map((m) => `${m[1]}｜${m[2]}`);

let files = 0;
let identical = 0;
/** @type {Map<string, number>} */
const onlyExpected = new Map();
/** @type {Map<string, number>} */
const onlyActual = new Map();
/** @type {Array<{file: string, line: number, exp: string, act: string}>} */
const lineDiffs = [];
let totalGrouped = 0;
let totalMono = 0;

for (const stripPath of walk(corpus).sort()) {
  const expectedPath = stripPath.replace(/_strip\.md$/, '.md');
  let expected;
  try {
    expected = readFileSync(expectedPath, 'utf8');
  } catch {
    continue;
  }
  files++;
  const source = readFileSync(stripPath, 'utf8');
  const { text: actual, stats } = annotate(stripRuby(source), matcher);
  totalGrouped += stats.grouped;
  totalMono += stats.mono;
  if (actual === expected) {
    identical++;
    continue;
  }
  const e = rubies(expected);
  const a = rubies(actual);
  const count = (/** @type {string[]} */ xs) => {
    /** @type {Map<string, number>} */
    const m = new Map();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const ec = count(e);
  const ac = count(a);
  for (const [k, n] of ec) {
    const d = n - (ac.get(k) ?? 0);
    if (d > 0) onlyExpected.set(k, (onlyExpected.get(k) ?? 0) + d);
  }
  for (const [k, n] of ac) {
    const d = n - (ec.get(k) ?? 0);
    if (d > 0) onlyActual.set(k, (onlyActual.get(k) ?? 0) + d);
  }
  const el = expected.split('\n');
  const al = actual.split('\n');
  for (let i = 0; i < Math.max(el.length, al.length); i++) {
    if (el[i] !== al[i]) lineDiffs.push({ file: expectedPath, line: i + 1, exp: el[i] ?? '', act: al[i] ?? '' });
  }
}

process.stdout.write(`ファイル ${files} 組 / 完全一致 ${identical} / 差分あり ${files - identical}\n`);
process.stdout.write(`ルビ グループ ${totalGrouped} / 分割 ${totalMono}\n`);
process.stdout.write(`差分行 ${lineDiffs.length}\n\n`);

/** @param {string} title @param {Map<string, number>} m */
function dump(title, m) {
  const list = [...m].sort((x, y) => y[1] - x[1]);
  const total = list.reduce((s, [, n]) => s + n, 0);
  process.stdout.write(`── ${title}: ${list.length} 種 / ${total} 個\n`);
  for (const [k, n] of list.slice(0, show * 4)) process.stdout.write(`   ${String(n).padStart(4)}  ${k}\n`);
  if (list.length > show * 4) process.stdout.write(`   … 他 ${list.length - show * 4} 種\n`);
  process.stdout.write('\n');
}
dump('旧のみ（新で出なかったルビ）', onlyExpected);
dump('新のみ（新で増えたルビ）', onlyActual);

process.stdout.write(`── 差分行の例（先頭 ${show} 件）\n`);
for (const d of lineDiffs.slice(0, show)) {
  process.stdout.write(`\n  ${d.file.split('/').slice(-2).join('/')}:${d.line}\n`);
  process.stdout.write(`  旧: ${d.exp.slice(0, 160)}\n`);
  process.stdout.write(`  新: ${d.act.slice(0, 160)}\n`);
}
