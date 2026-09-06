# osu! Hub 要件定義

このファイルは `osu-hub` の**現在のProduct Requirement Contract**です。

実装履歴や過去の議論ではなく、「現在このProjectが何を目指し、何を守り、どこまでをMVP完成とするか」を記録します。

## 0. Guide / Project Profile

- Adopted Guide Version: `1.18.0`
- Profiles: `STATIC + DATA + AI-HANDOFF + CLOUD + ELECTRON + TOOL`
- Requirements updated: `2026-09-07`

Web / Electron制作の共通Ruleは `EliteMay/web-project-guide` の最新版を正本とし、このファイルへ重複して持ちません。

## 0A. 要件定義の決定モード

- Recommendation-by-default: Yes
- Best Reasonable Decision: Enabled
- Userが自動決定を止めた項目: None
- 明示的なUser Preference:
  - Productの主役はWindows環境管理ではなく、osu!のプレイ記録・分析・上達支援とする
  - 現時点では個人利用を中心とする
  - 将来は他のosu!プレイヤーにも拡張可能な構造を維持する
- User Confirmation Exceptionに該当する項目: None

---

## 1. 目的 / 成功条件

### Project purpose

`osu! Hub` は、osu!のプレイ記録を集めるだけの保管庫ではなく、**プレイ結果を振り返り、傾向を分析し、次の練習へつなげる個人向けWebアプリ**とする。

Productの中心は次の改善ループである。

```text
プレイ
↓
同期・記録
↓
分析
↓
練習
↓
再プレイ
↓
再同期・Before / After確認
```

Windows用Electron Launcherは削除しないが、Productの主役ではなく**Desktop Companion / 補助ツール**として扱う。

### Userが最終的にできるようになること

- osu!のRecent / Bestスコアを同期できる
- 保存済みResultを検索・比較・振り返りできる
- 自分の成長、安定性、難易度帯、Sessionごとの傾向を把握できる
- 分析結果から具体的なPracticeを作成できる
- 練習前後の変化を比較できる
- 必要に応じてChatGPT等のAIからコーチングを受け、提案をPracticeへ反映できる
- 外部サービスが利用できない場合も、保存済みデータを使った主要ローカル機能を継続利用できる

### Success signal

次のFlowがEnd-to-Endで成立することをMVP成功の中心Signalとする。

```text
osu!同期
↓
Results確認
↓
Analysis
↓
Practice作成
↓
再同期
↓
Before / After比較
```

---

## 2. 使用者 / 利用環境

- Primary user: 現時点ではProject owner本人
- 将来Target: 他のosu!プレイヤーへ拡張可能
- 公開範囲: Web自体はGitHub Pagesで公開可能だが、MVPは個人利用を中心とする
- 主な端末: Windows PC
- 主なブラウザ / Runtime:
  - Web: 現行主要Desktop Browser
  - Desktop Companion: Windows Electron App
- Mobile: 主対象ではないが、主要情報の閲覧は可能にする
- Offline利用:
  - 完全Offlineでosu! API同期はできない
  - 保存済みResults / Practice / Coaching履歴等のLocal Coreは外部サービス停止時も利用可能にする

### 将来一般利用への準備

MVPでは独自ログインや複数ユーザー管理を導入しない。ただし、将来一般公開へ拡張しにくくなるような次の実装は避ける。

- 特定User IDのコード直書き
- 1人専用でしか成立しないData Schema
- User固有値と共通設定の不必要な混在

---

## 3. Scope

### MVP / 今回必須

#### Account / Sync

- osu!アカウント設定
- Recent Plays同期
- Best Scores同期
- 同一osu! Score IDの重複防止
- 同期状態・最終同期時刻・Error表示

#### Results

- 保存済みResult一覧
- Result詳細
- Recent / Best / 保存済みResultの区別
- 検索
- Filter
- Sort
- 手動メモ
- 基本指標表示
  - Accuracy
  - Combo
  - Miss
  - Score
  - Rank
  - PP
  - Mods
  - Map / Beatmap情報

#### Analysis

MVP完成に必須の分析は次の4系統とする。

