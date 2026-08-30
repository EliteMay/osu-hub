# osu! Hub

osu!のプレイ記録、アカウント同期、AIコーチング、練習管理、統計、プレイヤー設定、Windows補助ツールを1か所にまとめる個人向けハブです。

- Web: GitHub Pagesで動く静的HTML / CSS / JavaScript
- osu! API中継: Cloudflare Worker
- Windows固有操作: Electron製 `osu Setup Launcher`
- Webユーザーデータ: Browser IndexedDB

## Project Guide

このプロジェクトは `EliteMay/web-project-guide` **Guide Version 1.2.0** を採用しています。

Project Profile:

```text
STATIC + DATA + AI-HANDOFF + CLOUD + ELECTRON + TOOL
```

採用Version、Profile、Runtime方針は `project-meta.json` に記録します。

### Source of Truth

- Web Version: `data/site.json` の `siteVersion`
- Web Storage Schema: `js/storage.js` の `SCHEMA_VERSION`
- Desktop Launcher Version: `package.json` の `version`
- Desktop更新情報: `version.json`

Desktop Versionの派生値はCIで一致を検査します。正式Runtimeは `js/app.js`、`js/storage.js`、`js/osu-sync.js` 等の安定Pathを使い、Version別Runtime Folderを増やしません。

## 目的

- osu!アカウントからRecent Scoresを自動取得する
- 手入力とAPI同期のResultsを同じ場所で管理する
- 複数リザルトやプレイデータをChatGPTへ渡しやすくする
- Accuracy / Miss / PP / MODなどの変化を見る
- 練習内容と設定を保存する
- Setup LauncherをDesktop Toolとして残す

## Web版

現在のWeb Versionは `data/site.json` を参照してください。HTMLへVersion番号を個別に直書きせず、`js/site-meta.js` が表示へ反映します。

### Account Sync

`pages/account.html` からCloudflare Worker経由でosu!api v2を利用します。

- osu! User IDまたはユーザー名を指定
- rulesetを選択
- Recent Scoresを1〜100件取得
- Failスコアを含めるか選択
- 取得したスコアをIndexedDBの `results` へ保存
- `osu:<score id>` をキーに重複を整理
- 既存同期スコアは再取得時に更新
- 手入力の `note` は同期更新で消さない
- Browser側15秒、Worker上流側12秒のtimeout
- Worker ResponseをBrowser側でもValidation

本番Worker URLが未設定の場合、Homeでは `SETUP REQUIRED` と表示します。BrowserにWorker URLが保存済みなら `READY` と表示します。

保存する主な値:

- Accuracy / Miss / Combo / PP
- Star Rating / BPM / AR / OD / CS / HP
- MOD / Rank / Pass / Fail
- Replay有無
- Beatmap / Beatmapset ID
- プレイ日時

### AI Coaching

1. リザルト画像を複数ドラッグ&ドロップ
2. セッション名、目的、本人メモを入力
3. `提出ZIPを作成`
4. ZIPをChatGPTへアップロード
5. ChatGPTが返したSchema v1 JSONをWebへ取り込む

AI返却JSONは `schemaVersion`、文字列配列、練習提案形式を検証してから保存します。画像は1枚20MBまで、最大100枚です。

JSZip CDNが利用できない場合は、`coaching_manifest.json` と `prompt.txt` を個別出力するFallbackがあります。

### Results / Stats / Practice / Settings

- Results: API同期 + 手入力の履歴
- Stats: 平均ACC、平均Miss、最高PP、直近ACC、MOD別集計
- Practice: 練習内容・時間・完了管理
- Settings: DPI、感度、Tablet Area、JSONバックアップ / Import

StatsやDesktop Toolsに表示している「開発予定」は未実装機能として明記し、完成済みのようには扱いません。

## Backup / Import / Recovery

WebユーザーデータはブラウザのIndexedDB `osuHubDB` に保存します。

```text
results
coaching
practice
settings
```

Backup JSON:

- `schemaVersion: 1`
- Import前に全Store / Record / ID / 数値範囲をValidation
- 想定外Storeと巨大Recordを拒否
- osu! API Resultは `osuScoreId` と `id=osu:<score id>` の整合性を確認
- Import開始前に現在データをRecovery Snapshotとして取得
- 複数Storeを1 IndexedDB transactionで反映
- Import後に対象Recordを読み戻して検証
- Verification失敗時はRecovery Snapshotから全StoreをRollback
- transaction失敗時はIndexedDBのatomicityにより途中状態をcommitしない

