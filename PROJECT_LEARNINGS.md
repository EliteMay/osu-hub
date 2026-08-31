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
- Root Cause: `tools/AudioSwitcher.cs` の `IMMDeviceCollection` IIDを誤記していた。
- Final Fix: IIDをWindows SDKと一致させ、Fallback前にもSVCL direct queryで既定出力を再確認する。
- Affected files / systems: `tools/AudioSwitcher.cs`, `tools/switch_audio_device.ps1`, Windows audio fallback
- Detection method: 実Windowsログの `E_NOINTERFACE (0x80004002)`。
- Regression Guard: `tests/validate-audio-interop.mjs` とWindows CIでIID、PowerShell parse、C# compileを確認。
- Prevention: COM GUID / IIDはWindows SDK / Microsoft公式定義と照合する。
- Related Issue / PR / Commit: PR #14
- Guide candidate: yes

### PL-F-002 SVCLの切替成功と確認成功を別に扱う

- Date: 2026-08-31
- Status: monitoring
- Severity: medium
- Cost: high
- Symptom: SVCLが対象を見つけ `/SetDefault` を実行しても、1つの確認経路だけでは既定出力確認ができず偽エラーになった。
- Expected: 切替コマンド実行結果と、Windowsで実際に既定出力になったかの確認を分ける。
- Actual: OS / SVCL表示差で確認不能になった。
- Root Cause: command acceptedとstate verifiedを同じ成功判定として扱っていた。
- Final Fix: SVCL alias確認 → CSV確認 → fallback script → 必要時Core Audioという段階的確認に分離。
- Affected files / systems: `src/main.js`, `tools/switch_audio_device.ps1`
- Detection method: Launcherの段階ログ。
- Regression Guard: `tests/validate-audio-interop.mjs` とWindows installer CI。
- Prevention: 外部CLIのexit codeだけでOS状態変更を成功扱いしない。
- Related Issue / PR / Commit: v0.17.0〜v0.18.1 / PR #14
- Guide candidate: yes

### PL-F-003 同じ音声EndpointでもProviderごとにFriendly Nameの語順が違う

- Date: 2026-08-31
- Status: superseded-by-PL-F-004
- Severity: high
- Cost: medium
- Symptom: v0.18.2ではSVCLが `FxSound Speakers` を検出したがCore Audio Fallbackが `Device not found` になった。
- Expected: Provider間で同じEndpointを異なる表示名で返しても照合できる。
- Actual: `FxSound Speakers` と `Speakers (FxSound Audio Enhancer)` のような語順差を連続部分文字列では吸収できなかった。
- Root Cause: Provider間でDisplay Nameが同一文字列だと仮定した。
- Final Fix: v0.18.3で正規化・Token化・Score Matchを追加。ただし英語 `speakers` を必須Tokenに残したため、Windows表示言語差はPL-F-004として残った。
- Affected files / systems: `tools/switch_audio_device.ps1`, Windows Core Audio fallback
- Detection method: v0.18.2実機ログ。
- Regression Guard: v0.18.3のPowerShell `-SelfTest`。
- Prevention: Display Name完全一致を永続IDの代用にしない。
- Related Issue / PR / Commit: PR #16 / v0.18.3
- Guide candidate: yes

### PL-F-004 Provider間の表示名照合ではデバイス種別語もローカライズされる

- Date: 2026-08-31
- Status: superseded-by-PL-F-005
- Severity: high
- Cost: medium
- Symptom: v0.18.3でも `FxSound Speakers` のCore Audio Fallbackが `Device not found` のままだった。
- Expected: 語順だけでなくWindows表示言語が違っても同じFxSound Endpointを特定する。
- Actual: v0.18.3は `fxsound` と `speakers` の両Tokenを必須にしたため、Core Audio側が `スピーカー (FxSound Audio Enhancer)` のような日本語Friendly Nameだと `speakers` が一致しない。
- Trigger / Reproduction: 日本語WindowsでFxSoundを使用し、SVCL direct verificationが失敗してCore Audio Fallbackへ入る。
- Root Cause: `speaker / speakers / スピーカー` のようなデバイス種別語をEntity固有Tokenとして扱っていた。これらはProvider・OS表示言語で変わるため識別子として不安定。
- Final Fix: v0.18.4でspeaker/headphone/headset/earphone系をStop Word化し、`fxsound` 等の安定したVendor/Product Tokenを優先した。ただしv0.18.4実機ではCore Audio Active一覧自体にFxSoundが存在せず、次の問題はPL-F-005として切り分けられた。
- Affected files / systems: `tools/switch_audio_device.ps1`, `tests/validate-audio-interop.mjs`, Windows audio fallback diagnostics
- Detection method: v0.18.3実Windowsログ。
- Regression Guard: PowerShell `-SelfTest` とStatic validator。
- Prevention: Provider間Entity照合ではRole/Class/Localized Labelを強い識別Tokenにしない。
- Related Issue / PR / Commit: PR #17 / v0.18.4
- Guide candidate: yes

### PL-F-005 Providerごとに列挙対象のDevice Stateが違うと「片方にだけ存在する」

