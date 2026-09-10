// @ts-check
// 辞書ファイルの解析と整形。docs/spec.ja.md 3章。

/** @typedef {'' | '>' | '+' | '#' | '!'} State */

/** 読み欄の先頭に置ける状態記号 */
export const SIGILS = new Set(['>', '+', '#', '!']);

/**
 * 辞書の1エントリ。
 * @typedef {object} Entry
 * @property {string} key         見出しそのもの（`{}` 込み）。辞書のキー
 * @property {string} pattern     照合する文字列（`{}` を除去したもの）
 * @property {number} targetStart pattern 内での置換対象の開始位置
 * @property {number} targetEnd   pattern 内での置換対象の終了位置
 * @property {State}  state       状態記号
 * @property {string} reading     記号を除いた読み（`/` を含みうる）
 * @property {string} snippet     3列目。無ければ空文字
 * @property {number} order       辞書の探索順（小さいほど優先）
 * @property {number} line        元ファイルの行番号（1 始まり）
 */

/**
 * @typedef {object} ParseError
 * @property {number} line
 * @property {string} text
 * @property {string} message
 */

/**
 * 見出しを解析し、照合文字列と対象範囲に分ける。
 * @param {string} key
 * @returns {{pattern: string, targetStart: number, targetEnd: number}}
 */
export function parseHeadword(key) {
  const open = key.indexOf('{');
  const close = key.indexOf('}');
  if (open < 0 && close < 0) {
    if (key.length === 0) throw new Error('見出しが空');
    return { pattern: key, targetStart: 0, targetEnd: key.length };
  }
  if (open < 0) throw new Error('`}` に対応する `{` がない');
  if (close < 0) throw new Error('`{` が閉じていない');
  if (close < open) throw new Error('`}` が `{` より前にある');
  if (key.indexOf('{', open + 1) >= 0 || key.indexOf('}', close + 1) >= 0) {
    throw new Error('囲みは1つだけ');
  }
  const pattern = key.slice(0, open) + key.slice(open + 1, close) + key.slice(close + 1);
  const targetStart = open;
  const targetEnd = close - 1;
  if (targetEnd === targetStart) throw new Error('対象が空');
  if (targetStart === 0 && targetEnd === pattern.length) throw new Error('見出し全体を囲んでいる（囲む意味がない）');
  return { pattern, targetStart, targetEnd };
}

/**
 * 読み欄を状態記号と読みに分ける。
 * @param {string} field
 * @returns {{state: State, reading: string}}
 */
export function parseReading(field) {
  const head = field.charAt(0);
  if (SIGILS.has(head)) return { state: /** @type {State} */ (head), reading: field.slice(1) };
  return { state: '', reading: field };
}

/**
 * 辞書ファイルを解析する。同じ見出しが複数あれば後の行が勝つ。
 * @param {string} text
 * @param {number} [order] 探索順
 * @returns {{entries: Map<string, Entry>, errors: ParseError[]}}
 */
export function parseDict(text, order = 0) {
  /** @type {Map<string, Entry>} */
  const entries = new Map();
  /** @type {ParseError[]} */
  const errors = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '') continue;
    const cols = raw.split('\t');
    const key = cols[0];
    const readingField = cols.length > 1 ? cols[1] : '';
    const snippet = cols.length > 2 ? cols.slice(2).join('\t') : '';
    try {
      const { pattern, targetStart, targetEnd } = parseHeadword(key);
      const { state, reading } = parseReading(readingField);
      entries.set(key, { key, pattern, targetStart, targetEnd, state, reading, snippet, order, line: i + 1 });
    } catch (err) {
      errors.push({ line: i + 1, text: raw, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { entries, errors };
}

/**
 * 並び順の区分（3.6）。小さいほど上。
 * @param {Entry} e
 */
export function sortRank(e) {
  if (e.state === '') return e.reading === '' ? 5 : 0;
  return { '#': 1, '!': 2, '>': 3, '+': 4 }[e.state];
}

/**
 * 辞書を整形する。確定 → # → ! → > → + → 空欄 の順、同じ区分の中は見出し順。
 * @param {Iterable<Entry>} entries
 * @returns {string}
 */
export function formatDict(entries) {
  const list = [...entries].sort((a, b) => sortRank(a) - sortRank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return list
    .map((e) => {
      const reading = e.state + e.reading;
      return e.snippet ? `${e.key}\t${reading}\t${e.snippet}` : `${e.key}\t${reading}`;
    })
    .join('\n') + (list.length ? '\n' : '');
}

/**
 * 探索順に辞書を重ね、最初に見つかったものを採用する（4.1）。
 * @param {Array<Map<string, Entry>>} dicts 近い順
 * @returns {Map<string, Entry>}
 */
export function resolveDicts(dicts) {
  /** @type {Map<string, Entry>} */
  const out = new Map();
  dicts.forEach((dict, order) => {
    for (const [key, entry] of dict) {
      if (!out.has(key)) out.set(key, { ...entry, order });
    }
  });
  return out;
}

/** ルビを出す対象になるか（`#` と `!` と未定は出さない） */
export function producesRuby(/** @type {Entry} */ e) {
  return (e.state === '' || e.state === '>' || e.state === '+') && e.reading !== '';
}
