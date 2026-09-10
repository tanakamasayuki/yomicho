// @ts-check
// 変換の組み立て。docs/spec.ja.md 2章、7章の build にあたる部分。
import { producesRuby } from './dict.js';
import { tokenize } from './match.js';
import { protectedRanges } from './protect.js';
import { assign, renderHtmlRuby } from './ruby.js';

/** @typedef {import('./dict.js').Entry} Entry */
/** @typedef {import('./match.js').Matcher} Matcher */

/**
 * @typedef {object} AnnotateStats
 * @property {Map<string, number>} used     採用されたエントリと回数
 * @property {number} grouped               グループルビの数
 * @property {number} mono                  分割できたものの数
 * @property {Map<string, number>} silent   マッチしたがルビを出さなかったエントリ
 */

/**
 * @param {string} text
 * @param {Matcher} matcher
 * @returns {{text: string, stats: AnnotateStats}}
 */
export function annotate(text, matcher) {
  /** @type {AnnotateStats} */
  const stats = { used: new Map(), grouped: 0, mono: 0, silent: new Map() };
  const bump = (/** @type {Map<string, number>} */ m, /** @type {string} */ k) => m.set(k, (m.get(k) ?? 0) + 1);

  const convert = (/** @type {string} */ chunk) => {
    let out = '';
    for (const token of tokenize(chunk, matcher)) {
      if (token.kind === 'text') {
        out += token.text;
        continue;
      }
      if (!producesRuby(token.entry)) {
        bump(stats.silent, token.entry.key);
        out += token.text;
        continue;
      }
      const { parts, grouped } = assign(token.text, token.entry.reading);
      bump(stats.used, token.entry.key);
      if (grouped) stats.grouped++;
      else stats.mono++;
      out += renderHtmlRuby(parts);
    }
    return out;
  };

  let out = '';
  let pos = 0;
  for (const range of protectedRanges(text)) {
    if (range.start > pos) out += convert(text.slice(pos, range.start));
    out += text.slice(range.start, range.end);
    pos = range.end;
  }
  if (pos < text.length) out += convert(text.slice(pos));
  return { text: out, stats };
}

/**
 * 既存の `<ruby>` を取り除いて素の原稿に戻す。
 * @param {string} text
 */
export function stripRuby(text) {
  return text.replace(/<ruby>([\s\S]*?)<\/ruby>/g, (_, inner) => {
    const rt = String(inner).indexOf('<rt>');
    return rt >= 0 ? String(inner).slice(0, rt) : String(inner);
  });
}
