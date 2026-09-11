# 変更履歴

このプロジェクトは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、
[セマンティック バージョニング](https://semver.org/lang/ja/) を採用します。

## [Unreleased]

### Added

- 設計を [docs/spec.ja.md](docs/spec.ja.md) に起こした
- リポジトリの骨組みを用意した
- コア（辞書の解析・階層解決・マッチ・送り仮名の割り当て・保護区間・変換）
- CLI の `build` / `update` / `unresolved` / `merge` / `strip`
- 未知語の切り出しに `Intl.Segmenter` を採用（依存なし）
- [使い方](docs/GUIDE.ja.md) と[コマンドリファレンス](docs/CLI.ja.md)
