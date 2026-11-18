// ==================== ARENA.JS — Kahoot-Style Vocabulary Games ====================
// Runs on pages/arena.html.
// Supports 4 game modes (Speed, Listening, Sentence Rush, Survival 3 Lives),
// Solo Quick-Play with smart bots, Same-Device 2-Screen sync (BroadcastChannel + localStorage),
// and Cross-Device QR Code rooms with Deterministic Seeded Question Generation.

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
      _audioCtx.resume().catch(function () { });
    }
    return _audioCtx;
  }

  function playTone(freq, type, duration, delay, gainLevel) {
    try {
      var ctx = getAudioContext();
      if (!ctx) return;
      delay = delay || 0;
      gainLevel = gainLevel || 0.14;
      setTimeout(function () {
        try {
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
        } catch (e) { }
      }, delay * 1000);
    } catch (e) { }
  }

  var SFX = {
    pop: function () {
      playTone(587.33, 'sine', 0.09, 0, 0.16);
      playTone(880, 'sine', 0.11, 0.05, 0.16);
    },
    tick: function () {
      playTone(440, 'triangle', 0.035, 0, 0.05);
    },
    urgentTick: function () {
      playTone(880, 'sine', 0.06, 0, 0.12);
    },
    correct: function () {
      playTone(523.25, 'sine', 0.11, 0, 0.18);
      playTone(659.25, 'sine', 0.11, 0.07, 0.18);
      playTone(783.99, 'sine', 0.14, 0.14, 0.22);
      playTone(1046.50, 'sine', 0.3, 0.21, 0.25);
    },
    wrong: function () {
      playTone(280, 'sawtooth', 0.16, 0, 0.13);
      playTone(210, 'sawtooth', 0.25, 0.11, 0.16);
    },
    fanfare: function () {
      playTone(523.25, 'triangle', 0.14, 0, 0.22);
      playTone(659.25, 'triangle', 0.14, 0.14, 0.22);
      playTone(783.99, 'triangle', 0.18, 0.28, 0.26);
      playTone(1046.50, 'triangle', 0.45, 0.45, 0.3);
    }
  };

  // ==================== DETERMINISTIC SEEDED RANDOM ====================
  // Đảm bảo mọi thiết bị quét cùng mã QR (cùng mã PIN) đều sinh bộ câu hỏi giống hệt nhau!
  function createSeededRng(seedStr) {
    var seed = parseInt(String(seedStr || '123456').replace(/\D/g, ''), 10) || 123456;
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function shuffleWithRng(arr, rng) {
    var rand = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function cleanHanzi(h) {
    if (!h) return '';
    return String(h).split('|')[0].trim();
  }

  // ==================== CROSS-TAB REALTIME CHANNEL ====================
  var _arenaChannel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      _arenaChannel = new BroadcastChannel('hanyu_arena_channel');
    } catch (e) { }
  }

  function broadcastMsg(action, payload) {
    var msg = { action: action, payload: payload || {}, timestamp: Date.now() };
    if (_arenaChannel) {
      try { _arenaChannel.postMessage(msg); } catch (e) { }
    }
    try {
      localStorage.setItem('wq_arena_sync', JSON.stringify(msg));
    } catch (e) { }
  }

  // ==================== GAME STATE ====================
  var gameState = {
    role: 'host', // 'host' | 'player'
    pin: '',
    status: 'config', // 'config' | 'lobby' | 'countdown' | 'question' | 'round_end' | 'leaderboard' | 'podium'
    gameMode: 'speed', // 'speed' | 'listening' | 'sentence' | 'survival'
    deckValue: 'HSK 1',
    deckName: 'HSK 1',
    deckWords: [],
    questionType: 'hanzi_to_mean',
    totalQuestions: 10,
    timePerQuestion: 15,
    currentQuestionIndex: 0,
    questions: [],
    players: [], // [{ id, name, avatar, score, streak, lives, lastAnswerIndex, answeredAt, lastPointsEarned, isBot, isSelf }]
    timerInterval: null,
    botTimers: [],
    timerRemaining: 0,
    questionStartTime: 0,
    myPlayerId: 'host_self',
    hostConnectedToRoom: false,
    urlRoomParams: null,
    playerProfile: {
      name: 'Bạn',
      avatar: '🐼'
    }
  };

  var BOT_ROSTER = [
    { name: 'Tiểu Minh', avatar: '🐼', acc: 0.82 },
    { name: 'Hồng Hoa', avatar: '🦊', acc: 0.78 },
    { name: 'Tử Long', avatar: '🐉', acc: 0.86 },
    { name: 'Lan Lan', avatar: '🐰', acc: 0.74 },
    { name: 'Thanh Phong', avatar: '🐯', acc: 0.80 },
    { name: 'Bảo Bảo', avatar: '🐻', acc: 0.72 },
    { name: 'Cát Tường', avatar: '🦁', acc: 0.84 },
    { name: 'Ánh Nguyệt', avatar: '🐱', acc: 0.76 }
  ];

  var GAMEMODE_NAMES = {
    speed: '⚡ Phản Xạ Tốc Độ',
    listening: '🎧 Thính Âm Đoán Chữ',
    sentence: '🧩 Đấu Trường Điền Câu',
    survival: '❤️ Sinh Tồn 3 Mạng'
  };

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
    // Ẩn thanh chuyển tab Chủ phòng / Người chơi khi đang ở trong trận đấu để tránh bấm nhầm mất trận
    var roleTabs = document.getElementById('arenaRoleTabs');
    if (roleTabs) {
      var inActiveMatch = (viewId === 'hostGameView' || viewId === 'hostLeaderboardView' || viewId === 'hostPodiumView' || viewId === 'playerGameView');
      roleTabs.style.display = inActiveMatch ? 'none' : 'flex';
    }
  }

  // ==================== INIT ARENA ====================
  function initArena() {
    loadSavedPlayerProfile();
    populateDeckOptions();
    bindEvents();
    setupCrossTabSync();
    checkUrlParams();

    // Nếu DATA tải thêm từ API sau vài trăm ms, cập nhật lại danh sách bộ từ
    setTimeout(function () {
      if (gameState.status === 'config') {
        populateDeckOptions();
      }
    }, 900);
  }

  function loadSavedPlayerProfile() {
    var savedName = localStorage.getItem('wq_arena_player_name') || 'Bạn';
    var savedAvatar = localStorage.getItem('wq_arena_player_avatar') || '🐼';
    gameState.playerProfile.name = savedName;
    gameState.playerProfile.avatar = savedAvatar;

    syncProfileInputs();
  }

  function savePlayerProfile(name, avatar) {
    if (name && name.trim()) {
      gameState.playerProfile.name = name.trim();
      localStorage.setItem('wq_arena_player_name', gameState.playerProfile.name);
    }
    if (avatar) {
      gameState.playerProfile.avatar = avatar;
      localStorage.setItem('wq_arena_player_avatar', avatar);
    }
    syncProfileInputs();
  }

  function syncProfileInputs() {
    var name = gameState.playerProfile.name || 'Bạn';
    var avatar = gameState.playerProfile.avatar || '🐼';

    var hostNameInput = document.getElementById('hostPlayerNameInput');
    if (hostNameInput && document.activeElement !== hostNameInput) {
      hostNameInput.value = name;
    }

    var playerNameInput = document.getElementById('playerInputName');
    if (playerNameInput && document.activeElement !== playerNameInput) {
      playerNameInput.value = name === 'Bạn' ? '' : name;
    }

    var hostAvatarPreview = document.getElementById('hostAvatarPreview');
    if (hostAvatarPreview) hostAvatarPreview.textContent = avatar;

    document.querySelectorAll('.mini-avatar-btn, .avatar-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.avatar === avatar);
    });
  }

  function populateDeckOptions() {
    var select = document.getElementById('hostDeckSelect');
    if (!select) return;
    var previousVal = select.value;
    select.innerHTML = '';

    // 1. Kiểm tra nếu vừa bấm chuyển sang từ trang Tự tạo (wq_pending_deck)
    var hasPendingCustom = false;
    try {
      var pendingStr = localStorage.getItem('wq_pending_deck');
      if (pendingStr) {
        var pending = JSON.parse(pendingStr);
        if (pending && Array.isArray(pending.words) && pending.words.length >= 4) {
          var optPending = document.createElement('option');
          optPending.value = 'pending_custom';
          optPending.textContent = '📦 ' + (pending.name || 'Bộ từ đang chọn') + ' (' + pending.words.length + ' từ)';
          select.appendChild(optPending);
          hasPendingCustom = true;
        }
      }
    } catch (e) { }

    // 2. Các cấp độ HSK từ DATA
    if (typeof DATA !== 'undefined') {
      Object.keys(DATA).forEach(function (lvl) {
        if (lvl === 'custom') return;
        var count = DATA[lvl] ? DATA[lvl].length : 0;
        if (count >= 4) {
          var opt = document.createElement('option');
          opt.value = lvl;
          opt.textContent = lvl + ' (' + count + ' từ)';
          select.appendChild(opt);
        }
      });
    }

    // 3. Các bộ từ tự tạo đã lưu
    try {
      var customDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
      if (Array.isArray(customDecks) && customDecks.length > 0) {
        var optGroup = document.createElement('optgroup');
        optGroup.label = 'Bộ từ tự tạo đã lưu';
        customDecks.forEach(function (cd) {
          var count = cd.words ? cd.words.length : 0;
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

    // 4. Từ vựng Yêu thích
    try {
      var favs = JSON.parse(localStorage.getItem('wq_favorites')) || [];
      if (Array.isArray(favs) && favs.length >= 4) {
        var optFav = document.createElement('option');
        optFav.value = 'favorites';
        optFav.textContent = '⭐ Từ yêu thích (' + favs.length + ' từ)';
        select.appendChild(optFav);
      }
    } catch (e) { }

    if (hasPendingCustom && localStorage.getItem('wq_pending_mode') === 'arena') {
      select.value = 'pending_custom';
      localStorage.removeItem('wq_pending_mode');
    } else if (previousVal && Array.from(select.options).some(function (o) { return o.value === previousVal; })) {
      select.value = previousVal;
    }
  }

  function checkUrlParams() {
    var urlParams = new URLSearchParams(window.location.search);
    var pinParam = urlParams.get('pin');
    if (pinParam) {
      gameState.urlRoomParams = {
        pin: pinParam.replace(/\D/g, ''),
        gm: urlParams.get('gm') || 'speed',
        d: urlParams.get('d') || 'HSK 1',
        q: parseInt(urlParams.get('q') || '10', 10) || 10,
        t: parseInt(urlParams.get('t') || '15', 10) || 15,
        qt: urlParams.get('qt') || 'hanzi_to_mean'
      };
      switchRoleTab('player');
      var pinInput = document.getElementById('playerInputPin');
      if (pinInput) pinInput.value = gameState.urlRoomParams.pin;

      var badge = document.getElementById('playerJoinRoomBadge');
      var sub = document.getElementById('playerJoinRoomSub');
      if (badge) badge.textContent = 'Phòng #' + gameState.urlRoomParams.pin + ' • ' + (GAMEMODE_NAMES[gameState.urlRoomParams.gm] || 'Kahoot');
      if (sub) sub.textContent = 'Bộ đề: ' + gameState.urlRoomParams.d + ' (' + gameState.urlRoomParams.q + ' câu • ' + gameState.urlRoomParams.t + 's/câu)';
    }
  }

  function switchRoleTab(role) {
    gameState.role = role;
    var tabHostBtn = document.getElementById('tabHostBtn');
    var tabPlayerBtn = document.getElementById('tabPlayerBtn');

    if (role === 'host') {
      if (tabHostBtn) tabHostBtn.classList.add('active');
      if (tabPlayerBtn) tabPlayerBtn.classList.remove('active');
      if (gameState.status === 'lobby') {
        showView('hostLobbyView');
      } else {
        showView('hostConfigView');
      }
    } else {
      if (tabPlayerBtn) tabPlayerBtn.classList.add('active');
      if (tabHostBtn) tabHostBtn.classList.remove('active');
      showView('playerJoinView');
    }
  }

  // ==================== LẤY DỮ LIỆU TỪ VỰNG THEO BỘ ====================
  function getWordsFromDeckVal(deckVal) {
    if (!deckVal) return [];
    if (deckVal === 'pending_custom') {
      try {
        var pending = JSON.parse(localStorage.getItem('wq_pending_deck') || '{}');
        return Array.isArray(pending.words) ? pending.words : [];
      } catch (e) { return []; }
    }
    if (deckVal === 'favorites') {
      try {
        return JSON.parse(localStorage.getItem('wq_favorites') || '[]');
      } catch (e) { return []; }
    }
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
    if (typeof DATA !== 'undefined' && DATA['HSK 1']) {
      return DATA['HSK 1'];
    }
    return [];
  }

  // ==================== KHỞI TẠO CẤU HÌNH TRẬN ĐẤU ====================
  function prepareMatchConfig(customPin) {
    var hostNameInput = document.getElementById('hostPlayerNameInput');
    if (hostNameInput && hostNameInput.value.trim()) {
      savePlayerProfile(hostNameInput.value.trim(), gameState.playerProfile.avatar);
    }

    var deckSelect = document.getElementById('hostDeckSelect');
    var qTypeSelect = document.getElementById('hostQuestionType');
    var qCountSelect = document.getElementById('hostQuestionCount');
    var timeSelect = document.getElementById('hostTimePerQuestion');

    var deckVal = deckSelect ? deckSelect.value : 'HSK 1';
    var words = getWordsFromDeckVal(deckVal);

    if (!words || words.length < 4) {
      if (typeof showToast === 'function') {
        showToast('Bộ từ này cần ít nhất 4 từ vựng để tạo 4 đáp án Kahoot!', 'error');
      }
      return false;
    }

    gameState.deckValue = deckVal;
    gameState.deckWords = words;
    gameState.deckName = (deckSelect && deckSelect.options[deckSelect.selectedIndex])
      ? deckSelect.options[deckSelect.selectedIndex].text.replace(/\s*\(\d+\s*từ\)/, '')
      : deckVal;
    gameState.questionType = qTypeSelect ? qTypeSelect.value : 'hanzi_to_mean';
    gameState.totalQuestions = Math.min(parseInt(qCountSelect ? qCountSelect.value : '10', 10) || 10, words.length);
    gameState.timePerQuestion = gameState.gameMode === 'survival'
      ? Math.min(10, parseInt(timeSelect ? timeSelect.value : '8', 10) || 8)
      : (parseInt(timeSelect ? timeSelect.value : '15', 10) || 15);

    gameState.pin = customPin || String(Math.floor(100000 + Math.random() * 900000));
    gameState.myPlayerId = 'host_self';

    // Luôn thêm người chơi hiện tại vào danh sách đấu thủ để có thể bấm chọn trực tiếp
    gameState.players = [{
      id: 'host_self',
      name: gameState.playerProfile.name || 'Bạn',
      avatar: gameState.playerProfile.avatar || '🐼',
      score: 0,
      streak: 0,
      lives: 3,
      lastAnswerIndex: -1,
      answeredAt: 0,
      lastPointsEarned: 0,
      isBot: false,
      isSelf: true
    }];

    generateQuestions(gameState.pin);
    return true;
  }

  // ==================== CHƠI NGAY (SOLO + BẠN HỌC ẢO) ====================
  function startQuickPlay() {
    if (!prepareMatchConfig()) return;
    // Tự động thêm 3 bạn học ảo thông minh
    for (var i = 0; i < 3; i++) {
      addMockBot(true);
    }
    SFX.pop();
    startGame();
  }

  // ==================== TẠO PHÒNG QR / LOBBY ====================
  function createRoom() {
    if (!prepareMatchConfig()) return;
    gameState.status = 'lobby';
    renderLobby();
    showView('hostLobbyView');
    SFX.pop();

    broadcastMsg('room_created', {
      pin: gameState.pin,
      gameMode: gameState.gameMode,
      deckValue: gameState.deckValue,
      deckName: gameState.deckName,
      totalQuestions: gameState.totalQuestions,
      timePerQuestion: gameState.timePerQuestion,
      questionType: gameState.questionType
    });
  }

  // ==================== SINH BỘ CÂU HỎI ĐỒNG BỘ THEO SEED ====================
  function generateQuestions(seedPin) {
    var rng = createSeededRng(seedPin);
    var words = gameState.deckWords.slice().map(function (w) {
      return typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(w) : w;
    });
    shuffleWithRng(words, rng);

    var selectedWords = words.slice(0, gameState.totalQuestions);
    var mode = gameState.gameMode;

    gameState.questions = selectedWords.map(function (w, qIdx) {
      var cleanH = cleanHanzi(w.h);
      var qType = gameState.questionType;

      if (mode === 'listening') {
        qType = 'listening';
      } else if (mode === 'sentence') {
        qType = 'sentence_fill';
      } else if (qType === 'mixed') {
        var types = ['hanzi_to_mean', 'mean_to_hanzi', 'hanzi_to_pinyin'];
        qType = types[Math.floor(rng() * types.length)];
      }

      // Lấy 3 đáp án nhiễu từ các từ khác trong bộ
      var distractors = words.filter(function (other) { return cleanHanzi(other.h) !== cleanH; });
      shuffleWithRng(distractors, rng);
      var wrongPicks = distractors.slice(0, 3);

      var promptText = cleanH;
      var promptSub = w.p || '';
      var promptTypeDesc = 'Nhìn Hán tự ➔ Chọn nghĩa đúng';
      var correctAnswerText = w.m || '';

      if (qType === 'mean_to_hanzi') {
        promptText = w.m || '';
        promptSub = 'Chọn chữ Hán tương ứng';
        promptTypeDesc = 'Nhìn Nghĩa ➔ Chọn Hán tự đúng';
        correctAnswerText = cleanH + (w.p ? ' (' + w.p + ')' : '');
      } else if (qType === 'hanzi_to_pinyin') {
        promptText = cleanH;
        promptSub = w.m || '';
        promptTypeDesc = 'Nhìn Hán tự ➔ Chọn Pinyin đúng';
        correctAnswerText = w.p || '';
      } else if (qType === 'listening') {
        promptText = '🔊 Nghe phát âm';
        promptSub = 'Bấm biểu tượng loa ở góc phải nếu muốn nghe lại';
        promptTypeDesc = 'Thính Âm Đoán Chữ ➔ Chọn từ và nghĩa đúng';
        correctAnswerText = cleanH + ' — ' + (w.m || '');
      } else if (qType === 'sentence_fill') {
        var exSentence = w.ex || w.e || '';
        var exMeaning = w.exm || w.m || '';
        if (exSentence && exSentence.indexOf(cleanH) !== -1) {
          promptText = exSentence.replace(cleanH, ' [ ___ ] ');
          promptSub = exMeaning ? ('Nghĩa: ' + exMeaning) : (w.p || '');
          promptTypeDesc = 'Đấu Trường Điền Câu ➔ Chọn từ điền vào [ ___ ]';
          correctAnswerText = cleanH + (w.p ? ' (' + w.p + ')' : '');
        } else {
          // Fallback nếu từ chưa có câu chứa từ khóa
          promptText = '「 ___ 」 — ' + (w.m || '');
          promptSub = exSentence ? (exSentence + (exMeaning ? ' (' + exMeaning + ')' : '')) : ('Pinyin: ' + (w.p || ''));
          promptTypeDesc = 'Chọn Hán tự khớp với nghĩa và ngữ cảnh';
          correctAnswerText = cleanH;
        }
      }

      var answerOptions = [
        { text: correctAnswerText, isCorrect: true }
      ];

      wrongPicks.forEach(function (wp) {
        var wpH = cleanHanzi(wp.h);
        var wrongText = wp.m || '';
        if (qType === 'mean_to_hanzi') {
          wrongText = wpH + (wp.p ? ' (' + wp.p + ')' : '');
        } else if (qType === 'hanzi_to_pinyin') {
          wrongText = wp.p || wpH;
        } else if (qType === 'listening') {
          wrongText = wpH + ' — ' + (wp.m || '');
        } else if (qType === 'sentence_fill') {
          wrongText = (promptText.indexOf('[ ___ ]') !== -1 && w.p)
            ? (wpH + (wp.p ? ' (' + wp.p + ')' : ''))
            : wpH;
        }
        answerOptions.push({ text: wrongText, isCorrect: false });
      });

      shuffleWithRng(answerOptions, rng);
      var correctIndex = answerOptions.findIndex(function (o) { return o.isCorrect; });

      return {
        id: qIdx + 1,
        type: qType,
        typeDesc: promptTypeDesc,
        prompt: promptText,
        subPrompt: promptSub,
        hanziAudio: (qType === 'sentence_fill' && (w.ex || w.e)) ? (w.ex || w.e) : cleanH,
        wordAudio: cleanH,
        options: answerOptions.map(function (o) { return o.text; }),
        correctIndex: correctIndex
      };
    });
  }

  // ==================== HIỂN THỊ PHÒNG CHỜ (LOBBY) ====================
  function buildRoomShareUrl() {
    var base = window.location.origin + window.location.pathname;
    var params = new URLSearchParams({
      pin: gameState.pin,
      gm: gameState.gameMode,
      d: gameState.deckValue,
      q: String(gameState.totalQuestions),
      t: String(gameState.timePerQuestion),
      qt: gameState.questionType
    });
    return base + '?' + params.toString();
  }

  function renderLobby() {
    var pinEl = document.getElementById('displayRoomPin');
    var deckInfoEl = document.getElementById('lobbyDeckInfo');
    if (pinEl) pinEl.textContent = formatPinCode(gameState.pin);
    if (deckInfoEl) {
      deckInfoEl.textContent = (GAMEMODE_NAMES[gameState.gameMode] || 'Kahoot') + ' • ' + gameState.deckName + ' • ' + gameState.totalQuestions + ' câu';
    }

    generateQrCode();
    renderPlayerList();
  }

  function formatPinCode(pin) {
    if (!pin) return '------';
    var s = String(pin);
    return s.slice(0, 3) + ' ' + s.slice(3);
  }

  function generateQrCode() {
    var qrBox = document.getElementById('lobbyQrBox');
    if (!qrBox) return;
    qrBox.innerHTML = '';

    var joinUrl = buildRoomShareUrl();

    // Ưu tiên 1: Thư viện QRCode.js (cdnjs qrcodejs)
    if (typeof window.QRCode === 'function') {
      try {
        new window.QRCode(qrBox, {
          text: joinUrl,
          width: 180,
          height: 180,
          colorDark: '#1b1916',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : 0
        });
        return;
      } catch (e) {
        qrBox.innerHTML = '';
      }
    }

    // Ưu tiên 2: Fallback ảnh QR sắc nét từ API chuẩn quốc tế
    var img = document.createElement('img');
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data=' + encodeURIComponent(joinUrl);
    img.alt = 'QR Code Phòng ' + gameState.pin;
    img.width = 180;
    img.height = 180;
    img.style.borderRadius = '8px';
    img.style.display = 'block';
    qrBox.appendChild(img);
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
      startBtn.innerHTML = '<span>BẮT ĐẦU TRẬN ĐẤU (' + count + ' ĐẤU THỦ) ➔</span>';
    }

    if (count === 0) {
      listEl.innerHTML = '<div class="empty-lobby-text">Đang chờ người chơi vào phòng...</div>';
      return;
    }

    listEl.innerHTML = '';
    gameState.players.forEach(function (p) {
      var chip = document.createElement('div');
      chip.className = 'player-chip' + (p.isBot ? ' bot' : '') + (p.isSelf ? ' self' : '');
      chip.innerHTML =
        '<span class="player-chip-avatar">' + p.avatar + '</span>' +
        '<span class="player-chip-name">' + p.name + (p.isSelf ? ' (Bạn)' : '') + '</span>' +
        (p.isBot ? '<button type="button" class="chip-remove-btn" data-id="' + p.id + '" title="Xóa bot">×</button>' : '');
      listEl.appendChild(chip);
    });

    listEl.querySelectorAll('.chip-remove-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        gameState.players = gameState.players.filter(function (p) { return p.id !== id; });
        renderPlayerList();
      };
    });
  }

  function addMockBot(silent) {
    var available = BOT_ROSTER.filter(function (b) {
      return !gameState.players.some(function (p) { return p.name === b.name; });
    });
    if (available.length === 0) {
      if (!silent && typeof showToast === 'function') showToast('Đã thêm tối đa 8 bạn học ảo!', 'info');
      return;
    }

    var pick = available[Math.floor(Math.random() * available.length)];
    gameState.players.push({
      id: 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: pick.name,
      avatar: pick.avatar,
      acc: pick.acc || 0.78,
      score: 0,
      streak: 0,
      lives: 3,
      lastAnswerIndex: -1,
      answeredAt: 0,
      lastPointsEarned: 0,
      isBot: true,
      isSelf: false
    });

    if (!silent) {
      SFX.pop();
      renderPlayerList();
    }
  }

  // ==================== BẮT ĐẦU TRẬN ĐẤU ====================
  function startGame() {
    if (gameState.players.length === 0) return;

    // Nếu người chơi bấm Bắt đầu ngay từ Lobby mà mới chỉ có 1 mình, tự thêm 2 bạn học ảo để đua bảng xếp hạng thú vị hơn
    if (gameState.players.length === 1 && gameState.players[0].isSelf) {
      addMockBot(true);
      addMockBot(true);
    }

    gameState.currentQuestionIndex = 0;
    gameState.status = 'countdown';

    var overlay = document.getElementById('startCountdownOverlay');
    var numEl = document.getElementById('countdownNumber');
    var modeLbl = document.getElementById('countdownModeLabel');
    showView('hostGameView');

    if (modeLbl) {
      modeLbl.textContent = (GAMEMODE_NAMES[gameState.gameMode] || 'Đấu Trường Kahoot') + ' • Chuẩn bị!';
    }
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
    }, 850);

    broadcastMsg('game_start', {
      pin: gameState.pin,
      totalQuestions: gameState.totalQuestions
    });
  }

  function updateSelfTopbarBadge() {
    var me = gameState.players.find(function (p) { return p.id === gameState.myPlayerId; });
    var statsBadge = document.getElementById('hostMyStatsBadge');
    var livesBadge = document.getElementById('hostLivesBadge');

    if (me && statsBadge) {
      var streakStr = me.streak >= 2 ? (' • 🔥 ' + me.streak) : '';
      statsBadge.textContent = me.avatar + ' ' + me.score.toLocaleString() + ' đ' + streakStr;
    }

    if (livesBadge) {
      if (gameState.gameMode === 'survival' && me) {
        livesBadge.style.display = 'inline-flex';
        var hearts = '';
        for (var i = 0; i < 3; i++) {
          hearts += i < me.lives ? '❤️' : '🖤';
        }
        livesBadge.textContent = hearts;
      } else {
        livesBadge.style.display = 'none';
      }
    }
  }

  // ==================== BẮT ĐẦU 1 CÂU HỎI ====================
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

    clearBotTimers();
    gameState.players.forEach(function (p) {
      p.lastAnswerIndex = -1;
      p.answeredAt = 0;
      p.lastPointsEarned = 0;
    });

    var qCounterEl = document.getElementById('hostQCounter');
    var qTypeBadge = document.getElementById('hostQTypeBadge');
    var qTextEl = document.getElementById('hostQuestionText');
    var qSubEl = document.getElementById('hostQuestionSub');
    var timerSecEl = document.getElementById('hostTimerSec');
    var timerBadge = document.getElementById('hostTimerBadge');
    var answeredCountEl = document.getElementById('answeredCount');
    var totalPlayingEl = document.getElementById('totalPlayersPlaying');
    var hostFooter = document.getElementById('gameHostFooter');
    var progressBar = document.getElementById('hostTimeProgressBar');

    if (qCounterEl) qCounterEl.textContent = 'Câu ' + (qIdx + 1) + ' / ' + gameState.totalQuestions;
    if (qTypeBadge) qTypeBadge.textContent = q.typeDesc;
    if (qTextEl) qTextEl.textContent = q.prompt;
    if (qSubEl) qSubEl.textContent = q.subPrompt || '';
    if (timerSecEl) timerSecEl.textContent = gameState.timerRemaining;
    if (timerBadge) timerBadge.classList.remove('urgent');
    if (answeredCountEl) answeredCountEl.textContent = '0';
    if (totalPlayingEl) totalPlayingEl.textContent = getActivePlayers().length;
    if (hostFooter) hostFooter.style.display = 'none';
    if (progressBar) progressBar.style.width = '100%';

    updateSelfTopbarBadge();

    for (var i = 0; i < 4; i++) {
      var ansTextEl = document.getElementById('hostAns' + i);
      var cardEl = document.querySelector('.k-ans-card[data-index="' + i + '"]');
      if (ansTextEl) ansTextEl.textContent = q.options[i] || '';
      if (cardEl) {
        cardEl.classList.remove('k-correct', 'k-wrong', 'k-selected', 'correct', 'faded');
        cardEl.disabled = false;
      }
    }

    // Tự động phát âm tiếng Trung
    if (q.hanziAudio && typeof speak === 'function') {
      setTimeout(function () { speak(q.hanziAudio); }, 250);
    }

    clearInterval(gameState.timerInterval);
    gameState.timerInterval = setInterval(function () {
      gameState.timerRemaining--;
      if (timerSecEl) timerSecEl.textContent = Math.max(0, gameState.timerRemaining);

      var pct = (gameState.timerRemaining / gameState.timePerQuestion) * 100;
      if (progressBar) progressBar.style.width = Math.max(0, pct) + '%';

      if (gameState.timerRemaining <= 5 && gameState.timerRemaining > 0) {
        if (timerBadge) timerBadge.classList.add('urgent');
        SFX.urgentTick();
      } else if (gameState.timerRemaining > 5) {
        SFX.tick();
      }

      if (gameState.timerRemaining <= 0) {
        clearInterval(gameState.timerInterval);
        endQuestionRound();
      }
    }, 1000);

    runBotSimulation(q);

    broadcastMsg('new_question', {
      pin: gameState.pin,
      questionIndex: qIdx,
      totalQuestions: gameState.totalQuestions,
      time: gameState.timePerQuestion,
      prompt: q.prompt,
      subPrompt: q.subPrompt,
      options: q.options
    });
  }

  function getActivePlayers() {
    if (gameState.gameMode === 'survival') {
      return gameState.players.filter(function (p) { return p.lives > 0; });
    }
    return gameState.players;
  }

  function clearBotTimers() {
    if (gameState.botTimers && gameState.botTimers.length) {
      gameState.botTimers.forEach(function (t) { clearTimeout(t); });
    }
    gameState.botTimers = [];
  }

  function runBotSimulation(q) {
    clearBotTimers();
    getActivePlayers().forEach(function (p) {
      if (!p.isBot) return;
      var maxDelay = Math.max(2500, (gameState.timePerQuestion - 2) * 1000);
      var delay = 1400 + Math.random() * (maxDelay - 1400);
      var t = setTimeout(function () {
        if (gameState.status !== 'question') return;
        var acc = p.acc || 0.78;
        var isCorrect = Math.random() < acc;
        var chosenIndex = isCorrect ? q.correctIndex : (q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;
        recordPlayerAnswer(p.id, chosenIndex);
      }, delay);
      gameState.botTimers.push(t);
    });
  }

  // Khi người chơi chính (Host/Self) bấm chọn 1 trong 4 đáp án trên màn hình chính
  function handleHostCardClick(choiceIndex) {
    if (gameState.status !== 'question') return;
    var me = gameState.players.find(function (p) { return p.id === gameState.myPlayerId; });
    if (!me || me.lastAnswerIndex !== -1) return;
    if (gameState.gameMode === 'survival' && me.lives <= 0) {
      if (typeof showToast === 'function') showToast('Bạn đã hết tim ❤️! Hãy quan sát các đấu thủ còn lại.', 'warning');
      return;
    }

    var clickedCard = document.querySelector('.k-ans-card[data-index="' + choiceIndex + '"]');
    if (clickedCard) clickedCard.classList.add('k-selected');

    SFX.pop();
    recordPlayerAnswer(me.id, choiceIndex);

    // Nếu người chơi thật đã chọn xong mà chỉ còn các bot chưa chọn -> Cho các bot hoàn thành nhanh sau 350ms để không phải đợi lâu!
    var remainingHumans = getActivePlayers().filter(function (p) {
      return !p.isBot && p.lastAnswerIndex === -1;
    });
    if (remainingHumans.length === 0 && gameState.status === 'question') {
      clearBotTimers();
      var q = gameState.questions[gameState.currentQuestionIndex];
      setTimeout(function () {
        if (gameState.status !== 'question') return;
        getActivePlayers().forEach(function (p) {
          if (p.isBot && p.lastAnswerIndex === -1) {
            var isCorrect = Math.random() < (p.acc || 0.78);
            var idx = isCorrect ? q.correctIndex : (q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;
            recordPlayerAnswer(p.id, idx);
          }
        });
      }, 350);
    }
  }

  function recordPlayerAnswer(playerId, answerIndex) {
    var p = gameState.players.find(function (x) { return x.id === playerId; });
    if (!p || p.lastAnswerIndex !== -1 || gameState.status !== 'question') return;

    p.lastAnswerIndex = answerIndex;
    p.answeredAt = Date.now();

    var q = gameState.questions[gameState.currentQuestionIndex];
    if (answerIndex === q.correctIndex) {
      var timeUsed = Math.max(0.2, (p.answeredAt - gameState.questionStartTime) / 1000);
      var speedRatio = Math.max(0.15, 1 - (timeUsed / gameState.timePerQuestion) * 0.55);
      var basePoints = Math.round(1000 * speedRatio);
      var streakBonus = Math.min(300, p.streak * 60);
      var totalPoints = basePoints + streakBonus;

      p.score += totalPoints;
      p.streak++;
      p.lastPointsEarned = totalPoints;
    } else {
      p.streak = 0;
      p.lastPointsEarned = 0;
    }

    var activeList = getActivePlayers();
    var answeredCount = activeList.filter(function (x) { return x.lastAnswerIndex !== -1; }).length;
    var answeredEl = document.getElementById('answeredCount');
    if (answeredEl) answeredEl.textContent = answeredCount;

    if (answeredCount >= activeList.length) {
      clearInterval(gameState.timerInterval);
      clearBotTimers();
      endQuestionRound();
    }
  }

  // ==================== KẾT THÚC CÂU HỎI & HIỆN ĐÁP ÁN ====================
  function endQuestionRound() {
    if (gameState.status === 'round_end') return;
    gameState.status = 'round_end';
    clearInterval(gameState.timerInterval);
    clearBotTimers();

    var q = gameState.questions[gameState.currentQuestionIndex];
    var correctIdx = q.correctIndex;

    // Trong chế độ Sinh tồn (Survival), ai trả lời sai hoặc chưa trả lời bị trừ 1 tim
    if (gameState.gameMode === 'survival') {
      gameState.players.forEach(function (p) {
        if (p.lives > 0 && p.lastAnswerIndex !== correctIdx) {
          p.lives = Math.max(0, p.lives - 1);
          p.streak = 0;
        }
      });
    }

    for (var i = 0; i < 4; i++) {
      var cardEl = document.querySelector('.k-ans-card[data-index="' + i + '"]');
      if (cardEl) {
        cardEl.disabled = true;
        if (i === correctIdx) {
          cardEl.classList.add('k-correct');
        } else {
          cardEl.classList.add('k-wrong');
        }
      }
    }

    var me = gameState.players.find(function (p) { return p.id === gameState.myPlayerId; });
    var feedbackBadge = document.getElementById('roundFeedbackBadge');
    var summaryEl = document.getElementById('roundSummaryText');
    var hostFooter = document.getElementById('gameHostFooter');
    var nextBtn = document.getElementById('btnNextRound');

    if (me) {
      if (me.lastAnswerIndex === correctIdx) {
        SFX.correct();
        if (feedbackBadge) {
          feedbackBadge.className = 'round-feedback-badge is-correct';
          feedbackBadge.textContent = '🎉 Chính xác! +' + (me.lastPointsEarned || 0) + ' điểm' + (me.streak >= 2 ? (' (Chuỗi 🔥 ' + me.streak + ')') : '');
        }
      } else {
        SFX.wrong();
        if (feedbackBadge) {
          feedbackBadge.className = 'round-feedback-badge is-wrong';
          feedbackBadge.textContent = me.lastAnswerIndex === -1 ? '⏰ Hết giờ!' : '✗ Chưa chính xác!';
        }
      }
    } else {
      SFX.correct();
    }

    updateSelfTopbarBadge();

    if (summaryEl) {
      summaryEl.textContent = 'Đáp án đúng: ' + q.options[correctIdx];
    }

    var isLastQuestion = gameState.currentQuestionIndex >= gameState.totalQuestions - 1;
    var alivePlayers = getActivePlayers();
    if (gameState.gameMode === 'survival' && alivePlayers.length <= 0) {
      isLastQuestion = true;
    }

    if (nextBtn) {
      nextBtn.innerHTML = isLastQuestion ? '<span>Xem Bục Vinh Quang 🏆</span>' : '<span>Câu tiếp theo ➔</span>';
    }

    if (hostFooter) hostFooter.style.display = 'flex';

    // Đọc phát âm từ chuẩn khi mở đáp án
    if (q.wordAudio && typeof speak === 'function') {
      speak(q.wordAudio);
    }

    var sortedScores = gameState.players.slice().sort(function (a, b) { return b.score - a.score; });
    broadcastMsg('question_result', {
      pin: gameState.pin,
      correctIndex: correctIdx,
      correctText: q.options[correctIdx],
      scores: sortedScores.map(function (p, idx) {
        return {
          id: p.id,
          name: p.name,
          score: p.score,
          streak: p.streak,
          rank: idx + 1,
          lastEarned: p.lastPointsEarned || 0
        };
      })
    });
  }

  // ==================== BẢNG XẾP HẠNG ====================
  function showLeaderboard() {
    gameState.status = 'leaderboard';
    showView('hostLeaderboardView');

    var sorted = gameState.players.slice().sort(function (a, b) {
      return b.score - a.score;
    });

    var listEl = document.getElementById('hostLeaderboardList');
    var titleEl = document.getElementById('leaderboardRoundTitle');
    var continueBtn = document.getElementById('btnContinueGame');

    if (titleEl) {
      titleEl.textContent = 'Top Dẫn Đầu • Câu ' + (gameState.currentQuestionIndex + 1) + ' / ' + gameState.totalQuestions;
    }

    var isLast = gameState.currentQuestionIndex >= gameState.totalQuestions - 1 ||
      (gameState.gameMode === 'survival' && getActivePlayers().length === 0);

    if (continueBtn) {
      continueBtn.innerHTML = isLast ? '<span>Xem Bục Vinh Quang 🏆</span>' : '<span>Câu hỏi tiếp theo ➔</span>';
    }

    if (listEl) {
      listEl.innerHTML = '';
      sorted.slice(0, 6).forEach(function (p, idx) {
        var rank = idx + 1;
        var row = document.createElement('div');
        row.className = 'leaderboard-row' + (rank <= 3 ? (' top-' + rank) : '') + (p.isSelf ? ' is-self' : '');
        var heartsInfo = '';
        if (gameState.gameMode === 'survival') {
          heartsInfo = ' <span class="lb-hearts">' + ('❤️'.repeat(p.lives) + '🖤'.repeat(Math.max(0, 3 - p.lives))) + '</span>';
        }
        row.innerHTML =
          '<div class="lb-rank">#' + rank + '</div>' +
          '<div class="lb-avatar">' + p.avatar + '</div>' +
          '<div class="lb-name">' + p.name + (p.isSelf ? ' (Bạn)' : '') +
          (p.streak >= 2 ? ' <span class="lb-streak">🔥' + p.streak + '</span>' : '') +
          heartsInfo + '</div>' +
          '<div class="lb-score">' + p.score.toLocaleString() + ' đ</div>';
        listEl.appendChild(row);
      });
    }

    SFX.pop();
  }

  function advanceNextRound() {
    var alive = getActivePlayers();
    gameState.currentQuestionIndex++;
    if (gameState.currentQuestionIndex >= gameState.totalQuestions || (gameState.gameMode === 'survival' && alive.length === 0)) {
      showPodium();
    } else {
      showView('hostGameView');
      startQuestionRound();
    }
  }

  // ==================== BỤC VINH QUANG PODIUM ====================
  function showPodium() {
    gameState.status = 'podium';
    showView('hostPodiumView');

    var sorted = gameState.players.slice().sort(function (a, b) {
      return b.score - a.score;
    });

    var p1 = sorted[0] || { name: '--', score: 0, avatar: '🥇' };
    var p2 = sorted[1] || { name: '--', score: 0, avatar: '🥈' };
    var p3 = sorted[2] || { name: '--', score: 0, avatar: '🥉' };

    var a1 = document.getElementById('podiumAvatar1');
    var n1 = document.getElementById('podiumName1');
    var s1 = document.getElementById('podiumScore1');

    var a2 = document.getElementById('podiumAvatar2');
    var n2 = document.getElementById('podiumName2');
    var s2 = document.getElementById('podiumScore2');

    var a3 = document.getElementById('podiumAvatar3');
    var n3 = document.getElementById('podiumName3');
    var s3 = document.getElementById('podiumScore3');

    if (a1) a1.textContent = p1.avatar || '🥇';
    if (n1) n1.textContent = p1.name + (p1.isSelf ? ' (Bạn)' : '');
    if (s1) s1.textContent = p1.score.toLocaleString() + ' đ';

    if (a2) a2.textContent = p2.avatar || '🥈';
    if (n2) n2.textContent = p2.name + (p2.isSelf ? ' (Bạn)' : '');
    if (s2) s2.textContent = p2.score.toLocaleString() + ' đ';

    if (a3) a3.textContent = p3.avatar || '🥉';
    if (n3) n3.textContent = p3.name + (p3.isSelf ? ' (Bạn)' : '');
    if (s3) s3.textContent = p3.score.toLocaleString() + ' đ';

    var myRank = sorted.findIndex(function (p) { return p.id === gameState.myPlayerId; }) + 1;
    var subText = document.getElementById('podiumSubtitleText');
    if (subText && myRank > 0) {
      var me = sorted[myRank - 1];
      subText.textContent = 'Bạn đạt Hạng #' + myRank + ' chung cuộc với ' + me.score.toLocaleString() + ' điểm!';
    }

    SFX.fanfare();

    if (typeof confetti === 'function') {
      try {
        confetti({ particleCount: 100, spread: 75, origin: { y: 0.6 } });
        setTimeout(function () {
          confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0.1, y: 0.65 } });
          confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 0.9, y: 0.65 } });
        }, 450);
      } catch (e) { }
    }

    broadcastMsg('game_over', {
      pin: gameState.pin,
      top3: sorted.slice(0, 3)
    });
  }

  // ==================== PLAYER: GIA NHẬP PHÒNG ====================
  function playerJoin() {
    var pinInput = document.getElementById('playerInputPin');
    var nameInput = document.getElementById('playerInputName');
    var pin = (pinInput ? pinInput.value : '').replace(/\D/g, '').trim();
    var name = (nameInput ? nameInput.value : '').trim();

    if (!pin || pin.length < 4) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập mã PIN phòng (6 chữ số)!', 'warning');
      return;
    }
    if (!name) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập biệt danh của bạn!', 'warning');
      return;
    }

    savePlayerProfile(name, gameState.playerProfile.avatar);
    gameState.pin = pin;
    gameState.myPlayerId = 'player_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    gameState.hostConnectedToRoom = false;

    var avatarEl = document.getElementById('playerWaitingAvatar');
    var nameEl = document.getElementById('playerWaitingName');
    var pinEl = document.getElementById('playerConnectedPin');
    if (avatarEl) avatarEl.textContent = gameState.playerProfile.avatar;
    if (nameEl) nameEl.textContent = name;
    if (pinEl) pinEl.textContent = formatPinCode(pin);

    showView('playerLobbyView');
    SFX.pop();

    // Gửi tín hiệu tham gia tới Host tab (nếu đang mở trên cùng máy)
    broadcastMsg('player_join', {
      id: gameState.myPlayerId,
      name: name,
      avatar: gameState.playerProfile.avatar,
      pin: pin
    });
  }

  // Khi người chơi quét mã QR trên điện thoại rời (không cùng trình duyệt với máy chiếu)
  // Bấm nút này sẽ khởi chạy trực tiếp bộ đề đồng bộ theo mã PIN ngay trên điện thoại!
  function startStandalonePhoneMatch() {
    var params = gameState.urlRoomParams || {
      pin: gameState.pin || '123456',
      gm: 'speed',
      d: 'HSK 1',
      q: 10,
      t: 15,
      qt: 'hanzi_to_mean'
    };

    gameState.role = 'host';
    gameState.gameMode = params.gm || 'speed';
    gameState.deckValue = params.d || 'HSK 1';
    gameState.deckWords = getWordsFromDeckVal(gameState.deckValue);
    if (!gameState.deckWords || gameState.deckWords.length < 4) {
      gameState.deckValue = 'HSK 1';
      gameState.deckWords = getWordsFromDeckVal('HSK 1');
    }
    gameState.deckName = gameState.deckValue;
    gameState.questionType = params.qt || 'hanzi_to_mean';
    gameState.totalQuestions = Math.min(params.q || 10, gameState.deckWords.length);
    gameState.timePerQuestion = params.t || 15;
    gameState.pin = params.pin || gameState.pin;
    gameState.myPlayerId = 'host_self';

    gameState.players = [{
      id: 'host_self',
      name: gameState.playerProfile.name || 'Bạn',
      avatar: gameState.playerProfile.avatar || '🐼',
      score: 0,
      streak: 0,
      lives: 3,
      lastAnswerIndex: -1,
      answeredAt: 0,
      lastPointsEarned: 0,
      isBot: false,
      isSelf: true
    }];

    for (var i = 0; i < 3; i++) {
      addMockBot(true);
    }

    generateQuestions(gameState.pin);
    startGame();
  }

  function playerSubmitAnswer(choiceIndex) {
    var padGrid = document.getElementById('playerPadGrid');
    var submittedState = document.getElementById('playerSubmittedState');
    if (padGrid) padGrid.style.display = 'none';
    if (submittedState) submittedState.style.display = 'block';

    SFX.pop();

    broadcastMsg('player_answer', {
      playerId: gameState.myPlayerId,
      answerIndex: choiceIndex,
      pin: gameState.pin
    });
  }

  // ==================== ĐỒNG BỘ 2 MÀN HÌNH ====================
  function setupCrossTabSync() {
    function handleSync(data) {
      if (!data || !data.action) return;
      var action = data.action;
      var p = data.payload || {};

      // 1. Host nhận người chơi mới vào phòng
      if (action === 'player_join' && gameState.role === 'host' && gameState.status === 'lobby') {
        if (String(p.pin) === String(gameState.pin)) {
          var exists = gameState.players.some(function (x) { return x.id === p.id; });
          if (!exists) {
            gameState.players.push({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              score: 0,
              streak: 0,
              lives: 3,
              lastAnswerIndex: -1,
              answeredAt: 0,
              lastPointsEarned: 0,
              isBot: false,
              isSelf: false
            });
            SFX.pop();
            renderPlayerList();
            if (typeof showToast === 'function') {
              showToast(p.avatar + ' ' + p.name + ' vừa tham gia phòng!', 'success');
            }
          }
          broadcastMsg('host_ack_join', { pin: gameState.pin, playerId: p.id });
        }
      }

      if (action === 'host_ack_join' && gameState.role === 'player' && String(p.pin) === String(gameState.pin)) {
        gameState.hostConnectedToRoom = true;
      }

      // 2. Host nhận câu trả lời từ tab Player
      if (action === 'player_answer' && gameState.role === 'host' && gameState.status === 'question') {
        if (String(p.pin) === String(gameState.pin)) {
          recordPlayerAnswer(p.playerId, p.answerIndex);
        }
      }

      // 3. Player nhận lệnh bắt đầu trận đấu
      if (action === 'game_start' && gameState.role === 'player' && String(p.pin) === String(gameState.pin)) {
        showView('playerGameView');
      }

      // 4. Player nhận câu hỏi mới
      if (action === 'new_question' && gameState.role === 'player' && String(p.pin) === String(gameState.pin)) {
        showView('playerGameView');
        var padGrid = document.getElementById('playerPadGrid');
        var submittedState = document.getElementById('playerSubmittedState');
        var resultOverlay = document.getElementById('playerResultOverlay');
        var miniPrompt = document.getElementById('playerMiniPrompt');

        if (miniPrompt && p.prompt) {
          miniPrompt.textContent = 'Câu ' + (p.questionIndex + 1) + ': ' + p.prompt;
        }
        if (Array.isArray(p.options)) {
          for (var i = 0; i < 4; i++) {
            var lbl = document.getElementById('playerPadLabel' + i);
            if (lbl) lbl.textContent = p.options[i] || '';
          }
        }

        if (padGrid) padGrid.style.display = 'grid';
        if (submittedState) submittedState.style.display = 'none';
        if (resultOverlay) resultOverlay.style.display = 'none';
      }

      // 5. Player nhận kết quả câu hỏi
      if (action === 'question_result' && gameState.role === 'player' && String(p.pin) === String(gameState.pin)) {
        var padGrid2 = document.getElementById('playerPadGrid');
        var submitted2 = document.getElementById('playerSubmittedState');
        var resultOverlay2 = document.getElementById('playerResultOverlay');
        var resultIcon = document.getElementById('playerResultIcon');
        var resultText = document.getElementById('playerResultText');
        var scorePlus = document.getElementById('playerScorePlus');
        var rankStatus = document.getElementById('playerRankStatus');
        var curScoreEl = document.getElementById('playerCurrentScore');
        var streakTag = document.getElementById('playerStreakTag');

        if (padGrid2) padGrid2.style.display = 'none';
        if (submitted2) submitted2.style.display = 'none';
        if (resultOverlay2) resultOverlay2.style.display = 'block';

        var myScoreObj = (p.scores || []).find(function (x) { return x.id === gameState.myPlayerId; });
        if (myScoreObj) {
          if (curScoreEl) curScoreEl.textContent = myScoreObj.score.toLocaleString();
          if (streakTag) {
            if (myScoreObj.streak >= 2) {
              streakTag.style.display = 'inline-flex';
              streakTag.innerHTML = '🔥 <span>' + myScoreObj.streak + '</span>';
            } else {
              streakTag.style.display = 'none';
            }
          }
          if (rankStatus) {
            rankStatus.textContent = 'Đang xếp hạng #' + myScoreObj.rank + ' • Đáp án: ' + (p.correctText || '');
          }
          if (myScoreObj.lastEarned > 0) {
            if (resultIcon) resultIcon.textContent = '🎉';
            if (resultText) resultText.textContent = 'Chính xác!';
            if (scorePlus) {
              scorePlus.textContent = '+' + myScoreObj.lastEarned + ' điểm';
              scorePlus.style.color = '#10b981';
            }
            SFX.correct();
          } else {
            if (resultIcon) resultIcon.textContent = '😢';
            if (resultText) resultText.textContent = 'Chưa đúng!';
            if (scorePlus) {
              scorePlus.textContent = '+0 điểm';
              scorePlus.style.color = 'var(--text-muted)';
            }
            SFX.wrong();
          }
        }
      }

      // 6. Kết thúc trận đấu
      if (action === 'game_over' && gameState.role === 'player' && String(p.pin) === String(gameState.pin)) {
        if (typeof confetti === 'function') {
          try { confetti(); } catch (e) { }
        }
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

  // ==================== GẮN SỰ KIỆN GIAO DIỆN ====================
  function bindEvents() {
    var tabHostBtn = document.getElementById('tabHostBtn');
    if (tabHostBtn) tabHostBtn.onclick = function () { switchRoleTab('host'); };

    var tabPlayerBtn = document.getElementById('tabPlayerBtn');
    if (tabPlayerBtn) tabPlayerBtn.onclick = function () { switchRoleTab('player'); };

    // Chọn 4 chế độ Game Kahoot
    var gmCards = document.querySelectorAll('.arena-gamemode-card');
    gmCards.forEach(function (card) {
      card.onclick = function () {
        gmCards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        gameState.gameMode = card.dataset.gamemode || 'speed';
        SFX.tick();

        // Ẩn/hiện dropdown kiểu câu hỏi nếu chế độ game đã cố định dạng đề
        var qTypeGroup = document.getElementById('hostQTypeGroup');
        var timeSelect = document.getElementById('hostTimePerQuestion');
        if (qTypeGroup) {
          qTypeGroup.style.opacity = (gameState.gameMode === 'listening' || gameState.gameMode === 'sentence') ? '0.45' : '1';
        }
        if (gameState.gameMode === 'survival' && timeSelect) {
          timeSelect.value = '8';
        }
      };
    });

    // Hồ sơ nhanh trên màn hình Host
    var hostNameInput = document.getElementById('hostPlayerNameInput');
    if (hostNameInput) {
      hostNameInput.addEventListener('change', function () {
        savePlayerProfile(hostNameInput.value, gameState.playerProfile.avatar);
      });
    }

    document.querySelectorAll('.mini-avatar-btn').forEach(function (btn) {
      btn.onclick = function () {
        savePlayerProfile(hostNameInput ? hostNameInput.value : gameState.playerProfile.name, btn.dataset.avatar);
        SFX.tick();
      };
    });

    // Nút Đấu ngay & Mở phòng QR
    var btnQuickPlay = document.getElementById('btnQuickPlay');
    if (btnQuickPlay) btnQuickPlay.onclick = startQuickPlay;

    var btnCreateRoom = document.getElementById('btnCreateRoom');
    if (btnCreateRoom) btnCreateRoom.onclick = createRoom;

    // Lobby actions
    var btnAddBot = document.getElementById('btnAddBot');
    if (btnAddBot) btnAddBot.onclick = function () { addMockBot(false); };

    var btnCancelRoom = document.getElementById('btnCancelRoom');
    if (btnCancelRoom) {
      btnCancelRoom.onclick = function () {
        gameState.status = 'config';
        showView('hostConfigView');
      };
    }

    var btnStartGame = document.getElementById('btnStartGame');
    if (btnStartGame) btnStartGame.onclick = startGame;

    var btnCopyJoinLink = document.getElementById('btnCopyJoinLink');
    if (btnCopyJoinLink) {
      btnCopyJoinLink.onclick = function () {
        var joinUrl = buildRoomShareUrl();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(joinUrl).then(function () {
            if (typeof showToast === 'function') showToast('Đã sao chép link phòng thi đấu!', 'success');
          });
        } else {
          if (typeof showToast === 'function') showToast('Mã PIN phòng: ' + gameState.pin, 'info');
        }
      };
    }

    var btnOpenPlayerTab = document.getElementById('btnOpenPlayerTab');
    if (btnOpenPlayerTab) {
      btnOpenPlayerTab.onclick = function () {
        var joinUrl = buildRoomShareUrl();
        window.open(joinUrl, '_blank');
      };
    }

    // 4 ô màu Kahoot trên màn hình chính (Click trực tiếp!)
    document.querySelectorAll('#hostAnswersGrid .k-ans-card').forEach(function (card) {
      card.onclick = function () {
        var idx = parseInt(card.dataset.index, 10);
        handleHostCardClick(idx);
      };
    });

    // Điều hướng qua từng câu hỏi
    var btnNextRound = document.getElementById('btnNextRound');
    if (btnNextRound) btnNextRound.onclick = advanceNextRound;

    var btnViewLeaderboardRound = document.getElementById('btnViewLeaderboardRound');
    if (btnViewLeaderboardRound) btnViewLeaderboardRound.onclick = showLeaderboard;

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

    // Podium buttons
    var btnPlayAgain = document.getElementById('btnPlayAgain');
    if (btnPlayAgain) {
      btnPlayAgain.onclick = function () {
        gameState.status = 'config';
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

    var btnPlayerStartStandalone = document.getElementById('btnPlayerStartStandalone');
    if (btnPlayerStartStandalone) btnPlayerStartStandalone.onclick = startStandalonePhoneMatch;

    document.querySelectorAll('#avatarPickGrid .avatar-btn').forEach(function (btn) {
      btn.onclick = function () {
        var nameInput = document.getElementById('playerInputName');
        savePlayerProfile(nameInput ? nameInput.value : gameState.playerProfile.name, btn.dataset.avatar);
        SFX.tick();
      };
    });

    // Player 4 pads
    document.querySelectorAll('.player-pad-btn').forEach(function (btn) {
      btn.onclick = function () {
        var idx = parseInt(btn.dataset.index, 10);
        playerSubmitAnswer(idx);
      };
    });

    // Phím tắt bàn phím 1, 2, 3, 4 (trả lời nhanh) và Enter/Space (qua câu tiếp theo)
    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
        return;
      }
      if (gameState.status === 'question') {
        if (e.key === '1' || e.key === 'a' || e.key === 'A') handleHostCardClick(0);
        else if (e.key === '2' || e.key === 'b' || e.key === 'B') handleHostCardClick(1);
        else if (e.key === '3' || e.key === 'c' || e.key === 'C') handleHostCardClick(2);
        else if (e.key === '4' || e.key === 'd' || e.key === 'D') handleHostCardClick(3);
      } else if (gameState.status === 'round_end' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        advanceNextRound();
      } else if (gameState.status === 'leaderboard' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        advanceNextRound();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initArena);
})();
