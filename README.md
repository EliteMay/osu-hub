# osu! Hub

osu!のプレイ記録、アカウント同期、AIコーチング、練習管理、統計、プレイヤー設定、Windows補助ツールをまとめる個人向けハブです。

- Web: GitHub Pages
- osu!公開データ中継: Cloudflare Worker
- 同期Token管理: GitHub Actions
- Windows固有操作: Electron製 `osu Setup Launcher`
- Webユーザーデータ: Browser IndexedDB

## Project Guide

`EliteMay/web-project-guide` **Guide Version 1.2.0** を採用しています。

Project Profile:

```text
STATIC + DATA + AI-HANDOFF + CLOUD + ELECTRON + TOOL
```

正本は `project-meta.json`。Web Versionは `data/site.json#siteVersion`、Web Storage Schemaは `js/storage.js#SCHEMA_VERSION`、Desktop Versionは `package.json#version` です。

## 公開URL

Web:

```text
https://elitemay.github.io/osu-hub/
```

osu! Sync Worker:

```text
https://osu-hub-api.k12m45k.workers.dev
```

Worker URLは公開Endpointです。Cloudflare API Token、osu! Client Secret、Access Token等の秘密情報は公開ファイルへ保存しません。

## Account Sync

`pages/account.html` からCloudflare Worker経由で、osu! API v2の公開プロフィール情報とRecent Scoresを同期します。

- osu! User IDまたはユーザー名
- ruleset
- Recent Scores 1〜100件
- Failスコアを含める設定
- `osu:<score id>` で重複整理
- 手入力Resultsは削除しない
- 同期Resultの手動メモは再同期で維持
- Browser timeout 15秒 / Worker upstream timeout 12秒
- Worker ResponseをBrowser側でもValidation

### Pre-issued Token方式

Cloudflare Worker自身は `/oauth/token` を呼びません。

```text
GitHub Actions
  ↓ Client Credentials
osu! /oauth/token
  ↓ short-lived Access Token
Cloudflare Worker Secret: OSU_ACCESS_TOKEN
  ↓ Bearer Token
osu! API v2
```

`OSU_CLIENT_ID` / `OSU_CLIENT_SECRET` はGitHub Repository Actions Secretsだけで管理します。ブラウザには入力欄を置かず、Cloudflare WorkerにもClient Secretを保存しません。

Client Credentials Tokenはosu!から24時間の有効期間が返るため、`Refresh osu API Token` Workflowで12時間ごとに更新します。Token発行後はGitHub Actions runnerからosu! API v2へ実リクエストして有効性を確認してからWorker Secretへ保存します。

### 429対策の経緯

実運用では次の2経路でCloudflare Workerからosu!への429を再現しました。

1. Worker → Client Credentials `/oauth/token`
2. OAuthを避けたWorker → 公開プロフィール / Recent Scores Web Route

そのためToken発行元をCloudflareの外へ移し、Workerは発行済みBearer Tokenで正式なosu! API v2だけを利用する構成へ変更しました。

同じ `user / mode / limit / include_fails` 条件は60秒キャッシュし、短時間の連打で上流を毎回取得しません。上流401 / 429 / timeout時は既存Localデータを削除せずErrorとして返します。

## Cloudflare Worker / GitHub Actions

Workerソース:

```text
cloudflare/worker/
├─ src/index.js
├─ wrangler.toml
├─ package.json
├─ .dev.vars.example
└─ README.md
```

GitHub Actions Secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
OSU_CLIENT_ID
OSU_CLIENT_SECRET
```

用途:

- `CLOUDFLARE_*`: Worker deploy / Worker Secret更新
- `OSU_CLIENT_ID` / `OSU_CLIENT_SECRET`: GitHub Actions runnerでAccess Tokenを発行する時だけ使用
- `OSU_ACCESS_TOKEN`: Workflow実行中に生成し、GitHubへ保存せずCloudflare Worker Secretへ送信

### Deploy osu Hub API Worker

mainのWorkerコード変更時に自動deployし、deploy後に:

- `/health`
- `/api/sync?user=2&mode=osu&limit=1...`

を実行してWorker → osu! API v2までend-to-endで確認します。

### Refresh osu API Token

- 手動実行
- Workflow自身の変更時
- 12時間ごとのschedule

でTokenを更新します。発行Tokenはmaskされ、直接osu! API v2で検証後にCloudflareへ保存されます。Client SecretはWorkerへ送りません。

## AI Coaching

1. リザルト画像を複数追加
2. セッション名、目的、本人メモを入力
3. ChatGPT提出用ZIPを生成
4. ChatGPTへアップロード
5. 返却Schema v1 JSONをWebへ取り込む

AI返却JSONはValidation後に保存します。JSZip CDNが利用できない場合はJSON/TXT個別出力へFallbackします。

## Results / Stats / Practice / Settings

- Results: osu!同期 + 手入力履歴
- Stats: 平均ACC、平均Miss、最高PP、直近ACC、MOD別集計
- Practice: 練習内容・時間・完了管理
- Settings: DPI、感度、Tablet Area、JSON Backup / Import

外部同期が停止してもLocal機能は利用できます。

## Backup / Import / Recovery

WebユーザーデータはIndexedDB `osuHubDB` に保存します。

```text
results
coaching
practice
settings
```

Importは `parse → validation → recovery snapshot → transaction write → read-back verification → failure時rollback` の順で処理します。現在は完全置換ではなくMerge方式です。

## Desktop Tools

既存の `osu Setup Launcher v0.17.0` は削除せず継続します。

- 音声出力切替
- OpenTabletDriver起動
- REAL等の遅延対策アプリ起動
- osu!lazer自動検出 / 起動

Windows固有処理は実Windowsで未確認の項目を確認済み扱いしません。

## GitHub Pages / CI

Pages ArtifactはWebファイルだけを公開します。Cloudflare Workerソース、Electronソース、bat、Secretファイルは含めません。

`tests/validate-web.mjs` / `Check web` では、JS/JSON/HTML、Version、Project Profile、Secret混入、Import Recovery、Worker HTTPS/timeout、API v2 Bearer Token方式、Token更新Workflow、60秒Cache、401 / 429処理、Worker deploy E2Eなどを確認します。

## 崩してはいけない仕様

- Secretを公開コードへ入れない
- osu! Client SecretをCloudflare Workerへ保存しない
- 個人プレイデータをGitHubへ自動送信しない
- 手入力Resultsを同期で削除しない
- 同一osu! Score IDの重複を増やさない
- IndexedDBとJSON Backup / Importを維持する
- 外部同期停止時もLocal機能を使えるようにする
- AI Coachingに有料APIを必須化しない
- Electron Launcherを削除しない
- 外部Responseが想定形式でない場合に不正データを保存しない

## 未確認 / 今後

- Web 0.2.5公開後のユーザー自身の実ブラウザAccount Sync → Results → Stats E2E
- Backup / Import / Rollbackの実ブラウザE2E
- Recent Scoresの過去全履歴ページング同期
- 同期済みResultsをAI Coachingへ直接選択して含める機能
- Windows実機でのSetup Launcher確認
- Setup.exe初回GitHub Release
- Root Electron / Cloudflare Workerの `package-lock.json` は次回dependency導入・更新時に実package managerで生成する

未確認項目は確認済みとして扱いません。