現在のUI Importは既存データを全clearする完全Restoreではなく、同じKeyを更新し、新規Keyを追加するMerge方式です。同じKeyを更新するためRecovery / Rollback対象として扱います。

ブラウザデータ削除に備えてSettingsから定期的にJSONを書き出してください。

## osu! API / Cloudflare Worker

Workerソース:

```text
cloudflare/worker/
├─ src/index.js
├─ wrangler.toml
├─ package.json
├─ .dev.vars.example
└─ README.md
```

Cloudflare Secret:

```text
OSU_CLIENT_ID
OSU_CLIENT_SECRET
```

これらはGitHub Pages、`data/site.json`、公開JavaScriptへ書きません。

Workerは任意URLを中継する汎用Proxyではなく、osu! Hubに必要な `/health` と `/api/sync` のみを提供します。

## Desktop Tools

既存の `osu Setup Launcher v0.17.0` は削除せず継続します。

- 音声出力切替
- OpenTabletDriver起動
- REAL等の遅延対策アプリ起動
- osu!lazer自動検出 / 起動

Windows固有処理は静的コード確認だけで動作確認済みとは扱いません。

## GitHub Pages

公開URL:

```text
https://elitemay.github.io/osu-hub/
```

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

`.github/workflows/check-web.yml` は `main` pushとPull Requestで実行します。

主な検査:

- JavaScript / MJS構文
- JSON構文
- HTMLローカル参照切れ / ID重複
- `label` / Navigation基本Accessibility
- Web Version直書き再混入
- Project Profile / Guide Version
- Desktop Version整合
- Production Worker HTTPS / timeout設定
- Mobile Navigation非表示の再発
- `focus-visible` / reduced-motion
- 公開WebへのSecret値混入
- `.env` / `.dev.vars`誤追跡
- Version付きRuntime Path再混入
- Stable RuntimeでのMutationObserver DOM Patch再混入
- Import Recovery / Read-back Verification / Rollback Guard

## ファイル構成

```text
index.html
pages/
  account.html
  coaching.html
  results.html
  practice.html
  stats.html
  settings.html
  tools.html
css/
  styles.css
js/
  storage.js
  app.js
  osu-sync.js
  site-meta.js
data/
  site.json
  config.json
cloudflare/
  worker/
desktop/
  setup-launcher/
src/                         # Electron Launcher本体
tools/                       # Desktop Launcher補助
tests/
  validate-web.mjs
project-meta.json
.github/workflows/
  pages.yml
  check-web.yml
  build-windows.yml
package.json
version.json
CHANGELOG.md
仕様書.md
作業報告書.md
```

## 崩してはいけない仕様

### Web / API

- osu! Client Secretを公開コードへ入れない
- `.dev.vars` / `.env`をGitへコミットしない
- 個人プレイデータをGitHubへ自動送信しない
- GitHub Pages配下でも相対パスを維持する
- 手入力ResultsをAPI同期で削除しない
- 同一osu! Score IDの重複を増やさない
- IndexedDB保存とJSON Backup / Importを維持する
- AI Coachingは有料APIを必須にしない
- APIが停止しても手入力Results等のLocal機能は利用可能にする
- Stable RuntimeをVersion別Folderへコピーして増やさない
- 自前DOMをMutationObserverで後付け完成させない

### Desktop

- 音声切替 → OpenTabletDriver → 遅延対策アプリ → osu!lazer の一括起動
- osu!本体の自動操作やプレイ補助を行わない
- 更新時にユーザー設定を意図せず消さない
- 外部ツールexeや秘密情報を公開リポジトリへ直接含めない

## 既知の問題 / 未確認

- Cloudflare Workerはまだ本番deploy未確認
- osu! OAuth Client ID / Secretの本番設定は未確認
- 実アカウントでRecent Scores同期は未確認
- Account Sync → Results → Statsの実ブラウザE2Eは未確認
- Backup → Import → 再読込 / Rollbackの実ブラウザE2Eは未確認
- API同期はRecent Scores最大100件。過去全履歴のページング同期は未実装
- AI Coachingへ同期済みResultsを直接選択して含める機能は未実装
- Windows実機でのSetup Launcher音声切替問題は継続確認が必要
- GitHub ReleasesのSetup.exe初回配布は未実施
- Root Electron / Cloudflare Workerの `package-lock.json` は未管理。次回dependency導入・更新時に生成してcommitする

未確認項目は確認済みとして扱いません。
