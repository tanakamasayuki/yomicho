// @ts-check
// 原稿から未解決の候補を拾う。docs/spec.ja.md 2章の update にあたる部分。
import { tokenize } from './match.js';
import { protectedRanges } from './protect.js';

/** @typedef {import('./match.js').Matcher} Matcher */

/**
 * @typedef {object} Candidate
 * @property {string} text
 * @property {number} start 原稿全体での位置
 * @property {number} end
 */

/** 語の切り出し方。原稿の一部を受け取り、候補の並びを返す。 */
/** @typedef {(text: string) => Array<{text: string, start: number, end: number}>} Segmenter */

const HAN = /\p{Script=Han}/u;
const ATOMIC = /[A-Za-z0-9_+.-]*[A-Za-z][A-Za-z0-9_+.-]*/g;
/** --full のとき。英字を含まない数値のかたまりも拾う */
const ATOMIC_FULL = /[A-Za-z0-9_+.-]*[A-Za-z0-9][A-Za-z0-9_+.-]*/g;
const KATAKANA = /^[ァ-ヺー・]+$/;

/** 漢字の連続をひとかたまりとする。依存なし。送り仮名は拾えない。 */
export const kanjiRun = /** @type {Segmenter} */ (
  (text) => {
    const out = [];
    let start = -1;
    for (let i = 0; i <= text.length; i++) {
      const han = i < text.length && HAN.test(text[i]);
      if (han && start < 0) start = i;
      else if (!han && start >= 0) {
        out.push({ text: text.slice(start, i), start, end: i });
        start = -1;
      }
    }
    return out;
  }
);

/** ICU の単語分割。追加の辞書を持たない。 */
export function intlWords(locale = 'ja') {
  const seg = new Intl.Segmenter(locale, { granularity: 'word' });
  return /** @type {Segmenter} */ (
    (text) => {
      const out = [];
      for (const s of seg.segment(text)) {
        if (!s.isWordLike) continue;
        out.push({ text: s.segment, start: s.index, end: s.index + s.segment.length });
      }
      return out;
    }
  );
}

/** ICU の分割のうち、隣り合う漢字だけの断片をつなぎ直す。 */
export function intlMergedHan(locale = 'ja') {
  const base = intlWords(locale);
  return /** @type {Segmenter} */ (
    (text) => {
      const words = base(text);
      /** @type {Array<{text: string, start: number, end: number}>} */
      const out = [];
      for (const w of words) {
        const prev = out[out.length - 1];
        const allHan = (/** @type {string} */ s) => s.length > 0 && [...s].every((c) => HAN.test(c));
        if (prev && prev.end === w.start && allHan(prev.text) && allHan(w.text)) {
          prev.text += w.text;
          prev.end = w.end;
        } else out.push({ ...w });
      }
      return out;
    }
  );
}

/**
 * 辞書で覆えなかった範囲から候補を拾う。
 * 英数字トークンは 5.3 のとおり丸ごと1つの候補にする。
 * @param {string} text
 * @param {Matcher} matcher
 * @param {Segmenter} segmenter
 * @param {boolean} [full] 漢字を含まない語や数値も拾う（`?` として記録するため）
 * @returns {Candidate[]}
 */
export function collectCandidates(text, matcher, segmenter, full = false) {
  /** @type {Candidate[]} */
  const out = [];
  /** @type {Array<[number, number]>} */
  const chunks = [];
  let pos = 0;
  for (const r of protectedRanges(text)) {
    if (r.start > pos) chunks.push([pos, r.start]);
    pos = r.end;
  }
  if (pos < text.length) chunks.push([pos, text.length]);

  for (const [cs, ce] of chunks) {
    const chunk = text.slice(cs, ce);
    const covered = new Uint8Array(chunk.length);
    for (const t of tokenize(chunk, matcher)) {
      if (t.kind !== 'entry') continue;
      for (let i = t.start; i < t.end; i++) covered[i] = 1;
    }
    const taken = new Uint8Array(chunk.length);
    // 英数字トークンは全体で1候補
    for (const m of chunk.matchAll(full ? ATOMIC_FULL : ATOMIC)) {
      const at = m.index ?? 0;
      let free = true;
      for (let i = at; i < at + m[0].length; i++) if (covered[i]) free = false;
      for (let i = at; i < at + m[0].length; i++) taken[i] = 1;
      if (free) out.push({ text: m[0], start: cs + at, end: cs + at + m[0].length });
    }
    // 残りを切り出す
    let spanStart = -1;
    for (let i = 0; i <= chunk.length; i++) {
      const free = i < chunk.length && !covered[i] && !taken[i];
      if (free && spanStart < 0) spanStart = i;
      else if (!free && spanStart >= 0) {
        const span = chunk.slice(spanStart, i);
        for (const w of segmenter(span)) {
          // 漢字を含まない語は通常は捨てる。--full ではカタカナ語だけ拾う。
          // ひらがなはそのまま読めるので、どちらでも拾わない。
          if (!HAN.test(w.text) && !(full && w.text.length >= 2 && KATAKANA.test(w.text))) continue;
          out.push({ text: w.text, start: cs + spanStart + w.start, end: cs + spanStart + w.end });
        }
        spanStart = -1;
      }
    }
  }
  return out;
}
