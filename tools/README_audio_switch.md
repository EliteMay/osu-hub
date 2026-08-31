# 音声切替ツールについて

v0.18.1では **SoundVolumeCommandLine（SVCL）モード** を推奨します。

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

切替時は、入力した名前が一覧に存在することを確認してから `/SetDefault <target> all` を実行し、切替後も既定デバイス状態を再取得して確認します。

v0.18.1ではmain側で確認できなかった場合、Fallback scriptがSVCLへ `/GetColumnValue DefaultRenderDevice*` を直接実行して既定出力を再確認します。それでも確認できない場合だけWindows Core Audio / PolicyConfigへ進みます。

## Windows Core Audio Fallback

`tools/AudioSwitcher.cs` を使う予備経路です。

v0.18.0では `IMMDeviceCollection` のIID転記ミスにより `E_NOINTERFACE (0x80004002)` が発生していました。v0.18.1でWindows SDKと一致する次のIIDへ修正済みです。

```txt
0BD7A1BE-7A1A-44DB-8397-CC5392387B5E
```

Windows固有処理のため、CI成功だけでは実機成功扱いにしません。

## 予備: NirCmdモード

NirCmdは一部環境で終了コードが成功でも目的デバイスへ切り替わらないことがあったため、予備として残しています。

## 手動テスト

```txt
tools/test_svcl_audio.bat
```

を実行すると、SVCLで指定デバイスへ切り替えるテストができます。
