# osu! Hub API Worker

GitHub Pagesからosu!api v2へ安全にアクセスするためのCloudflare Workerです。

## 役割

- `OSU_CLIENT_ID` / `OSU_CLIENT_SECRET`をGitHub Pagesへ公開しない
- Client Credentials Grantで`public`スコープのアクセストークンを取得する
- osu!ユーザーのRecent Scoresを取得する
- osu! Hubで扱いやすいJSONへ正規化する
- ブラウザからのアクセス元を`ALLOWED_ORIGINS`で制限する

## エンドポイント

### `GET /health`

Workerの稼働とosu! OAuth Secret設定の有無を返します。Secret値そのものは返しません。

期待例:

```json
{
  "ok": true,
  "service": "osu-hub-api",
  "apiVersion": 1,
  "configured": true
}
```

### `GET /api/sync`

例:

```text
/api/sync?user=12345678&mode=osu&limit=100&include_fails=1
```

パラメータ:

- `user`: osu! User ID またはユーザー名
- `mode`: `osu`, `taiko`, `fruits`, `mania`
- `limit`: 1〜100
- `include_fails`: `1`でFailも含める

## osu! OAuth Application

osu!のAccount SettingsからOAuth Applicationを登録します。

Client Credentialsだけを使うため、Callback URLは空欄で構いません。

取得したClient Secretはパスワードと同様に扱い、GitHubの通常ファイル、HTML、JavaScript、チャット等へ貼らないでください。

## 推奨: GitHub Actionsから本番deploy

`.github/workflows/deploy-worker.yml` を手動実行して本番Workerをdeployできます。

GitHub Repository SettingsのActions Secretsへ次の4つを登録します。

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
OSU_CLIENT_ID
OSU_CLIENT_SECRET
```

`CLOUDFLARE_API_TOKEN` はCloudflare公式のWorkers編集用Tokenを使い、対象Accountへ必要最小限にScopeしてください。

Workflowは:

1. 必須Secretの存在確認
2. `cloudflare/wrangler-action@v4` でdeploy
3. `OSU_CLIENT_ID` / `OSU_CLIENT_SECRET` をWorker Secretとして反映
4. deploy先 `/health` を確認
5. GitHub Actions SummaryへWorker URLを表示

までを行います。

Workflowは初期設定中の誤deployを避けるため、現時点では `workflow_dispatch` の手動実行のみです。

## 手動deploy fallback

GitHub Actionsを使わない場合はローカルから実行できます。

```bash
cd cloudflare/worker
npm install
npx wrangler login
npx wrangler secret put OSU_CLIENT_ID
npx wrangler secret put OSU_CLIENT_SECRET
npm run deploy
```

デプロイ後に表示されたWorker URLをosu! Hubの`Account Sync`ページへ入力します。

例:

```text
https://osu-hub-api.<subdomain>.workers.dev
```

本番URLが確定したら `data/site.json` の `osuApi.workerUrl` へ反映し、GitHub Pages側の既定値として使います。

## ローカル開発

`cloudflare/worker/.dev.vars`を作成します。

```dotenv
OSU_CLIENT_ID="12345"
OSU_CLIENT_SECRET="secret-value"
```

`.dev.vars`はGitへコミットしないでください。

```bash
npm run dev
```

## 公開範囲

Workerはosu!の公開プロフィール・公開スコアだけを取得します。osu!アカウントへのログイン操作やプレイ操作は行いません。
