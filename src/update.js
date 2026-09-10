// @ts-check
// 原稿辞書の更新。docs/spec.ja.md 2章・4.3・6章。
// 既存の行は書き換えない。足りない見出しを足し、要対応の行のスニペットだけ更新する。
import { collectCandidates } from './collect.js';
import { parseHeadword } from './dict.js';
import { tokenize } from './match.js';
import { protectedRanges } from './protect.js';

/** @typedef {import('./dict.js').Entry} Entry */
/** @typedef {import('./match.js').Matcher} Matcher */
/** @typedef {import('./collect.js').Segmenter} Segmenter */

/** 人の手を待っている行か（3.6 の作業ゾーン） */
export function needsAttention(/** @type {Entry} */ e) {
  return e.state === '+' || (e.state === '' && e.reading === '');
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
  return body.replace(/[\t\r\n]+/g, ' ').trim();
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
 * @param {number} [args.width] スニペットの前後文字数
 * @returns {UpdateResult}
 */
export function update({ text, book, refs, matcher, segmenter, known, width = 12 }) {
  /** @type {Map<string, Entry>} */
  const out = new Map(book);
  /** @type {string[]} */
  const added = [];
  /** @type {Map<string, {start: number, end: number}>} */
  const seen = new Map();

  const remember = (/** @type {string} */ key, /** @type {number} */ start, /** @type {number} */ end) => {
    if (!seen.has(key)) seen.set(key, { start, end });
  };

  // 1. 一致したエントリ。原稿辞書に無いものは参照辞書から引いて `>` を付ける
  for (const hit of scanEntries(text, matcher)) {
    remember(hit.entry.key, hit.start, hit.end);
    if (out.has(hit.entry.key)) continue;
    const ref = refs.get(hit.entry.key);
    if (!ref) continue;
    out.set(hit.entry.key, { ...ref, state: '>', order: 0, snippet: '' });
    added.push(hit.entry.key);
  }

  // 2. 覆えなかった範囲の候補。読みは分からないので空欄で足す
  for (const c of collectCandidates(text, matcher, segmenter)) {
    remember(c.text, c.start, c.end);
    if (out.has(c.text)) continue;
    const ref = refs.get(c.text);
    const base = { key: c.text, ...parseHeadword(c.text), snippet: '', order: 0, line: 0 };
    if (ref) out.set(c.text, { ...base, state: '>', reading: ref.reading });
    else if (known && allKnown(c.text, known)) out.set(c.text, { ...base, state: '!', reading: '' });
    else out.set(c.text, { ...base, state: '', reading: '' });
    added.push(c.text);
  }

  // 3. スニペット。要対応かつこの原稿に出た行にだけ付け、それ以外からは外す
  /** @type {string[]} */
  const unresolved = [];
  for (const [key, entry] of out) {
    const at = seen.get(key);
    if (needsAttention(entry) && at) {
      entry.snippet = makeSnippet(text, at.start, at.end, width);
      unresolved.push(key);
    } else if (entry.snippet) {
      entry.snippet = '';
    }
  }
  return { book: out, added, unresolved };
}
