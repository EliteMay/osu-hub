# 音声切替ツールについて

v17では **SoundVolumeCommandLine（SVCL）モード** を推奨します。

## 推奨: SVCLモード

1. アプリ右側の `SVCLを自動取得` を押す
2. `svcl.exe` が利用可能になる
3. `音声デバイス一覧` を押す
4. 目的デバイスの `Name` または `Command-Line Friendly ID` をコピーする
5. `切り替えたい音声名` に貼る
6. `音声だけテスト` を押す

例:

```txt
High Definition Audio Device\Device\Speakers\Render
```

v17では、入力した名前が一覧に存在することを確認してから切替を実行し、切替後も既定デバイス状態を再取得して確認します。

## 予備: NirCmdモード

NirCmdは一部環境で終了コードが成功でも目的デバイスへ切り替わらないことがあったため、予備として残しています。

## 標準モード

Windows COM APIを使う旧方式です。環境によって `E_NOINTERFACE` などのCOMエラーが出るため、通常はSVCLモードを使ってください。

## 手動テスト

```txt
tools/test_svcl_audio.bat
```

を実行すると、SVCLで指定デバイスへ切り替えるテストができます。
