# 読み帳 (yomicho)

> **English** — yomicho adds furigana (ruby) to Japanese text using a
> translation-memory workflow. Every reading you confirm is recorded in a
> per-manuscript dictionary, so the output never changes when the shared
> dictionary does. One dependency-free core drives the CLI, the browser
> playground, and the library API.
> **Documentation is Japanese only.**

日本語の原稿にルビを振り、読み上げ用のテキストを作るためのツールです。

自動変換ではなく**翻訳メモリ**として作ります。読みを推定するのは下書きを作るときだけで、
一度決めた読みは原稿ごとの辞書に記録され、共通辞書が後から変わっても変わりません。

```text
日本橋	にほんばし
CUR	#カレント
日本橋駅	+にほんばしえき	大阪の{日本橋駅}では乗り換えが
未知製品		新型の{未知製品}を発表した
```

タブ区切りのテキストが辞書です。読み欄の先頭1文字が状態を表し、承認は記号を消すだけ。
ファイルの下端がそのまま作業リストになります。

## 状況

**設計中です。** 実装はまだありません。仕様を詰めている段階です。

- [仕様](docs/spec.ja.md) — 現在の設計と未決事項
- [使い方](docs/GUIDE.ja.md) — 未着手
- [コマンドリファレンス](docs/CLI.ja.md) — 未着手
- [リリース手順](docs/release.ja.md) — 未着手
- [変更履歴](CHANGELOG.md)

## ライセンス

MIT
