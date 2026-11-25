// ==================== WRITE.JS — Writing practice page logic ====================
// Runs on write.html only. Requires js/shared.js to be loaded first.
// HanziWriter is loaded via CDN on write.html.

var _writerInstance = null;
var _writerAnimTimer = null;
var _selectedCharSubIndex = 0; // Ký tự con đang chọn trong từ ghép (0 = chữ 1, 1 = chữ 2, ...)
var _currentWriterMode = 'outline'; // 'outline' | 'quiz'

// ==================== HANZI CHARACTER EXTRACTION ====================
// HanziWriter CHỈ hỗ trợ 1 ký tự Hán tự đơn lẻ.
// Hàm này tách từ ghép (ví dụ '你好' hoặc '爸爸 | 爸') thành mảng ['你', '好'] để tránh lỗi không hiện chữ.
function extractHanziChars(str) {
  if (!str) return [];
  // Chỉ lấy dạng chính trước dấu '|' (tránh lặp biến thể kiểu '爸爸 | 爸')
  var primary = String(str).split('|')[0].trim();
  var matches = primary.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  if (matches && matches.length > 0) return matches;
  // Fallback: bỏ khoảng trắng và dấu câu
  return primary.replace(/[，。？！、\s\-_.,?!/|]/g, '').split('').filter(Boolean);
}

// ==================== CUSTOM DECK INIT ====================
function checkPendingDeck() {
  var pendingDeckStr = localStorage.getItem('wq_pending_deck');
  if (pendingDeckStr) {
    try {
      var pending = JSON.parse(pendingDeckStr);
      if (pending && Array.isArray(pending.words) && pending.words.length > 0) {
        if (!window.AppState) window.AppState = {};
        window.AppState.deck = pending.words.slice();
        window.AppState.level = pending.name || 'Bộ từ tự tạo';
        window.AppState.wIdx = 0;
        if (typeof DATA !== 'undefined') {
          DATA['custom'] = pending.words.slice();
        }
      }
    } catch (e) {
      console.warn('⚠️ Lỗi đọc pending deck trong write.js:', e);
    }
  }
}

// ==================== RENDER WRITER LIST ====================
// Renders the character pick strip (#wPick) for the current deck
function renderWriterList() {
  var pickEl = document.getElementById('wPick');
  var wWordEl = document.getElementById('wWord');
  var wLevelEl = document.getElementById('wLevel');
  if (!pickEl) return;

  var curDeck = (window.AppState && window.AppState.deck) || (typeof deck !== 'undefined' ? deck : []);
  var curIdx = (window.AppState && typeof window.AppState.wIdx === 'number') ? window.AppState.wIdx : (typeof wIdx !== 'undefined' ? wIdx : 0);
  var curLevel = (window.AppState && window.AppState.level) || (typeof level !== 'undefined' ? level : 'HSK 1');

  pickEl.innerHTML = '';

  if (!curDeck || !curDeck.length) {
    if (wWordEl) wWordEl.textContent = '0 / 0 từ';
    if (wLevelEl) wLevelEl.textContent = 'Trống';
    return;
  }

  if (wLevelEl) wLevelEl.textContent = curLevel === 'favorites' ? 'Yêu thích' : curLevel;
  if (wWordEl) wWordEl.textContent = (curIdx + 1) + ' / ' + curDeck.length + ' từ';

  curDeck.forEach(function (w, i) {
    var btn = document.createElement('button');
    btn.className = 'w-char-btn' + (i === curIdx ? ' active' : '');
    btn.textContent = String(w.h || '').split('|')[0].trim();
    btn.title = (w.p || '') + ' — ' + (w.m || '');
    btn.onclick = function () {
      if (window.AppState) window.AppState.wIdx = i;
      wIdx = i;
      _selectedCharSubIndex = 0;
      renderWriter();
      renderWriterList();
      if (typeof saveProgress === 'function') saveProgress();
      // Scroll active item into view smoothly
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    };
    pickEl.appendChild(btn);
  });
}