1. 成長推移
2. 難易度別
3. 安定性
4. Session比較

Analysisは数字やグラフを並べるだけではなく、**次の練習判断につながる意味付け**を行う。

例:

- 最近Accuracyが上がっている / 下がっている
- 一定難易度からMissが急増する
- Session後半に精度が落ちる
- 同じ難易度帯でも安定度が改善している

#### Practice

Practiceは単純なメモではなく、練習サイクルとして扱う。

最低限持つ情報:

- 練習テーマ
- 苦手 / 原因
- 目標
- やること
- 開始日
- 期間
- 関連Analysis
- 練習前の状態
- 練習後の状態
- 振り返り
- Status: `planned / active / completed`

AnalysisからPracticeを作成できる導線を持つ。

#### Coaching

- プレイ結果やSession情報をAIへ渡すためのExport
- 必要に応じたリザルト画像添付
- 自己評価・Session情報入力
- AI返却JSONのValidation
- Coaching履歴保存
- AI提案からPractice作成

AIは補助コーチであり、Productの必須Runtime Dependencyにはしない。

#### Dashboard

- 最新同期状態
- 最近のプレイ概要
- 最近の変化
- 重要な傾向
- 最近のPractice
- 次に見るべき項目への導線
- 同期操作

Dashboardは詳細Analysisを詰め込む画面ではなく、改善ループへの入口とする。

#### Backup / Recovery

- IndexedDBによるLocal保存
- JSON Backup Export
- JSON Import / Restore
- Import Validation
- Recovery Snapshot
- Import失敗時Rollback
- Restore後Read-back Validation

#### Desktop Companion

現行Electron Launcherを維持する。

- osu!lazer起動補助
- 音声出力切替
- OpenTabletDriver起動
- 遅延対策等の既存補助機能
- One-click Update

ただしDesktop CompanionはWebの主要NavigationやProduct Goalを支配しない。

### Non-goals / 今回やらない

- 独自Account / Password認証
- 一般利用者向けの本格的なMulti-user System
- WebユーザーデータのCloud常時同期
- AIによるPracticeの無確認自動作成・自動更新
- AIを使わないと成立しないAnalysis
- SNS / Community機能
- Leaderboard / Friend比較をProductの中心にすること
- Windows Launcher中心へのProduct回帰
- Electron機能を無理にWebへ移植すること
- UI / Visualの大規模Redesignをこの要件定義だけで確定すること

### Later / 後回し

- Mods別詳細分析
- BPM別分析
- AR / OD / CS別分析
- Map Length等のMap特性別分析
- 複数指標を組み合わせた高度な苦手自動判定
- 自動Practice Recommendationの高度化
- 週単位Training Plan
- Streak / 達成率等のTraining Dashboard
- 複数端末Cloud Sync
- 一般ユーザー向けAuth
- 一般公開向けOnboarding強化
- Player間比較

---

## 4. 主要利用フロー

### Primary Improvement Flow

```text
osu! Hubを開く
↓
最新データを同期
↓
Dashboardで最近の状態を確認
↓
Results / Analysisで気になる傾向を確認
↓
問題点・改善テーマを決める
↓
Practiceを作成
↓
練習・プレイ
↓
再同期
↓
Before / Afterを確認
↓
次のPracticeへ
```

### AI Coaching Flow

```text
Results / Session / Analysisを選ぶ
↓
必要なデータをExport
↓
ChatGPT等へ渡す
↓
AI Coaching JSONを受け取る
↓
Validation
↓
内容をUserが確認
↓
必要な提案のみPracticeへ反映
```

AI結果を自動的に正式なPracticeへ確定しない。

---

## 5. 画面 / Surface

