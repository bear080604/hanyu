# Extraction Notes — WenQing Multi-Page Refactor

## 10. DATA Object Structure (from data/data.js)

```js
const DATA = {
  "HSK 1": [
    { "h": "爱", "p": "ài", "m": "Yêu; thương; yêu quý", "ex": "爸爸爱妈妈。" },
    // ...
  ],
  "HSK 2": [...],
  "HSK 3": [...],
  "HSK 4": [...],
  "HSK 5": [...],
  "HSK 6": [...]
};
```

Each entry: `{ h: string, p: string, m: string, ex?: string }`
- `h` = Hán tự (Chinese characters)
- `p` = Pinyin
- `m` = Meaning (Vietnamese)
- `ex` = Example sentence (optional)

**NOTE:** The key separator is `"HSK 1"` (with a space), NOT `"HSK1"`. This is a known bug in the original app.js (`let level = 'HSK 1'` is correct, but `|| 'HSK1'` fallback in toggleFavorite is wrong).

---

## 11. localStorage Keys (from app.js + storage.js)

```
wq_favorites       — array of { h, p, m, ex, levelGoc }
wq_progress        — { level, rangeVal, fcIdx, wIdx, activeTab, learned: string[] }
wq_srs             — { [hanzi]: { reviewCount, interval, nextReview } }
wq_custom_decks    — array of { id, name, words, createdAt, wordCount, fromServer?, serverId? }
wq_quiz_mode       — string: 'hanzi-to-mean' | 'hanzi-only-to-mean' | 'mean-to-hanzi' | 'mean-to-hanzi-pure' | 'hanzi-to-pinyin' | 'audio-to-mean'
wq_theme           — 'light' | 'dark'
wq_autoplay_speed  — (settings.js will write this; flash.js will read it)
wq_pending_deck    — { name, words } — cross-page navigation from custom→flash/quiz
wq_pending_mode    — 'flashcard' | 'quiz' | 'both'
wq_pending_level   — string e.g. 'HSK 1' — from home HSK card → flash
```

sessionStorage keys (within same tab only):
```
wq_study_mode      — 'both' — set by startStudySession
wq_study_deck      — { name, words } — set by startStudySession
```

---

## 9. HTML Structure (from index.html + app.js)

### Sidebar (`<aside class="sidebar" id="sidebar">`)
```html
<aside class="sidebar" id="sidebar">
  <div class="sidebar-logo">
    <svg class="logo-img" width="40" height="40" ...>...</svg>
    <span class="logo-text">WenQing <span>文卿</span></span>
  </div>
  <nav class="sidebar-menu">
    <a href="#" class="menu-item active" data-section="home">
      <span class="menu-icon">🏠</span><span class="menu-text">Trang chủ</span>
    </a>
    <a href="#" class="menu-item" data-section="flash">
      <span class="menu-icon">📇</span><span class="menu-text">Flashcard</span>
    </a>
    <a href="#" class="menu-item" data-section="quiz">
      <span class="menu-icon">✏️</span><span class="menu-text">Trắc nghiệm</span>
    </a>
    <a href="#" class="menu-item" data-section="write">
      <span class="menu-icon">🖌️</span><span class="menu-text">Nét chữ</span>
    </a>
    <a href="#" class="menu-item" data-section="stats">
      <span class="menu-icon">📊</span><span class="menu-text">Thống kê</span>
    </a>
    <a href="#" class="menu-item" data-section="favorites">
      <span class="menu-icon">❤️</span><span class="menu-text">Yêu thích</span>
    </a>
    <a href="#" class="menu-item" data-section="custom">
      <span class="menu-icon">📝</span><span class="menu-text">Tự tạo</span>
    </a>
    <a href="#" class="menu-item" data-section="settings">
      <span class="menu-icon">⚙️</span><span class="menu-text">Cài đặt</span>
    </a>
  </nav>
</aside>
```
In multi-page version: `href="#"` → `href="page.html"`, `data-section` → `data-page`.

### Header (`<header class="app-header">`)
```html
<header class="app-header">
  <div class="header-left">
    <button class="hamburger-btn" id="sidebarToggleBtn" aria-label="Toggle Sidebar">
      <svg ...hamburger icon...></svg>
    </button>
    <h2 class="header-title" id="headerTitle">Trang chủ</h2>
  </div>
  <div class="header-center">
    <div class="search-wrapper">
      <input type="text" id="searchInput" placeholder="Tìm kiếm từ, pinyin, nghĩa..." autocomplete="off">
      <div class="search-suggestions" id="searchSuggestions"></div>
    </div>
  </div>
  <div class="header-right">
    <div class="learn-selectors-wrapper" id="learnSelectorsWrapper" style="display: none;">
      <div class="select-wrapper"><select id="levelSel"></select></div>
      <div class="select-wrapper"><select id="rangeSel"></select></div>
      <button class="btn" id="shuffleBtn" style="padding: 10px 14px; border-radius: 12px;">
        <svg ...shuffle icon...></svg>
      </button>
    </div>
    <button class="btn" id="openProfileBtn" style="...">👤 Hồ sơ</button>
    <button class="icon-btn" id="themeBtn" aria-label="Toggle Theme" style="display: none;"></button>
  </div>
</header>
```

### `#profileModal`
```html
<div id="profileModal" class="modal" aria-modal="true" role="dialog" aria-label="Hồ sơ cá nhân">
  <div class="modal-content glass-card" style="max-width:480px; width:90%; max-height:85vh; overflow-y:auto; border-radius:24px; padding:28px; position:relative;">
    <button id="closeProfileModalBtn" class="icon-btn" style="position:absolute; top:16px; right:16px;" aria-label="Đóng">
      <svg ...X icon...></svg>
    </button>
    <h2 style="...">👤 Hồ sơ cá nhân</h2>
    <div id="profileModalBody"></div>
  </div>
</div>
```

### `#wqPopupOverlay`
```html
<div id="wqPopupOverlay" class="wq-popup-overlay" style="display: none;">
  <div class="wq-popup-card">
    <div id="wqPopupIcon" class="wq-popup-icon">💡</div>
    <h3 id="wqPopupTitle" class="wq-popup-title">Thông báo</h3>
    <div id="wqPopupMessage" class="wq-popup-message"></div>
    <input type="text" id="wqPopupInput" class="auth-input wq-popup-input" style="display: none;" autocomplete="off" />
    <div id="wqPopupActions" class="wq-popup-actions"></div>
  </div>
</div>
```

### `#toastContainer`
```html
<div id="toastContainer"></div>
```
(Created dynamically by showToast if not present; also declared in HTML)

### `#learnSelectorsWrapper`
```html
<div class="learn-selectors-wrapper" id="learnSelectorsWrapper" style="display: none;">
  <div class="select-wrapper"><select id="levelSel"></select></div>
  <div class="select-wrapper"><select id="rangeSel"></select></div>
  <button class="btn" id="shuffleBtn" style="padding: 10px 14px; border-radius: 12px;">
    <svg width="14" height="14" viewBox="0 0 24 24" ...shuffle icon...></svg>
  </button>
</div>
```
On flash.html / quiz.html / write.html: remove `style="display: none;"` (or shared.js shows it).

### `#section-home`
```html
<section class="app-section active" id="section-home">
  <div class="welcome-banner">
    <h1 id="welcomeUserText">Chào mừng bạn học tập! 👋</h1>
    <p>Chúc bạn một ngày học tiếng Trung hiệu quả. Hãy chọn một phần học dưới đây hoặc xem tiến độ của mình.</p>
  </div>
  <div class="dashboard-grid">
    <div class="glass-card stat-highlight-card" style="max-width: 360px;">
      <div class="card-icon">🔥</div>
      <div class="card-info">
        <h3>Chuỗi học tập</h3>
        <div class="value" id="userStreakVal">1 ngày</div>
        <p>Học hàng ngày để duy trì chuỗi!</p>
      </div>
    </div>
  </div>
  <h3 class="section-subtitle">Chương trình học HSK</h3>
  <div class="hsk-grid" id="homeHskGrid"></div>
</section>
```

### `#flash` section
```html
<section class="app-section panel" id="flash">
  <div class="statbar"><span id="fcCount"></span><span id="fcLevel"></span></div>
  <div class="autoplay-bar">
    <button class="btn" id="autoplayBtn" style="padding: 8px 16px; font-size: 0.85rem; border-radius: 12px;">
      <span id="autoplayBtnText">▶️ Tự động chạy</span>
    </button>
    <div class="autoplay-speed" style="display: none;">
      <label for="autoplaySpeed">Thời gian:</label>
      <select id="autoplaySpeed">
        <option value="3000">3 giây</option>
        <option value="5000" selected>5 giây</option>
        <option value="8000">8 giây</option>
      </select>
    </div>
    <div id="autoplayProgress" class="autoplay-progress"></div>
  </div>
  <div class="fc-wrap">
    <div class="fc" id="fcCard">
      <div class="fc-face fc-front">
        <div class="fc-hanzi" id="fcHanzi"></div>
        <div class="fc-pinyin" id="fcPinyin"></div>
        <div class="fc-hint">Bấm để lật thẻ</div>
      </div>
      <div class="fc-face fc-back">
        <div class="fc-mean" id="fcMean"></div>
        <div class="fc-ex" id="fcEx"></div>
        <div class="fc-hint">Bấm để lật lại</div>
      </div>
    </div>
  </div>
  <div class="fc-nav">
    <button class="icon-btn" id="fcPrev" aria-label="Previous"><svg ...left arrow...></svg></button>
    <button class="icon-btn" id="fcFav" aria-label="Favorite"><svg ...star...></svg></button>
    <button class="icon-btn" id="fcAudio" aria-label="Speak"><svg ...speaker...></svg></button>
    <button class="icon-btn" id="fcNext" aria-label="Next"><svg ...right arrow...></svg></button>
  </div>
</section>
```

