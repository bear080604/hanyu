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
  alert(msgOrOpts, opts = {}) {
    if (msgOrOpts && typeof msgOrOpts === 'object') {
      opts = msgOrOpts;
      msgOrOpts = opts.message || '';
    }
    const message = String(msgOrOpts || '');
    const title = opts.title || 'Thông báo';
    const icon = opts.icon || '💡';
    const okText = opts.okText || opts.confirmText || 'Đồng ý';

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
      okBtn.textContent = okText;
      okBtn.onclick = () => { overlay.style.display = 'none'; resolve(); };
      actionsEl.appendChild(okBtn);

      overlay.style.display = 'flex';
      okBtn.focus();
    });
  },
  confirm(msgOrOpts, opts = {}) {
    if (msgOrOpts && typeof msgOrOpts === 'object') {
      opts = msgOrOpts;
      msgOrOpts = opts.message || '';
    }
    const message = String(msgOrOpts || '');
    const title = opts.title || 'Xác nhận';
    const icon = opts.icon || '❓';
    const okText = opts.okText || opts.confirmText || 'Xác nhận';
    const cancelText = opts.cancelText || 'Hủy';

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
  prompt(msgOrOpts, opts = {}) {
    if (msgOrOpts && typeof msgOrOpts === 'object') {
      opts = msgOrOpts;
      msgOrOpts = opts.message || '';
    }
    const message = String(msgOrOpts || '');
    const title = opts.title || 'Nhập thông tin';
    const icon = opts.icon || '✏️';
    const placeholder = opts.placeholder || '';
    const defaultValue = opts.defaultValue || '';

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
function normalizeSentenceEntry(rawEntry) {
  if (!rawEntry) return null;
  if (typeof rawEntry === 'string') {
    let exStr = rawEntry.trim();
    if (!exStr) return null;
    let tokensStr = null;
    if (exStr.indexOf('/') !== -1) {
      const endMatch = exStr.match(/[。？！.?!]+$/);
      const endPunct = endMatch ? endMatch[0] : '。';
      const rawParts = exStr.replace(/[。？！.?!]+$/, '').split('/').map(s => s.replace(/^[，、；：,;\s]+|[，、；：,;\s]+$/g, '').trim()).filter(Boolean);
      if (rawParts.length >= 2) tokensStr = rawParts;
      exStr = exStr.replace(/\s*\/\s*/g, '');
      if (!/[。？！.?!]$/.test(exStr)) exStr += endPunct;
    }
    const resStr = { ex: exStr, exp: '', exm: '' };
    if (tokensStr) resStr.tokens = tokensStr;
    return resStr;
  }

  if (typeof rawEntry !== 'object') return null;
  let ex = String(rawEntry.ex || rawEntry.e || rawEntry.example || rawEntry.sentence || rawEntry.s || '').trim();
  if (!ex) return null;
  let exp = String(rawEntry.exp || rawEntry.ep || rawEntry.example_pinyin || rawEntry.sentence_pinyin || '').replace(/\//g, '').trim();
  let exm = String(rawEntry.exm || rawEntry.em || rawEntry.example_meaning || rawEntry.sentence_meaning || '').trim();
  let tokens = Array.isArray(rawEntry.tokens) ? rawEntry.tokens : (Array.isArray(rawEntry.segments) ? rawEntry.segments : null);
  let blank = rawEntry.blank ? String(rawEntry.blank).trim() : '';
  let options = Array.isArray(rawEntry.options) ? rawEntry.options : null;

  if (ex.indexOf('/') !== -1) {
    const endMatch = ex.match(/[。？！.?!]+$/);
    const endPunct = endMatch ? endMatch[0] : '。';
    const rawParts = ex.replace(/[。？！.?!]+$/, '').split('/').map(s => s.replace(/^[，、；：,;\s]+|[，、；：,;\s]+$/g, '').trim()).filter(Boolean);
    if (rawParts.length >= 2 && !tokens) tokens = rawParts;
    ex = ex.replace(/\s*\/\s*/g, '');
    if (!/[。？！.?!]$/.test(ex)) ex += endPunct;
  }

  const out = { ex, exp, exm };
  if (tokens && tokens.length) out.tokens = tokens;
  if (blank) out.blank = blank;
  if (options && options.length) out.options = options;
  return out;
}
window.normalizeSentenceEntry = normalizeSentenceEntry;

function enrichWordWithSentence(word) {
  if (!word || !word.h) return word;
  const h = word.h.trim();
  const cleanH = h.split('|')[0].trim();

  const examples = [];
  const addExampleUnique = (entry) => {
    const norm = normalizeSentenceEntry(entry);
    if (!norm || !norm.ex) return;
    const existing = examples.find(x => x.ex === norm.ex);
    if (!existing) {
      examples.push(norm);
    } else {
      if (!existing.exp && norm.exp) existing.exp = norm.exp;
      if (!existing.exm && norm.exm) existing.exm = norm.exm;
      if (!existing.tokens && norm.tokens) existing.tokens = norm.tokens;
      if (!existing.blank && norm.blank) existing.blank = norm.blank;
      if (!existing.options && norm.options) existing.options = norm.options;
    }
  };

  // A. Explicit examples / sentences array on word
  const rawArr = Array.isArray(word.examples) ? word.examples : (Array.isArray(word.sentences) ? word.sentences : null);
  if (rawArr) {
    rawArr.forEach(addExampleUnique);
  }

  // B. Single or multi-sentence (separated by "||" or "\n") in word.ex / word.exp / word.exm
  const rawExStr = String(word.ex || word.e || word.example || '').trim();
  const rawExpStr = String(word.exp || word.example_pinyin || '').trim();
  const rawExmStr = String(word.exm || word.example_meaning || '').trim();
  if (rawExStr) {
    const splitDelim = rawExStr.indexOf('||') !== -1 ? /\s*\|\|\s*/ : /\r?\n+/;
    const exParts = rawExStr.split(splitDelim).map(s => s.trim()).filter(Boolean);
    const expParts = rawExpStr ? rawExpStr.split(splitDelim).map(s => s.trim()) : [];
    const exmParts = rawExmStr ? rawExmStr.split(splitDelim).map(s => s.trim()) : [];
    exParts.forEach((partEx, idx) => {
      addExampleUnique({
        ex: partEx,
        exp: expParts[idx] || (idx === 0 ? rawExpStr : '') || '',
        exm: exmParts[idx] || (idx === 0 ? rawExmStr : '') || '',
        tokens: idx === 0 && Array.isArray(word.tokens) ? word.tokens : null,
        blank: idx === 0 && word.blank ? word.blank : '',
        options: idx === 0 && Array.isArray(word.options) ? word.options : null
      });
    });
  }

  // 1. Check user custom saved sentences in localStorage
  try {
    const customSent = JSON.parse(localStorage.getItem('wq_custom_sentences') || '{}');
    const cs = customSent[h] || customSent[cleanH];
    if (cs) {
      if (Array.isArray(cs.examples)) {
        cs.examples.forEach(addExampleUnique);
      }
      if (cs.ex) {
        addExampleUnique(cs);
      }
    }
  } catch (e) { }

  // 2. Check WQ_SENTENCE_BANK (curated sentences for cloud custom decks)
  if (examples.length === 0 && window.WQ_SENTENCE_BANK) {
    const sb = window.WQ_SENTENCE_BANK[h] || window.WQ_SENTENCE_BANK[cleanH];
    if (sb) {
      if (Array.isArray(sb.examples)) sb.examples.forEach(addExampleUnique);
      if (sb.ex) addExampleUnique(sb);
    }
  }

  // 3. Check DATA (HSK 1-6)
  if (examples.length === 0 && typeof DATA !== 'undefined') {
    for (const lvl of Object.keys(DATA)) {
      const list = DATA[lvl] || [];
      const found = list.find(item => {
        if (!item || !item.h) return false;
        const variants = item.h.split('|').map(s => s.trim());
        return variants.includes(h) || variants.includes(cleanH);
      });
      if (found && (found.ex || found.e)) {
        addExampleUnique({
          ex: (found.ex || found.e).split('\n')[0].trim(),
          exp: (found.exp || '').replace(/\//g, '').split('\n')[0].trim(),
          exm: (found.exm || '').split('\n')[0].trim()
        });
        break;
      }
    }
  }

  const primary = examples[0] || { ex: '', exp: '', exm: '' };
  const out = {
    ...word,
    ex: primary.ex || '',
    exp: primary.exp || '',
    exm: primary.exm || ''
  };
  if (primary.tokens && primary.tokens.length) out.tokens = primary.tokens;
  else delete out.tokens;
  if (primary.blank) out.blank = primary.blank;
  else delete out.blank;
  if (primary.options && primary.options.length) out.options = primary.options;
  else delete out.options;
  if (examples.length > 0) {
    out.examples = examples;
  }
  return out;
}
window.enrichWordWithSentence = enrichWordWithSentence;

function mergeWordExamples(targetWord, sourceWord) {
  if (!targetWord) return sourceWord;
  if (!sourceWord) return targetWord;
  const t = enrichWordWithSentence(targetWord);
  const s = enrichWordWithSentence(sourceWord);
  const combined = Array.isArray(t.examples) ? t.examples.slice() : [];
  const sExamples = Array.isArray(s.examples) ? s.examples : [];
  sExamples.forEach(entry => {
    const norm = normalizeSentenceEntry(entry);
    if (!norm || !norm.ex) return;
    const exist = combined.find(x => x.ex === norm.ex);
    if (!exist) {
      combined.push(norm);
    } else {
      if (!exist.exp && norm.exp) exist.exp = norm.exp;
      if (!exist.exm && norm.exm) exist.exm = norm.exm;
      if (!exist.tokens && norm.tokens) exist.tokens = norm.tokens;
      if (!exist.blank && norm.blank) exist.blank = norm.blank;
      if (!exist.options && norm.options) exist.options = norm.options;
    }
  });
  return enrichWordWithSentence({
    ...t,
    p: t.p || s.p || '',
    m: (t.m && t.m !== 'Chưa có nghĩa') ? t.m : (s.m || t.m || ''),
    examples: combined
  });
}
window.mergeWordExamples = mergeWordExamples;

function pickRandomSentenceVariant(word, lastEx, forceNext) {
  const ew = enrichWordWithSentence(word);
  if (!ew || !Array.isArray(ew.examples) || ew.examples.length === 0) {
    return ew;
  }
  if (ew.examples.length === 1) {
    const single = ew.examples[0];
    return {
      ...ew,
      ex: single.ex || '',
      exp: single.exp || '',
      exm: single.exm || '',
      tokens: single.tokens || null,
      blank: single.blank || '',
      options: single.options || null,
      _variantIndex: 0,
      _variantTotal: 1
    };
  }

  let candidates = ew.examples.map((item, index) => ({ item, index }));
  if (lastEx) {
    const diff = candidates.filter(c => c.item.ex !== lastEx);
    if (diff.length > 0) candidates = diff;
  }

  let picked;
  if (forceNext && lastEx) {
    const curIdx = ew.examples.findIndex(x => x.ex === lastEx);
    const nextIdx = (curIdx + 1) % ew.examples.length;
    picked = { item: ew.examples[nextIdx], index: nextIdx };
  } else {
    picked = candidates[Math.floor(Math.random() * candidates.length)];
  }

  const chosen = picked.item;
  return {
    ...ew,
    ex: chosen.ex || '',
    exp: chosen.exp || '',
    exm: chosen.exm || '',
    tokens: chosen.tokens || null,
    blank: chosen.blank || '',
    options: chosen.options || null,
    _variantIndex: picked.index,
    _variantTotal: ew.examples.length
  };
}
window.pickRandomSentenceVariant = pickRandomSentenceVariant;

function deduplicateWords(arr) {
  if (!Array.isArray(arr)) return [];
  const map = new Map();
  const result = [];
  arr.forEach(w => {
    if (!w || !w.h) return;
    const key = w.h.trim();
    if (!map.has(key)) {
      const ew = enrichWordWithSentence(w);
      map.set(key, ew);
      result.push(ew);
    } else {
      const idx = result.findIndex(item => item.h.trim() === key);
      if (idx !== -1) {
        const merged = mergeWordExamples(result[idx], w);
        result[idx] = merged;
        map.set(key, merged);
      }
    }
  });
  return result;
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
  try { speechSynthesis.cancel(); } catch (e) { }

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
function syncThemeUI() {
  const isLight = document.documentElement.classList.contains('light-theme');
  if (typeof window.updateThemeFavicon === 'function') {
    window.updateThemeFavicon(isLight);
  }
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.setAttribute('aria-checked', isLight ? 'true' : 'false');
    themeBtn.classList.toggle('is-light', isLight);
    themeBtn.classList.toggle('is-dark', !isLight);
  }
  const settingsThemeBtn = document.getElementById('settingsThemeBtn');
  if (settingsThemeBtn) {
    settingsThemeBtn.setAttribute('aria-checked', isLight ? 'true' : 'false');
    settingsThemeBtn.classList.toggle('is-light', isLight);
    settingsThemeBtn.classList.toggle('is-dark', !isLight);
    const lbl = settingsThemeBtn.querySelector('.theme-switch-label');
    if (lbl) {
      lbl.textContent = isLight ? 'Tone Sáng (Trắng)' : 'Tone Tối (Dark)';
    } else if (!settingsThemeBtn.querySelector('.theme-switch-track')) {
      settingsThemeBtn.textContent = isLight ? '☀️ Chế độ sáng' : '🌙 Chế độ tối';
    }
  }
}
window.syncThemeUI = syncThemeUI;

function toggleAppTheme() {
  const nowLight = document.documentElement.classList.toggle('light-theme');
  localStorage.setItem('wq_theme_mode', nowLight ? 'light' : 'dark');
  localStorage.setItem('wq_theme', nowLight ? 'light' : 'dark');
  syncThemeUI();
  if (typeof renderWriter === 'function') {
    renderWriter();
  }
  if (typeof showToast === 'function') {
    showToast(nowLight ? '☀️ Đã chuyển sang giao diện Sáng' : '🌙 Đã chuyển sang giao diện Tối', 'info');
  }
  return nowLight;
}
window.toggleAppTheme = toggleAppTheme;

(function initTheme() {
  const savedTheme = localStorage.getItem('wq_theme_mode');
  if (!savedTheme || savedTheme === 'light') {
    document.documentElement.classList.add('light-theme');
    localStorage.setItem('wq_theme_mode', 'light');
    localStorage.setItem('wq_theme', 'light');
  } else {
    document.documentElement.classList.remove('light-theme');
  }
  syncThemeUI();
})();

// ==================== API INTEGRATION ====================
async function loadDataFromAPI() {
  try {
    console.log('📡 Loading all HSK data from API...');
    const res = await fetch('https://apihanyu.phuonganhkhanh683.workers.dev/api/vocabulary/all');
    const json = await res.json();
    if (!json.success) throw new Error('API returned error');

    // Merge into DATA, keeping any existing local levels
    Object.keys(json.data).forEach(lvl => {
      DATA[lvl] = json.data[lvl];
    });

    console.log('✅ Loaded from API:', Object.keys(DATA).map(k => k + ':' + DATA[k].length).join(', '));
    API_ENABLED = true;
    initUIWithData();
  } catch (error) {
    console.warn('⚠️ API not available, falling back to embedded data:', error);
    initUIWithData();
  }
}

// ==================== SELECTORS & DECK MANAGEMENT ====================
let lvlSel = null;

function initUIWithData() {
  lvlSel = lvlSel || document.getElementById('levelSel');
  if (!lvlSel) return;
  if (!DATA || Object.keys(DATA).length === 0) return;

  // 1. Kiểm tra xem có pending custom deck đang chờ học không
  let pendingDeck = null;
  try {
    const pStr = localStorage.getItem('wq_pending_deck');
    if (pStr) {
      pendingDeck = JSON.parse(pStr);
    }
  } catch (e) {
    console.warn('wq_pending_deck parse error:', e);
  }

  lvlSel.innerHTML = '';

  // Nếu có custom deck hợp lệ, đưa lên đầu danh sách bộ từ
  if (pendingDeck && Array.isArray(pendingDeck.words) && pendingDeck.words.length > 0) {
    DATA['custom'] = pendingDeck.words.map(w => typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(w) : w);
    const oCustom = document.createElement('option');
    oCustom.value = 'custom';
    oCustom.textContent = '📦 ' + (pendingDeck.name || 'Bộ từ tự tạo') + ' (' + pendingDeck.words.length + ' từ)';
    lvlSel.appendChild(oCustom);
  }

  Object.keys(DATA).forEach(k => {
    if (k !== 'custom' && DATA[k] && DATA[k].length > 0) {
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

  if (pendingDeck && DATA['custom']) {
    level = 'custom';
    lvlSel.value = 'custom';
    window.AppState.level = pendingDeck.name || 'Bộ từ tự tạo';
    deck = DATA['custom'].slice();
    window.AppState.deck = deck;
  } else {
    // Restore saved level
    const saved = (window.WQStorage && WQStorage.getProgress()) || JSON.parse(localStorage.getItem('wq_progress'));
    if (saved && saved.level && (DATA[saved.level] || saved.level === 'favorites')) {
      level = saved.level;
    }
    lvlSel.value = level;
    window.AppState.level = level;
  }

  lvlSel.onchange = () => {
    level = lvlSel.value;
    if (level !== 'custom') {
      localStorage.removeItem('wq_pending_deck');
      localStorage.removeItem('wq_pending_mode');
    }
    buildRanges(level);
    applyRange();
    saveProgress();
  };

  buildRanges(level);
  if (level !== 'custom') {
    loadProgress();
  }
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
    all.textContent = 'Tất cả (' + favorites.length + ' từ)';
    sel.appendChild(all);
    sel.onchange = () => { applyRange(); saveProgress(); };
    return;
  }
  if (!DATA[currentLevel]) return;
  const n = DATA[currentLevel].length, size = 50;
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'Tất cả (' + n + ' từ)';
  sel.appendChild(all);
  if (n > size) {
    for (let i = 0; i < n; i += size) {
      const o = document.createElement('option');
      o.value = i + '-' + Math.min(i + size, n);
      o.textContent = 'Từ ' + (i + 1) + '–' + Math.min(i + size, n);
      sel.appendChild(o);
    }
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
  } else if (level === 'custom') {
    src = DATA['custom'] || [];
  } else {
    if (!DATA[level]) return;
    src = DATA[level];
  }
  if (v === 'all' || level === 'favorites' || level === 'custom') {
    deck = src.slice();
  } else {
    const [a, b] = v.split('-').map(Number);
    deck = src.slice(a, b);
  }
  // BUG FIX: deduplicate then shuffle on every deck load
  deck = deduplicateWords(deck).map(enrichWordWithSentence);
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

  if (level === 'custom') {
    let customName = 'Bộ từ tự tạo';
    try {
      const p = JSON.parse(localStorage.getItem('wq_pending_deck') || '{}');
      if (p.name) customName = p.name;
    } catch (e) {}
    window.AppState.level = customName;
  } else {
    window.AppState.level = level;
  }

  // Multi-page: trigger active page renderers
  if (typeof renderFlash === 'function') renderFlash();
  if (typeof renderWriterList === 'function') renderWriterList();
  if (typeof renderWriter === 'function') renderWriter();
  if (typeof newQuiz === 'function') newQuiz();
  if (typeof newSentenceQuestion === 'function') {
    sPool = [];
    sAsked = [];
    newSentenceQuestion();
  }
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
  if (level === 'custom') return;
  // Nếu có pending deck từ cross-page nav, không overwrite deck
  var hasPending = localStorage.getItem('wq_pending_deck') &&
    (localStorage.getItem('wq_pending_mode') === 'quiz' ||
      localStorage.getItem('wq_pending_mode') === 'sentence' ||
      localStorage.getItem('wq_pending_mode') === 'write' ||
      localStorage.getItem('wq_pending_mode') === 'both' ||
      localStorage.getItem('wq_pending_mode') === 'flashcard');

  if (hasPending) return;

  const saved = (window.WQStorage && WQStorage.getProgress()) || JSON.parse(localStorage.getItem('wq_progress'));
  if (saved) {
    if (saved.level && (DATA[saved.level] || saved.level === 'favorites')) {
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
    applyRange();
    if (saved.fcIdx !== undefined && saved.fcIdx < deck.length) {
      fcIdx = saved.fcIdx;
      window.AppState.fcIdx = fcIdx;
      if (typeof renderFlash === 'function') renderFlash();
    }
    if (saved.wIdx !== undefined && saved.wIdx < deck.length) {
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
window.WQSyncData = function () {
  favorites = (window.WQStorage && WQStorage.getFavorites()) || JSON.parse(localStorage.getItem('wq_favorites')) || [];
  window.AppState.favorites = favorites;
  updateFavOptionText();
};

// ==================== SEARCH FUNCTIONALITY ====================
function removePinyinTones(str) {
  if (!str) return '';
  const toneMap = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ü': 'u', 'ǘ': 'u', 'ǚ': 'u', 'ǜ': 'u'
  };
  return str.toLowerCase().split('').map(char => toneMap[char] || char).join('')
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getPageHref(pageFile) {
  const isInPages = location.pathname.indexOf('/pages/') !== -1;
  return isInPages ? pageFile : ('pages/' + pageFile);
}

// Multi-page: save word to localStorage then navigate to flash.html
function navigateToWord(word) {
  localStorage.setItem('wq_navigate_word', JSON.stringify(word));
  window.location.href = getPageHref('flash.html');
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
      window.location.href = getPageHref('flash.html');
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
    'sentence.html': 'Ghép câu',
    'write.html': 'Nét chữ',
    'arena.html': 'Đấu trường',
    'stats.html': 'Thống kê',
    'favorites.html': 'Yêu thích',
    'custom.html': 'Tự tạo',
    'settings.html': 'Cài đặt'
  };
  titleEl.textContent = titles[page] || 'WenQing';
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener('DOMContentLoaded', () => {
  // Ensure theme UI & header toggle button are bound after layout.js inject()
  syncThemeUI();
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.onclick = () => toggleAppTheme();
  }

  // Load voices for TTS
  loadVoices();

  // Sidebar navigation + hamburger toggle
  initSidebarNavigation();

  // Update header title based on current page
  updateHeaderTitle();

  // learnSelectorsWrapper: show only on flash.html, quiz.html, write.html, sentence.html
  const learnSelectorsWrapper = document.getElementById('learnSelectorsWrapper');
  if (learnSelectorsWrapper) {
    const currentPage = location.pathname.split('/').pop() || 'index.html';
    const learningPages = ['flash.html', 'quiz.html', 'write.html', 'sentence.html'];
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
      if (typeof newSentenceQuestion === 'function') {
        sPool = [];
        sAsked = [];
        newSentenceQuestion();
      }
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
