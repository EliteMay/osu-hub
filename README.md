# osu! Hub

osu!のプレイ記録、アカウント同期、AIコーチング、練習管理、統計、プレイヤー設定、Windows補助ツールをまとめる個人向けハブです。

- Web: GitHub Pages
- osu! API中継: Cloudflare Worker
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

osu! API Worker:

```text
https://osu-hub-api.k12m45k.workers.dev
```

Worker URLは公開Endpointです。osu! Client SecretやCloudflare API Tokenは公開ファイルへ保存しません。

## Account Sync

`pages/account.html` からCloudflare Worker経由でosu!api v2を利用します。

- osu! User IDまたはユーザー名
- ruleset
- Recent Scores 1〜100件
- Failスコアを含める設定
- `osu:<score id>` で重複整理
- 手入力Resultsは削除しない
- API同期Resultの手動メモは再同期で維持
- Browser timeout 15秒 / Worker upstream timeout 12秒
- Worker ResponseをBrowser側でもValidation

### Rate limit対策

osu!公式の利用方針に合わせ、APIを必要以上に再取得しません。

- OAuth access tokenはWorkerのメモリ + Cloudflare Cache APIで有効期限まで再利用
- 同一Isolateの同時Token取得は1回へ集約
- 同じ同期条件は60秒キャッシュ
- OAuth / APIの429は明示的に扱い、Retry-Afterがある場合は利用者へ返す

短時間に「今すぐ同期」を連打しても、同じユーザーのosu! API取得を毎回行わない設計です。

## Cloudflare Worker

Workerソース:

```text
cloudflare/worker/
├─ src/index.js
├─ wrangler.toml
├─ package.json
├─ .dev.vars.example
└─ README.md
```

Repository Secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
OSU_CLIENT_ID
OSU_CLIENT_SECRET
```

`Deploy osu Hub API Worker` は手動実行に加え、mainの `cloudflare/worker/**` またはdeploy workflow変更時にも自動deployします。deploy後は `/health` でWorker稼働とSecret設定状態を確認します。

## AI Coaching

1. リザルト画像を複数追加
2. セッション名、目的、本人メモを入力
3. ChatGPT提出用ZIPを生成
4. ChatGPTへアップロード
5. 返却Schema v1 JSONをWebへ取り込む

AI返却JSONはValidation後に保存します。JSZip CDNが利用できない場合はJSON/TXT個別出力へFallbackします。

## Results / Stats / Practice / Settings

- Results: API同期 + 手入力履歴
- Stats: 平均ACC、平均Miss、最高PP、直近ACC、MOD別集計
- Practice: 練習内容・時間・完了管理
- Settings: DPI、感度、Tablet Area、JSON Backup / Import

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

`tests/validate-web.mjs` / `Check web` では、JS/JSON/HTML、Version、Project Profile、Secret混入、Import Recovery、Worker HTTPS/timeout、OAuth rate-limit guard、Worker CD設定などを確認します。

## 崩してはいけない仕様

- Secretを公開コードへ入れない
- 個人プレイデータをGitHubへ自動送信しない
- 手入力ResultsをAPI同期で削除しない
- 同一osu! Score IDの重複を増やさない
- IndexedDBとJSON Backup / Importを維持する
- API停止時もLocal機能を使えるようにする
- AI Coachingに有料APIを必須化しない
- Electron Launcherを削除しない

## 未確認 / 今後

- OAuth 429修正後の実osu!アカウントRecent Scores同期
- Account Sync → Results → Statsの実ブラウザE2E
- Backup / Import / Rollbackの実ブラウザE2E
- Recent Scoresの過去全履歴ページング同期
- 同期済みResultsをAI Coachingへ直接選択して含める機能
- Windows実機でのSetup Launcher確認
- Setup.exe初回GitHub Release
- Root Electron / Cloudflare Workerの `package-lock.json` は次回dependency導入・更新時に実package managerで生成する

未確認項目は確認済みとして扱いません。
