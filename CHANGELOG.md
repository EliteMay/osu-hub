# CHANGELOG

Web Versionの正本は `data/site.json` の `siteVersion` です。Desktop Launcher Versionの正本は `package.json` の `version` です。

## Web 0.2.1 - 2026-08-30

### Changed

- `web-project-guide` 1.2.0 に合わせてProject Profile / Source of Truth / Stable Runtime方針を記録
- Mobile Navigationを非表示から横Scroll方式へ変更
- Web Version表示を `data/site.json` から反映する構成へ統一
- Account Sync未設定状態を `SETUP REQUIRED` として明示
- Backup Importを全Payload Validation → Recovery Snapshot → atomic transaction → Read-back Verification → Rollback対応へ変更
- Worker / Browserの外部通信timeoutとResponse Validationを追加
- AI Coaching返却JSONのSchema Validationを追加
- Form label、focus-visible、reduced-motion等のAccessibilityを改善
- 削除・保存・Import失敗時のFeedbackを強化
- Version付きRuntime Path / MutationObserver DOM Patch再混入をCIで検出
- PR / mainの両方でFinal-state Validationを実行するCIへ更新

### Added

- `project-meta.json`
- `js/site-meta.js`
- `tests/validate-web.mjs`

### Unverified

- Cloudflare Worker本番deploy
- 実osu!アカウント同期
- Backup / Import / Rollbackの実ブラウザE2E
- 今回変更後のFirefox / Chromium実ブラウザE2E
- Windows固有Desktop Launcher動作

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
