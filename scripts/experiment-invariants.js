// @ts-check
// 実験用。正解データを使わずに成立すべき性質を検査する。
// 使い方: node scripts/experiment-invariants.js <dict.tsv> <input.md...>
import { readFileSync } from 'node:fs';
import { annotate, buildMatcher, protectedRanges, stripRuby } from '../src/index.js';
import { loadDicts } from '../src/node/index.js';

const [dictPath, ...inputs] = process.argv.slice(2);
if (!dictPath || inputs.length === 0) {
  process.stderr.write('usage: experiment-invariants.js <dict.tsv> <input.md...>\n');
  process.exit(1);
}

const KANA = /[ぁ-ゖゝ-ゟァ-ヺー]/;
const { dict } = loadDicts([dictPath]);
const matcher = buildMatcher(dict.values());

/** @type {Array<{name: string, fail: number, sample: string}>} */
const checks = [
  { name: 'strip(build(x)) が元に戻る', fail: 0, sample: '' },
  { name: 'build が冪等', fail: 0, sample: '' },
  { name: '保護区間の中身が変わらない', fail: 0, sample: '' },
  { name: 'ルビの親文字に仮名だけの塊が無い', fail: 0, sample: '' },
  { name: 'ルビが入れ子になっていない', fail: 0, sample: '' },
];
const hit = (/** @type {number} */ i, /** @type {string} */ s) => {
  checks[i].fail++;
  if (!checks[i].sample) checks[i].sample = s;
};

for (const path of inputs) {
  const src = stripRuby(readFileSync(path, 'utf8'));
  const once = annotate(src, matcher).text;
  const twice = annotate(stripRuby(once), matcher).text;

  if (stripRuby(once) !== src) {
    const a = stripRuby(once);
    let i = 0;
    while (i < Math.min(a.length, src.length) && a[i] === src[i]) i++;
    hit(0, `${path} @${i}: ${JSON.stringify(src.slice(i, i + 40))} -> ${JSON.stringify(a.slice(i, i + 40))}`);
  }
  if (twice !== once) hit(1, path);

  // 保護区間（入力側で決めた範囲）の中身が出力にそのまま残っているか
  for (const r of protectedRanges(src)) {
    const chunk = src.slice(r.start, r.end);
    if (chunk.trim() !== '' && !once.includes(chunk)) hit(2, `${path} [${r.kind}] ${JSON.stringify(chunk.slice(0, 50))}`);
  }

  for (const m of once.matchAll(/<ruby>(.*?)<rt>/g)) {
    if (m[1] !== '' && [...m[1]].every((c) => KANA.test(c))) hit(3, `${path}: ${m[0]}`);
  }
  for (const m of once.matchAll(/<ruby>(?:(?!<\/?ruby>)[\s\S])*<ruby>/g)) hit(4, `${path}: ${m[0].slice(0, 40)}`);
}

let bad = 0;
for (const c of checks) {
  process.stdout.write(`${c.fail === 0 ? 'ok  ' : 'NG  '} ${c.name}${c.fail ? `  (${c.fail} 件)` : ''}\n`);
  if (c.fail) {
    bad++;
    process.stdout.write(`     ${c.sample}\n`);
  }
}
process.exit(bad ? 1 : 0);
