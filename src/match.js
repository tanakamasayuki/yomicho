// @ts-check
// 原稿と辞書の照合。docs/spec.ja.md 5章。
import { participatesInMatch } from './dict.js';

/** @typedef {import('./dict.js').Entry} Entry */

/**
 * @typedef {object} Matcher
 * @property {Map<string, Entry[]>} byFirst 対象の先頭文字ごとの候補（優先度順）
 */

/**
 * 候補の優先度。全体の一致長 → 対象の長さ → 辞書の探索順（5.1）。
 * @param {Entry} a
 * @param {Entry} b
 */
function byPriority(a, b) {
  return (
    b.pattern.length - a.pattern.length ||
    (b.targetEnd - b.targetStart) - (a.targetEnd - a.targetStart) ||
    a.order - b.order ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/**
 * @param {Iterable<Entry>} entries
 * @returns {Matcher}
 */
export function buildMatcher(entries) {
  /** @type {Map<string, Entry[]>} */
  const byFirst = new Map();
  for (const e of entries) {
    if (!participatesInMatch(e)) continue;
    const head = e.pattern[e.targetStart];
    if (head === undefined) continue;
    const bucket = byFirst.get(head);
    if (bucket) bucket.push(e);
    else byFirst.set(head, [e]);
  }
  for (const bucket of byFirst.values()) bucket.sort(byPriority);
  return { byFirst };
}

/**
 * 対象が位置 p から始まる候補のうち、もっとも優先度の高いものを返す。
 * 文脈（囲みの外側）は照合にのみ使い、消費しない（5.2）。
 * @param {string} text
 * @param {number} p
 * @param {Matcher} matcher
 * @param {{start: Int32Array, end: Int32Array}} [map] 英数字トークンの範囲
 * @returns {Entry | null}
 */
export function matchAt(text, p, matcher, map = atomicMap(text)) {
  const bucket = matcher.byFirst.get(text[p]);
  if (!bucket) return null;
  for (const e of bucket) {
    const start = p - e.targetStart;
    if (start < 0) continue;
    if (!text.startsWith(e.pattern, start)) continue;
    if (!respectsAtomic(map, p, p + (e.targetEnd - e.targetStart))) continue;
    return e;
  }
  return null;
}

/**
 * 分割してはいけない塊（英数字トークン）。英字を1文字以上含む連続。
 * `BMP280` の `BMP` だけにルビを付けると `280` が読まれず誤りになるため、
 * トークン全体を1エントリで覆えたときだけルビを許す。
 */
const ATOMIC = /[A-Za-z0-9_+.-]*[A-Za-z][A-Za-z0-9_+.-]*/g;

/**
 * 各位置が属する英数字トークンの範囲。属さない位置は -1。
 * @param {string} text
 * @returns {{start: Int32Array, end: Int32Array}}
 */
export function atomicMap(text) {
  const start = new Int32Array(text.length).fill(-1);
  const end = new Int32Array(text.length).fill(-1);
  for (const m of text.matchAll(ATOMIC)) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    for (let i = s; i < e; i++) {
      start[i] = s;
      end[i] = e;
    }
  }
  return { start, end };
}

/**
 * 対象範囲が英数字トークンを途中で切っていないか。
 * @param {{start: Int32Array, end: Int32Array}} map
 * @param {number} s
 * @param {number} e
 */
function respectsAtomic(map, s, e) {
  if (map.start[s] >= 0 && map.start[s] < s) return false;
  if (map.end[e - 1] >= 0 && map.end[e - 1] > e) return false;
  return true;
}

/**
 * @typedef {{kind: 'text', text: string}
 *         | {kind: 'entry', entry: Entry, text: string, start: number, end: number}} Token
 */

/**
 * 左から走査し、対象範囲を消費しながらトークン列を作る。
 * @param {string} text
 * @param {Matcher} matcher
 * @returns {Token[]}
 */
export function tokenize(text, matcher) {
  /** @type {Token[]} */
  const tokens = [];
  const map = atomicMap(text);
  let p = 0;
  let last = 0;
  while (p < text.length) {
    const entry = matchAt(text, p, matcher, map);
    if (!entry) {
      p++;
      continue;
    }
    const end = p + (entry.targetEnd - entry.targetStart);
    if (p > last) tokens.push({ kind: 'text', text: text.slice(last, p) });
    tokens.push({ kind: 'entry', entry, text: text.slice(p, end), start: p, end });
    p = end;
    last = end;
  }
  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) });
  return tokens;
}
