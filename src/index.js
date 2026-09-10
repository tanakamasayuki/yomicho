// @ts-check
// 読み帳のコア。I/O を持たない純粋関数だけを置く。
// Node の組み込みモジュールを import しないこと（ブラウザからそのまま読めなくなる）。
// 設計は docs/spec.ja.md を参照。

export { parseDict, formatDict, parseHeadword, parseReading, resolveDicts, producesRuby, sortRank, SIGILS } from './dict.js';
export { buildMatcher, matchAt, tokenize, atomicMap } from './match.js';
export { protectedRanges, mergeRanges } from './protect.js';
export { segment, alignOkurigana, assign, renderHtmlRuby } from './ruby.js';
export { annotate, stripRuby } from './annotate.js';
export { collectCandidates, kanjiRun, intlWords, intlMergedHan } from './collect.js';
export { update, scanEntries, makeSnippet, needsAttention, unresolvedTsv, mergeReadings, dropCache } from './update.js';
