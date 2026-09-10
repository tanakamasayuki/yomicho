// @ts-check
// 保護区間の検出。docs/spec.ja.md 5.3。
// 文字列を置換して退避せず、位置の範囲として持つ。

/** @typedef {{start: number, end: number, kind: string}} Range */

/** 行ごとに保護する区間（フロントマター・コードフェンス・ディレクティブ行） */
function lineRanges(/** @type {string} */ text) {
  /** @type {Range[]} */
  const out = [];
  const lines = text.split('\n');
  /** @type {number[]} */
  const offset = [];
  let at = 0;
  for (const line of lines) {
    offset.push(at);
    at += line.length + 1;
  }
  let i = 0;
  // 先頭のフロントマターのみ（Marp のスライド区切り --- は残す）
  if (lines[0] !== undefined && lines[0].trim() === '---') {
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === '---') {
        out.push({ start: 0, end: offset[j] + lines[j].length, kind: 'frontmatter' });
        i = j + 1;
        break;
      }
    }
  }
  /** @type {{marker: string, start: number} | null} */
  let fence = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const m = /^[ \t]*(```+|~~~+)/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence.marker[0] && m[1].length >= fence.marker.length) {
        out.push({ start: fence.start, end: offset[i] + line.length, kind: 'fence' });
        fence = null;
      }
      continue;
    }
    if (m) {
      fence = { marker: m[1], start: offset[i] };
      continue;
    }
    if (/^[ \t]*[A-Za-z0-9_-]+:/.test(line)) {
      out.push({ start: offset[i], end: offset[i] + line.length, kind: 'directive' });
    }
  }
  if (fence) out.push({ start: fence.start, end: text.length, kind: 'fence' });
  return out;
}

/** 正規表現で拾う保護区間 */
const PATTERNS = [
  { kind: 'comment', re: /<!--[\s\S]*?-->/g },
  { kind: 'ruby', re: /<ruby>[\s\S]*?<\/ruby>/g },
  // <style> と <script> は中身ごと。CSS のセレクタが本文として拾われるため
  { kind: 'block', re: /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi },
  { kind: 'tag', re: /<[A-Za-z/!][^>\n]*>/g },
  { kind: 'code', re: /`[^`\n]+`/g },
  { kind: 'url', re: /https?:\/\/[^\s)<>"']+/g },
  // 画像のラベルは表示されない（Marp では `![h:450]` のような指示子）。
  // リンクのラベルは表示されるので保護しない。
  { kind: 'imagelabel', re: /!\[[^\]\n]*\]/g },
  { kind: 'dest', re: /\]\([^)\n]*\)/g },
];

/**
 * 重なりをまとめる。
 * @param {Range[]} ranges
 * @returns {Range[]}
 */
export function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  /** @type {Range[]} */
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
    } else out.push({ ...r });
  }
  return out;
}

/**
 * 原稿のうちルビを付けない範囲を返す。
 * @param {string} text
 * @returns {Range[]}
 */
export function protectedRanges(text) {
  /** @type {Range[]} */
  const found = lineRanges(text);
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue;
      found.push({ start: m.index, end: m.index + m[0].length, kind });
    }
  }
  return mergeRanges(found);
}
