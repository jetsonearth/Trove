# REQ-085: Cross-Platform KaTeX Math Formula Extraction

## Issue

- GitHub: #85 — Perplexity Math error
- Priority: Medium
- Scope: Perplexity, ChatGPT, Claude (Geminiは既対応)

## Background

Perplexity, ChatGPT, Claude はいずれも標準 KaTeX ライブラリで数式をレンダリングしている。KaTeX の HTML 出力には `<annotation encoding="application/x-tex">` 内にLaTeXソースが含まれるが、現在の Turndown ルールは Gemini 固有の `data-math` 属性にのみ対応しており、標準 KaTeX 構造を処理できない。

結果として、数式が `EV=i∑xipi` のようなレンダリング済みテキストとして保存され、LaTeX表記（`$EV = \sum_i x_i\,p_i$`）にならない。

### 各プラットフォームの数式DOM構造

| Platform | Library | LaTeX Source Location | Container |
|----------|---------|----------------------|-----------|
| **Gemini** | Custom KaTeX | `data-math` attribute | `div[data-math]`, `span[data-math]` |
| **Perplexity** | Standard KaTeX | `<annotation encoding="application/x-tex">` | `span.katex-display`, `span.katex` |
| **ChatGPT** | Standard KaTeX | `<annotation encoding="application/x-tex">` | `span.katex-display`, `span.katex` |
| **Claude** | Standard KaTeX | `<annotation encoding="application/x-tex">` | `span.katex-display`, `span.katex` |

### 標準KaTeX HTML構造

```html
<!-- Display math (ブロック数式) -->
<span class="katex-display">
  <span class="katex">
    <span class="katex-mathml">
      <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <semantics>
          <mrow>...</mrow>
          <annotation encoding="application/x-tex">E = mc^2</annotation>
        </semantics>
      </math>
    </span>
    <span class="katex-html" aria-hidden="true">...</span>
  </span>
</span>

<!-- Inline math (インライン数式) -->
<span class="katex">
  <span class="katex-mathml">
    <math xmlns="http://www.w3.org/1998/Math/MathML">
      <semantics>
        <mrow>...</mrow>
        <annotation encoding="application/x-tex">x^2</annotation>
      </semantics>
    </math>
  </span>
  <span class="katex-html" aria-hidden="true">...</span>
</span>
```

## Solution Approach

1. KaTeX 構造を DOMPurify 通過前に前処理し、LaTeX ソースを `data-math` 属性に変換する（既存 Turndown ルールを再利用）
2. または、Turndown に標準 KaTeX 用の新規ルールを追加する

## Functional Requirements

### FR-1: DOMPurify の MathML 対応

現在 DOMPurify の `USE_PROFILES: { html: true }` 設定では MathML 要素（`<math>`, `<semantics>`, `<annotation>`）がストリップされる。以下のいずれかで対処:

- **Option A (前処理)**: `sanitizeHtml()` の前に KaTeX HTML を前処理し、`<annotation>` から LaTeX を抽出して親要素の `data-math` 属性に設定する。既存の Turndown ルールがそのまま動作する
- **Option B (DOMPurify設定)**: MathML 要素を許可リストに追加し、新規 Turndown ルールで処理する
- **Option C (Turndownルール追加)**: DOMPurify 前処理で `data-math` 属性への変換を行い、かつ Turndown ルールは既存のまま

### FR-2: Display Math (ブロック数式) の変換

- `span.katex-display` 内の `<annotation encoding="application/x-tex">` からLaTeXソースを抽出
- Obsidian形式: `$$\nLATEX\n$$` として出力
- 前後に空行を挿入

### FR-3: Inline Math (インライン数式) の変換

- `span.katex`（`.katex-display` の子ではない）内の `<annotation>` からLaTeXソースを抽出
- Obsidian形式: `$LATEX$` として出力
- 前後のテキストとの間にスペースを適切に保持

### FR-4: Gemini との共存

- 既存の `data-math` ベースの Turndown ルール（`mathBlock`, `mathInline`）は変更しない
- Gemini の DOM は `data-math` 属性を持つため、既存ルールが優先的にマッチする
- 標準 KaTeX ルールは `data-math` を持たない要素にのみ適用

### FR-5: フォールバック

- `<annotation>` 要素が見つからない場合、`span.katex-html` のテキストコンテンツをフォールバックとして使用（品質は低下するが情報は保持）
- LaTeX ソースが空の場合、元のテキストコンテンツをそのまま出力

## Non-Functional Requirements

- 既存の Gemini 数式テスト (7ケース) が壊れないこと
- 数式を含まないページの処理に影響しないこと

## Acceptance Criteria

1. Perplexity の KaTeX display math → `$$\nLATEX\n$$` として出力
2. Perplexity の KaTeX inline math → `$LATEX$` として出力
3. ChatGPT の KaTeX math → 同様に正しく変換
4. Claude の KaTeX math → 同様に正しく変換
5. Gemini の `data-math` ベースの数式 → 既存動作が維持される
6. 数式を含まないページ → 出力に変化なし
7. Obsidian で数式が正しくレンダリングされる

## Affected Files

| File | Change |
|------|--------|
| `src/content/markdown.ts` | 標準 KaTeX 用 Turndown ルール追加 or 前処理関数追加 |
| `src/lib/sanitize.ts` | (Option次第) MathML許可 or 前処理フック追加 |
| `test/content/markdown.test.ts` | 標準 KaTeX パターンのテストケース追加 |

## Open Questions

1. FR-1 の Option A / B / C のどれを採用するか（設計フェーズで決定）

## References

- [KaTeX copy-tex contrib](https://github.com/KaTeX/KaTeX/tree/main/contrib/copy-tex) — KaTeX公式のLaTeX抽出モジュール
- [copy-latex-chrome-extension](https://github.com/Mapaor/copy-latex-chrome-extension) — 複数プラットフォーム対応のLaTeX抽出拡張
- [obsidian-importer commit 866eada](https://github.com/obsidianmd/obsidian-importer/issues/361) — 角括弧エスケープの参考実装
