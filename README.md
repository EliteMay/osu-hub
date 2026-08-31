# osu! Hub

osu!のプレイ記録、アカウント同期、AIコーチング、練習管理、統計、プレイヤー設定、Windows補助ツールをまとめる個人向けハブです。

- Web: GitHub Pages
- osu! API中継: Supabase Edge Function
- 同期Token管理: GitHub Actions + Supabase RLS保護テーブル
- Windows固有操作: Electron製 `osu Setup Launcher`
- Webユーザーデータ: Browser IndexedDB

## Project Guide

`EliteMay/web-project-guide` **Guide Version 1.6.0** をProject adoption metadataとして保持しています。実作業時はカスタムルールに従い、毎回 `web-project-guide` の最新版を確認して必要なルールを適用します。

Project Profile:

```text
STATIC + DATA + AI-HANDOFF + CLOUD + ELECTRON + TOOL
```

Source of Truth:

- Web Version: `data/site.json#siteVersion`
- Web Storage Schema: `js/storage.js#SCHEMA_VERSION`
- Desktop Version: `package.json#version`
- Desktop Update Metadata: `version.json`
- Electron Auto Update Provider: `package.json#build.publish`
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

Desktop Versionの正本は `package.json#version`、配布先はGitHub Releases latestです。

```text
https://github.com/EliteMay/osu-hub/releases/latest
```

主な機能:

- 音声出力切替
- OpenTabletDriver起動
- REAL等の遅延対策アプリ起動
- osu!lazer自動検出 / 起動
- アプリ内One-click Update

### 音声切替

既定はSoundVolumeCommandLine (`svcl.exe`) を使用します。

```text
対象検索
→ SVCL /SetDefault <target> all
→ DefaultRenderDevice / Multi / Comm を直接参照して確認
→ 旧CSV Default列Fallback
→ Fallback ScriptでSVCL /GetColumnValueを再確認
→ FxSound targetならFxSound.exe readiness確認
→ Core AudioでActive / Disabled / Unplugged / NotPresentを診断
→ DisabledならSVCL /Enableを試行
→ Active化待機
→ 必要な場合のみWindows Core Audio / PolicyConfig
→ Multimedia default device IDを再取得して確認
```

#### FxSound実機修正履歴

- v0.18.1: Core Audio `IMMDeviceCollection` IIDの誤りによる `E_NOINTERFACE` を修正
- v0.18.3: `FxSound Speakers` と `Speakers (FxSound Audio Enhancer)` の語順差を吸収
- v0.18.4: speaker / スピーカー等の表示言語依存語を識別Tokenから除外
- v0.18.5: SVCLには存在するがCore Audio Active一覧に存在しないEndpointをState付きで診断。FxSound process起動、Disabled Endpointの `/Enable`、Active化待機を追加

v0.18.4実Windowsログでは、SVCLが `FxSound Speakers` を見つける一方、Core Audio Active一覧にはFxSoundが存在しませんでした。SVCL一覧はDisabled / Unpluggedも含む設定なのに対し、旧Core Audio FallbackはActiveのみを列挙していたためです。v0.18.5ではこのState差を明示的に扱います。

### Auto Update v0.18.2+

v0.18.2から`electron-updater` + GitHub Releasesを使ったOne-click Updateへ移行しています。

```text
Launcher起動
↓
BackgroundでGitHub Releasesを確認
↓
新Versionあり
↓
「今すぐ更新 / あとで」
↓
今すぐ更新
↓
Download
↓
Launcherを終了してInstall
↓
新Versionで再起動
```

重要:

- **v0.18.1以前にはUpdaterが入っていないため、v0.18.2への更新だけはSetup.exeを1回手動実行する必要があります。**
- v0.18.2を一度導入した後は、以後の新版をアプリ内の「今すぐ更新」から更新できます。
- 起動時の自動確認は設定からOFFにできます。
- 更新失敗時は現在Versionを継続利用でき、GitHub Releasesを開くFallbackがあります。
- 設定はElectron `userData` に保存しているため、Installer更新で上書きしない構成です。

GitHub Releaseには同じVersionのAuto Update Artifactを揃えます。

```text
osu_setup_<version>_setup.exe
osu_setup_<version>_setup.exe.blockmap
latest.yml
```

`latest.yml`のHash / MetadataをUpdaterが利用します。現在のInstallerはコード署名していないためWindows SmartScreenが表示される場合があり、Authenticodeによる発行元検証はありません。公開範囲を広げる場合はCode Signingを優先課題とします。

### Windows Build / Release

`.github/workflows/build-windows.yml` はDesktop関連Pull Requestとmain変更でWindows buildを実行します。

PR:

- Electron JavaScript構文確認
- Audio COM IID / Endpoint state / Fallback regression check
- PowerShell 5.1 parse
- `AudioSwitcher.cs` compile
- FxSound matcher Self Test
- Auto Update regression check
- installer build
- Setup.exe / `latest.yml` / `.blockmap` の存在・Version整合確認
- Actions Artifact保存
- Releaseは作成しない

main:

- 上記確認後、`package.json#version` のGitHub Releaseを作成または更新
- Setup.exe / `latest.yml` / `.blockmap` を同じReleaseへupload

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

`tests/validate-web.mjs` ではVersion、Project Profile、Secret混入、Import Recovery、Supabase endpoint、Recent / Best、自動蓄積、Token更新Workflow、Windows Release / Auto Update導線、旧Cloudflare Runtime再混入などを検査します。

`tests/validate-audio-interop.mjs` ではCore Audio COM IID、Endpoint state、FxSound readiness、Fallback検証経路の再発防止を行います。

`tests/validate-auto-update.mjs` ではUpdater bootstrap、GitHub Provider、One-click flow、Release Metadata、manual fallbackを検査します。

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
- Setup.exe / Update Metadata生成成功前にReleaseを成功扱いしない
- Auto Update失敗で現在VersionやuserDataを破壊しない
- Windows固有処理を静的コード確認だけで成功扱いしない

## 未確認 / 今後

- Webの実ブラウザでBest Scores 100件同期
- Recent自動蓄積を5分以上開いた実ブラウザ確認
- Backup / Import / Rollback実ブラウザE2E
- Recent 24時間より前を含む全履歴ページング同期
- 同期済みResultsをAI Coachingへ直接選択する機能
- Windows実機でv0.18.5のFxSound Endpoint Active化 / 既定出力切替確認
- v0.18.4 → v0.18.5の実Windows One-click Update / Restart確認
- Auto Update後のuserData設定維持確認
- Installer Code Signing
- Root Electronの `package-lock.json` をdependency変更に合わせて生成・追跡する

未確認項目は確認済みとして扱いません。
