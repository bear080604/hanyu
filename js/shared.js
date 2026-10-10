// ==================== SHARED.JS — Global state, utilities, navigation ====================
// Loaded on every page. No import/export — plain globals only.

// ---------- $ helper ----------
const $ = id => document.getElementById(id);

// ---------- DATA fallback ----------
if (typeof DATA === 'undefined') {
  window.DATA = {};
}
let API_ENABLED = false;

// ---------- Global state ----------
let level = 'HSK 1'; // IMPORTANT: 'HSK 1' with space — matches DATA keys
let deck = [];
let fcIdx = 0;
let qScore = 0;
let qTotal = 0;
let wIdx = 0;
let wChars = [];
const userId = 'default_user';

let favorites = (window.WQStorage && WQStorage.getFavorites()) || JSON.parse(localStorage.getItem('wq_favorites')) || [];
let autoplayInterval = null;
let autoplayRunning = false;
let autoplayTimer = null;
let quizMode = localStorage.getItem('wq_quiz_mode') || 'hanzi-to-mean';
let quizPool = [];
let quizAskedWords = [];

// ---------- AppState export (consumed by page scripts and profile.js) ----------
window.AppState = {
  level: level,
  deck: deck,
  fcIdx: fcIdx,
  wIdx: wIdx,
  favorites: favorites,
  quizMode: quizMode,
  quizPool: quizPool,
  quizAskedWords: quizAskedWords,
  qScore: qScore,
  qTotal: qTotal
};

// ==================== TOAST NOTIFICATION ====================
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

// ==================== MODAL POPUP SYSTEM ====================
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

// ==================== UTILITIES ====================
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

// Fisher-Yates in-place shuffle
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// ==================== AUDIO / TTS ====================
let zhVoice = null;
function loadVoices() {
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find(v => /zh|Chinese|中文|普通话/i.test(v.lang + v.name)) || null;
}
loadVoices();
if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(t) {
  if (!t) return;
  try { speechSynthesis.cancel(); } catch(e) {}

  const providers = [
    `https://dict.youdao.com/dictvoice?le=zh&audio=${encodeURIComponent(t)}`,
    `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(t)}`
  ];

  let providerIndex = 0;

  const fallbackToWebSpeech = () => {
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

    audio.onplaying = () => { played = true; clearTimeout(playTimeout); };
    audio.onerror = () => {
      clearTimeout(playTimeout);
      if (!fallbackTriggered) { fallbackTriggered = true; providerIndex++; tryPlayTTS(); }
    };
    audio.play().catch(() => {
      clearTimeout(playTimeout);
      if (!fallbackTriggered) { fallbackTriggered = true; providerIndex++; tryPlayTTS(); }
    });
  };

  tryPlayTTS();
}

// ==================== PARTICLE ANIMATION ====================
(function initParticleCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
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
    for (let i = 0; i < 60; i++) particles.push(new Particle());
  }
  initParticles();

  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animateParticles);
  }
  animateParticles();
})();

// ==================== THEME INIT ====================
(function initTheme() {
  if (localStorage.getItem('wq_theme') === 'light') {
    document.documentElement.classList.add('light-theme');
  }
  // themeBtn is hidden in multi-page setup; settings.html handles toggle via settingsThemeBtn
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    const isLight = document.documentElement.classList.contains('light-theme');
    themeBtn.textContent = isLight ? '☀️' : '🌙';
    themeBtn.onclick = () => {
      const nowLight = document.documentElement.classList.toggle('light-theme');
      themeBtn.textContent = nowLight ? '☀️' : '🌙';
      localStorage.setItem('wq_theme', nowLight ? 'light' : 'dark');
    };
  }
})();

// ==================== API INTEGRATION ====================
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
    initUIWithData();
  } catch (error) {
    console.warn('⚠️ API not available for HSK data, falling back to embedded data:', error);
    console.log('✅ Using embedded data:', Object.keys(DATA).length, 'levels');
    initUIWithData();
  }
}

