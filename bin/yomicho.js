#!/usr/bin/env node
// @ts-check
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { annotate, buildMatcher, stripRuby } from '../src/index.js';
import { loadDicts } from '../src/node/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const USAGE = `yomicho ${version}

  yomicho build <input.md> -d <dict.tsv> [-d ...] [-o <out.md>]
  yomicho strip <input.md> [-o <out.md>]

コマンドラインの構文は暫定です（docs/spec.ja.md 12章）。
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dict: { type: 'string', short: 'd', multiple: true, default: [] },
    out: { type: 'string', short: 'o' },
    stats: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [command, input] = positionals;
if (values.help || !command || !input) {
  process.stdout.write(USAGE);
  process.exit(values.help ? 0 : 1);
}

const source = readFileSync(input, 'utf8');
let output;

if (command === 'strip') {
  output = stripRuby(source);
} else if (command === 'build') {
  const { dict, errors } = loadDicts(values.dict ?? []);
  for (const e of errors) process.stderr.write(`${e.file}:${e.line}: ${e.message}\n`);
  const result = annotate(stripRuby(source), buildMatcher(dict.values()));
  output = result.text;
  if (values.stats) {
    const { used, grouped, mono, silent } = result.stats;
    process.stderr.write(`採用 ${used.size} 種 / グループ ${grouped} / 分割 ${mono} / 非表示 ${silent.size} 種\n`);
  }
} else {
  process.stderr.write(`不明なコマンド: ${command}\n${USAGE}`);
  process.exit(1);
}

if (values.out) writeFileSync(values.out, output);
else process.stdout.write(output);
