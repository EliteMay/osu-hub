# osu Setup Launcher v17

osu!lazerを始める前の準備を1クリックで実行するElectronアプリです。

## 目的

- osu前に毎回行う準備をまとめて実行する
- 音声出力切替、OpenTabletDriver起動、REAL起動、osu!lazer起動を順番に行う
- 設定はJSONで保存する

## 主な機能

- SoundVolumeCommandLine（SVCL）を使った音声出力切替
- OpenTabletDriver.UXの起動
- REAL遅延対策アプリの起動
- osu!lazerの自動検出・起動
- 起動順と待機時間の設定
- 実行ログ
- version.jsonを使ったアップデート確認
- electron-builderによるWindows Setup.exe作成

## 起動方法

1. リポジトリをダウンロードまたはclone
2. `start.bat`を実行
3. 初回はnpm依存関係を自動導入
4. 必要に応じて`SVCLを自動取得`を実行
5. 設定を保存して`osu準備を開始`

## 音声切替

1. `SVCLを自動取得`
2. `音声デバイス一覧`
3. 目的デバイスのNameまたはCommand-Line Friendly IDをコピー
4. `切り替えたい音声名`へ貼る
5. `音声だけテスト`

音声切替後はWindows右下の音声出力でも確認してください。

## GitHub管理

このプロジェクトは `EliteMay/osu-setup-launcher` で管理します。

GitHub Pagesでは動作しません。ElectronアプリなのでWindows上で起動します。

Git管理しないもの:

- `node_modules/`
- `dist/`
- `logs/`
- `tools/svcl.exe`
- `tools/nircmd.exe`
- `tools/nircmdc.exe`

外部音声ツールはアプリから公式配布元より取得する方式です。

## アップデート

リポジトリ直下の`version.json`を参照します。

更新時は最低限以下を更新します。

1. `package.json`のversion
2. `version.json`のlatestVersion / releaseNotes
3. 必要に応じて`data/config.json`のconfigVersion
4. `README.md`
5. `作業報告書.md`

配布版はGitHub ReleasesへSetup.exeまたはzipを置く想定です。

## 崩してはいけない仕様

- osu本体の自動操作やプレイ補助は行わない
- 外部アプリ起動と音声出力切替だけを行う
- 設定はJSONで保存する
- 更新してもユーザー設定を意図せず消さない
- 起動失敗時はログに理由を表示する
- 外部ツールや秘密情報を公開リポジトリへ直接埋め込まない

## exe化

`build-installer.bat`を実行すると、成功時に`dist/`へSetup.exeを出力します。

例:

```txt
dist/osu_setup_0.17.0_setup.exe
```

## 現在の既知事項

- Windows実機での音声切替は環境依存があるため、SVCL一覧に表示される実デバイス名/IDを使う必要があります
- Setup.exe生成はPC側のWindows環境で確認してください