| 画面・Surface | 目的 | 主操作 | 重要状態 |
|---|---|---|---|
| Dashboard | 現在状態と次の行動を確認 | Sync、Results / Analysis / Practiceへ移動 | Loading / Empty / Error / Success / Stale |
| Results | 1プレイ単位の記録確認 | Search / Filter / Sort / Detail / Memo | Loading / Empty / Error / Success |
| Analysis | 傾向・成長・問題点の把握 | 期間変更、指標確認、Practice作成 | Loading / Insufficient data / Error / Success |
| Practice | 練習サイクル管理 | Create / Edit / Complete / Review | Empty / Active / Completed / Error |
| Coaching | AI分析の入出力・履歴 | Export / Import / Validate / Practice反映 | Empty / Processing / Validation Error / Success |
| Account / Sync | osu!接続・同期管理 | User設定、Recent / Best Sync | Loading / Connected / Error / Success |
| Settings | Local Dataと設定管理 | Backup / Restore / 表示・同期設定 | Idle / Processing / Error / Success |
| Tools | Desktop Companionへの補助導線 | Launcher / Download / Status確認 | Available / Unavailable / Error |

### Navigation

Primary Navigation:

```text
Dashboard
Results
Analysis
Practice
Coaching

────────

Tools
Settings
```

`Account / Sync` はPrimary Navigationへ常設せず、Dashboard上部のProfile / Sync領域等から入るSecondary Surfaceとする。

### Information Architecture Principle

`Results → Analysis → Practice → 次のプレイ` を最も重要な流れとして維持する。

新機能追加時も、このFlowを埋もれさせない。

---

## 6. Data / Storage

### Storage方針

WebのUser DataはLocal-firstとする。

- Primary local store: IndexedDB `osuHubDB`
- External sync: osu! API経由の公開Profile / Score Data
- Backup: JSON Export / Import
- Cloud: MVPではWeb User DataのPrimary Storeにしない
- Electron settings: Electron `userData`

### Data Contract

| Data | Source of Truth | ID / Schema | 保存先 | 備考 |
|---|---|---|---|---|
| Results | 同期済み / 手動登録した1プレイ記録 | API Resultは `osu:<score id>` | IndexedDB | 手動Resultも保持 |
| Sessions | 複数ResultをまとめるSession Record | Stable Session ID | IndexedDB | 新規導入時は既存Data Migrationを行う |
| Practice | 練習サイクル | Stable Practice ID + Schema Version | IndexedDB | Before / Afterを保持 |
| Coaching | AI Coaching履歴 | Stable Coaching ID + Schema Version | IndexedDB | AI Input Snapshotを必要範囲で保持 |
| Settings | User / Sync / View設定 | Schema Version | IndexedDB等の現行方式 | Secretを含めない |
| Analysis | Derived Data | 原則Results / Sessionsから再計算 | 原則非永続 | Snapshotが必要なCaseだけ保存検討 |

### Result Data

Resultで扱う主要情報:

- osu! Score ID
- Beatmap ID
- Played At
- Mods
- Accuracy
- Combo
- Miss
- Score
- Rank
- PP
- BPM
- AR
- OD
- CS
- Star Rating
- Map Length
- Sync Kind: `recent / best`
- Manual Memo

APIが返さない情報は無理に必須化せず、取得可能性とData Sourceを確認して扱う。

### Session Data

最低限:

- Session ID
- Start / End
- Result references
- Play count
- Aggregate accuracy / miss等
- 前半 / 後半比較に必要な情報
- User self-review
- Memo

Session境界の自動判定方式はImplementation時に、既存Data・実プレイ間隔・可逆性を見て決めてよい。Userが手動修正できる余地を残す。

### Analysis Data

再計算可能な集計値を大量に永続化しない。

`Results + Sessions` をAnalysisのPrimary Evidenceとし、必要な計算はOn-demand / Cacheで扱う。

AI Coaching時点の入力等、「後から元データが変化すると意味が変わるもの」はSnapshotを許可する。

### Existing data / save compatibility

- 既存IndexedDB Dataを破棄しない
- Schema変更時はMigrationを行う
- Migration失敗時は元Dataを維持する
- 旧Backupを可能な範囲でImport可能にする
- 互換性を切る必要がある場合は明示的なMigration / Backup / Rollbackを設計する

### Backup / Restore requirement

Import / Restoreは原則として次の順序を守る。

