#!/usr/bin/env node
// @ts-check
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

console.error(`yomicho ${version} — 設計中です。実装はまだありません。`);
console.error('仕様: docs/spec.ja.md');
process.exit(1);
