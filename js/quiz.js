// ==================== QUIZ.JS — Quiz page logic ====================
// Depends on globals from shared.js: level, deck, quizMode, quizPool, quizAskedWords, qScore, qTotal
// Uses: shuffle(), deduplicateWords(), speak(), showToast() from shared.js
// Uses: window.AppState from shared.js

let qCur = null, qAnswered = false;
// Holds the 4 options for the current question (for answer(idx) lookup)
let qCurrentOpts = [];

// ==================== NEW QUIZ ====================
function newQuiz() {
  const qHanziEl = document.getElementById('qHanzi');
  const qPinyinEl = document.getElementById('qPinyin');
  if (!qHanziEl) return;

  // Sync from AppState in case shared.js updated these
  if (window.AppState) {
    quizPool = window.AppState.quizPool || quizPool;
    quizAskedWords = window.AppState.quizAskedWords || quizAskedWords;
    qScore = window.AppState.qScore !== undefined ? window.AppState.qScore : qScore;
    qTotal = window.AppState.qTotal !== undefined ? window.AppState.qTotal : qTotal;
  }

  if (!deck || deck.length < 2) {
    qHanziEl.textContent = 'Cần ít nhất 2 từ để làm trắc nghiệm';
    qPinyinEl.textContent = '';
    document.getElementById('qOpts').innerHTML = '';
    document.getElementById('qResult').textContent = '';
    return;
  }

  qAnswered = false;
  document.getElementById('qResult').textContent = '';

  if (!quizPool || quizPool.length === 0) {
    quizPool = deduplicateWords([...deck]);
    shuffle(quizPool);
    quizAskedWords = [];
    qScore = 0;
    qTotal = 0;
    const qScoreEl = document.getElementById('qScore');
    if (qScoreEl) qScoreEl.textContent = 'Điểm: 0 / 0';
  }

  qCur = quizPool.shift();
  quizAskedWords.push(qCur);

  // Update AppState
  if (window.AppState) {
    window.AppState.quizPool = quizPool;
    window.AppState.quizAskedWords = quizAskedWords;
    window.AppState.qScore = qScore;
    window.AppState.qTotal = qTotal;
  }

  // Show question based on mode
  if (quizMode === 'hanzi-to-mean') {
    qHanziEl.style.display = 'block';
    qPinyinEl.style.display = 'block';
    qHanziEl.textContent = qCur.h;
    qPinyinEl.textContent = qCur.p;
  } else if (quizMode === 'hanzi-only-to-mean') {
    qHanziEl.style.display = 'block';
    qPinyinEl.style.display = 'none';
    qHanziEl.textContent = qCur.h;
  } else if (quizMode === 'mean-to-hanzi') {
    qHanziEl.style.display = 'block';
    qPinyinEl.style.display = 'none';
    qHanziEl.textContent = qCur.m;
  } else if (quizMode === 'mean-to-hanzi-pure') {
    qHanziEl.style.display = 'block';
    qPinyinEl.style.display = 'none';
    qHanziEl.textContent = qCur.m;
  } else if (quizMode === 'hanzi-to-pinyin') {
    qHanziEl.style.display = 'block';
    qPinyinEl.style.display = 'none';
    qHanziEl.textContent = qCur.h;
  } else if (quizMode === 'audio-to-mean') {
    qHanziEl.style.display = 'block';
    qPinyinEl.style.display = 'none';
    qHanziEl.textContent = '🔊 Nhấn để nghe';
    speak(qCur.h);
  }

  // Build 4 answer options (1 correct + 3 distractors)
  let opts = [qCur];
  const distractors = deck.filter(w => w && w.h !== qCur.h && w.m !== qCur.m);
  shuffle(distractors);
  for (const d of distractors) {
    if (opts.length >= 4) break;
    if (!opts.some(o => o.h === d.h || o.m === d.m)) opts.push(d);
  }
  shuffle(opts);
  qCurrentOpts = opts;

  const box = document.getElementById('qOpts');
  box.innerHTML = '';
  opts.forEach((o, idx) => {
    const d = document.createElement('div');
    d.className = 'q-opt';
    if (quizMode === 'hanzi-to-mean' || quizMode === 'hanzi-only-to-mean' || quizMode === 'audio-to-mean') {
      d.textContent = o.m;
    } else if (quizMode === 'mean-to-hanzi') {
      d.textContent = o.h + ' (' + o.p + ')';
    } else if (quizMode === 'mean-to-hanzi-pure') {
      d.textContent = o.h;
    } else if (quizMode === 'hanzi-to-pinyin') {
      d.textContent = o.p;
    }
    d.onclick = () => answer(idx);
    box.appendChild(d);
  });

  const qLevelEl = document.getElementById('qLevel');
  if (qLevelEl) qLevelEl.textContent = (level === 'favorites') ? 'Yêu thích' : level;
}

