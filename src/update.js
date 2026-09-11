// @ts-check
// 原稿辞書の更新。docs/spec.ja.md 2章・4.3・6章。
// 既存の行は書き換えない。足りない見出しを足し、要対応の行のスニペットだけ更新する。
import { collectCandidates } from './collect.js';
import { hasReading, isCandidates, parseHeadword, SIGILS } from './dict.js';
import { tokenize } from './match.js';
import { protectedRanges } from './protect.js';

/** @typedef {import('./dict.js').Entry} Entry */
/** @typedef {import('./match.js').Matcher} Matcher */
/** @typedef {import('./collect.js').Segmenter} Segmenter */

/** 人の手を待っている行か（3.6 の作業ゾーン） */
export function needsAttention(/** @type {Entry} */ e) {
  if (e.state === '+' || e.state === '?') return true;
  return e.state === '' && !hasReading(e);
}

/**
 * 保護区間の外で一致したエントリを、原稿全体での位置つきで返す。
 * @param {string} text
 * @param {Matcher} matcher
 * @returns {Array<{entry: Entry, start: number, end: number}>}
 */
export function scanEntries(text, matcher) {
  /** @type {Array<{entry: Entry, start: number, end: number}>} */
  const out = [];
  let pos = 0;
  /** @type {Array<[number, number]>} */
  const chunks = [];
  for (const r of protectedRanges(text)) {
    if (r.start > pos) chunks.push([pos, r.start]);
    pos = r.end;
  }
  if (pos < text.length) chunks.push([pos, text.length]);
  for (const [cs, ce] of chunks) {
    for (const t of tokenize(text.slice(cs, ce), matcher)) {
      if (t.kind === 'entry') out.push({ entry: t.entry, start: cs + t.start, end: cs + t.end });
    }
  }
  return out;
}

/**
 * 出現箇所の前後を切り出す。対象は `{}` で囲む（3.5）。
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {number} width
 */
export function makeSnippet(text, start, end, width) {
  let from = Math.max(0, start - width);
  let to = Math.min(text.length, end + width);
  const nl = text.lastIndexOf('\n', start - 1);
  if (nl >= from) from = nl + 1;
  const nr = text.indexOf('\n', end);
  if (nr >= 0 && nr < to) to = nr;
  const body = text.slice(from, start) + '{' + text.slice(start, end) + '}' + text.slice(end, to);
  return trimEdges(body.replace(/\s+/g, ' '));
}

/** 固定文字数で切ると端に句読点が残るので落とす。`、先に予算を…と、` → `先に予算を…と` */
const EDGE = /^[\s、。，．・…‥]+|[\s、。，．・…‥]+$/g;

/** @param {string} text */
export function trimEdges(text) {
  return text.replace(EDGE, '');
}

/**
 * 読みを求めず `*` として記録するだけにするか（7.2）。
 *
 * 数字を含む英数字トークンは型番とみなす。`BMP280` `SHT40` `U001-D` `10cm` `0xFFE01F` の類で、
 * 普通ルビを振らない。英字だけのトークン（`KeyBridge` `Arduino`）は名前なので作業ゾーンに残す。
 *
 * ドットを含むものも同じ扱いにする。ファイル名・メソッド名・ドメイン（`sketch.yaml`
 * `Serial.begin` `lang-ship.com`）ばかりで、読ませたいものがない。
 * ハイフンは逆で、`E-Paper` `ESP-IDF` `Lang-ship` のように名前に使われるので対象にしない。
 *
 * 型番でも読ませたいものはある（`M5Stack` `ESP32` `CH32V003`）が、それらは参照辞書に
 * 登録済みで作業ゾーンには来ない。ここで判断するのは未登録のものだけなので、
 * 「新しく出てきた英数字混じりは型番」と賭けるほうが当たる。
 *
 * どちらにしても出力は変わらない（5.3 によりトークンの一部にはルビが付かない）。
 * 読ませたくなったら `*` を消せばよい。
 *
 * @param {string} text
 * @param {boolean} full
 */
function isQuiet(text, full) {
  const HAN = /\p{Script=Han}/u;
  if (HAN.test(text)) return false;
  if (/[0-9]/.test(text)) return true;
  if (text.includes('.')) return true;
  if (!/^[A-Za-z]/.test(text)) return true;
  // --full でだけ拾うカタカナ語も静かにする
  return !/[A-Za-z]/.test(text) && full;
}

