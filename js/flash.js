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

// ---------- renderFlash ----------
function renderFlash() {
  const fcCard = document.getElementById('fcCard');
  const fcHanzi = document.getElementById('fcHanzi');
  const fcPinyin = document.getElementById('fcPinyin');
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
    fcMean.textContent = 'Chưa có từ nào trong danh sách';
    fcEx.textContent = '';
    if (fcCount) fcCount.textContent = '0 / 0';
    if (fcLevel) fcLevel.textContent = level === 'favorites' ? 'Yêu thích' : '';
    renderFavIcon();
    return;
  }

  const w = deck[fcIdx];
  recordLearnedWord(w.h);

  if (fcCard) {
    fcCard.classList.remove('flip');
    fcCard.style.transform = 'rotateY(0deg)';
  }

  fcHanzi.textContent = w.h;
  fcPinyin.textContent = w.p;
  fcMean.textContent = w.m;
  fcEx.textContent = w.ex || w.e || '';
  if (fcCount) fcCount.textContent = (fcIdx + 1) + ' / ' + deck.length;
  if (fcLevel) fcLevel.textContent = level === 'favorites' ? 'Yêu thích' : level;
  renderFavIcon();
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
  if (btnText) btnText.textContent = '\u23f8\ufe0f T\u1ea1m d\u1eebng';
  if (autoplayBtn) autoplayBtn.classList.add('active-fav');
  runAutoplayCycle();
}

// ---------- stopAutoplay ----------
function stopAutoplay() {
  if (!_apRunning) return;
  _apRunning = false;
  const btnText = document.getElementById('autoplayBtnText');
  const autoplayBtn = document.getElementById('autoplayBtn');
  if (btnText) btnText.textContent = '\u25b6\ufe0f T\u1ef1 \u0111\u1ed9ng ch\u1ea1y';
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

  _apInterval = setInterval(function() {
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
      window.AppState.fcIdx = (window.AppState.fcIdx + 1) % deck.length;
      renderFlash();
      if (typeof saveProgress === 'function') saveProgress();
      _apTimer = setTimeout(runAutoplayCycle, 300);
    }
  }, updateInterval);
}

// ---------- checkFlashcardComplete ----------
function checkFlashcardComplete() {
  var deck = window.AppState.deck;
  var fcIdx = window.AppState.fcIdx;
  var pendingMode = localStorage.getItem('wq_pending_mode');
  if (!deck || !deck.length) return;

  if (pendingMode === 'both' && fcIdx === deck.length - 1) {
    setTimeout(function() {
      var confirmed = confirm('\uD83C\uDF89 B\u1ea1n \u0111\u00e3 xem h\u1ebft Flashcard!\n\n\u270f\ufe0f B\u1ea1n c\u00f3 mu\u1ed1n ti\u1ebfp t\u1ee5c l\u00e0m Tr\u1eafc nghi\u1ec7m kh\u00f4ng?');
      if (confirmed) {
        var deckName = window.AppState.level || 'Custom';
        localStorage.setItem('wq_pending_deck', JSON.stringify({ name: deckName, words: deck }));
        localStorage.setItem('wq_pending_mode', 'quiz');
        showToast('\u270f\ufe0f Chuy\u1ec3n sang Tr\u1eafc nghi\u1ec7m!', 'info');
        window.location.href = '../pages/quiz.html';
      } else {
        localStorage.removeItem('wq_pending_mode');
      }
    }, 500);
  }
}
window.checkFlashcardComplete = checkFlashcardComplete;