### `#quiz` section
```html
<section class="app-section panel" id="quiz">
  <!-- Deck selection page -->
  <div id="quizDeckSelection" class="quiz-deck-selection">
    <div class="welcome-banner" style="margin-bottom: 28px;">
      <h2 style="...">✏️ Chọn bộ từ để luyện tập</h2>
      <p>Chọn cấp độ HSK hoặc bộ từ tự tạo để bắt đầu làm trắc nghiệm</p>
    </div>
    <h3 class="section-subtitle">Chương trình HSK</h3>
    <div class="hsk-grid" id="quizHskGrid"></div>
    <div id="quizCustomDecksSection" style="margin-top: 36px;">
      <h3 class="section-subtitle">📚 Bộ từ tự tạo</h3>
      <div id="quizCustomDecksList" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px;">
        <div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1;">Chưa có bộ từ tự tạo</div>
      </div>
    </div>
  </div>
  <!-- Quiz game page (hidden initially) -->
  <div id="quizGameSection" style="display: none;">
    <div class="statbar">
      <button class="btn" id="qBackBtn" style="...">
        <svg ...left arrow...></svg> Quay lại
      </button>
      <span id="qScore">Điểm: 0 / 0</span>
      <span id="qLevel"></span>
    </div>
    <div class="quiz-modes">
      <button class="quiz-mode-btn active" data-mode="hanzi-to-mean">Hán ➔ Nghĩa</button>
      <button class="quiz-mode-btn" data-mode="hanzi-only-to-mean">漢字 ➔ Nghĩa</button>
      <button class="quiz-mode-btn" data-mode="mean-to-hanzi">Nghĩa ➔ Hán</button>
      <button class="quiz-mode-btn" data-mode="mean-to-hanzi-pure">Nghĩa ➔ 漢字</button>
      <button class="quiz-mode-btn" data-mode="hanzi-to-pinyin">Hán ➔ Pinyin</button>
      <button class="quiz-mode-btn" data-mode="audio-to-mean">👂 Nghe ➔ Nghĩa</button>
    </div>
    <div class="q-box">
      <div class="q-prompt">
        <div class="q-hanzi" id="qHanzi"></div>
        <div class="q-pinyin" id="qPinyin"></div>
        <button class="icon-btn" id="qAudio" aria-label="Speak" style="margin-top:12px; display:inline-flex;">
          <svg ...speaker...></svg>
        </button>
      </div>
      <div class="q-opts" id="qOpts"></div>
      <div class="q-result" id="qResult"></div>
    </div>
    <div class="fc-nav">
      <button class="btn" id="qNext">Câu tiếp <svg ...right arrow...></svg></button>
    </div>
  </div>
</section>
```

### `#write` section
```html
<section class="app-section panel" id="write">
  <div class="statbar"><span id="wWord"></span><span id="wLevel"></span></div>
  <div class="w-wrap">
    <div class="w-info"><div class="p" id="wPinyin"></div><div class="m" id="wMean"></div></div>
    <div id="writer-target"></div>
    <div class="fc-nav">
      <button class="btn" id="wAnimate"><svg ...play...></svg> Xem nét</button>
      <button class="btn" id="wQuiz"><svg ...pencil...></svg> Tập viết</button>
      <button class="icon-btn" id="wAudio" aria-label="Speak"><svg ...speaker...></svg></button>
    </div>
    <div class="w-char-pick" id="wPick"></div>
  </div>
</section>
```

### `#section-stats`
```html
<section class="app-section" id="section-stats">
  <div id="statsModal" class="modal-section-flat">
    <div class="modal-body" id="statsModalBody"></div>
  </div>
</section>
```

### `#section-favorites`
```html
<section class="app-section" id="section-favorites">
  <div id="favModal" class="modal-section-flat">
    <div class="modal-body" id="favModalList"></div>
  </div>
</section>
```

### `#section-custom` — Full HTML in index.html (lines 248–415 approx)
The full HTML is in index.html. Key IDs used by custom.js:
- `#customSearchInput`, `#customSearchClearBtn`, `#customSearchSuggestions`
- `#customSelectedWord`, `#selectedHanzi`, `#selectedPinyin`, `#selectedMeaning`, `#selectedExample`
- `#deselectWordBtn`, `#addSelectedWordBtn`
- `#manualInputDetails`, `#customHanzi`, `#customPinyin`, `#customMeaning`, `#customExample`
- `#addManualWordBtn`
- `#customWordCount`, `#customWordsList`
- `#importJsonBtn`, `#saveCustomDeckBtn`, `#studyCustomDeckBtn`
- `#customHistoryList`

### `#section-settings`
```html
<section class="app-section" id="section-settings">
  <div class="glass-card settings-card">
    <h3>⚙️ Cài đặt ứng dụng</h3>
    <hr>
    <div class="settings-group">
      <div class="settings-item">
        <div class="settings-info"><h4>Giao diện tối / sáng</h4><p>...</p></div>
        <button class="btn" id="settingsThemeBtn">🌙 Chế độ tối</button>
      </div>
      <div class="settings-item">
        <div class="settings-info"><h4>Tốc độ chạy tự động (Flashcard)</h4><p>...</p></div>
        <div class="select-wrapper" style="width: auto;">
          <select id="settingsAutoplaySpeed">
            <option value="3000">3 giây</option>
            <option value="5000" selected>5 giây</option>
            <option value="8000">8 giây</option>
          </select>
        </div>
      </div>
    </div>
    <hr>
    <div class="settings-group">
      <div class="settings-item">
        <div class="settings-info"><h4 style="color: var(--neon-red);">Xóa dữ liệu tiến độ</h4><p>...</p></div>
        <button class="btn" id="resetProgressBtn" style="...color: var(--neon-red)...">🗑️ Xóa tiến trình</button>
      </div>
    </div>
  </div>
</section>
```

### `#importJsonModal`
```html
<div id="importJsonModal" class="modal">
  <div class="modal-content" style="max-width: 700px;">
    <div class="modal-header">
      <h2>📥 Nhập từ vựng từ JSON</h2>
      <span class="close-btn" id="closeImportJsonBtn">&times;</span>
    </div>
    <div class="modal-body" style="padding: 24px;">
      <!-- format examples <details> ... -->
      <div style="margin-bottom: 16px;">
        <label>📁 Tải file JSON</label>
        <input type="file" id="jsonFileInput" accept=".json" class="auth-input">
      </div>
      <div style="margin-bottom: 16px;">
        <label>📝 Hoặc dán JSON vào đây</label>
        <textarea id="jsonTextInput" ...></textarea>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="btn" id="cancelImportJsonBtn">Hủy</button>
        <button class="btn" id="confirmImportJsonBtn">✅ Nhập từ vựng</button>
      </div>
    </div>
  </div>
</div>
```

### `#duplicateConfirmModal`
```html
<div id="duplicateConfirmModal" class="modal">
  <div class="modal-content" style="max-width: 600px;">
    <div class="modal-header">
      <h2>⚠️ Phát hiện từ trùng lặp</h2>
      <span class="close-btn" id="closeDuplicateModalBtn">&times;</span>
    </div>
    <div class="modal-body" style="padding: 24px;">
      <div id="duplicateSummary" style="..."></div>
      <div id="duplicateList" style="max-height: 300px; overflow-y: auto; ..."></div>
      <p>Bạn muốn làm gì với các từ trùng lặp?</p>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button class="btn" id="skipDuplicatesBtn">✅ Chỉ thêm từ mới (<span id="newWordsCount">0</span> từ)</button>
        <button class="btn" id="overwriteDuplicatesBtn">🔄 Ghi đè từ cũ (cập nhật <span id="duplicateWordsCount">0</span> từ)</button>
        <button class="btn" id="cancelDuplicateBtn">❌ Hủy bỏ</button>
      </div>
    </div>
  </div>
</div>
```

### `#studyModeModal`
```html
<div id="studyModeModal" class="modal">
  <div class="modal-content" style="max-width: 480px;">
    <div class="modal-header">
      <h2>🎯 Chọn chế độ học</h2>
      <span class="close-btn" id="closeStudyModeBtn">&times;</span>
    </div>
    <div class="modal-body" style="padding: 24px;">
      <p>Bạn muốn học bộ từ này theo cách nào?</p>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button class="btn study-mode-option" data-mode="flashcard" style="...">
          <span style="font-size: 1.8rem;">📇</span>
          <div><div>Flashcard</div><div>Xem và ghi nhớ từ vựng</div></div>
        </button>
        <button class="btn study-mode-option" data-mode="quiz" style="...">
          <span style="font-size: 1.8rem;">✏️</span>
          <div><div>Trắc nghiệm</div><div>Kiểm tra kiến thức với câu hỏi</div></div>
        </button>
        <button class="btn study-mode-option" data-mode="both" style="background: var(--accent-gradient); ...">
          <span style="font-size: 1.8rem;">🎓</span>
          <div><div>Học đầy đủ</div><div>Flashcard → Trắc nghiệm (Khuyến nghị)</div></div>
        </button>
      </div>
    </div>
  </div>
</div>
```

---

## 1. js/shared.js — Complete Function Sources

### showToast()
```js
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `wq-toast wq-toast-${type}`;
  let icon = '✓';
  if (type === 'error') icon = '✗';
  else if (type === 'info') icon = 'ℹ';
  else if (type === 'warning') icon = '⚠';

  toast.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.2);font-weight:900;font-size:0.8rem;">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.transform = 'translateY(-20px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
window.showToast = showToast;
```

