# DES-085: Cross-Platform KaTeX Math Formula Extraction

## Context

**Problem**: Perplexity, ChatGPT, and Claude use standard KaTeX which stores LaTeX source in `<annotation encoding="application/x-tex">` inside MathML structures. DOMPurify strips MathML before Turndown sees it, so math formulas degrade to garbled text like `EV=i∑xipi` instead of `$EV = \sum_i x_i\,p_i$`.

**Why now**: Issue #85 — Perplexity math rendering is broken. Same issue affects ChatGPT and Claude.

**Outcome**: All four platforms (Gemini, Perplexity, ChatGPT, Claude) produce correct `$LATEX$` / `$$\nLATEX\n$$` output in Obsidian.

## Design Decision: Option A (Pre-processing)

**Chosen**: Pre-process standard KaTeX HTML **before** DOMPurify, converting `<annotation>` content to `data-math` attributes. Existing Turndown rules work as-is.

**Why Option A over alternatives**:
- Zero security surface increase (MathML still stripped by DOMPurify)
- Zero changes to Turndown rules, extractors, or markdown.ts
- Single function addition to `sanitize.ts` — maximum code reuse
- Gemini coexistence is natural (`closest('[data-math]')` guard)

## Implementation Steps

### Step 1: Add `preprocessKatex()` to `src/lib/sanitize.ts`

Add two functions:

```typescript
/** Extract LaTeX from standard KaTeX annotation element */
function extractLatexFromKatex(element: Element): string | null {
  const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
  return annotation?.textContent?.trim() || null;
}

/** Convert standard KaTeX HTML to data-math attribute format */
export function preprocessKatex(html: string): string {
  if (!html.includes('katex')) return html; // fast path

  const doc = new DOMParser().parseFromString(html, 'text/html');
  let modified = false;

  // Phase 1: Display math (span.katex-display → div[data-math])
  for (const el of doc.querySelectorAll('span.katex-display')) {
    if (el.closest('[data-math]')) continue; // Gemini — skip
    const latex = extractLatexFromKatex(el);
    if (!latex) continue;
    const div = doc.createElement('div');
    div.setAttribute('data-math', latex);
    el.replaceWith(div);
    modified = true;
  }

  // Phase 2: Inline math (span.katex → span[data-math])
  for (const el of doc.querySelectorAll('span.katex')) {
    if (el.closest('[data-math]') || el.closest('.katex-display')) continue;
    const latex = extractLatexFromKatex(el);
    if (!latex) continue;
    const span = doc.createElement('span');
    span.setAttribute('data-math', latex);
    el.replaceWith(span);
    modified = true;
  }

  return modified ? doc.body.innerHTML : html;
}
```

### Step 2: Integrate into `sanitizeHtml()` in `src/lib/sanitize.ts`

One-line change — pass through `preprocessKatex()` before DOMPurify:

```typescript
export function sanitizeHtml(html: string): string {
  const preprocessed = preprocessKatex(html);  // ← NEW
  // ... rest unchanged, but use `preprocessed` instead of `html`
}
```

### Step 3: Add unit tests in `test/lib/sanitize.test.ts`

New `describe('preprocessKatex')` block covering:
1. Display math conversion (`span.katex-display` → `div[data-math]`)
2. Inline math conversion (`span.katex` → `span[data-math]`)
3. Mixed display + inline in same HTML
4. Gemini coexistence (skip elements inside `[data-math]`)
5. No annotation → element left unchanged (fallback)
6. Empty/whitespace-only annotation → skip
7. HTML entity decoding (`&amp;` in LaTeX like pmatrix `a & b`)
8. Multi-line annotation content (Perplexity pattern) → trimmed
9. No katex in HTML → early return (unchanged)
10. Multiple formulas in one HTML block

New `sanitizeHtml` integration tests:
11. Standard KaTeX through full sanitize pipeline → `data-math` preserved
12. MathML stripped after preprocessing

### Step 4: Add markdown integration tests in `test/content/markdown.test.ts`

New `describe('standard KaTeX math (REQ-085)')` block:
1. Standard KaTeX display math → `$$\nLATEX\n$$`
2. Standard KaTeX inline math → `$LATEX$`
3. Inline math within paragraph → `Text $LATEX$ text`
4. Complex LaTeX with `&` (pmatrix) → correct output
5. Existing 7 Gemini math tests still pass (no changes)

### Step 5: E2E verification via existing fixtures

Existing fixtures already contain KaTeX HTML:
- `test/fixtures/html/perplexity/chat-simple.html` — inline math with quadratic formula, integrals
- `test/fixtures/html/claude/chat-simple.html` — display math with pmatrix
- `test/fixtures/html/chatgpt/chat-simple.html` — KaTeX math formulas
- `test/fixtures/html/gemini/chat-simple.html` — Gemini `data-math` (should not change)

Run E2E tests and update snapshots. Review diffs: only math-related improvements expected.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/sanitize.ts` | Add `preprocessKatex()`, `extractLatexFromKatex()`; modify `sanitizeHtml()` |
| `test/lib/sanitize.test.ts` | Add ~12 unit tests + ~2 integration tests |
| `test/content/markdown.test.ts` | Add ~5 integration tests |

**No changes to**: `src/content/markdown.ts`, any extractor files, any other source files.

## Verification

1. `npm run build` — TypeScript compiles cleanly
2. `npm test` — all existing tests pass + new tests pass
3. `npm run lint` — 0 errors
4. E2E snapshots reviewed for correctness (math now renders as LaTeX)
5. Gemini E2E snapshot unchanged (no regression)
