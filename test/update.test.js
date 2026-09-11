// @ts-check
import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import {
  annotate, buildMatcher, dropCache, formatDict, intlWords, mergeReadings, occurrences,
  parseDict, resolveDicts, unresolvedDetail, unresolvedTsv, update,
} from '../src/index.js';

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

test('どこにも無い語は ? で足し、スニペットを付ける', () => {
  const r = run('新型の未知を発表した。', '', '');
  const e = r.book.get('未知');
  strictEqual(e?.state, '?', '今回の原稿に出ているので ?。3列目があっても書き込み位置が見える');
  strictEqual(e?.reading, '');
  deepStrictEqual(e?.snippets, ['新型の{未知}を発表した']);
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

test('空欄の行も読みは書き換えず、参照辞書から引き直さない', () => {
  const r = run('日本橋へ行く。', '日本橋\t\n', '日本橋\tにほんばし\n');
  strictEqual(r.book.get('日本橋')?.reading, '', '読みには触れない');
  strictEqual(r.book.get('日本橋')?.state, '?', '今回出ているので ? が付く');
});

test('原稿から消えた語は ? が外れて空欄に戻る', () => {
  const first = run('日本橋へ行く。', '', '');
  strictEqual(first.book.get('日本橋')?.state, '?');
  const second = run('別の話。', formatDict(first.book.values()), '');
  strictEqual(second.book.get('日本橋')?.state, '');
  deepStrictEqual(second.book.get('日本橋')?.snippets, []);
});

test('読みが埋まればスニペットが外れる', () => {
  const text = '新型の未知を発表した。';
  const first = run(text, '', '');
  strictEqual(first.book.get('未知')?.snippets.length, 1);
  const filled = formatDict(first.book.values()).replace('未知\t?\t', '未知\tみち\t');
  const second = run(text, filled, '');
  deepStrictEqual(second.book.get('未知')?.snippets, []);
  strictEqual(second.unresolved.includes('未知'), false);
});

test('既知文字だけの語には ! を付ける', () => {
  const known = new Set(['山', '川']);
  const r = run('山川と発表。', '', '', known);
  strictEqual(r.book.get('山川')?.state, '!');
  strictEqual(r.book.get('発表')?.state, '?');
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

test('要対応の行だけを TSV で出す', () => {
  const r = run('新型の未知を発表した。', '確定\tかくてい\n', '発表\tはっぴょう\n');
  const tsv = unresolvedTsv(r.book);
  const rows = tsv.split('\n').filter(Boolean).map((line) => line.split('\t'));
  deepStrictEqual(rows.map((c) => c[0]).sort(), ['新型', '未知'].sort(), '確定済みと参照辞書から引けた行は出さない');
  deepStrictEqual(rows.find((c) => c[0] === '未知'), ['未知', '?', '新型の{未知}を発表した']);
});

test('戻ってきた読みは必ず + で入る', () => {
  const r = run('新型の未知を発表した。', '', '');
  const m = mergeReadings(r.book, '未知\tみち\t新型の{未知}を発表した。\n');
  strictEqual(m.book.get('未知')?.state, '+');
  strictEqual(m.book.get('未知')?.reading, 'みち');
  deepStrictEqual(m.applied, ['未知']);
});

test('記号が付いていても付いていなくても受ける', () => {
  const r = run('新型の未知を発表した。', '', '');
  strictEqual(mergeReadings(r.book, '未知\t+みち\n').book.get('未知')?.reading, 'みち');
  strictEqual(mergeReadings(r.book, '未知\tみち\n').book.get('未知')?.reading, 'みち');
});

test('人の判断が入っている行は上書きしない', () => {
  const book = parseDict('日本橋\tにほんばし\n無視\t#\n').entries;
  const m = mergeReadings(book, '日本橋\tでたらめ\n無視\tでたらめ\n知らない語\tよみ\n');
  strictEqual(m.book.get('日本橋')?.reading, 'にほんばし');
  strictEqual(m.book.get('無視')?.state, '#');
  deepStrictEqual(m.skipped.sort(), ['日本橋', '無視']);
  deepStrictEqual(m.unknown, ['知らない語']);
});

test('--force は機械のキャッシュだけを捨てる', () => {
  const book = parseDict(['確定\tかくてい', '無視\t#', '除外\t!', '引用\t>いんよう', '未承認\t+みしょうにん', '未定\t'].join('\n')).entries;
  const d = dropCache(book);
  deepStrictEqual(d.dropped.sort(), ['引用', '除外']);
  deepStrictEqual([...d.book.keys()].sort(), ['未定', '未承認', '確定', '無視'].sort());
});

test('--full はカタカナ語と数値を * として記録する', () => {
  const text = '10Aのセンサユニットを280個。';
  const normal = update({
    text, book: new Map(), refs: new Map(),
    matcher: buildMatcher([]), segmenter: intlWords(),
  });
  deepStrictEqual([...normal.book.keys()].sort(), ['10A', '個']);

  const full = update({
    text, book: new Map(), refs: new Map(),
    matcher: buildMatcher([]), segmenter: intlWords(), full: true,
  });
  strictEqual(full.book.get('280')?.state, '*');
  strictEqual(full.book.get('センサユニット')?.state, '*');
  strictEqual(full.unresolved.length, normal.unresolved.length, '作業ゾーンは増えない');
});

test('* は照合に参加しないので中の語を邪魔しない', () => {
  const book = parseDict('センサユニット\t*\nセンサ\tせんさ\n').entries;
  const out = annotate('センサユニット', buildMatcher(book.values())).text;
  strictEqual(out, '<ruby>センサ<rt>せんさ</rt></ruby>ユニット');
});

test('* を消すと次の update で作業ゾーンに入る', () => {
  const text = 'センサユニットを使う。';
  const first = update({
    text, book: new Map(), refs: new Map(),
    matcher: buildMatcher([]), segmenter: intlWords(), full: true,
  });
  deepStrictEqual(first.book.get('センサユニット')?.snippets, [], '* にはスニペットを付けない');
  const cleared = parseDict(formatDict(first.book.values()).replace('センサユニット\t*', 'センサユニット\t')).entries;
  const second = update({
    text, book: cleared, refs: new Map(),
    matcher: buildMatcher(cleared.values()), segmenter: intlWords(), full: true,
  });
  strictEqual(second.book.get('センサユニット')?.state, '?');
  deepStrictEqual(second.book.get('センサユニット')?.snippets, ['{センサユニット}を使う']);
});

test('--force は * も捨てる', () => {
  const book = parseDict('確定\tかくてい\n収集\t*\n引用\t>いんよう\n').entries;
  const d = dropCache(book);
  deepStrictEqual(d.dropped.sort(), ['収集', '引用']);
  deepStrictEqual([...d.book.keys()], ['確定']);
});

test('数字を含むトークンは型番とみなして *、英字だけは作業ゾーン', () => {
  const text = 'BMP280 と 10cm と 0xFFE01F と .h と U001 と KeyBridge。';
  const r = update({
    text, book: new Map(), refs: new Map(),
    matcher: buildMatcher([]), segmenter: intlWords(),
  });
  // 型番・量・生の値は聞かない
  for (const k of ['BMP280', 'U001', '10cm', '0xFFE01F', '.h']) {
    strictEqual(r.book.get(k)?.state, '*', `${k} は * になる`);
  }
  // 英字だけの名前は聞く
  strictEqual(r.book.get('KeyBridge')?.state, '?');
});

test('参照辞書にあれば型番でも読みが付く', () => {
  const r = run('ESP32を使う。', '', 'ESP32\tイーエスピーサンニー\n');
  strictEqual(r.book.get('ESP32')?.state, '>', '登録済みなら ? にはならない');
  strictEqual(r.book.get('ESP32')?.reading, 'イーエスピーサンニー');
});

test('? にしても出力は変わらない（5.3 によりトークンの一部は元々マッチしない）', () => {
  const quiet = parseDict('10cm\t?\ncm\tセンチ\n').entries;
  const blank = parseDict('10cm\t\ncm\tセンチ\n').entries;
  const text = '長さは10cmです。';
  strictEqual(annotate(text, buildMatcher(quiet.values())).text, text);
  strictEqual(annotate(text, buildMatcher(blank.values())).text, text);
});

test('ドットを含むトークンも *、ハイフンは名前に使われるので対象外', () => {
  const text = 'sketch.yaml と Serial.begin と E-Paper と KeyBridge。';
  const r = update({
    text, book: new Map(), refs: new Map(),
    matcher: buildMatcher([]), segmenter: intlWords(),
  });
  strictEqual(r.book.get('sketch.yaml')?.state, '*');
  strictEqual(r.book.get('Serial.begin')?.state, '*');
  strictEqual(r.book.get('E-Paper')?.state, '?', 'ハイフンは名前に使われる');
  strictEqual(r.book.get('KeyBridge')?.state, '?');
});

test('スニペットの両端から句読点を落とす', () => {
  const text = '次に多いのが、先に予算を決めてしまう場合である。予算から入ると、選択肢が消える。';
  const r = update({
    text, book: new Map(), refs: new Map(),
    matcher: buildMatcher([]), segmenter: intlWords(),
  });
  const s = r.book.get('場合')?.snippets[0] ?? '';
  strictEqual(/^[、。]/.test(s), false, `先頭に句読点が残っている: ${s}`);
  strictEqual(/[、。]$/.test(s), false, `末尾に句読点が残っている: ${s}`);
  strictEqual(s.includes('{場合}'), true);
});

test('参照辞書の読みが空なら > ではなく未解決として取り込む', () => {
  // 読みが割れる語を一括辞書から空欄で取り込むと、照合はするので中の短い語を守りつつ
  // 人に読みを聞ける。`>` にすると黙って無ルビになり、聞かれないまま消える。
  const r = run('日本の会社。', '', '日本\t\n本\tほん\n会社\tかいしゃ\n');
  strictEqual(r.book.get('日本')?.state, '?', '未解決として作業ゾーンに出る');
  strictEqual(r.book.get('会社')?.state, '>');
  const out = annotate('日本の会社。', buildMatcher(r.book.values())).text;
  strictEqual(out.includes('<ruby>本<rt>ほん</rt></ruby>'), false, '日本 が 本 を守る');
  strictEqual(out, '日本の<ruby>会社<rt>かいしゃ</rt></ruby>。');
});

test('読みが `|` で並んでいたら候補であって読みではない', () => {
  const r = run('今日は風が強い。', '', '今日\tきょう|こんにち\n風\tかぜ\n');
  strictEqual(r.book.get('今日')?.state, '?', '候補は未解決として作業ゾーンへ');
  strictEqual(r.book.get('今日')?.reading, 'きょう|こんにち');
  strictEqual(r.book.get('風')?.state, '>');
  const out = annotate('今日は風が強い。', buildMatcher(r.book.values())).text;
  strictEqual(out.includes('きょう|こんにち'), false, '候補をそのままルビにしない');
  strictEqual(out, '今日は<ruby>風<rt>かぜ</rt></ruby>が強い。');
});

test('候補を1つに減らせば確定する', () => {
  const first = run('今日は晴れ。', '', '今日\tきょう|こんにち\n');
  const tsv = formatDict(first.book.values()).replace('今日\t?きょう|こんにち', '今日\tきょう');
  const second = run('今日は晴れ。', tsv, '');
  strictEqual(second.book.get('今日')?.state, '');
  strictEqual(annotate('今日は晴れ。', buildMatcher(second.book.values())).text.startsWith('<ruby>今日<rt>きょう</rt>'), true);
});

test('要対応の語は全出現箇所を並べられる', () => {
  const text = '今日は晴れ。今日中に終わる。今日的な問題。';
  const r = run(text, '', '今日\tきょう|こんにち\n');
  const occ = occurrences(text, buildMatcher(r.book.values()), r.book);
  strictEqual(occ.get('今日')?.length, 3, '3箇所すべて出す');
  const detail = unresolvedDetail(r.book, occ);
  strictEqual(detail.includes('今日\t?きょう|こんにち\n'), true);
  strictEqual(detail.split('\n').filter((l) => l.startsWith('\t')).length >= 3, true);
});

test('候補がある行には全出現を並べ、それ以外は1つ', () => {
  const text = '今日は晴れ。今日中に終わる。今日的な問題。未知も未知も未知。';
  const r = run(text, '', '今日\tきょう|こんにち\n');
  deepStrictEqual(r.book.get('今日')?.snippets.length, 3, '候補つきは全出現（上限3）');
  deepStrictEqual(r.book.get('未知')?.snippets.length, 1, '候補が無ければ1つ');
});

test('3列目以降はすべてスニペットとして読み書きする', () => {
  const tsv = '今日\t?きょう|こんにち\t{今日}は晴れ\t{今日}的な問題\n';
  const { entries } = parseDict(tsv);
  deepStrictEqual(entries.get('今日')?.snippets, ['{今日}は晴れ', '{今日}的な問題']);
  strictEqual(formatDict(entries.values()), tsv, '往復しても同じ');
});
