# osu! Hub API Worker

GitHub Pagesからosu! API v2の公開ユーザー情報・Recent ScoresへアクセスするためのCloudflare Workerです。

## 現行構成

```text
GitHub Actions
  └─ Client ID / Client Secret
      ↓ /oauth/token
  short-lived Access Token
      ↓ Cloudflare Worker Secret: OSU_ACCESS_TOKEN
Cloudflare Worker
      ↓ Authorization: Bearer <token>
osu! API v2
```

ブラウザとCloudflare Workerは `OSU_CLIENT_ID` / `OSU_CLIENT_SECRET` を保持しません。Client CredentialsはGitHub Repository Actions Secretsだけに保存し、Workerには短期Access Tokenだけを渡します。

## なぜこの構成か

旧方式ではCloudflare Worker自身からosu!へ接続していましたが、実運用で次の両方が429になりました。

- Worker → `/oauth/token`
- OAuthを避けたWorker → 公開プロフィール / Recent Scores Web Route

そのためCloudflareの共有送信元からToken発行を行わず、GitHub Actions runnerでClient Credentials Tokenを発行してからWorkerへ渡します。

osu!のClient Credentials Tokenは24時間の有効期間を返すため、`Refresh osu API Token` Workflowは12時間ごとに更新します。更新時はTokenをログへ出さずmaskし、osu! API v2で実認証してからCloudflare Secretへ保存します。

## 役割

- osu! API v2 `Get User` で公開プロフィール・Statisticsを取得
- `Get User Scores / recent` でRecent Scoresを1〜100件取得
- osu! Hub用JSONへ正規化
- 同一同期条件を60秒キャッシュ
- upstream 401 / 429 / timeout / 不正Responseを明示Error化
- `ALLOWED_ORIGINS`でブラウザOriginを制限

## エンドポイント

### `GET /health`

期待例:

```json
{
  "ok": true,
  "service": "osu-hub-api",
  "apiVersion": 1,
  "configured": true,
  "upstreamMode": "api-v2-preissued-token",
  "browserOAuthRequired": false,
  "tokenManagedBy": "github-actions"
}
```

`configured=false` は `OSU_ACCESS_TOKEN` がWorker Secretへ入っていない状態です。

### `GET /api/sync`

```text
/api/sync?user=12345678&mode=osu&limit=100&include_fails=1
```

- `user`: osu! User ID またはユーザー名
- `mode`: `osu`, `taiko`, `fruits`, `mania`
- `limit`: 1〜100
- `include_fails`: `1`でFailも含める

## GitHub Actions Secrets

Repository SettingsのActions Secretsで次を管理します。

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
OSU_CLIENT_ID
OSU_CLIENT_SECRET
```

用途は分離します。

- `CLOUDFLARE_*`: Worker deploy / Secret更新
- `OSU_CLIENT_ID` / `OSU_CLIENT_SECRET`: GitHub Actions runner上でTokenを発行する時だけ利用
- `OSU_ACCESS_TOKEN`: GitHubへ保存せず、実行時に生成してCloudflare Worker Secretへ送る

Client SecretをCloudflare Worker Secretへ保存しません。

## Workflow

### `Deploy osu Hub API Worker`

mainの `cloudflare/worker/**` またはdeploy Workflow変更時に実行します。

1. Workerをdeploy
2. `/health`で新しいupstream modeとToken設定を確認
3. 公開User ID 2で `/api/sync` を1件だけ実行
4. Worker → osu! API v2までのend-to-end成功を確認

### `Refresh osu API Token`

手動実行、Workflow変更時、12時間ごとのscheduleで実行します。

1. GitHub Actions Secretsを確認
2. GitHub Actions runnerから `/oauth/token` へClient Credentials Request
3. Access Tokenをmask
4. GitHub Actions runnerからosu! API v2 `Get User`でTokenを確認
5. `OSU_ACCESS_TOKEN`だけをCloudflare Worker Secretへ保存
6. Workerをredeploy
7. `/health` と `/api/sync` を再確認

Token更新に失敗した場合は新しい値で上書きしません。既存Tokenが有効な間はWorkerを利用できますが、24時間を超えて更新できない場合はWorkerが401を検知し、利用者には同期Tokenエラーとして返します。Local Results等は削除しません。

## ローカル開発

`.dev.vars.example` を参考に、Git管理対象外の `.dev.vars` へ一時Access Tokenを設定します。

```text
OSU_ACCESS_TOKEN=<short-lived access token>
```

Client ID / Client SecretをWorker Runtimeへ置く必要はありません。

```bash
cd cloudflare/worker
npm install
npm run dev
```

## Security / Privacy

- 実Access Token / Client SecretをGitへcommitしない
- Access Tokenをログへ表示しない
- Workerは任意URLを中継するProxyにしない
- 取得対象はosu!の公開プロフィール・公開スコアだけ
- 個人のResults保存先はBrowser IndexedDBで、GitHubへ自動送信しない
