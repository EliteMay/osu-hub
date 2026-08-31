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

Source of Truth:

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

- 直近24時間
- 1〜100件取得
- Failを含める / 含めないを選択可能
- Account Sync画面を開いている間は既定で5分以上空いたときRecentを自動同期
- Browserを閉じている間は自動同期しない

### Best Scores

- 自己ベスト上位を1〜100件取得
- 古いBestもResultsへ追加可能
- Bestは成功スコアのみ

### 蓄積ルール

- Result ID: `osu:<score id>`
- 同一Score IDは重複せず更新
- 手入力Resultsは同期で削除しない
- API Resultへ付けた手動メモは再同期で維持
- `syncKinds` に `recent` / `best` の取得経路を保持
- Browser timeout 15秒 / Edge Function upstream timeout 12秒
- External ResponseはBrowser側でもValidation

## Secret / Token方針

ブラウザへosu! Client ID / Client Secretを入力しません。

```text
GitHub Actions Secrets
  └─ OSU_CLIENT_ID / OSU_CLIENT_SECRET
       ↓ 12時間ごと
Supabase Edge Function
       ↓ Client Credentials
osu! /oauth/token
       ↓ Access Token
RLS保護テーブル: osu_api_tokens
       ↓ service role only
Supabase Edge Function
       ↓ Bearer Token
osu! API v2
```

Client SecretそのものはSupabase DBへ保存しません。Access Tokenはanon/authenticatedから読めないRLS保護テーブルで管理します。

## Supabase

```text
project: osu-hub
ref: vtnwbgejlaqpnwmlzbjy
region: ap-northeast-1
```

Repository:

```text
supabase/
├─ functions/osu-sync/index.ts
└─ migrations/20260831_create_osu_api_tokens.sql
```

`osu-sync` action:

- `health`
- `refresh`
- `sync` (`scoreType=recent|best`)

CORSはGitHub Pages originとlocalhost開発だけを許可します。

## AI Coaching

1. リザルト画像を複数追加
2. セッション情報を入力
3. ChatGPT提出用ZIPを生成
4. ChatGPTへアップロード
5. Schema v1 JSONを取り込む

AI返却JSONはValidation後に保存します。有料OpenAI APIは必須にしません。

## Backup / Import / Recovery

WebユーザーデータはIndexedDB `osuHubDB` に保存します。

```text
results
coaching
practice
settings
```

Importは `parse → validation → recovery snapshot → transaction write → read-back verification → failure時rollback` の順で処理します。現在はMerge方式です。

## Desktop Tools

現在の配布版:

```text
osu Setup Launcher v0.18.1
https://github.com/EliteMay/osu-hub/releases/latest
```

主な機能:

- 音声出力切替
- OpenTabletDriver起動
- REAL等の遅延対策アプリ起動
- osu!lazer自動検出 / 起動

### 音声切替 v0.18.1

既定はSoundVolumeCommandLine (`svcl.exe`) を使用します。

```text
対象検索
→ SVCL /SetDefault <target> all
→ DefaultRenderDevice / Multi / Comm を直接参照して確認
→ 旧CSV Default列Fallback
→ Fallback ScriptでSVCL /GetColumnValueを再確認
→ 必要な場合のみWindows Core Audio / PolicyConfig
→ Multimedia default device IDを再取得して確認
```

v0.18.0実機ログでは、SVCLの対象照合とコマンド実行後にWindows標準Fallbackへ入り、Core Audioの `IMMDeviceCollection` を誤ったIIDで宣言していたため `E_NOINTERFACE (0x80004002)` になっていました。v0.18.1でWindows SDKと一致するIIDへ修正し、Fallbackの先頭でもSVCLの既定出力を公式の `/GetColumnValue` 形式で再確認します。

既存のuserData設定、FxSound等の音声デバイス名、OpenTabletDriver / REAL / osu! pathは更新時に維持する構成です。

### Windows Build / Release

`.github/workflows/build-windows.yml` はDesktop関連Pull Requestとmain変更でWindows buildを実行します。

PR:

- `node --check` でElectron JavaScript構文確認
- Audio COM IID / fallback static regression check
- installer build
- Setup.exe存在・最低サイズ確認
- Actions Artifact保存
- Releaseは作成しない

main:

- 上記確認後、`package.json#version` のGitHub Releaseを作成または更新
- Setup.exeをRelease assetとしてupload

installerはコード署名していないためWindows SmartScreenが表示される場合があります。

## GitHub Actions

主なWorkflow:

- `Check web`
- `Deploy osu Hub Pages`
- `Refresh osu API Token`
- `Build Windows installer`

Token refreshではSupabase health、Recent Plays smoke、Best Scores smokeまで実行します。

Cloudflare Worker方式は本番でosu!側429を継続再現したため現行Runtimeから削除済みです。

## GitHub Pages / CI

Pages ArtifactはWebファイルだけを公開し、Electron source、bat、Supabase source、Secretは公開Artifactへ混ぜません。

`tests/validate-web.mjs` ではVersion、Project Profile、Secret混入、Import Recovery、Supabase endpoint、Recent / Best、自動蓄積、Token更新Workflow、Windows Release導線、旧Cloudflare Runtime再混入などを検査します。

`tests/validate-audio-interop.mjs` ではCore Audio COM IIDとFallback検証経路の再発防止を行います。

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
- Windows固有処理を静的コード確認だけで成功扱いしない

## 未確認 / 今後

- Webの実ブラウザでBest Scores 100件同期
- Recent自動蓄積を5分以上開いた実ブラウザ確認
- Backup / Import / Rollback実ブラウザE2E
- Recent 24時間より前を含む全履歴ページング同期
- 同期済みResultsをAI Coachingへ直接選択する機能
- Windows実機でv0.18.1のFxSound音声切替再確認
- update install後のuserData維持確認
- Root Electronの `package-lock.json` は次回dependency導入・更新時に実package managerで生成する

未確認項目は確認済みとして扱いません。
