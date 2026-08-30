# osu Setup Launcher

osu! Hub のWindows向け補助ツールです。

現時点では既存Electronソースを安全に壊さないため、ランチャー本体のソースはリポジトリ直下の次のファイル・フォルダに残しています。

- `src/`
- `data/config.json`
- `tools/`
- `package.json`
- `start.bat`
- `install.bat`
- `install-svcl.bat`
- `install-nircmd.bat`
- `build-installer.bat`

Web版 osu! Hub の `Desktop Tools` ページからGitHub Releasesへ案内します。

## 今後の移動方針

Electron側のビルド・設定保存・外部ツール取得に影響しないことを確認してから、必要に応じて `desktop/setup-launcher/` 配下へ本体を移動します。現段階では見た目だけの整理のために既存パスを変更しません。

## 崩してはいけない仕様

- 音声切替 → OpenTabletDriver → 遅延対策アプリ → osu!lazer の順で一括起動できる
- 更新でユーザー設定を消さない
- 外部ツールexeを公開GitHubへ直接含めない
- 個人PC固有パスを公開用初期設定へ入れない
- osu!本体の自動操作・プレイ補助はしない
