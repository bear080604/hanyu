// ==================== WRITE.JS — Writing practice page logic ====================
// Runs on write.html only. Requires js/shared.js to be loaded first.
// Globals (deck, wIdx, level, speak, showToast, shuffle, AppState) come from shared.js.
// HanziWriter is loaded via CDN on write.html.

var _writerInstance = null;

// ==================== RENDER WRITER LIST ====================
// Renders the character pick list (#wPick) for the current deck
function renderWriterList() {
  var pickEl = document.getElementById('wPick');
  var wWordEl = document.getElementById('wWord');
  var wLevelEl = document.getElementById('wLevel');
  if (!pickEl) return;

  var curDeck = window.AppState ? window.AppState.deck : deck;
  var curIdx  = window.AppState ? window.AppState.wIdx  : wIdx;
  var curLevel = window.AppState ? window.AppState.level : level;

  pickEl.innerHTML = '';

  if (!curDeck || !curDeck.length) {
    if (wWordEl) wWordEl.textContent = 'Trống';
    if (wLevelEl) wLevelEl.textContent = '';
    return;
  }

  if (wLevelEl) wLevelEl.textContent = curLevel === 'favorites' ? 'Yêu thích' : curLevel;

  curDeck.forEach(function(w, i) {
    var btn = document.createElement('button');
    btn.className = 'w-char-btn' + (i === curIdx ? ' active' : '');
    btn.textContent = w.h;
    btn.title = w.p + ' — ' + w.m;
    btn.onclick = function() {
      if (window.AppState) window.AppState.wIdx = i;
      else wIdx = i;
      renderWriterList();
      renderWriter();
      if (typeof saveProgress === 'function') saveProgress();
    };
    pickEl.appendChild(btn);
  });
}

// ==================== RENDER WRITER ====================
// Updates the info panel (pinyin, meaning, word counter) and builds the HanziWriter
function renderWriter() {
  var wPinyinEl = document.getElementById('wPinyin');
  var wMeanEl   = document.getElementById('wMean');
  var wWordEl   = document.getElementById('wWord');
  var wLevelEl  = document.getElementById('wLevel');
  if (!wPinyinEl) return;

  var curDeck  = window.AppState ? window.AppState.deck  : deck;
  var curIdx   = window.AppState ? window.AppState.wIdx  : wIdx;
  var curLevel = window.AppState ? window.AppState.level : level;

  if (!curDeck || !curDeck.length) {
    wPinyinEl.textContent = '';
    wMeanEl.textContent   = 'Chưa có từ nào trong danh sách';
    if (wWordEl)  wWordEl.textContent  = '0 / 0';
    if (wLevelEl) wLevelEl.textContent = '';
    // Clear writer canvas
    var targetDiv = document.getElementById('writer-target');
    if (targetDiv) targetDiv.innerHTML = '';
    _writerInstance = null;
    return;
  }

  var w = curDeck[curIdx];
  wPinyinEl.textContent = w.p;
  wMeanEl.textContent   = w.m;
  if (wWordEl)  wWordEl.textContent  = (curIdx + 1) + ' / ' + curDeck.length;
  if (wLevelEl) wLevelEl.textContent = curLevel === 'favorites' ? 'Yêu thích' : curLevel;

  buildWriter(w.h, 'writer-target');
}