```text
parse
↓
Schema / Version確認
↓
全Record Validation
↓
Recovery Snapshot
↓
normalize
↓
transaction write
↓
read-back verification
↓
成功 / 失敗時rollback
```

既存Dataを消してからImport不正に気付く処理は禁止する。

---

## 7. Analysis Contract

### 7.1 成長推移

最低限対象:

- Accuracy
- PP
- Miss
- Combo傾向
- Play Count
- Best更新等、利用可能な指標

代表期間:

- 直近7日
- 直近30日
- 全期間または比較可能な長期期間

### 7.2 難易度別

- Star Rating帯ごとの成績
- 安定している難易度帯
- 挑戦帯
- 成績が大きく崩れ始める境界

### 7.3 安定性

- Accuracyのばらつき
- Missのばらつき
- 同程度の難易度での成功安定度
- 高難易度での崩れ方

単純な平均値だけで安定性を表現しない。

### 7.4 Session比較

- Session内の前半 / 中盤 / 後半傾向
- Accuracy / Miss / PP等の変化
- Session間比較
- Warm-up / Fatigueの兆候を確認できる情報

Data不足時は「傾向あり」と断定せず、Insufficient Data Stateを表示する。

### 7.5 苦手傾向

MVPでは、高度な自動診断を完成条件にしない。

ただし各分析は、Userが次のPracticeを判断しやすい形で説明する。

将来的には例として次を扱える。

- 高BPMでAccuracy低下
- 特定難易度以上でMiss急増
- 特定Modsで精度低下
- Session後半で崩れる

自動苦手判定を追加する場合は、判定理由とEvidenceを表示する。

---

## 8. Practice Contract

Practiceは次のLifecycleを持つ。

```text
planned
↓
active
↓
completed
```

Practice作成時にはAnalysisからContextを引き継げる。

Practice完了時には可能な範囲でBefore / Afterを比較し、Userが振り返りを保存できる。

Practiceは「毎日必ずやるTask Manager」にはせず、osu!上達の改善サイクルを記録するための機能とする。

---

## 9. AI Coaching Contract

### Role

AIは**分析補助 + 練習提案**を行う。

AIへ渡せるContext:

- Results
- Session
- Analysis要約
- Practice履歴
- User自己評価
- 必要なResult画像

AIから受け取る主な内容:

- 問題点整理
- 優先順位
- 練習テーマ
- 具体的な練習案
- 次に確認すべき指標

### AI Result Safety

- AI提案を自動確定しない
- User確認後にPracticeへ反映する
- Import JSONをValidationする
- Schema Versionを持つ
- Provider未利用時も主要Product Flowを維持する
- 有料OpenAI API等を必須化しない

---

## 10. External Dependencies / Deployment

### osu! API / Supabase

現行方針を維持する。

```text
Browser
↓
Supabase Edge Function
↓
osu! API v2
```

- Browserへosu! Client Secretを置かない
- Client SecretをDBへ永続保存しない
- Access TokenをBrowserへ返さない
- External ResponseをBrowser側でもValidationする
- Supabase / osu! API FailureでLocal Coreを停止させない

### GitHub Pages

Web公開はGitHub Pagesを維持する。

### Electron / GitHub Releases

Desktop CompanionはElectron + GitHub Releasesによる現行配布方針を維持する。

- Desktop Versionの正本を維持
- Auto Update Artifact整合を維持
- Update失敗時も現在Versionを利用可能にする
- `userData` をUpdateで破壊しない
- Windows固有処理をStatic Testだけで成功扱いしない

### Cost

- MVPで有料外部Serviceを必須にしない
- 将来Cloud Sync等を導入する場合は、料金・無料枠・停止条件を導入時点で再確認する

---

## 11. 崩してはいけない仕様

