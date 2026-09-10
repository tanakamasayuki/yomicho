// @ts-check
// Node 向けアダプタ。ファイル入出力。
import { readFileSync } from 'node:fs';
import { parseDict, resolveDicts } from '../dict.js';

/** @typedef {import('../dict.js').Entry} Entry */
/** @typedef {import('../dict.js').ParseError} ParseError */

/**
 * 探索順に辞書ファイルを読み、1つに解決する。
 * @param {string[]} paths 近い順
 * @returns {{dict: Map<string, Entry>, errors: Array<ParseError & {file: string}>}}
 */
export function loadDicts(paths) {
  /** @type {Array<Map<string, Entry>>} */
  const dicts = [];
  /** @type {Array<ParseError & {file: string}>} */
  const errors = [];
  paths.forEach((path, order) => {
    const { entries, errors: errs } = parseDict(readFileSync(path, 'utf8'), order);
    dicts.push(entries);
    for (const e of errs) errors.push({ ...e, file: path });
  });
  return { dict: resolveDicts(dicts), errors };
}
