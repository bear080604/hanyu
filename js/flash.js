// ==================== FLASH.JS — Flashcard page logic ====================
// Runs on flash.html only. Requires js/shared.js to be loaded first.
// All globals (deck, fcIdx, level, favorites, shuffle, speak, showToast, etc.)
// come from shared.js via window.AppState or direct var access.

// ---------- recordLearnedWord ----------
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

var _fcLastSentenceByWord = {};

// ---------- Study review state (Chưa thuộc / Đã thuộc) & Pinyin visibility ----------
var FC_UNKNOWN_STORAGE_KEY = 'wq_fc_unknown_map';
var FC_HIDE_PINYIN_KEY = 'wq_fc_hide_pinyin';
var _fcFullDeck = [];
var _fcActiveDeckRef = null;
var _fcInternalDeckUpdate = false;
var _fcReviewingUnknownOnly = false;
var _fcCurrentDeckKey = '';
var _fcUnknownSet = new Set();
var _fcKnownSet = new Set();
var _fcHidePinyin = localStorage.getItem(FC_HIDE_PINYIN_KEY) === '1';

function getFlashDeckKey() {
  var lvl = (window.AppState && window.AppState.level) || (typeof level !== 'undefined' ? level : 'default');
  var rangeSel = document.getElementById('rangeSel');
  var rangeVal = rangeSel ? rangeSel.value : 'all';
  return String(lvl) + '::' + String(rangeVal);
}

