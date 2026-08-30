# osu! Hub

osu!のプレイ記録、アカウント同期、AIコーチング、練習管理、統計、プレイヤー設定、Windows補助ツールを1か所にまとめる個人向けハブです。

- Web: GitHub Pagesで動く静的HTML/CSS/JS
- osu! API中継: Cloudflare Worker
- Windows固有操作: Electron製 `osu Setup Launcher`

## 目的

- osu!アカウントからRecent Scoresを自動取得する
- 手入力とAPI同期のResultsを同じ場所で管理する
- 複数リザルトやプレイデータをChatGPTへ渡しやすくする
- Accuracy / Miss / PP / MODなどの変化を見る
- 練習内容と設定を保存する
- Setup LauncherをDesktop Toolとして残す

## Web版 v0.2.0

### Account Sync

`pages/account.html` からCloudflare Worker経由でosu!api v2を利用します。

- osu! User IDまたはユーザー名を指定
- rulesetを選択
- Recent Scoresを1〜100件取得
- Failスコアを含めるか選択
- 取得したスコアをIndexedDBの`results`へ保存
- `osu:<score id>`をキーに重複を整理
- 既存同期スコアは再取得時に更新
- 手入力の`note`は同期更新で消さない

保存する主な値:

- Accuracy
- Miss
- Combo
- PP
- Star Rating
- BPM
- AR / OD / CS / HP
- MOD
- Rank
- Pass / Fail
- Replay有無
- Beatmap / Beatmapset ID
- プレイ日時

### AI Coaching

1. リザルト画像を複数ドラッグ&ドロップ
2. セッション名、目的、本人メモを入力
3. `提出ZIPを作成`
4. ZIPをChatGPTへアップロード
5. ChatGPTが返したJSONをWebへ取り込む

現在は画像中心。今後、Account Syncで取得したプレイJSONもコーチング提出へ直接含める予定です。

### Results / Stats / Practice / Settings

- Results: API同期 + 手入力の履歴
- Stats: 平均ACC、平均Miss、最高PP、直近ACC、MOD別集計
- Practice: 練習内容・時間・完了管理
- Settings: DPI、感度、Tablet Area、JSONバックアップ / 復元

### Desktop Tools

既存の `osu Setup Launcher v0.17.0` は削除せず継続します。

- 音声出力切替
- OpenTabletDriver起動
- REAL等の遅延対策アプリ起動
- osu!lazer自動検出 / 起動

## osu! API / Cloudflare Worker

Workerソース:

```text
cloudflare/worker/
├─ src/index.js
├─ wrangler.toml
├─ package.json
├─ .dev.vars.example
└─ README.md
```

### 必要なSecret

```text
OSU_CLIENT_ID
OSU_CLIENT_SECRET
```

これらは**GitHub Pages、`data/site.json`、JavaScriptへ書きません**。

Cloudflare WorkersのSecretとして設定します。

### Workerセットアップ

1. osu! Account SettingsでOAuth Applicationを登録
2. Client ID / Client Secretを取得
3. `cloudflare/worker/` で依存関係を導入
4. CloudflareへSecretを登録
5. Workerをdeploy
6. 発行されたWorker URLを`Account Sync`へ入力

詳細は `cloudflare/worker/README.md` を参照してください。

## データ保存

WebユーザーデータはブラウザのIndexedDB `osuHubDB` に保存します。

```text
results
coaching
practice
settings
```

Account SyncのWorker URL・対象ユーザー・最終同期時刻も`settings`に保存します。

プレイデータを公開GitHubへ自動保存する処理はありません。ブラウザデータ削除に備え、SettingsからJSONバックアップできます。

## GitHub Pages

公開URL:

```text
https://elitemay.github.io/osu-hub/
```

`.github/workflows/pages.yml` でWebファイルのみ公開します。

```text
index.html
pages/
css/
js/
data/site.json
```

Cloudflare Workerソース、Electronソース、bat類はPages配信物へ含めません。

## 自動チェック

`.github/workflows/check-web.yml` で以下を確認します。

- `js/storage.js`
- `js/app.js`
- `js/osu-sync.js`
- `cloudflare/worker/src/index.js`
- JSON形式
- HTML内ローカルリンク

## ファイル構成

```text
index.html
pages/
  account.html
  coaching.html
  results.html
  practice.html
  stats.html
  settings.html
  tools.html
css/
  styles.css
js/
  storage.js
  app.js
  osu-sync.js
data/
  site.json
  config.json
cloudflare/
  worker/
desktop/
  setup-launcher/
src/                         # Electron Launcher本体
tools/                       # Desktop Launcher補助
.github/workflows/
  pages.yml
  check-web.yml
  build-windows.yml
package.json
version.json                 # Desktop Launcher更新情報
仕様書.md
作業報告書.md
```

## 崩してはいけない仕様

### Web / API

- osu! Client Secretを公開コードへ入れない
- `.dev.vars` / `.env`をGitへコミットしない
- 個人プレイデータをGitHubへ自動送信しない
- GitHub Pages配下でも相対パスを維持する
- 手入力ResultsをAPI同期で削除しない
- 同一osu! Score IDの重複を増やさない
- JSONバックアップ / 復元を維持する
- AI Coachingは有料APIを必須にしない

### Desktop

- 音声切替 → OpenTabletDriver → 遅延対策アプリ → osu!lazer の一括起動
- osu!本体の自動操作やプレイ補助を行わない
- 更新時にユーザー設定を意図せず消さない
- 外部ツールexeや秘密情報を公開リポジトリへ直接含めない

## 既知の問題 / 未確認

- Cloudflare WorkerはまだユーザーのCloudflareアカウントへ本番deployしていない
- osu! OAuth Client ID / Secretの本番設定は未実施
- 実アカウントでRecent Scores同期をまだ実行していない
- API同期は現在Recent Scores最大100件。過去全履歴のページング同期は未実装
- AI Coachingへ同期済みResultsを直接選択して含める機能は未実装
- Windows実機でのSetup Launcher音声切替問題は別途継続確認が必要
- GitHub ReleasesのSetup.exe初回配布は未実施

## 今後の候補

- Account Syncの自動同期 / 差分取得
- Best Scores同期
- API同期ResultsをAI Coachingへ直接追加
- BPM / ★ / AR / OD別統計
- `.osu` 譜面解析
- `.osr` Replay管理・解析
- Beatmap Collections
- Skin管理
- Aim / Stream / Burst / Speed / Readingタグ
- Session比較
- 目標管理

詳細は `仕様書.md` を参照してください。
