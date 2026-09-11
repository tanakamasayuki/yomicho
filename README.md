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
未知		新型の{未知}製品を発表した
```

タブ区切りのテキストが辞書です。読み欄の先頭1文字が状態を表し、承認は記号を消すだけ。
ファイルの下端がそのまま作業リストになります。

```sh
yomicho update book.md -d global.tsv   # 読みが要る語を集める
yomicho unresolved book.md > ask.tsv   # 未解決を書き出して AI に投げる
yomicho merge book.md < filled.tsv     # 取り込む（+ が付く）
yomicho build book.md -o out.md        # 原稿辞書だけで変換する
```

## 状況

**設計中です。** 記法もコマンドの構文も固まっていません。

動くのは CLI の `build` / `update` / `unresolved` / `merge` / `strip` までで、
出力は HTML の `<ruby>` のみです。学年別フィルター、読みの推定、ブラウザ版、
VSCode 拡張はまだありません。

- [使い方](docs/GUIDE.ja.md)
- [コマンドリファレンス](docs/CLI.ja.md)
- [仕様](docs/spec.ja.md) — 設計と未決事項
- [変更履歴](CHANGELOG.md)

## ライセンス

MIT