### wqPopup
```js
window.wqPopup = {
  alert(message, { title = 'Thông báo', icon = '💡' } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('wqPopupOverlay');
      const titleEl = document.getElementById('wqPopupTitle');
      const iconEl = document.getElementById('wqPopupIcon');
      const msgEl = document.getElementById('wqPopupMessage');
      const inputEl = document.getElementById('wqPopupInput');
      const actionsEl = document.getElementById('wqPopupActions');
      if (!overlay) { showToast(message, 'info'); resolve(); return; }

      iconEl.textContent = icon;
      titleEl.textContent = title;
      msgEl.textContent = message;
      inputEl.style.display = 'none';
      actionsEl.innerHTML = '';

      const okBtn = document.createElement('button');
      okBtn.className = 'wq-popup-btn wq-popup-btn-primary';
      okBtn.textContent = 'Đồng ý';
      okBtn.onclick = () => { overlay.style.display = 'none'; resolve(); };
      actionsEl.appendChild(okBtn);

      overlay.style.display = 'flex';
      okBtn.focus();
    });
  },
  confirm(message, { title = 'Xác nhận', icon = '❓', okText = 'Xác nhận', cancelText = 'Hủy' } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('wqPopupOverlay');
      const titleEl = document.getElementById('wqPopupTitle');
      const iconEl = document.getElementById('wqPopupIcon');
      const msgEl = document.getElementById('wqPopupMessage');
      const inputEl = document.getElementById('wqPopupInput');
      const actionsEl = document.getElementById('wqPopupActions');
      if (!overlay) { resolve(false); return; }

      iconEl.textContent = icon;
      titleEl.textContent = title;
      msgEl.textContent = message;
      inputEl.style.display = 'none';
      actionsEl.innerHTML = '';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'wq-popup-btn wq-popup-btn-secondary';
      cancelBtn.textContent = cancelText;
      cancelBtn.onclick = () => { overlay.style.display = 'none'; resolve(false); };

      const okBtn = document.createElement('button');
      okBtn.className = 'wq-popup-btn wq-popup-btn-primary';
      okBtn.textContent = okText;
      okBtn.onclick = () => { overlay.style.display = 'none'; resolve(true); };

      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(okBtn);

      overlay.style.display = 'flex';
      okBtn.focus();
    });
  },
  prompt(message, { title = 'Nhập thông tin', icon = '✏️', placeholder = '', defaultValue = '' } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('wqPopupOverlay');
      const titleEl = document.getElementById('wqPopupTitle');
      const iconEl = document.getElementById('wqPopupIcon');
      const msgEl = document.getElementById('wqPopupMessage');
      const inputEl = document.getElementById('wqPopupInput');
      const actionsEl = document.getElementById('wqPopupActions');
      if (!overlay) { resolve(null); return; }

      iconEl.textContent = icon;
      titleEl.textContent = title;
      msgEl.textContent = message;
      inputEl.style.display = 'block';
      inputEl.placeholder = placeholder;
      inputEl.value = defaultValue;
      actionsEl.innerHTML = '';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'wq-popup-btn wq-popup-btn-secondary';
      cancelBtn.textContent = 'Hủy';
      cancelBtn.onclick = () => { overlay.style.display = 'none'; resolve(null); };

      const okBtn = document.createElement('button');
      okBtn.className = 'wq-popup-btn wq-popup-btn-primary';
      okBtn.textContent = 'Xác nhận';
      const submit = () => {
        const val = inputEl.value.trim();
        overlay.style.display = 'none';
        resolve(val || defaultValue);
      };
      okBtn.onclick = submit;
      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') { overlay.style.display = 'none'; resolve(null); }
      };

      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(okBtn);

      overlay.style.display = 'flex';
      setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);
    });
  }
};
```

### deduplicateWords()
```js
function deduplicateWords(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  return arr.filter(w => {
    if (!w || !w.h) return false;
    const key = w.h.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

### shuffle()
```js
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
}
```

### speak() + loadVoices()
```js
let zhVoice = null;
function loadVoices() {
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find(v => /zh|Chinese|中文|普通话/i.test(v.lang + v.name)) || null;
}
loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;

function speak(t) {
  if (!t) return;
  try { speechSynthesis.cancel(); } catch(e) {}

  const providers = [
    `https://dict.youdao.com/dictvoice?le=zh&audio=${encodeURIComponent(t)}`,
    `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(t)}`
  ];

  let providerIndex = 0;

  const fallbackToWebSpeech = () => {
    console.warn("Using Web Speech API fallback for:", t);
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'zh-CN';
    if (!zhVoice) loadVoices();
    if (zhVoice) u.voice = zhVoice;
    u.rate = 0.8;
    speechSynthesis.speak(u);
  };

  const tryPlayTTS = () => {
    if (providerIndex >= providers.length) {
      fallbackToWebSpeech();
      return;
    }

    const currentUrl = providers[providerIndex];
    const audio = new Audio(currentUrl);
    let played = false;
    let fallbackTriggered = false;

    const playTimeout = setTimeout(() => {
      if (!played && !fallbackTriggered) {
        fallbackTriggered = true;
        audio.pause();
        providerIndex++;
        tryPlayTTS();
      }
    }, 1200);

    audio.onplaying = () => {
      played = true;
      clearTimeout(playTimeout);
    };

    audio.onerror = () => {
      clearTimeout(playTimeout);
      if (!fallbackTriggered) {
        fallbackTriggered = true;
        providerIndex++;
        tryPlayTTS();
      }
    };

    audio.play().catch(err => {
      clearTimeout(playTimeout);
      if (!fallbackTriggered) {
        fallbackTriggered = true;
        providerIndex++;
        tryPlayTTS();
      }
    });
  };

  tryPlayTTS();
}
```

### Particle animation
```js
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 1.5 + 0.5;
    this.speedX = (Math.random() - 0.5) * 0.2;
    this.speedY = (Math.random() - 0.5) * 0.2;
    this.color = Math.random() > 0.5 ? 'rgba(139, 92, 246, 0.3)' : 'rgba(0, 242, 254, 0.2)';
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

function initParticles() {
  particles = [];
  for (let i = 0; i < 60; i++) {
    particles.push(new Particle());
  }
}
initParticles();

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.update();
    p.draw();
  });
  requestAnimationFrame(animateParticles);
}
animateParticles();
```

### Theme init
```js
// In shared.js — run on every page load:
(function initTheme() {
  if (localStorage.getItem('wq_theme') === 'light') {
    document.documentElement.classList.add('light-theme');
  }
})();
// themeBtn (id="themeBtn") is hidden (display:none) in HTML; settings page handles theme toggle
```

### loadDataFromAPI()
```js
async function loadDataFromAPI() {
  try {
    console.log('📡 Loading data from API...');
    const hsk1Response = await window.WeiQuanAPI.getVocabulary({ level: 'HSK1', limit: 1000 });
    const hsk1Data = hsk1Response.data.map(item => ({
      h: item.hanzi, p: item.pinyin, m: item.meaning, e: item.example || ''
    }));
    const hsk2Response = await window.WeiQuanAPI.getVocabulary({ level: 'HSK2', limit: 1000 });
    const hsk2Data = hsk2Response.data.map(item => ({
      h: item.hanzi, p: item.pinyin, m: item.meaning, e: item.example || ''
    }));
    DATA['HSK 1'] = hsk1Data;
    DATA['HSK 2'] = hsk2Data;
    DATA['HSK 3'] = DATA['HSK 3'] || [];
    DATA['HSK 4'] = DATA['HSK 4'] || [];
    DATA['HSK 5'] = DATA['HSK 5'] || [];
    DATA['HSK 6'] = DATA['HSK 6'] || [];
    console.log('✅ Loaded from API:', hsk1Data.length + hsk2Data.length, 'words');
    API_ENABLED = true;
    if (typeof initUIWithData === 'function') initUIWithData();
  } catch (error) {
    console.warn('⚠️ API not available for HSK data, falling back to embedded data:', error);
    console.log('✅ Using embedded data:', Object.keys(DATA).length, 'levels');
    if (typeof initUIWithData === 'function') initUIWithData();
  }
}

// API init timeout block
setTimeout(() => {
  if (window.WeiQuanAPI) {
    API_ENABLED = true;
    console.log('✅ API client available, API_ENABLED = true');
    loadDataFromAPI().catch(err => {
      console.error('Failed to load HSK data from API:', err);
    });
  } else {
    console.warn('⚠️ API client not available, using embedded data only');
    API_ENABLED = false;
    if (typeof initUIWithData === 'function' && DATA && Object.keys(DATA).length > 0) {
      initUIWithData();
    }
  }
}, 500);
```

### initUIWithData()
```js
let lvlSel = null;

function initUIWithData() {
  lvlSel = lvlSel || document.getElementById('levelSel');
  if (!lvlSel) return;
  if (!DATA || Object.keys(DATA).length === 0) return;

  lvlSel.innerHTML = '';
  Object.keys(DATA).forEach(k => {
    if (DATA[k] && DATA[k].length > 0) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = k + ' (' + DATA[k].length + ' từ)';
      lvlSel.appendChild(o);
    }
  });

  const oFav = document.createElement('option');
  oFav.value = 'favorites';
  oFav.textContent = '⭐ Yêu thích (' + favorites.length + ')';
  lvlSel.appendChild(oFav);

  lvlSel.onchange = () => {
    level = lvlSel.value;
    buildRanges();
    applyRange();
    saveProgress();
  };

  buildRanges();
  applyRange();
}

