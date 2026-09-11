#!/usr/bin/env node
// @ts-check
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  annotate, buildMatcher, dropCache, formatDict, intlWords, mergeReadings,
  parseDict, resolveDicts, stripRuby, unresolvedTsv, update,
} from '../src/index.js';
import { loadDicts } from '../src/node/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const USAGE = `yomicho ${version}

  yomicho build      <input.md> [-b <book.tsv>] [-o <out.md>]
  yomicho update     <input.md> [-b <book.tsv>] [-d <ref.tsv>]... [--known <chars.txt>] [--full] [--force]
  yomicho unresolved <input.md> [-b <book.tsv>]           要対応の行を TSV で出す
  yomicho merge      <input.md> [-b <book.tsv>] < in.tsv  読みを取り込む（必ず + が付く）
  yomicho strip      <input.md> [-o <out.md>]

  -b  原稿辞書（既定: 原稿と同じ名前の .tsv）
  -d  参照辞書。近い順に並べる
  --known  既知文字リスト。含まれる文字だけの語にはルビを振らない
  --full   通常は捨てる候補（カタカナ語・数値）も ? として記録する
  --force  > ! ? の行を捨ててから update する

コマンドラインの構文は暫定です（docs/spec.ja.md 12章）。
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    book: { type: 'string', short: 'b' },
    dict: { type: 'string', short: 'd', multiple: true, default: [] },
    known: { type: 'string' },
    force: { type: 'boolean', default: false },
    full: { type: 'boolean', default: false },
    out: { type: 'string', short: 'o' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [command, input] = positionals;
if (values.help || !command || !input) {
  process.stdout.write(USAGE);
  process.exit(values.help ? 0 : 1);
}

const bookPath = values.book ?? input.replace(/\.[^./]*$/, '') + '.tsv';
const source = stripRuby(readFileSync(input, 'utf8'));
const readBook = () => (existsSync(bookPath) ? parseDict(readFileSync(bookPath, 'utf8')).entries : new Map());

if (command === 'strip') {
  emit(source);
} else if (command === 'build') {
  const book = readBook();
  const result = annotate(source, buildMatcher(book.values()));
  for (const key of result.stats.unaligned.keys()) {
    const reading = book.get(key)?.reading ?? '';
    process.stderr.write(`要確認: ${key}\t${reading}  読みを漢字に割り当てられません。送り仮名まで含めて書いてください\n`);
  }
  emit(result.text);
} else if (command === 'unresolved') {
  process.stdout.write(unresolvedTsv(readBook()));
} else if (command === 'merge') {
  const book = readBook();
  const r = mergeReadings(book, readFileSync(0, 'utf8'));
  writeFileSync(bookPath, formatDict(r.book.values()));
  process.stderr.write(`${bookPath}: 取り込み ${r.applied.length}`);
  if (r.skipped.length) process.stderr.write(` / 確定済みなので見送り ${r.skipped.length}`);
  if (r.unknown.length) process.stderr.write(` / 辞書に無い見出し ${r.unknown.length}`);
  process.stderr.write('\n');
} else if (command === 'update') {
  let book = readBook();
  if (values.force) {
    const d = dropCache(book);
    book = d.book;
    process.stderr.write(`キャッシュを捨てた: ${d.dropped.length} 行\n`);
  }
  const { dict: refs, errors } = loadDicts(values.dict ?? []);
  for (const e of errors) process.stderr.write(`${e.file}:${e.line}: ${e.message}\n`);
  const known = values.known
    ? new Set([...readFileSync(values.known, 'utf8')].filter((c) => !/\s/.test(c)))
    : undefined;
  const result = update({
    text: source,
    book,
    refs,
    matcher: buildMatcher(resolveDicts([book, refs]).values()),
    segmenter: intlWords(),
    known,
    full: values.full,
  });
  writeFileSync(bookPath, formatDict(result.book.values()));
  process.stderr.write(`${bookPath}: ${result.book.size} 行 (+${result.added.length}) / 要対応 ${result.unresolved.length}\n`);
} else {
  process.stderr.write(`不明なコマンド: ${command}\n${USAGE}`);
  process.exit(1);
}

/** @param {string} text */
function emit(text) {
  if (values.out) writeFileSync(values.out, text);
  else process.stdout.write(text);
}