// ==================== RENDER WRITER ====================
// Updates the info panel (pinyin, meaning, word counter) and builds the HanziWriter
function renderWriter() {
  var wPinyinEl = document.getElementById('wPinyin');
  var wMeanEl = document.getElementById('wMean');
  var wFullHanziEl = document.getElementById('wFullHanzi');
  var wWordEl = document.getElementById('wWord');
  var wLevelEl = document.getElementById('wLevel');
  if (!wPinyinEl) return;

  var curDeck = (window.AppState && window.AppState.deck) || (typeof deck !== 'undefined' ? deck : []);
  var curIdx = (window.AppState && typeof window.AppState.wIdx === 'number') ? window.AppState.wIdx : (typeof wIdx !== 'undefined' ? wIdx : 0);
  var curLevel = (window.AppState && window.AppState.level) || (typeof level !== 'undefined' ? level : 'HSK 1');

  if (!curDeck || !curDeck.length) {
    if (wFullHanziEl) wFullHanziEl.textContent = '--';
    wPinyinEl.textContent = '--';
    wMeanEl.textContent = 'Chưa có từ nào trong danh sách';
    if (wWordEl) wWordEl.textContent = '0 / 0 từ';
    if (wLevelEl) wLevelEl.textContent = '';
    var targetDiv = document.getElementById('writer-target');
    if (targetDiv) targetDiv.innerHTML = '';
    _writerInstance = null;
    return;
  }

  // Ensure index in bounds
  if (curIdx >= curDeck.length) curIdx = 0;
  if (curIdx < 0) curIdx = curDeck.length - 1;
  if (window.AppState) window.AppState.wIdx = curIdx;
  wIdx = curIdx;

  var w = curDeck[curIdx];
  if (wFullHanziEl) wFullHanziEl.textContent = w.h;
  wPinyinEl.textContent = w.p || '';
  wMeanEl.textContent = w.m || '';
  if (wWordEl) wWordEl.textContent = (curIdx + 1) + ' / ' + curDeck.length + ' từ';
  if (wLevelEl) wLevelEl.textContent = curLevel === 'favorites' ? 'Yêu thích' : curLevel;

  // Render character sub-selector for multi-character words
  renderCharSubSelector(w.h);

  // Render HanziWriter for the selected sub-character
  buildWriterForCurrentSubChar();

  // Render Fav icon state
  renderWriterFavState(w);
}

// ==================== RENDER CHAR SUB SELECTOR ====================
// Hiển thị các tab chữ con nếu từ vựng có nhiều chữ Hán (vd: [你 (1/2)] [好 (2/2)])
function renderCharSubSelector(fullHanzi) {
  var selectorEl = document.getElementById('wCharSelector');
  if (!selectorEl) return;
  selectorEl.innerHTML = '';

  var chars = extractHanziChars(fullHanzi);
  if (chars.length <= 1) {
    selectorEl.style.display = 'none';
    _selectedCharSubIndex = 0;
    return;
  }

  selectorEl.style.display = 'flex';
  if (_selectedCharSubIndex >= chars.length) _selectedCharSubIndex = 0;

  chars.forEach(function (c, idx) {
    var tab = document.createElement('button');
    tab.className = 'writer-char-tab' + (idx === _selectedCharSubIndex ? ' active' : '');
    tab.innerHTML = '<span class="char-tab-text">' + c + '</span><span class="char-tab-sub">Nét chữ ' + (idx + 1) + '</span>';
    tab.title = 'Tập viết chữ: ' + c;
    tab.onclick = function () {
      _selectedCharSubIndex = idx;
      renderCharSubSelector(fullHanzi);
      buildWriterForCurrentSubChar();
    };
    selectorEl.appendChild(tab);
  });
}