document.addEventListener('DOMContentLoaded', () => {
  lvlSel = document.getElementById('levelSel');
  if (typeof DATA !== 'undefined' && Object.keys(DATA).length > 0) {
    initUIWithData();
  }
  loadProgress();
});
```

### buildRanges() + applyRange()
```js
function buildRanges() {
  if (typeof DATA === 'undefined') return;
  const sel = document.getElementById('rangeSel');
  sel.innerHTML = '';
  if (level === 'favorites') {
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'Tất cả';
    sel.appendChild(all);
    sel.onchange = applyRange;
    return;
  }
  if (!DATA[level]) return;
  const n = DATA[level].length, size = 50;
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'Tất cả';
  sel.appendChild(all);
  for (let i = 0; i < n; i += size) {
    const o = document.createElement('option');
    o.value = i + '-' + Math.min(i + size, n);
    o.textContent = 'Từ ' + (i + 1) + '–' + Math.min(i + size, n);
    sel.appendChild(o);
  }
  sel.onchange = () => {
    applyRange();
    saveProgress();
  };
}

function applyRange() {
  if (typeof DATA === 'undefined') return;
  const v = document.getElementById('rangeSel').value;
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
  shuffle(deck);  // ← BUG FIX: added shuffle here
  fcIdx = 0; wIdx = 0; qScore = 0; qTotal = 0;
  quizPool = [];
  quizAskedWords = [];

  if (typeof renderFlash === 'function') renderFlash();
  if (typeof renderWriterList === 'function') renderWriterList();
  if (typeof renderWriter === 'function') renderWriter();
  if (typeof newQuiz === 'function') newQuiz();
  if (typeof renderFavIcon === 'function') renderFavIcon();
}
```

### updateFavOptionText()
```js
function updateFavOptionText() {
  if (!lvlSel) return;
  const oFav = Array.from(lvlSel.options).find(o => o.value === 'favorites');
  if (oFav) {
    oFav.textContent = '⭐ Yêu thích (' + favorites.length + ')';
  }
}
```

### shuffleBtn binding
```js
document.getElementById('shuffleBtn').onclick = () => {
  shuffle(deck);
  fcIdx = 0;
  quizPool = [];
  quizAskedWords = [];
  if (typeof renderFlash === 'function') renderFlash();
  if (typeof newQuiz === 'function') newQuiz();
  if (typeof renderWriterList === 'function') renderWriterList();
  if (typeof renderWriter === 'function') renderWriter();
  saveProgress();
};
```

### saveProgress() + loadProgress()
```js
function saveProgress() {
  const progressData = {
    level,
    rangeVal: document.getElementById('rangeSel')?.value || 'all',
    fcIdx,
    wIdx,
    activeTab: document.querySelector('.tab.active')?.dataset.p || 'flash',
    learned: ((window.WQStorage && WQStorage.getProgress()?.learned) || JSON.parse(localStorage.getItem('wq_progress'))?.learned) || []
  };
  if (window.WQStorage) {
    WQStorage.saveProgress(progressData);
  } else {
    localStorage.setItem('wq_progress', JSON.stringify(progressData));
  }
}

