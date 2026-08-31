# PROJECT LEARNINGS

このファイルは、osu! Hubで発生した再発防止価値の高い失敗と、今後も再利用したい成功パターンを長期的に残すための正本です。

作業報告書は「今回何を変更したか」、このファイルは「このProjectから何を学んだか」を記録します。

## Failure

### PL-F-001 Windows Core Audio COM IIDの転記ミスでFallbackがE_NOINTERFACEになる

- Date: 2026-08-31
- Status: monitoring
- Severity: high
- Cost: high
- Symptom: Setup Launcher v0.18.0でSVCLの `/SetDefault` は対象を見つけて実行されたが、確認用Windows Fallbackが `0x80004002 (E_NOINTERFACE)` で失敗した。
- Expected: SVCL側で既定出力を確認できない場合でも、Windows Core Audioで再確認または切替できる。
- Actual: `IMMDeviceEnumerator.EnumAudioEndpoints` の戻り値を `IMMDeviceCollection` へQueryInterfaceする時点で失敗し、デバイス一覧すら取得できなかった。
- Trigger / Reproduction: v0.18.0でFxSound Speakersを対象に一括実行し、SVCL alias / CSV確認からFallbackへ入る。
- Root Cause: `tools/AudioSwitcher.cs` の `IMMDeviceCollection` IIDを `0BD7A1BE-7A1A-44DB-8397-C0A53CAD458F` と誤記していた。Windows SDK上の正しいIIDは `0BD7A1BE-7A1A-44DB-8397-CC5392387B5E`。
- Final Fix: IIDをWindows SDKと一致させた。さらに `tools/switch_audio_device.ps1` はCore Audioへ入る前に、app toolsまたはElectron `userData/tools` にある利用可能なSVCLへ `/GetColumnValue DefaultRenderDevice*` を直接実行して既定出力を再確認する。
- Affected files / systems: `tools/AudioSwitcher.cs`, `tools/switch_audio_device.ps1`, Windows audio fallback
- Detection method: 実WindowsのLauncher実行ログに `E_NOINTERFACE (0x80004002)` と誤ったIIDが表示されたことで特定。
- Regression Guard: `tests/validate-audio-interop.mjs` で正しいIIDを必須化し、誤ったIIDの再混入を失敗扱いにする。Windows installer CIでも同Validatorを実行し、Windows PowerShell 5.1でFallback scriptをparse、`AudioSwitcher.cs` を`Add-Type`でcompileする。
- Prevention: COM GUID / IIDは記憶や類似コードから転記せず、Windows SDK / Microsoft公式定義と照合する。Windows固有Fallbackは静的build成功だけで完了扱いにせず、実機ログまで確認する。
- Related Issue / PR / Commit: PR #14
- Guide candidate: yes
- Guide note: OS COM interopを使うProjectでは、GUID/IIDを公式定義と照合するStatic Guardが再発防止に有効。

### PL-F-002 SVCLの切替成功と確認成功を別に扱う

- Date: 2026-08-31
- Status: monitoring
- Severity: medium
- Cost: high
- Symptom: v0.17.0以降、SVCLが対象を見つけ `/SetDefault` を実行しても、CSV Default列やalias取得だけでは既定出力確認ができず偽エラーになった。
- Expected: 切替コマンド実行結果と、Windowsで実際に既定出力になったかの確認を分け、確認できた場合だけsuccessにする。
- Actual: 1つの確認経路へ依存したため、OS / SVCL表示差で確認不能になった。
- Trigger / Reproduction: FxSound等の仮想音声デバイスを既定出力に設定する環境。
- Root Cause: 「コマンド対象照合」「SetDefault実行」「既定出力確認」を同じ成功判定として扱い、確認経路の互換性を十分に分離していなかった。
- Final Fix: SVCL alias確認 → CSV確認 → fallback scriptでSVCL direct query → 必要時のみCore Audioという段階的確認に分離した。
- Affected files / systems: `src/main.js`, `tools/switch_audio_device.ps1`, Windows audio switching
- Detection method: Launcherの段階ログと実Windows結果を比較。
- Regression Guard: `tests/validate-audio-interop.mjs` とWindows installer CI。
- Prevention: 外部CLIのexit codeだけでOS状態変更を成功扱いしない。状態変更後に独立したread-back確認を持つ。
- Related Issue / PR / Commit: v0.17.0〜v0.18.1の音声切替修正 / PR #14
- Guide candidate: yes
- Guide note: Windows固有操作は「command accepted」と「state verified」を分離する一般ルールにできる。

### PL-F-003 同じ音声EndpointでもProviderごとにFriendly Nameの語順が違う

