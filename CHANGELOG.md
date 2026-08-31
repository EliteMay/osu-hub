# CHANGELOG

Web Versionの正本は `data/site.json` の `siteVersion` です。Desktop Launcher Versionの正本は `package.json` の `version` です。

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

### Compatibility

- IndexedDB DB / Version / Store変更なし
- Result ID `osu:<score id>` 変更なし
- Backup Schema変更なし
- Electron Launcher変更なし

### Verification

- Supabase project作成: success
- Token Store migration適用: success
- `osu-sync` Edge Function deploy: success
- PR / main CI、Token refresh E2E、実ブラウザAccount Syncはmerge後に確認

## Web 0.2.5 - 2026-08-30

### Fixed

- Cloudflare WorkerからOAuthを避けた公開Web経路でも429になる問題に対し、Token発行処理をCloudflare外へ移動
- Workerがosu! Client Secretや `/oauth/token` を保持・実行しなくても正式なosu! API v2を利用できる構成へ変更

### Changed

- GitHub Actions runnerでClient Credentials Tokenを発行
- 発行TokenをGitHub Actions runnerからosu! API v2で検証
- Access Tokenをmaskし、`OSU_ACCESS_TOKEN`だけをCloudflare Worker Secretへ保存
- Client Credentials Tokenの24時間有効期間に対して12時間ごとの自動更新を追加
- Worker Account Syncを `api-v2-preissued-token` modeへ変更
- Worker deployとToken refreshの両方で `/health` + `/api/sync` end-to-end smoke testを実施

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
