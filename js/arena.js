// ==================== ARENA.JS — 5-Phase Kahoot Engine & Admin Host ====================
// Implements:
// - Admin-only authentication to create & control games (Players join with PIN + Nickname only)
// - Strict 5-Phase Question Lifecycle:
//   Phase 1: Get Ready & Read Prompt (3s, 4 options hidden, audio & preload)
//   Phase 2: Active Answering (4 options pop up simultaneously, no correctIndex sent to client)
//   Phase 3: Player Individual Lock & Smart Early Cut-off (100% answered -> instant cut-off)
//   Phase 4: Answer Reveal & A/B/C/D Bar Chart Statistics + Full Green/Red Player Screen
//   Phase 5: Intermediate Top 5 Leaderboard with Streak Callout & Player Rank/Gap Status
// - Dual Sync: Local BroadcastChannel/localStorage (0ms) + Cloudflare Worker D1 API (cross-device 4G/WiFi)

(function () {
  'use strict';

  var CLOUD_API_BASE = 'https://apihanyu.phuonganhkhanh683.workers.dev';
  var OPTION_LETTERS = ['A', 'B', 'C', 'D'];

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
    revealPop: function () {
      playTone(440, 'sine', 0.08, 0, 0.15);
      playTone(659.25, 'sine', 0.12, 0.06, 0.18);
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

  // ==================== UTILITIES ====================
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

  function normalizePin(pin) {
    return String(pin || '').replace(/\D/g, '').trim();
  }

  function formatPinCode(pin) {
    if (!pin) return '------';
    var s = normalizePin(pin);
    return s.slice(0, 3) + ' ' + s.slice(3);
  }

  // ==================== ADMIN AUTHENTICATION ====================
  var ADMIN_CREDENTIALS = {
    admin: '123456',
    teacher: '123456',
    wenqing: 'admin123'
  };

  function isAdminLoggedIn() {
    return sessionStorage.getItem('wq_arena_admin_logged') === '1' ||
      localStorage.getItem('wq_arena_admin_logged') === '1';
  }

  function getAdminName() {
    return localStorage.getItem('wq_arena_admin_user') || 'admin';
  }

  function loginAdmin(username, password) {
    var u = String(username || '').trim().toLowerCase();
    var p = String(password || '').trim();
    if ((u === 'admin' && (p === '123456' || p === 'admin123' || p === 'admin')) ||
      (ADMIN_CREDENTIALS[u] && ADMIN_CREDENTIALS[u] === p)) {
      sessionStorage.setItem('wq_arena_admin_logged', '1');
      localStorage.setItem('wq_arena_admin_logged', '1');
      localStorage.setItem('wq_arena_admin_user', username.trim() || 'admin');
      return true;
    }
    return false;
  }

  function logoutAdmin() {
    stopCloudPolling();
    cleanupCloudRoomMessages();
    gameState.status = 'config';
    if (window.WQProfile && typeof window.WQProfile.logoutAdmin === 'function') {
      window.WQProfile.logoutAdmin();
    } else {
      sessionStorage.removeItem('wq_arena_admin_logged');
      localStorage.removeItem('wq_arena_admin_logged');
      switchRoleTab('player');
    }
    if (typeof showToast === 'function') {
      showToast('Đã đăng xuất tài khoản Quản trị viên.', 'info');
    }
  }

  // ==================== DUAL REAL-TIME SYNC (LOCAL + CLOUDFLARE D1) ====================
  var _arenaChannel = null;
  var _processedMsgIds = {};
  var _cloudPollInterval = null;
  var _cloudRoomDeckIds = [];

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      _arenaChannel = new BroadcastChannel('hanyu_arena_channel');
    } catch (e) { }
  }

  function broadcastMsg(action, payload, syncToCloud) {
    var msgId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    _processedMsgIds[msgId] = true;
    var msg = {
      msgId: msgId,
      action: action,
      payload: payload || {},
      timestamp: Date.now()
    };

    // 1. Local BroadcastChannel (0ms giữa các tab cùng trình duyệt)
    if (_arenaChannel) {
      try { _arenaChannel.postMessage(msg); } catch (e) { }
    }

    // 2. LocalStorage event (0ms backup trên cùng máy)
    try {
      localStorage.setItem('wq_arena_sync', JSON.stringify(msg));
    } catch (e) { }

    // 3. Cloudflare Worker D1 Sync (Cho điện thoại 4G/WiFi khác thiết bị)
    if (syncToCloud !== false && payload && payload.pin) {
      var channelKey = 'arena_sync_' + normalizePin(payload.pin);
      fetch(CLOUD_API_BASE + '/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: channelKey,
          name: JSON.stringify(msg),
          words: []
        })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.deck_id) {
          _cloudRoomDeckIds.push(res.deck_id);
        }
      }).catch(function () { });
    }
  }

  function startCloudPolling(pin) {
    stopCloudPolling();
    var cleanPin = normalizePin(pin);
    if (!cleanPin) return;
    var channelKey = 'arena_sync_' + cleanPin;

    _cloudPollInterval = setInterval(function () {
      if (!gameState.pin || normalizePin(gameState.pin) !== cleanPin) return;
      fetch(CLOUD_API_BASE + '/api/decks?user_id=' + encodeURIComponent(channelKey))
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !Array.isArray(res.data)) return;
          // Sắp xếp theo id tăng dần để xử lý đúng thứ tự thời gian
          var items = res.data.slice().sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
          items.forEach(function (item) {
            if (!item || !item.name) return;
            try {
              var msg = JSON.parse(item.name);
              if (msg && msg.msgId && !_processedMsgIds[msg.msgId]) {
                handleIncomingSyncMessage(msg);
              }
            } catch (e) { }
          });
        })
        .catch(function () { });
    }, 1000);
  }

  function stopCloudPolling() {
    if (_cloudPollInterval) {
      clearInterval(_cloudPollInterval);
      _cloudPollInterval = null;
    }
  }

  function cleanupCloudRoomMessages() {
    var ids = _cloudRoomDeckIds.slice();
    _cloudRoomDeckIds = [];
    ids.forEach(function (id) {
      fetch(CLOUD_API_BASE + '/api/decks/' + id, { method: 'DELETE' }).catch(function () { });
    });
  }

  // ==================== GAME STATE ====================
  var gameState = {
    role: 'player', // Mặc định mở trang là 'player' (Người chơi). Chọn tab Admin mới đăng nhập 'host'.
    pin: '',
    status: 'config', // 'config' | 'lobby' | 'phase1' | 'phase2' | 'phase4' | 'phase5' | 'podium'
    phase: 0, // 1..5
    gameMode: 'speed',
    deckValue: 'HSK 1',
    deckName: 'HSK 1',
    deckWords: [],
    questionType: 'hanzi_to_mean',
    totalQuestions: 10,
    timePerQuestion: 15,
    currentQuestionIndex: 0,
    questions: [],
    players: [], // [{ id, name, avatar, score, prevRank, streak, lives, lastAnswerIndex, answeredAt, lastPointsEarned, isBot }]
    phase1Timer: null,
    timerInterval: null,
    botTimers: [],
    timerRemaining: 0,
    questionStartTime: 0,
    questionEndTime: 0,
    wasEarlyCutoff: false,
    // Player-side state
    myPlayerId: '',
    playerTimerInterval: null,
    playerLastChoice: -1,
    playerLocalScore: 0,
    playerLocalStreak: 0,
    playerProfile: {
      name: '',
      avatar: '🐼'
    }
  };

  var BOT_ROSTER = [
    { name: 'Gấu Trúc', avatar: '🐼', acc: 0.82 },
    { name: 'Cáo Nhỏ', avatar: '🦊', acc: 0.78 },
    { name: 'Tiểu Long', avatar: '🐉', acc: 0.86 },
    { name: 'Thỏ Ngọc', avatar: '🐰', acc: 0.74 },
    { name: 'Hổ Vàng', avatar: '🐯', acc: 0.80 },
    { name: 'Gấu Nâu', avatar: '🐻', acc: 0.72 },
    { name: 'Sư Tử', avatar: '🦁', acc: 0.84 },
    { name: 'Mèo Mướp', avatar: '🐱', acc: 0.76 }
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
    var roleTabs = document.getElementById('arenaRoleTabs');
    if (roleTabs) {
      var inActiveMatch = (viewId === 'hostGameView' || viewId === 'hostLeaderboardView' || viewId === 'hostPodiumView' || viewId === 'playerGameView');
      // Chỉ hiển thị thanh chuyển đổi Admin/Player khi đã đăng nhập Admin ở ô Hồ sơ!
      roleTabs.style.display = (isAdminLoggedIn() && !inActiveMatch) ? 'flex' : 'none';
    }
  }

  // ==================== INIT ARENA ====================
  function initArena() {
    loadSavedPlayerProfile();
    populateDeckOptions();
    bindEvents();
    setupCrossTabSync();
    checkUrlParams();

    setTimeout(function () {
      if (gameState.status === 'config') {
        populateDeckOptions();
      }
    }, 900);
  }

  function loadSavedPlayerProfile() {
    var savedName = localStorage.getItem('wq_arena_player_name') || '';
    var savedAvatar = localStorage.getItem('wq_arena_player_avatar') || '🐼';
    gameState.playerProfile.name = savedName;
    gameState.playerProfile.avatar = savedAvatar;

    var playerNameInput = document.getElementById('playerInputName');
    if (playerNameInput && savedName) {
      playerNameInput.value = savedName;
    }

    document.querySelectorAll('#avatarPickGrid .avatar-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.avatar === savedAvatar);
    });
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
  }

  function populateDeckOptions() {
    var select = document.getElementById('hostDeckSelect');
    if (!select) return;
    var previousVal = select.value;
    select.innerHTML = '';

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
      // Nếu chuyển sang từ trang Tự tạo và đã đăng nhập Admin thì mở thẳng cấu hình Admin
      if (isAdminLoggedIn()) {
        switchRoleTab('host');
      }
    } else if (previousVal && Array.from(select.options).some(function (o) { return o.value === previousVal; })) {
      select.value = previousVal;
    }
  }

  function checkUrlParams() {
    var urlParams = new URLSearchParams(window.location.search);
    var pinParam = urlParams.get('pin');
    if (pinParam) {
      var cleanP = normalizePin(pinParam);
      switchRoleTab('player');
      var pinInput = document.getElementById('playerInputPin');
      if (pinInput) pinInput.value = cleanP;

      var badge = document.getElementById('playerJoinRoomBadge');
      var sub = document.getElementById('playerJoinRoomSub');
      if (badge) badge.textContent = 'Phòng thi đấu #' + cleanP;
      if (sub) sub.textContent = 'Mã PIN đã được điền sẵn! Hãy nhập Tên hiển thị của bạn để vào phòng.';
    } else if (isAdminLoggedIn()) {
      // Nếu đã đăng nhập Admin ở ô Hồ sơ, mở thẳng Bảng Điều Khiển Tạo Phòng
      switchRoleTab('host');
    } else {
      // Người chơi thông thường: chỉ hiện giao diện Nhập PIN
      switchRoleTab('player');
    }
  }

  function switchRoleTab(role) {
    var tabHostBtn = document.getElementById('tabHostBtn');
    var tabPlayerBtn = document.getElementById('tabPlayerBtn');

    if (isAdminLoggedIn() && role !== 'player') {
      // Admin luôn giữ vai trò 'host' để nhận tín hiệu người chơi vào phòng ở cả 2 Tab
      gameState.role = 'host';
      var adminNameEl = document.getElementById('adminCurrentName');
      if (adminNameEl) adminNameEl.textContent = getAdminName();

      if (role === 'lobby_view') {
        if (tabPlayerBtn) tabPlayerBtn.classList.add('active');
        if (tabHostBtn) tabHostBtn.classList.remove('active');

        if (!gameState.pin) {
          // Nếu Admin bấm sang Tab 2 (Phòng Chờ & Người Chơi) mà chưa tạo phòng thì tự động tạo phòng luôn
          createRoom();
        } else {
          gameState.status = 'lobby';
          renderLobby();
          showView('hostLobbyView');
        }
      } else {
        // Tab 1: Thiết Lập & Tạo Game
        if (tabHostBtn) tabHostBtn.classList.add('active');
        if (tabPlayerBtn) tabPlayerBtn.classList.remove('active');
        showView('hostConfigView');
      }
    } else {
      gameState.role = 'player';
      if (tabPlayerBtn) tabPlayerBtn.classList.add('active');
      if (tabHostBtn) tabHostBtn.classList.remove('active');
      if (gameState.status === 'player_lobby') {
        showView('playerLobbyView');
      } else {
        showView('playerJoinView');
      }
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

  // ==================== ADMIN: TẠO PHÒNG & SINH BỘ ĐỀ ====================
  function createRoom() {
    if (!isAdminLoggedIn()) {
      showView('adminLoginView');
      return;
    }

    var deckSelect = document.getElementById('hostDeckSelect');
    var qTypeSelect = document.getElementById('hostQuestionType');
    var qCountSelect = document.getElementById('hostQuestionCount');
    var timeSelect = document.getElementById('hostTimePerQuestion');

    var deckVal = deckSelect ? deckSelect.value : 'HSK 1';
    var words = getWordsFromDeckVal(deckVal);

    if (!words || words.length < 4) {
      if (typeof showToast === 'function') {
        showToast('Bộ từ này cần ít nhất 4 từ vựng để tạo 4 phương án A, B, C, D!', 'error');
      }
      return;
    }

    cleanupCloudRoomMessages();

    gameState.role = 'host';
    gameState.deckValue = deckVal;
    gameState.deckWords = words;
    gameState.deckName = (deckSelect && deckSelect.options[deckSelect.selectedIndex])
      ? deckSelect.options[deckSelect.selectedIndex].text.replace(/\s*\(\d+\s*từ\)/, '')
      : deckVal;
    gameState.questionType = qTypeSelect ? qTypeSelect.value : 'hanzi_to_mean';
    gameState.totalQuestions = Math.min(parseInt(qCountSelect ? qCountSelect.value : '10', 10) || 10, words.length);
    gameState.timePerQuestion = parseInt(timeSelect ? timeSelect.value : '15', 10) || 15;

    gameState.pin = String(Math.floor(100000 + Math.random() * 900000));
    gameState.players = [];
    gameState.status = 'lobby';
    gameState.phase = 0;

    var tabHostBtn = document.getElementById('tabHostBtn');
    var tabPlayerBtn = document.getElementById('tabPlayerBtn');
    if (tabPlayerBtn) tabPlayerBtn.classList.add('active');
    if (tabHostBtn) tabHostBtn.classList.remove('active');

    generateQuestions(gameState.pin);
    renderLobby();
    showView('hostLobbyView');
    SFX.pop();

    startCloudPolling(gameState.pin);

    broadcastMsg('room_created', {
      pin: gameState.pin,
      gameMode: gameState.gameMode,
      deckName: gameState.deckName,
      totalQuestions: gameState.totalQuestions,
      timePerQuestion: gameState.timePerQuestion
    });
  }

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
        promptSub = 'Lắng nghe giọng đọc tiếng Trung để chọn từ đúng';
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
      pin: gameState.pin
    });
    return base + '?' + params.toString();
  }

  function renderLobby() {
    var pinEl = document.getElementById('displayRoomPin');
    var deckInfoEl = document.getElementById('lobbyDeckInfo');
    if (pinEl) pinEl.textContent = formatPinCode(gameState.pin);
    if (deckInfoEl) {
      deckInfoEl.textContent = (GAMEMODE_NAMES[gameState.gameMode] || 'Kahoot') + ' • ' + gameState.deckName + ' • ' + gameState.totalQuestions + ' câu (' + gameState.timePerQuestion + 's)';
    }

    generateQrCode();
    renderPlayerList();
  }

  function generateQrCode() {
    var qrBox = document.getElementById('lobbyQrBox');
    if (!qrBox) return;
    qrBox.innerHTML = '';

    var joinUrl = buildRoomShareUrl();

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

    var img = document.createElement('img');
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data=' + encodeURIComponent(joinUrl);
    img.alt = 'QR Code Phòng ' + gameState.pin;
    img.width = 180;
    img.height = 180;
    img.style.borderRadius = '8px';
    img.style.display = 'block';
    qrBox.appendChild(img);
  }

  function broadcastLobbyRoster() {
    if (!gameState.pin) return;
    var rosterPayload = {
      pin: gameState.pin,
      players: gameState.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar || '🐼',
          isBot: !!p.isBot
        };
      })
    };
    try {
      localStorage.setItem('wq_arena_roster_' + normalizePin(gameState.pin), JSON.stringify(rosterPayload));
    } catch (e) { }
    broadcastMsg('lobby_roster_sync', rosterPayload);
  }

  function renderPlayerList() {
    var listEl = document.getElementById('lobbyPlayersList');
    var countEl = document.getElementById('playerCount');
    var topCountEl = document.getElementById('lobbyTopPlayerCount');
    var tabCountEl = document.getElementById('adminTabPlayerCount');
    var startBtn = document.getElementById('btnStartGame');

    var count = gameState.players.length;
    if (countEl) countEl.textContent = count;
    if (topCountEl) topCountEl.textContent = count;
    if (tabCountEl) tabCountEl.textContent = count;

    if (startBtn) {
      startBtn.disabled = count === 0;
      startBtn.innerHTML = '<span>BẮT ĐẦU TRẬN ĐẤU (' + count + ' NGƯỜI) ➔</span>';
    }

    broadcastLobbyRoster();

    if (!listEl) return;

    if (count === 0) {
      listEl.innerHTML = '<div class="empty-lobby-text">Đang chờ người chơi quét mã QR hoặc nhập PIN vào phòng... (Hoặc bấm "+ Thêm bạn học ảo 🤖" để test ngay)</div>';
      return;
    }

    listEl.innerHTML = '';
    gameState.players.forEach(function (p) {
      var chip = document.createElement('div');
      chip.className = 'player-chip' + (p.isBot ? ' bot' : '');
      chip.innerHTML =
        '<span class="player-chip-avatar">' + p.avatar + '</span>' +
        '<span class="player-chip-name">' + p.name + '</span>' +
        '<button type="button" class="chip-remove-btn" data-id="' + p.id + '" title="Xóa khỏi phòng">×</button>';
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

  function addMockBot() {
    var available = BOT_ROSTER.filter(function (b) {
      return !gameState.players.some(function (p) { return p.name === b.name; });
    });
    if (available.length === 0) {
      if (typeof showToast === 'function') showToast('Đã thêm tối đa 8 bạn học ảo!', 'info');
      return;
    }

    var pick = available[Math.floor(Math.random() * available.length)];
    gameState.players.push({
      id: 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: pick.name,
      avatar: pick.avatar,
      acc: pick.acc || 0.78,
      score: 0,
      prevRank: gameState.players.length + 1,
      streak: 0,
      lives: 3,
      lastAnswerIndex: -1,
      answeredAt: 0,
      lastPointsEarned: 0,
      isBot: true
    });

    SFX.pop();
    renderPlayerList();
  }

  // ==================== BẮT ĐẦU TRẬN ĐẤU: ĐI QUA VÒNG ĐỜI 5 PHA ====================
  function startGame() {
    if (gameState.players.length === 0) {
      if (typeof showToast === 'function') showToast('Cần ít nhất 1 người chơi (hoặc bạn học ảo) trong phòng để bắt đầu!', 'warning');
      return;
    }

    gameState.currentQuestionIndex = 0;
    gameState.players.forEach(function (p, idx) {
      p.score = 0;
      p.streak = 0;
      p.lives = 3;
      p.prevRank = idx + 1;
    });

    showView('hostGameView');
    startPhase1GetReady();
  }

  function clearAllRoundTimers() {
    if (gameState.phase1Timer) {
      clearInterval(gameState.phase1Timer);
      gameState.phase1Timer = null;
    }
    if (gameState.timerInterval) {
      clearInterval(gameState.timerInterval);
      gameState.timerInterval = null;
    }
    if (gameState.botTimers && gameState.botTimers.length) {
      gameState.botTimers.forEach(function (t) { clearTimeout(t); });
    }
    gameState.botTimers = [];
  }

  // ==================== PHA 1: NẠP DỮ LIỆU & ĐỌC ĐỀ TRƯỚC (GET READY – 3 GIÂY) ====================
  // Cả màn hình Admin và điện thoại người chơi chỉ hiện "Câu số X/Y – Chuẩn bị..." kèm nội dung câu hỏi,
  // NHƯNG CHƯA HIỆN 4 Ô ĐÁP ÁN (để công bằng nhận thức & Pre-load âm thanh/dữ liệu).
  function startPhase1GetReady() {
    clearAllRoundTimers();

    var qIdx = gameState.currentQuestionIndex;
    var q = gameState.questions[qIdx];
    if (!q) {
      showPodium();
      return;
    }

    gameState.status = 'phase1';
    gameState.phase = 1;
    gameState.wasEarlyCutoff = false;

    gameState.players.forEach(function (p) {
      p.lastAnswerIndex = -1;
      p.answeredAt = 0;
      p.lastPointsEarned = 0;
    });

    showView('hostGameView');

    var qCounterEl = document.getElementById('hostQCounter');
    var phaseBadge = document.getElementById('hostPhaseBadge');
    var timerBadge = document.getElementById('hostTimerBadge');
    var timerSecEl = document.getElementById('hostTimerSec');
    var answeredCountEl = document.getElementById('answeredCount');
    var totalPlayingEl = document.getElementById('totalPlayersPlaying');
    var progressBar = document.getElementById('hostTimeProgressBar');
    var qTypeBadge = document.getElementById('hostQTypeBadge');
    var qTextEl = document.getElementById('hostQuestionText');
    var qSubEl = document.getElementById('hostQuestionSub');

    var phase1Box = document.getElementById('hostPhase1Box');
    var getReadyNum = document.getElementById('hostGetReadyNum');
    var getReadyTitle = document.getElementById('hostGetReadyTitle');
    var phase4Chart = document.getElementById('hostPhase4Chart');
    var answersGrid = document.getElementById('hostAnswersGrid');
    var hostFooter = document.getElementById('gameHostFooter');

    var qLabel = 'Câu số ' + (qIdx + 1) + '/' + gameState.totalQuestions;
    if (qCounterEl) qCounterEl.textContent = qLabel;
    if (phaseBadge) {
      phaseBadge.className = 'game-phase-pill phase-1';
      phaseBadge.textContent = 'PHA 1/5: ĐỌC ĐỀ TRƯỚC (3s)';
    }
    if (timerBadge) timerBadge.classList.remove('urgent');
    if (timerSecEl) timerSecEl.textContent = '3';
    if (answeredCountEl) answeredCountEl.textContent = '0';
    if (totalPlayingEl) totalPlayingEl.textContent = getActivePlayers().length;
    if (progressBar) progressBar.style.width = '100%';

    if (qTypeBadge) qTypeBadge.textContent = qLabel + ' – Chuẩn bị đọc đề • ' + q.typeDesc;
    if (qTextEl) qTextEl.textContent = q.prompt;
    if (qSubEl) qSubEl.textContent = q.subPrompt || '';

    // ẨN 4 Ô ĐÁP ÁN & BIỂU ĐỒ Ở PHA 1, CHỈ HIỆN KHUNG GET READY 3 GIÂY
    if (phase1Box) phase1Box.style.display = 'flex';
    if (phase4Chart) phase4Chart.style.display = 'none';
    if (answersGrid) answersGrid.style.display = 'none';
    if (hostFooter) hostFooter.style.display = 'none';

    var prepSec = 3;
    if (getReadyNum) getReadyNum.textContent = prepSec;
    if (getReadyTitle) getReadyTitle.textContent = qLabel + ' – Chuẩn bị...';

    // Phát âm thanh câu hỏi ngay ở Pha 1 để người chơi lắng nghe trước khi bung đáp án
    if (q.hanziAudio && typeof speak === 'function') {
      setTimeout(function () { speak(q.hanziAudio); }, 180);
    }
    SFX.tick();

    // Gửi tín hiệu Pha 1 (Pre-load đề bài, KHÔNG gửi đáp án đúng) xuống tất cả điện thoại
    broadcastMsg('phase_1_getready', {
      pin: gameState.pin,
      questionIndex: qIdx,
      totalQuestions: gameState.totalQuestions,
      prompt: q.prompt,
      subPrompt: q.subPrompt,
      typeDesc: q.typeDesc,
      prepSeconds: 3
    });

    gameState.phase1Timer = setInterval(function () {
      prepSec--;
      if (prepSec > 0) {
        if (getReadyNum) getReadyNum.textContent = prepSec;
        if (timerSecEl) timerSecEl.textContent = prepSec;
        SFX.tick();
      } else {
        clearInterval(gameState.phase1Timer);
        gameState.phase1Timer = null;
        // Chuyển ngay sang Pha 2: Bung 4 ô đáp án!
        startPhase2ActiveAnswering();
      }
    }, 1000);
  }

  // ==================== PHA 2: BUNG ĐÁP ÁN & ĐẾM NGƯỢC (ACTIVE ANSWERING) ====================
  // Đúng giây thứ 0 của nhịp chuẩn bị, 4 ô đáp án đồng loạt bật lên trên Admin & Điện thoại.
  // Tuyệt đối KHÔNG gửi kèm thông tin đáp án nào đúng (correctIndex) xuống điện thoại để chống nhìn trộm mã nguồn!
  function startPhase2ActiveAnswering() {
    clearAllRoundTimers();

    var qIdx = gameState.currentQuestionIndex;
    var q = gameState.questions[qIdx];
    if (!q) return;

    gameState.status = 'phase2';
    gameState.phase = 2;
    gameState.timerRemaining = gameState.timePerQuestion;
    gameState.questionStartTime = Date.now();
    gameState.questionEndTime = gameState.questionStartTime + (gameState.timePerQuestion * 1000);

    var phaseBadge = document.getElementById('hostPhaseBadge');
    var timerSecEl = document.getElementById('hostTimerSec');
    var timerBadge = document.getElementById('hostTimerBadge');
    var answeredCountEl = document.getElementById('answeredCount');
    var totalPlayingEl = document.getElementById('totalPlayersPlaying');
    var progressBar = document.getElementById('hostTimeProgressBar');
    var qTypeBadge = document.getElementById('hostQTypeBadge');

    var phase1Box = document.getElementById('hostPhase1Box');
    var phase4Chart = document.getElementById('hostPhase4Chart');
    var answersGrid = document.getElementById('hostAnswersGrid');
    var hostFooter = document.getElementById('gameHostFooter');

    if (phaseBadge) {
      phaseBadge.className = 'game-phase-pill phase-2';
      phaseBadge.textContent = 'PHA 2/5: ĐANG NHẬN ĐÁP ÁN';
    }
    if (qTypeBadge) qTypeBadge.textContent = q.typeDesc;
    if (timerSecEl) timerSecEl.textContent = gameState.timerRemaining;
    if (timerBadge) timerBadge.classList.remove('urgent');
    if (answeredCountEl) answeredCountEl.textContent = '0';
    if (totalPlayingEl) totalPlayingEl.textContent = getActivePlayers().length;
    if (progressBar) progressBar.style.width = '100%';

    if (phase1Box) phase1Box.style.display = 'none';
    if (phase4Chart) phase4Chart.style.display = 'none';
    if (hostFooter) hostFooter.style.display = 'none';

    // Bung 4 ô đáp án A, B, C, D trên màn hình Admin
    for (var i = 0; i < 4; i++) {
      var ansTextEl = document.getElementById('hostAns' + i);
      var statPill = document.getElementById('hostAnsStat' + i);
      var cardEl = document.querySelector('.k-ans-card[data-index="' + i + '"]');
      if (ansTextEl) ansTextEl.textContent = q.options[i] || '';
      if (statPill) statPill.style.display = 'none';
      if (cardEl) {
        cardEl.classList.remove('k-correct', 'k-wrong', 'k-selected');
      }
    }
    if (answersGrid) answersGrid.style.display = 'grid';

    SFX.revealPop();

    // Chạy đồng hồ đếm ngược Pha 2
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

      // ĐIỀU KIỆN 1 (HẾT GIỜ): Đồng hồ chạm mốc 0 giây -> Tự động đóng cổng nhận đáp án & chuyển sang Pha 4
      if (gameState.timerRemaining <= 0) {
        clearAllRoundTimers();
        gameState.wasEarlyCutoff = false;
        startPhase4AnswerReveal();
      }
    }, 1000);

    // Kích hoạt Bot mô phỏng trả lời (nếu trong phòng có Bot)
    runBotSimulation(q);

    // Gửi tín hiệu Pha 2 xuống điện thoại: CHỈ gửi 4 phương án A, B, C, D và mốc endTime,
    // TUYỆT ĐỐI KHÔNG gửi correctIndex để chống nhìn trộm mã nguồn!
    broadcastMsg('phase_2_active', {
      pin: gameState.pin,
      questionIndex: qIdx,
      totalQuestions: gameState.totalQuestions,
      prompt: q.prompt,
      options: q.options,
      durationSec: gameState.timePerQuestion,
      endTime: gameState.questionEndTime
    });
  }

  function getActivePlayers() {
    if (gameState.gameMode === 'survival') {
      return gameState.players.filter(function (p) { return p.lives > 0; });
    }
    return gameState.players;
  }

  function runBotSimulation(q) {
    getActivePlayers().forEach(function (p) {
      if (!p.isBot) return;
      var maxDelay = Math.max(2500, (gameState.timePerQuestion - 3) * 1000);
      var delay = 1800 + Math.random() * (maxDelay - 1800);
      var t = setTimeout(function () {
        if (gameState.status !== 'phase2') return;
        var acc = p.acc || 0.78;
        var isCorrect = Math.random() < acc;
        var chosenIndex = isCorrect ? q.correctIndex : (q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;
        recordPlayerAnswerOnHost(p.id, chosenIndex);
      }, delay);
      gameState.botTimers.push(t);
    });
  }

  // ==================== PHA 3: GHI NHẬN ĐÁP ÁN & KIỂM TRA NGẮT SỚM (EARLY CUT-OFF) ====================
  function recordPlayerAnswerOnHost(playerId, answerIndex) {
    if (gameState.status !== 'phase2') return;
    var p = gameState.players.find(function (x) { return x.id === playerId; });
    if (!p || p.lastAnswerIndex !== -1) return;

    var numericChoice = parseInt(answerIndex, 10);
    if (isNaN(numericChoice) || numericChoice < 0 || numericChoice > 3) return;

    p.lastAnswerIndex = numericChoice;
    p.answeredAt = Date.now();

    var q = gameState.questions[gameState.currentQuestionIndex];
    if (q && numericChoice === Number(q.correctIndex)) {
      var timeUsed = Math.max(0.2, (p.answeredAt - gameState.questionStartTime) / 1000);
      var speedRatio = Math.max(0.2, 1 - (timeUsed / gameState.timePerQuestion) * 0.5);
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
    var totalPlayingEl = document.getElementById('totalPlayersPlaying');
    var phaseBadge = document.getElementById('hostPhaseBadge');
    if (answeredEl) answeredEl.textContent = answeredCount;
    if (totalPlayingEl) totalPlayingEl.textContent = activeList.length;

    if (phaseBadge && answeredCount > 0 && answeredCount < activeList.length) {
      phaseBadge.className = 'game-phase-pill phase-3';
      phaseBadge.textContent = 'PHA 3/5: ' + answeredCount + '/' + activeList.length + ' ĐÃ KHÓA ĐÁP ÁN';
    }

    SFX.pop();

    // Nếu tất cả người chơi thật đã bấm xong mà chỉ còn Bot chưa bấm -> Cho Bot chốt nhanh sau 0.35s để kích hoạt Early Cut-off!
    var humanPlayers = activeList.filter(function (x) { return !x.isBot; });
    var allHumansAnswered = humanPlayers.length > 0 && humanPlayers.every(function (x) { return x.lastAnswerIndex !== -1; });

    // ĐIỀU KIỆN 2 (NGẮT SỚM THÔNG MINH - EARLY CUT-OFF):
    // Ngay khi cả N / N người trong phòng đều đã bấm chọn xong, lập tức ngắt đồng hồ và chuyển thẳng sang Pha 4!
    if (answeredCount >= activeList.length) {
      var hadTimeLeft = gameState.timerRemaining > 1;
      clearAllRoundTimers();
      gameState.wasEarlyCutoff = hadTimeLeft;
      setTimeout(function () {
        startPhase4AnswerReveal();
      }, 250);
    } else if (allHumansAnswered) {
      clearAllRoundTimers();
      getActivePlayers().forEach(function (bot) {
        if (bot.isBot && bot.lastAnswerIndex === -1) {
          var isCorrect = Math.random() < (bot.acc || 0.78);
          var idx = isCorrect ? q.correctIndex : (q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;
          recordPlayerAnswerOnHost(bot.id, idx);
        }
      });
    }
  }

  // ==================== PHA 4: LẬT BÀI & TRẢ KẾT QUẢ + BIỂU ĐỒ CỘT THỐNG KÊ A/B/C/D ====================
  function startPhase4AnswerReveal() {
    if (gameState.status === 'phase4') return;
    clearAllRoundTimers();

    gameState.status = 'phase4';
    gameState.phase = 4;

    var q = gameState.questions[gameState.currentQuestionIndex];
    if (!q) return;
    var correctIdx = Number(q.correctIndex);
    var correctLetter = OPTION_LETTERS[correctIdx] || 'A';

    // Lưu lại thứ hạng cũ trước khi cập nhật bảng xếp hạng vòng này
    var prevSorted = gameState.players.slice().sort(function (a, b) {
      return (b.score - (b.lastPointsEarned || 0)) - (a.score - (a.lastPointsEarned || 0));
    });
    prevSorted.forEach(function (p, idx) {
      p.prevRank = idx + 1;
    });

    // Chế độ Sinh tồn: trừ 1 tim nếu chọn sai hoặc không trả lời
    if (gameState.gameMode === 'survival') {
      getActivePlayers().forEach(function (p) {
        if (p.lives > 0 && p.lastAnswerIndex !== correctIdx) {
          p.lives = Math.max(0, p.lives - 1);
          p.streak = 0;
        }
      });
    }

    // Thống kê số lượng người chơi chọn từng đáp án A (0), B (1), C (2), D (3)
    var counts = [0, 0, 0, 0];
    gameState.players.forEach(function (p) {
      if (p.lastAnswerIndex >= 0 && p.lastAnswerIndex <= 3) {
        counts[p.lastAnswerIndex]++;
      }
    });
    var totalVotes = Math.max(1, gameState.players.length);

    // Cập nhật giao diện Admin ở Pha 4:
    // 1. Làm mờ 3 ô đáp án sai, làm sáng nhấp nháy ô đáp án đúng
    for (var i = 0; i < 4; i++) {
      var cardEl = document.querySelector('.k-ans-card[data-index="' + i + '"]');
      var statPill = document.getElementById('hostAnsStat' + i);
      if (statPill) {
        statPill.style.display = 'inline-flex';
        statPill.textContent = counts[i] + ' người';
      }
      if (cardEl) {
        if (i === correctIdx) {
          cardEl.classList.add('k-correct');
          cardEl.classList.remove('k-wrong');
        } else {
          cardEl.classList.add('k-wrong');
          cardEl.classList.remove('k-correct');
        }
      }
    }

    // 2. Hiển thị Biểu đồ cột thống kê A / B / C / D
    var phase4Chart = document.getElementById('hostPhase4Chart');
    var earlyCutoffTag = document.getElementById('hostEarlyCutoffTag');
    if (phase4Chart) phase4Chart.style.display = 'block';
    if (earlyCutoffTag) {
      earlyCutoffTag.style.display = gameState.wasEarlyCutoff ? 'inline-flex' : 'none';
    }

    for (var b = 0; b < 4; b++) {
      var countEl = document.getElementById('barCount' + b);
      var fillEl = document.getElementById('barFill' + b);
      var checkEl = document.getElementById('barCheck' + b);
      var pctHeight = counts[b] > 0 ? Math.max(18, Math.round((counts[b] / totalVotes) * 100)) : 8;

      if (countEl) countEl.textContent = counts[b];
      if (fillEl) {
        fillEl.style.height = pctHeight + '%';
        fillEl.classList.toggle('is-correct-bar', b === correctIdx);
        fillEl.classList.toggle('is-wrong-bar', b !== correctIdx);
      }
      if (checkEl) checkEl.textContent = (b === correctIdx) ? '✓' : '';
    }

    var phaseBadge = document.getElementById('hostPhaseBadge');
    if (phaseBadge) {
      phaseBadge.className = 'game-phase-pill phase-4';
      phaseBadge.textContent = 'PHA 4/5: LẬT BÀI & THỐNG KÊ';
    }

    var feedbackBadge = document.getElementById('roundFeedbackBadge');
    var summaryEl = document.getElementById('roundSummaryText');
    var hostFooter = document.getElementById('gameHostFooter');

    var rightCount = counts[correctIdx];
    if (feedbackBadge) {
      feedbackBadge.className = 'round-feedback-badge is-correct';
      feedbackBadge.textContent = '🎯 Có ' + rightCount + ' / ' + gameState.players.length + ' người chơi chọn đúng đáp án ' + correctLetter + '!';
    }
    if (summaryEl) {
      summaryEl.textContent = 'Đáp án đúng: ' + correctLetter + '. ' + q.options[correctIdx];
    }
    if (hostFooter) hostFooter.style.display = 'flex';

    SFX.correct();
    if (q.wordAudio && typeof speak === 'function') {
      speak(q.wordAudio);
    }

    // Sắp xếp thứ hạng mới để gửi kết quả chấm điểm riêng cho từng điện thoại
    var sorted = gameState.players.slice().sort(function (a, b) { return b.score - a.score; });
    var leaderScore = sorted[0] ? sorted[0].score : 0;

    broadcastMsg('phase_4_reveal', {
      pin: gameState.pin,
      questionIndex: gameState.currentQuestionIndex,
      correctIndex: correctIdx,
      correctLetter: correctLetter,
      correctText: q.options[correctIdx],
      counts: counts,
      leaderScore: leaderScore,
      scores: sorted.map(function (p, idx) {
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          score: p.score,
          streak: p.streak,
          rank: idx + 1,
          prevRank: p.prevRank || (idx + 1),
          gapToLeader: Math.max(0, leaderScore - p.score),
          lastAnswerIndex: p.lastAnswerIndex,
          lastEarned: p.lastPointsEarned || 0
        };
      })
    });
  }

  // ==================== PHA 5: BẢNG XẾP HẠNG TRUNG GIAN (LEADERBOARD & CHUYỂN CÂU) ====================
  function startPhase5Leaderboard() {
    gameState.status = 'phase5';
    gameState.phase = 5;
    showView('hostLeaderboardView');

    var sorted = gameState.players.slice().sort(function (a, b) {
      return b.score - a.score;
    });
    var leaderScore = sorted[0] ? sorted[0].score : 0;

    var listEl = document.getElementById('hostLeaderboardList');
    var titleEl = document.getElementById('leaderboardRoundTitle');
    var calloutEl = document.getElementById('leaderboardStreakCallout');
    var continueBtn = document.getElementById('btnContinueGame');

    if (titleEl) {
      titleEl.textContent = 'Bảng Xếp Hạng Top 5 (Sau Câu ' + (gameState.currentQuestionIndex + 1) + ' / ' + gameState.totalQuestions + ')';
    }

    // Tìm người chơi có chuỗi thắng (streak) cao nhất để vinh danh trên Banner
    var streakPlayer = sorted.slice().sort(function (a, b) { return b.streak - a.streak; })[0];
    if (calloutEl) {
      if (streakPlayer && streakPlayer.streak >= 2) {
        calloutEl.style.display = 'inline-flex';
        calloutEl.textContent = '🔥 ' + streakPlayer.avatar + ' ' + streakPlayer.name + ' vừa lập chuỗi ' + streakPlayer.streak + ' câu đúng liên tiếp!';
      } else if (sorted[0] && sorted[0].lastPointsEarned > 0) {
        calloutEl.style.display = 'inline-flex';
        calloutEl.textContent = '⚡ ' + sorted[0].avatar + ' ' + sorted[0].name + ' đang dẫn đầu đường đua với ' + sorted[0].score.toLocaleString() + ' điểm!';
      } else {
        calloutEl.style.display = 'none';
      }
    }

    var isLast = gameState.currentQuestionIndex >= gameState.totalQuestions - 1 ||
      (gameState.gameMode === 'survival' && getActivePlayers().length === 0);

    if (continueBtn) {
      continueBtn.innerHTML = isLast
        ? '<span>Tổng kết Bục Vinh Quang 🏆</span>'
        : ('<span>Câu tiếp theo (Câu ' + (gameState.currentQuestionIndex + 2) + ') ➔</span>');
    }

    if (listEl) {
      listEl.innerHTML = '';
      sorted.slice(0, 5).forEach(function (p, idx) {
        var rank = idx + 1;
        var rankDelta = (p.prevRank || rank) - rank;
        var deltaHtml = '';
        if (rankDelta > 0) {
          deltaHtml = '<span class="lb-rank-up" title="Tăng ' + rankDelta + ' bậc">▲' + rankDelta + '</span>';
        } else if (rankDelta < 0) {
          deltaHtml = '<span class="lb-rank-down" title="Giảm ' + Math.abs(rankDelta) + ' bậc">▼' + Math.abs(rankDelta) + '</span>';
        }

        var row = document.createElement('div');
        row.className = 'leaderboard-row lb-slide-anim' + (rank <= 3 ? (' top-' + rank) : '');
        row.style.animationDelay = (idx * 0.07) + 's';

        var plusBadge = p.lastPointsEarned > 0
          ? '<span class="lb-plus-points">+' + p.lastPointsEarned + '</span>'
          : '';

        row.innerHTML =
          '<div class="lb-rank">#' + rank + ' ' + deltaHtml + '</div>' +
          '<div class="lb-avatar">' + p.avatar + '</div>' +
          '<div class="lb-name">' + p.name +
          (p.streak >= 2 ? ' <span class="lb-streak">🔥' + p.streak + '</span>' : '') +
          '</div>' +
          plusBadge +
          '<div class="lb-score">' + p.score.toLocaleString() + ' đ</div>';
        listEl.appendChild(row);
      });
    }

    SFX.pop();

    // Phát tín hiệu Pha 5 xuống điện thoại để từng máy cập nhật thứ hạng & khoảng cách điểm
    broadcastMsg('phase_5_leaderboard', {
      pin: gameState.pin,
      questionIndex: gameState.currentQuestionIndex,
      leaderScore: leaderScore,
      rankings: sorted.map(function (p, idx) {
        return {
          id: p.id,
          name: p.name,
          score: p.score,
          streak: p.streak,
          rank: idx + 1,
          gapToLeader: Math.max(0, leaderScore - p.score)
        };
      })
    });
  }

  function advanceToNextQuestion() {
    var alive = getActivePlayers();
    gameState.currentQuestionIndex++;
    if (gameState.currentQuestionIndex >= gameState.totalQuestions || (gameState.gameMode === 'survival' && alive.length === 0)) {
      showPodium();
    } else {
      // Quay trở lại Pha 1 cho câu hỏi tiếp theo!
      startPhase1GetReady();
    }
  }

  // ==================== BỤC VINH QUANG PODIUM CHUNG CUỘC ====================
  function showPodium() {
    clearAllRoundTimers();
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
    if (n1) n1.textContent = p1.name;
    if (s1) s1.textContent = p1.score.toLocaleString() + ' đ';

    if (a2) a2.textContent = p2.avatar || '🥈';
    if (n2) n2.textContent = p2.name;
    if (s2) s2.textContent = p2.score.toLocaleString() + ' đ';

    if (a3) a3.textContent = p3.avatar || '🥉';
    if (n3) n3.textContent = p3.name;
    if (s3) s3.textContent = p3.score.toLocaleString() + ' đ';

    var subText = document.getElementById('podiumSubtitleText');
    if (subText && sorted[0]) {
      subText.textContent = 'Quán quân: ' + sorted[0].avatar + ' ' + sorted[0].name + ' xuất sắc dẫn đầu với ' + sorted[0].score.toLocaleString() + ' điểm!';
    }

    SFX.fanfare();

    if (typeof confetti === 'function') {
      try {
        confetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
        setTimeout(function () {
          confetti({ particleCount: 70, angle: 60, spread: 55, origin: { x: 0.1, y: 0.65 } });
          confetti({ particleCount: 70, angle: 120, spread: 55, origin: { x: 0.9, y: 0.65 } });
        }, 450);
      } catch (e) { }
    }

    broadcastMsg('game_over', {
      pin: gameState.pin,
      rankings: sorted.map(function (p, idx) {
        return {
          id: p.id,
          name: p.name,
          score: p.score,
          rank: idx + 1
        };
      })
    });
  }

  // ==================== PLAYER: THAM GIA PHÒNG & XỬ LÝ 5 PHA TRÊN ĐIỆN THOẠI ====================
  var _playerJoinHeartbeat = null;

  function stopPlayerJoinHeartbeat() {
    if (_playerJoinHeartbeat) {
      clearInterval(_playerJoinHeartbeat);
      _playerJoinHeartbeat = null;
    }
  }

  function renderPlayerWaitingRoster(playersList) {
    var listEl = document.getElementById('playerLobbyRosterList');
    var badgeEl = document.getElementById('playerLobbyCountBadge');
    if (!listEl) return;

    var list = Array.isArray(playersList) ? playersList.slice() : [];
    // Đảm bảo luôn có mặt bản thân người chơi trong danh sách hiển thị trên màn hình chờ của mình
    if (gameState.myPlayerId && !list.some(function (x) { return x.id === gameState.myPlayerId; })) {
      list.push({
        id: gameState.myPlayerId,
        name: gameState.playerProfile.name || 'Bạn',
        avatar: gameState.playerProfile.avatar || '🐼',
        isBot: false
      });
    }

    if (badgeEl) {
      badgeEl.textContent = list.length + ' người';
    }

    listEl.innerHTML = '';
    list.forEach(function (p) {
      var isMe = (p.id === gameState.myPlayerId);
      var chip = document.createElement('div');
      chip.className = 'player-chip' + (p.isBot ? ' bot' : '') + (isMe ? ' is-me-chip' : '');
      chip.innerHTML =
        '<span class="player-chip-avatar">' + (p.avatar || '🐼') + '</span>' +
        '<span class="player-chip-name">' + (p.name || 'Người chơi') + (isMe ? ' (Bạn)' : '') + '</span>';
      listEl.appendChild(chip);
    });
  }

  function playerJoin() {
    var pinInput = document.getElementById('playerInputPin');
    var nameInput = document.getElementById('playerInputName');
    var pin = normalizePin(pinInput ? pinInput.value : '');
    var name = (nameInput ? nameInput.value : '').trim();

    if (!pin || pin.length < 4) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập mã PIN phòng gồm 6 chữ số!', 'warning');
      return;
    }
    if (!name) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập Tên hiển thị (Nickname) của bạn!', 'warning');
      return;
    }

    savePlayerProfile(name, gameState.playerProfile.avatar);
    gameState.role = 'player';
    gameState.status = 'player_lobby';
    gameState.pin = pin;
    gameState.myPlayerId = 'player_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    gameState.playerJoinAcked = false;
    gameState.playerLastChoice = -1;
    gameState.playerLocalScore = 0;
    gameState.playerLocalStreak = 0;

    var avatarEl = document.getElementById('playerWaitingAvatar');
    var nameEl = document.getElementById('playerWaitingName');
    var pinEl = document.getElementById('playerConnectedPin');
    var headerAvatar = document.getElementById('playerHeaderAvatar');
    var headerName = document.getElementById('playerHeaderName');

    if (avatarEl) avatarEl.textContent = gameState.playerProfile.avatar;
    if (nameEl) nameEl.textContent = name;
    if (pinEl) pinEl.textContent = formatPinCode(pin);
    if (headerAvatar) headerAvatar.textContent = gameState.playerProfile.avatar;
    if (headerName) headerName.textContent = name;

    // Hiển thị danh sách người chơi hiện có trong phòng ngay khi vào
    var cachedRoster = [];
    try {
      var savedRosterStr = localStorage.getItem('wq_arena_roster_' + pin);
      if (savedRosterStr) {
        var parsedRoster = JSON.parse(savedRosterStr);
        if (parsedRoster && Array.isArray(parsedRoster.players)) {
          cachedRoster = parsedRoster.players;
        }
      }
    } catch (e) { }
    renderPlayerWaitingRoster(cachedRoster);

    showView('playerLobbyView');
    SFX.pop();

    // Bắt đầu đồng bộ với Cloudflare cho phòng này
    startCloudPolling(pin);

    var joinPayload = {
      id: gameState.myPlayerId,
      name: name,
      avatar: gameState.playerProfile.avatar,
      pin: pin
    };
    broadcastMsg('player_join', joinPayload);

    // Heartbeat định kỳ mỗi 2.5s cho đến khi Admin xác nhận có tên trong danh sách phòng
    stopPlayerJoinHeartbeat();
    _playerJoinHeartbeat = setInterval(function () {
      if (gameState.role !== 'player' || gameState.status !== 'player_lobby' || gameState.playerJoinAcked) {
        stopPlayerJoinHeartbeat();
        return;
      }
      broadcastMsg('player_join', joinPayload, false);
    }, 2500);
  }

  function hideAllPlayerSubCards() {
    stopPlayerJoinHeartbeat();
    var ids = ['playerPhase1Card', 'playerPhase2Wrap', 'playerSubmittedState', 'playerResultOverlay', 'playerPhase5Card'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    if (gameState.playerTimerInterval) {
      clearInterval(gameState.playerTimerInterval);
      gameState.playerTimerInterval = null;
    }
  }

  // Pha 1 trên điện thoại: Hiện đề bài trước 3 giây, chưa hiện 4 ô đáp án
  function onPlayerReceivePhase1(p) {
    gameState.playerLastChoice = -1;
    showView('playerGameView');
    hideAllPlayerSubCards();

    var miniPrompt = document.getElementById('playerMiniPrompt');
    var p1Card = document.getElementById('playerPhase1Card');
    var p1Badge = document.getElementById('playerPhase1Badge');
    var p1Prompt = document.getElementById('playerPhase1Prompt');
    var p1Sub = document.getElementById('playerPhase1Sub');
    var p1Sec = document.getElementById('playerPhase1Sec');

    var qLabel = 'Câu số ' + ((p.questionIndex || 0) + 1) + '/' + (p.totalQuestions || 10);
    if (miniPrompt) miniPrompt.textContent = qLabel + ' • Đọc đề';
    if (p1Badge) p1Badge.textContent = qLabel + ' – Chuẩn bị...';
    if (p1Prompt) p1Prompt.textContent = p.prompt || '';
    if (p1Sub) p1Sub.textContent = p.subPrompt || 'Hãy nhìn kỹ đề bài trước khi 4 phương án A, B, C, D mở ra!';

    var sec = p.prepSeconds || 3;
    if (p1Sec) p1Sec.textContent = sec;
    if (p1Card) p1Card.style.display = 'flex';

    gameState.playerTimerInterval = setInterval(function () {
      sec--;
      if (sec > 0 && p1Sec) {
        p1Sec.textContent = sec;
      } else {
        clearInterval(gameState.playerTimerInterval);
      }
    }, 1000);
  }

  // Pha 2 trên điện thoại: Bung 4 nút A, B, C, D cùng lúc và đếm ngược theo endTime
  function onPlayerReceivePhase2(p) {
    gameState.playerLastChoice = -1;
    showView('playerGameView');
    hideAllPlayerSubCards();

    var miniPrompt = document.getElementById('playerMiniPrompt');
    var p2Wrap = document.getElementById('playerPhase2Wrap');
    var barFill = document.getElementById('playerTimerBarFill');

    var qLabel = 'Câu ' + ((p.questionIndex || 0) + 1) + ': ' + (p.prompt || '');
    if (miniPrompt) miniPrompt.textContent = qLabel;

    if (Array.isArray(p.options)) {
      for (var i = 0; i < 4; i++) {
        var lbl = document.getElementById('playerPadLabel' + i);
        if (lbl) lbl.textContent = p.options[i] || '';
      }
    }

    if (barFill) barFill.style.width = '100%';
    if (p2Wrap) p2Wrap.style.display = 'block';
    SFX.revealPop();

    var durationMs = (p.durationSec || 15) * 1000;
    var endTime = p.endTime || (Date.now() + durationMs);

    gameState.playerTimerInterval = setInterval(function () {
      var remainingMs = Math.max(0, endTime - Date.now());
      var pct = (remainingMs / durationMs) * 100;
      if (barFill) barFill.style.width = Math.max(0, pct) + '%';
      if (remainingMs <= 0) {
        clearInterval(gameState.playerTimerInterval);
      }
    }, 100);
  }

  // Pha 3 trên điện thoại: Người chơi chạm chọn 1 đáp án -> Khóa màn hình cá nhân ngay lập tức
  function playerSubmitAnswer(choiceIndex) {
    var numericChoice = parseInt(choiceIndex, 10);
    if (isNaN(numericChoice) || gameState.playerLastChoice !== -1) return;

    gameState.playerLastChoice = numericChoice;
    hideAllPlayerSubCards();

    var submittedState = document.getElementById('playerSubmittedState');
    var submittedDesc = document.getElementById('playerSubmittedDesc');
    var chosenLetter = OPTION_LETTERS[numericChoice] || 'A';

    if (submittedDesc) {
      submittedDesc.textContent = 'Bạn đã chọn phương án ' + chosenLetter + '. Bạn nhanh đấy, chờ mọi người một chút nhé...';
    }
    if (submittedState) submittedState.style.display = 'block';

    SFX.pop();

    broadcastMsg('player_answer', {
      playerId: gameState.myPlayerId,
      answerIndex: numericChoice,
      pin: gameState.pin
    });
  }

  // Pha 4 trên điện thoại: Lật bài -> Đổi toàn bộ nền sang Xanh Lá (Chính xác!) hoặc Đỏ (Sai mất rồi!)
  function onPlayerReceivePhase4(p) {
    showView('playerGameView');
    hideAllPlayerSubCards();

    var resultOverlay = document.getElementById('playerResultOverlay');
    var resultIcon = document.getElementById('playerResultIcon');
    var resultText = document.getElementById('playerResultText');
    var scorePlus = document.getElementById('playerScorePlus');
    var streakPill = document.getElementById('playerResultStreakPill');
    var rankStatus = document.getElementById('playerRankStatus');
    var curScoreEl = document.getElementById('playerCurrentScore');
    var headerStreak = document.getElementById('playerStreakTag');

    var myScoreObj = (p.scores || []).find(function (x) { return x.id === gameState.myPlayerId; });
    var isCorrect = (gameState.playerLastChoice !== -1 && Number(gameState.playerLastChoice) === Number(p.correctIndex));
    var earned = (myScoreObj && myScoreObj.lastEarned > 0) ? myScoreObj.lastEarned : (isCorrect ? 850 : 0);

    if (myScoreObj) {
      gameState.playerLocalScore = myScoreObj.score;
      gameState.playerLocalStreak = myScoreObj.streak || 0;
    } else if (isCorrect) {
      gameState.playerLocalScore += earned;
      gameState.playerLocalStreak += 1;
    } else {
      gameState.playerLocalStreak = 0;
    }

    if (curScoreEl) curScoreEl.textContent = gameState.playerLocalScore.toLocaleString();
    if (headerStreak) {
      if (gameState.playerLocalStreak >= 2) {
        headerStreak.style.display = 'inline-flex';
        headerStreak.innerHTML = '🔥 <span>' + gameState.playerLocalStreak + '</span>';
      } else {
        headerStreak.style.display = 'none';
      }
    }

    if (resultOverlay) {
      resultOverlay.classList.remove('is-correct-bg', 'is-wrong-bg');
      resultOverlay.classList.add(isCorrect ? 'is-correct-bg' : 'is-wrong-bg');
      resultOverlay.style.display = 'block';
    }

    if (isCorrect) {
      if (resultIcon) resultIcon.textContent = '🎉';
      if (resultText) resultText.textContent = 'Chính xác!';
      if (scorePlus) scorePlus.textContent = '+' + earned + ' điểm';
      if (streakPill) {
        if (gameState.playerLocalStreak >= 2) {
          streakPill.style.display = 'inline-block';
          streakPill.textContent = '🔥 Chuỗi ' + gameState.playerLocalStreak + ' câu đúng liên tiếp!';
        } else {
          streakPill.style.display = 'none';
        }
      }
      if (rankStatus) {
        rankStatus.textContent = 'Tuyệt vời! Hãy nhìn lên màn hình lớn để xem biểu đồ thống kê.';
      }
      SFX.correct();
    } else {
      var correctLetter = p.correctLetter || OPTION_LETTERS[p.correctIndex] || 'A';
      if (resultIcon) resultIcon.textContent = gameState.playerLastChoice === -1 ? '⏰' : '😢';
      if (resultText) {
        resultText.textContent = gameState.playerLastChoice === -1 ? 'Hết giờ mất rồi!' : 'Sai mất rồi!';
      }
      if (scorePlus) {
        scorePlus.textContent = 'Đáp án đúng là ' + correctLetter + ': ' + (p.correctText || '');
      }
      if (streakPill) streakPill.style.display = 'none';
      if (rankStatus) {
        rankStatus.textContent = 'Đừng nản chí, chuẩn bị gỡ điểm ở câu tiếp theo nhé!';
      }
      SFX.wrong();
    }
  }

  // Pha 5 trên điện thoại: Cập nhật thứ hạng hiện tại ("Bạn đang đứng Hạng 2 – Chỉ kém người dẫn đầu 110 điểm")
  function onPlayerReceivePhase5(p) {
    showView('playerGameView');
    hideAllPlayerSubCards();

    var p5Card = document.getElementById('playerPhase5Card');
    var p5Medal = document.getElementById('playerPhase5Medal');
    var p5Title = document.getElementById('playerPhase5Title');
    var p5Gap = document.getElementById('playerPhase5Gap');
    var p5Total = document.getElementById('playerPhase5Total');

    var myRankObj = (p.rankings || []).find(function (x) { return x.id === gameState.myPlayerId; });
    if (myRankObj) {
      var r = myRankObj.rank;
      if (p5Medal) {
        p5Medal.textContent = r === 1 ? '👑' : (r === 2 ? '🥈' : (r === 3 ? '🥉' : '🏅'));
      }
      if (p5Title) {
        p5Title.textContent = 'Bạn đang đứng Hạng ' + r;
      }
      if (p5Gap) {
        if (r === 1) {
          p5Gap.textContent = 'Xuất sắc! Bạn đang dẫn đầu cả phòng!';
        } else {
          p5Gap.textContent = 'Chỉ kém người dẫn đầu ' + (myRankObj.gapToLeader || 0).toLocaleString() + ' điểm';
        }
      }
      if (p5Total) {
        p5Total.textContent = 'Tổng điểm hiện tại: ' + myRankObj.score.toLocaleString() + ' đ';
      }
    }

    if (p5Card) p5Card.style.display = 'block';
    SFX.pop();
  }

  // ==================== BỘ XỬ LÝ TIN NHẮN ĐỒNG BỘ TRUNG TÂM ====================
  function handleIncomingSyncMessage(data) {
    if (!data || !data.action) return;
    if (data.msgId) {
      if (_processedMsgIds[data.msgId]) return;
      _processedMsgIds[data.msgId] = true;
    }

    var action = data.action;
    var p = data.payload || {};

    // --- XỬ LÝ PHÍA ADMIN (HOST) ---
    if (gameState.role === 'host') {
      if (normalizePin(p.pin) !== normalizePin(gameState.pin)) return;

      if (action === 'player_join') {
        var exists = gameState.players.some(function (x) { return x.id === p.id; });
        if (!exists) {
          gameState.players.push({
            id: p.id,
            name: p.name,
            avatar: p.avatar || '🐼',
            score: 0,
            prevRank: gameState.players.length + 1,
            streak: 0,
            lives: 3,
            lastAnswerIndex: -1,
            answeredAt: 0,
            lastPointsEarned: 0,
            isBot: false
          });
          SFX.pop();
          renderPlayerList();
          if (typeof showToast === 'function') {
            showToast((p.avatar || '🐼') + ' ' + p.name + ' đã vào phòng!', 'success');
          }
        } else {
          // Vẫn gửi lại danh sách phòng để máy người chơi xác nhận đồng bộ
          broadcastLobbyRoster();
        }
      } else if (action === 'player_answer') {
        var existingP = gameState.players.find(function (x) { return x.id === p.playerId; });
        if (!existingP && p.playerId) {
          gameState.players.push({
            id: p.playerId,
            name: 'Người chơi',
            avatar: '🐼',
            score: 0,
            prevRank: gameState.players.length + 1,
            streak: 0,
            lives: 3,
            lastAnswerIndex: -1,
            answeredAt: 0,
            lastPointsEarned: 0,
            isBot: false
          });
        }
        recordPlayerAnswerOnHost(p.playerId, p.answerIndex);
      }
      return;
    }

    // --- XỬ LÝ PHÍA NGƯỜI CHƠI (PLAYER) ---
    if (gameState.role === 'player') {
      if (normalizePin(p.pin) !== normalizePin(gameState.pin)) return;

      if (action === 'lobby_roster_sync') {
        var incomingPlayers = Array.isArray(p.players) ? p.players : [];
        if (incomingPlayers.some(function (x) { return x.id === gameState.myPlayerId; })) {
          gameState.playerJoinAcked = true;
          stopPlayerJoinHeartbeat();
        }
        if (gameState.status === 'player_lobby') {
          renderPlayerWaitingRoster(incomingPlayers);
        }
      } else if (action === 'phase_1_getready') {
        onPlayerReceivePhase1(p);
      } else if (action === 'phase_2_active') {
        onPlayerReceivePhase2(p);
      } else if (action === 'phase_4_reveal') {
        onPlayerReceivePhase4(p);
      } else if (action === 'phase_5_leaderboard') {
        onPlayerReceivePhase5(p);
      } else if (action === 'game_over') {
        onPlayerReceivePhase5({
          rankings: p.rankings || []
        });
        var p5Wait = document.querySelector('#playerPhase5Card .phase5-wait-hint');
        if (p5Wait) p5Wait.textContent = '🏆 Trận đấu đã kết thúc! Xem Bục Vinh Quang trên màn hình lớn.';
        if (typeof confetti === 'function') {
          try { confetti(); } catch (e) { }
        }
      }
    }
  }

  function setupCrossTabSync() {
    if (_arenaChannel) {
      _arenaChannel.onmessage = function (ev) {
        handleIncomingSyncMessage(ev.data);
      };
    }

    window.addEventListener('storage', function (e) {
      if (e.key === 'wq_arena_sync' && e.newValue) {
        try {
          var syncData = JSON.parse(e.newValue);
          handleIncomingSyncMessage(syncData);
        } catch (err) { }
      } else if (e.key && e.key.indexOf('wq_arena_roster_') === 0 && e.newValue) {
        if (gameState.role === 'player' && gameState.status === 'player_lobby') {
          var expectedKey = 'wq_arena_roster_' + normalizePin(gameState.pin);
          if (e.key === expectedKey) {
            try {
              var rosterData = JSON.parse(e.newValue);
              if (rosterData && Array.isArray(rosterData.players)) {
                renderPlayerWaitingRoster(rosterData.players);
              }
            } catch (err2) { }
          }
        }
      }
    });
  }

  // ==================== GẮN SỰ KIỆN GIAO DIỆN ====================
  function bindEvents() {
    var tabHostBtn = document.getElementById('tabHostBtn');
    if (tabHostBtn) tabHostBtn.onclick = function () { switchRoleTab('host'); };

    var tabPlayerBtn = document.getElementById('tabPlayerBtn');
    if (tabPlayerBtn) {
      tabPlayerBtn.onclick = function () {
        switchRoleTab(isAdminLoggedIn() ? 'lobby_view' : 'player');
      };
    }

    // Admin Login Form
    var adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
      adminLoginForm.onsubmit = function (e) {
        e.preventDefault();
        var uInput = document.getElementById('adminUsernameInput');
        var pInput = document.getElementById('adminPasswordInput');
        var u = uInput ? uInput.value : '';
        var p = pInput ? pInput.value : '';

        if (loginAdmin(u, p)) {
          SFX.correct();
          if (typeof showToast === 'function') showToast('👑 Đăng nhập Admin thành công!', 'success');
          switchRoleTab('host');
        } else {
          SFX.wrong();
          if (typeof showToast === 'function') showToast('Sai tài khoản hoặc mật khẩu Admin! (Mặc định: admin / 123456)', 'error');
        }
        return false;
      };
    }

    var btnQuickFillAdmin = document.getElementById('btnQuickFillAdmin');
    if (btnQuickFillAdmin) {
      btnQuickFillAdmin.onclick = function () {
        var uInput = document.getElementById('adminUsernameInput');
        var pInput = document.getElementById('adminPasswordInput');
        if (uInput) uInput.value = 'admin';
        if (pInput) pInput.value = '123456';
      };
    }

    var btnAdminLogout = document.getElementById('btnAdminLogout');
    if (btnAdminLogout) {
      btnAdminLogout.onclick = logoutAdmin;
    }

    // Lắng nghe sự kiện Đăng nhập / Đăng xuất Admin từ nút "Hồ sơ" trên Header
    window.addEventListener('wq-admin-auth-changed', function (ev) {
      var isLogged = ev && ev.detail && ev.detail.loggedIn;
      if (isLogged) {
        SFX.correct();
        switchRoleTab('host');
      } else {
        stopCloudPolling();
        cleanupCloudRoomMessages();
        gameState.status = 'config';
        switchRoleTab('player');
      }
    });

    window.addEventListener('wq-admin-open-host', function () {
      if (isAdminLoggedIn()) {
        switchRoleTab('host');
      }
    });

    // Chọn 4 chế độ Game Kahoot
    var gmCards = document.querySelectorAll('.arena-gamemode-card');
    gmCards.forEach(function (card) {
      card.onclick = function () {
        gmCards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        gameState.gameMode = card.dataset.gamemode || 'speed';
        SFX.tick();

        var qTypeGroup = document.getElementById('hostQTypeGroup');
        if (qTypeGroup) {
          qTypeGroup.style.opacity = (gameState.gameMode === 'listening' || gameState.gameMode === 'sentence') ? '0.45' : '1';
        }
      };
    });

    var btnCreateRoom = document.getElementById('btnCreateRoom');
    if (btnCreateRoom) btnCreateRoom.onclick = createRoom;

    var btnAddBot = document.getElementById('btnAddBot');
    if (btnAddBot) btnAddBot.onclick = addMockBot;

    var btnCancelRoom = document.getElementById('btnCancelRoom');
    if (btnCancelRoom) {
      btnCancelRoom.onclick = function () {
        stopCloudPolling();
        cleanupCloudRoomMessages();
        gameState.status = 'config';
        switchRoleTab('host');
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
            if (typeof showToast === 'function') showToast('Đã sao chép link mời vào phòng!', 'success');
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

    // Nút điều khiển của Admin từ Pha 4 -> Pha 5 (Bảng xếp hạng)
    var btnGoPhase5Leaderboard = document.getElementById('btnGoPhase5Leaderboard');
    if (btnGoPhase5Leaderboard) {
      btnGoPhase5Leaderboard.onclick = startPhase5Leaderboard;
    }

    // Nút điều khiển của Admin từ Pha 5 -> Câu tiếp theo (Quay lại Pha 1)
    var btnContinueGame = document.getElementById('btnContinueGame');
    if (btnContinueGame) {
      btnContinueGame.onclick = advanceToNextQuestion;
    }

    var hostQAudioBtn = document.getElementById('hostQAudioBtn');
    if (hostQAudioBtn) {
      hostQAudioBtn.onclick = function () {
        var q = gameState.questions[gameState.currentQuestionIndex];
        if (q && q.hanziAudio && typeof speak === 'function') {
          speak(q.hanziAudio);
        }
      };
    }

    var btnPlayAgain = document.getElementById('btnPlayAgain');
    if (btnPlayAgain) {
      btnPlayAgain.onclick = function () {
        stopCloudPolling();
        cleanupCloudRoomMessages();
        gameState.status = 'config';
        switchRoleTab('host');
        populateDeckOptions();
      };
    }

    var btnExitArena = document.getElementById('btnExitArena');
    if (btnExitArena) {
      btnExitArena.onclick = function () {
        stopCloudPolling();
        cleanupCloudRoomMessages();
        window.location.href = '../index.html';
      };
    }

    // Player Join
    var btnPlayerJoin = document.getElementById('btnPlayerJoin');
    if (btnPlayerJoin) btnPlayerJoin.onclick = playerJoin;

    document.querySelectorAll('#avatarPickGrid .avatar-btn').forEach(function (btn) {
      btn.onclick = function () {
        document.querySelectorAll('#avatarPickGrid .avatar-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        var nameInput = document.getElementById('playerInputName');
        savePlayerProfile(nameInput ? nameInput.value : gameState.playerProfile.name, btn.dataset.avatar);
        SFX.tick();
      };
    });

    // Player 4 pads click (Pha 2 -> Pha 3)
    document.querySelectorAll('.player-pad-btn').forEach(function (btn) {
      btn.onclick = function () {
        var idx = parseInt(btn.dataset.index, 10);
        playerSubmitAnswer(idx);
      };
    });
  }

  document.addEventListener('DOMContentLoaded', initArena);
})();
