# Implementation Plan: Multi-Page App Refactor

## Overview

Refactor the single-file SPA at `c:\Users\DAnnotator2\Khanh\hanyu` into a multi-page app.
The original `app.js` stays intact. New HTML pages + `js/` files are created alongside it.
The shuffle-on-load bug and `level` initial value mismatch ('HSK1' vs 'HSK 1') are fixed as part of this refactor.

---

## AppState Shape (window.AppState via js/shared.js)

```js
window.AppState = {
  level,        // string: 'HSK 1' (default), 'HSK 2', ..., 'favorites', or custom deck name
  deck,         // array of { h, p, m, ex } — current active deck
  fcIdx,        // int — current flashcard index
  wIdx,         // int — current writer index
  favorites,    // array of { h, p, m, ex, levelGoc }
  quizMode,     // string: 'hanzi-to-mean' etc.
  quizPool,     // array — unseen quiz words in current round
  quizAskedWords, // array — seen quiz words in current round
  qScore,       // int
  qTotal        // int
}
```

Persisted to localStorage under existing keys (`wq_progress`, `wq_favorites`, `wq_quiz_mode`).
`level`, `fcIdx`, `wIdx` are part of `wq_progress` (same schema as original `saveProgress()`).

---

## Function-to-File Mapping

### js/shared.js
- `showToast()`, `window.wqPopup` (alert/confirm/prompt)
- `deduplicateWords()`
- `shuffle()`
- `speak()`, `loadVoices()`, voice state
- Particle animation (canvas `bg-canvas`, `Particle` class, `initParticles`, `animateParticles`)
- Theme init (read `wq_theme` from localStorage)
- `loadDataFromAPI()`, API init timeout block
- `initUIWithData()`, `buildRanges()`, `applyRange()`, `updateFavOptionText()`
- `saveProgress()`, `loadProgress()`
- `removePinyinTones()`, search box logic (`searchInput`, `searchSuggestions`)
- `navigateToWord()` — on multi-page, navigates to `flash.html` with state in localStorage
- `initSidebarNavigation()` — sets active item by current `location.pathname`
- `window.AppState` assignment
- Sidebar toggle (hamburger button)
- Header title update (based on current page)
- Profile button (`openProfileBtn`)
- `learnSelectorsWrapper` visibility (shown only on flash/quiz/write pages)
- `window.WQSyncData`
- `levelSel` / `rangeSel` / `shuffleBtn` event bindings
- `startAutoplay` / `stopAutoplay` are referenced from flash.js; shared.js only exposes state

### js/flash.js
- `renderFlash()`
- `renderFavIcon()`
- `toggleFavorite()`
- Flashcard click/flip, mousemove parallax
- `fcNext`, `fcPrev`, `fcAudio`, `fcFav` button bindings
- Swipe gesture (`touchstart`, `touchend`, `handleSwipe`)
- `startAutoplay()`, `stopAutoplay()`, `runAutoplayCycle()`
- `autoplayBtn` binding
- Keyboard arrow/space handler
- `checkFlashcardComplete()` — cross-page: saves `wq_study_mode` / `wq_study_deck` to sessionStorage then checks at end of deck
- `recordLearnedWord()`

### js/quiz.js
- `newQuiz()`
- `answer()`
- `recordSrsAnswer()`
- Quiz mode buttons event bindings
- `qNext`, `qAudio`, `qBackBtn` bindings
- `renderQuizHskGrid()`, `renderQuizCustomDecks()`
- `startQuizWithDeck()`, `backToQuizSelection()`
- `window.startQuizWithDeck = startQuizWithDeck`

### js/write.js
- `renderWriterList()`, `renderWriter()`, `buildWriter()`
- `wAnimate`, `wQuiz`, `wAudio` button bindings

### js/stats.js
- `renderStatsSection()`

### js/favorites.js
- `renderFavModalList()`
- `favListBtn`, `closeFavModalBtn` bindings (if those IDs exist on favorites.html)