// ==================== BUILD WRITER ====================
// Creates (or replaces) a HanziWriter instance inside targetDivId
function buildWriter(char, targetDivId) {
  var targetDiv = document.getElementById(targetDivId);
  if (!targetDiv) return;

  // Destroy previous instance if possible
  if (_writerInstance && typeof _writerInstance.cancelQuiz === 'function') {
    try { _writerInstance.cancelQuiz(); } catch(e) {}
  }
  _writerInstance = null;
  targetDiv.innerHTML = '';

  if (!char) return;

  // HanziWriter is loaded via CDN — check it exists
  if (typeof HanziWriter === 'undefined') {
    targetDiv.innerHTML = '<div style="color: var(--text-muted); padding: 24px; text-align: center;">HanziWriter chưa tải. Vui lòng kiểm tra kết nối.</div>';
    return;
  }

  try {
    _writerInstance = HanziWriter.create(targetDivId, char, {
      width: 250,
      height: 250,
      padding: 5,
      showOutline: true,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 300,
      strokeColor: '#00f2fe',
      outlineColor: 'rgba(255,255,255,0.2)',
      drawingColor: '#00f2fe',
      drawingWidth: 4,
      highlightColor: '#8b5cf6'
    });
  } catch(e) {
    console.error('HanziWriter.create error:', e);
    targetDiv.innerHTML = '<div style="color: var(--text-muted); padding: 24px; text-align: center;">Không thể hiển thị ký tự "' + char + '"</div>';
    _writerInstance = null;
  }
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener('DOMContentLoaded', function() {
  // Initial render — deck is built by shared.js applyRange() / loadProgress()
  renderWriterList();
  renderWriter();

  // ---------- Animate button (xem nét) ----------
  var wAnimateBtn = document.getElementById('wAnimate');
  if (wAnimateBtn) {
    wAnimateBtn.addEventListener('click', function() {
      if (!_writerInstance) return;
      try {
        _writerInstance.animateCharacter();
      } catch(e) {
        console.warn('animateCharacter error:', e);
      }
    });
  }

  // ---------- Quiz button (tập viết) ----------
  var wQuizBtn = document.getElementById('wQuiz');
  if (wQuizBtn) {
    wQuizBtn.addEventListener('click', function() {
      if (!_writerInstance) return;
      var curDeck = window.AppState ? window.AppState.deck : deck;
      var curIdx  = window.AppState ? window.AppState.wIdx  : wIdx;
      if (!curDeck || !curDeck.length) return;
      var char = curDeck[curIdx].h;
      try {
        _writerInstance.quiz({
          onMistake: function(strokeData) {
            if (typeof showToast === 'function') showToast('Sai nét rồi! Thử lại 💪', 'warning');
          },
          onCorrectStroke: function(strokeData) {
            // optional: feedback per correct stroke
          },
          onComplete: function(summaryData) {
            if (typeof showToast === 'function') showToast('🎉 Viết đúng "' + char + '"!', 'success');
          }
        });
      } catch(e) {
        console.warn('quiz error:', e);
      }
    });
  }

  // ---------- Audio button ----------
  var wAudioBtn = document.getElementById('wAudio');
  if (wAudioBtn) {
    wAudioBtn.addEventListener('click', function() {
      var curDeck = window.AppState ? window.AppState.deck : deck;
      var curIdx  = window.AppState ? window.AppState.wIdx  : wIdx;
      if (!curDeck || !curDeck.length) return;
      if (typeof speak === 'function') speak(curDeck[curIdx].h);
    });
  }

  // ---------- Keyboard: left/right arrow to change character ----------
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight') {
      var curDeck = window.AppState ? window.AppState.deck : deck;
      if (!curDeck || !curDeck.length) return;
      var curIdx = window.AppState ? window.AppState.wIdx : wIdx;
      var newIdx = (curIdx + 1) % curDeck.length;
      if (window.AppState) window.AppState.wIdx = newIdx;
      else wIdx = newIdx;
      renderWriterList();
      renderWriter();
      if (typeof saveProgress === 'function') saveProgress();
    } else if (e.key === 'ArrowLeft') {
      var curDeck2 = window.AppState ? window.AppState.deck : deck;
      if (!curDeck2 || !curDeck2.length) return;
      var curIdx2 = window.AppState ? window.AppState.wIdx : wIdx;
      var newIdx2 = (curIdx2 - 1 + curDeck2.length) % curDeck2.length;
      if (window.AppState) window.AppState.wIdx = newIdx2;
      else wIdx = newIdx2;
      renderWriterList();
      renderWriter();
      if (typeof saveProgress === 'function') saveProgress();
    }
  });
});
