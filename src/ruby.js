// @ts-check
// 読みの割り当てと出力整形。docs/spec.ja.md 3.4、8.4。

/** 仮名（ひらがな・長音符・繰り返し記号）か */
function isKana(/** @type {string} */ ch) {
  return /[ぁ-ゖゝ-ゟー]/.test(ch);
}

/**
 * 見出しを「仮名の連続」と「それ以外の連続」に分ける。
 * @param {string} text
 * @returns {Array<{kana: boolean, text: string}>}
 */
export function segment(text) {
  /** @type {Array<{kana: boolean, text: string}>} */
  const out = [];
  for (const ch of text) {
    const kana = isKana(ch);
    const last = out[out.length - 1];
    if (last && last.kana === kana) last.text += ch;
    else out.push({ kana, text: ch });
  }
  return out;
}

/** @typedef {{text: string, reading: string | null}} Part */

/**
 * 送り仮名を手がかりに読みを割り当てる。
 * 見出しの仮名を錨にして、その間を漢字側の読みとする。
 * 割り当てられなければ null（呼び出し側でグループルビに倒す）。
 * @param {string} target
 * @param {string} reading
 * @returns {Part[] | null}
 */
export function alignOkurigana(target, reading) {
  const segs = segment(target);
  if (segs.length === 0 || reading === '') return null;
  if (segs.length === 1) return segs[0].kana ? null : [{ text: target, reading }];

  /** @type {Part[]} */
  const parts = [];
  let ri = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.kana) {
      if (!reading.startsWith(seg.text, ri)) return null;
      parts.push({ text: seg.text, reading: null });
      ri += seg.text.length;
      continue;
    }
    const next = segs[i + 1];
    if (!next) {
      const rest = reading.slice(ri);
      if (rest === '') return null;
      parts.push({ text: seg.text, reading: rest });
      ri = reading.length;
      continue;
    }
    // 次の仮名の錨を探す。この漢字塊には最低1文字を残す。
    const at = reading.indexOf(next.text, ri + 1);
    if (at < 0) return null;
    parts.push({ text: seg.text, reading: reading.slice(ri, at) });
    ri = at;
  }
  if (ri !== reading.length) return null;
  return parts;
}

/**
 * 見出しと読みからルビの構成要素を決める。
 * @param {string} target
 * @param {string} reading `/` は当面取り除く（モノルビは未実装）
 * @returns {{parts: Part[], grouped: boolean}}
 */
export function assign(target, reading) {
  const flat = reading.replace(/\//g, '');
  const aligned = alignOkurigana(target, flat);
  if (aligned) return { parts: aligned, grouped: aligned.length === 1 };
  return { parts: [{ text: target, reading: flat }], grouped: true };
}

/**
 * HTML の `<ruby>` として出す。
 * @param {Part[]} parts
 */
export function renderHtmlRuby(parts) {
  return parts
    .map((p) => (p.reading === null ? p.text : `<ruby>${p.text}<rt>${p.reading}</rt></ruby>`))
    .join('');
}
