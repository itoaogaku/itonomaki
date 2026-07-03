# トレーナー知見 Notion 同期

OneNote から抽出したトレーナー時代の知見を、整形・専門用語解説を加えた上で Notion に反映するための仕組みです。

## 構成

```
notion_sync/
  content/<セクション名>/<トピック名>.md   # 整形済みの知見(Markdownのサブセット)
  md_to_blocks.py                          # Markdown -> Notion ブロック変換
  sync_to_notion.py                        # Notion API 同期スクリプト
  requirements.txt
```

`content/` 以下のディレクトリ構造がそのまま Notion 上のページ階層になります。

```
<共有した親ページ>
  └ フィジカル (セクションページ)
      └ 大会準備 (トピックページ)
      └ ...
  └ 部位別
  └ 種目別
  └ メンタル
  └ トレーナー
```

## 事前準備

1. Notion で Integration を作成し、Internal Integration Secret を発行する
2. 反映先の親ページを開き、「コネクト」からその Integration を共有する
3. リポジトリの Settings > Secrets and variables > Actions に以下を登録する
   - `NOTION_TOKEN`: Integration Secret
   - `NOTION_PAGE_ID`: 反映先ページのID(URL末尾の32桁の英数字)

## 実行方法

GitHub Actions の「Sync Trainer Knowledge to Notion」ワークフローを手動実行(workflow_dispatch)してください。
`content/` 配下の Markdown を読み込み、セクション・トピックごとに Notion ページを作成/更新します。

再実行すると、同名のトピックページの中身は最新の Markdown で上書きされます(セクション・トピックページ自体は削除されず、中身だけ入れ替わります)。

各トピックページの末尾には、同期時点の内容から計算したハッシュ値を灰色の小さな一行として自動的に残しています(`sync-hash: ...`)。次回実行時、Markdownの内容に変更がなければこのハッシュが一致するため、そのページはAPI呼び出しをスキップします。トピック数が増えるとNotion APIの呼び出し回数がボトルネックになり同期に数十分かかることがあるため、変更のないページを飛ばすことで再実行を大幅に高速化しています。

## Markdown で使える記法

- `# / ## / ###` 見出し
- `- ` 箇条書き / `1. ` 番号付きリスト
- `- [ ] ` チェックリスト
- `> 💡 ...` / `> ⚠️ ...` コールアウト(用語解説・注意事項)
- `| a | b |` テーブル
- `**太字**` / `` `コード` ``
- `---` 区切り線

## ローカルでの動作確認

```
cd notion_sync
pip install -r requirements.txt
python -c "from md_to_blocks import markdown_to_blocks; import json; print(json.dumps(markdown_to_blocks(open('content/フィジカル/大会準備.md').read()), ensure_ascii=False, indent=2))"
```