// ==================== SELECTORS & DECK MANAGEMENT ====================
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

  // Restore saved level
  const saved = (window.WQStorage && WQStorage.getProgress()) || JSON.parse(localStorage.getItem('wq_progress'));
  if (saved && saved.level) {
    level = saved.level;
    lvlSel.value = level;
  } else {
    lvlSel.value = level;
  }

  lvlSel.onchange = () => {
    level = lvlSel.value;
    buildRanges(level);
    applyRange();
    saveProgress();
  };

  buildRanges(level);
  loadProgress();
  applyRange();
}

function updateFavOptionText() {
  if (!lvlSel) return;
  const oFav = Array.from(lvlSel.options).find(o => o.value === 'favorites');
  if (oFav) {
    oFav.textContent = '⭐ Yêu thích (' + favorites.length + ')';
  }
}

function buildRanges(lvl) {
  if (typeof DATA === 'undefined') return;
  const sel = document.getElementById('rangeSel');
  if (!sel) return;
  const currentLevel = lvl || level;
  sel.innerHTML = '';

  if (currentLevel === 'favorites') {
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'Tất cả';
    sel.appendChild(all);
    sel.onchange = () => { applyRange(); saveProgress(); };
    return;
  }
  if (!DATA[currentLevel]) return;
  const n = DATA[currentLevel].length, size = 50;
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
  sel.onchange = () => { applyRange(); saveProgress(); };
}

function applyRange() {
  if (typeof DATA === 'undefined') return;
  const rangeSel = document.getElementById('rangeSel');
  if (!rangeSel) return;
  const v = rangeSel.value;
  let src;
  if (level === 'favorites') {
    src = favorites;
  } else {
    if (!DATA[level]) return;
    src = DATA[level];
  }
  if (v === 'all' || level === 'favorites') {
    deck = src.slice();
  } else {
    const [a, b] = v.split('-').map(Number);
    deck = src.slice(a, b);
  }
  // BUG FIX: deduplicate then shuffle on every deck load
  deck = deduplicateWords(deck);
  shuffle(deck);
  fcIdx = 0; wIdx = 0; qScore = 0; qTotal = 0;
  quizPool = [];
  quizAskedWords = [];

  // Update AppState references
  window.AppState.deck = deck;
  window.AppState.fcIdx = fcIdx;
  window.AppState.wIdx = wIdx;
  window.AppState.qScore = qScore;
  window.AppState.qTotal = qTotal;
  window.AppState.quizPool = quizPool;
  window.AppState.quizAskedWords = quizAskedWords;

  // Notify page-specific renderers if they exist
  if (typeof renderFlash === 'function') renderFlash();
  if (typeof renderWriterList === 'function') renderWriterList();
  if (typeof renderWriter === 'function') renderWriter();
  if (typeof newQuiz === 'function') newQuiz();
  if (typeof renderFavIcon === 'function') renderFavIcon();
}

// ==================== PROGRESS SAVE / LOAD ====================
function saveProgress() {
  const rangeSel = document.getElementById('rangeSel');
  const progressData = {
    level,
    rangeVal: rangeSel ? rangeSel.value : 'all',
    fcIdx,
    wIdx,
    learned: ((window.WQStorage && WQStorage.getProgress() && WQStorage.getProgress().learned) ||
      JSON.parse(localStorage.getItem('wq_progress'))?.learned) || []
  };
  if (window.WQStorage) {
    WQStorage.saveProgress(progressData);
  } else {
    localStorage.setItem('wq_progress', JSON.stringify(progressData));
  }
}

