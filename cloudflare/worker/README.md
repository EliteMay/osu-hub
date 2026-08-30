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

取得したClient Secretはパスワードと同様に扱い、GitHubやHTML/JavaScriptへ書かないでください。

## Cloudflareへ設定

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
