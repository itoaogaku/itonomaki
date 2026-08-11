# トレーナー知見ライブラリ (web)

`../notion_sync/content` 以下の Markdown(フィジカル・メンタル・部位別・種目別・トレーナーの5カテゴリ、159トピック)を読み込んで表示する閲覧用サイトです。Notion と同じ内容を、ブラウザで見やすいレイアウト・検索・ダークモード付きで公開するためのものです。

コンテンツは `../notion_sync/content/**/*.md` を直接編集して git に push する方法に加え、サイト右上の編集アイコン(`/edit`)からブラウザ上で追記・新規トピック作成もできます(下記「ウェブ編集機能」参照)。

## 仕組み

- `npm run dev` / `npm run build` の前に `scripts/copy-content.mjs` が自動実行され、`../notion_sync/content` を `web/content` にコピーします(`web/content` は git 管理外)。
- 各ページはビルド時に静的HTML化されます(`generateStaticParams`)。そのため **コンテンツを更新したら再ビルド(= 新しい commit を push)しないとサイトには反映されません。**
- Markdown → 画面表示への変換は `notion_sync/md_to_blocks.py`(Notion同期用)と同じ記法を `src/lib/markdown.ts` で解釈しています(見出し・💡/⚠️コールアウト・テーブル・チェックリスト・太字/コード)。

## ローカルで動かす

```bash
npm install
npm run dev
```

http://localhost:3000 を開きます。

## パスワード保護(限定公開)

`src/proxy.ts` が全ページに Basic 認証をかけます。環境変数 `SITE_USER` / `SITE_PASSWORD` を設定するとURLを知っている人だけがユーザー名・パスワードでアクセスできるようになります(未設定の場合は認証なしで誰でも見られます)。

ローカルで試す場合は `.env.example` を `.env.local` にコピーして値を設定してください。

## ウェブ編集機能

サイト右上の編集アイコンから `/edit` を開くと、ブラウザから既存トピックへの追記・新規トピックの作成ができます。閲覧用の Basic 認証(`SITE_USER`/`SITE_PASSWORD`)とは別に、編集専用のパスワード(`EDIT_PASSWORD`)でさらにログインが必要です。

保存すると `notion_sync/content/<カテゴリ>/<トピック>.md` に直接コミットされ(GitHub Contents API 経由、`GITHUB_TOKEN` が必要)、Vercel の自動デプロイで数十秒〜数分後にサイトへ反映されます。git を直接操作するのと同じ変更が起きるだけなので、Notion への同期(`notion_sync/sync_to_notion.py`)も次回実行時に反映されます。

必要な環境変数(`.env.example` 参照): `EDIT_PASSWORD`、`GITHUB_TOKEN`(このリポジトリへの `contents:write` 権限が必要)。未設定の場合、`/edit` にアクセスしても保存はできません。

### 写真のアップロード

編集画面から写真も追加できます。アップロードされた写真は自動でリサイズ・圧縮(最大1600px、JPEG品質82)された上で、git リポジトリではなく **FTP 経由でトレーナーの既存の Xserver ホスティング**(`library-images` フォルダ)にアップロードされ、そのURLが本文に挿入されます。Vercel のデプロイサイズ制限を回避しつつ、既に契約しているホスティングを再利用する形です。

必要な環境変数(`.env.example` 参照): `FTP_HOST` / `FTP_USER` / `FTP_PASSWORD`。未設定の場合、写真アップロードのみ失敗します(それ以外の編集機能には影響しません)。

## Vercel へのデプロイ

1. [vercel.com](https://vercel.com) で GitHub リポジトリ `itoaogaku/itonomaki` をインポート
2. プロジェクト設定で **Root Directory** を `web` に設定
3. Framework Preset は Next.js が自動検出されます
4. **Environment Variables** に `SITE_USER` / `SITE_PASSWORD`(限定公開にする場合)、`EDIT_PASSWORD` / `GITHUB_TOKEN`(ウェブ編集機能を使う場合)、`FTP_HOST` / `FTP_USER` / `FTP_PASSWORD`(写真アップロード機能を使う場合)を設定
5. Deploy

以降は `claude/trainer-knowledge-notion-xg5660` ブランチ(または本番運用するブランチ)に push するたびに自動で再デプロイされます。