function loadProgress() {
  // Nếu có pending deck từ cross-page nav, không overwrite deck
  var hasPending = localStorage.getItem('wq_pending_deck') &&
    (localStorage.getItem('wq_pending_mode') === 'quiz' ||
     localStorage.getItem('wq_pending_mode') === 'both' ||
     localStorage.getItem('wq_pending_mode') === 'flashcard');

  const saved = (window.WQStorage && WQStorage.getProgress()) || JSON.parse(localStorage.getItem('wq_progress'));
  if (saved) {
    if (saved.level) {
      level = saved.level;
      window.AppState.level = level;
      const lvlSelEl = document.getElementById('levelSel');
      if (lvlSelEl) lvlSelEl.value = level;
    }
    buildRanges(level);
    const rangeSel = document.getElementById('rangeSel');
    if (saved.rangeVal && rangeSel) {
      rangeSel.value = saved.rangeVal;
    }
    if (!hasPending) {
      applyRange();
    }
    if (!hasPending && saved.fcIdx !== undefined && saved.fcIdx < deck.length) {
      fcIdx = saved.fcIdx;
      window.AppState.fcIdx = fcIdx;
      if (typeof renderFlash === 'function') renderFlash();
    }
    if (!hasPending && saved.wIdx !== undefined && saved.wIdx < deck.length) {
      wIdx = saved.wIdx;
      window.AppState.wIdx = wIdx;
      if (typeof renderWriterList === 'function') renderWriterList();
      if (typeof renderWriter === 'function') renderWriter();
    }
  } else {
    buildRanges(level);
    applyRange();
  }
}

// ==================== SYNC DATA HELPER ====================
window.WQSyncData = function() {
  favorites = (window.WQStorage && WQStorage.getFavorites()) || JSON.parse(localStorage.getItem('wq_favorites')) || [];
  window.AppState.favorites = favorites;
  updateFavOptionText();
};

// ==================== SEARCH FUNCTIONALITY ====================
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

// Multi-page: save word to localStorage then navigate to flash.html
function navigateToWord(word) {
  localStorage.setItem('wq_navigate_word', JSON.stringify(word));
  window.location.href = '../pages/flash.html';
}

// ==================== HOME DASHBOARD ====================
function updateHomeDashboard() {
  // Only runs when #homeHskGrid is present in the DOM
  if (!document.getElementById('homeHskGrid')) return;

  const welcomeText = document.getElementById('welcomeUserText');
  const userStreakVal = document.getElementById('userStreakVal');

  if (welcomeText) {
    welcomeText.textContent = 'Chào mừng bạn học tập! 👋';
  }

  const learnedList = (window.WQStorage && WQStorage.getProgress() && WQStorage.getProgress().learned) ||
    JSON.parse(localStorage.getItem('wq_progress'))?.learned || [];
  const streak = learnedList.length > 0 ? Math.max(1, Math.min(30, Math.ceil(learnedList.length / 5))) : 0;
  if (userStreakVal) {
    userStreakVal.textContent = `${streak} ngày`;
  }

  renderHomeHskGrid();
}

function renderHomeHskGrid() {
  // Only runs when #homeHskGrid is present in the DOM
  const homeHskGrid = document.getElementById('homeHskGrid');
  if (!homeHskGrid || typeof DATA === 'undefined') return;

  homeHskGrid.innerHTML = '';
  const learnedList = (window.WQStorage && WQStorage.getProgress() && WQStorage.getProgress().learned) ||
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
    if (words) {
      words.forEach(w => { if (learnedList.includes(w.h)) learnedCount++; });
    }
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
      localStorage.setItem('wq_pending_level', lvl);
      window.location.href = '../pages/flash.html';
    };

    homeHskGrid.appendChild(card);
  });
}

// ==================== SIDEBAR NAVIGATION ====================
function initSidebarNavigation() {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

  // Set active menu item by matching location.pathname to href filename
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
  menuItems.forEach(item => {
    const href = item.getAttribute('href') || '';
    const itemPage = href.split('/').pop();
    if (itemPage === currentPage || (currentPage === '' && itemPage === 'index.html')) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Sidebar toggle (hamburger #menuBtn or #sidebarToggleBtn)
  const menuBtn = document.getElementById('menuBtn') || sidebarToggleBtn;
  if (menuBtn && sidebar) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('active');
    };

    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('active') &&
          !sidebar.contains(e.target) &&
          e.target !== menuBtn) {
        sidebar.classList.remove('active');
      }
    });
  }
}

