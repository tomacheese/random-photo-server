# CLAUDE.md

## 目的

このファイルは Claude Code の作業方針とプロジェクト固有ルールを示します。

## 判断記録のルール

- 判断内容の要約を記載する
- 検討した代替案を列挙する
- 採用しなかった案とその理由を明記する
- 前提条件・仮定・不確実性を明示する
- 他エージェントによるレビュー可否を示す

## プロジェクト概要

- 目的: `photos/` 以下の画像からランダムに1枚を選び、リサイズ・圧縮して配信する Web サーバー
- 主な用途: VRChat ワールドに設置したフォトフレームでの表示
- 公開先: `https://vrcrandomphoto.tomacheese.com`

## 重要ルール

- 会話言語: 日本語
- コミット規約: Conventional Commits
- コメント言語: JSDoc は日本語、それ以外のインラインコメントは英語
- エラーメッセージ: 英語
- 日本語と英数字の間には半角スペースを挿入する

## 環境のルール

- ブランチ命名: Conventional Branch(`feat/`, `fix/` 等の短縮形を使用)
- GitHub リポジトリ調査: 必要に応じてテンポラリディレクトリに clone して検索
- Renovate PR: 自動生成された PR に追加コミットや更新を行わない

## コード改修時のルール

- TypeScript: `skipLibCheck` の使用を禁止
- ドキュメント: エクスポートされた関数・インターフェース・クラスに JSDoc を日本語で記載する
- `photos/` は HTTP から直接公開しない。配信は必ず `cache/` 内の生成物経由で行う
- `OUTPUT_FORMAT` は現状 `jpeg` のみ対応。それ以外の値が指定された場合は起動時にエラーで停止させる(黙って無視しない)

## 開発コマンド

```bash
# インストール
pnpm install

# 開発
pnpm dev

# ビルド(型チェック用。実行は tsx 経由で src を直接参照する)
pnpm build

# テスト
pnpm test

# Lint
pnpm lint

# 修正
pnpm fix
```

## アーキテクチャと主要ファイル

- `src/main.ts`: エントリポイント。`PhotoCache` の初期化・監視開始、`PhotoSelector` の生成、Fastify サーバーの起動を行う
- `src/server.ts`: Fastify アプリケーションの構築(`buildApp`)
- `src/environments.ts`: 環境変数の管理(`ENV` オブジェクト)
- `src/photo-cache/manifest.ts`: `photos/` の走査結果と `cache/manifest.json` の差分判定ロジック(純粋関数)
- `src/photo-cache/process.ts`: `sharp` を用いた画像リサイズ・圧縮処理
- `src/photo-cache/index.ts`: `PhotoCache` クラス。`cache/` の初期構築・`chokidar` による監視・差分更新を担う
- `src/photo-selector.ts`: `PhotoSelector` クラス。IP 単位で直近配信済み画像を避けつつランダム選択する
- `src/photo-orientation.ts`: 画像の幅・高さからアスペクト比に基づき向き(`portrait`/`landscape`/`square`)を判定する純粋関数 `getPhotoOrientation`
- `src/endpoints/index.ts`: ルーターの基底クラス `BaseRouter`
- `src/endpoints/root.ts`: `GET /`(ランダム画像配信)・`GET /health`(ヘルスチェック)
- `src/endpoints/photo-response.ts`: `RootRouter` と `OrientationRouter` が共有する、候補一覧からのランダム選択・画像配信の共通処理(`servePickedPhoto`)
- `src/endpoints/orientation.ts`: `GET /portrait`(縦長)・`GET /landscape`(横長)エンドポイントを提供する `OrientationRouter`

## 実装パターン

- `BaseRouter` を継承して新しいエンドポイントを追加する
- `PhotoCache` への依存は `PhotoCacheReader` インターフェース(`src/endpoints/root.ts`)経由で受け取り、テスト時はフェイク実装に差し替える
- 環境変数は `src/environments.ts` の `ENV` オブジェクト経由で参照する

## テスト

- Vitest でユニットテストを実装済み: `photo-cache/manifest`、`photo-cache/process`、`photo-cache/index`、`photo-selector`、`endpoints/root`、`environments`
- `chokidar` による実ファイル監視イベント自体は自動テストせず、`docker compose up` での手動確認で担保する
- 変更の検証は `pnpm lint` と `pnpm test` に加え、必要に応じて `docker compose up` での手動動作確認で行う

## セキュリティ / 機密情報

- API キー・パスワード等の機密情報をコードに直接記述しない。`ENV` 経由で取得する
- 機密情報を含むファイルをコミットしない
- `photos/` と `cache/` は `.gitignore` 対象。実写真データを誤ってコミットしない

## ドキュメント更新ルール

- 開発コマンド・環境変数・アーキテクチャを変更した場合は、この `CLAUDE.md` と `README.md` の該当箇所を更新する

## 作業チェックリスト

### 新規改修時

1. プロジェクトを理解する
2. 適切な作業ブランチを作成する
3. 最新のリモートブランチに基づいているか確認する
4. 不要なブランチを削除する
5. `pnpm install` を実行する

### コミット・プッシュ前

1. Conventional Commits に従っているか確認する
2. センシティブな情報が含まれていないか確認する
3. `pnpm lint` と `pnpm test` でエラーがないか確認する
4. 動作確認を行う

### PR 作成前

1. ユーザーから PR 作成の依頼があるか確認する
2. コンフリクトの恐れがないか確認する

### PR 作成後

1. コンフリクトが発生していないか確認する
2. PR 本文を日本語で、最新の状態のみを詳しく記載する
3. `gh pr checks` で CI の成功を確認する
4. Copilot レビュー等の指摘に対応する
