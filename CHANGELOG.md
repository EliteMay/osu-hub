# CHANGELOG

Web Versionの正本は `data/site.json` の `siteVersion` です。Desktop Launcher Versionの正本は `package.json` の `version` です。

## Web 0.2.4 - 2026-08-30

### Fixed

- Cloudflare Worker経由のClient Credentials `/oauth/token` で429が継続する問題を回避
- Account Syncをosu! OAuth非依存の公開プロフィール / Recent Scores経路へ変更
- Account Sync画面から不要になったClient ID / Secret案内を削除

### Changed

- Workerは公開プロフィールHTMLの `data-initial-data` からUser / Statisticsを取得
- Recent Scoresはosu!公式Webが利用する公開Web Routeから最大100件取得
- 同一同期条件の60秒Cacheと429 / Retry-After処理は維持
- Worker deployに必要なSecretをCloudflare Account ID / API Tokenのみに変更
- `/health` へ `upstreamMode: public-web` / `oauthRequired: false` を追加
- Static ValidationでOAuth依存の再混入を検出

### Compatibility

- IndexedDB DB / Version / Store変更なし
- Result ID `osu:<score id>` 変更なし
- Backup Schema変更なし
- Electron Launcher変更なし

### Risk / Unverified

- 公開Web Route / Profile HTMLはosu! Web実装変更の影響を受ける
- Web 0.2.4本番deploy後の実アカウントRecent Scores同期
- Account Sync → Results → Statsの実ブラウザE2E

## Web 0.2.3 - 2026-08-30

### Fixed

- osu! OAuth 429対策としてアクセストークンをCloudflare Cache APIへ共有キャッシュ
- 同一Isolate内の同時Token取得を1回へ集約
- 同一同期条件の結果を60秒キャッシュ
- OAuth / API 429を明示的に扱い、Retry-Afterがあれば利用者へ返す

### Changed

- `cloudflare/worker/**` またはdeploy workflowがmainへ入ったときWorkerを自動deployするCDへ変更
- Rate limit対策が消えないようStatic Validationを追加

### Result

- CI / Worker deployは成功したが、実ブラウザではOAuth Token Endpoint 429が継続したため0.2.4でOAuth依存自体を廃止

## Web 0.2.2 - 2026-08-30

### Changed

- Cloudflare Worker本番URLを `data/site.json` に設定
- Home / Account Syncの既定接続先を本番Workerへ切替
- README / 作業報告を本番deploy済み状態へ更新

### Verified

- `Deploy osu Hub API Worker` Workflow成功
- Worker URL発行
- `/health` 成功
- 当時のosu! OAuth Secret設定済み状態をWorkflowで確認

## Web 0.2.1 - 2026-08-30

### Changed

- `web-project-guide` 1.2.0 に合わせてProject Profile / Source of Truth / Stable Runtime方針を記録
- Mobile Navigationを横Scroll方式へ変更
- Web Version表示を `data/site.json` へ統一
- Backup ImportをValidation / Recovery / Verification / Rollback対応へ変更
- Worker / BrowserのtimeoutとResponse Validationを追加
- AI Coaching返却JSON Schema Validationを追加
- Accessibility / Feedback / CIを強化
- Cloudflare Worker本番deploy Workflowを追加

## Web 0.2.0 - 2026-08-30

### Added

- Cloudflare Worker経由のAccount Sync
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
