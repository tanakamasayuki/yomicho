// @ts-check
// 実験用。未知語の切り出し方を比較する。
// 辞書を空にして原稿から候補を拾い、既存の辞書エントリをどれだけ言い当てられるかを測る。
// 使い方: node scripts/experiment-segment.js <dict.tsv> <input.md...>
import { readFileSync } from 'node:fs';
import { buildMatcher, collectCandidates, intlMergedHan, intlWords, kanjiRun, parseDict, stripRuby } from '../src/index.js';

const [dictPath, ...inputs] = process.argv.slice(2);
if (!dictPath || inputs.length === 0) {
  process.stderr.write('usage: experiment-segment.js <dict.tsv> <input.md...>\n');
  process.exit(1);
}

const { entries } = parseDict(readFileSync(dictPath, 'utf8'));
const known = new Set([...entries.keys()]);
const empty = buildMatcher([]);
const sources = inputs.map((p) => stripRuby(readFileSync(p, 'utf8')));

// 原稿に実際に現れる辞書エントリ（これが言い当てるべき正解）
const HAN = /\p{Script=Han}/u;
const present = new Set();
for (const key of known) {
  if (!HAN.test(key) && !/[A-Za-z]/.test(key)) continue;
  if (sources.some((s) => s.includes(key))) present.add(key);
}

const segmenters = /** @type {const} */ ([
  ['漢字連続', kanjiRun],
  ['Intl.Segmenter', intlWords()],
  ['Intl + 漢字結合', intlMergedHan()],
]);

process.stdout.write(`辞書 ${known.size} 語 / うち原稿に出現 ${present.size} 語 / 原稿 ${inputs.length} 本\n\n`);
process.stdout.write('切り出し方              候補   異なり   的中   再現率   的中率\n');

/** @type {Map<string, Map<string, number>>} */
const missedBy = new Map();
for (const [name, seg] of segmenters) {
  /** @type {Map<string, number>} */
  const proposals = new Map();
  let total = 0;
  for (const src of sources) {
    for (const c of collectCandidates(src, empty, seg)) {
      total++;
      proposals.set(c.text, (proposals.get(c.text) ?? 0) + 1);
    }
  }
  const hit = [...proposals.keys()].filter((k) => present.has(k));
  const recall = present.size ? (hit.length / present.size) * 100 : 0;
  const precision = proposals.size ? (hit.length / proposals.size) * 100 : 0;
  process.stdout.write(
    `${name.padEnd(20)} ${String(total).padStart(6)} ${String(proposals.size).padStart(8)} ` +
      `${String(hit.length).padStart(6)} ${recall.toFixed(1).padStart(7)}% ${precision.toFixed(1).padStart(7)}%\n`,
  );
  /** @type {Map<string, number>} */
  const missed = new Map();
  for (const k of present) if (!proposals.has(k)) missed.set(k, 1);
  missedBy.set(name, missed);
}

process.stdout.write('\n-- 言い当てられなかった辞書エントリの例\n');
for (const [name] of segmenters) {
  const missed = [...(missedBy.get(name) ?? new Map()).keys()].filter((k) => HAN.test(k));
  process.stdout.write(`\n${name} (${missed.length} 語)\n   ${missed.slice(0, 24).join(' ')}\n`);
}
