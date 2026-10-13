# STATUS — selectLOTO 購入入力補助（Chrome拡張）

> このファイルがこのリポジトリの進捗の**正**です。
> 作業したエージェントは、**コードの変更と同じコミットで**このファイルを更新してください。
> チャットでの伝言は記録として扱いません。食い違ったら `git log` を信じます。

最終更新: 2026-10-13 / 更新者: クラウドClaude（claude/pc-app-cowork-stuck-rzdkm3）

---

## 現在の版

| 対象 | 版 | commit | 状態 |
|---|---|---|---|
| Chrome拡張 | 2.0.15 | `6c6dd48` (main: `aa19d99`) | push済み |
| iOS版 (`TyhkSelect/selectloto`) | 1.6 / Build 10 | `69b610d` | push済み・実機確認待ち |
| Web版 | 未記入 | 未記入 | 未記入 |
| Server API | 未記入 | 未記入 | アップロード済みとの報告あり（未検証） |

> iOS / Web / Server の行は、担当エージェントが各自で埋めてください。
> 上記は他エージェントからの報告に基づく記載で、このリポジトリからは検証できていません。

---

## ⚠️ Web版との DOM 契約（変更時は必ず両方を直す）

拡張機能は selectloto.jp の DOM を**直接読んでいます**。Web版がこの構造を変えると拡張機能は
**エラーを出さずに壊れます**（組み合わせが0件になり「入力対象が未選択」と表示される）。
Web版を変更するエージェントは、この節を必ず確認してください。

### 表の構造 — `content_selectloto.js: readCurrentCombinations()`

`#combinationTable tbody tr` の各行を**列の位置で**読んでいます（`cells.length >= 4` が必要）:

| 列 | 読み取る内容 | コード |
|---|---|---|
| `cells[1]` | **セットナンバー** | `cells[1].textContent.trim()` |
| `cells[2]` | 数字（`.circle-background` の各要素） | `querySelectorAll('.circle-background')` |
| `cells[3]` | 口数 | `parseInt(cells[3].textContent, 10)` |

**列の順序・列数・`.circle-background` のクラス名を変えると壊れます。**

### 必要な要素・属性

| セレクタ / 属性 | 用途 |
|---|---|
| `#combinationTable` | 表本体。これが無いフレームは応答しない |
| `#combinationTable[data-undrawn]` | `'0'` で抽選済み → 自動入力不可 |
| `#combinationTable[data-input-state]` | 存在すれば「選択入力ページ」として扱う。共有キャッシュを使わない |
| `#combinationTable[data-deadline]` | epoch ms。現在時刻が過ぎていたら `not_ready` |
| `#ack` | 同意チェックボックス。`checked` でないと選択入力の転送を拒否 |
| `#_blkConfirm` | 「公式サイトへ」ボタン。`disabled` なら無反応 |

### イベント契約（選択入力ページ）

- 拡張機能は読み込み時に `document.documentElement.dataset.selectlotoAutofillBridge = '1'` を立てます。
  Web版はこれを見て、拡張機能が入っているか判定できます。
- Web版 → 拡張機能: `document.dispatchEvent(new CustomEvent('selectloto:autofill-selected'))`
- 拡張機能 → Web版: `selectloto:autofill-result`（`detail` が `'ok'` または `'error'`）

### 転送時のバリデーション（これを満たさないと `error` が返る）

- 組数が 1〜50
- 数字の個数が種別ごとに一致（loto6: 6 / loto7: 7 / miniloto: 5）、かつ重複なし
- 数字の範囲が 1〜最大（loto6: 43 / loto7: 37 / miniloto: 31）
- 口数が 1〜10 の整数

---

## 完了

- [x] **v2.0.15 選択入力連携** — 選択入力ページからの転送に対応（`selectloto:autofill-selected`）
- [x] **v2.0.15 保存先の誤参照防止** — 選択入力ページでは共有キャッシュ
      （`selectloto_current_combinations`）を使わず、その場で現在の表を読む。
      別タブのデータを誤って入力する不具合を防止
- [x] **v2.0.15 一覧表示順** — セット番号ラベル `S<n>` を数字の前に移動
- [x] **v2.0.15 締切・未準備の判定** — `data-deadline` 超過と未選択時に `not_ready` を返す
- [x] v2.0.12 待機時間短縮（500→200ms, 800→200ms）・停止後再開バグ修正
- [x] v2.0.6 スマホ版ページのボタンから公式サイトを直接開く
- [x] v2.0.5 Orion iOS の iframe 対応（storage フォールバック）
- [x] v2.0.4 抽せん回の照合チェック（受付終了後の誤入力防止）

## 進行中

- [ ] （なし）担当: — / ブランチ: —

## 未検証 / 要確認

- [ ] **セットナンバー保存の方式変更に伴う DOM 契約の再確認** ← 最優先。
      Web版の変更で上記の列構成（特に `cells[1]` のセットナンバー）が変わっていないか。
      変わっている場合は `content_selectloto.js` の修正が必要
- [ ] 選択入力ページからの転送を実機（iOS Orion / デスクトップChrome）で確認
- [ ] 50組を超える選択を弾く挙動の確認（`combinations.length > 50` で `error`）
- [ ] iOS 1.6/10 の実機結合確認（iOS側リポジトリの担当範囲）

---

## 担当分担（同じファイルを複数のエージェントに触らせない）

| 対象 | リポジトリ | 担当 |
|---|---|---|
| iOS アプリ | `TyhkSelect/selectloto` | Codex / ChatGPT |
| Web版 | 未記入 | VS Code Claude |
| Chrome拡張 | `TyhkSelect/selectloto-chrome-extention` | クラウドClaude |
| Server API | 未記入 | 未記入 |

> **Web版と Chrome拡張は DOM 契約で密結合しています。** 片方を変えるときは、
> 上の「DOM契約」節を更新し、もう片方の担当に影響範囲を伝えてください。

---

## 運用ルール

1. 作業を頼むときは「`docs/STATUS.md` を読んでから」で始める。進捗をチャットで伝言しない
2. 作業完了時、**コードと同じコミットで**このファイルを更新する
3. 版の呼び方を統一する — 「拡張 2.0.15」「iOS 1.6/10」「commit `6c6dd48`」のように一意な言い方だけを使う
4. 担当分担を守る。同じファイルを2つのエージェントに触らせない
5. 記録とコミット履歴が食い違ったら、**履歴を信じる**

---

## 引き継ぎメモ

- iOS側の設計資料: `TyhkSelect/selectloto` の `docs/IOS_SELECTION_COMMENT.md`
- このリポジトリは public、`TyhkSelect/selectloto` は private。
  クラウドのClaudeセッションは**開始時に選んだリポジトリしか読めない**ため、
  iOS側を扱うときは `selectloto` を選択してセッションを開始すること
