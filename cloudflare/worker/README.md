# osu! Hub API Worker

GitHub Pagesからosu!の公開プロフィール・Recent ScoresへアクセスするためのCloudflare Workerです。

## 役割

- osu!の公開プロフィールページからユーザー情報・Statisticsを取得する
- osu!公式Webが利用する公開Recent Scores経路から1〜100件を取得する
- osu! Hubで扱いやすいJSONへ正規化する
- 同一同期条件を60秒キャッシュし、上流への過剰アクセスを避ける
- ブラウザからのアクセス元を`ALLOWED_ORIGINS`で制限する

Account Syncではosu! OAuth Client Credentialsを使用しません。`OSU_CLIENT_ID` / `OSU_CLIENT_SECRET`は不要です。

## なぜOAuthを使わないか

Cloudflare Workerから`/oauth/token`へClient Credentials Tokenを取得する構成では、Cloudflare側の共有送信元とosu!側のToken Endpoint Rate Limitの組み合わせにより429が継続する場合がありました。

現在はosu!の公開プロフィール画面と、osu!公式Web自身が利用する公開Recent Scores経路を利用します。Client Secretを扱わずに済み、Token EndpointのRate Limitにも依存しません。

この経路は公開Web実装への依存があるため、osu!側のHTML属性・Web Route仕様が変更された場合はWorker側の追従が必要です。Response Validationと明示的なError処理を維持します。

## エンドポイント

### `GET /health`

期待例:

```json
{
  "ok": true,
  "service": "osu-hub-api",
  "apiVersion": 1,
  "configured": true,
  "upstreamMode": "public-web",
  "oauthRequired": false
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

## GitHub Actionsから本番deploy

`.github/workflows/deploy-worker.yml` は手動実行に加え、mainの `cloudflare/worker/**` またはWorkflow自身を変更したときに自動deployします。

GitHub Repository SettingsのActions Secretsで必要なのは次の2つです。

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Workflowは:

1. Cloudflare Secretの存在確認
2. `cloudflare/wrangler-action@v4` でdeploy
3. deploy先 `/health` を確認
4. `upstreamMode: public-web` / `oauthRequired: false` を検証
5. GitHub Actions SummaryへWorker URLを表示

までを行います。

以前設定した `OSU_CLIENT_ID` / `OSU_CLIENT_SECRET` がGitHub / Cloudflare側に残っていても、現行Workerは参照しません。

## 手動deploy fallback

GitHub Actionsを使わない場合はローカルから実行できます。

```bash
cd cloudflare/worker
npm install
npx wrangler login
npm run deploy
```

osu!のSecret設定は不要です。

デプロイ後に表示されたWorker URLをosu! Hubの`Account Sync`ページへ入力します。

```text
https://osu-hub-api.<subdomain>.workers.dev
```

本番URLは `data/site.json` の `osuApi.workerUrl` を正本としてGitHub Pages側の既定値にします。

## ローカル開発

```bash
cd cloudflare/worker
npm install
npm run dev
```

`ALLOWED_ORIGINS`は `wrangler.toml` で管理します。秘密情報は不要です。

## 公開範囲 / 注意

Workerは公開プロフィール・公開スコアのみを取得します。osu!アカウントへのログイン操作やプレイ操作は行いません。

公開Web経路はosu!api v2の正式なOAuth API Endpointとは異なり、osu! Web実装変更の影響を受けます。そのため、取得失敗時に無理なFallbackやScraping範囲拡大を行わず、Errorとして利用者へ返して保守時に追従します。
