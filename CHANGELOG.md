# CHANGELOG

Web Versionの正本は `data/site.json` の `siteVersion` です。Desktop Launcher Versionの正本は `package.json` の `version` です。

## Web 0.2.3 - 2026-08-30

### Fixed

- osu! OAuth 429対策としてアクセストークンをCloudflare Cache APIへ共有キャッシュ
- 同一Isolate内の同時Token取得を1回へ集約
- 同一同期条件の結果を60秒キャッシュし、短時間の連打でosu! APIを再取得しない
- OAuth / API 429を明示的に扱い、Retry-Afterがあれば利用者へ返す

### Changed

- `cloudflare/worker/**` またはdeploy workflowがmainへ入ったときWorkerを自動deployするCDへ変更
- Rate limit対策が消えないようStatic Validationを追加

### Unverified

- 修正後の実アカウントRecent Scores同期
- Account Sync → Results → Statsの実ブラウザE2E

## Web 0.2.2 - 2026-08-30

### Changed

- Cloudflare Worker本番URLを `data/site.json` に設定
- Home / Account Syncの既定接続先を本番Workerへ切替
- README / 作業報告を本番deploy済み状態へ更新

### Verified

- `Deploy osu Hub API Worker` Workflow成功
- Worker URL発行
- `/health` 成功
- osu! OAuth Secret設定済み状態をWorkflowで確認

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
