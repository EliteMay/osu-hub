# CHANGELOG

Web Versionの正本は `data/site.json` の `siteVersion` です。Desktop Launcher Versionの正本は `package.json` の `version` です。

## Web 0.2.10 - 2026-08-31

### Changed

- Desktop Toolsの配布表示をSetup Launcher `v0.18.1` へ更新
- FxSound環境で確認された `E_NOINTERFACE` 修正内容とSVCL / Core Audio Fallback順序を表示

### Verification

- PRでWeb validation / Windows installer build / audio interop regression guardを確認する
- 実WindowsのFxSound切替はv0.18.1 install後に再確認する

## Desktop 0.18.1 - 2026-08-31

### Fixed

- Windows Core Audio `IMMDeviceCollection` IIDの転記ミスを修正
  - 誤: `0BD7A1BE-7A1A-44DB-8397-C0A53CAD458F`
  - 正: `0BD7A1BE-7A1A-44DB-8397-CC5392387B5E`
- v0.18.0実機で発生した `0x80004002 (E_NOINTERFACE)` の直接原因を解消
- Windows Core Audioへ入る前にFallback scriptがSVCLの `DefaultRenderDevice` / `DefaultRenderDeviceMulti` / `DefaultRenderDeviceComm` を公式の `/GetColumnValue` 形式で再確認するよう変更

### Regression Guard

- `tests/validate-audio-interop.mjs` を追加
- 正しい `IMMDeviceCollection` IIDを必須化し、誤ったIIDの再混入を失敗扱い
- Windows installer workflowでaudio interop validatorをbuild前に実行

### Compatibility

- `configVersion` は17のまま
- Electron userData保存方式変更なし
- 既存のFxSound等の音声デバイス名、OpenTabletDriver / REAL / osu! pathを維持

## Web 0.2.9 - 2026-08-31

### Changed

- Desktop Toolsの配布表示をSetup Launcher `v0.18.0` へ更新
- 音声切替のSVCL + Windows標準Fallback構成を表示

### Verification

- PRでWindows installer build / JavaScript syntax / installer生成を確認するWorkflowへ拡張
- 実WindowsでのFxSound切替結果はv0.18.0 install後に確認する

## Desktop 0.18.0 - 2026-08-31

### Fixed

- SVCL `/SetDefault` が成功してもCSVのDefault列だけでは既定出力を確認できず、偽エラーになるケースを修正
- `DefaultRenderDevice` / `DefaultRenderDeviceMulti` / `DefaultRenderDeviceComm` を `/GetColumnValue` で直接照合してWindowsの既定出力を確認
- 上記確認が利用できない環境では従来CSV確認へFallback
- それでも確認できない場合はWindows PolicyConfigによる標準Fallbackを実行
- PolicyConfig側も切替後に実際のMultimedia default device IDを再取得して一致確認

### CI / Distribution

- Desktop変更のPull RequestでもWindows installerをbuild
- PRではReleaseを作らず、main merge後だけGitHub Releaseを作成
- `node --check` でElectron main / preload / rendererの構文をbuild前に確認
- Release Notesは `version.json#releaseNotes` を利用

### Compatibility

- Launcher userData保存方式は変更なし
- `configVersion` は17のまま
- 既存の音声デバイス設定・OpenTabletDriver・REAL・osu!パスを維持

## Web 0.2.8 - 2026-08-31

### Changed

- Desktop ToolsのDownload先をGitHub Releases latestへ変更
- Setup Launcher `v0.17.0` の配布済み状態を画面へ反映
- 未署名installer / Windows SmartScreen注意を明示
- `web-project-guide` 採用Versionを1.3.0へ更新
- CIへGitHub Release導線とWindows release workflowのStatic Guardを追加

### Verification

- Windows Actions build: success
- Setup.exe存在・サイズ検証: success
- Actions artifact upload: success
- GitHub Release `v0.17.0`: published
- Release asset `osu_setup_0.17.0_setup.exe`: uploaded
- Release asset size: 78,366,257 bytes
- Release asset SHA-256: `9fc9fde4a400a33dd456ed1e66574bec38457fc5e73cc5fdb646cb9a779250ef`
- Windows実機固有の音声切替・外部exe起動: 未確認

## Desktop 0.17.0 - 2026-08-31

### Distribution

- `osu Setup Launcher v0.17.0` の初回GitHub Releaseを公開
- `osu_setup_0.17.0_setup.exe` をRelease assetとして配布開始
- Desktop関連main変更時にWindows installerを自動build / verify / releaseするWorkflowへ更新
- installerはコード署名なし