### js/custom.js
- Entire `CUSTOM DECK FEATURE` IIFE from app.js
- `initCustomDeckEvents()`
- `loadCustomHistory()`, `saveCustomHistory()`, `renderCustomHistory()`, `renderCustomWordsList()`
- `addManualWord()`, `saveCustomDeck()`, `studyCustomDeck()`, `showStudyModeModal()`
- `startStudySession()` — cross-page: saves deck+mode to localStorage, then `window.location.href = 'flash.html'` or `quiz.html`
- `checkFlashcardComplete()` — same as flash.js copy; must be in both since flash.js runs on flash.html and custom.js runs on custom.html (where it's invoked via studyModeModal)
- JSON import logic (`openImportJsonModal`, `processJsonImport`, etc.)
- `window.checkFlashcardComplete = checkFlashcardComplete`

### js/settings.js
- `updateSettingsUI()`
- `initSettingsEvents()` — theme toggle, autoplay speed sync, reset progress

### js/home.js (not listed in spec but needed)
- `updateHomeDashboard()`, `renderHomeHskGrid()`
- These are currently inside the sidebar IIFE. Since home.html has its own page, extract them.
- Alternatively: keep in shared.js under a condition `if (document.getElementById('homeHskGrid'))`.

**Decision:** Put `updateHomeDashboard()` and `renderHomeHskGrid()` in `js/shared.js` since they read global DATA and are lightweight. They are called from the sidebar navigation and from the DOMContentLoaded of index.html.

---

## HTML Page Structure

Each page has:
1. Same `<head>` (charset, viewport, title, HanziWriter CDN, styles.css)
2. Same sidebar + header HTML (sidebar links use `href="flash.html"` etc., NOT `href="#"`)
3. Same modals that apply to every page: `#profileModal`, `#wqPopupOverlay`, `#toastContainer`
4. Page-specific `<main>` content
5. Script load order: `data/data.js` → `storage.js` → `api-client.js` → `profile.js` → `js/shared.js` → `js/[page].js`

### Sidebar nav changes (all pages)
```html
<a href="index.html" class="menu-item" data-page="home">…Trang chủ…</a>
<a href="flash.html" class="menu-item" data-page="flash">…Flashcard…</a>
<a href="quiz.html"  class="menu-item" data-page="quiz">…Trắc nghiệm…</a>
<a href="write.html" class="menu-item" data-page="write">…Nét chữ…</a>
<a href="stats.html" class="menu-item" data-page="stats">…Thống kê…</a>
<a href="favorites.html" class="menu-item" data-page="favorites">…Yêu thích…</a>
<a href="custom.html" class="menu-item" data-page="custom">…Tự tạo…</a>
<a href="settings.html" class="menu-item" data-page="settings">…Cài đặt…</a>
```
Active item determined in `js/shared.js` by `location.pathname` matching the page filename.

### learnSelectorsWrapper visibility
- flash.html, quiz.html, write.html: render wrapper visible (remove `style="display: none;"`)
- all others: keep `style="display: none;"` or let shared.js hide it on load

### Page-specific modals
- custom.html: `#importJsonModal`, `#duplicateConfirmModal`, `#studyModeModal`
- favorites.html: no separate overlay needed (flat section render)
- All pages: `#profileModal`, `#wqPopupOverlay`

---

## Cross-Page Navigation

### Custom deck → Flash/Quiz
```js
// In js/custom.js startStudySession():
if (mode === 'flashcard') {
  localStorage.setItem('wq_pending_deck', JSON.stringify({ name, words }));
  localStorage.setItem('wq_pending_mode', 'flashcard');
  window.location.href = 'flash.html';
}
if (mode === 'quiz') {
  localStorage.setItem('wq_pending_deck', JSON.stringify({ name, words }));
  localStorage.setItem('wq_pending_mode', 'quiz');
  window.location.href = 'quiz.html';
}
if (mode === 'both') {
  // study flash first, then quiz on completion
  localStorage.setItem('wq_pending_deck', JSON.stringify({ name, words }));
  localStorage.setItem('wq_pending_mode', 'both');
  window.location.href = 'flash.html';
}
```

On flash.html load, js/flash.js checks `wq_pending_deck` and loads it if present.
On quiz.html load, js/quiz.js checks `wq_pending_deck` and calls `startQuizWithDeck()` if present.

### Home HSK "Học ngay" → Flash
```js
// In renderHomeHskGrid (shared.js):
card.querySelector('.start-learn-btn').onclick = () => {
  localStorage.setItem('wq_pending_level', lvl);
  window.location.href = 'flash.html';
};
```
flash.js reads `wq_pending_level` on load and applies it.

### Search → Flash
`navigateToWord()` in shared.js: saves word reference to localStorage, redirects to `flash.html`.

---

## Tricky Dependencies to Watch

1. **`level` initial value**: Must be `'HSK 1'` (with space) to match DATA keys. Original app.js had `'HSK1'`. Fix in shared.js initialization.

2. **`applyRange()` shuffle**: After `deck = deduplicateWords(deck)`, call `shuffle(deck)` to fix the reported bug. This is the primary user-facing bug fix.

3. **`startStudySession()` shuffle**: Same fix — `shuffle(deck)` after `deck = [...words]`.

4. **toggleFavorite fallback level**: Change `|| 'HSK1'` to `|| 'HSK 1'`.

5. **`window.startQuizWithDeck`**: quiz.js must export this to window. custom.js on multi-page no longer calls it directly — it navigates to quiz.html instead.

6. **`window.checkFlashcardComplete`**: flash.js exports this. On flash.html it handles the sessionStorage `wq_study_mode` check.

7. **`wqPopup`**: Needs `#wqPopupOverlay` in the DOM. Must be present on every page. Include in every HTML page's shared modal block.

8. **profile.js**: Uses `#profileModal` and `#profileModalBody`. Must be present on every page.

9. **`autoplaySpeed` and `settingsAutoplaySpeed`**: settings.js on settings.html syncs `settingsAutoplaySpeed` but `autoplaySpeed` is only on flash.html. Solution: settings.js saves the speed to localStorage (`wq_autoplay_speed`); flash.js reads it on load to init the `#autoplaySpeed` select.

10. **`DATA` must load before shared.js**: `data/data.js` is a `const DATA = {...}` declaration, so it must be a plain `<script>` (not `defer`) in every page, loaded first.

11. **`favModal` in original app.js**: The original uses `#favModal` as an overlay modal. In the new structure, favorites.html is a full page with `#section-favorites` flat section. `renderFavModalList()` targets `#favModalList` directly.

12. **Quiz HSK grid refresh**: On quiz.html, `renderQuizHskGrid()` and `renderQuizCustomDecks()` must be called once on DOMContentLoaded. No menu click needed.

---

## File Creation Order (dependency-ordered)

1. **Create `js/` directory** (mkdir)
2. **`js/shared.js`** — must exist before all other js/ files
3. **`js/flash.js`**
4. **`js/quiz.js`**
5. **`js/write.js`**
6. **`js/stats.js`**
7. **`js/favorites.js`**
8. **`js/custom.js`**
9. **`js/settings.js`**
10. **`index.html`** (replace existing — home dashboard)
11. **`flash.html`**
12. **`quiz.html`**
13. **`write.html`**
14. **`stats.html`**
15. **`favorites.html`**
16. **`custom.html`**
17. **`settings.html`**

---

## Step-by-Step Implementation Plan

- [ ] 1. Create `c:\Users\DAnnotator2\Khanh\hanyu\js\` directory.
      Files: (mkdir only)
      Verify: directory exists.

- [ ] 2. Create `js/shared.js` with: global state init (`level='HSK 1'`, `deck`, `fcIdx`, `wIdx`, `favorites`, `quizMode`, `quizPool`, `quizAskedWords`, `qScore`, `qTotal`); `shuffle()` (with auto-shuffle fix applied); `deduplicateWords()`; `showToast()`; `wqPopup`; `speak()`/`loadVoices()`; particle animation; theme init; `loadDataFromAPI()`; `initUIWithData()`; `buildRanges()`; `applyRange()` (with `shuffle(deck)` added after dedup); `saveProgress()`; `loadProgress()`; `removePinyinTones()`; search box logic; `navigateToWord()` (cross-page version); `updateHomeDashboard()`; `renderHomeHskGrid()`; `initSidebarNavigation()` (sets active by filename, no section switching); sidebar toggle; profile button; `window.AppState` export; `window.WQSyncData`.
      Files: `js/shared.js`
      Verify: No syntax errors — open any new HTML page in browser console, shared.js loads without errors.

- [ ] 3. Create `js/flash.js` with: `recordLearnedWord()`; `renderFlash()`; `renderFavIcon()`; `toggleFavorite()`; card click/flip; parallax mousemove; `fcNext/fcPrev/fcAudio/fcFav` bindings; swipe gesture; `startAutoplay()`; `stopAutoplay()`; `runAutoplayCycle()`; `autoplayBtn` binding; keyboard handler; `checkFlashcardComplete()` (reads sessionStorage or localStorage `wq_pending_mode`); DOMContentLoaded: reads `wq_pending_deck` / `wq_pending_level` and applies; exports `window.checkFlashcardComplete`.
      Files: `js/flash.js`
      Verify: Open flash.html, flashcards render with auto-shuffle and autoplay works.

- [ ] 4. Create `js/quiz.js` with: `newQuiz()`; `answer()`; `recordSrsAnswer()`; quiz mode button bindings; `qNext/qAudio/qBackBtn` bindings; `renderQuizHskGrid()`; `renderQuizCustomDecks()`; `startQuizWithDeck()`; `backToQuizSelection()`; DOMContentLoaded: reads `wq_pending_deck` if set, calls `startQuizWithDeck()`; renders HSK grid + custom decks; exports `window.startQuizWithDeck`.
      Files: `js/quiz.js`
      Verify: Open quiz.html, HSK grid shows, clicking a level starts quiz.

- [ ] 5. Create `js/write.js` with: `renderWriterList()`; `renderWriter()`; `buildWriter()`; `wAnimate/wQuiz/wAudio` button bindings; DOMContentLoaded: calls `renderWriterList()` + `renderWriter()`.
      Files: `js/write.js`
      Verify: Open write.html, character writer renders.

- [ ] 6. Create `js/stats.js` with: `renderStatsSection()`; DOMContentLoaded calls it.
      Files: `js/stats.js`
      Verify: Open stats.html, stats render with correct counts.

- [ ] 7. Create `js/favorites.js` with: `renderFavModalList()` (renders into `#favModalList`); DOMContentLoaded calls it.
      Files: `js/favorites.js`
      Verify: Open favorites.html, favorites list renders.

- [ ] 8. Create `js/custom.js` with: entire custom deck IIFE logic extracted from app.js; `startStudySession()` uses `window.location.href` for cross-page navigation (saves deck to localStorage `wq_pending_deck` + `wq_pending_mode`); `initCustomDeckEvents()`; DOMContentLoaded: calls `initCustomDeckEvents()`, loads + renders history.
      Files: `js/custom.js`
      Verify: Open custom.html, add words, click "Học ngay", should navigate to flash.html with deck loaded.

- [ ] 9. Create `js/settings.js` with: `updateSettingsUI()`; `initSettingsEvents()` (theme, autoplay speed saved to localStorage `wq_autoplay_speed`, reset progress); DOMContentLoaded calls both.
      Files: `js/settings.js`
      Verify: Open settings.html, theme toggle works, reset progress button works.

- [ ] 10. Replace `index.html` with home dashboard page: same head/sidebar/header; main content = `#section-home` only; modals: `#profileModal`, `#wqPopupOverlay`; scripts: `data/data.js` → `storage.js` → `api-client.js` → `profile.js` → `js/shared.js` (no page-specific JS needed since renderHomeHskGrid is in shared.js). Note: `learnSelectorsWrapper` hidden.
      Files: `index.html`
      Verify: Open index.html, home dashboard shows HSK progress cards.

- [ ] 11. Create `flash.html`: same head/sidebar/header; main = `#flash` section (flashcard + autoplay bar); modals: `#profileModal`, `#wqPopupOverlay`; `learnSelectorsWrapper` visible; scripts: `data/data.js` → `storage.js` → `api-client.js` → `profile.js` → `js/shared.js` → `js/flash.js`.
      Files: `flash.html`
      Verify: Cards render, shuffle applies on load, autoplay works.

- [ ] 12. Create `quiz.html`: same shell; main = `#quiz` section (deck selection + game section); modals: `#profileModal`, `#wqPopupOverlay`; `learnSelectorsWrapper` visible; scripts → `js/quiz.js`.
      Files: `quiz.html`
      Verify: HSK grid shows, quiz game functions correctly.

- [ ] 13. Create `write.html`: same shell; main = `#write` section; `learnSelectorsWrapper` visible; scripts → `js/write.js`.
      Files: `write.html`
      Verify: HanziWriter renders, animate and quiz buttons work.

- [ ] 14. Create `stats.html`: same shell; main = `#section-stats` flat section; `learnSelectorsWrapper` hidden; scripts → `js/stats.js`.
      Files: `stats.html`
      Verify: Stats load and display correctly.

- [ ] 15. Create `favorites.html`: same shell; main = `#section-favorites` flat section (`#favModalList`); `learnSelectorsWrapper` hidden; scripts → `js/favorites.js`.
      Files: `favorites.html`
      Verify: Favorites list renders, speak/delete work.

- [ ] 16. Create `custom.html`: same shell; main = `#section-custom` (full form); modals: `#importJsonModal`, `#duplicateConfirmModal`, `#studyModeModal`, `#profileModal`, `#wqPopupOverlay`; `learnSelectorsWrapper` hidden; scripts → `js/custom.js`.
      Files: `custom.html`
      Verify: Custom deck form works, history loads, "Học ngay" navigates to flash.html.

- [ ] 17. Create `settings.html`: same shell; main = `#section-settings`; `learnSelectorsWrapper` hidden; scripts → `js/settings.js`.
      Files: `settings.html`
      Verify: Settings render, theme toggle and reset work.

---

## Bug Fixes Bundled Into This Refactor

| Bug | Fix Location |
|-----|-------------|
| No auto-shuffle on deck load | `js/shared.js`: add `shuffle(deck)` in `applyRange()` after `deduplicateWords()` |
| No shuffle on custom deck study | `js/custom.js`: add `shuffle(deck)` in `startStudySession()` after `deck = [...words]` |
| `level` init `'HSK1'` vs `'HSK 1'` | `js/shared.js`: initialize `let level = 'HSK 1'` |
| Favorite fallback level `'HSK1'` | `js/flash.js`: change `|| 'HSK1'` to `|| 'HSK 1'` in `toggleFavorite()` |
