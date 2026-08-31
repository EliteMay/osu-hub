# osu! Hub

osu!のプレイ記録、アカウント同期、AIコーチング、練習管理、統計、プレイヤー設定、Windows補助ツールをまとめる個人向けハブです。

- Web: GitHub Pages
- osu! API中継: Supabase Edge Function
- 同期Token管理: GitHub Actions + Supabase RLS保護テーブル
- Windows固有操作: Electron製 `osu Setup Launcher`
- Webユーザーデータ: Browser IndexedDB

## Project Guide

`EliteMay/web-project-guide` **Guide Version 1.3.0** を採用しています。

Project Profile:

```text
STATIC + DATA + AI-HANDOFF + CLOUD + ELECTRON + TOOL
```

正本:

- Web Version: `data/site.json#siteVersion`
- Web Storage Schema: `js/storage.js#SCHEMA_VERSION`
- Desktop Version: `package.json#version`
- Desktop Update Metadata: `version.json`
- Supabase Edge Function source: `supabase/functions/osu-sync/index.ts`
- Supabase DB migration: `supabase/migrations/`

## 公開URL

Web:

```text
https://elitemay.github.io/osu-hub/
```

Account Sync API:

```text
https://vtnwbgejlaqpnwmlzbjy.supabase.co/functions/v1/osu-sync
```

Edge Function URLは公開Endpointです。osu! Client SecretやAccess TokenはGitHub Pagesへ保存しません。

## Account Sync

`pages/account.html` からSupabase Edge Function経由でosu! API v2の公開プロフィール情報とスコアを同期します。

### Recent Plays

- osu!のRecent Playsは**直近24時間**
- 1〜100件取得
- Failを含める / 含めないを選択可能
- Account Sync画面を開いている間は、既定で5分以上空いたときRecentを自動同期
- ブラウザを閉じている間は自動同期しない

### Best Scores

- 自己ベスト上位を1〜100件取得
- 古いBestもResultsへ追加できる
- Bestは成功スコアのみなのでFail設定は使用しない

### 蓄積ルール

- Result IDは `osu:<score id>`
- 同一Score IDは増やさず更新
- 手入力Resultsは削除しない
- API同期済みResultの手動メモは再同期で維持
- `syncKinds` に `recent` / `best` の取得経路を蓄積
- Browser timeout 15秒 / Edge Function upstream timeout 12秒
- API ResponseをBrowser側でもValidation

## Secret / Token方針

ブラウザへosu! Client ID / Client Secretを入力しません。

```text
GitHub Actions Secrets
  └─ OSU_CLIENT_ID / OSU_CLIENT_SECRET
       ↓ 12時間ごとにSupabase Edge Functionへ一時送信
Supabase Edge Function
       ↓ Client Credentials
osu! /oauth/token
       ↓ short-lived Access Token
RLS保護テーブル: osu_api_tokens
       ↓ service role only
Supabase Edge Function
       ↓ Bearer Token
osu! API v2
```

Client SecretそのものはSupabase DBへ保存しません。Access TokenはRLS有効・anon/authenticated権限なしのテーブルへ保存し、Edge Functionのservice roleだけが読み書きします。

## Supabase

Project:

```text
name: osu-hub
project ref: vtnwbgejlaqpnwmlzbjy
region: ap-northeast-1
```

Repository上の構成:

```text
supabase/
├─ functions/
│  └─ osu-sync/
│     └─ index.ts
└─ migrations/
   └─ 20260831_create_osu_api_tokens.sql
```

`osu-sync` は次の3 actionを受けます。

- `health`: Token状態とRecent / Best対応状態を確認
- `refresh`: GitHub ActionsからClient Credentialsを受け取り、osu! Access Tokenを更新
- `sync`: `scoreType=recent|best` でUser / Scoresを取得しosu! Hub用JSONへ正規化

CORSはGitHub Pages originとlocalhost開発だけを許可します。

## GitHub Actions

`.github/workflows/refresh-osu-token.yml` は手動、関連main変更、12時間ごとのscheduleで実行します。

処理:

1. GitHub Actions Secrets確認
2. `data/site.json` からSupabase endpoint取得
3. Edge Function `refresh` actionでToken更新
4. `health`を確認
5. 公開User ID 2でRecent 1件をSmoke Test
6. 公開User ID 2でBest 1件をSmoke Test

Cloudflare Worker方式は本番でosu!側429を継続再現したため、Account Syncの現行Runtimeから削除しました。経緯はCHANGELOGとGit履歴に残しています。

## Results / Stats / Practice / Settings

- Results: osu!同期 + 手入力履歴
- Stats: 平均ACC、平均Miss、最高PP、直近ACC、MOD別集計
- Practice: 練習内容・時間・完了管理
- Settings: DPI、感度、Tablet Area、JSON Backup / Import

外部同期が停止してもLocal機能は利用できます。

## AI Coaching

1. リザルト画像を複数追加
2. セッション名、目的、本人メモを入力
3. ChatGPT提出用ZIPを生成
4. ChatGPTへアップロード
5. 返却Schema v1 JSONをWebへ取り込む

AI返却JSONはValidation後に保存します。JSZip CDNが利用できない場合はJSON/TXT個別出力へFallbackします。

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

`osu Setup Launcher v0.17.0` をGitHub Releasesで配布しています。

```text
Release: https://github.com/EliteMay/osu-hub/releases/tag/v0.17.0
Installer: osu_setup_0.17.0_setup.exe
```

- 音声出力切替
- OpenTabletDriver起動
- REAL等の遅延対策アプリ起動
- osu!lazer自動検出 / 起動

`.github/workflows/build-windows.yml` はDesktop関連のmain変更時にWindows上でinstallerをbuildし、Setup.exeを検証してからActions ArtifactとGitHub Releaseへ公開します。

現在のinstallerはコード署名していないため、Windows SmartScreenの警告が表示される場合があります。GitHub Actions上のSetup.exe生成は確認済みですが、音声切替・外部exe起動などWindows固有処理は実Windows環境ごとの確認が必要です。

## GitHub Pages / CI

Pages ArtifactはWebファイルだけを公開します。Supabase function source、Electron source、bat、Secret等はPages Artifactへ含めません。

`tests/validate-web.mjs` / `Check web` では、JS/JSON/HTML、Version、Project Profile、Secret混入、Import Recovery、Supabase endpoint、Recent / Best、5分自動蓄積、Token更新Workflow、Windows Release導線、旧Cloudflare Runtime再混入などを確認します。

## 崩してはいけない仕様

- Secretを公開コードへ入れない
- osu! Client SecretをDBへ永続保存しない
- Access Tokenをブラウザへ返さない
- 手入力Resultsを同期で削除しない
- 同一osu! Score IDの重複を増やさない
- IndexedDBとJSON Backup / Importを維持する
- 外部同期停止時もLocal機能を使えるようにする
- AI Coachingに有料APIを必須化しない
- Electron Launcherを削除しない
- 外部Responseが想定形式でない場合に不正データを保存しない
- Setup.exe生成成功前にReleaseを成功扱いしない

## 未確認 / 今後

- Web 0.2.7以降の実ブラウザでBest Scores 100件同期
- Recent自動蓄積を5分以上開いた実ブラウザで確認
- Backup / Import / Rollbackの実ブラウザE2E
- Recent Scoresの24時間より前を含む全履歴ページング同期
- 同期済みResultsをAI Coachingへ直接選択して含める機能
- Windows実機でのSetup Launcher音声切替・外部exe起動確認
- Root Electronの `package-lock.json` は次回dependency導入・更新時に実package managerで生成する

未確認項目は確認済みとして扱いません。