/** 見出しに含まれる文字がすべて既知なら true（8.1） */
function allKnown(/** @type {string} */ pattern, /** @type {Set<string>} */ known) {
  const HAN = /\p{Script=Han}/u;
  let sawHan = false;
  for (const ch of pattern) {
    if (!HAN.test(ch)) continue;
    sawHan = true;
    if (!known.has(ch)) return false;
  }
  return sawHan;
}

/**
 * @typedef {object} UpdateResult
 * @property {Map<string, Entry>} book  更新後の原稿辞書
 * @property {string[]} added           追加した見出し
 * @property {string[]} unresolved      この原稿で読みが決まっていない見出し
 */

/**
 * @param {object} args
 * @param {string} args.text 原稿（ルビは除去済みであること）
 * @param {Map<string, Entry>} args.book 原稿辞書
 * @param {Map<string, Entry>} args.refs 参照辞書（解決済み）
 * @param {Matcher} args.matcher book と refs を重ねたマッチャ
 * @param {Segmenter} args.segmenter
 * @param {Set<string>} [args.known] 既知文字リスト
 * @param {boolean} [args.full] 通常は捨てる候補も `*` として記録する
 * @param {number} [args.width] スニペットの前後文字数
 * @param {number} [args.maxSnippets] 候補つきの行に付けるスニペットの数
 * @returns {UpdateResult}
 */
export function update({ text, book, refs, matcher, segmenter, known, full = false, width = 12, maxSnippets = 3 }) {
  /** @type {Map<string, Entry>} */
  const out = new Map(book);
  /** @type {string[]} */
  const added = [];
  /** 見出しごとの全出現箇所 */
  /** @type {Map<string, Array<{start: number, end: number}>>} */
  const seen = new Map();

  const remember = (/** @type {string} */ key, /** @type {number} */ start, /** @type {number} */ end) => {
    const list = seen.get(key);
    if (list) list.push({ start, end });
    else seen.set(key, [{ start, end }]);
  };

  // 1. 一致したエントリ。原稿辞書に無いものは参照辞書から引いて `>` を付ける。
  //    参照辞書側の読みが空なら「その語は知っているが読みは未定」なので、
  //    `>` ではなく未解決として取り込む（そうしないと黙って無ルビになる）。
  for (const hit of scanEntries(text, matcher)) {
    remember(hit.entry.key, hit.start, hit.end);
    if (out.has(hit.entry.key)) continue;
    const ref = refs.get(hit.entry.key);
    if (!ref) continue;
    const state = ref.state === '>' || ref.state === '' ? (hasReading(ref) ? '>' : '') : ref.state;
    out.set(hit.entry.key, { ...ref, state, order: 0, snippets: [] });
    added.push(hit.entry.key);
  }

  // 2. 覆えなかった範囲の候補。読みは分からないので空欄で足す
  for (const c of collectCandidates(text, matcher, segmenter, full)) {
    remember(c.text, c.start, c.end);
    if (out.has(c.text)) continue;
    const ref = refs.get(c.text);
    const base = { key: c.text, ...parseHeadword(c.text), snippets: [], order: 0, line: 0 };
    if (ref) out.set(c.text, { ...base, state: hasReading(ref) ? '>' : '', reading: ref.reading });
    else if (known && allKnown(c.text, known)) out.set(c.text, { ...base, state: '!', reading: '' });
    else if (isQuiet(c.text, full)) out.set(c.text, { ...base, state: '*', reading: '' });
    else out.set(c.text, { ...base, state: '', reading: '' });
    added.push(c.text);
  }

  // 3. スニペットと `?`。要対応かつこの原稿に出た行に付け、それ以外からは外す。
  //    読みが未定の行は、今回出ていれば `?`、出ていなければ空欄になる。
  //    `?` があることで、3列目があっても書き込み位置が目で分かる。
  /** @type {string[]} */
  const unresolved = [];
  for (const [key, entry] of out) {
    const at = seen.get(key);
    if (needsAttention(entry) && at && at.length > 0) {
      // 読みが割れる語（候補つき）は、1つの読みで通るか判断できるよう複数見せる
      const max = isCandidates(entry.reading) ? maxSnippets : 1;
      entry.snippets = at.slice(0, max).map((p) => makeSnippet(text, p.start, p.end, width));
      if (entry.state === '') entry.state = '?';
      unresolved.push(key);
    } else {
      if (entry.snippets.length) entry.snippets = [];
      if (entry.state === '?') entry.state = '';
    }
  }
  return { book: out, added, unresolved };
}

