# Investigation: Flashcard Shuffle (Xáo Thẻ) in Self-Study (Tự Học)

## Summary Answer

**The shuffle button exists and works, but shuffle is NEVER called automatically when entering any study session.** Every path that starts a flashcard session — selecting a level, choosing a range, clicking "Học ngay" on the home dashboard, or starting a custom deck via `startStudySession()` — loads `deck` in the original sorted order and calls `renderFlash()` directly, without ever calling `shuffle(deck)` first.

The user must manually click the shuffle button (`shuffleBtn`) each time they enter the flashcard view. There is no auto-shuffle on session start.

---

## Evidence

### 1. Where is the flashcard logic?

**File:** `c:\Users\DAnnotator2\Khanh\hanyu\app.js`

Key functions:
- `applyRange()` (line 506) — builds `deck[]` from the selected level+range, resets `fcIdx=0`, calls `renderFlash()`.
- `renderFlash()` (line 590) — renders the current card at `deck[fcIdx]` to the DOM.
- `fcNext.onclick` / `fcPrev.onclick` (lines 650–667) — increment/decrement `fcIdx` and call `renderFlash()`.
- `startStudySession(deckName, words, mode)` (line 2186) — for custom decks, sets `deck = [...words]` and calls `renderFlash()`.

### 2. Is there a shuffle function? When/how is it called?

**Yes, there is a shuffle function** (line 530):

```js
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
}
```

It is called in exactly **three places**:
1. `shuffleBtn.onclick` (line 531) — only when the user clicks the shuffle button manually.
2. `newQuiz()` (line 861) — shuffles the `quizPool` when starting a quiz, not flashcards.
3. Inside `newQuiz()` again (lines 908, 919) — shuffles distractors and answer options.

**There is no call to `shuffle(deck)` inside `applyRange()`, `startStudySession()`, or any navigation path.**

### 3. Why does shuffle NOT happen automatically when entering tự học mode?

All entry points to flashcard mode load the deck in sequential order:

#### Path A: Level/range selector change
```js
// applyRange() — app.js line 506
function applyRange() {
  // ...
  deck = src.slice(a, b); // straight slice, no shuffle
  fcIdx = 0;
  // ...
  renderFlash(); // renders card 0 in sorted order
}
```

#### Path B: "Học ngay" on home dashboard HSK card
```js
// app.js line 1508–1519
card.querySelector('.start-learn-btn').onclick = () => {
  lvlSel.value = lvl;
  lvlSel.dispatchEvent(new Event('change')); // triggers applyRange() — no shuffle
  const flashMenu = document.querySelector('...[data-section="flash"]');
  if (flashMenu) flashMenu.click();
};
```

#### Path C: `startStudySession()` for custom decks (mode: 'flashcard' or 'both')
```js
// app.js line 2186–2224
function startStudySession(deckName, words, mode) {
  level = deckName;
  deck = [...words]; // straight copy, no shuffle
  fcIdx = 0;
  // ...
  if (mode === 'flashcard') {
    flashMenu.click();
    renderFlash(); // renders in original order
  }
}
```

None of these paths call `shuffle(deck)` before `renderFlash()`.

### 4. Exactly what code change is needed

**Minimum fix — auto-shuffle in `applyRange()`:**

In `applyRange()`, add a `shuffle(deck)` call right after `deck = deduplicateWords(deck)` and before `fcIdx = 0`:

```js
// app.js — inside applyRange(), around line 518–526
function applyRange() {
  if (typeof DATA === 'undefined') return;
  const v = $('rangeSel').value;
  let src;
  if (level === 'favorites') {
    src = favorites;
  } else {
    if (!DATA[level]) return;
    src = DATA[level];
  }

  if (v === 'all' || level === 'favorites') { deck = src.slice(); }
  else { const [a, b] = v.split('-').map(Number); deck = src.slice(a, b); }
  
  deck = deduplicateWords(deck);
  shuffle(deck);          // ← ADD THIS LINE
  fcIdx = 0; wIdx = 0; qScore = 0; qTotal = 0;
  // ...
  renderFlash(); renderWriterList(); renderWriter(); newQuiz();
  renderFavIcon();
}
```

**Optional: also shuffle in `startStudySession()` for custom decks:**

```js
function startStudySession(deckName, words, mode) {
  level = deckName;
  deck = [...words];
  shuffle(deck);          // ← ADD THIS LINE
  fcIdx = 0;
  // ...
}
```

This is the only change needed. The `shuffle()` function already exists and is correct; it just isn't being called at session start.

If the user prefers auto-shuffle to be opt-in (controlled by a setting), a checkbox in Settings could gate the `shuffle(deck)` call. But the simplest fix to match the reported expectation ("tự động thay đổi xáo thẻ") is to always shuffle on deck load.

---

## 5. HSK1 Data Loading Issues

Two potential bugs spotted:

### Bug A: `level` initial value mismatch with DATA keys

The global state is initialized as:
```js
let level = 'HSK1';   // app.js line 154
```

But the DATA object uses spaced keys:
```js
const DATA = { "HSK 1": [...], "HSK 2": [...] }   // data.js line 5
```

So `DATA[level]` where `level = 'HSK1'` returns `undefined`. This means on first load (before `initUIWithData` runs and sets `lvlSel.value`), any code path that uses `DATA[level]` directly will fail silently.

Notably, `loadProgress()` calls `applyRange()`, which does `if (!DATA[level]) return;` — so on first load with the saved level `'HSK1'`, it would early-return and show an empty deck until the selector triggers the corrected key.

**Impact:** On a fresh browser session (no saved progress), the flashcard view may appear empty briefly or not render until the user interacts with the level selector. The `loadProgress()` path at DOMContentLoaded is at risk.

### Bug B: `toggleFavorite()` fallback level uses `'HSK1'` (no space)

```js
// app.js line 680
const levelGoc = Object.keys(DATA).find(lvl =>
  DATA[lvl] && DATA[lvl].some(item => item.h === w.h)
) || 'HSK1';  // ← fallback is 'HSK1', but DATA keys are 'HSK 1'
```

If the word is not found in DATA (e.g., custom deck word), `levelGoc` gets `'HSK1'` (no space). Later, when `navigateToWord` uses this, `DATA['HSK1']` returns `undefined` and the navigation silently fails.

**Impact:** Clicking a favorited word from a custom deck in the favorites list will not navigate anywhere.

---

## Conclusions and Recommendations

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | No auto-shuffle on session start | High (reported bug) | Add `shuffle(deck)` in `applyRange()` after `deduplicateWords()`, and in `startStudySession()` after `deck = [...words]` |
| 2 | `level` initial value `'HSK1'` vs DATA key `'HSK 1'` | Medium | Change initial value to `let level = 'HSK 1'` or normalize keys at load time |
| 3 | Favorite fallback level `'HSK1'` (no space) | Low | Change fallback to `'HSK 1'` to match DATA keys |

The shuffle fix (issue 1) is a 1-line addition in `applyRange()` and an optional 1-line addition in `startStudySession()`. No structural changes required.