1. Productの中心Flowを `プレイ → 同期 → 分析 → 練習 → 再確認` とする。
2. 手入力ResultsをAPI同期で削除しない。
3. 同一osu! Score IDの重複を増やさない。
4. API Resultへ付けた手動メモを再同期で失わない。
5. IndexedDBとJSON Backup / Importを維持する。
6. Import / Migration失敗時に既存User Dataを破壊しない。
7. 外部同期停止時もLocal Core機能を可能な範囲で利用できるようにする。
8. AI Coachingに有料APIを必須化しない。
9. AI提案をUser確認なしでPracticeへ正式反映しない。
10. External Response / Import DataをValidationせず保存しない。
11. osu! Client Secretを公開Frontendへ置かない。
12. osu! Client SecretをDBへ永続保存しない。
13. osu! Access TokenをBrowserへ返さない。
14. Secret / TokenをGitHub Pages公開Artifactへ混ぜない。
15. Electron Launcherを削除しない。
16. Desktop CompanionをWebの主役へ戻さない。
17. Auto Update失敗で現在Versionや`userData`を破壊しない。
18. Setup.exe / Update Metadata生成成功前にRelease成功扱いしない。
19. Windows固有処理をStatic Code確認だけで実機成功扱いしない。
20. Application Audio SessionをDefault Playback Device Endpointとして扱わない。
21. Device IDやStable Identifierを表示名から推測して確定しない。

---

## 12. High-cost / Hard-to-change Decisions

### Storage / Schema / ID

- Local-firstを維持する
- IndexedDBをWeb User DataのPrimary Storeとする
- API Result IDは既存 `osu:<score id>` Contractを維持する
- 新規Session導入時は既存Data Migrationを行う
- Derived AnalysisをPrimary Stored Truthにしない

### Navigation / Information Architecture

Primary Navigation:

```text
Dashboard
Results
Analysis
Practice
Coaching
Tools
Settings
```

Account / SyncはSecondary Surfaceとする。

### External Provider / Auth

- osu! APIはSupabase Edge Function経由
- MVPで独自Authを追加しない
- Web User DataをSupabase Primary Storeへ移さない

### Cross-module contract

- Resultsが分析のEvidence
- AnalysisがPractice作成へつながる
- Practice完了後に再度Results / Analysisで変化を見る
- AI CoachingはこのFlowを補助するが、正式状態を勝手に変更しない
- Desktop CompanionはWeb Product Flowから独立した補助Surface

---

## 13. 変更可能範囲 / Assumption

### 原則として改善してよい

正式Requirementと崩してはいけない仕様を守る範囲で、次はImplementation側でBest Reasonable Decisionを行ってよい。

- File分割
- Component構成
- CSS / JS内部構造
- Function / Variable Naming
- Cache方法
- Analysis計算の内部実装
- Session境界の初期Default
- Error Messageの細部
- Loading表現の細部
- Accessibility / Performanceの標準改善

### Important Assumptions

- PC利用がPrimaryである
- 現時点では1人利用が中心である
- 将来一般公開はあり得るが、MVPではMulti-user Authは不要である
- Visual Directionの大規模変更は別の `osu-hub（UI・見た目）` 作業で決める
- UI要件が別途確定するまでは、現行UIを無条件に大規模破壊しない

### User Confirmation Exception

次のような変更で、Current Requirements / Evidence / Migration / Rollbackから安全に決められない場合のみUser確認を優先する。

- 既存User Dataを失うSchema変更
- Electron Launcher削除
- Local-firstからCloud-firstへの変更
- Login必須化
- 有料Service必須化
- Product中心Flowの変更
- 主要機能削除

---

## 14. Performance / Reliability Constraints

### Performance

- 保存済みLocal Data表示は外部API Responseを待たせない
- Results件数増加時も一覧操作が極端に重くならない構成にする
- 大量Resultを無条件に全件DOM描画しない
- Analysisは必要な期間・範囲を中心に計算する
- 長時間処理では進行中であることが分かる状態を表示する

### Reliability

- 同期を繰り返してもScore重複を増やさない
- Save / Import / SyncでValidationを行う
- Failure時に既存Dataを維持する
- Reload後に保存状態を復元できる
- 外部API FailureをLocal Data Failureと混同しない

### Explainability

- 数値だけでなく意味を表示する
- Graphには期間・単位・比較対象を示す
- 自動苦手判定を行う場合は理由を示す
- Data不足時は分析を断定しない

