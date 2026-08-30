# osu Setup Launcher v17

osu!lazerを始める前の準備を1クリックで実行するWindows向けElectronアプリです。

## 目的

- 音声出力をosu用デバイスへ切り替える
- OpenTabletDriverを起動する
- REALなどの遅延対策アプリを起動する
- osu!lazerを起動する
- 毎回の準備を1回の操作にまとめる

## 主な機能

- SoundVolumeCommandLine（SVCL）を使った音声出力切替
- SVCL / NirCmdの公式配布元からの自動取得
- OpenTabletDriver.UXの起動
- 遅延対策アプリの起動
- osu!lazerの一般的な保存先からの自動検出・起動
- 起動順・待機時間の設定
- 実行ログ
- GitHub上の`version.json`を使ったアップデート確認
- electron-builderによるWindows Setup.exe作成

## 初回起動

1. リポジトリをcloneまたはZIPで取得
2. `start.bat`を実行
3. 初回はnpm依存関係を自動導入
4. OpenTabletDriverと遅延対策アプリのパスを設定
5. `SVCLを自動取得`を実行
6. 音声デバイス一覧から目的の`Name`または`ID`を設定
7. `osu準備を開始`

設定はElectronの`userData`側へ保存されるため、ソース更新時にリポジトリ内の`data/config.json`を置き換えても既存設定をできるだけ維持します。

## 音声切替

v17では、SVCLの終了コードだけで成功判定せず、切替前に一覧と照合し、切替後も既定デバイス状態を再取得して確認します。

1. `SVCLを自動取得`
2. `音声デバイス一覧`
3. 目的デバイスの`Name`または`Command-Line Friendly ID`をコピー
4. `切り替えたい音声名`へ貼る
5. `音声だけテスト`
6. Windows側の出力先も確認

一覧取得結果は次にも保存されます。

```txt
logs/audio_devices_svcl_last.csv
```

## ファイル構成

```txt
src/
  main.js
  preload.js
  renderer/
    index.html
    styles.css
    app.js
data/
  config.json
  update-version.example.json
tools/
  install_svcl.ps1
  install_nircmd.ps1
  switch_audio_device.ps1
  AudioSwitcher.cs
start.bat
install.bat
install-svcl.bat
install-nircmd.bat
build-installer.bat
clear-builder-cache.bat
debug_info.bat
package.json
version.json
README.md
作業報告書.md
```

## データ保存

- リポジトリ内の`data/config.json`: 初期値
- 実際のユーザー設定: Electronの`userData/config.json`
- ログ: アプリのログ保存先 / 開発版では`logs/`

公開リポジトリの`data/config.json`には個人PC固有のパスを保存しません。

## アップデート確認

初期設定では次を参照します。

```txt
https://raw.githubusercontent.com/EliteMay/osu-setup-launcher/main/version.json
```

`version.json`の`latestVersion`が現在版より新しい場合、配布URLを開けます。現時点では自動上書き更新ではなく、確認＋配布先を開く方式です。

## Setup.exe

ローカルでは次を実行します。

```txt
build-installer.bat
```

成功時の例:

```txt
dist/osu_setup_0.17.0_setup.exe
```

GitHub Actionsの`Build Windows installer`も追加しており、`workflow_dispatch`または`v*`タグでWindowsビルドを実行できます。生成物はActionsのArtifactとして取得する構成です。

外部のSVCL / NirCmd本体はSetup.exeへ直接同梱せず、必要時に公式配布元から取得します。

## GitHub Pages

GitHub Pagesでは動作しません。Electron / Node.js / Windowsの外部アプリ起動が必要なためです。

## Git管理しないもの

- `node_modules/`
- `dist/`
- `logs/`
- `tools/svcl.exe`
- `tools/nircmd.exe`
- `tools/nircmdc.exe`
- 外部ツールの展開・ダウンロード用フォルダ
- ZIP / Setup.exeなどの生成物

外部音声ツール本体はリポジトリへ同梱せず、アプリから公式配布元より取得します。

## 崩してはいけない仕様

- 音声切替 → OpenTabletDriver → 遅延対策アプリ → osu!lazer の一括起動
- osu本体の自動操作・プレイ補助は行わない
- ユーザー設定を更新時に意図せず消さない
- 起動失敗時はログに理由を表示する
- `start.bat`は失敗時に一瞬で閉じない
- 外部ツールや秘密情報・個人PC固有パスを公開リポジトリへ直接埋め込まない

## 更新時の手順

1. `package.json`の`version`を更新
2. 必要に応じて`data/config.json`の`configVersion`を更新
3. `version.json`の`latestVersion` / `downloadUrl` / `releaseNotes`を更新
4. README.mdと作業報告書.mdを更新
5. Windows実機で主要機能を確認
6. Setup.exeを作成できた場合はGitHub Releasesへ配置

## 既知の問題

- Windows環境によって音声デバイス名・IDが異なるため、初回はSVCL一覧から実デバイスを選ぶ必要があります
- 旧PowerShell COM方式は環境によってCOMエラーが出るため、SVCLモードを推奨します
- GitHub上ではWindows実機の音声切替・外部アプリ起動までは確認できません
- GitHub Releasesの初回配布は別途必要です
