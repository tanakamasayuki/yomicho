// @ts-check
import { test } from 'node:test';
import { strictEqual } from 'node:assert/strict';
import { annotate, assign, buildMatcher, parseDict, renderHtmlRuby, stripRuby } from '../src/index.js';

/** @param {string} tsv */
const build = (tsv) => {
  const { entries } = parseDict(tsv);
  const matcher = buildMatcher(entries.values());
  return (/** @type {string} */ text) => annotate(text, matcher).text;
};

/** @param {string} target @param {string} reading */
const ruby = (target, reading) => renderHtmlRuby(assign(target, reading).parts);

test('送り仮名の上にはルビを乗せない', () => {
  strictEqual(ruby('見直す', 'みなおす'), '<ruby>見直<rt>みなお</rt></ruby>す');
  strictEqual(ruby('回り込ん', 'まわりこん'), '<ruby>回<rt>まわ</rt></ruby>り<ruby>込<rt>こ</rt></ruby>ん');
  strictEqual(ruby('取り扱い', 'とりあつかい'), '<ruby>取<rt>と</rt></ruby>り<ruby>扱<rt>あつか</rt></ruby>い');
  strictEqual(ruby('お花見', 'おはなみ'), 'お<ruby>花見<rt>はなみ</rt></ruby>');
});

test('割り当てられない読みはグループルビに倒す', () => {
  strictEqual(ruby('本気', 'マジ'), '<ruby>本気<rt>マジ</rt></ruby>');
  strictEqual(ruby('一日', 'ついたち'), '<ruby>一日<rt>ついたち</rt></ruby>');
});

test('長い見出しが優先される', () => {
  const f = build('日本橋\tにほんばし\n日本橋駅\tにほんばしえき\n');
  strictEqual(f('日本橋駅'), '<ruby>日本橋駅<rt>にほんばしえき</rt></ruby>');
});

test('文脈は照合に使うだけで消費しない', () => {
  const f = build('大阪\tおおさか\n日本橋\tにほんばし\n大阪の{日本橋}\tにっぽんばし\n');
  strictEqual(f('日本橋'), '<ruby>日本橋<rt>にほんばし</rt></ruby>');
  strictEqual(
    f('大阪の日本橋'),
    '<ruby>大阪<rt>おおさか</rt></ruby>の<ruby>日本橋<rt>にっぽんばし</rt></ruby>',
  );
});

test('# と ! と空欄は照合するがルビを出さない', () => {
  const f = build('日本\tにほん\n日本橋\t#\n東京\t!\n大阪\t\n');
  strictEqual(f('日本橋'), '日本橋', '# が中の 日本 を守る');
  strictEqual(f('東京'), '東京');
  strictEqual(f('大阪'), '大阪');
});

test('英数字トークンは全体を覆えたときだけルビを付ける', () => {
  const f = build('BMP\tビーエムピー\nBMP280\tビーエムピーにいはちまる\ncm\tセンチ\n');
  strictEqual(f('BMP280'), '<ruby>BMP280<rt>ビーエムピーにいはちまる</rt></ruby>');
  strictEqual(f('BMP680'), 'BMP680', '覆えないので無ルビ（未解決）');
  strictEqual(f('20cm'), '20cm', '数字部分を登録していないので無ルビ');
  strictEqual(f('cm'), '<ruby>cm<rt>センチ</rt></ruby>');
});

test('英数字トークンの直後の日本語は普通に拾う', () => {
  const f = build('BMP\tビーエムピー\n用\tよう\n');
  strictEqual(f('BMP用'), '<ruby>BMP<rt>ビーエムピー</rt></ruby><ruby>用<rt>よう</rt></ruby>');
});

test('保護区間にはルビを入れない', () => {
  const f = build('日本橋\tにほんばし\ncode\tコード\n');
  strictEqual(f('`日本橋`'), '`日本橋`');
  strictEqual(f('```\n日本橋\n```'), '```\n日本橋\n```');
  strictEqual(f('<!-- 日本橋 -->'), '<!-- 日本橋 -->');
  strictEqual(f('<style>\ncode { color: red; }\n</style>'), '<style>\ncode { color: red; }\n</style>');
  strictEqual(f('![h:450](img/日本橋.png)'), '![h:450](img/日本橋.png)');
  strictEqual(f('https://example.com/日本橋'), 'https://example.com/日本橋');
});

test('リンクのラベルは表示されるのでルビを入れる', () => {
  const f = build('日本橋\tにほんばし\n');
  strictEqual(f('[日本橋](https://example.com/)'), '[<ruby>日本橋<rt>にほんばし</rt></ruby>](https://example.com/)');
});

test('往復しても原稿が壊れず、二度掛けても変わらない', () => {
  const f = build('日本橋\tにほんばし\n見直す\tみなおす\n');
  const src = '日本橋を見直す。\n\n`日本橋` は <ruby>既存<rt>きそん</rt></ruby>。\n';
  const once = f(stripRuby(src));
  strictEqual(stripRuby(once), stripRuby(src));
  strictEqual(f(stripRuby(once)), once);
});
