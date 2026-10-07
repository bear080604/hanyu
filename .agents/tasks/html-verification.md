# HTML Verification — Multi-Page Refactor

All 8 HTML files created successfully on 2025-07-01.

## Files Verified

### 1. index.html ✅
- Main content: `#section-home` with `#homeHskGrid`, `#userStreakVal`, `#welcomeUserText`
- Modals: `#profileModal`, `#wqPopupOverlay`, `#toastContainer`
- `learnSelectorsWrapper`: `style="display:none;"` — hidden ✓
- Scripts: `data/data.js` → `storage.js` → `api-client.js` → `profile.js` → `js/shared.js` ✓
- No page-specific JS (shared.js handles `updateHomeDashboard` + `renderHomeHskGrid`) ✓
- Sidebar links use real `href=` filenames ✓
- No duplicate IDs ✓

### 2. flash.html ✅
- Main content: `#flash` section with `.fc-wrap`, `#fcCard`, `#fcHanzi`, `#fcPinyin`, `#fcMean`, `#fcEx`, `#fcCount`, `#fcLevel`, `#fcPrev`, `#fcNext`, `#fcAudio`, `#fcFav`
- Autoplay: `#autoplayBtn`, `#autoplayBtnText`, `#autoplaySpeed`, `#autoplayProgress`
- Modals: `#profileModal`, `#wqPopupOverlay`, `#toastContainer` ✓
- `learnSelectorsWrapper`: visible (no display:none) ✓
- Scripts: → `js/shared.js` → `js/flash.js` ✓
- Section has class `active panel` so it renders immediately ✓
- No duplicate IDs ✓

### 3. quiz.html ✅
- Main content: `#quiz` section with `#quizDeckSelection`, `#quizHskGrid`, `#quizCustomDecksList`, `#quizGameSection`
- Quiz game: `#qHanzi`, `#qPinyin`, `#qOpts`, `#qResult`, `#qScore`, `#qLevel`, `#qNext`, `#qAudio`, `#qBackBtn`
- Quiz modes: all 6 `.quiz-mode-btn` buttons with correct `data-mode` values ✓
- Modals: `#profileModal`, `#wqPopupOverlay`, `#toastContainer` ✓
- `learnSelectorsWrapper`: visible ✓
- Scripts: → `js/shared.js` → `js/quiz.js` ✓
- No duplicate IDs ✓

### 4. write.html ✅
- Main content: `#write` section with `#writer-target`, `#wPinyin`, `#wMean`, `#wWord`, `#wLevel`, `#wPick`
- Buttons: `#wAnimate`, `#wQuiz`, `#wAudio` ✓
- Modals: `#profileModal`, `#wqPopupOverlay`, `#toastContainer` ✓
- `learnSelectorsWrapper`: visible ✓
- Scripts: → `js/shared.js` → `js/write.js` ✓
- HanziWriter CDN loaded in `<head>` ✓
- No duplicate IDs ✓

### 5. stats.html ✅
- Main content: `#section-stats` flat section with `#statsModal` and `#statsModalBody`
- Modals: `#profileModal`, `#wqPopupOverlay`, `#toastContainer` ✓
- `learnSelectorsWrapper`: `style="display:none;"` — hidden ✓
- Scripts: → `js/shared.js` → `js/stats.js` ✓
- No duplicate IDs ✓

### 6. favorites.html ✅
- Main content: `#section-favorites` flat section with `#favModal` and `#favModalList`
- `#favModalList` is a flat list, NOT a popup modal ✓
- Modals: `#profileModal`, `#wqPopupOverlay`, `#toastContainer` ✓
- `learnSelectorsWrapper`: `style="display:none;"` — hidden ✓
- Scripts: → `js/shared.js` → `js/favorites.js` ✓
- No duplicate IDs ✓

### 7. custom.html ✅
- Main content: `#section-custom` with all custom deck IDs:
  `#customSearchInput`, `#customSearchClearBtn`, `#customSearchSuggestions`,
  `#customSelectedWord`, `#selectedHanzi`, `#selectedPinyin`, `#selectedMeaning`, `#selectedExample`,
  `#deselectWordBtn`, `#addSelectedWordBtn`,
  `#manualInputDetails`, `#customHanzi`, `#customPinyin`, `#customMeaning`, `#customExample`,
  `#addManualWordBtn`,
  `#customWordCount`, `#customWordsList`,
  `#importJsonBtn`, `#saveCustomDeckBtn`, `#studyCustomDeckBtn`,
  `#customHistoryList` ✓
- Extra modals: `#importJsonModal`, `#duplicateConfirmModal`, `#studyModeModal` ✓
- Standard modals: `#profileModal`, `#wqPopupOverlay`, `#toastContainer` ✓
- `learnSelectorsWrapper`: `style="display:none;"` — hidden ✓
- Scripts: → `js/shared.js` → `js/custom.js` ✓
- No duplicate IDs ✓

### 8. settings.html ✅
- Main content: `#section-settings` with `#settingsThemeBtn`, `#settingsAutoplaySpeed`, `#resetProgressBtn` ✓
- Modals: `#profileModal`, `#wqPopupOverlay`, `#toastContainer` ✓
- `learnSelectorsWrapper`: `style="display:none;"` — hidden ✓
- Scripts: → `js/shared.js` → `js/settings.js` ✓
- No duplicate IDs ✓

## Shared Structure (all pages)

All pages share:
- `<canvas id="bg-canvas">` for particle animation ✓
- `<aside class="sidebar" id="sidebar">` with 8 nav links using real `href=` filenames and `data-page=` attributes ✓
- `<header class="app-header">` with `#sidebarToggleBtn`, `#headerTitle`, `#searchInput`, `#searchSuggestions`, `#learnSelectorsWrapper`, `#levelSel`, `#rangeSel`, `#shuffleBtn`, `#openProfileBtn`, `#themeBtn` ✓
- Hidden `#favListBtn` and `.tabs` divs for backward compatibility ✓
- Script load order: `data/data.js` (plain, not defer) → `storage.js defer` → `api-client.js defer` → `profile.js defer` → `js/shared.js defer` → `js/[page].js defer` ✓

## learnSelectorsWrapper Summary

| Page | Visible |
|------|---------|
| index.html | ❌ hidden |
| flash.html | ✅ visible |
| quiz.html | ✅ visible |
| write.html | ✅ visible |
| stats.html | ❌ hidden |
| favorites.html | ❌ hidden |
| custom.html | ❌ hidden |
| settings.html | ❌ hidden |
