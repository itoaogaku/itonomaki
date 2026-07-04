# トレーナー知見ライブラリ (web)

`../notion_sync/content` 以下の Markdown(フィジカル・メンタル・部位別・種目別・トレーナーの5カテゴリ、159トピック)を読み込んで表示する閲覧用サイトです。Notion と同じ内容を、ブラウザで見やすいレイアウト・検索・ダークモード付きで公開するためのものです。

コンテンツの編集は今まで通り `../notion_sync/content/**/*.md` を直接編集し、git にコミット・push してください。このサイトはビルド時にその Markdown を読み込むだけで、ここから直接編集することはありません。

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

## Vercel へのデプロイ

1. [vercel.com](https://vercel.com) で GitHub リポジトリ `itoaogaku/itonomaki` をインポート
2. プロジェクト設定で **Root Directory** を `web` に設定
3. Framework Preset は Next.js が自動検出されます
4. **Environment Variables** に `SITE_USER` / `SITE_PASSWORD` を設定(限定公開にする場合)
5. Deploy

以降は `claude/trainer-knowledge-notion-xg5660` ブランチ(または本番運用するブランチ)に push するたびに自動で再デプロイされます。