/**
 * 要対応の見出しについて、原稿での全出現箇所を返す。
 * 読みが割れる語で「1つの読みで通るか」を人が判断するために使う。
 * @param {string} text
 * @param {Matcher} matcher
 * @param {Map<string, Entry>} book
 * @param {number} [width]
 * @returns {Map<string, string[]>}
 */
export function occurrences(text, matcher, book, width = 12) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const hit of scanEntries(text, matcher)) {
    const entry = book.get(hit.entry.key);
    if (!entry || !needsAttention(entry)) continue;
    const list = out.get(hit.entry.key) ?? [];
    list.push(makeSnippet(text, hit.start, hit.end, width));
    out.set(hit.entry.key, list);
  }
  return out;
}

/**
 * 要対応の行を、全出現箇所つきで書き出す。
 * @param {Map<string, Entry>} book
 * @param {Map<string, string[]>} occ
 * @returns {string}
 */
export function unresolvedDetail(book, occ) {
  const keys = [...occ.keys()].sort();
  let out = '';
  for (const key of keys) {
    const entry = book.get(key);
    if (!entry) continue;
    out += `${key}\t${entry.state}${entry.reading}\n`;
    for (const snippet of occ.get(key) ?? []) out += `\t${snippet}\n`;
  }
  return out;
}

/**
 * 要対応の行を TSV として書き出す（3.5）。そのまま貼って、そのまま戻せる形。
 * この原稿に出現した行だけを出す（スニペットが付いている行）。
 * @param {Map<string, Entry>} book
 * @returns {string}
 */
export function unresolvedTsv(book) {
  const rows = [...book.values()].filter((e) => needsAttention(e) && e.snippets.length > 0);
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return rows.map((e) => [e.key, e.state + e.reading, ...e.snippets].join('\t')).join('\n') + (rows.length ? '\n' : '');
}

/**
 * 外から戻ってきた読みを取り込む（3.5）。
 * 必ず `+`（未承認）として入れ、人の判断が入っている行は上書きしない。
 * @param {Map<string, Entry>} book
 * @param {string} tsv
 * @returns {{book: Map<string, Entry>, applied: string[], skipped: string[], unknown: string[]}}
 */
export function mergeReadings(book, tsv) {
  /** @type {Map<string, Entry>} */
  const out = new Map(book);
  /** @type {string[]} */ const applied = [];
  /** @type {string[]} */ const skipped = [];
  /** @type {string[]} */ const unknown = [];
  for (const line of tsv.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const cols = line.split('\t');
    const key = cols[0];
    const field = cols[1] ?? '';
    const reading = SIGILS.has(field.charAt(0)) ? field.slice(1) : field;
    if (reading === '') continue;
    const existing = out.get(key);
    if (!existing) {
      unknown.push(key);
      continue;
    }
    if (!needsAttention(existing)) {
      skipped.push(key);
      continue;
    }
    out.set(key, { ...existing, state: '+', reading });
    applied.push(key);
  }
  return { book: out, applied, skipped, unknown };
}

/**
 * 機械のキャッシュ（`>` `!` `*`）を捨てる。`--force` の前半（7.5）。
 * 人の判断（記号なし・`#`）と作業中（`+`・空欄）には触れない。
 * @param {Map<string, Entry>} book
 * @returns {{book: Map<string, Entry>, dropped: string[]}}
 */
export function dropCache(book) {
  /** @type {Map<string, Entry>} */
  const out = new Map();
  /** @type {string[]} */ const dropped = [];
  for (const [key, entry] of book) {
    if (entry.state === '>' || entry.state === '!' || entry.state === '*') dropped.push(key);
    else out.set(key, entry);
  }
  return { book: out, dropped };
}