// ---------- DOMContentLoaded ----------
document.addEventListener('DOMContentLoaded', function() {
  // 1. Read wq_pending_deck — load custom deck into AppState
  var pendingDeckStr = localStorage.getItem('wq_pending_deck');
  if (pendingDeckStr) {
    localStorage.removeItem('wq_pending_deck');
    // NOTE: keep wq_pending_mode for checkFlashcardComplete to read later
    try {
      var pendingDeck = JSON.parse(pendingDeckStr);
      window.AppState.level = pendingDeck.name || 'Custom';
      var newDeck = pendingDeck.words ? pendingDeck.words.slice() : [];
      if (typeof deduplicateWords === 'function') newDeck = deduplicateWords(newDeck);
      if (typeof shuffle === 'function') shuffle(newDeck);
      window.AppState.deck = newDeck;
      window.AppState.fcIdx = 0;
    } catch(e) {
      console.error('wq_pending_deck parse error:', e);
    }
  }

  // 2. Read wq_pending_level — navigate here from home "Học ngay"
  var pendingLevel = localStorage.getItem('wq_pending_level');
  if (pendingLevel) {
    localStorage.removeItem('wq_pending_level');
    window.AppState.level = pendingLevel;
    // levelSel may not exist yet or shared.js initUIWithData will set it; sync here too
    var lvlSelEl = document.getElementById('levelSel');
    if (lvlSelEl) lvlSelEl.value = pendingLevel;
  }

  // 3. Read wq_navigate_word — search navigation
  var navigateWordStr = localStorage.getItem('wq_navigate_word');
  if (navigateWordStr) {
    localStorage.removeItem('wq_navigate_word');
    try {
      var navWord = JSON.parse(navigateWordStr);
      // Find the word in current deck and jump to it
      var curDeck = window.AppState.deck;
      if (curDeck && curDeck.length) {
        var navIdx = curDeck.findIndex(function(w) { return w.h === navWord.h; });
        if (navIdx !== -1) {
          window.AppState.fcIdx = navIdx;
        }
      }
    } catch(e) {
      console.error('wq_navigate_word parse error:', e);
    }
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
      fcCard.addEventListener('mousemove', function(e) {
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
      fcCard.addEventListener('mouseleave', function() {
        if (fcCard.classList.contains('flip')) return;
        fcCard.style.transform = 'rotateY(0deg)';
      });
    }

    // Click to flip
    fcCard.addEventListener('click', function(e) {
      if (e.target.closest && e.target.closest('.icon-btn')) return;
      stopAutoplay();
      fcCard.classList.toggle('flip');
      fcCard.style.transform = fcCard.classList.contains('flip') ? 'rotateY(180deg)' : 'rotateY(0deg)';
    });

    // Swipe gesture
    var touchStartX = 0;
    var touchEndX = 0;

    fcCard.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    fcCard.addEventListener('touchend', function(e) {
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
    fcNext.addEventListener('click', function(e) {
      if (e) e.stopPropagation();
      stopAutoplay();
      var deck = window.AppState.deck;
      if (!deck || !deck.length) return;
      window.AppState.fcIdx = (window.AppState.fcIdx + 1) % deck.length;
      renderFlash();
      if (typeof saveProgress === 'function') saveProgress();
      checkFlashcardComplete();
    });
  }

  var fcPrev = document.getElementById('fcPrev');
  if (fcPrev) {
    fcPrev.addEventListener('click', function(e) {
      if (e) e.stopPropagation();
      stopAutoplay();
      var deck = window.AppState.deck;
      if (!deck || !deck.length) return;
      window.AppState.fcIdx = (window.AppState.fcIdx - 1 + deck.length) % deck.length;
      renderFlash();
      if (typeof saveProgress === 'function') saveProgress();
    });
  }

  var fcAudio = document.getElementById('fcAudio');
  if (fcAudio) {
    fcAudio.addEventListener('click', function(e) {
      e.stopPropagation();
      var deck = window.AppState.deck;
      if (!deck || !deck.length) return;
      speak(deck[window.AppState.fcIdx].h);
    });
  }

  var fcFav = document.getElementById('fcFav');
  if (fcFav) {
    fcFav.addEventListener('click', function(e) {
      e.stopPropagation();
      var deck = window.AppState.deck;
      if (!deck || !deck.length) return;
      toggleFavorite(deck[window.AppState.fcIdx]);
    });
  }

  // ---------- Autoplay button ----------
  var autoplayBtn = document.getElementById('autoplayBtn');
  if (autoplayBtn) {
    autoplayBtn.addEventListener('click', function(e) {
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
    autoplaySpeedEl.addEventListener('change', function() {
      localStorage.setItem('wq_autoplay_speed', autoplaySpeedEl.value);
    });
    // Restore saved speed on init (second read — covers the case where shared.js ran first)
    var sv = localStorage.getItem('wq_autoplay_speed');
    if (sv) autoplaySpeedEl.value = sv;
  }

  // ---------- Keyboard handler ----------
  document.addEventListener('keydown', function(e) {
    // On the flash page the whole page is the flashcard — no section guard needed
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
    }
  });
});
