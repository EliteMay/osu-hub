# osu! Hub

osu!のプレイ記録、AIコーチング、練習管理、統計、プレイヤー設定、Windows補助ツールを1か所にまとめる個人向けハブです。

Web側はGitHub Pagesで利用できる静的HTML/CSS/JS、Windows固有の操作は既存Electron製 `osu Setup Launcher` が担当します。

## 目的

- osu!のリザルトや練習履歴を残す
- 複数リザルト画像をChatGPTへ渡しやすい形にまとめる
- AIコーチング結果をJSONで戻して履歴化する
- Accuracy / Miss / PP / MODなどの変化を見る
- 練習内容と設定を保存する
- 音声切替、OpenTabletDriver、遅延対策、osu!lazer起動をDesktop Toolとして残す

## Web版 v0.1.0

### Home
- Results / Coaching / Practice件数
- 平均Accuracy
- 最近のリザルト
- 各機能への導線

### AI Coaching
1. リザルト画像を複数ドラッグ&ドロップ
2. セッション名、目的、本人メモを入力
3. `提出ZIPを作成`
4. ZIPをChatGPTへアップロード
5. ChatGPTが返したJSONをWebへ取り込む

提出ZIP:

```text
osu_coaching_YYYY-MM-DD.zip
├─ prompt.txt
├─ coaching_manifest.json
├─ notes.txt
└─ results/
   ├─ 001_result.png
   └─ ...
```

ZIP生成にはJSZip 3.10.1をjsDelivrから読み込みます。CDNが利用できない場合はJSONとTXTを個別保存するフォールバックがあります。

### Results
- 譜面名
- 日付
- MOD
- Accuracy
- Miss
- Combo
- PP
- Star Rating
- BPM
- メモ

### Stats
- 平均Accuracy
- 平均Miss
- 最高PP
- 直近20件のAccuracy
- MOD別件数 / 平均Accuracy

### Practice
- 日付
- カテゴリ
- 練習内容
- 時間
- メモ
- 完了チェック

### Settings
- プレイヤー名
- モード
- DPI / osu!感度
- Tablet Area / Offset
- メモ
- JSONバックアップ / 復元

### Desktop Tools
既存の `osu Setup Launcher v0.17.0` を削除せず継続利用します。

- 音声出力切替
- OpenTabletDriver起動
- REAL等の遅延対策アプリ起動
- osu!lazer自動検出 / 起動
- GitHub ReleasesからWindows版を配布する想定

## データ保存

### Web
ブラウザのIndexedDB `osuHubDB` に保存します。

Object Store:

```text
results
coaching
practice
settings
```

GitHub Pagesや公開リポジトリへユーザーのプレイデータを自動送信しません。

ブラウザデータ削除に備えて、SettingsページからJSONバックアップを保存できます。

### Desktop Launcher
- `data/config.json`: 公開用初期値
- 実際のユーザー設定: Electron `userData/config.json`
- ログ: アプリ側ログ保存先

個人PC固有パスは公開用 `data/config.json` に保存しません。

## GitHub Pages

Web公開用ワークフロー:

```text
.github/workflows/pages.yml
```

公開対象は次だけに絞っています。

```text
index.html
pages/
css/
js/
data/site.json
```

Electronソースやbat類はPages配信物へ含めません。

公開URL:

```text
https://elitemay.github.io/osu-hub/
```

`Deploy osu Hub Pages` ワークフローの成功を確認済みです。実ブラウザ上での全操作・見た目の最終確認は別途行います。

## 自動チェック

`.github/workflows/check-web.yml` で以下を確認します。

- `js/storage.js` / `js/app.js` のJavaScript構文
- `data/site.json` / `data/config.json` / `version.json` のJSON形式
- `index.html` と `pages/*.html` のローカルリンク切れ

初回チェックは成功済みです。

## ファイル構成

```text
index.html
pages/
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
data/
  site.json
  config.json                  # Desktop Launcher初期設定
  update-version.example.json
desktop/
  setup-launcher/
    README.md
src/                            # 現行Electron Launcher本体
tools/                          # Desktop Launcher補助スクリプト
.github/workflows/
  pages.yml
  check-web.yml
  build-windows.yml
package.json
version.json                    # Desktop Launcher更新情報
仕様書.md
作業報告書.md
```

## Desktop Launcherの配置について

現時点では既存Launcherを壊さないことを優先し、Electron本体は従来どおりリポジトリ直下の `src/`, `tools/`, bat類を利用します。

`desktop/setup-launcher/README.md` を追加し、osu! Hub内のDesktop Toolであることを明確化しました。本体の物理移動は、Windowsビルド・設定保存・外部ツール取得への影響を確認してから行います。

## Setup Launcherの更新確認

リポジトリ名変更に合わせて、更新確認URLを次へ変更済みです。

```text
https://raw.githubusercontent.com/EliteMay/osu-hub/main/version.json
```

配布先:

```text
https://github.com/EliteMay/osu-hub/releases
```

## 崩してはいけない仕様

### Web
- APIキーを公開コードへ埋め込まない
- 個人のプレイデータをGitHubへ自動保存しない
- GitHub Pages配下でも相対パスが壊れない
- データ削除・上書きは必要以上に自動化しない
- バックアップ / 復元手段を維持する

### Desktop
- 音声切替 → OpenTabletDriver → 遅延対策アプリ → osu!lazer の一括起動
- osu!本体の自動操作やプレイ補助を行わない
- 更新時にユーザー設定を意図せず消さない
- 起動失敗時はログに理由を残す
- 外部ツールexeや秘密情報を公開リポジトリへ直接含めない

## 既知の問題 / 未確認

- GitHub Pagesの実ブラウザで全ページ・主要操作を通した最終確認は未実施
- Windows実機でのSetup Launcher動作は今回未確認
- GitHub ReleasesのSetup.exe初回配布はまだ未実施
- AI Coachingの画像内容自体はWeb側で解析せず、ChatGPTへ渡して解析する方式
- AI Coachingで選択中の画像はページ再読み込み後には保持しない
- ResultsのスクリーンショットOCR自動入力は未実装
- Setup Launcherの音声切替はWindows環境依存の問題が残っている

## 今後の候補

- osu! API連携
- スコア / PP自動取得
- `.osu` 譜面解析
- `.osr` Replay管理
- Beatmap Collections
- Skin管理
- BPM / ★ / AR / OD別統計
- Aim / Stream / Burst / Speed / Readingタグ
- AIコーチング結果からPracticeへ直接追加
- Session比較
- 目標管理

詳細は `仕様書.md` を参照してください。