## Web 0.2.7 - 2026-08-31

### Added

- Account Syncに `Recent Plays (24h)` / `Best Scores` 切替を追加
- Best Scoresを最大100件取得
- Account Sync画面を開いている間のRecent自動蓄積を追加
- 自動蓄積の既定間隔を5分に設定
- Resultへ `syncKinds` / `lastSyncedFrom` を追加し、Recent / Bestの取得経路を保持
- Recent / Best両方のGitHub Actions E2E smoke testを追加

### Changed

- Supabase `osu-sync` API contractをVersion 2へ更新
- `scoreType`未指定は後方互換で `recent`
- `health` がRecent / Best対応状態とRecent 24h metadataを返す
- Best選択中はFail設定を無効化
- Recent 0件を正常状態として「直近24時間に対象プレイなし」と表示
- Account画面にRecent / Bestそれぞれの最終同期時刻を表示

### Compatibility

- IndexedDB DB / Version / Store変更なし
- Result ID `osu:<score id>` 変更なし
- 既存Result / 手動メモを維持
- Backup Schema変更なし
- Electron Launcher変更なし

### Verification

- Supabase Edge Function Version 2 deploy: success
- PR `Check web`: success
- merge後main `Check web`: success
- GitHub Pages build / deploy: success
- Token refresh: success
- Supabase health: success
- Recent Plays smoke: success
- Best Scores smoke: success
- 実ブラウザBest 100件同期と5分自動蓄積は未確認

## Web 0.2.6 - 2026-08-31

### Fixed

- Cloudflare Worker経由でBearer Tokenを利用してもosu! API側429が継続する問題に対し、Account Syncの中継ProviderをSupabase Edge Functionsへ変更

### Changed

- `osu-hub` 専用Supabase projectを東京リージョンで作成
- `osu-sync` Edge Functionを追加
- Access Token用 `public.osu_api_tokens` tableを追加
- Token tableはRLS有効、anon/authenticated権限をrevoke
- Client ID / SecretはGitHub Actions Secretsだけで保持し、12時間ごとにEdge Functionへ一時送信してAccess Tokenを更新
- Browser Account SyncをSupabase endpointへ切替
- Cloudflare Worker runtime / deploy workflowを現行Repositoryから削除
- Supabase Function source / migrationをGitHubへ追跡
- CIをSupabase構成のStatic Validationへ変更

### Verification

- Supabase project作成: success
- Token Store migration適用: success
- `osu-sync` Edge Function deploy: success
- PR / main CI: success
- Token refresh E2E: success
- Supabase health: success
- Recent Scores smoke: success
- 実ブラウザでEliteMayプロフィール同期: success

## Web 0.2.5 - 2026-08-30

### Fixed

- Cloudflare WorkerからOAuthを避けた公開Web経路でも429になる問題に対し、Token発行処理をCloudflare外へ移動
- Workerがosu! Client Secretや `/oauth/token` を保持・実行しなくても正式なosu! API v2を利用できる構成へ変更

### Result

- Bearer Token付きAPI v2 RequestでもCloudflare Worker → osu!通信が429となったため0.2.6でCloudflare Runtimeを廃止

## Web 0.2.4 - 2026-08-30

### Fixed

- Cloudflare Worker経由のClient Credentials `/oauth/token` で429が継続する問題を回避しようとした
- Account Syncをosu! OAuth非依存の公開プロフィール / Recent Scores経路へ変更

### Result

- Worker `/health` は成功したが、本番E2E `/api/sync` で公開Web経路も429を再現したため0.2.5で廃止

## Web 0.2.3 - 2026-08-30

### Fixed

- OAuth Token / 同期結果Cache、429 / Retry-After処理を追加

### Result

- CI / Worker deployは成功したが実ブラウザでOAuth 429が継続

## Web 0.2.2 - 2026-08-30

### Changed

- Cloudflare Worker本番URLを設定しGitHub Pagesから利用開始

## Web 0.2.1 - 2026-08-30

### Changed

- `web-project-guide` 1.2.0へ追従
- Mobile Navigation、Version SoT、Backup Import Recovery、Accessibility、CIを改善

## Web 0.2.0 - 2026-08-30

### Added

- Account Sync
- Recent Scores最大100件同期
- Fail score同期
- Results / Stats連携

## Web 0.1.0 - 2026-08-30

### Added

- osu! Hub Web本体
- AI Coaching
- Results
- Stats
- Practice
- Settings
- Desktop Tools導線
