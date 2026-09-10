// @ts-check
import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { annotate, buildMatcher, formatDict, intlWords, parseDict, resolveDicts, update } from '../src/index.js';

/**
 * @param {string} text
 * @param {string} bookTsv
 * @param {string} refTsv
 * @param {Set<string>} [known]
 */
function run(text, bookTsv, refTsv, known) {
  const book = parseDict(bookTsv).entries;
  const refs = parseDict(refTsv).entries;
  return update({
    text,
    book,
    refs,
    matcher: buildMatcher(resolveDicts([book, refs]).values()),
    segmenter: intlWords(),
    known,
  });
}

test('参照辞書にある語は > を付けて取り込む', () => {
  const r = run('日本橋へ行く。', '', '日本橋\tにほんばし\n東京\tとうきょう\n');
  strictEqual(r.book.get('日本橋')?.state, '>');
  strictEqual(r.book.get('日本橋')?.reading, 'にほんばし');
  strictEqual(r.book.has('東京'), false, '原稿に出ない語は取り込まない');
});

test('どこにも無い語は空欄で足し、スニペットを付ける', () => {
  const r = run('新型の未知を発表した。', '', '');
  const e = r.book.get('未知');
  strictEqual(e?.state, '');
  strictEqual(e?.reading, '');
  strictEqual(e?.snippet, '新型の{未知}を発表した。');
  deepStrictEqual(r.unresolved.includes('未知'), true);
});

test('Intl.Segmenter は複合語を分けるので、長い語は人が登録することになる', () => {
  // 既知の限界。`未知製品` はひとまとまりでは提案されない。
  const r = run('新型の未知製品を発表した。', '', '');
  deepStrictEqual([...r.book.keys()].sort(), ['新型', '未知', '発表', '製品']);
});

test('既存の行は書き換えない', () => {
  const r = run('日本橋へ行く。', '日本橋\tにっぽんばし\n', '日本橋\tにほんばし\n');
  strictEqual(r.book.get('日本橋')?.reading, 'にっぽんばし');
  strictEqual(r.book.get('日本橋')?.state, '');
  strictEqual(r.added.includes('日本橋'), false);
});

test('空欄の行も書き換えず、参照辞書から引き直さない', () => {
  const r = run('日本橋へ行く。', '日本橋\t\n', '日本橋\tにほんばし\n');
  strictEqual(r.book.get('日本橋')?.reading, '');
  strictEqual(r.book.get('日本橋')?.state, '');
});

test('読みが埋まればスニペットが外れる', () => {
  const text = '新型の未知を発表した。';
  const first = run(text, '', '');
  strictEqual(first.book.get('未知')?.snippet !== '', true);
  const filled = formatDict(first.book.values()).replace('未知\t\t', '未知\tみち\t');
  const second = run(text, filled, '');
  strictEqual(second.book.get('未知')?.snippet, '');
  strictEqual(second.unresolved.includes('未知'), false);
});

test('既知文字だけの語には ! を付ける', () => {
  const known = new Set(['山', '川']);
  const r = run('山川と発表。', '', '', known);
  strictEqual(r.book.get('山川')?.state, '!');
  strictEqual(r.book.get('発表')?.state, '');
});

test('update は冪等', () => {
  const text = '新型の未知製品と日本橋。';
  const ref = '日本橋\tにほんばし\n';
  const first = run(text, '', ref);
  const tsv = formatDict(first.book.values());
  const second = run(text, tsv, ref);
  strictEqual(formatDict(second.book.values()), tsv);
  strictEqual(second.added.length, 0);
});

test('原稿辞書だけで build しても参照辞書つきと同じ出力になる', () => {
  const text = '日本橋へ行く。';
  const ref = '日本橋\tにほんばし\n行く\tいく\n';
  const r = run(text, '', ref);
  const fromBook = annotate(text, buildMatcher(r.book.values())).text;
  const fromRefs = annotate(text, buildMatcher(parseDict(ref).entries.values())).text;
  strictEqual(fromBook, fromRefs);
});