// ==================== BUILD WRITER FOR CURRENT SUB-CHAR ====================
function buildWriterForCurrentSubChar() {
  var curDeck = (window.AppState && window.AppState.deck) || (typeof deck !== 'undefined' ? deck : []);
  var curIdx = (window.AppState && typeof window.AppState.wIdx === 'number') ? window.AppState.wIdx : (typeof wIdx !== 'undefined' ? wIdx : 0);
  if (!curDeck || !curDeck.length) return;

  var w = curDeck[curIdx];
  var chars = extractHanziChars(w.h);
  var targetChar = (chars && chars.length > _selectedCharSubIndex)
    ? chars[_selectedCharSubIndex]
    : (chars[0] || (w.h && w.h.charAt(0)) || '一');

  buildWriter(targetChar, 'writer-target');
}

// ==================== BUILD WRITER ====================
// Creates (or replaces) a HanziWriter instance inside targetDivId
function buildWriter(char, targetDivId) {
  var targetDiv = document.getElementById(targetDivId);
  var hintText = document.getElementById('wHintText');
  if (!targetDiv) return;

  // Destroy previous instance safely
  if (_writerAnimTimer) {
    clearTimeout(_writerAnimTimer);
    _writerAnimTimer = null;
  }
  if (_writerInstance && typeof _writerInstance.cancelQuiz === 'function') {
    try { _writerInstance.cancelQuiz(); } catch (e) { }
  }
  _writerInstance = null;
  targetDiv.innerHTML = '';

  if (!char) {
    targetDiv.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">Không có ký tự</div>';
    return;
  }

  // Check HanziWriter library availability
  if (typeof HanziWriter === 'undefined') {
    targetDiv.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center; font-size:0.85rem;">Thư viện HanziWriter chưa tải. Vui lòng kiểm tra kết nối mạng.</div>';
    return;
  }

  try {
    var isLight = document.documentElement.classList.contains('light-theme');

    // Kích thước canvas responsive (250px trên desktop, 230px trên màn hình nhỏ)
    var canvasSize = window.innerWidth <= 420 ? 230 : 240;

    _writerInstance = HanziWriter.create(targetDivId, char, {
      width: canvasSize,
      height: canvasSize,
      padding: 16,
      showOutline: true,
      strokeAnimationSpeed: 1.1,
      delayBetweenStrokes: 240,
      // Gam màu Nghiên Mực & Triện Son
      strokeColor: isLight ? '#1c1917' : '#f5f0e6',
      outlineColor: isLight ? '#e4dfd7' : 'rgba(255, 255, 255, 0.16)',
      drawingColor: '#c0392b',
      drawingWidth: 5,
      highlightColor: '#d9534f',
      showHintAfterMisses: 2,
      onLoadCharDataError: function (err) {
        console.warn('⚠️ HanziWriter không tìm thấy dữ liệu nét cho chữ:', char, err);
        targetDiv.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center; font-size:0.85rem;">Không tìm thấy thứ tự nét cho ký tự "<b>' + char + '</b>"</div>';
      }
    });

    if (hintText) {
      hintText.textContent = 'Bấm "Xem nét" để xem mẫu hoặc "Tập viết" để tự vẽ nét chữ';
    }

    // Tự động chạy animation mẫu 1 lần nhẹ nhàng để người học quan sát
    _writerAnimTimer = setTimeout(function () {
      if (_writerInstance && typeof _writerInstance.animateCharacter === 'function') {
        try { _writerInstance.animateCharacter(); } catch (e) { }
      }
    }, 250);

  } catch (e) {
    console.error('HanziWriter.create error:', e);
    targetDiv.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">Lỗi khởi tạo ký tự "' + char + '"</div>';
    _writerInstance = null;
  }
}

// ==================== FAVORITE BUTTON STATE ====================
function renderWriterFavState(wordObj) {
  var favBtn = document.getElementById('wFav');
  if (!favBtn || !wordObj) return;

  var favs = [];
  try {
    favs = JSON.parse(localStorage.getItem('wq_favorites')) || [];
  } catch (e) { }

  var isFav = favs.some(function (item) { return item.h === wordObj.h; });
  if (isFav) {
    favBtn.classList.add('active');
    favBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
  } else {
    favBtn.classList.remove('active');
    favBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
  }
}

