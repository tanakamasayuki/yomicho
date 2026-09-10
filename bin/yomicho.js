#!/usr/bin/env node
// @ts-check
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  annotate, buildMatcher, formatDict, intlWords, parseDict, resolveDicts, stripRuby, update,
} from '../src/index.js';
import { loadDicts } from '../src/node/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const USAGE = `yomicho ${version}

  yomicho build  <input.md> [-b <book.tsv>] [-o <out.md>]
  yomicho update <input.md> [-b <book.tsv>] [-d <ref.tsv>]... [--known <chars.txt>]
  yomicho strip  <input.md> [-o <out.md>]

  -b  原稿辞書（既定: 原稿と同じ名前の .tsv）
  -d  参照辞書。近い順に並べる
  --known  既知文字リスト。含まれる文字だけの語にはルビを振らない

コマンドラインの構文は暫定です（docs/spec.ja.md 12章）。
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    book: { type: 'string', short: 'b' },
    dict: { type: 'string', short: 'd', multiple: true, default: [] },
    known: { type: 'string' },
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
  emit(annotate(source, buildMatcher(book.values())).text);
} else if (command === 'update') {
  const book = readBook();
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