function loadProgress() {
  const saved = (window.WQStorage && WQStorage.getProgress()) || JSON.parse(localStorage.getItem('wq_progress'));
  if (saved) {
    if (saved.level) {
      level = saved.level;
      if (lvlSel) lvlSel.value = level;
    }
    buildRanges();
    if (saved.rangeVal && document.getElementById('rangeSel')) {
      document.getElementById('rangeSel').value = saved.rangeVal;
    }
    applyRange();
    if (saved.fcIdx !== undefined && saved.fcIdx < deck.length) {
      fcIdx = saved.fcIdx;
      if (typeof renderFlash === 'function') renderFlash();
    }
    if (saved.wIdx !== undefined && saved.wIdx < deck.length) {
      wIdx = saved.wIdx;
      if (typeof renderWriterList === 'function') renderWriterList();
      if (typeof renderWriter === 'function') renderWriter();
    }
    if (saved.activeTab) {
      const tab = document.querySelector(`.tab[data-p="${saved.activeTab}"]`);
      if (tab) tab.click();
    }
  } else {
    buildRanges();
    applyRange();
  }
}
```

### window.WQSyncData (original — overridden by sidebar IIFE)
```js
window.WQSyncData = function() {
  favorites = (window.WQStorage && WQStorage.getFavorites()) || JSON.parse(localStorage.getItem('wq_favorites')) || [];
  updateFavOptionText();
};
```

### removePinyinTones() + search box logic
```js
function removePinyinTones(str) {
  if (!str) return '';
  const toneMap = {
    'ā':'a','á':'a','ǎ':'a','à':'a',
    'ē':'e','é':'e','ě':'e','è':'e',
    'ī':'i','í':'i','ǐ':'i','ì':'i',
    'ō':'o','ó':'o','ǒ':'o','ò':'o',
    'ū':'u','ú':'u','ǔ':'u','ù':'u',
    'ü':'u','ǘ':'u','ǚ':'u','ǜ':'u'
  };
  return str.toLowerCase().split('').map(char => toneMap[char] || char).join('')
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Search box logic
const searchInput = document.getElementById('searchInput');
const suggestionsBox = document.getElementById('searchSuggestions');

if (searchInput && suggestionsBox) {
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) { suggestionsBox.style.display = 'none'; return; }
    const normQuery = removePinyinTones(query);
    let results = [];
    Object.keys(DATA).forEach(lvl => {
      DATA[lvl].forEach(w => {
        const matchHanzi = w.h.toLowerCase().includes(query);
        const matchMean = w.m.toLowerCase().includes(query);
        const matchPinyin = w.p.toLowerCase().includes(query) || removePinyinTones(w.p).includes(normQuery);
        if (matchHanzi || matchMean || matchPinyin) {
          if (!results.some(r => r.h === w.h)) {
            results.push({ ...w, level: lvl });
          }
        }
      });
    });
    results = results.slice(0, 10);
    if (results.length > 0) {
      suggestionsBox.innerHTML = '';
      results.forEach(w => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
          <div class="suggestion-header">
            <span class="suggestion-hanzi">${w.h}</span>
            <span class="suggestion-level">${w.level}</span>
          </div>
          <span class="suggestion-pinyin">${w.p}</span>
          <span class="suggestion-mean">${w.m}</span>
        `;
        div.onclick = () => {
          navigateToWord(w);
          suggestionsBox.style.display = 'none';
          searchInput.value = '';
        };
        suggestionsBox.appendChild(div);
      });
      suggestionsBox.style.display = 'block';
    } else {
      suggestionsBox.innerHTML = '<div style="padding:12px 18px; color: var(--text-muted); font-size:0.9rem">Không tìm thấy kết quả</div>';
      suggestionsBox.style.display = 'block';
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
      suggestionsBox.style.display = 'none';
    }
  });
}
```

### navigateToWord() — multi-page version (replaces original)
```js
// Multi-page version: saves state, redirects to flash.html
function navigateToWord(w) {
  localStorage.setItem('wq_pending_level', w.level);
  localStorage.setItem('wq_pending_word', w.h);
  window.location.href = 'flash.html';
}
// NOTE: Original SPA version (for reference):
// function navigateToWord(w) {
//   level = w.level;
//   lvlSel.value = level;
//   const src = DATA[level];
//   const originalIdx = src.findIndex(item => item.h === w.h);
//   if (originalIdx !== -1) {
//     const size = 50;
//     const rangeStart = Math.floor(originalIdx / size) * size;
//     const rangeEnd = Math.min(rangeStart + size, src.length);
//     const rangeValue = rangeStart + '-' + rangeEnd;
//     buildRanges();
//     document.getElementById('rangeSel').value = rangeValue;
//     deck = src.slice(rangeStart, rangeEnd);
//     fcIdx = originalIdx - rangeStart;
//     wIdx = originalIdx - rangeStart;
//     qScore = 0; qTotal = 0;
//     const flashTab = document.querySelector('.tab[data-p="flash"]');
//     if (flashTab) flashTab.click();
//     renderFlash(); renderWriterList(); renderWriter(); newQuiz(); saveProgress();
//   }
// }
```

### updateHomeDashboard() + renderHomeHskGrid()
```js
function updateHomeDashboard() {
  const welcomeText = document.getElementById('welcomeUserText');
  const userStreakVal = document.getElementById('userStreakVal');
  if (welcomeText) welcomeText.textContent = `Chào mừng bạn học tập! 👋`;

  const learnedList = (window.WQStorage && WQStorage.getProgress()?.learned) ||
    JSON.parse(localStorage.getItem('wq_progress'))?.learned || [];
  const streak = learnedList.length > 0 ? Math.max(1, Math.min(30, Math.ceil(learnedList.length / 5))) : 0;
  if (userStreakVal) userStreakVal.textContent = `${streak} ngày`;

  renderHomeHskGrid();
}

function renderHomeHskGrid() {
  const homeHskGrid = document.getElementById('homeHskGrid');
  if (!homeHskGrid || typeof DATA === 'undefined') return;

  homeHskGrid.innerHTML = '';
  const learnedList = (window.WQStorage && WQStorage.getProgress()?.learned) ||
    JSON.parse(localStorage.getItem('wq_progress'))?.learned || [];

  const colors = [
    'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
    'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
    'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
    'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
  ];

  Object.keys(DATA).forEach((lvl, index) => {
    const words = DATA[lvl];
    const total = words ? words.length : 0;
    let learnedCount = 0;
    if (words) words.forEach(w => { if (learnedList.includes(w.h)) learnedCount++; });
    const percent = total > 0 ? Math.round((learnedCount / total) * 100) : 0;
    const color = colors[index % colors.length];

    const card = document.createElement('div');
    card.className = 'hsk-card';
    card.style.setProperty('--card-color', color);
    card.innerHTML = `
      <div class="hsk-card-header">
        <h4>${lvl}</h4>
        <span class="word-count">${total} từ</span>
      </div>
      <div class="progress-wrapper">
        <div class="progress-info">
          <span>Tiến độ</span>
          <span>${learnedCount}/${total} (${percent}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${percent}%;"></div>
        </div>
      </div>
      <button class="btn start-learn-btn" style="background: ${color}; border: none; color: #fff;">Học ngay</button>
    `;

    card.querySelector('.start-learn-btn').onclick = () => {
      // Multi-page: save pending level and navigate
      localStorage.setItem('wq_pending_level', lvl);
      window.location.href = 'flash.html';
    };

    homeHskGrid.appendChild(card);
  });
}
```

### initSidebarNavigation() — multi-page version
```js
function initSidebarNavigation() {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const learnSelectorsWrapper = document.getElementById('learnSelectorsWrapper');

  // Set active menu item based on current page filename
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  const pageMap = {
    'index.html': 'home', '': 'home',
    'flash.html': 'flash',
    'quiz.html': 'quiz',
    'write.html': 'write',
    'stats.html': 'stats',
    'favorites.html': 'favorites',
    'custom.html': 'custom',
    'settings.html': 'settings'
  };
  const activePage = pageMap[currentPage] || 'home';

  const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
  menuItems.forEach(item => {
    if (item.dataset.page === activePage) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Show/hide learnSelectorsWrapper based on current page
  if (learnSelectorsWrapper) {
    const showSelectors = ['flash', 'quiz', 'write'].includes(activePage);
    learnSelectorsWrapper.style.display = showSelectors ? 'flex' : 'none';
  }

  // Hamburger toggle
  if (sidebarToggleBtn && sidebar) {
    sidebarToggleBtn.onclick = (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('active');
    };
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== sidebarToggleBtn) {
        sidebar.classList.remove('active');
      }
    });
  }
}
```

### Profile button binding
```js
document.addEventListener('DOMContentLoaded', () => {
  const openProfileBtn = document.getElementById('openProfileBtn');
  if (openProfileBtn) {
    openProfileBtn.onclick = () => {
      if (window.WQProfile) WQProfile.openProfileModal();
    };
  }
});
```

### Global state initialization
```js
// ── Global state ──
let level = 'HSK 1';  // NOTE: 'HSK 1' with space, not 'HSK1'
let deck = [];
let fcIdx = 0;
let qScore = 0;
let qTotal = 0;
let writer = null;
let wIdx = 0;
let wChars = [];
const userId = 'default_user';

let favorites = (window.WQStorage && WQStorage.getFavorites()) ||
  JSON.parse(localStorage.getItem('wq_favorites')) || [];
let autoplayInterval = null;
let autoplayRunning = false;
let autoplayTimer = null;
let quizMode = localStorage.getItem('wq_quiz_mode') || 'hanzi-to-mean';
let quizPool = [];
let quizAskedWords = [];

const $ = id => document.getElementById(id);

if (typeof DATA === 'undefined') { window.DATA = {}; }
let API_ENABLED = false;
```

---

## 2. js/flash.js — Complete Function Sources

### recordLearnedWord()
```js
function recordLearnedWord(wordStr) {
  if (!wordStr) return;
  const progress = (window.WQStorage && WQStorage.getProgress()) ||
    JSON.parse(localStorage.getItem('wq_progress')) || {};
  if (!progress.learned) progress.learned = [];
  if (!progress.learned.includes(wordStr)) {
    progress.learned.push(wordStr);
    if (window.WQStorage) {
      WQStorage.saveProgress(progress);
    } else {
      localStorage.setItem('wq_progress', JSON.stringify(progress));
    }
  }
}
```

### renderFlash()
```js
function renderFlash() {
  if (!deck.length) {
    document.getElementById('fcHanzi').textContent = 'Trống';
    document.getElementById('fcPinyin').textContent = '';
    document.getElementById('fcMean').textContent = 'Chưa có từ nào trong danh sách';
    document.getElementById('fcEx').textContent = '';
    document.getElementById('fcCount').textContent = '0 / 0';
    document.getElementById('fcLevel').textContent = level === 'favorites' ? 'Yêu thích' : '';
    renderFavIcon();
    return;
  }
  const w = deck[fcIdx];
  recordLearnedWord(w.h);

  const card = document.getElementById('fcCard');
  card.classList.remove('flip');
  card.style.transform = 'rotateY(0deg)';

  document.getElementById('fcHanzi').textContent = w.h;
  document.getElementById('fcPinyin').textContent = w.p;
  document.getElementById('fcMean').textContent = w.m;
  document.getElementById('fcEx').textContent = w.ex || w.e || '';
  document.getElementById('fcCount').textContent = (fcIdx + 1) + ' / ' + deck.length;
  document.getElementById('fcLevel').textContent = level === 'favorites' ? 'Yêu thích' : level;
  renderFavIcon();
}
```

### renderFavIcon()
```js
function renderFavIcon() {
  if (!deck.length) {
    document.getElementById('fcFav').classList.remove('active-fav');
    return;
  }
  const w = deck[fcIdx];
  const isFav = favorites.some(f => f.h === w.h);
  document.getElementById('fcFav').classList.toggle('active-fav', isFav);
}
```

### toggleFavorite()
```js
function toggleFavorite(w) {
  const idx = favorites.findIndex(f => f.h === w.h);
  if (idx === -1) {
    const levelGoc = Object.keys(DATA).find(lvl => DATA[lvl] && DATA[lvl].some(item => item.h === w.h)) || 'HSK 1'; // BUG FIX: 'HSK 1' not 'HSK1'
    favorites.push({ ...w, levelGoc });
    showToast(`Đã thêm "${w.h}" vào yêu thích ⭐`, 'success');
  } else {
    favorites.splice(idx, 1);
    showToast(`Đã bỏ yêu thích "${w.h}"`, 'info');
  }
  if (window.WQStorage) {
    WQStorage.saveFavorites(favorites);
  } else {
    localStorage.setItem('wq_favorites', JSON.stringify(favorites));
  }
  updateFavOptionText();
  renderFavIcon();
  if (level === 'favorites') {
    const oldWord = deck[fcIdx];
    deck = favorites.slice();
    if (deck.length === 0) {
      fcIdx = 0;
    } else {
      const newIdx = deck.findIndex(item => item.h === (oldWord && oldWord.h));
      fcIdx = newIdx !== -1 ? newIdx : Math.min(fcIdx, deck.length - 1);
    }
    renderFlash(); renderWriterList(); renderWriter(); newQuiz();
  }
}
```

### Card click/flip + parallax
```js
const card = document.getElementById('fcCard');

// Parallax 3D mousemove
if (card && window.matchMedia('(pointer: fine)').matches) {
  card.addEventListener('mousemove', e => {
    if (card.classList.contains('flip')) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateY = ((x - centerX) / centerX) * 15;
    const rotateX = -((y - centerY) / centerY) * 15;
    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });
  card.addEventListener('mouseleave', () => {
    if (card.classList.contains('flip')) return;
    card.style.transform = 'rotateY(0deg)';
  });
}

// Card click flip
card.onclick = (e) => {
  if (e.target.closest('.icon-btn')) return;
  stopAutoplay();
  card.classList.toggle('flip');
  card.style.transform = card.classList.contains('flip') ? 'rotateY(180deg)' : 'rotateY(0deg)';
};
```

### fcNext/fcPrev/fcAudio/fcFav bindings
```js
document.getElementById('fcNext').onclick = (e) => {
  if (e) e.stopPropagation();
  stopAutoplay();
  if (!deck.length) return;
  fcIdx = (fcIdx + 1) % deck.length;
  renderFlash();
  saveProgress();
  if (typeof checkFlashcardComplete === 'function') checkFlashcardComplete();
};

document.getElementById('fcPrev').onclick = (e) => {
  if (e) e.stopPropagation();
  stopAutoplay();
  if (!deck.length) return;
  fcIdx = (fcIdx - 1 + deck.length) % deck.length;
  renderFlash();
  saveProgress();
};

document.getElementById('fcAudio').onclick = e => {
  e.stopPropagation();
  if (!deck.length) return;
  speak(deck[fcIdx].h);
};

document.getElementById('fcFav').onclick = (e) => {
  e.stopPropagation();
  if (!deck.length) return;
  const w = deck[fcIdx];
  toggleFavorite(w);
};
```

### Swipe gesture
```js
let touchStartX = 0;
let touchEndX = 0;

card.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

card.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
}, { passive: true });

function handleSwipe() {
  const swipeThreshold = 50;
  if (touchStartX - touchEndX > swipeThreshold) {
    document.getElementById('fcNext').click();
  } else if (touchEndX - touchStartX > swipeThreshold) {
    document.getElementById('fcPrev').click();
  }
}
```

### startAutoplay / stopAutoplay / runAutoplayCycle
```js
const autoplayBtn = document.getElementById('autoplayBtn');
const autoplaySpeed = document.getElementById('autoplaySpeed');
const autoplayProgress = document.getElementById('autoplayProgress');

if (autoplayBtn) {
  autoplayBtn.onclick = (e) => {
    e.stopPropagation();
    if (autoplayRunning) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  };
}

function startAutoplay() {
  if (!deck.length) return;
  autoplayRunning = true;
  document.getElementById('autoplayBtnText').textContent = '⏸️ Tạm dừng';
  autoplayBtn.classList.add('active-fav');
  runAutoplayCycle();
}

function stopAutoplay() {
  if (!autoplayRunning) return;
  autoplayRunning = false;
  if (autoplayBtn) {
    document.getElementById('autoplayBtnText').textContent = '▶️ Tự động chạy';
    autoplayBtn.classList.remove('active-fav');
  }
  clearTimeout(autoplayTimer);
  clearInterval(autoplayInterval);
  if (autoplayProgress) autoplayProgress.style.width = '0%';
}

function runAutoplayCycle() {
  if (!autoplayRunning || !deck.length) return;
  const card = document.getElementById('fcCard');
  card.classList.remove('flip');
  card.style.transform = 'rotateY(0deg)';
  speak(deck[fcIdx].h);

  const speed = parseInt(autoplaySpeed.value) || 5000;
  const halfSpeed = Math.floor(speed / 2);
  let timeSpent = 0;
  const updateInterval = 100;
  clearInterval(autoplayInterval);
  if (autoplayProgress) autoplayProgress.style.width = '0%';
  let cardFlipped = false;

  autoplayInterval = setInterval(() => {
    timeSpent += updateInterval;
    const pct = (timeSpent / speed) * 100;
    if (autoplayProgress) autoplayProgress.style.width = `${pct}%`;
    if (timeSpent >= halfSpeed && !cardFlipped) {
      cardFlipped = true;
      card.classList.add('flip');
      card.style.transform = 'rotateY(180deg)';
    }
    if (timeSpent >= speed) {
      clearInterval(autoplayInterval);
      fcIdx = (fcIdx + 1) % deck.length;
      renderFlash();
      saveProgress();
      autoplayTimer = setTimeout(runAutoplayCycle, 300);
    }
  }, updateInterval);
}
```

### Keyboard handler
```js
document.addEventListener('keydown', e => {
  if (!document.getElementById('flash').classList.contains('active')) return;
  if (e.key === 'ArrowRight') document.getElementById('fcNext').click();
  if (e.key === 'ArrowLeft') document.getElementById('fcPrev').click();
  if (e.key === ' ') { e.preventDefault(); document.getElementById('fcCard').click(); }
});
```
**Note for multi-page flash.html:** The `#flash` active check is not needed. Remove the `.classList.contains('active')` guard on flash.html since the whole page IS the flash section.

### checkFlashcardComplete()
```js
function checkFlashcardComplete() {
  const studyMode = sessionStorage.getItem('wq_study_mode');
  if (studyMode === 'both' && fcIdx === deck.length - 1) {
    setTimeout(() => {
      if (confirm('🎉 Bạn đã xem hết Flashcard!\n\n✏️ Bạn có muốn tiếp tục làm Trắc nghiệm không?')) {
        const deckData = JSON.parse(sessionStorage.getItem('wq_study_deck') || '{}');
        sessionStorage.removeItem('wq_study_mode');
        sessionStorage.removeItem('wq_study_deck');
        // Multi-page: save pending deck and navigate to quiz.html
        localStorage.setItem('wq_pending_deck', JSON.stringify({ name: deckData.name || level, words: deckData.words || deck }));
        localStorage.setItem('wq_pending_mode', 'quiz');
        window.location.href = 'quiz.html';
        showToast('✏️ Chuyển sang Trắc nghiệm!', 'info');
      } else {
        sessionStorage.removeItem('wq_study_mode');
        sessionStorage.removeItem('wq_study_deck');
      }
    }, 500);
  }
}
window.checkFlashcardComplete = checkFlashcardComplete;
```

### DOMContentLoaded in flash.js (pending deck/level loading)
```js
document.addEventListener('DOMContentLoaded', () => {
  // Check for pending deck from custom.js or pending level from home
  const pendingDeckStr = localStorage.getItem('wq_pending_deck');
  const pendingLevel = localStorage.getItem('wq_pending_level');
  const pendingWord = localStorage.getItem('wq_pending_word');

  if (pendingDeckStr) {
    localStorage.removeItem('wq_pending_deck');
    localStorage.removeItem('wq_pending_mode');
    const pendingDeck = JSON.parse(pendingDeckStr);
    level = pendingDeck.name;
    deck = [...pendingDeck.words];
    deck = deduplicateWords(deck);
    shuffle(deck);
    fcIdx = 0;
    renderFlash();
    renderWriterList();
    renderWriter();
  } else if (pendingLevel) {
    localStorage.removeItem('wq_pending_level');
    level = pendingLevel;
    if (lvlSel) lvlSel.value = level;
    buildRanges();
    applyRange(); // applyRange now does shuffle
    if (pendingWord) {
      localStorage.removeItem('wq_pending_word');
      const src = DATA[level] || [];
      const idx = deck.findIndex(w => w.h === pendingWord);
      if (idx !== -1) { fcIdx = idx; renderFlash(); }
    }
  }
});
```

---

## 3. js/quiz.js — Complete Function Sources

### newQuiz()
```js
let qCur = null, qAnswered = false;

function newQuiz() {
  if (!deck || deck.length < 2) {
    document.getElementById('qHanzi').textContent = 'Cần ít nhất 2 từ để làm trắc nghiệm';
    document.getElementById('qPinyin').textContent = '';
    document.getElementById('qOpts').innerHTML = '';
    return;
  }
  qAnswered = false;
  document.getElementById('qResult').textContent = '';

  if (quizPool.length === 0) {
    quizPool = deduplicateWords([...deck]);
    shuffle(quizPool);
    console.log('🔄 Đã làm mới quiz pool:', quizPool.length, 'từ');
  }

  qCur = quizPool.shift();
  quizAskedWords.push(qCur);

  const promptHanzi = document.getElementById('qHanzi');
  const promptPinyin = document.getElementById('qPinyin');

  if (quizMode === 'hanzi-to-mean') {
    promptHanzi.style.display = 'block'; promptPinyin.style.display = 'block';
    promptHanzi.textContent = qCur.h; promptPinyin.textContent = qCur.p;
  } else if (quizMode === 'hanzi-only-to-mean') {
    promptHanzi.style.display = 'block'; promptPinyin.style.display = 'none';
    promptHanzi.textContent = qCur.h;
  } else if (quizMode === 'mean-to-hanzi') {
    promptHanzi.style.display = 'block'; promptPinyin.style.display = 'none';
    promptHanzi.textContent = qCur.m;
  } else if (quizMode === 'mean-to-hanzi-pure') {
    promptHanzi.style.display = 'block'; promptPinyin.style.display = 'none';
    promptHanzi.textContent = qCur.m;
  } else if (quizMode === 'hanzi-to-pinyin') {
    promptHanzi.style.display = 'block'; promptPinyin.style.display = 'none';
    promptHanzi.textContent = qCur.h;
  } else if (quizMode === 'audio-to-mean') {
    promptHanzi.style.display = 'block'; promptPinyin.style.display = 'none';
    promptHanzi.textContent = '🔊 Nhấn để nghe';
    speak(qCur.h);
  }

  let opts = [qCur];
  const distractors = deck.filter(w => w && w.h !== qCur.h && w.m !== qCur.m);
  shuffle(distractors);
  for (const d of distractors) {
    if (opts.length >= 4) break;
    if (!opts.some(o => o.h === d.h || o.m === d.m)) opts.push(d);
  }
  shuffle(opts);

  const box = document.getElementById('qOpts');
  box.innerHTML = '';
  opts.forEach(o => {
    const d = document.createElement('div');
    d.className = 'q-opt';
    if (quizMode === 'hanzi-to-mean' || quizMode === 'hanzi-only-to-mean' || quizMode === 'audio-to-mean') {
      d.textContent = o.m;
    } else if (quizMode === 'mean-to-hanzi') {
      d.textContent = `${o.h} (${o.p})`;
    } else if (quizMode === 'mean-to-hanzi-pure') {
      d.textContent = o.h;
    } else if (quizMode === 'hanzi-to-pinyin') {
      d.textContent = o.p;
    }
    d.onclick = () => answer(d, o);
    box.appendChild(d);
  });
  document.getElementById('qLevel').textContent = level === 'favorites' ? 'Yêu thích' : level;
}
```

### answer()
```js
function answer(el, o) {
  if (qAnswered) return;
  qAnswered = true;
  qTotal++;
  document.querySelectorAll('.q-opt').forEach(x => x.classList.add('disabled'));

  let correctText = '';
  if (quizMode === 'hanzi-to-mean' || quizMode === 'hanzi-only-to-mean' || quizMode === 'audio-to-mean') {
    correctText = qCur.m;
  } else if (quizMode === 'mean-to-hanzi') {
    correctText = `${qCur.h} (${qCur.p})`;
  } else if (quizMode === 'mean-to-hanzi-pure') {
    correctText = qCur.h;
  } else if (quizMode === 'hanzi-to-pinyin') {
    correctText = qCur.p;
  }

  if (o === qCur) {
    el.classList.add('correct');
    qScore++;
    document.getElementById('qResult').textContent = '✓ Chính xác!';
    document.getElementById('qResult').style.color = 'var(--neon-green)';
    recordSrsAnswer(qCur.h, true);
  } else {
    el.classList.add('wrong');
    document.querySelectorAll('.q-opt').forEach(x => {
      if (x.textContent === correctText) x.classList.add('correct');
    });
    document.getElementById('qResult').textContent = '✗ Đáp án: ' + correctText;
    document.getElementById('qResult').style.color = 'var(--neon-red)';
    recordSrsAnswer(qCur.h, false);
  }
  speak(qCur.h);
  document.getElementById('qScore').textContent = 'Điểm: ' + qScore + ' / ' + qTotal;
}
```

### recordSrsAnswer()
```js
function recordSrsAnswer(wordStr, isCorrect) {
  if (!wordStr) return;
  const srs = (window.WQStorage && WQStorage.getSRS()) ||
    JSON.parse(localStorage.getItem('wq_srs')) || {};
  if (!srs[wordStr]) {
    srs[wordStr] = { reviewCount: 0, interval: 1, nextReview: '' };
  }
  const item = srs[wordStr];
  if (isCorrect) {
    item.reviewCount += 1;
    item.interval = item.reviewCount === 1 ? 1 : item.interval * 2;
  } else {
    item.reviewCount = 0;
    item.interval = 1;
  }
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + item.interval);
  item.nextReview = nextDate.toISOString().split('T')[0];
  srs[wordStr] = item;
  if (window.WQStorage) {
    WQStorage.saveSRS(srs);
  } else {
    localStorage.setItem('wq_srs', JSON.stringify(srs));
  }
}
```

### Quiz mode buttons
```js
document.querySelectorAll('.quiz-mode-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.quiz-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    quizMode = btn.dataset.mode;
    localStorage.setItem('wq_quiz_mode', quizMode);
    qScore = 0; qTotal = 0;
    quizPool = []; quizAskedWords = [];
    document.getElementById('qScore').textContent = 'Điểm: 0 / 0';
    newQuiz();
  };
});

// Restore saved quiz mode
const savedQuizBtn = document.querySelector(`.quiz-mode-btn[data-mode="${quizMode}"]`);
if (savedQuizBtn) {
  document.querySelectorAll('.quiz-mode-btn').forEach(b => b.classList.remove('active'));
  savedQuizBtn.classList.add('active');
}
```

### qNext/qAudio/qBackBtn bindings
```js
document.getElementById('qNext').onclick = newQuiz;
document.getElementById('qAudio').onclick = () => speak(qCur && qCur.h);
document.getElementById('qBackBtn').onclick = backToQuizSelection;
```

### renderQuizHskGrid()
```js
function renderQuizHskGrid() {
  const grid = document.getElementById('quizHskGrid');
  if (!grid || typeof DATA === 'undefined') return;
  grid.innerHTML = '';
  const colors = [
    'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
    'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
    'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
    'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
  ];
  Object.keys(DATA).forEach((lvl, index) => {
    const words = DATA[lvl];
    const total = words.length;
    const color = colors[index % colors.length];
    const card = document.createElement('div');
    card.className = 'hsk-card';
    card.style.setProperty('--card-color', color);
    card.innerHTML = `
      <div class="hsk-card-header">
        <h4>${lvl}</h4>
        <span class="word-count">${total} từ</span>
      </div>
      <div style="margin: 16px 0; color: var(--text-secondary); font-size: 0.9rem;">
        Làm trắc nghiệm với ${total} từ vựng
      </div>
      <button class="btn start-learn-btn" style="background: ${color}; border: none; color: #fff;">✏️ Bắt đầu Quiz</button>
    `;
    card.querySelector('.start-learn-btn').onclick = () => startQuizWithDeck(lvl, words);
    grid.appendChild(card);
  });
}
```

### renderQuizCustomDecks()
```js
function renderQuizCustomDecks() {
  const list = document.getElementById('quizCustomDecksList');
  if (!list) return;

  const customDecks = (window.WQStorage && WQStorage.getCustomDecks()) ||
    JSON.parse(localStorage.getItem('wq_custom_decks')) || [];

  if (customDecks.length === 0) {
    list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1;">Chưa có bộ từ tự tạo. <a href="custom.html" style="color: var(--accent-purple); text-decoration: underline;">Tạo ngay</a></div>';
    return;
  }

  list.innerHTML = '';
  customDecks.forEach((deckItem) => {
    const card = document.createElement('div');
    card.className = 'hsk-card';
    card.style.setProperty('--card-color', 'var(--accent-gradient)');
    card.innerHTML = `
      <div class="hsk-card-header">
        <h4>📚 ${deckItem.name}</h4>
        <span class="word-count">${deckItem.wordCount} từ</span>
      </div>
      <div style="margin: 16px 0; color: var(--text-secondary); font-size: 0.85rem;">📅 ${deckItem.createdAt}</div>
      <button class="btn start-learn-btn" style="background: var(--accent-gradient); border: none; color: #fff;">✏️ Bắt đầu Quiz</button>
    `;
    card.querySelector('.start-learn-btn').onclick = () => startQuizWithDeck(deckItem.name, deckItem.words);
    list.appendChild(card);
  });
}
```

### startQuizWithDeck()
```js
function startQuizWithDeck(deckName, words) {
  if (words.length < 2) {
    showToast('Cần ít nhất 2 từ để làm trắc nghiệm!', 'error');
    return;
  }
  level = deckName;
  deck = [...words];
  fcIdx = 0; wIdx = 0; qScore = 0; qTotal = 0;
  quizPool = []; quizAskedWords = [];

  const deckSelection = document.getElementById('quizDeckSelection');
  const gameSection = document.getElementById('quizGameSection');
  if (deckSelection) deckSelection.style.display = 'none';
  if (gameSection) gameSection.style.display = 'block';

  newQuiz();
  showToast(`✏️ Bắt đầu trắc nghiệm "${deckName}"!`, 'success');
}
window.startQuizWithDeck = startQuizWithDeck;
```

### backToQuizSelection()
```js
function backToQuizSelection() {
  document.getElementById('quizDeckSelection').style.display = 'block';
  document.getElementById('quizGameSection').style.display = 'none';
  qScore = 0; qTotal = 0;
  document.getElementById('qScore').textContent = 'Điểm: 0 / 0';
  document.getElementById('qResult').textContent = '';
}
```

### DOMContentLoaded in quiz.js
```js
document.addEventListener('DOMContentLoaded', () => {
  // Check for pending deck from custom.js
  const pendingDeckStr = localStorage.getItem('wq_pending_deck');
  if (pendingDeckStr) {
    localStorage.removeItem('wq_pending_deck');
    localStorage.removeItem('wq_pending_mode');
    const pendingDeck = JSON.parse(pendingDeckStr);
    startQuizWithDeck(pendingDeck.name, pendingDeck.words);
  } else {
    renderQuizHskGrid();
    renderQuizCustomDecks();
  }
});
```

---

## 4. js/write.js — Complete Function Sources

### renderWriterList()
```js
function renderWriterList() {
  const pick = document.getElementById('wPick');
  pick.innerHTML = '';
  deck.forEach((w, i) => {
    const d = document.createElement('div');
    d.className = 'w-char';
    d.textContent = w.h;
    d.onclick = () => { wIdx = i; renderWriter(); };
    pick.appendChild(d);
  });
}
```

### renderWriter()
```js
function renderWriter() {
  if (!deck.length) return;
  const w = deck[wIdx];
  recordLearnedWord(w.h);
  document.getElementById('wPinyin').textContent = w.p;
  document.getElementById('wMean').textContent = w.m;
  document.getElementById('wWord').textContent = w.h;
  document.getElementById('wLevel').textContent = level === 'favorites' ? 'Yêu thích' : level;
  document.querySelectorAll('#wPick .w-char').forEach((c, i) => c.classList.toggle('active', i === wIdx));
  buildWriter(w.h);
}
```

### buildWriter()
```js
function buildWriter(word) {
  const tgt = document.getElementById('writer-target');
  tgt.innerHTML = '';
  wChars = [...word].filter(c => /[\u4e00-\u9fff]/.test(c));
  if (!wChars.length) {
    tgt.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Không có chữ Hán</div>';
    writer = null;
    return;
  }
  const containerWidth = tgt.clientWidth || tgt.parentElement.clientWidth || 300;
  const padding = 16;
  const gap = 12;
  const maxCols = Math.min(wChars.length, 4);
  const availableWidth = containerWidth - (padding * 2) - (gap * (maxCols - 1));
  let size = Math.floor(availableWidth / maxCols);
  size = Math.min(160, Math.max(100, size));

  const writers = [];
  wChars.forEach((ch, i) => {
    const div = document.createElement('div');
    div.id = 'wz' + i;
    div.style.display = 'inline-block';
    div.style.margin = '6px';
    div.style.background = 'rgba(255, 255, 255, 0.02)';
    div.style.borderRadius = '16px';
    div.style.border = '1px solid rgba(139, 92, 246, 0.15)';
    div.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
    div.style.touchAction = 'none';
    tgt.appendChild(div);
    writers.push(HanziWriter.create('wz' + i, ch, {
      width: size, height: size,
      padding: Math.floor(size * 0.08),
      strokeColor: '#332f55',
      radicalColor: '#D946EF',
      showOutline: true,
      showCharacter: true,
      drawingColor: '#00F2FE',
      drawingWidth: 5
    }));
  });
  writer = { writers };
}
```

### wAnimate/wQuiz/wAudio bindings
```js
document.getElementById('wAnimate').onclick = () => {
  if (!writer) return;
  let i = 0;
  const run = () => {
    if (i < writer.writers.length) {
      writer.writers[i].animateCharacter({ onComplete: () => { i++; run(); } });
    }
  };
  run();
  speak(deck[wIdx].h);
};

document.getElementById('wQuiz').onclick = () => {
  if (!writer) return;
  writer.writers.forEach(wz => wz.quiz());
};

document.getElementById('wAudio').onclick = () => speak(deck[wIdx].h);
```

---

## 5. js/stats.js — Complete Function Sources

### renderStatsSection()
```js
function renderStatsSection() {
  const container = document.getElementById('statsModalBody');
  if (!container) return;

  const progress = (window.WQStorage && WQStorage.getProgress()) ||
    JSON.parse(localStorage.getItem('wq_progress')) || {};
  const learned = progress.learned || [];
  const srs = (window.WQStorage && WQStorage.getSRS()) ||
    JSON.parse(localStorage.getItem('wq_srs')) || {};
  const favCount = favorites.length;

  let hskStatsHtml = '';
  if (typeof DATA !== 'undefined') {
    Object.keys(DATA).forEach(lvl => {
      const words = DATA[lvl] || [];
      const total = words.length;
      const learnedInLvl = words.filter(w => learned.includes(w.h)).length;
      const pct = total > 0 ? Math.round((learnedInLvl / total) * 100) : 0;
      hskStatsHtml += `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 16px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 700; color: #fff; font-size: 1.05rem;">${lvl}</span>
            <span style="color: var(--neon-cyan); font-weight: 600; font-size: 0.9rem;">${learnedInLvl} / ${total} (${pct}%)</span>
          </div>
          <div style="height: 8px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background: var(--accent-gradient); border-radius: 99px; transition: width 0.4s ease;"></div>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = `
    <div style="padding: 10px;">
      <h3 style="font-size: 1.4rem; font-weight: 800; color: #fff; margin-bottom: 20px;">📊 Tổng quan học tập</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 28px;">
        <div class="glass-card" style="text-align: center; padding: 20px;">
          <div style="font-size: 2.2rem; font-weight: 800; color: var(--neon-cyan);">${learned.length}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 6px;">Từ vựng đã học</div>
        </div>
        <div class="glass-card" style="text-align: center; padding: 20px;">
          <div style="font-size: 2.2rem; font-weight: 800; color: var(--neon-green);">${Object.keys(srs).length}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 6px;">Từ trong SRS ôn tập</div>
        </div>
        <div class="glass-card" style="text-align: center; padding: 20px;">
          <div style="font-size: 2.2rem; font-weight: 800; color: var(--neon-red);">${favCount}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 6px;">Từ yêu thích ⭐</div>
        </div>
      </div>
      <h4 class="section-subtitle" style="margin-bottom: 16px;">Tiến độ theo cấp độ HSK</h4>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${hskStatsHtml}
      </div>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  renderStatsSection();
});
```

---

## 6. js/favorites.js — Complete Function Sources

### renderFavModalList()
```js
function renderFavModalList() {
  const favModalList = document.getElementById('favModalList');
  if (!favModalList) return;
  favModalList.innerHTML = '';

  if (favorites.length === 0) {
    favModalList.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">Danh sách yêu thích trống</div>';
    return;
  }

  favorites.forEach((w) => {
    const item = document.createElement('div');
    item.className = 'fav-item';

    item.onclick = (e) => {
      if (e.target.closest('.fav-item-btn')) return;
      // Multi-page: navigate to flash.html with the word
      localStorage.setItem('wq_pending_level', w.levelGoc || 'HSK 1');
      localStorage.setItem('wq_pending_word', w.h);
      window.location.href = 'flash.html';
    };

    item.innerHTML = `
      <div class="fav-item-info">
        <div class="fav-item-main">
          <span class="fav-item-hanzi">${w.h}</span>
          <span class="fav-item-level">${w.levelGoc || 'HSK'}</span>
          <span class="fav-item-pinyin">${w.p}</span>
        </div>
        <span class="fav-item-mean">${w.m}</span>
      </div>
      <div class="fav-item-actions">
        <button class="fav-item-btn speak" aria-label="Speak">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        </button>
        <button class="fav-item-btn delete" aria-label="Delete">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    `;

    item.querySelector('.fav-item-btn.speak').onclick = (e) => {
      e.stopPropagation();
      speak(w.h);
    };

    item.querySelector('.fav-item-btn.delete').onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(w);
      renderFavModalList();
    };

    favModalList.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderFavModalList();
});
```

---

## 7. js/custom.js — Complete Custom Deck IIFE

The entire CUSTOM DECK FEATURE IIFE from app.js (lines ~1700–2960). Key notes for multi-page:

- `startStudySession()` must use `localStorage.setItem('wq_pending_deck', ...)` + `window.location.href` instead of the SPA `navigateToQuizAndStart()` / `flashMenu.click()` approach.
- `saveCustomDeck()` uses `prompt()` — replace with `wqPopup.prompt()`.
- `renderCustomHistory()` delete action uses `confirm()` — replace with `wqPopup.confirm()`.
- `checkFlashcardComplete()` is exported to `window.checkFlashcardComplete` at end.

```js
(function() {
  let currentCustomWords = [];
  let customHistory = [];
  let selectedWord = null;

  // [All functions as extracted above: loadCustomHistory, saveCustomHistory,
  //  searchInDatabase, renderCustomSearchSuggestions, selectWordFromDatabase,
  //  deselectWord, addSelectedWord, addManualWord, clearManualForm,
  //  renderCustomWordsList, saveCustomDeck, studyCustomDeck, showStudyModeModal,
  //  startStudySession (MODIFIED for multi-page), checkFlashcardComplete,
  //  renderCustomHistory, initCustomDeckEvents,
  //  openImportJsonModal, closeImportJsonModal, parseImportedJson,
  //  importJsonWords, showImportActionDialog, saveCustomDeckWithName,
  //  autoSaveImportedDeck, processJsonImport, showDuplicateConfirmDialog,
  //  handleSkipDuplicates, handleOverwriteDuplicates, closeDuplicateModal]

  // MODIFIED startStudySession for multi-page:
  function startStudySession(deckName, words, mode) {
    level = deckName;
    deck = [...words];
    shuffle(deck);  // BUG FIX
    fcIdx = 0; wIdx = 0; qScore = 0; qTotal = 0;

    if (mode === 'flashcard') {
      localStorage.setItem('wq_pending_deck', JSON.stringify({ name: deckName, words }));
      localStorage.setItem('wq_pending_mode', 'flashcard');
      window.location.href = 'flash.html';
    } else if (mode === 'quiz') {
      localStorage.setItem('wq_pending_deck', JSON.stringify({ name: deckName, words }));
      localStorage.setItem('wq_pending_mode', 'quiz');
      window.location.href = 'quiz.html';
    } else if (mode === 'both') {
      sessionStorage.setItem('wq_study_mode', 'both');
      sessionStorage.setItem('wq_study_deck', JSON.stringify({ name: deckName, words }));
      localStorage.setItem('wq_pending_deck', JSON.stringify({ name: deckName, words }));
      localStorage.setItem('wq_pending_mode', 'both');
      window.location.href = 'flash.html';
    }
  }

  // DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    initCustomDeckEvents();
    setTimeout(async () => {
      await loadCustomHistory();
      renderCustomHistory();
    }, 600);
  });

  window.checkFlashcardComplete = checkFlashcardComplete;
})();
```

---

## 8. js/settings.js — Complete Function Sources

### updateSettingsUI()
```js
function updateSettingsUI() {
  const isLightTheme = document.documentElement.classList.contains('light-theme');
  const settingsThemeBtn = document.getElementById('settingsThemeBtn');
  if (settingsThemeBtn) {
    settingsThemeBtn.textContent = isLightTheme ? '☀️ Chế độ sáng' : '🌙 Chế độ tối';
  }
  const settingsAutoplaySpeed = document.getElementById('settingsAutoplaySpeed');
  // Read saved autoplay speed from localStorage (set by flash.js)
  const savedSpeed = localStorage.getItem('wq_autoplay_speed') || '5000';
  if (settingsAutoplaySpeed) {
    settingsAutoplaySpeed.value = savedSpeed;
  }
}
```

### initSettingsEvents()
```js
function initSettingsEvents() {
  const settingsThemeBtn = document.getElementById('settingsThemeBtn');
  const settingsAutoplaySpeed = document.getElementById('settingsAutoplaySpeed');
  const resetProgressBtn = document.getElementById('resetProgressBtn');

  if (settingsThemeBtn) {
    settingsThemeBtn.onclick = () => {
      const isLight = document.documentElement.classList.toggle('light-theme');
      localStorage.setItem('wq_theme', isLight ? 'light' : 'dark');
      setTimeout(updateSettingsUI, 50);
    };
  }

  if (settingsAutoplaySpeed) {
    settingsAutoplaySpeed.onchange = () => {
      // Save to localStorage so flash.html can read it on next load
      localStorage.setItem('wq_autoplay_speed', settingsAutoplaySpeed.value);
    };
  }

  if (resetProgressBtn) {
    resetProgressBtn.onclick = async () => {
      const confirmed = await wqPopup.confirm(
        'Bạn có chắc chắn muốn xóa toàn bộ tiến trình học tập, danh sách yêu thích và lịch ôn tập SRS không?\n\nHành động này không thể hoàn tác!',
        { title: 'Xóa tiến trình', icon: '🗑️', okText: 'Xóa tất cả', cancelText: 'Hủy' }
      );
      if (confirmed) {
        if (window.WQStorage) {
          WQStorage.resetAll();
        } else {
          localStorage.removeItem('wq_progress');
          localStorage.removeItem('wq_favorites');
          localStorage.removeItem('wq_srs');
        }
        favorites = [];
        level = 'HSK 1';
        showToast('Đã khôi phục cài đặt tiến trình học tập về ban đầu!', 'success');
        // Navigate to home
        window.location.href = 'index.html';
      }
    };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateSettingsUI();
  initSettingsEvents();
});
```

---

## Key Bug Fixes Summary

| Bug | Location | Fix |
|-----|----------|-----|
| No auto-shuffle on deck load | `applyRange()` in shared.js | Add `shuffle(deck)` after `deduplicateWords()` |
| No shuffle on custom deck study | `startStudySession()` in custom.js | Add `shuffle(deck)` after `deck = [...words]` |
| `level` init `'HSK1'` vs `'HSK 1'` | State init in shared.js | Initialize `let level = 'HSK 1'` |
| Favorite fallback level `'HSK1'` | `toggleFavorite()` in flash.js | Change `\|\| 'HSK1'` to `\|\| 'HSK 1'` |
| `saveProgress()` references `.tab.active` | multi-page flash.js | On flash.html there's no `.tab`, save `'flash'` directly |

## Script Load Order (every HTML page)
```html
<script src="data/data.js?v=8"></script>        <!-- NOT defer, defines const DATA -->
<script src="storage.js?v=8" defer></script>
<script src="api-client.js?v=8" defer></script>
<script src="profile.js?v=8" defer></script>
<script src="js/shared.js?v=8" defer></script>
<script src="js/[page].js?v=8" defer></script>  <!-- flash.js / quiz.js / write.js / etc. -->
```
`data/data.js` must be a plain `<script>` (NOT `defer`) because it declares `const DATA` which shared.js needs synchronously.
