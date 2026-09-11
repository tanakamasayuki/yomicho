// @ts-check
// SudachiDict の生辞書（*_lex.csv）を参照辞書の TSV に変換する。
//
// 元データ: https://github.com/WorksApplications/SudachiDict （Apache License 2.0）
//   CSV は https://d2ej7fkh96fzlu.cloudfront.net/sudachidict-raw/<version>/<name>_lex.zip
//   0列目=見出し, 3列目=コスト, 5〜10列目=品詞, 11列目=読み（全角カタカナ）
//   活用形はそれぞれ別の行になっているので、`切っ` のような表層形もそのまま拾える。
//
//   node scripts/import-sudachi.js <lex.csv...> -o <out.tsv> [--single-kanji]
//
//     --single-kanji     1文字の漢字も入れる（既定は除く。`分` `日` のような
//                        読み分けの多い字を入れると `十分` `三日` が誤爆するため）
//     --ambiguous <how>  読みが複数ある語の扱い。既定は candidates
//                          candidates … 候補を `|` で並べる（推奨。消すだけで済む）
//                          blank      … 読みを空欄にする
//                          skip       … 入れない
//                          keep       … コスト最小の読みで入れる
//     --max-candidates N 候補の上限。既定 3
//
//   読みが割れる語を skip すると、その語が辞書から消えて中の短い語が露出する
//   （`日本` を落とすと `日本` が `日|本(ほん)` になる）。blank なら照合はするので
//   中の語を守りつつ、人に読みを聞ける。
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const outIndex = args.indexOf('-o');
const out = outIndex >= 0 ? args[outIndex + 1] : null;
const singleKanji = args.includes('--single-kanji');
const ambIndex = args.indexOf('--ambiguous');
const ambiguousMode = ambIndex >= 0 ? args[ambIndex + 1] : 'candidates';
if (!['candidates', 'blank', 'skip', 'keep'].includes(ambiguousMode)) {
  process.stderr.write(`--ambiguous は candidates / blank / skip / keep のいずれか\n`);
  process.exit(1);
}
const maxIndex = args.indexOf('--max-candidates');
const maxCandidates = maxIndex >= 0 ? Number(args[maxIndex + 1]) || 3 : 3;
const valueAt = new Set([outIndex, ambIndex, maxIndex].filter((i) => i >= 0).map((i) => i + 1));
const inputs = args.filter((a, i) => !a.startsWith('-') && !valueAt.has(i));
if (!out || inputs.length === 0) {
  process.stderr.write('usage: import-sudachi.js <lex.csv...> -o <out.tsv> [--single-kanji]\n');
  process.exit(1);
}

const HAN = /\p{Script=Han}/u;
/**
 * ルビの対象にならない品詞。
 * 感動詞を落とすのは `今日は`（コンニチハ）のような挨拶が `今日`（キョウ）に
 * 最長一致で勝ってしまうため。
 */
const SKIP_POS = new Set(['補助記号', '空白', '記号', '感動詞']);

/** 全角カタカナをひらがなに。`ー` と `・` はそのまま */
function toHiragana(/** @type {string} */ text) {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/** 引用符つきの CSV を1行分割る */
function parseCsvLine(/** @type {string} */ line) {
  /** @type {string[]} */
  const cols = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cols.push(cur);
      cur = '';
    } else cur += ch;
  }
  cols.push(cur);
  return cols;
}

/**
 * 連濁（先頭の濁点・半濁点）を外す。`びき` → `ひき`。
 * `引き` の ひき|びき|ぴき のように、連濁の違いだけで割れている語をまとめるため。
 */
const VOICED = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ';
const PLAIN = 'かきくけこさしすせそたちつてとはひふへほはひふへほ';
function unvoiceHead(/** @type {string} */ reading) {
  const i = VOICED.indexOf(reading[0]);
  return i < 0 ? reading : PLAIN[i] + reading.slice(1);
}

/** 見出しごとに、読みとコストを集める */
/** @type {Map<string, Array<{reading: string, cost: number}>>} */
const dict = new Map();
const stat = {
  lines: 0, noKanji: 0, skipPos: 0, noReading: 0, single: 0, same: 0,
  rendaku: 0, ambiguous: 0, kept: 0,
};

for (const path of inputs) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line === '') continue;
    stat.lines++;
    const c = parseCsvLine(line);
    if (c.length < 12) continue;
    const surface = c[0];
    if (!HAN.test(surface)) {
      stat.noKanji++;
      continue;
    }
    if (SKIP_POS.has(c[5])) {
      stat.skipPos++;
      continue;
    }
    const reading = toHiragana(c[11]);
    if (reading === '' || reading === '*') {
      stat.noReading++;
      continue;
    }
    if (reading === surface) {
      stat.same++;
      continue;
    }
    if (!singleKanji && [...surface].length === 1) {
      stat.single++;
      continue;
    }
    const cost = Number(c[3]) || 0;
    const list = dict.get(surface);
    if (!list) dict.set(surface, [{ reading, cost }]);
    else {
      const prev = list.find((x) => x.reading === reading);
      if (!prev) list.push({ reading, cost });
      else if (cost < prev.cost) prev.cost = cost;
    }
  }
}
/** 見出しごとに最終的な読み欄を決める。null は出力しない */
function resolve(/** @type {Array<{reading: string, cost: number}>} */ list) {
  const sorted = [...list].sort((a, b) => a.cost - b.cost);
  if (sorted.length === 1) return sorted[0].reading;
  // 連濁の違いだけなら清音にまとめる
  const unvoiced = new Set(sorted.map((x) => unvoiceHead(x.reading)));
  if (unvoiced.size === 1) {
    stat.rendaku++;
    return [...unvoiced][0];
  }
  stat.ambiguous++;
  if (ambiguousMode === 'keep') return sorted[0].reading;
  if (ambiguousMode === 'blank') return '';
  if (ambiguousMode === 'skip') return null;
  // candidates: コスト順に並べる。コストは頻度ではないので順序は当てにならない
  /** @type {string[]} */
  const seen = [];
  for (const x of sorted) if (!seen.includes(x.reading)) seen.push(x.reading);
  return seen.slice(0, maxCandidates).join('|');
}

const stream = createWriteStream(out);
for (const key of [...dict.keys()].sort()) {
  const reading = resolve(dict.get(key) ?? []);
  if (reading === null) continue;
  stat.kept++;
  stream.write(`${key}\t${reading}\n`);
}
await new Promise((resolve) => stream.end(resolve));

process.stdout.write(`${out}: ${stat.kept.toLocaleString()} 語\n`);
process.stdout.write(`  読み込み ${stat.lines.toLocaleString()} 行\n`);
process.stdout.write(`  除外: 漢字なし ${stat.noKanji.toLocaleString()} / 記号 ${stat.skipPos.toLocaleString()} / `);
process.stdout.write(`読みなし ${stat.noReading.toLocaleString()} / 表記と同じ ${stat.same.toLocaleString()}`);
if (!singleKanji) process.stdout.write(` / 1文字漢字 ${stat.single.toLocaleString()}`);
process.stdout.write('\n');
process.stdout.write(`  連濁だけの違いでまとめた ${stat.rendaku.toLocaleString()} 語\n`);
process.stdout.write(`  読みが割れる ${stat.ambiguous.toLocaleString()} 語 → ${ambiguousMode}\n`);