// ==================== HEADER TITLE UPDATE ====================
function updateHeaderTitle() {
  const titleEl = document.getElementById('headerTitle');
  if (!titleEl) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  const titles = {
    'index.html': 'Trang chủ',
    '': 'Trang chủ',
    'flash.html': 'Flashcard',
    'quiz.html': 'Trắc nghiệm',
    'write.html': 'Nét chữ',
    'stats.html': 'Thống kê',
    'favorites.html': 'Yêu thích',
    'custom.html': 'Tự tạo',
    'settings.html': 'Cài đặt'
  };
  titleEl.textContent = titles[page] || 'WenQing';
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener('DOMContentLoaded', () => {
  // Theme is applied at parse time (IIFE above), nothing extra needed here

  // Load voices for TTS
  loadVoices();

  // Sidebar navigation + hamburger toggle
  initSidebarNavigation();

  // Update header title based on current page
  updateHeaderTitle();

  // learnSelectorsWrapper: show only on flash.html, quiz.html, write.html
  const learnSelectorsWrapper = document.getElementById('learnSelectorsWrapper');
  if (learnSelectorsWrapper) {
    const currentPage = location.pathname.split('/').pop() || 'index.html';
    const learningPages = ['flash.html', 'quiz.html', 'write.html'];
    learnSelectorsWrapper.style.display = learningPages.includes(currentPage) ? 'flex' : 'none';
  }

  // Profile button
  const openProfileBtn = document.getElementById('openProfileBtn');
  if (openProfileBtn) {
    openProfileBtn.onclick = () => {
      if (window.WQProfile) WQProfile.openProfileModal();
    };
  }

  // shuffleBtn binding
  const shuffleBtn = document.getElementById('shuffleBtn');
  if (shuffleBtn) {
    shuffleBtn.onclick = () => {
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
  }

  // levelSel and rangeSel bindings (set up inside initUIWithData once data is ready)

  // Load data: use API if available, else fall back to embedded DATA
  if (window.WeiQuanAPI) {
    API_ENABLED = true;
    console.log('✅ API client available, API_ENABLED = true');
    loadDataFromAPI().catch(err => {
      console.error('Failed to load HSK data from API:', err);
      // initUIWithData was already called in loadDataFromAPI catch block
    });
  } else if (typeof DATA !== 'undefined' && Object.keys(DATA).length > 0) {
    console.log('✅ Using embedded data');
    API_ENABLED = false;
    initUIWithData();
  } else {
    // DATA not yet available — retry once after a tick (data.js may load async via defer)
    setTimeout(() => {
      if (typeof DATA !== 'undefined' && Object.keys(DATA).length > 0) {
        initUIWithData();
      }
    }, 500);
  }

  // Search box
  const searchInput = document.getElementById('searchInput');
  const suggestionsBox = document.getElementById('searchSuggestions');
  if (searchInput && suggestionsBox) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) { suggestionsBox.style.display = 'none'; return; }

      const normQuery = removePinyinTones(query);
      let results = [];

      Object.keys(DATA).forEach(lvl => {
        if (!DATA[lvl]) return;
        DATA[lvl].forEach(w => {
          const matchHanzi = w.h && w.h.toLowerCase().includes(query);
          const matchMean = w.m && w.m.toLowerCase().includes(query);
          const matchPinyin = w.p && (w.p.toLowerCase().includes(query) || removePinyinTones(w.p).includes(normQuery));
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

  // Home dashboard — only when #homeHskGrid exists in DOM
  if (document.getElementById('homeHskGrid')) {
    setTimeout(updateHomeDashboard, 100);
  }
});
