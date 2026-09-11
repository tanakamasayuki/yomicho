// @ts-check
// sandbox/ で update と build を流し、結果を表にする。
// sandbox/ は git 管理外なので、自分のテキストを置いて試せる。
//   node scripts/sandbox.js            samples/ から複製して全部流す
//   node scripts/sandbox.js --dict <path>  参照辞書を差し替える
//                                      （既定 sandbox/global.tsv。sandbox/dicts/ に大きいものを置ける）
//   node scripts/sandbox.js --known    既知文字リスト（sandbox/known-easy.txt）を使う
//   node scripts/sandbox.js --full     カタカナ語や数値も ? で記録する
//   node scripts/sandbox.js --reset    sandbox/ を作り直す（dicts/ は残す）
//
// 生成物は sandbox/out/<辞書名>[+known][+full]/ に分けて置く。
// 辞書やモードを変えて何度か流してから diff -r で比べられる。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  annotate, buildMatcher, formatDict, intlWords, parseDict, producesRuby,
  protectedRanges, resolveDicts, stripRuby, tokenize, update,
} from '../src/index.js';
import { loadDicts } from '../src/node/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const samples = join(root, 'samples');
const sandbox = join(root, 'sandbox');
const full = process.argv.includes('--full');
const useKnown = process.argv.includes('--known');
const dictIndex = process.argv.indexOf('--dict');
const dictArg = dictIndex >= 0 ? process.argv[dictIndex + 1] : null;

if (process.argv.includes('--reset') && existsSync(sandbox)) {
  // dicts/ は落としてきた大きい辞書を置く場所なので残す
  for (const name of readdirSync(sandbox)) {
    if (name === 'dicts') continue;
    rmSync(join(sandbox, name), { recursive: true, force: true });
  }
}
if (!existsSync(sandbox)) {
  mkdirSync(sandbox, { recursive: true });
  process.stdout.write(`sandbox/ を作りました\n`);
}
// 無いファイルだけ複製する。手で直したものは上書きしない
for (const name of readdirSync(samples)) {
  const to = join(sandbox, name);
  if (!existsSync(to)) cpSync(join(samples, name), to);
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'out' || name === 'dicts') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (name.endsWith('.md') && name !== 'README.md') out.push(path);
  }
  return out;
}

const refPath = dictArg ? resolve(dictArg) : join(sandbox, 'global.tsv');
if (dictArg && !existsSync(refPath)) {
  process.stderr.write(`参照辞書が見つかりません: ${refPath}\n`);
  process.exit(1);
}
const { dict: refs, errors } = existsSync(refPath) ? loadDicts([refPath]) : { dict: new Map(), errors: [] };
for (const e of errors) process.stderr.write(`${e.file}:${e.line}: ${e.message}\n`);

const knownPath = join(sandbox, 'known-easy.txt');
const known = useKnown && existsSync(knownPath)
  ? new Set([...readFileSync(knownPath, 'utf8')].filter((c) => !/\s/.test(c)))
  : undefined;

const HAN = /\p{Script=Han}/u;
const files = walk(sandbox).sort();
const tag = basename(refPath, '.tsv') + (known ? '+known' : '') + (full ? '+full' : '');
const outDir = join(sandbox, 'out', tag);
mkdirSync(outDir, { recursive: true });
const flags = [known ? `既知文字 ${known.size} 字` : '', full ? '--full' : ''].filter(Boolean).join(' / ');
process.stdout.write(`参照辞書 ${basename(refPath)} ${refs.size.toLocaleString()} 語 / 原稿 ${files.length} 本${flags ? ' / ' + flags : ''}\n`);
process.stdout.write(`出力先 sandbox/out/${tag}/\n\n`);
process.stdout.write('原稿          辞書   >    ?    !    +   空欄   漢字被覆\n');

for (const path of files) {
  const bookPath = join(outDir, basename(path).replace(/\.md$/, '.tsv'));
  const text = stripRuby(readFileSync(path, 'utf8'));
  const book = existsSync(bookPath) ? parseDict(readFileSync(bookPath, 'utf8')).entries : new Map();
  const r = update({
    text,
    book,
    refs,
    matcher: buildMatcher(resolveDicts([book, refs]).values()),
    segmenter: intlWords(),
    known,
    full,
  });
  writeFileSync(bookPath, formatDict(r.book.values()));
  const matcher = buildMatcher(r.book.values());
  writeFileSync(join(outDir, basename(path).replace(/\.md$/, '.out.md')), annotate(text, matcher).text);

  // 漢字の被覆率
  let total = 0;
  let bare = 0;
  let pos = 0;
  /** @type {Array<[number, number]>} */
  const chunks = [];
  for (const g of protectedRanges(text)) {
    if (g.start > pos) chunks.push([pos, g.start]);
    pos = g.end;
  }
  if (pos < text.length) chunks.push([pos, text.length]);
  for (const [cs, ce] of chunks) {
    const chunk = text.slice(cs, ce);
    const covered = new Uint8Array(chunk.length);
    for (const t of tokenize(chunk, matcher)) {
      if (t.kind !== 'entry' || !producesRuby(t.entry)) continue;
      for (let i = t.start; i < t.end; i++) covered[i] = 1;
    }
    for (let i = 0; i < chunk.length; i++) {
      if (!HAN.test(chunk[i])) continue;
      total++;
      if (!covered[i]) bare++;
    }
  }

  const by = (/** @type {string} */ s) => [...r.book.values()].filter((e) => e.state === s).length;
  const blank = [...r.book.values()].filter((e) => e.state === '' && e.reading === '').length;
  const pc = total ? (((total - bare) / total) * 100).toFixed(1) + '%' : '-';
  process.stdout.write(
    `${basename(path).padEnd(12)} ${String(r.book.size).padStart(4)} ${String(by('>')).padStart(4)} ` +
      `${String(by('?')).padStart(4)} ${String(by('!')).padStart(4)} ${String(by('+')).padStart(4)} ` +
      `${String(blank).padStart(5)} ${pc.padStart(10)}\n`,
  );
}

process.stdout.write(`\nsandbox/out/${tag}/ に .tsv（原稿辞書）と .out.md（変換結果）を書き出しました。\n`);
process.stdout.write('要対応の行は .tsv の下端に ? 付きで並びます。\n');
process.stdout.write('辞書やモードを変えて流し、diff -r sandbox/out/<A> sandbox/out/<B> で比べられます。\n');
