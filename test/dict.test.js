// @ts-check
import { test } from 'node:test';
import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { formatDict, parseDict, parseHeadword, parseReading, resolveDicts } from '../src/index.js';

test('状態記号を読み欄の先頭から取り出す', () => {
  deepStrictEqual(parseReading('にほんばし'), { state: '', reading: 'にほんばし' });
  deepStrictEqual(parseReading('#カレント'), { state: '#', reading: 'カレント' });
  deepStrictEqual(parseReading('#'), { state: '#', reading: '' });
  deepStrictEqual(parseReading('+にほんばし'), { state: '+', reading: 'にほんばし' });
  deepStrictEqual(parseReading('>にほんばし'), { state: '>', reading: 'にほんばし' });
  deepStrictEqual(parseReading('!'), { state: '!', reading: '' });
  deepStrictEqual(parseReading(''), { state: '', reading: '' });
});

test('見出しの囲みで照合と対象を分ける', () => {
  deepStrictEqual(parseHeadword('日本橋'), { pattern: '日本橋', targetStart: 0, targetEnd: 3 });
  deepStrictEqual(parseHeadword('大阪の{日本橋}'), { pattern: '大阪の日本橋', targetStart: 3, targetEnd: 6 });
  deepStrictEqual(parseHeadword('{今日}中'), { pattern: '今日中', targetStart: 0, targetEnd: 2 });
});

test('壊れた囲みを弾く', () => {
  throws(() => parseHeadword('大阪の{日本橋'), /閉じていない/);
  throws(() => parseHeadword('大阪の}日本橋'), /対応する/);
  throws(() => parseHeadword('{大阪の日本橋}'), /全体を囲んでいる/);
  throws(() => parseHeadword('大阪の{}日本橋'), /対象が空/);
  throws(() => parseHeadword('{大阪}の{日本橋}'), /1つだけ/);
});

test('壊れた行はエラーとして集め、他の行は読む', () => {
  const { entries, errors } = parseDict('日本橋\tにほんばし\n壊れた{\tx\nCUR\t#\n');
  deepStrictEqual([...entries.keys()], ['日本橋', 'CUR']);
  strictEqual(errors.length, 1);
  strictEqual(errors[0].line, 2);
});

test('3列目をスニペットとして読む', () => {
  const { entries } = parseDict('未知製品\t\t新型の{未知製品}を発表した\n');
  strictEqual(entries.get('未知製品')?.snippet, '新型の{未知製品}を発表した');
});

test('確定 → # → ! → > → + → 空欄 の順に並べる', () => {
  const { entries } = parseDict(['e\t', 'd\t+よみ', 'c\t>よみ', 'b\t!', 'a2\t#', 'a1\tよみ'].join('\n'));
  strictEqual(formatDict(entries.values()), 'a1\tよみ\na2\t#\nb\t!\nc\t>よみ\nd\t+よみ\ne\t\n');
});

test('探索順に重ね、最初に見つかったものを採る', () => {
  const near = parseDict('日本橋\t\n').entries;
  const far = parseDict('日本橋\tにほんばし\n東京\tとうきょう\n').entries;
  const dict = resolveDicts([near, far]);
  strictEqual(dict.get('日本橋')?.reading, '', '空欄も値なのでフォールバックしない');
  strictEqual(dict.get('東京')?.reading, 'とうきょう');
});
