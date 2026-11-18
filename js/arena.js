// ==================== ARENA.JS — Kahoot-Style Live Vocabulary Game ====================
// Runs on arena.html.

(function () {
  'use strict';

  // ==================== WEB AUDIO SOUND EFFECTS ====================
  var _audioCtx = null;
  function getAudioContext() {
    if (!_audioCtx) {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) _audioCtx = new AudioCtx();
    }
    if (_audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }
    return _audioCtx;
  }

  function playTone(freq, type, duration, delay, gainLevel) {
    try {
      var ctx = getAudioContext();
      if (!ctx) return;
      delay = delay || 0;
      gainLevel = gainLevel || 0.15;
      setTimeout(function () {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(gainLevel, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      }, delay * 1000);
    } catch (e) { }
  }

  var SFX = {
    pop: function () {
      playTone(587.33, 'sine', 0.1, 0, 0.2); // D5
      playTone(880, 'sine', 0.12, 0.05, 0.2); // A5
    },
    tick: function () {
      playTone(440, 'triangle', 0.04, 0, 0.06);
    },
    urgentTick: function () {
      playTone(880, 'sine', 0.06, 0, 0.12);
    },
    correct: function () {
      playTone(523.25, 'sine', 0.12, 0, 0.2); // C5
      playTone(659.25, 'sine', 0.12, 0.08, 0.2); // E5
      playTone(783.99, 'sine', 0.15, 0.16, 0.25); // G5
      playTone(1046.50, 'sine', 0.35, 0.24, 0.3); // C6
    },
    wrong: function () {
      playTone(280, 'sawtooth', 0.18, 0, 0.15);
      playTone(220, 'sawtooth', 0.28, 0.12, 0.2);
    },
    fanfare: function () {
      playTone(523.25, 'triangle', 0.15, 0, 0.25);
      playTone(659.25, 'triangle', 0.15, 0.15, 0.25);
      playTone(783.99, 'triangle', 0.2, 0.3, 0.3);
      playTone(1046.50, 'triangle', 0.5, 0.5, 0.35);
    }
  };

  // ==================== CROSS-TAB REALTIME CHANNEL ====================
  // Cho phép 1 tab làm Host chiếu màn hình lớn, 1 tab (hoặc cửa sổ khác) làm Player thi đấu trực tiếp
  var _arenaChannel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      _arenaChannel = new BroadcastChannel('hanyu_arena_channel');
    } catch (e) { }
  }

  function broadcastMsg(action, payload) {
    if (_arenaChannel) {
      _arenaChannel.postMessage({ action: action, payload: payload, timestamp: Date.now() });
    }
    // Backup qua localStorage storage event
    try {
      localStorage.setItem('wq_arena_sync', JSON.stringify({ action: action, payload: payload, time: Date.now() }));
    } catch (e) { }
  }

  // ==================== GAME STATE ====================
  var gameState = {
    role: 'host', // 'host' | 'player'
    pin: '',
    status: 'config', // 'config' | 'lobby' | 'countdown' | 'question' | 'round_end' | 'leaderboard' | 'podium'
    deckName: '',
    deckWords: [],
    questionType: 'hanzi_to_mean',
    totalQuestions: 10,
    timePerQuestion: 15,
    currentQuestionIndex: 0,
    questions: [],
    players: [], // [{ id, name, avatar, score, streak, lastAnswerIndex, answeredAt, isBot }]
    timerInterval: null,
    timerRemaining: 0,
    questionStartTime: 0,
    playerProfile: {
      name: '',
      avatar: '🐼'
    }
  };

  var BOT_NAMES = [
    { name: 'Tiểu Minh', avatar: '🐼' },
    { name: 'Hồng Hoa', avatar: '🌸' },
    { name: 'A Cường', avatar: '⚡' },
    { name: 'Lan Lan', avatar: '🐰' },
    { name: 'Thanh Phong', avatar: '🦊' },
    { name: 'Bảo Bảo', avatar: '🐻' },
    { name: 'Tử Long', avatar: '🐉' },
    { name: 'Cát Tường', avatar: '🐯' }
  ];

  // ==================== VIEW MANAGEMENT ====================
  function showView(viewId) {
    var allViews = document.querySelectorAll('.arena-view');
    allViews.forEach(function (v) {
      v.style.display = 'none';
    });
    var target = document.getElementById(viewId);
    if (target) {
      target.style.display = 'block';
    }
  }

  // ==================== INIT ARENA ====================
  function initArena() {
    loadSavedPlayerProfile();
    populateDeckOptions();
    checkUrlParams();
    bindEvents();
    setupCrossTabSync();
  }

  function loadSavedPlayerProfile() {
    var savedName = localStorage.getItem('wq_arena_player_name') || '';
    var savedAvatar = localStorage.getItem('wq_arena_player_avatar') || '🐼';
    gameState.playerProfile.name = savedName;
    gameState.playerProfile.avatar = savedAvatar;

    var nameInput = document.getElementById('playerInputName');
    if (nameInput && savedName) nameInput.value = savedName;

    var avatarBtns = document.querySelectorAll('.avatar-btn');
    avatarBtns.forEach(function (btn) {
      if (btn.dataset.avatar === savedAvatar) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function populateDeckOptions() {
    var select = document.getElementById('hostDeckSelect');
    if (!select) return;
    select.innerHTML = '';

    // HSK Levels từ DATA
    if (typeof DATA !== 'undefined') {
      Object.keys(DATA).forEach(function (lvl) {
        var count = DATA[lvl] ? DATA[lvl].length : 0;
        if (count > 0) {
          var opt = document.createElement('option');
          opt.value = lvl;
          opt.textContent = lvl + ' (' + count + ' từ)';
          select.appendChild(opt);
        }
      });
    }

    // Các bộ từ tự tạo
    try {
      var customDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
      if (Array.isArray(customDecks) && customDecks.length > 0) {
        var optGroup = document.createElement('optgroup');
        optGroup.label = '📦 Bộ từ tự tạo của bạn';
        customDecks.forEach(function (cd) {
          var count = cd.words ? cd.words.length : (cd.wordCount || 0);
          if (count >= 4) {
            var opt = document.createElement('option');
            opt.value = 'custom:' + (cd.id || cd.name);
            opt.textContent = cd.name + ' (' + count + ' từ)';
            optGroup.appendChild(opt);
          }
        });
        if (optGroup.children.length > 0) {
          select.appendChild(optGroup);
        }
      }
    } catch (e) { }
  }

  function checkUrlParams() {
    var urlParams = new URLSearchParams(window.location.search);
    var pinParam = urlParams.get('pin');
    if (pinParam) {
      // Người dùng quét mã QR hoặc vào từ link mời -> Mở thẳng tab Người chơi
      switchRoleTab('player');
      var pinInput = document.getElementById('playerInputPin');
      if (pinInput) pinInput.value = pinParam;
    }
  }

  function switchRoleTab(role) {
    gameState.role = role;
    var tabHostBtn = document.getElementById('tabHostBtn');
    var tabPlayerBtn = document.getElementById('tabPlayerBtn');

    if (role === 'host') {
      if (tabHostBtn) tabHostBtn.classList.add('active');
      if (tabPlayerBtn) tabPlayerBtn.classList.remove('active');
      showView('hostConfigView');
    } else {
      if (tabPlayerBtn) tabPlayerBtn.classList.add('active');
      if (tabHostBtn) tabHostBtn.classList.remove('active');
      showView('playerJoinView');
    }
  }

  // ==================== HOST: TẠO PHÒNG ====================
  function createRoom() {
    var deckSelect = document.getElementById('hostDeckSelect');
    var qTypeSelect = document.getElementById('hostQuestionType');
    var qCountSelect = document.getElementById('hostQuestionCount');
    var timeSelect = document.getElementById('hostTimePerQuestion');

    if (!deckSelect) return;
    var deckVal = deckSelect.value;
    var words = getWordsFromDeckVal(deckVal);

    if (!words || words.length < 4) {
      if (typeof showToast === 'function') {
        showToast('Bộ từ này cần ít nhất 4 từ để tạo câu hỏi trắc nghiệm!', 'error');
      }
      return;
    }

    gameState.deckWords = words;
    gameState.deckName = deckSelect.options[deckSelect.selectedIndex].text;
    gameState.questionType = qTypeSelect ? qTypeSelect.value : 'hanzi_to_mean';
    gameState.totalQuestions = Math.min(parseInt(qCountSelect.value, 10) || 10, words.length);
    gameState.timePerQuestion = parseInt(timeSelect.value, 10) || 15;

    // Sinh mã PIN ngẫu nhiên 6 số
    gameState.pin = String(Math.floor(100000 + Math.random() * 900000));
    gameState.players = [];
    gameState.status = 'lobby';

    // Tạo bộ câu hỏi
    generateQuestions();

    // Hiển thị giao diện Lobby
    renderLobby();
    showView('hostLobbyView');

    // Phát âm thanh
    SFX.pop();

    // Broadcast trạng thái phòng mới
    broadcastMsg('room_created', {
      pin: gameState.pin,
      deckName: gameState.deckName,
      totalQuestions: gameState.totalQuestions
    });
  }

  function getWordsFromDeckVal(deckVal) {
    if (!deckVal) return [];
    if (deckVal.indexOf('custom:') === 0) {
      var customId = deckVal.replace('custom:', '');
      try {
        var customDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
        var found = customDecks.find(function (d) { return String(d.id || d.name) === customId; });
        return (found && found.words) ? found.words : [];
      } catch (e) {
        return [];
      }
    }
    if (typeof DATA !== 'undefined' && DATA[deckVal]) {
      return DATA[deckVal];
    }
    return [];
  }

  // Sinh danh sách câu hỏi
  function generateQuestions() {
    var words = gameState.deckWords.slice();
    shuffleArray(words);
    var selectedWords = words.slice(0, gameState.totalQuestions);

    gameState.questions = selectedWords.map(function (w, qIdx) {
      var qType = gameState.questionType;
      if (qType === 'mixed') {
        var types = ['hanzi_to_mean', 'mean_to_hanzi', 'hanzi_to_pinyin'];
        qType = types[Math.floor(Math.random() * types.length)];
      }

      // Tạo 3 distractors sai từ các từ khác trong deck
      var distractors = words.filter(function (other) { return other.h !== w.h; });
      shuffleArray(distractors);
      var wrongPicks = distractors.slice(0, 3);

      var promptText = w.h;
      var promptSub = w.p || '';
      var promptTypeDesc = 'Nhìn Hán tự ➔ Chọn nghĩa đúng';
      var correctAnswerText = w.m || '';

      if (qType === 'mean_to_hanzi') {
        promptText = w.m || '';
        promptSub = '';
        promptTypeDesc = 'Nhìn Nghĩa ➔ Chọn Hán tự đúng';
        correctAnswerText = w.h;
      } else if (qType === 'hanzi_to_pinyin') {
        promptText = w.h;
        promptSub = '';
        promptTypeDesc = 'Nhìn Hán tự ➔ Chọn Pinyin đúng';
        correctAnswerText = w.p || '';
      }

      var answerOptions = [
        { text: correctAnswerText, isCorrect: true }
      ];

      wrongPicks.forEach(function (wp) {
        var wrongText = wp.m || '';
        if (qType === 'mean_to_hanzi') wrongText = wp.h;
        else if (qType === 'hanzi_to_pinyin') wrongText = wp.p || '';
        answerOptions.push({ text: wrongText, isCorrect: false });
      });

      // Tráo đổi 4 đáp án ngẫu nhiên
      shuffleArray(answerOptions);
      var correctIndex = answerOptions.findIndex(function (o) { return o.isCorrect; });

      return {
        id: qIdx + 1,
        type: qType,
        typeDesc: promptTypeDesc,
        prompt: promptText,
        subPrompt: promptSub,
        hanziAudio: w.h,
        options: answerOptions.map(function (o) { return o.text; }),
        correctIndex: correctIndex
      };
    });
  }

  // ==================== HOST: HIỂN THỊ PHÒNG CHỜ (LOBBY) ====================
  function renderLobby() {
    var pinEl = document.getElementById('displayRoomPin');
    var deckInfoEl = document.getElementById('lobbyDeckInfo');
    if (pinEl) pinEl.textContent = formatPinCode(gameState.pin);
    if (deckInfoEl) {
      deckInfoEl.textContent = gameState.deckName + ' • ' + gameState.totalQuestions + ' câu • ' + gameState.timePerQuestion + 's/câu';
    }

    // Sinh QR Code
    generateQrCode();
    renderPlayerList();
  }

  function formatPinCode(pin) {
    if (!pin) return '------';
    return pin.slice(0, 3) + ' ' + pin.slice(3);
  }

  function generateQrCode() {
    var canvas = document.getElementById('lobbyQrCanvas');
    if (!canvas) return;

    // Link mời quét mã phòng
    var joinUrl = window.location.origin + window.location.pathname + '?pin=' + gameState.pin;

    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(canvas, joinUrl, {
        width: 190,
        margin: 1,
        color: {
          dark: '#1c1917',
          light: '#ffffff'
        }
      }, function (error) {
        if (error) console.warn('QR code gen error:', error);
      });
    }
  }

  function renderPlayerList() {
    var listEl = document.getElementById('lobbyPlayersList');
    var countEl = document.getElementById('playerCount');
    var startBtn = document.getElementById('btnStartGame');
    if (!listEl) return;

    var count = gameState.players.length;
    if (countEl) countEl.textContent = count;

    if (startBtn) {
      startBtn.disabled = count === 0;
      startBtn.innerHTML = '<span>BẮT ĐẦU TRẬN ĐẤU (' + count + ' NGƯỜI) ➔</span>';
    }

    if (count === 0) {
      listEl.innerHTML = '<div class="empty-lobby-text">Đang chờ người chơi quét mã vào phòng...</div>';
      return;
    }

    listEl.innerHTML = '';
    gameState.players.forEach(function (p) {
      var chip = document.createElement('div');
      chip.className = 'player-chip' + (p.isBot ? ' bot' : '');
      chip.innerHTML = '<span class="player-avatar">' + p.avatar + '</span><span class="player-name">' + p.name + '</span>';
      listEl.appendChild(chip);
    });
  }

  // Thêm Bot ảo
  function addMockBot() {
    var available = BOT_NAMES.filter(function (b) {
      return !gameState.players.some(function (p) { return p.name === b.name; });
    });
    if (available.length === 0) {
      if (typeof showToast === 'function') showToast('Đã thêm tối đa bạn học ảo!', 'info');
      return;
    }

    var pick = available[Math.floor(Math.random() * available.length)];
    gameState.players.push({
      id: 'bot_' + Date.now() + '_' + Math.random(),
      name: pick.name,
      avatar: pick.avatar,
      score: 0,
      streak: 0,
      lastAnswerIndex: -1,
      answeredAt: 0,
      isBot: true
    });

    SFX.pop();
    renderPlayerList();
  }

  // ==================== HOST: BẮT ĐẦU TRẬN ĐẤU ====================
  function startGame() {
    if (gameState.players.length === 0) return;
    gameState.currentQuestionIndex = 0;
    gameState.status = 'countdown';

    // Bắt đầu đếm ngược 3... 2... 1...
    var overlay = document.getElementById('startCountdownOverlay');
    var numEl = document.getElementById('countdownNumber');
    showView('hostGameView');

    if (overlay) overlay.style.display = 'flex';
    var count = 3;
    if (numEl) numEl.textContent = count;
    SFX.urgentTick();

    var cdTimer = setInterval(function () {
      count--;
      if (count > 0) {
        if (numEl) numEl.textContent = count;
        SFX.urgentTick();
      } else {
        clearInterval(cdTimer);
        if (overlay) overlay.style.display = 'none';
        startQuestionRound();
      }
    }, 1000);

    broadcastMsg('game_start', {
      totalQuestions: gameState.totalQuestions
    });
  }

  // Bắt đầu 1 vòng câu hỏi
  function startQuestionRound() {
    var qIdx = gameState.currentQuestionIndex;
    var q = gameState.questions[qIdx];
    if (!q) {
      showPodium();
      return;
    }

    gameState.status = 'question';
    gameState.timerRemaining = gameState.timePerQuestion;
    gameState.questionStartTime = Date.now();

    // Reset trạng thái trả lời của người chơi
    gameState.players.forEach(function (p) {
      p.lastAnswerIndex = -1;
      p.answeredAt = 0;
    });

    // Cập nhật giao diện Host
    var qCounterEl = document.getElementById('hostQCounter');
    var qTypeBadge = document.getElementById('hostQTypeBadge');
    var qTextEl = document.getElementById('hostQuestionText');
    var qSubEl = document.getElementById('hostQuestionSub');
    var timerSecEl = document.getElementById('hostTimerSec');
    var answeredCountEl = document.getElementById('answeredCount');
    var totalPlayingEl = document.getElementById('totalPlayersPlaying');
    var hostFooter = document.getElementById('gameHostFooter');
    var progressBar = document.getElementById('hostTimeProgressBar');

    if (qCounterEl) qCounterEl.textContent = 'Câu ' + (qIdx + 1) + ' / ' + gameState.totalQuestions;
    if (qTypeBadge) qTypeBadge.textContent = q.typeDesc;
    if (qTextEl) qTextEl.textContent = q.prompt;
    if (qSubEl) qSubEl.textContent = q.subPrompt || '';
    if (timerSecEl) timerSecEl.textContent = gameState.timerRemaining;
    if (answeredCountEl) answeredCountEl.textContent = '0';
    if (totalPlayingEl) totalPlayingEl.textContent = gameState.players.length;
    if (hostFooter) hostFooter.style.display = 'none';
    if (progressBar) progressBar.style.width = '100%';

    // Gán text cho 4 đáp án
    for (var i = 0; i < 4; i++) {
      var ansTextEl = document.getElementById('hostAns' + i);
      var cardEl = document.querySelector('.k-ans-card[data-index="' + i + '"]');
      if (ansTextEl) ansTextEl.textContent = q.options[i] || '';
      if (cardEl) {
        cardEl.classList.remove('correct', 'wrong', 'faded');
      }
    }

    // Tự động phát âm chữ Hán
    if (q.hanziAudio && typeof speak === 'function') {
      setTimeout(function () { speak(q.hanziAudio); }, 400);
    }

    // Chạy đồng hồ đếm ngược
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = setInterval(function () {
      gameState.timerRemaining--;
      if (timerSecEl) timerSecEl.textContent = Math.max(0, gameState.timerRemaining);

      var pct = (gameState.timerRemaining / gameState.timePerQuestion) * 100;
      if (progressBar) progressBar.style.width = Math.max(0, pct) + '%';

      if (gameState.timerRemaining <= 5 && gameState.timerRemaining > 0) {
        SFX.urgentTick();
      } else if (gameState.timerRemaining > 5) {
        SFX.tick();
      }

      if (gameState.timerRemaining <= 0) {
        clearInterval(gameState.timerInterval);
        endQuestionRound();
      }
    }, 1000);

    // Xử lý bot tự động trả lời mô phỏng
    runBotSimulation(q);

    // Broadcast tới các thiết bị người chơi
    broadcastMsg('new_question', {
      questionIndex: qIdx,
      totalQuestions: gameState.totalQuestions,
      time: gameState.timePerQuestion
    });
  }

  // Mô phỏng bot trả lời
  function runBotSimulation(q) {
    gameState.players.forEach(function (p) {
      if (!p.isBot) return;

      // Bot trả lời sau 2.5s đến 12s
      var delay = 2500 + Math.random() * (gameState.timePerQuestion * 800 - 2500);
      setTimeout(function () {
        if (gameState.status !== 'question') return;
        // 80% bot trả lời đúng
        var isCorrect = Math.random() < 0.8;
        var chosenIndex = isCorrect ? q.correctIndex : (q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;
        recordPlayerAnswer(p.id, chosenIndex);
      }, delay);
    });
  }

  // Ghi nhận câu trả lời của 1 người chơi
  function recordPlayerAnswer(playerId, answerIndex) {
    var p = gameState.players.find(function (x) { return x.id === playerId; });
    if (!p || p.lastAnswerIndex !== -1 || gameState.status !== 'question') return;

    p.lastAnswerIndex = answerIndex;
    p.answeredAt = Date.now();

    var q = gameState.questions[gameState.currentQuestionIndex];
    if (answerIndex === q.correctIndex) {
      // Tính điểm theo tốc độ Kahoot
      var timeUsed = (p.answeredAt - gameState.questionStartTime) / 1000;
      var speedBonus = Math.max(0, 1 - (timeUsed / gameState.timePerQuestion) / 2);
      var points = Math.round(1000 * speedBonus) + (p.streak * 50);

      p.score += points;
      p.streak++;
      p.lastPointsEarned = points;
    } else {
      p.streak = 0;
      p.lastPointsEarned = 0;
    }

    // Cập nhật số người đã trả lời trên màn hình Host
    var answeredCount = gameState.players.filter(function (x) { return x.lastAnswerIndex !== -1; }).length;
    var answeredEl = document.getElementById('answeredCount');
    if (answeredEl) answeredEl.textContent = answeredCount;

    // Nếu tất cả người chơi đã trả lời xong trước khi hết giờ -> Kết thúc câu hỏi ngay
    if (answeredCount >= gameState.players.length) {
      clearInterval(gameState.timerInterval);
      endQuestionRound();
    }
  }

  // Kết thúc vòng câu hỏi (hết giờ hoặc đã trả lời hết)
  function endQuestionRound() {
    gameState.status = 'round_end';
    var q = gameState.questions[gameState.currentQuestionIndex];
    var correctIdx = q.correctIndex;

    // Highlight đáp án đúng trên màn hình Host
    for (var i = 0; i < 4; i++) {
      var cardEl = document.querySelector('.k-ans-card[data-index="' + i + '"]');
      if (cardEl) {
        if (i === correctIdx) {
          cardEl.classList.add('correct');
        } else {
          cardEl.classList.add('faded');
        }
      }
    }

    SFX.correct();

    // Hiển thị footer điều hướng
    var hostFooter = document.getElementById('gameHostFooter');
    var summaryEl = document.getElementById('roundSummaryText');
    if (summaryEl) {
      summaryEl.textContent = 'Đáp án đúng: ' + q.options[correctIdx];
    }
    if (hostFooter) hostFooter.style.display = 'flex';

    // Broadcast kết quả tới từng người chơi
    broadcastMsg('question_result', {
      correctIndex: correctIdx,
      correctText: q.options[correctIdx],
      scores: gameState.players.map(function (p) {
        return { id: p.id, name: p.name, score: p.score, lastEarned: p.lastPointsEarned || 0 };
      })
    });
  }

  // ==================== HOST: BẢNG XẾP HẠNG ====================
  function showLeaderboard() {
    gameState.status = 'leaderboard';
    showView('hostLeaderboardView');

    // Sắp xếp người chơi theo điểm giảm dần
    var sorted = gameState.players.slice().sort(function (a, b) {
      return b.score - a.score;
    });

    var listEl = document.getElementById('hostLeaderboardList');
    var titleEl = document.getElementById('leaderboardRoundTitle');
    var continueBtn = document.getElementById('btnContinueGame');

    if (titleEl) {
      titleEl.textContent = 'Top Dẫn Đầu (Câu ' + (gameState.currentQuestionIndex + 1) + ' / ' + gameState.totalQuestions + ')';
    }

    if (continueBtn) {
      var isLast = gameState.currentQuestionIndex >= gameState.totalQuestions - 1;
      continueBtn.innerHTML = isLast ? '<span>Xem Bục Vinh Quang 🏆</span>' : '<span>Câu hỏi tiếp theo ➔</span>';
    }

    if (listEl) {
      listEl.innerHTML = '';
      sorted.slice(0, 5).forEach(function (p, rank) {
        var row = document.createElement('div');
        row.className = 'leaderboard-row' + (p.isBot ? ' bot' : '');
        row.innerHTML =
          '<div class="rank-badge rank-' + (rank + 1) + '">' + (rank + 1) + '</div>' +
          '<div class="player-info-cell">' +
          '<span class="avatar">' + p.avatar + '</span>' +
          '<span class="name">' + p.name + '</span>' +
          (p.streak >= 2 ? '<span class="streak-badge">🔥 ' + p.streak + '</span>' : '') +
          '</div>' +
          '<div class="score-cell">' + p.score.toLocaleString() + ' đ</div>';
        listEl.appendChild(row);
      });
    }

    SFX.pop();
  }

  function advanceNextRound() {
    gameState.currentQuestionIndex++;
    if (gameState.currentQuestionIndex >= gameState.totalQuestions) {
      showPodium();
    } else {
      showView('hostGameView');
      startQuestionRound();
    }
  }

  // ==================== HOST: BỤC VINH QUANG PODIUM ====================
  function showPodium() {
    gameState.status = 'podium';
    showView('hostPodiumView');

    var sorted = gameState.players.slice().sort(function (a, b) {
      return b.score - a.score;
    });

    var p1 = sorted[0] || { name: '--', score: 0, avatar: '🥇' };
    var p2 = sorted[1] || { name: '--', score: 0, avatar: '🥈' };
    var p3 = sorted[2] || { name: '--', score: 0, avatar: '🥉' };

    var n1 = document.getElementById('podiumName1');
    var s1 = document.getElementById('podiumScore1');
    var n2 = document.getElementById('podiumName2');
    var s2 = document.getElementById('podiumScore2');
    var n3 = document.getElementById('podiumName3');
    var s3 = document.getElementById('podiumScore3');

    if (n1) n1.textContent = p1.avatar + ' ' + p1.name;
    if (s1) s1.textContent = p1.score.toLocaleString() + ' đ';
    if (n2) n2.textContent = p2.avatar + ' ' + p2.name;
    if (s2) s2.textContent = p2.score.toLocaleString() + ' đ';
    if (n3) n3.textContent = p3.avatar + ' ' + p3.name;
    if (s3) s3.textContent = p3.score.toLocaleString() + ' đ';

    SFX.fanfare();

    // Bắn pháo hoa Confetti chúc mừng
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
      setTimeout(function () {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 60,
          origin: { x: 0.1, y: 0.7 }
        });
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 60,
          origin: { x: 0.9, y: 0.7 }
        });
      }, 500);
    }

    broadcastMsg('game_over', {
      top3: sorted.slice(0, 3)
    });
  }

  // ==================== PLAYER: THAM GIA PHÒNG ====================
  function playerJoin() {
    var pinInput = document.getElementById('playerInputPin');
    var nameInput = document.getElementById('playerInputName');
    var pin = (pinInput ? pinInput.value : '').trim();
    var name = (nameInput ? nameInput.value : '').trim();

    if (!pin) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập mã PIN phòng!', 'warning');
      return;
    }
    if (!name) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập tên của bạn!', 'warning');
      return;
    }

    // Lưu lại tên & avatar cho lần sau
    localStorage.setItem('wq_arena_player_name', name);
    localStorage.setItem('wq_arena_player_avatar', gameState.playerProfile.avatar);

    gameState.playerProfile.name = name;
    gameState.pin = pin;

    // Hiển thị phòng chờ của Player
    var avatarEl = document.getElementById('playerWaitingAvatar');
    var nameEl = document.getElementById('playerWaitingName');
    if (avatarEl) avatarEl.textContent = gameState.playerProfile.avatar;
    if (nameEl) nameEl.textContent = name;

    showView('playerLobbyView');
    SFX.pop();

    // Gửi thông điệp tham gia tới Host
    var myPlayerId = 'player_' + Date.now();
    gameState.myPlayerId = myPlayerId;

    broadcastMsg('player_join', {
      id: myPlayerId,
      name: name,
      avatar: gameState.playerProfile.avatar,
      pin: pin
    });

    if (typeof showToast === 'function') {
      showToast('Đã vào phòng PIN: ' + pin + '! Hãy chờ chủ phòng bắt đầu nhé.', 'success');
    }
  }

  // Player bấm chọn 1 trong 4 khối màu
  function playerSubmitAnswer(choiceIndex) {
    var padGrid = document.getElementById('playerPadGrid');
    var submittedState = document.getElementById('playerSubmittedState');
    if (padGrid) padGrid.style.display = 'none';
    if (submittedState) submittedState.style.display = 'flex';

    SFX.tick();

    broadcastMsg('player_answer', {
      playerId: gameState.myPlayerId,
      answerIndex: choiceIndex,
      pin: gameState.pin
    });
  }

  // ==================== CROSS-TAB / MULTI-DEVICE SYNC ====================
  function setupCrossTabSync() {
    function handleSync(data) {
      if (!data || !data.action) return;
      var action = data.action;
      var p = data.payload;

      // 1. Host nhận được người chơi tham gia
      if (action === 'player_join' && gameState.role === 'host' && gameState.status === 'lobby') {
        if (p.pin === gameState.pin) {
          var exists = gameState.players.some(function (x) { return x.id === p.id; });
          if (!exists) {
            gameState.players.push({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              score: 0,
              streak: 0,
              lastAnswerIndex: -1,
              answeredAt: 0,
              isBot: false
            });
            SFX.pop();
            renderPlayerList();
          }
        }
      }

      // 2. Host nhận câu trả lời từ Player
      if (action === 'player_answer' && gameState.role === 'host' && gameState.status === 'question') {
        if (p.pin === gameState.pin) {
          recordPlayerAnswer(p.playerId, p.answerIndex);
        }
      }

      // 3. Player nhận thông báo Bắt đầu trận đấu
      if (action === 'game_start' && gameState.role === 'player') {
        showView('playerGameView');
      }

      // 4. Player nhận câu hỏi mới
      if (action === 'new_question' && gameState.role === 'player') {
        showView('playerGameView');
        var padGrid = document.getElementById('playerPadGrid');
        var submittedState = document.getElementById('playerSubmittedState');
        var resultOverlay = document.getElementById('playerResultOverlay');

        if (padGrid) padGrid.style.display = 'grid';
        if (submittedState) submittedState.style.display = 'none';
        if (resultOverlay) resultOverlay.style.display = 'none';
      }

      // 5. Player nhận kết quả câu hỏi
      if (action === 'question_result' && gameState.role === 'player') {
        var padGrid2 = document.getElementById('playerPadGrid');
        var submitted2 = document.getElementById('playerSubmittedState');
        var resultOverlay2 = document.getElementById('playerResultOverlay');
        var resultIcon = document.getElementById('playerResultIcon');
        var resultText = document.getElementById('playerResultText');
        var scorePlus = document.getElementById('playerScorePlus');
        var curScoreEl = document.getElementById('playerCurrentScore');

        if (padGrid2) padGrid2.style.display = 'none';
        if (submitted2) submitted2.style.display = 'none';
        if (resultOverlay2) resultOverlay2.style.display = 'flex';

        var myScoreObj = (p.scores || []).find(function (x) { return x.id === gameState.myPlayerId; });
        if (myScoreObj) {
          if (curScoreEl) curScoreEl.textContent = myScoreObj.score.toLocaleString();
          if (myScoreObj.lastEarned > 0) {
            if (resultIcon) resultIcon.textContent = '🎉';
            if (resultText) resultText.textContent = 'Chính xác!';
            if (scorePlus) scorePlus.textContent = '+' + myScoreObj.lastEarned + ' điểm';
            SFX.correct();
          } else {
            if (resultIcon) resultIcon.textContent = '😢';
            if (resultText) resultText.textContent = 'Chưa đúng!';
            if (scorePlus) scorePlus.textContent = '+0 điểm';
            SFX.wrong();
          }
        }
      }

      // 6. Player nhận kết thúc game
      if (action === 'game_over' && gameState.role === 'player') {
        if (typeof confetti === 'function') confetti();
      }
    }

    if (_arenaChannel) {
      _arenaChannel.onmessage = function (ev) {
        handleSync(ev.data);
      };
    }

    window.addEventListener('storage', function (e) {
      if (e.key === 'wq_arena_sync' && e.newValue) {
        try {
          var syncData = JSON.parse(e.newValue);
          handleSync(syncData);
        } catch (err) { }
      }
    });
  }

  // ==================== BIND EVENTS ====================
  function bindEvents() {
    // Tabs role
    var tabHostBtn = document.getElementById('tabHostBtn');
    if (tabHostBtn) tabHostBtn.onclick = function () { switchRoleTab('host'); };

    var tabPlayerBtn = document.getElementById('tabPlayerBtn');
    if (tabPlayerBtn) tabPlayerBtn.onclick = function () { switchRoleTab('player'); };

    // Host Config
    var btnCreateRoom = document.getElementById('btnCreateRoom');
    if (btnCreateRoom) btnCreateRoom.onclick = createRoom;

    // Host Lobby
    var btnAddBot = document.getElementById('btnAddBot');
    if (btnAddBot) btnAddBot.onclick = addMockBot;

    var btnCancelRoom = document.getElementById('btnCancelRoom');
    if (btnCancelRoom) btnCancelRoom.onclick = function () {
      gameState.status = 'config';
      showView('hostConfigView');
    };

    var btnStartGame = document.getElementById('btnStartGame');
    if (btnStartGame) btnStartGame.onclick = startGame;

    var btnCopyJoinLink = document.getElementById('btnCopyJoinLink');
    if (btnCopyJoinLink) {
      btnCopyJoinLink.onclick = function () {
        var joinUrl = window.location.origin + window.location.pathname + '?pin=' + gameState.pin;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(joinUrl).then(function () {
            if (typeof showToast === 'function') showToast('Đã chép link phòng: ' + joinUrl, 'success');
          });
        }
      };
    }

    // Host Game Navigation
    var btnNextRound = document.getElementById('btnNextRound');
    if (btnNextRound) btnNextRound.onclick = showLeaderboard;

    var btnContinueGame = document.getElementById('btnContinueGame');
    if (btnContinueGame) btnContinueGame.onclick = advanceNextRound;

    var hostQAudioBtn = document.getElementById('hostQAudioBtn');
    if (hostQAudioBtn) {
      hostQAudioBtn.onclick = function () {
        var q = gameState.questions[gameState.currentQuestionIndex];
        if (q && q.hanziAudio && typeof speak === 'function') {
          speak(q.hanziAudio);
        }
      };
    }

    // Podium
    var btnPlayAgain = document.getElementById('btnPlayAgain');
    if (btnPlayAgain) {
      btnPlayAgain.onclick = function () {
        showView('hostConfigView');
        populateDeckOptions();
      };
    }

    var btnExitArena = document.getElementById('btnExitArena');
    if (btnExitArena) {
      btnExitArena.onclick = function () {
        window.location.href = '../index.html';
      };
    }

    // Player Join
    var btnPlayerJoin = document.getElementById('btnPlayerJoin');
    if (btnPlayerJoin) btnPlayerJoin.onclick = playerJoin;

    // Player Avatar Pick
    var avatarBtns = document.querySelectorAll('.avatar-btn');
    avatarBtns.forEach(function (btn) {
      btn.onclick = function () {
        avatarBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        gameState.playerProfile.avatar = btn.dataset.avatar;
      };
    });

    // Player 4 pads click
    var padBtns = document.querySelectorAll('.player-pad-btn');
    padBtns.forEach(function (btn) {
      btn.onclick = function () {
        var idx = parseInt(btn.dataset.index, 10);
        playerSubmitAnswer(idx);
      };
    });
  }

  // ==================== UTILS ====================
  function shuffleArray(arr) {
    if (!arr) return arr;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  // DOM Loaded
  document.addEventListener('DOMContentLoaded', initArena);

})();