function readUnknownMap() {
  try {
    return JSON.parse(localStorage.getItem(FC_UNKNOWN_STORAGE_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

function saveUnknownSet(deckKey, set) {
  if (!deckKey) return;
  try {
    var map = readUnknownMap();
    var arr = Array.from(set);
    if (arr.length > 0) {
      map[deckKey] = arr;
    } else {
      delete map[deckKey];
    }
    localStorage.setItem(FC_UNKNOWN_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Could not save unknown flashcards:', e);
  }
}

function loadUnknownSet(deckKey, fullDeck) {
  var map = readUnknownMap();
  var saved = Array.isArray(map[deckKey]) ? map[deckKey] : [];
  if (!saved.length || !Array.isArray(fullDeck) || !fullDeck.length) return new Set();
  var validWords = new Set(fullDeck.map(function (w) { return w && w.h; }));
  return new Set(saved.filter(function (h) { return validWords.has(h); }));
}

function syncFlashSessionDeck() {
  var curDeck = window.AppState && window.AppState.deck;
  if (!Array.isArray(curDeck)) return;

  if (_fcInternalDeckUpdate) {
    _fcActiveDeckRef = curDeck;
    _fcInternalDeckUpdate = false;
    return;
  }

  var deckKey = getFlashDeckKey();
  if (curDeck !== _fcActiveDeckRef || deckKey !== _fcCurrentDeckKey) {
    _fcActiveDeckRef = curDeck;
    _fcCurrentDeckKey = deckKey;
    _fcFullDeck = curDeck.slice();
    _fcReviewingUnknownOnly = false;
    _fcUnknownSet = loadUnknownSet(deckKey, _fcFullDeck);
    _fcKnownSet = new Set();
  }
}

function applyPinyinVisibilityUI() {
  var flashSection = document.getElementById('flash');
  var toggleBtn = document.getElementById('fcTogglePinyinBtn');
  var toggleText = document.getElementById('fcTogglePinyinText');
  var eyeIcon = document.getElementById('fcPinyinEyeIcon');

  if (flashSection) {
    flashSection.classList.toggle('fc-hide-pinyin', _fcHidePinyin);
  }
  if (toggleBtn) {
    toggleBtn.classList.toggle('is-hidden-pinyin', _fcHidePinyin);
    toggleBtn.setAttribute('aria-pressed', _fcHidePinyin ? 'true' : 'false');
  }
  if (toggleText) {
    toggleText.textContent = _fcHidePinyin ? 'Hiện Pinyin' : 'Ẩn Pinyin';
  }
  if (eyeIcon) {
    eyeIcon.innerHTML = _fcHidePinyin
      ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
  }
}

function toggleFlashPinyin() {
  _fcHidePinyin = !_fcHidePinyin;
  try {
    localStorage.setItem(FC_HIDE_PINYIN_KEY, _fcHidePinyin ? '1' : '0');
  } catch (e) { }
  applyPinyinVisibilityUI();
}

function renderReviewStatus() {
  var knownBadge = document.getElementById('fcKnownBadge');
  var unknownBadge = document.getElementById('fcUnknownBadge');
  var modeBadge = document.getElementById('fcReviewModeBadge');
  var unknownBtn = document.getElementById('fcMarkUnknownBtn');
  var knownBtn = document.getElementById('fcMarkKnownBtn');
  var cardStatusTag = document.getElementById('fcCardStatusTag');

  if (knownBadge) knownBadge.textContent = '✓ Đã thuộc: ' + _fcKnownSet.size;
  if (unknownBadge) {
    unknownBadge.textContent = '✗ Chưa thuộc: ' + _fcUnknownSet.size;
    unknownBadge.classList.toggle('has-items', _fcUnknownSet.size > 0);
  }
  if (modeBadge) {
    modeBadge.style.display = _fcReviewingUnknownOnly ? 'inline-flex' : 'none';
  }

  var curDeck = window.AppState && window.AppState.deck;
  var curIdx = window.AppState ? window.AppState.fcIdx : 0;
  var curWord = (curDeck && curDeck.length && curDeck[curIdx]) ? curDeck[curIdx] : null;
  var isUnknown = Boolean(curWord && _fcUnknownSet.has(curWord.h));
  var isKnown = Boolean(curWord && _fcKnownSet.has(curWord.h));

  if (unknownBtn) {
    unknownBtn.classList.toggle('is-active', isUnknown);
    unknownBtn.disabled = !curWord;
  }
  if (knownBtn) {
    knownBtn.classList.toggle('is-active', isKnown);
    knownBtn.disabled = !curWord;
  }
  if (cardStatusTag) {
    if (isUnknown) {
      cardStatusTag.textContent = '✗ Chưa thuộc';
      cardStatusTag.className = 'fc-status-tag is-unknown';
      cardStatusTag.style.display = 'inline-flex';
    } else if (isKnown) {
      cardStatusTag.textContent = '✓ Đã thuộc';
      cardStatusTag.className = 'fc-status-tag is-known';
      cardStatusTag.style.display = 'inline-flex';
    } else {
      cardStatusTag.style.display = 'none';
    }
  }
}

function startUnknownOnlyReview() {
  var unknownWords = _fcFullDeck.filter(function (w) {
    return w && _fcUnknownSet.has(w.h);
  });
  if (!unknownWords.length) {
    if (typeof showToast === 'function') showToast('Không có từ nào trong danh sách chưa thuộc!', 'info');
    return;
  }
  stopAutoplay();
  closeFlashCompleteModal();
  _fcReviewingUnknownOnly = true;
  _fcInternalDeckUpdate = true;
  window.AppState.deck = unknownWords.slice();
  if (typeof deck !== 'undefined') deck = window.AppState.deck;
  window.AppState.fcIdx = 0;
  if (typeof fcIdx !== 'undefined') fcIdx = 0;
  renderFlash();
  if (typeof showToast === 'function') {
    showToast('🔁 Đang ôn lại ' + unknownWords.length + ' từ chưa thuộc', 'info');
  }
}

function restartFullFlashDeck(clearUnknown) {
  var sourceDeck = (_fcFullDeck && _fcFullDeck.length)
    ? _fcFullDeck.slice()
    : ((window.AppState && window.AppState.deck) ? window.AppState.deck.slice() : []);
  if (!sourceDeck.length) return;
  stopAutoplay();
  closeFlashCompleteModal();
  _fcReviewingUnknownOnly = false;
  if (clearUnknown) {
    _fcUnknownSet.clear();
    _fcKnownSet.clear();
    saveUnknownSet(_fcCurrentDeckKey, _fcUnknownSet);
  }
  _fcInternalDeckUpdate = true;
  window.AppState.deck = sourceDeck;
  if (typeof deck !== 'undefined') deck = window.AppState.deck;
  window.AppState.fcIdx = 0;
  if (typeof fcIdx !== 'undefined') fcIdx = 0;
  renderFlash();
  if (typeof saveProgress === 'function') saveProgress();
  if (typeof showToast === 'function') {
    showToast('📚 Học lại toàn bộ ' + sourceDeck.length + ' từ!', 'info');
  }
}

function closeFlashCompleteModal() {
  var modal = document.getElementById('fcCompleteModal');
  if (modal) modal.style.display = 'none';
}

function openFlashCompleteModal() {
  stopAutoplay();
  var modal = document.getElementById('fcCompleteModal');
  if (!modal) {
    promptFlashcardComplete();
    return;
  }

  var fullCount = (_fcFullDeck && _fcFullDeck.length) ? _fcFullDeck.length : ((window.AppState.deck && window.AppState.deck.length) || 0);
  var unknownCount = _fcUnknownSet.size;
  var knownCount = _fcKnownSet.size;
  var pendingMode = localStorage.getItem('wq_pending_mode');

  var iconEl = document.getElementById('fcCompleteIcon');
  var titleEl = document.getElementById('fcCompleteTitle');
  var summaryEl = document.getElementById('fcCompleteSummary');
  var msgEl = document.getElementById('fcCompleteMessage');
  var unknownBtn = document.getElementById('fcStudyUnknownBtn');
  var fullBtn = document.getElementById('fcStudyFullBtn');
  var quizBtn = document.getElementById('fcGoQuizBtn');

  if (iconEl) iconEl.textContent = unknownCount === 0 ? '🏆' : '🎉';
  if (titleEl) {
    titleEl.textContent = unknownCount === 0
      ? 'Tuyệt vời! Đã hoàn thành bộ thẻ!'
      : 'Hoàn thành vòng Flashcard!';
  }
  if (summaryEl) {
    summaryEl.innerHTML =
      '<div class="fc-sum-item fc-sum-known"><strong>' + knownCount + '</strong><span>Đã thuộc</span></div>' +
      '<div class="fc-sum-item fc-sum-unknown"><strong>' + unknownCount + '</strong><span>Chưa thuộc</span></div>' +
      '<div class="fc-sum-item fc-sum-total"><strong>' + fullCount + '</strong><span>Tổng bộ từ</span></div>';
  }
  if (msgEl) {
    msgEl.textContent = unknownCount > 0
      ? 'Bạn còn ' + unknownCount + ' từ chưa thuộc. Bạn muốn ôn tập trung những từ chưa thuộc hay học lại toàn bộ?'
      : 'Bạn không còn từ nào bị đánh dấu chưa thuộc. Chọn bước tiếp theo bên dưới nhé!';
  }
  if (unknownBtn) {
    if (unknownCount > 0) {
      unknownBtn.style.display = 'inline-flex';
      unknownBtn.textContent = '🔁 Học lại từ chưa thuộc (' + unknownCount + ' từ)';
    } else {
      unknownBtn.style.display = 'none';
    }
  }
  if (fullBtn) {
    fullBtn.textContent = '📚 Học lại toàn bộ (Full ' + fullCount + ' từ)';
    fullBtn.className = unknownCount > 0
      ? 'wq-popup-btn wq-popup-btn-secondary'
      : 'wq-popup-btn wq-popup-btn-primary';
  }
  if (quizBtn) {
    quizBtn.style.display = pendingMode === 'both' ? 'inline-flex' : 'none';
  }

  modal.style.display = 'flex';
}

function markCurrentFlashcard(isKnown) {
  stopAutoplay();
  var curDeck = window.AppState && window.AppState.deck;
  if (!curDeck || !curDeck.length) return;
  var curIdx = window.AppState.fcIdx;
  var w = curDeck[curIdx];
  if (!w || !w.h) return;

  if (isKnown) {
    _fcKnownSet.add(w.h);
    _fcUnknownSet.delete(w.h);
    recordLearnedWord(w.h);
  } else {
    _fcUnknownSet.add(w.h);
    _fcKnownSet.delete(w.h);
  }
  saveUnknownSet(_fcCurrentDeckKey, _fcUnknownSet);
  renderReviewStatus();

  var isAtLastCard = curIdx >= curDeck.length - 1;
  if (isAtLastCard) {
    openFlashCompleteModal();
    return;
  }

  window.AppState.fcIdx = curIdx + 1;
  if (typeof fcIdx !== 'undefined') fcIdx = window.AppState.fcIdx;
  renderFlash();
  if (typeof saveProgress === 'function') saveProgress();
}

// ---------- renderFlash ----------
function renderFlash() {
  syncFlashSessionDeck();
  applyPinyinVisibilityUI();

  const fcCard = document.getElementById('fcCard');
  const fcHanzi = document.getElementById('fcHanzi');
  const fcPinyin = document.getElementById('fcPinyin');
  const fcBackPinyin = document.getElementById('fcBackPinyin');
  const fcMean = document.getElementById('fcMean');
  const fcEx = document.getElementById('fcEx');
  const fcCount = document.getElementById('fcCount');
  const fcLevel = document.getElementById('fcLevel');
  if (!fcHanzi) return;

  const deck = window.AppState.deck;
  const fcIdx = window.AppState.fcIdx;
  const level = window.AppState.level;

  if (!deck || !deck.length) {
    fcHanzi.textContent = 'Trống';
    fcPinyin.textContent = '';
    if (fcBackPinyin) fcBackPinyin.textContent = '';
    fcMean.textContent = 'Chưa có từ nào trong danh sách';
    fcEx.textContent = '';
    if (fcCount) fcCount.textContent = '0 / 0';
    if (fcLevel) fcLevel.textContent = level === 'favorites' ? 'Yêu thích' : '';
    renderFavIcon();
    renderReviewStatus();
    return;
  }

  const baseW = typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(deck[fcIdx]) : deck[fcIdx];
  const w = typeof window.pickRandomSentenceVariant === 'function'
    ? window.pickRandomSentenceVariant(baseW, _fcLastSentenceByWord[baseW.h])
    : baseW;
  _fcLastSentenceByWord[baseW.h] = w.ex;
  recordLearnedWord(w.h);

  if (fcCard) {
    fcCard.classList.remove('flip');
    fcCard.style.transform = 'rotateY(0deg)';
  }

  fcHanzi.textContent = w.h;
  fcPinyin.textContent = w.p || '';
  if (fcBackPinyin) fcBackPinyin.textContent = w.p || '';
  fcMean.textContent = w.m;
  const exStr = w.ex || w.e || '';
  const multiBadge = (Array.isArray(w.examples) && w.examples.length > 1)
    ? ' (🎲 ' + ((w._variantIndex || 0) + 1) + '/' + w.examples.length + ')'
    : '';
  fcEx.textContent = exStr ? ((w.exm ? exStr + ' — ' + w.exm : exStr) + multiBadge) : '';
  if (fcCount) fcCount.textContent = (fcIdx + 1) + ' / ' + deck.length;
  if (fcLevel) fcLevel.textContent = level === 'favorites' ? 'Yêu thích' : level;
  renderFavIcon();
  renderReviewStatus();
}

// ---------- renderFavIcon ----------
function renderFavIcon() {
  const favBtn = document.getElementById('fcFav');
  if (!favBtn) return;
  const deck = window.AppState.deck;
  const fcIdx = window.AppState.fcIdx;
  const favorites = window.AppState.favorites;
  if (!deck || !deck.length) {
    favBtn.classList.remove('active-fav');
    return;
  }
  const w = deck[fcIdx];
  const isFav = favorites && favorites.some(f => f.h === w.h);
  favBtn.classList.toggle('active-fav', isFav);
}

// ---------- toggleFavorite ----------
function toggleFavorite(w) {
  const favorites = window.AppState.favorites;
  const deck = window.AppState.deck;
  const level = window.AppState.level;

  const idx = favorites.findIndex(f => f.h === w.h);
  if (idx === -1) {
    // BUG FIX: fallback level must be 'HSK 1' not 'HSK1'
    const levelGoc = (typeof DATA !== 'undefined' && Object.keys(DATA).find(
      lvl => DATA[lvl] && DATA[lvl].some(item => item.h === w.h)
    )) || (window.AppState.level || 'HSK 1');
    favorites.push({ ...w, levelGoc });
    showToast('\u0110\u00e3 th\u00eam "' + w.h + '" v\u00e0o y\u00eau th\u00edch \u2b50', 'success');
  } else {
    favorites.splice(idx, 1);
    showToast('\u0110\u00e3 b\u1ecf y\u00eau th\u00edch "' + w.h + '"', 'info');
  }

  if (window.WQStorage) {
    WQStorage.saveFavorites(favorites);
  } else {
    localStorage.setItem('wq_favorites', JSON.stringify(favorites));
  }
  window.AppState.favorites = favorites;

  if (typeof updateFavOptionText === 'function') updateFavOptionText();
  renderFavIcon();

  // If currently browsing favorites, refresh the deck
  if (level === 'favorites') {
    const oldWord = deck[window.AppState.fcIdx];
    window.AppState.deck = favorites.slice();
    const newDeck = window.AppState.deck;
    if (newDeck.length === 0) {
      window.AppState.fcIdx = 0;
    } else {
      const newIdx = newDeck.findIndex(item => item.h === (oldWord && oldWord.h));
      window.AppState.fcIdx = newIdx !== -1 ? newIdx : Math.min(window.AppState.fcIdx, newDeck.length - 1);
    }
    renderFlash();
  }
}

// ---------- Autoplay state ----------
var _apRunning = false;
var _apInterval = null;
var _apTimer = null;

// ---------- startAutoplay ----------
function startAutoplay() {
  const deck = window.AppState.deck;
  if (!deck || !deck.length) return;
  _apRunning = true;
  const btnText = document.getElementById('autoplayBtnText');
  const autoplayBtn = document.getElementById('autoplayBtn');
  if (btnText) btnText.textContent = 'Tạm dừng';
  if (autoplayBtn) autoplayBtn.classList.add('active-fav');
  runAutoplayCycle();
}

// ---------- stopAutoplay ----------
function stopAutoplay() {
  if (!_apRunning) return;
  _apRunning = false;
  const btnText = document.getElementById('autoplayBtnText');
  const autoplayBtn = document.getElementById('autoplayBtn');
  if (btnText) btnText.textContent = 'Tự động phát';
  if (autoplayBtn) autoplayBtn.classList.remove('active-fav');
  clearTimeout(_apTimer);
  clearInterval(_apInterval);
  const autoplayProgress = document.getElementById('autoplayProgress');
  if (autoplayProgress) autoplayProgress.style.width = '0%';
}

// ---------- runAutoplayCycle ----------
function runAutoplayCycle() {
  if (!_apRunning) return;
  const deck = window.AppState.deck;
  if (!deck || !deck.length) return;

  const fcCard = document.getElementById('fcCard');
  if (fcCard) {
    fcCard.classList.remove('flip');
    fcCard.style.transform = 'rotateY(0deg)';
  }

  speak(deck[window.AppState.fcIdx].h);

  const autoplaySpeedEl = document.getElementById('autoplaySpeed');
  const speed = parseInt((autoplaySpeedEl && autoplaySpeedEl.value) || '5000') || 5000;
  const halfSpeed = Math.floor(speed / 2);
  let timeSpent = 0;
  const updateInterval = 100;
  clearInterval(_apInterval);
  const autoplayProgress = document.getElementById('autoplayProgress');
  if (autoplayProgress) autoplayProgress.style.width = '0%';
  let cardFlipped = false;

  _apInterval = setInterval(function () {
    timeSpent += updateInterval;
    var pct = (timeSpent / speed) * 100;
    if (autoplayProgress) autoplayProgress.style.width = pct + '%';
    if (timeSpent >= halfSpeed && !cardFlipped) {
      cardFlipped = true;
      if (fcCard) {
        fcCard.classList.add('flip');
        fcCard.style.transform = 'rotateY(180deg)';
      }
    }
    if (timeSpent >= speed) {
      clearInterval(_apInterval);
      var deck = window.AppState.deck;
      var isAtLastCard = deck && window.AppState.fcIdx === deck.length - 1;
      var pendingMode = localStorage.getItem('wq_pending_mode');

        // Nếu đang phát tự động đến từ cuối cùng:
        // Mở modal tổng kết nếu đang ở chế độ 'both', đang ôn chưa thuộc, hoặc có từ chưa thuộc
        if (isAtLastCard && (pendingMode === 'both' || _fcReviewingUnknownOnly || _fcUnknownSet.size > 0)) {
          stopAutoplay();
          openFlashCompleteModal();
          return;
        }

        window.AppState.fcIdx = (window.AppState.fcIdx + 1) % deck.length;
        if (typeof fcIdx !== 'undefined') fcIdx = window.AppState.fcIdx;
        renderFlash();
        if (typeof saveProgress === 'function') saveProgress();
        _apTimer = setTimeout(runAutoplayCycle, 300);
      }
    }, updateInterval);
}

// ---------- promptFlashcardComplete ----------
// CHỈ kích hoạt khi người dùng ĐÃ Ở TỪ CUỐI CÙNG và BẤM TIẾP TỤC (fcNext)
// Tránh việc vừa chuyển sang từ cuối chưa kịp đọc, chưa kịp lật đã bị popup chặn họng!
async function promptFlashcardComplete() {
  var deck = window.AppState.deck;
  var pendingMode = localStorage.getItem('wq_pending_mode');
  if (!deck || !deck.length) return;

  var confirmed = window.wqPopup
    ? await window.wqPopup.confirm({
      icon: '🎉',
      title: 'Đã xem hết Flashcard!',
      message: 'Bạn đã xem xong toàn bộ các từ vựng trong bộ này.\nBạn có muốn chuyển sang phần ✏️ Trắc nghiệm để kiểm tra phản xạ không?',
      confirmText: '✏️ Làm Trắc nghiệm',
      cancelText: 'Ôn lại từ đầu'
    })
    : confirm('🎉 Bạn đã xem xong toàn bộ Flashcard!\nBạn có muốn chuyển sang phần Trắc nghiệm không?');

  if (confirmed) {
    var deckName = window.AppState.level || 'Custom';
    localStorage.setItem('wq_pending_deck', JSON.stringify({ name: deckName, words: deck }));
    localStorage.setItem('wq_pending_mode', 'both');
    if (typeof showToast === 'function') showToast('✏️ Chuyển sang Trắc nghiệm!', 'info');
    window.location.href = '../pages/quiz.html';
  } else {
    // Người dùng chọn ôn lại: đưa về từ đầu tiên, KHÔNG xóa wq_pending_mode để học xong vẫn chuyển tiếp được!
    window.AppState.fcIdx = 0;
    if (typeof fcIdx !== 'undefined') fcIdx = 0;
    renderFlash();
    if (typeof saveProgress === 'function') saveProgress();
  }
}
window.promptFlashcardComplete = promptFlashcardComplete;
window.checkFlashcardComplete = promptFlashcardComplete;

// ---------- DOMContentLoaded ----------
document.addEventListener('DOMContentLoaded', function () {
  // 1. Read wq_pending_deck — load custom deck into AppState
  var pendingDeckStr = localStorage.getItem('wq_pending_deck');
  if (pendingDeckStr) {
    try {
      var pendingDeck = JSON.parse(pendingDeckStr);
      var deckName = pendingDeck.name || 'Bộ từ tự tạo';
      window.AppState.level = deckName;
      var newDeck = pendingDeck.words ? pendingDeck.words.slice() : [];
      if (typeof window.enrichWordWithSentence === 'function') {
        newDeck = newDeck.map(function (w) { return window.enrichWordWithSentence(w); });
      }
      if (typeof deduplicateWords === 'function') newDeck = deduplicateWords(newDeck);
      if (typeof shuffle === 'function') shuffle(newDeck);
      window.AppState.deck = newDeck;
      window.AppState.fcIdx = 0;
      if (typeof DATA !== 'undefined') {
        DATA['custom'] = newDeck;
      }
    } catch (e) {
      console.error('wq_pending_deck parse error:', e);
    }
  }

  // 2 & 3. Handle wq_pending_level ("Học ngay" from Home) and wq_navigate_word (Global Search)
  // Must wait until DATA is loaded so items are not consumed before deck exists.
  function applyPendingFlashNavigation() {
    if (typeof DATA === 'undefined' || Object.keys(DATA).length === 0) return false;

    var pendingLevel = localStorage.getItem('wq_pending_level');
    if (pendingLevel && DATA[pendingLevel]) {
      localStorage.removeItem('wq_pending_level');
      localStorage.removeItem('wq_pending_deck');
      localStorage.removeItem('wq_pending_mode');
      if (typeof level !== 'undefined') level = pendingLevel;
      window.AppState.level = pendingLevel;
      var lvlSelEl = document.getElementById('levelSel');
      if (lvlSelEl) lvlSelEl.value = pendingLevel;
      if (typeof buildRanges === 'function') buildRanges(pendingLevel);
      if (typeof applyRange === 'function') applyRange();
      if (typeof saveProgress === 'function') saveProgress();
    }

    var navigateWordStr = localStorage.getItem('wq_navigate_word');
    if (navigateWordStr) {
      localStorage.removeItem('wq_navigate_word');
      try {
        var navWord = JSON.parse(navigateWordStr);
        if (navWord && navWord.level && DATA[navWord.level]) {
          localStorage.removeItem('wq_pending_deck');
          localStorage.removeItem('wq_pending_mode');
          if (typeof level !== 'undefined') level = navWord.level;
          window.AppState.level = navWord.level;
          var lvlSelNav = document.getElementById('levelSel');
          if (lvlSelNav) lvlSelNav.value = navWord.level;
          if (typeof buildRanges === 'function') buildRanges(navWord.level);
          var rangeSelNav = document.getElementById('rangeSel');
          if (rangeSelNav) rangeSelNav.value = 'all';
          if (typeof applyRange === 'function') applyRange();
        }
        var curDeck = window.AppState.deck;
        if (curDeck && curDeck.length && navWord && navWord.h) {
          var navIdx = curDeck.findIndex(function (w) { return w.h === navWord.h; });
          if (navIdx !== -1) {
            window.AppState.fcIdx = navIdx;
            if (typeof fcIdx !== 'undefined') fcIdx = navIdx;
            renderFlash();
            renderFavIcon();
          }
        }
      } catch (e) {
        console.error('wq_navigate_word parse error:', e);
      }
    }
    return true;
  }

  document.addEventListener('wq:data-ready', applyPendingFlashNavigation);
  if (window._wqDataReady) {
    applyPendingFlashNavigation();
  }

  // 4. Read wq_autoplay_speed from localStorage; set #autoplaySpeed select
  var savedSpeed = localStorage.getItem('wq_autoplay_speed');
  if (savedSpeed) {
    var autoplaySpeedEl = document.getElementById('autoplaySpeed');
    if (autoplaySpeedEl) autoplaySpeedEl.value = savedSpeed;
  }

  // 5. Initial render
  renderFlash();
  renderFavIcon();

  // ---------- Card flip on click ----------
  var fcCard = document.getElementById('fcCard');
  if (fcCard) {
    // Parallax mousemove (desktop pointer devices only)
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      fcCard.addEventListener('mousemove', function (e) {
        if (fcCard.classList.contains('flip')) return;
        var rect = fcCard.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var centerX = rect.width / 2;
        var centerY = rect.height / 2;
        var rotY = ((x - centerX) / centerX) * 15;
        var rotX = -((y - centerY) / centerY) * 15;
        fcCard.style.transform = 'rotateX(' + rotX + 'deg) rotateY(' + rotY + 'deg)';
      });
      fcCard.addEventListener('mouseleave', function () {
        if (fcCard.classList.contains('flip')) return;
        fcCard.style.transform = 'rotateY(0deg)';
      });
    }

    // Click to flip
    fcCard.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.icon-btn')) return;
      stopAutoplay();
      fcCard.classList.toggle('flip');
      fcCard.style.transform = fcCard.classList.contains('flip') ? 'rotateY(180deg)' : 'rotateY(0deg)';
    });

    // Swipe gesture
    var touchStartX = 0;
    var touchEndX = 0;

    fcCard.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    fcCard.addEventListener('touchend', function (e) {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });
  }

  function handleSwipe() {
    var swipeThreshold = 50;
    var fcNext = document.getElementById('fcNext');
    var fcPrev = document.getElementById('fcPrev');
    if (touchStartX - touchEndX > swipeThreshold) {
      if (fcNext) fcNext.click();
    } else if (touchEndX - touchStartX > swipeThreshold) {
      if (fcPrev) fcPrev.click();
    }
  }

  // ---------- Navigation buttons ----------
  var fcNext = document.getElementById('fcNext');
  if (fcNext) {
    fcNext.addEventListener('click', function (e) {
      if (e) e.stopPropagation();
      stopAutoplay();
      var deck = window.AppState.deck;
      if (!deck || !deck.length) return;

      var isAtLastCard = window.AppState.fcIdx === deck.length - 1;
      var pendingMode = localStorage.getItem('wq_pending_mode');

      // Nếu đang ở thẻ cuối cùng và bấm Next:
        // Luôn mở hộp thoại tổng kết để chọn Học lại từ chưa thuộc / Học lại toàn bộ (Full) / Trắc nghiệm
        if (isAtLastCard) {
          openFlashCompleteModal();
          return;
        }

        window.AppState.fcIdx = (window.AppState.fcIdx + 1) % deck.length;
        if (typeof fcIdx !== 'undefined') fcIdx = window.AppState.fcIdx;
        renderFlash();
        if (typeof saveProgress === 'function') saveProgress();
      });
  }

  // ---------- Known / Unknown review buttons ----------
  var fcMarkUnknownBtn = document.getElementById('fcMarkUnknownBtn');
  if (fcMarkUnknownBtn) {
    fcMarkUnknownBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      markCurrentFlashcard(false);
    });
  }

  var fcMarkKnownBtn = document.getElementById('fcMarkKnownBtn');
  if (fcMarkKnownBtn) {
    fcMarkKnownBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      markCurrentFlashcard(true);
    });
  }

  // ---------- Quick review unknown badge & back-to-full button ----------
  var fcUnknownBadge = document.getElementById('fcUnknownBadge');
  if (fcUnknownBadge) {
    fcUnknownBadge.addEventListener('click', function (e) {
      e.stopPropagation();
      if (_fcUnknownSet.size > 0) {
        startUnknownOnlyReview();
      } else if (typeof showToast === 'function') {
        showToast('Chưa có từ nào được đánh dấu chưa thuộc', 'info');
      }
    });
  }

  var fcBackToFullBtn = document.getElementById('fcBackToFullBtn');
  if (fcBackToFullBtn) {
    fcBackToFullBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      restartFullFlashDeck(false);
    });
  }

  // ---------- Hide / Show Pinyin toggle ----------
  applyPinyinVisibilityUI();
  var fcTogglePinyinBtn = document.getElementById('fcTogglePinyinBtn');
  if (fcTogglePinyinBtn) {
    fcTogglePinyinBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFlashPinyin();
    });
  }

  // ---------- Complete modal actions ----------
  var fcCompleteModal = document.getElementById('fcCompleteModal');
  if (fcCompleteModal) {
    fcCompleteModal.addEventListener('click', function (e) {
      if (e.target === fcCompleteModal) closeFlashCompleteModal();
    });
  }

  var fcStudyUnknownBtn = document.getElementById('fcStudyUnknownBtn');
  if (fcStudyUnknownBtn) {
    fcStudyUnknownBtn.addEventListener('click', function () {
      startUnknownOnlyReview();
    });
  }

  var fcStudyFullBtn = document.getElementById('fcStudyFullBtn');
  if (fcStudyFullBtn) {
    fcStudyFullBtn.addEventListener('click', function () {
      restartFullFlashDeck(true);
    });
  }

  var fcGoQuizBtn = document.getElementById('fcGoQuizBtn');
  if (fcGoQuizBtn) {
    fcGoQuizBtn.addEventListener('click', function () {
      var fullSource = (_fcFullDeck && _fcFullDeck.length) ? _fcFullDeck : window.AppState.deck;
      var deckName = window.AppState.level || 'Custom';
      localStorage.setItem('wq_pending_deck', JSON.stringify({ name: deckName, words: fullSource }));
      localStorage.setItem('wq_pending_mode', 'both');
      closeFlashCompleteModal();
      if (typeof showToast === 'function') showToast('✏️ Chuyển sang Trắc nghiệm!', 'info');
      window.location.href = '../pages/quiz.html';
    });
  }

  var fcCloseCompleteBtn = document.getElementById('fcCloseCompleteBtn');
  if (fcCloseCompleteBtn) {
    fcCloseCompleteBtn.addEventListener('click', function () {
      closeFlashCompleteModal();
    });
  }

  var fcPrev = document.getElementById('fcPrev');
  if (fcPrev) {
    fcPrev.addEventListener('click', function (e) {
      if (e) e.stopPropagation();
      stopAutoplay();
      var deck = window.AppState.deck;
      if (!deck || !deck.length) return;
      window.AppState.fcIdx = (window.AppState.fcIdx - 1 + deck.length) % deck.length;
      if (typeof fcIdx !== 'undefined') fcIdx = window.AppState.fcIdx;
      renderFlash();
      if (typeof saveProgress === 'function') saveProgress();
    });
  }

  var fcAudio = document.getElementById('fcAudio');
  if (fcAudio) {
    fcAudio.addEventListener('click', function (e) {
      e.stopPropagation();
      var deck = window.AppState.deck;
      if (!deck || !deck.length) return;
      speak(deck[window.AppState.fcIdx].h);
    });
  }

  var fcFav = document.getElementById('fcFav');
  if (fcFav) {
    fcFav.addEventListener('click', function (e) {
      e.stopPropagation();
      var deck = window.AppState.deck;
      if (!deck || !deck.length) return;
      toggleFavorite(deck[window.AppState.fcIdx]);
    });
  }

  // ---------- Autoplay button ----------
  var autoplayBtn = document.getElementById('autoplayBtn');
  if (autoplayBtn) {
    autoplayBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (_apRunning) {
        stopAutoplay();
      } else {
        startAutoplay();
      }
    });
  }

  // Show autoplay speed selector when autoplay is clicked / always visible
  var autoplaySpeedEl = document.getElementById('autoplaySpeed');
  if (autoplaySpeedEl) {
    autoplaySpeedEl.addEventListener('change', function () {
      localStorage.setItem('wq_autoplay_speed', autoplaySpeedEl.value);
    });
    // Restore saved speed on init (second read — covers the case where shared.js ran first)
    var sv = localStorage.getItem('wq_autoplay_speed');
    if (sv) autoplaySpeedEl.value = sv;
  }

  // ---------- Keyboard handler ----------
  document.addEventListener('keydown', function (e) {
    // Ignore shortcuts when typing inside inputs, textareas, selects, or editable fields
    var activeEl = e.target || document.activeElement;
    if (activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.tagName === 'SELECT' ||
      activeEl.isContentEditable
    )) {
      return;
    }
    if (e.key === 'Escape') {
      closeFlashCompleteModal();
      return;
    }
    var completeModalEl = document.getElementById('fcCompleteModal');
    if (completeModalEl && completeModalEl.style.display !== 'none') return;

    if (e.key === 'ArrowRight') {
      var fcNextEl = document.getElementById('fcNext');
      if (fcNextEl) fcNextEl.click();
    } else if (e.key === 'ArrowLeft') {
      var fcPrevEl = document.getElementById('fcPrev');
      if (fcPrevEl) fcPrevEl.click();
    } else if (e.key === ' ') {
      e.preventDefault();
      var card = document.getElementById('fcCard');
      if (card) card.click();
    } else if (e.key === '1') {
      markCurrentFlashcard(false);
    } else if (e.key === '2') {
      markCurrentFlashcard(true);
    } else if (e.key === 'p' || e.key === 'P') {
      toggleFlashPinyin();
    }
  });
});