// ==================== RECORD SRS ====================
function recordSrsAnswer(wordStr, isCorrect) {
  if (!wordStr) return;
  const srs = (window.WQStorage && WQStorage.getSRS())
    || JSON.parse(localStorage.getItem('wq_srs')) || {};

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

// ==================== ANSWER ====================
// idx — index into qCurrentOpts[]
function answer(idx) {
  if (qAnswered) return;
  qAnswered = true;
  qTotal++;

  const optEls = document.querySelectorAll('.q-opt');
  optEls.forEach(x => x.classList.add('disabled'));

  // Determine the correct display text for this mode
  let correctText = '';
  if (quizMode === 'hanzi-to-mean' || quizMode === 'hanzi-only-to-mean' || quizMode === 'audio-to-mean') {
    correctText = qCur.m;
  } else if (quizMode === 'mean-to-hanzi') {
    correctText = qCur.h + ' (' + qCur.p + ')';
  } else if (quizMode === 'mean-to-hanzi-pure') {
    correctText = qCur.h;
  } else if (quizMode === 'hanzi-to-pinyin') {
    correctText = qCur.p;
  }

  const chosen = qCurrentOpts[idx];
  const qResultEl = document.getElementById('qResult');
  const chosenEl = optEls[idx];

  if (chosen === qCur) {
    if (chosenEl) chosenEl.classList.add('correct');
    qScore++;
    if (qResultEl) {
      qResultEl.textContent = '✓ Chính xác!';
      qResultEl.style.color = 'var(--neon-green)';
    }
    recordSrsAnswer(qCur.h, true);
  } else {
    if (chosenEl) chosenEl.classList.add('wrong');
    // Highlight correct option
    optEls.forEach(x => {
      if (x.textContent === correctText) x.classList.add('correct');
    });
    if (qResultEl) {
      qResultEl.textContent = '✗ Đáp án: ' + correctText;
      qResultEl.style.color = 'var(--neon-red)';
    }
    recordSrsAnswer(qCur.h, false);
  }

  speak(qCur.h);

  const qScoreEl = document.getElementById('qScore');
  if (qScoreEl) qScoreEl.textContent = 'Điểm: ' + qScore + ' / ' + qTotal;

  // Update AppState
  if (window.AppState) {
    window.AppState.qScore = qScore;
    window.AppState.qTotal = qTotal;
  }
}

// ==================== QUIZ HSK GRID ====================
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

  Object.keys(DATA).forEach(function(lvl, index) {
    const words = DATA[lvl];
    if (!words || words.length === 0) return;
    const total = words.length;
    const color = colors[index % colors.length];

    const card = document.createElement('div');
    card.className = 'hsk-card';
    card.style.setProperty('--card-color', color);
    card.innerHTML =
      '<div class="hsk-card-header">' +
        '<h4>' + lvl + '</h4>' +
        '<span class="word-count">' + total + ' từ</span>' +
      '</div>' +
      '<div style="margin: 16px 0; color: var(--text-secondary); font-size: 0.9rem;">' +
        'Làm trắc nghiệm với ' + total + ' từ vựng' +
      '</div>' +
      '<button class="btn start-learn-btn" style="background: ' + color + '; border: none; color: #fff;">✏️ Bắt đầu Quiz</button>';

    card.querySelector('.start-learn-btn').onclick = function() {
      startQuizWithDeck({ name: lvl, words: words });
    };

    grid.appendChild(card);
  });
}