- Date: 2026-08-31
- Status: monitoring
- Severity: high
- Cost: medium
- Symptom: v0.18.2ではSVCLが `FxSound Speakers` を検出して `/SetDefault` まで実行したが、Windows Core Audio Fallbackが `Device not found: FxSound Speakers` で失敗した。
- Expected: SVCLとCore Audioで同じEndpointを異なる表示名で返しても、Fallbackで同一デバイスとして特定できる。
- Actual: Core Audio側のFriendly Nameが `Speakers (FxSound Audio Enhancer)` のような表記の場合、連続部分文字列 `*FxSound Speakers*` では一致しなかった。
- Trigger / Reproduction: FxSound仮想再生デバイスを対象に、SVCLの直接確認が失敗してCore Audio Fallbackへ入る。
- Root Cause: デバイス名をProvider間で同一文字列だと仮定し、語順・括弧・Provider固有Prefix/Suffixを吸収していなかった。
- Final Fix: `tools/switch_audio_device.ps1` に正規化、一般語除外Token、Score、`Find-BestRenderDeviceMatch`を追加。完全一致/部分一致を優先しつつ、`FxSound` と `Speakers` のような主要Tokenが語順に依存せず候補名へ全て含まれる場合も一致させる。
- Affected files / systems: `tools/switch_audio_device.ps1`, Windows Core Audio fallback, Windows installer CI
- Detection method: v0.18.2実Windowsログで `E_NOINTERFACE` が消え、失敗位置が `Device not found` まで進んだことで特定。
- Regression Guard: PowerShell `-SelfTest` で `FxSound Speakers` → `Speakers (FxSound Audio Enhancer)` FixtureをWindows CI実行。`tests/validate-audio-interop.mjs`でMatcherとSelf Test実行を必須化。
- Prevention: 複数Provider / API / OS層の表示名を永続IDのように扱わない。IDを共有できない場合は、正規化・Token化・曖昧一致の優先順位とFixtureを用意する。
- Related Issue / PR / Commit: v0.18.3
- Guide candidate: yes
- Guide note: 外部Provider間のEntity照合ではDisplay Name完全一致を前提にしない、という一般化候補。

---

## Success

### PL-S-001 実機ログから対象検索ではなく確認経路へ問題を絞る

- Date: 2026-08-31
- Goal / Problem: FxSound Speakers切替失敗の原因を、名前照合・SVCL実行・Windows確認のどこにあるか切り分ける。
- Adopted Pattern: Launcherの実行ログで `matched`, `/SetDefault`, alias/CSV verification, fallback exceptionを段階表示し、最初に壊れた境界から調査した。
- Why it worked: 「音声切替が失敗した」という一括症状ではなく、対象照合成功とfallback失敗を別Evidenceとして確認できた。
- Trade-off: ログ量は増えるが、個人情報やSecretを含まない技術情報へ限定する必要がある。
- Reuse when: Windows外部ツール、OS設定変更、複数Fallbackを持つElectron機能。
- Avoid when: 単純な静的処理で段階ログがノイズになる場合。
- Related files / tests: `src/main.js`, `tools/switch_audio_device.ps1`, `tests/validate-audio-interop.mjs`
- Guide candidate: yes
- Guide note: OS固有処理では段階Breadcrumb / verification detailsが原因特定を大幅に速める。

### PL-S-002 Setup.exe継続配布をOne-click Updateへ移行する

- Date: 2026-08-31
- Goal / Problem: 新Versionごとに利用者がGitHub Releaseを開き、Setup.exeを探して手動実行する負担を減らす。
- Adopted Pattern: `electron-updater` + GitHub Releases + NSISを使い、起動時Background check → `今すぐ更新 / あとで` → Download → `quitAndInstall` → Restartの流れにした。ReleaseへSetup.exeだけでなく`latest.yml`と`.blockmap`を同じVersionで配布し、失敗時は現在Version継続 + ReleaseページFallbackを残す。
- Why it worked: Release Pipelineを更新MetadataのSource of Truthとして再利用でき、Launcherの既存`userData`保存方式を変えずに更新UXだけ改善できる。
- Trade-off: v0.18.1以前にはUpdaterがないためv0.18.2だけは最後の1回の手動Installが必要。未署名InstallerではAuthenticodeによるPublisher検証がないため、公開範囲を広げる場合はCode Signingが必要になる。
- Reuse when: GitHub Releases等で継続配布するインストール型Electron / NSISアプリ。
- Avoid when: Portable単発Tool、Release Providerを安全に固定できない場合、更新で保存互換性を保証できない場合。
- Related files / tests: `src/bootstrap.js`, `src/updater.js`, `package.json`, `.github/workflows/build-windows.yml`, `tests/validate-auto-update.mjs`
- Guide candidate: yes
- Guide note: `web-project-guide` 1.6.0へ「継続配布するインストール型ElectronはOne-click UpdateをCONDITIONAL SHOULDとして優先」を還元済み。CIでMetadata生成を確認しても旧Version→新Versionの実機更新確認は別に残す。

---

## Guide Feedback Queue

| ID | Type | Summary | Evidence | Next action |
|---|---|---|---|---|
| PL-F-001 | failure | COM IID/GUIDは公式SDK照合 + Static Guardを持つ | v0.18.0 E_NOINTERFACE実機ログ | Electron / Windows固有機能ルールへ一般化できるか確認 |
| PL-F-002 | failure | OS変更コマンド成功とread-back成功を分離 | v0.17.0〜v0.18.0音声確認失敗 | Reliability / Electron章への追加候補 |
| PL-F-003 | failure | Provider間でDisplay Name完全一致を前提にしない | v0.18.2 `Device not found: FxSound Speakers` | 複数Projectでも再発した場合にReliability / Integrationルールへ一般化 |
| PL-S-002 | success | 継続配布ElectronはRelease Metadataを揃えOne-click Updateを優先 | Setup Launcher v0.18.2 | Guide 1.6.0へ反映済み。次は実WindowsのN→N+1更新Evidenceを追加 |
