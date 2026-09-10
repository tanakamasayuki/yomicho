// @ts-check
// 実験用。総ルビとしての被覆率を測る。正解データを使わない。
// 入力側で保護区間を除いたうえで、どの文字がルビに覆われたかを直接数える。
// 使い方: node scripts/experiment-coverage.js <dict.tsv> <input.md...>
import { readFileSync } from 'node:fs';
import { buildMatcher, producesRuby, protectedRanges, stripRuby, tokenize } from '../src/index.js';
import { loadDicts } from '../src/node/index.js';

const [dictPath, ...inputs] = process.argv.slice(2);
if (!dictPath || inputs.length === 0) {
  process.stderr.write('usage: experiment-coverage.js <dict.tsv> <input.md...>\n');
  process.exit(1);
}

const HAN = /\p{Script=Han}/u;
const KANA = /[ぁ-ゖゝ-ゟァ-ヺー]/;
const TOKEN = /[A-Za-z0-9_+.-]*[A-Za-z][A-Za-z0-9_+.-]*/g;

const { dict } = loadDicts([dictPath]);
const matcher = buildMatcher(dict.values());

const stat = { kanji: 0, kanjiBare: 0, tok: 0, tokWhole: 0, tokSplit: 0, tokPartial: 0, tokBare: 0 };
/** @type {Map<string, number>} */ const bareKanji = new Map();
/** @type {Map<string, number>} */ const bareTok = new Map();
/** @type {Map<string, number>} */ const partialTok = new Map();
/** @type {Map<string, number>} */ const splitTok = new Map();
const add = (/** @type {Map<string, number>} */ m, /** @type {string} */ k) => m.set(k, (m.get(k) ?? 0) + 1);

for (const path of inputs) {
  const src = stripRuby(readFileSync(path, 'utf8'));
  /** @type {Array<[number, number]>} */
  const chunks = [];
  let pos = 0;
  for (const r of protectedRanges(src)) {
    if (r.start > pos) chunks.push([pos, r.start]);
    pos = r.end;
  }
  if (pos < src.length) chunks.push([pos, src.length]);

  for (const [cs, ce] of chunks) {
    const chunk = src.slice(cs, ce);
    /** @type {number[]} ルビを出したエントリの通し番号。-1 は未被覆 */
    const owner = new Array(chunk.length).fill(-1);
    let n = 0;
    for (const t of tokenize(chunk, matcher)) {
      if (t.kind !== 'entry' || !producesRuby(t.entry)) continue;
      for (let i = t.start; i < t.end; i++) owner[i] = n;
      n++;
    }
    for (let i = 0; i < chunk.length; i++) {
      if (!HAN.test(chunk[i])) continue;
      stat.kanji++;
      if (owner[i] < 0) {
        stat.kanjiBare++;
        add(bareKanji, chunk[i]);
      }
    }
    for (const m of chunk.matchAll(TOKEN)) {
      const at = m.index ?? 0;
      const ids = new Set(owner.slice(at, at + m[0].length));
      stat.tok++;
      if (ids.size === 1 && !ids.has(-1)) stat.tokWhole++;
      else if (!ids.has(-1)) {
        stat.tokSplit++;
        add(splitTok, m[0]);
      } else if (ids.size > 1) {
        stat.tokPartial++;
        add(partialTok, m[0]);
      } else {
        stat.tokBare++;
        add(bareTok, m[0]);
      }
    }
  }
}

const pc = (/** @type {number} */ a, /** @type {number} */ b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
process.stdout.write(`辞書 ${dict.size} / 原稿 ${inputs.length}\n\n`);
process.stdout.write(`漢字      全 ${stat.kanji} / 未カバー ${stat.kanjiBare} (${pc(stat.kanjiBare, stat.kanji)})\n`);
process.stdout.write(`英数字語  全 ${stat.tok}\n`);
process.stdout.write(`  全体を1エントリで被覆  ${stat.tokWhole} (${pc(stat.tokWhole, stat.tok)})\n`);
process.stdout.write(`  複数エントリに分割      ${stat.tokSplit}\n`);
process.stdout.write(`  一部だけ被覆（誤り）    ${stat.tokPartial}\n`);
process.stdout.write(`  未被覆（未解決）        ${stat.tokBare}\n`);

/** @param {string} title @param {Map<string, number>} m @param {number} n */
function dump(title, m, n) {
  const list = [...m].sort((a, b) => b[1] - a[1]);
  if (list.length === 0) return;
  process.stdout.write(`\n-- ${title} (${list.length} 種)\n`);
  for (const [k, v] of list.slice(0, n)) process.stdout.write(`   ${String(v).padStart(3)}  ${k}\n`);
  if (list.length > n) process.stdout.write(`   ... 他 ${list.length - n} 種\n`);
}
dump('ルビが付かなかった漢字', bareKanji, 18);
dump('一部だけ被覆した英数字語（誤り）', partialTok, 14);
dump('複数エントリに分割された英数字語', splitTok, 10);
dump('未被覆の英数字語', bareTok, 18);