// ==================== QUIZ CUSTOM DECKS ====================
function renderQuizCustomDecks() {
  const list = document.getElementById('quizCustomDecksList');
  if (!list) return;

  const currentUser = window.WQAuth && window.WQAuth.getCurrentUser ? window.WQAuth.getCurrentUser() : null;
  const username = currentUser ? currentUser.username : null;
  let customDecks = [];

  if (username && window.WQStorage && WQStorage.getUserDataField) {
    customDecks = WQStorage.getUserDataField(username, 'customDecks', '') || [];
  } else {
    try {
      customDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
    } catch(e) {
      customDecks = [];
    }
  }

  if (customDecks.length === 0) {
    list.innerHTML =
      '<div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1;">' +
        'Chưa có bộ từ tự tạo. <a href="custom.html" style="color: var(--accent-purple); text-decoration: underline;">Tạo ngay</a>' +
      '</div>';
    return;
  }

  list.innerHTML = '';
  customDecks.forEach(function(d) {
    const card = document.createElement('div');
    card.className = 'hsk-card';
    card.style.setProperty('--card-color', 'var(--accent-gradient)');
    card.innerHTML =
      '<div class="hsk-card-header">' +
        '<h4>📚 ' + d.name + '</h4>' +
        '<span class="word-count">' + (d.wordCount || (d.words && d.words.length) || 0) + ' từ</span>' +
      '</div>' +
      '<div style="margin: 16px 0; color: var(--text-secondary); font-size: 0.85rem;">' +
        '📅 ' + (d.createdAt || '') +
      '</div>' +
      '<button class="btn start-learn-btn" style="background: var(--accent-gradient); border: none; color: #fff;">✏️ Bắt đầu Quiz</button>';

    card.querySelector('.start-learn-btn').onclick = function() {
      startQuizWithDeck({ name: d.name, words: d.words });
    };

    list.appendChild(card);
  });
}

// ==================== START QUIZ WITH DECK ====================
// deckObj: { name: string, words: array }
function startQuizWithDeck(deckObj) {
  if (!deckObj || !deckObj.words || deckObj.words.length < 2) {
    if (window.showToast) showToast('Cần ít nhất 2 từ để làm trắc nghiệm!', 'error');
    return;
  }

  // Update global state
  level = deckObj.name;
  deck = [...deckObj.words];
  // Deduplicate and shuffle deck
  deck = deduplicateWords(deck);
  shuffle(deck);

  fcIdx = 0; wIdx = 0; qScore = 0; qTotal = 0;
  quizPool = []; quizAskedWords = [];

  // Sync to AppState
  if (window.AppState) {
    window.AppState.level = level;
    window.AppState.deck = deck;
    window.AppState.fcIdx = 0;
    window.AppState.wIdx = 0;
    window.AppState.qScore = 0;
    window.AppState.qTotal = 0;
    window.AppState.quizPool = quizPool;
    window.AppState.quizAskedWords = quizAskedWords;
  }

  // Switch UI panels
  const deckSelection = document.getElementById('quizDeckSelection');
  const gameSection = document.getElementById('quizGameSection');
  if (deckSelection) deckSelection.style.display = 'none';
  if (gameSection) gameSection.style.display = 'block';

  newQuiz();
  if (window.showToast) showToast('✏️ Bắt đầu trắc nghiệm "' + deckObj.name + '"!', 'success');
}
window.startQuizWithDeck = startQuizWithDeck;