### Accessibility / Responsive

- Keyboard操作を不必要に妨げない
- Text / Button等の基本可読性を維持する
- PCをPrimaryとする
- Mobileでも主要情報が欠落しない範囲で閲覧可能にする

### Privacy / Security

- 不要な個人データを外部送信しない
- AIへ渡す内容をUserが把握できる
- Backupへ不要なSecretを含めない
- FrontendへSecret / Tokenを埋め込まない

---

## 15. Completion Contract

MVP完成には最低限次を満たす。

### Primary Flow

- [ ] `Sync → Results → Analysis → Practice → 再Sync → Before / After` がEnd-to-Endで成立する

### Results

- [ ] Recent / Bestを取得できる
- [ ] 保存済みResultを一覧・詳細表示できる
- [ ] Search / Filter / Sortが機能する
- [ ] 同一Score IDが重複しない
- [ ] Manual Memoが再同期後も維持される

### Analysis

- [ ] 成長推移が実Dataから確認できる
- [ ] 難易度別分析が実Dataから確認できる
- [ ] 安定性分析が実Dataから確認できる
- [ ] Session比較が実Dataから確認できる
- [ ] Data不足Stateを扱える
- [ ] 分析結果から次のPracticeを判断できる情報がある

### Practice

- [ ] AnalysisからPracticeを作成できる
- [ ] Goal / Period / Actionを管理できる
- [ ] Before / Afterを比較できる
- [ ] Completion後にReviewを残せる

### Coaching

- [ ] ChatGPT提出用Dataを生成できる
- [ ] AI ResultをValidationしてImportできる
- [ ] AI提案をUser確認後にPracticeへ反映できる
- [ ] AI未利用でも主要Flowが成立する

### Storage / Recovery

- [ ] Reload後もDataが残る
- [ ] JSON BackupをExportできる
- [ ] BackupからRestoreできる
- [ ] 不正Importで既存Dataを失わない
- [ ] Migrationが必要な変更では既存Data互換性を確認する

### Failure State

- [ ] osu! API Failure時も保存済みDataを閲覧できる
- [ ] Supabase Failure時もLocal Coreを利用できる
- [ ] AI Provider未利用時もAnalysis / Practiceを利用できる

### UI State

主要Surfaceに必要な以下の状態を用意する。

- [ ] Loading
- [ ] Empty
- [ ] Error
- [ ] Success
- [ ] Data不足 / Stale等、該当Surfaceに必要な補助State

Dashboardを見たときに、Userが次に何をすればよいか判断できること。

### Desktop Companion

- [ ] 現行Launcherを維持する
- [ ] 既存Windows機能のRegressionを避ける
- [ ] Web主要Flowから独立して利用可能である
- [ ] Windows固有機能は必要な実Windows Validationを実施、または未確認を明記する

### Project Completion

- [ ] 崩してはいけない仕様を維持
- [ ] 必要なStatic / Runtime / Browser / Visual / Real-device Validationを実施、または未確認を明記
- [ ] README / Work Report / Learnings等、変更に関係するDocumentがCurrent Stateと一致
- [ ] 重大Known Issueが残っていない、または完成不可として明示

---

## 16. 未確認 / Known Limitations

### Non-blocking

- Sessionの自動境界判定RuleはImplementation時に実Dataを見て決める
- BPM / AR / OD / CS等、osu! APIだけで不足するBeatmap属性の取得元は実装時にCurrent API Responseと既存Dataを確認する
- 大量Result時の具体的Performance Thresholdは実Dataで測定して決める
- Visual Designの詳細は別のUI / 見た目作業で確定する
- 一般公開向けAuth / Cloud SyncはMVP外

### Blocking Decisions

None.

---

## 17. Implementation Handoff

- Status: Ready for implementation
- Requirements updated: `2026-09-07`
- GitHub save verified: Pending read-back verification
- Blocking Decisions: None
- Important Assumptions:
  - PC / 個人利用がPrimary
  - Local-firstを維持
  - Visual大規模変更は別作業
- Implementation conversation: `osu-hub（実装）`