- Date: 2026-08-31
- Status: monitoring
- Severity: high
- Cost: high
- Symptom: v0.18.4ではMatcherが `fxsound` だけを必要とする状態まで改善したが、Core Audioの `AVAILABLE_DEVICES` にFxSoundが1件も出ず、引き続き既定出力を確認できなかった。
- Expected: SVCLで見つかったFxSound EndpointをCore Audioでも状態付きで確認し、必要ならActive化してから切り替える。
- Actual: LauncherのSVCL一覧は `/ShowDisabledDevices 1 /ShowUnpluggedDevices 1` を指定していたためActive以外も含む一方、`AudioSwitcher.cs` は `EnumAudioEndpoints(... DeviceState.Active)` のみだった。Provider間で見ている集合が違い、名前Matcherを改善しても解決しない状態だった。
- Trigger / Reproduction: FxSound EndpointがActive以外のStateにあるPCで、SVCL一覧から対象を選びCore Audio Fallbackへ入る。
- Root Cause: Provider間で同じ「再生デバイス一覧」を扱っているつもりでも、State filter / visibility条件を揃えていなかった。またFxSoundのようなVirtual EndpointはCompanion Appの起動状態によってEndpointが利用可能になるため、既定出力切替だけ先に実行しても成立しない場合がある。
- Final Fix: v0.18.5でCore AudioのAll stateを列挙し `State` / `IsActive` を保持する。FxSound targetでは `FxSound.exe` 起動、DisabledならSVCL `/Enable`、Active化Pollingの後に既定出力を再設定する。Active化できなければState付きで明示的に失敗する。
- Affected files / systems: `tools/AudioSwitcher.cs`, `tools/switch_audio_device.ps1`, `tests/validate-audio-interop.mjs`
- Detection method: v0.18.4実Windowsログの `AVAILABLE_DEVICES` にFxSoundが存在しないことと、SVCL一覧取得コードのShowDisabled/ShowUnplugged設定を照合。
- Regression Guard: C# All-state API / State propertyのStatic Guard、PowerShell Self TestでActive候補優先、Windows CIでPowerShell 5.1 parse / C# compile。
- Prevention: 複数ProviderのEntity一覧を比較するときは、ID/NameだけでなくState filter・visibility・権限・lifecycle条件も揃える。Virtual Deviceを操作する場合はCompanion Process/Driver readinessを前提条件として扱う。
- Related Issue / PR / Commit: PR #18 / v0.18.5
- Guide candidate: yes
- Guide note: OS統合では「Provider Aで存在する」ことを「Provider BでもActive」と同一視しない、というReliability一般化候補。

---

## Success

### PL-S-001 実機ログから最初に壊れた境界へ問題を絞る

- Date: 2026-08-31
- Goal / Problem: FxSound切替失敗の原因を名前照合・SVCL実行・Windows確認のどこにあるか切り分ける。
- Adopted Pattern: `matched`, `/SetDefault`, alias/CSV verification, fallback exceptionを段階表示する。
- Why it worked: 対象照合成功とfallback失敗を別Evidenceとして確認できた。
- Trade-off: ログ量は増えるためSecretや個人情報を含めない。
- Reuse when: Windows外部ツール、OS設定変更、複数Fallbackを持つElectron機能。
- Related files / tests: `src/main.js`, `tools/switch_audio_device.ps1`, `tests/validate-audio-interop.mjs`
- Guide candidate: yes

### PL-S-002 Setup.exe継続配布をOne-click Updateへ移行する

- Date: 2026-08-31
- Goal / Problem: 新VersionごとにGitHub ReleaseからSetup.exeを探して手動実行する負担を減らす。
- Adopted Pattern: `electron-updater` + GitHub Releases + NSISで起動時Background check → `今すぐ更新 / あとで` → Download → Install → Restart。
- Why it worked: Release PipelineをUpdate MetadataのSource of Truthとして使い、`userData`保存方式を変えずに更新UXを改善できる。
- Trade-off: v0.18.2だけはUpdater Bootstrapとして手動Installが必要。Installerは未署名。
- Reuse when: GitHub Releases等で継続配布するインストール型Electron / NSISアプリ。
- Related files / tests: `src/bootstrap.js`, `src/updater.js`, `package.json`, `.github/workflows/build-windows.yml`, `tests/validate-auto-update.mjs`
- Guide candidate: yes
- Guide note: web-project-guideへOne-click Update / Release Contractとして還元済み。

---

## Guide Feedback Queue

| ID | Type | Summary | Evidence | Next action |
|---|---|---|---|---|
| PL-F-001 | failure | COM IID/GUIDは公式SDK照合 + Static Guardを持つ | v0.18.0 E_NOINTERFACE実機ログ | Electron / Windows固有機能ルールへ一般化候補 |
| PL-F-002 | failure | OS変更コマンド成功とread-back成功を分離 | v0.17.0〜v0.18.0 | Reliability / Electron章への追加候補 |
| PL-F-003 | failure | Provider間でDisplay Name完全一致を前提にしない | v0.18.2 Device not found | PL-F-004へ発展 |
| PL-F-004 | failure | ローカライズ可能なデバイス種別語をEntity識別Tokenにしない | v0.18.3日本語Windows実機ログ | PL-F-005へ発展 |
| PL-F-005 | failure | Provider間でState filter / lifecycle条件を揃える | v0.18.4でSVCLにはFxSound、Core Audio Active一覧には無し | 他Projectでも再発したらReliability / Integrationルールへ一般化 |
| PL-S-002 | success | 継続配布ElectronはRelease Metadataを揃えOne-click Updateを優先 | Setup Launcher v0.18.2+ | Guideへ反映済み。実機Update Evidenceを継続追加 |