// ==================== BACK TO QUIZ SELECTION ====================
function backToQuizSelection() {
  const deckSelection = document.getElementById('quizDeckSelection');
  const gameSection = document.getElementById('quizGameSection');
  if (deckSelection) deckSelection.style.display = 'block';
  if (gameSection) gameSection.style.display = 'none';

  qScore = 0; qTotal = 0;
  quizPool = []; quizAskedWords = [];

  if (window.AppState) {
    window.AppState.qScore = 0;
    window.AppState.qTotal = 0;
    window.AppState.quizPool = [];
    window.AppState.quizAskedWords = [];
  }

  const qScoreEl = document.getElementById('qScore');
  const qResultEl = document.getElementById('qResult');
  if (qScoreEl) qScoreEl.textContent = 'Điểm: 0 / 0';
  if (qResultEl) qResultEl.textContent = '';
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener('DOMContentLoaded', function() {
  // Quiz mode buttons
  document.querySelectorAll('.quiz-mode-btn').forEach(function(btn) {
    btn.onclick = function() {
      document.querySelectorAll('.quiz-mode-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      quizMode = btn.dataset.mode;
      localStorage.setItem('wq_quiz_mode', quizMode);
      if (window.AppState) window.AppState.quizMode = quizMode;

      qScore = 0; qTotal = 0;
      quizPool = []; quizAskedWords = [];
      if (window.AppState) {
        window.AppState.qScore = 0;
        window.AppState.qTotal = 0;
        window.AppState.quizPool = [];
        window.AppState.quizAskedWords = [];
      }
      const qScoreEl = document.getElementById('qScore');
      if (qScoreEl) qScoreEl.textContent = 'Điểm: 0 / 0';
      newQuiz();
    };
  });

  // Restore saved quiz mode active state
  var savedBtn = document.querySelector('.quiz-mode-btn[data-mode="' + quizMode + '"]');
  if (savedBtn) {
    document.querySelectorAll('.quiz-mode-btn').forEach(function(b) { b.classList.remove('active'); });
    savedBtn.classList.add('active');
  }

  // Back button
  var qBackBtn = document.getElementById('qBackBtn');
  if (qBackBtn) qBackBtn.onclick = backToQuizSelection;

  // Next and audio buttons
  var qNext = document.getElementById('qNext');
  var qAudio = document.getElementById('qAudio');
  if (qNext) qNext.onclick = newQuiz;
  if (qAudio) qAudio.onclick = function() { if (qCur) speak(qCur.h); };

  // 1. Check for pending deck from cross-page navigation
  // Delay to let shared.js finish loadProgress() which may reset deck
  function initQuizPage() {
    var pendingDeckStr = localStorage.getItem('wq_pending_deck');
    var pendingMode = localStorage.getItem('wq_pending_mode');

    if (pendingDeckStr && (pendingMode === 'quiz' || pendingMode === 'both')) {
      try {
        var pendingDeck = JSON.parse(pendingDeckStr);
        localStorage.removeItem('wq_pending_deck');
        localStorage.removeItem('wq_pending_mode');
        startQuizWithDeck(pendingDeck);
      } catch(e) {
        console.warn('Failed to load pending deck for quiz:', e);
        renderQuizHskGrid();
        renderQuizCustomDecks();
        var deckSel = document.getElementById('quizDeckSelection');
        if (deckSel) deckSel.style.display = 'block';
      }
    } else {
      // No pending deck — show selection grid
      function tryRenderGrid() {
        if (typeof DATA !== 'undefined' && Object.keys(DATA).length > 0) {
          renderQuizHskGrid();
          renderQuizCustomDecks();
          var deckSelection = document.getElementById('quizDeckSelection');
          if (deckSelection) deckSelection.style.display = 'block';
        } else {
          setTimeout(tryRenderGrid, 100);
        }
      }
      tryRenderGrid();
    }
  }

  // Wait for shared.js to finish init, then init quiz page
  // shared.js skips applyRange when wq_pending_deck is present, so deck won't be overwritten
  initQuizPage();

  // Also re-render grid when DATA becomes available via WQSyncData
  document.addEventListener('wq:data-loaded', function() {
    var sel = document.getElementById('quizDeckSelection');
    if (sel && sel.style.display !== 'none') {
      renderQuizHskGrid();
      renderQuizCustomDecks();
    }
  });
});
