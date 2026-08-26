# random-photo-server

`photos/` 以下の画像からランダムに1枚を選び、リサイズ・圧縮した上で配信する Web サーバーです。
`https://vrps.tomacheese.com` でホストし、VRChat ワールドに設置したフォトフレームからの表示を主な用途としています。

## 仕組み

- 起動時に `photos/` を走査し、`sharp` でリサイズ・圧縮した画像を `cache/` に保存します(`cache/manifest.json` で差分管理)。
- 起動後も `chokidar` で `photos/` を監視し、追加・変更・削除に追従して `cache/` を更新し続けます。
- `photos/` は HTTP からは一切公開されません。配信されるのは常に `cache/` 内の生成物です。

## エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/` | キャッシュ済み画像からランダムに1枚選び、画像バイナリを返す。リクエスト元 IP ごとに直近の重複を避ける |
| GET | `/portrait` | キャッシュ済み画像のうち縦長のものからランダムに1枚選び、画像バイナリを返す。アスペクト比が 0.95〜1.05 の正方形に近い画像は対象外。リクエスト元 IP ごとの直近重複回避は `/` と共有する |
| GET | `/landscape` | キャッシュ済み画像のうち横長のものからランダムに1枚選び、画像バイナリを返す。アスペクト比が 0.95〜1.05 の正方形に近い画像は対象外。リクエスト元 IP ごとの直近重複回避は `/` と共有する |
| GET | `/portrait/{photoframeId}` | 縦長画像のうち1枚を、リクエスト時刻と `photoframeId`(非負整数)から決定論的に選び返す。`BUCKET_WIDTH_SEC` 秒単位のバケットに時刻を切り捨てるため、同一バケット・同一 `photoframeId` であれば常に同じ画像になる。複数のフォトフレームで表示を同期させる用途 |
| GET | `/landscape/{photoframeId}` | `/portrait/{photoframeId}` の横長版 |
| GET | `/photos` | キャッシュ済み画像のサムネイル一覧を HTML で表示する。`?orientation=portrait` または `?orientation=landscape` で絞り込み可能 |
| GET | `/photos/:id` | `id`(`/photos` が表示する画像の識別子)を指定して該当する画像バイナリを1枚返す |
| GET | `/health` | キャッシュ準備状況と枚数を返すヘルスチェック |

## 環境変数

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `API_HOST` | `0.0.0.0` | 待受ホスト |
| `API_PORT` | `80` | 待受ポート |
| `PHOTOS_DIR` | `/photos` | 元画像ディレクトリ |
| `CACHE_DIR` | `/data/cache` | キャッシュディレクトリ |
| `MAX_EDGE_PX` | `2048` | リサイズ後の長辺の最大ピクセル数 |
| `OUTPUT_FORMAT` | `jpeg` | 出力フォーマット(現状 `jpeg` のみ対応) |
| `JPEG_QUALITY` | `82` | JPEG 品質(0〜100) |
| `DEDUPE_WINDOW_SEC` | `60` | 同一 IP への直近重複を避ける秒数 |
| `BUCKET_WIDTH_SEC` | `180` | `/portrait/{photoframeId}`・`/landscape/{photoframeId}` で同一画像を返す時間幅(秒)。86400 を割り切れる値のみ指定可能 |

## 開発

```bash
pnpm install
pnpm dev
```

## Docker での実行

```bash
cp .env.example .env
docker compose up --build
```

`photos/` はホスト側のディレクトリをそのまま読み取り専用でマウントします。写真の追加・変更・削除はコンテナを再起動しなくても自動的に反映されます。

## Lint / テスト

```bash
pnpm lint
pnpm test
```