// ==================== STEP PREV / NEXT ====================
function stepWord(delta) {
  var curDeck = (window.AppState && window.AppState.deck) || (typeof deck !== 'undefined' ? deck : []);
  if (!curDeck || !curDeck.length) return;

  var curIdx = (window.AppState && typeof window.AppState.wIdx === 'number') ? window.AppState.wIdx : (typeof wIdx !== 'undefined' ? wIdx : 0);
  var newIdx = (curIdx + delta + curDeck.length) % curDeck.length;

  if (window.AppState) window.AppState.wIdx = newIdx;
  wIdx = newIdx;
  _selectedCharSubIndex = 0;

  renderWriter();
  renderWriterList();
  if (typeof saveProgress === 'function') saveProgress();

  // Scroll active chip into view
  var pickEl = document.getElementById('wPick');
  if (pickEl && pickEl.children[newIdx]) {
    pickEl.children[newIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener('DOMContentLoaded', function () {
  // 1. Kiểm tra pending custom deck
  checkPendingDeck();

  // 2. Chờ shared.js loadProgress / applyRange sẵn sàng
  setTimeout(function () {
    renderWriterList();
    renderWriter();
  }, 100);

  // ---------- Nút chuyển từ: Trước & Sau ----------
  var wPrevBtn = document.getElementById('wPrevBtn');
  if (wPrevBtn) {
    wPrevBtn.onclick = function () { stepWord(-1); };
  }

  var wNextBtn = document.getElementById('wNextBtn');
  if (wNextBtn) {
    wNextBtn.onclick = function () { stepWord(1); };
  }

  // ---------- Animate button (Xem nét) ----------
  var wAnimateBtn = document.getElementById('wAnimate');
  if (wAnimateBtn) {
    wAnimateBtn.addEventListener('click', function () {
      if (!_writerInstance) return;
      var hintText = document.getElementById('wHintText');
      if (hintText) hintText.textContent = '👀 Đang mô phỏng từng nét theo thứ tự bút thuận...';
      try {
        if (typeof _writerInstance.cancelQuiz === 'function') {
          _writerInstance.cancelQuiz();
        }
        _writerInstance.animateCharacter({
          onComplete: function () {
            if (hintText) hintText.textContent = 'Đã xem xong! Bấm "Tập viết" để tự mình luyện nét.';
          }
        });
      } catch (e) {
        console.warn('animateCharacter error:', e);
      }
    });
  }

  // ---------- Quiz button (Tập viết) ----------
  var wQuizBtn = document.getElementById('wQuiz');
  if (wQuizBtn) {
    wQuizBtn.addEventListener('click', function () {
      if (!_writerInstance) return;
      var curDeck = (window.AppState && window.AppState.deck) || (typeof deck !== 'undefined' ? deck : []);
      var curIdx = (window.AppState && typeof window.AppState.wIdx === 'number') ? window.AppState.wIdx : (typeof wIdx !== 'undefined' ? wIdx : 0);
      if (!curDeck || !curDeck.length) return;

      var w = curDeck[curIdx];
      var chars = extractHanziChars(w.h);
      var char = (chars && chars.length > _selectedCharSubIndex) ? chars[_selectedCharSubIndex] : (w.h.charAt(0) || w.h);
      var hintText = document.getElementById('wHintText');

      if (hintText) hintText.textContent = '✍️ Dùng ngón tay hoặc chuột để viết từng nét vào ô kẻ...';

      try {
        _writerInstance.quiz({
          onMistake: function (strokeData) {
            if (typeof showToast === 'function') showToast('Sai nét rồi! Thử lại nét này nhé 💪', 'warning');
            if (hintText) hintText.textContent = '⚠️ Sai thứ tự nét! Hãy nhìn gợi ý nét đỏ để viết lại.';
          },
          onCorrectStroke: function (strokeData) {
            if (hintText) hintText.textContent = '👍 Đúng nét rồi! Viết tiếp nét tiếp theo...';
          },
          onComplete: function (summaryData) {
            var msg = '🎉 Xuất sắc! Bạn đã viết đúng chữ "' + char + '"!';
            if (typeof showToast === 'function') showToast(msg, 'success');
            if (hintText) hintText.textContent = '🎉 Tuyệt vời! Bạn đã hoàn thành đúng chữ "' + char + '".';

            // Nếu từ ghép còn chữ tiếp theo, gợi ý chuyển sang chữ sau
            if (chars.length > 1 && _selectedCharSubIndex < chars.length - 1) {
              setTimeout(function () {
                _selectedCharSubIndex++;
                renderCharSubSelector(w.h);
                buildWriterForCurrentSubChar();
                if (typeof showToast === 'function') {
                  showToast('👉 Tiếp tục luyện chữ "' + chars[_selectedCharSubIndex] + '" nhé!', 'info');
                }
              }, 1200);
            }
          }
        });
      } catch (e) {
        console.warn('quiz error:', e);
      }
    });
  }

  // ---------- Reset button (Làm lại) ----------
  var wResetBtn = document.getElementById('wReset');
  if (wResetBtn) {
    wResetBtn.onclick = function () {
      buildWriterForCurrentSubChar();
      if (typeof showToast === 'function') showToast('Đã làm mới ô luyện viết', 'info');
    };
  }

  // ---------- Audio button ----------
  var wAudioBtn = document.getElementById('wAudio');
  if (wAudioBtn) {
    wAudioBtn.addEventListener('click', function () {
      var curDeck = (window.AppState && window.AppState.deck) || (typeof deck !== 'undefined' ? deck : []);
      var curIdx = (window.AppState && typeof window.AppState.wIdx === 'number') ? window.AppState.wIdx : (typeof wIdx !== 'undefined' ? wIdx : 0);
      if (!curDeck || !curDeck.length) return;
      if (typeof speak === 'function') speak(curDeck[curIdx].h);
    });
  }

  // ---------- Favorite button ----------
  var wFavBtn = document.getElementById('wFav');
  if (wFavBtn) {
    wFavBtn.onclick = function () {
      var curDeck = (window.AppState && window.AppState.deck) || (typeof deck !== 'undefined' ? deck : []);
      var curIdx = (window.AppState && typeof window.AppState.wIdx === 'number') ? window.AppState.wIdx : (typeof wIdx !== 'undefined' ? wIdx : 0);
      if (!curDeck || !curDeck.length) return;

      var word = curDeck[curIdx];
      var favs = [];
      try {
        favs = JSON.parse(localStorage.getItem('wq_favorites')) || [];
      } catch (e) { }

      var idx = favs.findIndex(function (item) { return item.h === word.h; });
      if (idx === -1) {
        var levelGoc = (window.AppState && window.AppState.level) || 'HSK 1';
        favs.push({ ...word, levelGoc: levelGoc });
        if (typeof showToast === 'function') showToast('Đã thêm "' + word.h + '" vào Yêu thích ⭐', 'success');
      } else {
        favs.splice(idx, 1);
        if (typeof showToast === 'function') showToast('Đã bỏ yêu thích "' + word.h + '"', 'info');
      }

      if (window.WQStorage && WQStorage.saveFavorites) {
        WQStorage.saveFavorites(favs);
      } else {
        localStorage.setItem('wq_favorites', JSON.stringify(favs));
      }
      if (typeof favorites !== 'undefined') favorites = favs;
      if (window.AppState) window.AppState.favorites = favs;
      if (typeof updateFavOptionText === 'function') updateFavOptionText();
      renderWriterFavState(word);
    };
  }

  // ---------- Keyboard: left/right arrow to change character ----------
  document.addEventListener('keydown', function (e) {
    // Không bắt phím nếu đang gõ input
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowRight') {
      stepWord(1);
    } else if (e.key === 'ArrowLeft') {
      stepWord(-1);
    } else if (e.key === ' ') {
      // Space: Nghe phát âm
      e.preventDefault();
      if (wAudioBtn) wAudioBtn.click();
    }
  });
});
