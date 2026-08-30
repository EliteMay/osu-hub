# osu! Hub

osu!のプレイ記録、アカウント同期、AIコーチング、練習管理、統計、プレイヤー設定、Windows補助ツールをまとめる個人向けハブです。

- Web: GitHub Pages
- osu!公開データ中継: Cloudflare Worker
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

Worker URLは公開Endpointです。Cloudflare API Token等の秘密情報は公開ファイルへ保存しません。

## Account Sync

`pages/account.html` からCloudflare Worker経由で、osu!の公開プロフィール情報とRecent Scoresを同期します。

- osu! User IDまたはユーザー名
- ruleset
- Recent Scores 1〜100件
- Failスコアを含める設定
- `osu:<score id>` で重複整理
- 手入力Resultsは削除しない
- 同期Resultの手動メモは再同期で維持
- Browser timeout 15秒 / Worker upstream timeout 12秒
- Worker ResponseをBrowser側でもValidation

### OAuthを使わない同期方式

Account Syncでは `OSU_CLIENT_ID` / `OSU_CLIENT_SECRET` を使用しません。

従来はWorkerからClient Credentialsで `/oauth/token` を取得していましたが、実運用でosu! OAuth Token Endpointの429が継続しました。現在は、osu!の公開プロフィールページに埋め込まれた公開ユーザー情報と、osu!公式Web自身が利用する公開Recent Scores経路をWorkerから取得します。

これによりClient Secretを扱わず、OAuth Token EndpointのRate Limitにも依存しません。

同じ `user / mode / limit / include_fails` 条件は60秒キャッシュし、短時間の連打で上流を毎回取得しない設計です。上流429では `Retry-After` があれば利用者へ返します。

### 外部仕様への依存

公開Recent Scores経路とプロフィールHTMLはosu! Web実装への依存です。osu!側でRouteや `data-initial-data` の構造が変更された場合はWorkerの追従が必要です。

このためWorkerではResponse Validationを行い、想定形式でなければ既存Localデータを壊さずErrorとして返します。

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

GitHub Actionsで必要なRepository Secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

`Deploy osu Hub API Worker` は手動実行に加え、mainの `cloudflare/worker/**` またはdeploy workflow変更時にも自動deployします。deploy後は `/health` で `upstreamMode: public-web` と `oauthRequired: false` を検証します。

以前登録したosu! Client ID / SecretがGitHubまたはCloudflare側に残っていても、現行Account Sync Workerは参照しません。

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

`tests/validate-web.mjs` / `Check web` では、JS/JSON/HTML、Version、Project Profile、Secret混入、Import Recovery、Worker HTTPS/timeout、公開プロフィール同期経路、60秒Cache、429処理、Worker CD設定などを確認します。

## 崩してはいけない仕様

- Secretを公開コードへ入れない
- 個人プレイデータをGitHubへ自動送信しない
- 手入力Resultsを同期で削除しない
- 同一osu! Score IDの重複を増やさない
- IndexedDBとJSON Backup / Importを維持する
- 外部同期停止時もLocal機能を使えるようにする
- AI Coachingに有料APIを必須化しない
- Electron Launcherを削除しない
- 公開Web同期経路の形式が変わった場合に不正データを保存しない

## 未確認 / 今後

- Web 0.2.4公開後の実osu!アカウントRecent Scores同期
- Account Sync → Results → Statsの実ブラウザE2E
- Backup / Import / Rollbackの実ブラウザE2E
- Recent Scoresの過去全履歴ページング同期
- 同期済みResultsをAI Coachingへ直接選択して含める機能
- Windows実機でのSetup Launcher確認
- Setup.exe初回GitHub Release
- Root Electron / Cloudflare Workerの `package-lock.json` は次回dependency導入・更新時に実package managerで生成する

未確認項目は確認済みとして扱いません。
