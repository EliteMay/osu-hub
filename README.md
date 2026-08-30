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

採用Version、Profile、Runtime方針は `project-meta.json` に記録します。

## Source of Truth

- Web Version: `data/site.json#siteVersion`
- Web Storage Schema: `js/storage.js#SCHEMA_VERSION`
- Desktop Launcher Version: `package.json#version`
- Desktop更新情報: `version.json`

Webの正式Runtimeは `js/app.js`、`js/storage.js`、`js/osu-sync.js`、`js/site-meta.js` 等の安定Pathを利用します。

## 公開URL

Web:

```text
https://elitemay.github.io/osu-hub/
```

osu! API Worker:

```text
https://osu-hub-api.k12m45k.workers.dev
```

Worker URLは公開Endpointであり、秘密情報ではありません。osu! Client SecretやCloudflare API Tokenは公開ファイルへ保存しません。

## Account Sync

`pages/account.html` からCloudflare Worker経由でosu!api v2を利用します。

- osu! User IDまたはユーザー名を指定
- ruleset選択
- Recent Scoresを1〜100件取得
- Failスコアを含める設定
- `osu:<score id>` をキーに重複整理
- API同期済みResultは再同期時に更新
- 手入力Resultは削除しない
- API Resultへ付けた手動メモは同期更新で維持
- Browser側15秒、Worker上流側12秒のtimeout
- Worker ResponseをBrowser側でもValidation

本番Worker URLは `data/site.json` に設定済みです。Home / Account Syncは既定でこのWorkerを利用します。

保存する主な値:

- Accuracy / Miss / Combo / PP
- Star Rating / BPM / AR / OD / CS / HP
- MOD / Rank / Pass / Fail
- Replay有無
- Beatmap / Beatmapset ID
- プレイ日時

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

GitHub Actionsの `Deploy osu Hub API Worker` から本番deployできます。

Repository Secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
OSU_CLIENT_ID
OSU_CLIENT_SECRET
```

これらの秘密値はGitHub Pages、`data/site.json`、公開JavaScriptへ書きません。

2026-08-30時点で本番deployは成功し、Workflowによる `/health` 確認でWorker稼働とosu! OAuth Secret設定済みを確認しています。

Workerは任意URLを中継する汎用Proxyではなく、osu! Hubに必要な `/health` と `/api/sync` のみを提供します。

## AI Coaching

1. リザルト画像を複数追加
2. セッション名、目的、本人メモを入力
3. ChatGPT提出用ZIPを生成
4. ChatGPTへアップロード
5. 返却されたSchema v1 JSONをWebへ取り込む

AI返却JSONはSchemaを検証してから保存します。画像は1枚20MBまで、最大100枚です。JSZip CDNが利用できない場合はJSON/TXT個別出力へFallbackします。

## Results / Stats / Practice / Settings

- Results: API同期 + 手入力履歴
- Stats: 平均ACC、平均Miss、最高PP、直近ACC、MOD別集計
- Practice: 練習内容・時間・完了管理
- Settings: DPI、感度、Tablet Area、JSON Backup / Import

未実装機能は画面上でも開発予定として明示し、完成済み扱いしません。

## Backup / Import / Recovery

WebユーザーデータはIndexedDB `osuHubDB` に保存します。

```text
results
coaching
practice
settings
```

Importでは以下を行います。

```text
parse
→ payload / record validation
→ current recovery snapshot
→ transaction write
→ read-back verification
→ failure時rollback
```

現在のImportは完全置換ではなくMerge方式です。同じKeyは更新し、新規Keyは追加します。

## Desktop Tools

既存の `osu Setup Launcher v0.17.0` は削除せず継続します。

- 音声出力切替
- OpenTabletDriver起動
- REAL等の遅延対策アプリ起動
- osu!lazer自動検出 / 起動

Windows固有処理は実Windowsで未確認の項目を確認済み扱いしません。

## GitHub Pages

`.github/workflows/pages.yml` ではWebファイルだけを公開します。

```text
index.html
pages/
css/
js/
data/site.json
```

Cloudflare Workerソース、Electronソース、bat、SecretファイルはPages Artifactへ含めません。

## 自動チェック

`.github/workflows/check-web.yml` はmain pushとPull Requestで実行します。

主な検査:

- JavaScript / JSON構文
- HTMLローカル参照切れ / ID重複
- Accessibility基本項目
- Web Version直書き再混入
- Project Profile / Guide Version
- Desktop Version整合
- Production Worker HTTPS / timeout設定
- Secret値・Secret file誤追跡
- Version付きRuntime Path再混入
- MutationObserver DOM Patch再混入
- Import Recovery / Verification / Rollback Guard

## 崩してはいけない仕様

### Web / API

- osu! Client Secret / Cloudflare API Tokenを公開コードへ入れない
- 個人プレイデータをGitHubへ自動送信しない
- 手入力ResultsをAPI同期で削除しない
- 同一osu! Score IDの重複を増やさない
- IndexedDBとJSON Backup / Importを維持する
- AI Coachingに有料APIを必須化しない
- API停止時も手入力等のLocal機能を使えるようにする
- Stable RuntimeをVersion別Folderへコピーして増やさない

### Desktop

- 音声切替 → OpenTabletDriver → 遅延対策アプリ → osu!lazer の一括起動
- osu!本体の自動操作・プレイ補助を行わない
- 更新時にユーザー設定を意図せず消さない
- 外部ツールexeや秘密情報を公開Repositoryへ直接含めない

## 未確認 / 今後

- 実osu!アカウントでRecent Scores同期
- Account Sync → Results → Statsの実ブラウザE2E
- Backup → Import → 再読込 / Rollbackの実ブラウザE2E
- API同期はRecent Scores最大100件。過去全履歴のページング同期は未実装
- AI Coachingへ同期済みResultsを直接選択して含める機能は未実装
- Windows実機でのSetup Launcher音声切替問題
- GitHub ReleasesのSetup.exe初回配布
- Root Electron / Cloudflare Workerの `package-lock.json` は未管理。次回dependency導入・更新時に実package managerで生成する

未確認項目は確認済みとして扱いません。
