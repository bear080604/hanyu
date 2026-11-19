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
    gameState.role = 'player';
    gameState.pin = '';
    gameState.myPlayerId = '';
    syncBrowserUrl('', '');
    if (window.WQProfile && typeof window.WQProfile.logoutAdmin === 'function') {
      window.WQProfile.logoutAdmin();
    } else {
      sessionStorage.removeItem('wq_arena_admin_logged');
      localStorage.removeItem('wq_arena_admin_logged');
      localStorage.removeItem('wq_arena_admin_user');
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
    }, 450);
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

  // ==================== ROOM RETENTION / EXPIRATION PRESETS ====================
  var ROOM_DURATION_MAP = {
    '15m': { ms: 15 * 60 * 1000, label: '15 phút' },
    '30m': { ms: 30 * 60 * 1000, label: '30 phút' },
    '1h': { ms: 60 * 60 * 1000, label: '1 giờ' },
    '6h': { ms: 6 * 60 * 60 * 1000, label: '6 giờ' },
    '1d': { ms: 24 * 60 * 60 * 1000, label: '1 ngày (24h)' },
    '7d': { ms: 7 * 24 * 60 * 60 * 1000, label: '7 ngày' },
    'forever': { ms: 0, label: 'Vĩnh viễn' }
  };

  var _expiryTickerInterval = null;

  function formatRemainingExpiry(expiresAt, durationLabel) {
    if (!expiresAt || Number(expiresAt) <= 0) {
      return '♾️ Lưu trữ: Vĩnh viễn';
    }
    var remMs = Number(expiresAt) - Date.now();
    if (remMs <= 0) {
      return '⌛ Đã hết hạn lưu trữ';
    }
    var remSec = Math.ceil(remMs / 1000);
    var timeStr = '';
    if (remSec >= 86400) {
      var days = Math.floor(remSec / 86400);
      var hrs = Math.floor((remSec % 86400) / 3600);
      timeStr = days + ' ngày ' + hrs + 'h';
    } else if (remSec >= 3600) {
      var h = Math.floor(remSec / 3600);
      var m = Math.floor((remSec % 3600) / 60);
      timeStr = h + 'h ' + m + 'p';
    } else {
      var min = Math.floor(remSec / 60);
      var sec = remSec % 60;
      timeStr = min + 'p ' + (sec < 10 ? '0' + sec : sec) + 's';
    }
    return 'Thời hạn: ' + (durationLabel || '30 phút') + ' (Còn ' + timeStr + ')';
  }

  function syncBrowserUrl(pin, role) {
    try {
      if (!window.history || typeof window.history.replaceState !== 'function') return;
      var cleanP = normalizePin(pin);
      if (!cleanP) {
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
      var params = new URLSearchParams();
      params.set('pin', cleanP);
      if (role === 'host') {
        params.set('role', 'host');
      }
      window.history.replaceState(null, '', window.location.pathname + '?' + params.toString());
    } catch (e) { }
  }

  // ==================== GAME STATE ====================
  var gameState = {
    role: 'player', // Mặc định mở trang là 'player' (Người chơi). Chọn tab Admin mới đăng nhập 'host'.
    pin: '',
    accessMode: 'public', // 'public' (Công khai - Bảng xếp hạng trực tiếp) | 'private' (Riêng tư - Nhập mã PIN)
    status: 'config', // 'config' | 'lobby' | 'phase1' | 'phase2' | 'phase4' | 'phase5' | 'podium'
    phase: 0, // 1..5
    gameMode: 'speed',
    deckValue: 'HSK 1',
    deckName: 'HSK 1',
    deckWords: [],
    questionType: 'hanzi_to_mean',
    totalQuestions: 10,
    timePerQuestion: 15,
    roomDurationKey: '30m',
    roomDurationLabel: '30 phút',
    roomCreatedAt: 0,
    roomExpiresAt: null,
    currentQuestionIndex: 0,
    questions: [],
    players: [], // [{ id, name, avatar, score, prevRank, streak, lives, lastAnswerIndex, answeredAt, lastPointsEarned, isBot }]
    phase1Timer: null,
    timerInterval: null,
    botTimers: [],
    timerRemaining: 0,
    questionStartTime: 0,
    questionEndTime: 0,
    phase1EndAt: 0,
    wasEarlyCutoff: false,
    // Player-side state
    myPlayerId: '',
    isReady: false,
    clockOffset: 0,
    isSoloRunner: false,
    soloPhaseTimer: null,
    soloTimeoutTimer: null,
    soloQuestionStartTime: 0,
    soloQuestionEndTime: 0,
    playerTimerInterval: null,
    playerLastChoice: -1,
    playerLocalScore: 0,
    playerLocalStreak: 0,
    playerLastPhaseAction: '',
    playerLastPhasePayload: null,
    playerProfile: {
      name: '',
      avatar: '🐼',
      isReady: false
    }
  };

  function getHostNow() {
    return Date.now() + (gameState.clockOffset || 0);
  }

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
    speed: 'Phản xạ tốc độ',
    listening: 'Thính âm đoán chữ',
    sentence: 'Điền câu ngữ cảnh',
    survival: 'Sinh tồn 3 lượt'
  };

  // ==================== VIEW MANAGEMENT ====================
  function renderAdminReturnBanner(pin) {
    var isLogged = isAdminLoggedIn();
    var joinBanner = document.getElementById('adminJoinViewBanner');
    var lobbyBanner = document.getElementById('adminLobbyViewBanner');
    var lobbyPinText = document.getElementById('adminLobbyPinText');

    if (joinBanner) joinBanner.style.display = isLogged ? 'flex' : 'none';
    if (lobbyBanner) lobbyBanner.style.display = isLogged ? 'flex' : 'none';
    if (lobbyPinText) {
      var displayPin = pin || gameState.pin || localStorage.getItem('wq_arena_active_host_pin') || '';
      lobbyPinText.textContent = formatPinCode(displayPin);
    }
  }

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
    renderAdminReturnBanner(gameState.pin);
  }

  // ==================== INIT ARENA ====================
  function initArena() {
    loadSavedPlayerProfile();
    populateDeckOptions();
    syncCustomDecksFromCloud();
    fetchPublicRooms();
    startPublicRoomsPolling();
    bindEvents();
    setupCrossTabSync();
    checkUrlParams();

    setTimeout(function () {
      if (gameState.status === 'config') {
        populateDeckOptions();
        fetchPublicRooms();
      }
    }, 900);
  }

  function normalizeCloudWord(w) {
    if (!w) return w;
    var enriched = {
      h: w.h || w.hanzi || '',
      p: w.p || w.pinyin || '',
      m: w.m || w.meaning || '',
      ex: w.ex || w.e || w.example || '',
      exp: w.exp || w.example_pinyin || '',
      exm: w.exm || w.example_meaning || ''
    };
    if (typeof window.enrichWordWithSentence === 'function') {
      return window.enrichWordWithSentence(enriched);
    }
    return enriched;
  }

  function syncCustomDecksFromCloud() {
    fetch(CLOUD_API_BASE + '/api/decks?user_id=default_user')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success || !Array.isArray(res.data)) return;
        var localDecks = [];
        try {
          localDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
        } catch (e) {
          localDecks = [];
        }

        var cloudIds = {};
        var cloudDecks = res.data.map(function (d) {
          cloudIds[d.id] = true;
          var matchLocal = localDecks.find(function (ld) {
            return String(ld.cloudId || ld.id) === String(d.id) ||
              (ld.name === d.name && Array.isArray(ld.words) && ld.words.length > 0);
          });
          var cachedWords = (matchLocal && Array.isArray(matchLocal.words)) ? matchLocal.words : [];
          return {
            id: d.id,
            cloudId: d.id,
            name: d.name,
            words: cachedWords,
            wordCount: Number(d.word_count) || cachedWords.length || 0,
            createdAt: (d.created_at || '').split('T')[0] || (matchLocal && matchLocal.createdAt) || ''
          };
        });

        var unsyncedLocal = localDecks.filter(function (ld) {
          return !ld.cloudId && !cloudIds[ld.id] && !cloudDecks.some(function (cd) { return cd.name === ld.name; });
        });

        var merged = unsyncedLocal.concat(cloudDecks);
        try {
          localStorage.setItem('wq_custom_decks', JSON.stringify(merged));
        } catch (e) { }

        populateDeckOptions();

        // Tự động tải ngầm danh sách từ vựng (words) của các bộ từ tự tạo chưa cache words
        merged.forEach(function (deckItem) {
          var targetId = deckItem.cloudId || deckItem.id;
          if (targetId && (!Array.isArray(deckItem.words) || deckItem.words.length === 0) && (deckItem.wordCount > 0)) {
            fetch(CLOUD_API_BASE + '/api/decks/' + encodeURIComponent(targetId))
              .then(function (r) { return r.json(); })
              .then(function (detailRes) {
                if (detailRes && detailRes.success && detailRes.data && Array.isArray(detailRes.data.words)) {
                  var normalizedWords = detailRes.data.words.map(normalizeCloudWord);
                  try {
                    var currentList = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
                    var target = currentList.find(function (x) {
                      return String(x.cloudId || x.id) === String(targetId);
                    });
                    if (target) {
                      target.words = normalizedWords;
                      target.wordCount = normalizedWords.length;
                      localStorage.setItem('wq_custom_decks', JSON.stringify(currentList));
                      populateDeckOptions();
                    }
                  } catch (e) { }
                }
              })
              .catch(function () { });
          }
        });
      })
      .catch(function () { });
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

    var qAvatar = document.getElementById('quickProfileAvatar');
    var qName = document.getElementById('quickProfileName');
    if (qAvatar) qAvatar.textContent = savedAvatar;
    if (qName) qName.textContent = savedName || 'Bạn (Bấm để đổi)';

    document.querySelectorAll('#avatarPickGrid .avatar-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.avatar === savedAvatar);
    });
  }

  function savePlayerProfile(name, avatar) {
    if (name && name.trim()) {
      gameState.playerProfile.name = name.trim();
      localStorage.setItem('wq_arena_player_name', gameState.playerProfile.name);
      var qName = document.getElementById('quickProfileName');
      if (qName) qName.textContent = gameState.playerProfile.name;
    }
    if (avatar) {
      gameState.playerProfile.avatar = avatar;
      localStorage.setItem('wq_arena_player_avatar', avatar);
      var qAvatar = document.getElementById('quickProfileAvatar');
      if (qAvatar) qAvatar.textContent = avatar;
    }
  }

  function populateDeckOptions() {
    var select = document.getElementById('hostDeckSelect');
    if (!select) return;
    var previousVal = select.value;
    select.innerHTML = '';

    var hasPendingCustom = false;
    var pendingDeckName = '';
    try {
      var pendingStr = localStorage.getItem('wq_pending_deck');
      if (pendingStr) {
        var pending = JSON.parse(pendingStr);
        if (pending && Array.isArray(pending.words) && pending.words.length >= 1) {
          pendingDeckName = String(pending.name || '').trim();
          var optPending = document.createElement('option');
          optPending.value = 'pending_custom';
          optPending.textContent = (pendingDeckName || 'Bộ từ đang chọn') + ' (' + pending.words.length + ' từ)';
          select.appendChild(optPending);
          hasPendingCustom = true;
        }
      }
    } catch (e) { }

    // 1. Hiển thị TẤT CẢ các bộ từ trong mục Tự tạo (wq_custom_decks - bao gồm cả Cloud & Local)
    try {
      var customDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
      if (Array.isArray(customDecks) && customDecks.length > 0) {
        var optGroup = document.createElement('optgroup');
        optGroup.label = 'Bộ từ tự tạo';
        customDecks.forEach(function (cd) {
          var count = (Array.isArray(cd.words) && cd.words.length > 0)
            ? cd.words.length
            : (Number(cd.wordCount) || Number(cd.word_count) || 0);
          if (count >= 1) {
            var opt = document.createElement('option');
            opt.value = 'custom:' + (cd.cloudId || cd.id || cd.name);
            opt.textContent = cd.name + ' (' + count + ' từ)';
            optGroup.appendChild(opt);
          }
        });
        if (optGroup.children.length > 0) {
          select.appendChild(optGroup);
        }
      }
    } catch (e) { }

    // 2. Từ yêu thích
    try {
      var favs = JSON.parse(localStorage.getItem('wq_favorites')) || [];
      if (Array.isArray(favs) && favs.length >= 1) {
        var optFav = document.createElement('option');
        optFav.value = 'favorites';
        optFav.textContent = 'Từ yêu thích (' + favs.length + ' từ)';
        select.appendChild(optFav);
      }
    } catch (e) { }

    // 3. Các cấp độ HSK 1 - 6 mặc định
    if (typeof DATA !== 'undefined') {
      var hskGroup = document.createElement('optgroup');
      hskGroup.label = 'Giáo trình HSK tiêu chuẩn';
      Object.keys(DATA).forEach(function (lvl) {
        if (lvl === 'custom') return;
        var count = DATA[lvl] ? DATA[lvl].length : 0;
        if (count >= 4) {
          var opt = document.createElement('option');
          opt.value = lvl;
          opt.textContent = lvl + ' (' + count + ' từ)';
          hskGroup.appendChild(opt);
        }
      });
      if (hskGroup.children.length > 0) {
        select.appendChild(hskGroup);
      }
    }

    if (hasPendingCustom && localStorage.getItem('wq_pending_mode') === 'arena') {
      select.value = 'pending_custom';
      localStorage.removeItem('wq_pending_mode');
      if (isAdminLoggedIn()) {
        switchRoleTab('host');
      }
    } else if (previousVal && Array.from(select.options).some(function (o) { return o.value === previousVal; })) {
      select.value = previousVal;
    }
  }

  // ==================== LƯU TRỮ PHÒNG THEO THỜI HẠN & KHÔI PHỤC KHI TẢI LẠI TRANG ====================
  function updateExpiryBadges() {
    var expiryText = formatRemainingExpiry(gameState.roomExpiresAt, gameState.roomDurationLabel);
    var hostBadge = document.getElementById('lobbyExpiryBadge');
    if (hostBadge) {
      hostBadge.textContent = expiryText;
    }
    var playerBadge = document.getElementById('playerRoomExpiryBadge');
    if (playerBadge) {
      playerBadge.style.display = 'inline-flex';
      playerBadge.textContent = expiryText;
    }

    // Kiểm tra nếu phòng đã hết thời hạn lưu trữ
    if (gameState.pin && gameState.roomExpiresAt && Number(gameState.roomExpiresAt) > 0 && Date.now() >= Number(gameState.roomExpiresAt)) {
      var expiredPin = gameState.pin;
      if (gameState.role === 'host') {
        deleteSavedRoom(expiredPin, true);
        if (typeof showToast === 'function') {
          showToast('Phòng #' + formatPinCode(expiredPin) + ' đã hết thời hạn lưu trữ.', 'warning');
        }
      } else {
        playerLeaveRoom(true);
        if (typeof showToast === 'function') {
          showToast('Phòng #' + formatPinCode(expiredPin) + ' đã hết thời hạn lưu trữ.', 'warning');
        }
      }
    }
  }

  function startExpiryCountdownTicker() {
    if (_expiryTickerInterval) {
      clearInterval(_expiryTickerInterval);
    }
    updateExpiryBadges();
    _expiryTickerInterval = setInterval(function () {
      updateExpiryBadges();
      if (gameState.role === 'host' && gameState.status === 'config') {
        renderSavedRoomsList();
      }
    }, 1000);
  }

  function getSavedRoomPins() {
    try {
      var arr = JSON.parse(localStorage.getItem('wq_arena_saved_room_pins') || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function pruneExpiredRooms() {
    var pins = getSavedRoomPins();
    var validPins = [];
    pins.forEach(function (p) {
      var cleanP = normalizePin(p);
      if (!cleanP) return;
      try {
        var raw = localStorage.getItem('wq_arena_host_room_' + cleanP);
        if (!raw) return;
        var room = JSON.parse(raw);
        if (room && room.expiresAt && Number(room.expiresAt) > 0 && Date.now() >= Number(room.expiresAt)) {
          unpublishPublicRoom(cleanP);
          unpublishRoomMeta(cleanP);
          localStorage.removeItem('wq_arena_host_room_' + cleanP);
          localStorage.removeItem('wq_arena_roster_' + cleanP);
          localStorage.removeItem('wq_arena_player_session_' + cleanP);
          return;
        }
        validPins.push(cleanP);
      } catch (e) { }
    });
    try {
      localStorage.setItem('wq_arena_saved_room_pins', JSON.stringify(validPins));
    } catch (e) { }
    return validPins;
  }

  function saveHostRoomState() {
    if (gameState.role !== 'host' || !gameState.pin) return;
    var cleanP = normalizePin(gameState.pin);
    var snapshot = {
      pin: cleanP,
      accessMode: gameState.accessMode || 'public',
      createdAt: gameState.roomCreatedAt || Date.now(),
      expiresAt: gameState.roomExpiresAt,
      durationKey: gameState.roomDurationKey || '30m',
      durationLabel: gameState.roomDurationLabel || '30 phút',
      status: gameState.status,
      phase: gameState.phase,
      gameMode: gameState.gameMode,
      deckValue: gameState.deckValue,
      deckName: gameState.deckName,
      questionType: gameState.questionType,
      totalQuestions: gameState.totalQuestions,
      timePerQuestion: gameState.timePerQuestion,
      currentQuestionIndex: gameState.currentQuestionIndex,
      questions: gameState.questions,
      players: gameState.players,
      questionStartTime: gameState.questionStartTime,
      questionEndTime: gameState.questionEndTime,
      wasEarlyCutoff: gameState.wasEarlyCutoff,
      updatedAt: Date.now()
    };
    try {
      localStorage.setItem('wq_arena_host_room_' + cleanP, JSON.stringify(snapshot));
      localStorage.setItem('wq_arena_active_host_pin', cleanP);
      var pins = getSavedRoomPins();
      if (pins.indexOf(cleanP) === -1) {
        pins.unshift(cleanP);
        localStorage.setItem('wq_arena_saved_room_pins', JSON.stringify(pins));
      }
    } catch (e) { }
  }

  function deleteSavedRoom(pin, silent) {
    var cleanP = normalizePin(pin);
    if (!cleanP) return;
    try {
      localStorage.removeItem('wq_arena_host_room_' + cleanP);
      localStorage.removeItem('wq_arena_roster_' + cleanP);
      localStorage.removeItem('wq_arena_player_session_' + cleanP);
      var pins = getSavedRoomPins().filter(function (x) { return normalizePin(x) !== cleanP; });
      localStorage.setItem('wq_arena_saved_room_pins', JSON.stringify(pins));
      if (normalizePin(localStorage.getItem('wq_arena_active_host_pin')) === cleanP) {
        localStorage.setItem('wq_arena_active_host_pin', pins[0] || '');
      }
    } catch (e) { }

    unpublishPublicRoom(cleanP);
    unpublishRoomMeta(cleanP);

    if (normalizePin(gameState.pin) === cleanP) {
      clearAllRoundTimers();
      stopCloudPolling();
      cleanupCloudRoomMessages();
      gameState.pin = '';
      gameState.players = [];
      gameState.status = 'config';
      syncBrowserUrl('', '');
      var tabCountEl = document.getElementById('adminTabPlayerCount');
      if (tabCountEl) tabCountEl.textContent = '0';
      if (isAdminLoggedIn()) {
        switchRoleTab('host');
      }
    }
    renderSavedRoomsList();
    if (!silent && typeof showToast === 'function') {
      showToast('Đã xóa phòng #' + formatPinCode(cleanP), 'info');
    }
  }

  function renderSavedRoomsList() {
    var panel = document.getElementById('hostSavedRoomsPanel');
    var listEl = document.getElementById('hostSavedRoomsList');
    if (!panel || !listEl) return;

    var validPins = pruneExpiredRooms();
    if (validPins.length === 0) {
      panel.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }

    panel.style.display = 'block';
    listEl.innerHTML = '';

    validPins.forEach(function (pin) {
      try {
        var raw = localStorage.getItem('wq_arena_host_room_' + pin);
        if (!raw) return;
        var r = JSON.parse(raw);
        var pCount = Array.isArray(r.players) ? r.players.length : 0;
        var statusLabel = 'Phòng chờ';
        if (r.status === 'phase1' || r.status === 'phase2' || r.status === 'phase4' || r.status === 'phase5') {
          statusLabel = 'Đang thi Câu ' + ((r.currentQuestionIndex || 0) + 1) + '/' + (r.totalQuestions || 10);
        } else if (r.status === 'podium') {
          statusLabel = 'Đã hoàn thành';
        }
        var expLabel = formatRemainingExpiry(r.expiresAt, r.durationLabel);
        var isCurrent = normalizePin(gameState.pin) === normalizePin(pin);

        var row = document.createElement('div');
        row.className = 'saved-room-item' + (isCurrent ? ' is-active-room' : '');
        row.innerHTML =
          '<div class="saved-room-info">' +
          '<div class="saved-room-top">' +
          '<span class="saved-room-pin">#' + formatPinCode(pin) + '</span>' +
          '<span class="saved-room-status">' + statusLabel + '</span>' +
          '<span class="saved-room-players">' + pCount + ' người chơi</span>' +
          '</div>' +
          '<div class="saved-room-meta">' +
          '<span>' + (r.deckName || 'HSK 1') + ' • ' + (r.totalQuestions || 10) + ' câu</span>' +
          '<span> • ' + expLabel + '</span>' +
          '</div>' +
          '</div>' +
          '<div class="saved-room-actions">' +
          '<button type="button" class="btn-resume-room" data-pin="' + pin + '">Vào lại</button>' +
          '<button type="button" class="btn-delete-room" data-pin="' + pin + '" title="Đóng & Xóa phòng này">Xóa</button>' +
          '</div>';
        listEl.appendChild(row);
      } catch (e) { }
    });

    listEl.querySelectorAll('.btn-resume-room').forEach(function (btn) {
      btn.onclick = function () {
        restoreHostRoomByPin(btn.dataset.pin);
      };
    });

    listEl.querySelectorAll('.btn-delete-room').forEach(function (btn) {
      btn.onclick = function () {
        deleteSavedRoom(btn.dataset.pin, false);
      };
    });
  }

  function restoreHostRoomByPin(pin) {
    var cleanP = normalizePin(pin);
    if (!cleanP) return false;
    pruneExpiredRooms();
    try {
      var raw = localStorage.getItem('wq_arena_host_room_' + cleanP);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!saved || (saved.expiresAt && Number(saved.expiresAt) > 0 && Date.now() >= Number(saved.expiresAt))) {
        return false;
      }

      clearAllRoundTimers();
      gameState.role = 'host';
      gameState.pin = cleanP;
      gameState.roomCreatedAt = saved.createdAt || Date.now();
      gameState.roomExpiresAt = saved.expiresAt || null;
      gameState.roomDurationKey = saved.durationKey || '30m';
      gameState.roomDurationLabel = saved.durationLabel || '30 phút';
      gameState.status = saved.status || 'lobby';
      gameState.phase = saved.phase || 0;
      gameState.gameMode = saved.gameMode || 'speed';
      gameState.deckValue = saved.deckValue || 'HSK 1';
      gameState.deckName = saved.deckName || 'HSK 1';
      gameState.accessMode = saved.accessMode || 'public';
      gameState.questionType = saved.questionType || 'hanzi_to_mean';
      gameState.totalQuestions = saved.totalQuestions || 10;
      gameState.timePerQuestion = saved.timePerQuestion || 15;
      gameState.currentQuestionIndex = saved.currentQuestionIndex || 0;
      gameState.questions = Array.isArray(saved.questions) ? saved.questions : [];
      gameState.players = Array.isArray(saved.players) ? saved.players : [];
      gameState.questionStartTime = saved.questionStartTime || Date.now();
      gameState.questionEndTime = saved.questionEndTime || (Date.now() + gameState.timePerQuestion * 1000);
      gameState.wasEarlyCutoff = !!saved.wasEarlyCutoff;

      localStorage.setItem('wq_arena_active_host_pin', cleanP);
      syncBrowserUrl(cleanP, 'host');
      publishRoomMeta(saved);
      startCloudPolling(cleanP);
      startExpiryCountdownTicker();
      renderLobby();

      var tabHostBtn = document.getElementById('tabHostBtn');
      var tabPlayerBtn = document.getElementById('tabPlayerBtn');
      if (tabPlayerBtn) tabPlayerBtn.classList.add('active');
      if (tabHostBtn) tabHostBtn.classList.remove('active');

      if (gameState.status === 'phase1') {
        startPhase1GetReady();
      } else if (gameState.status === 'phase2') {
        var remSec = Math.ceil((gameState.questionEndTime - Date.now()) / 1000);
        if (remSec > 1) {
          startPhase2ActiveAnswering(remSec);
        } else {
          startPhase4AnswerReveal();
        }
      } else if (gameState.status === 'phase4') {
        gameState.status = 'phase2'; // để startPhase4AnswerReveal vẽ lại đầy đủ biểu đồ cột Pha 4
        startPhase4AnswerReveal();
      } else if (gameState.status === 'phase5') {
        startPhase5Leaderboard();
      } else if (gameState.status === 'podium') {
        showPodium();
      } else {
        gameState.status = 'lobby';
        showView('hostLobbyView');
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function savePlayerSessionState() {
    if (gameState.role !== 'player' || !gameState.pin || !gameState.myPlayerId) return;
    var cleanP = normalizePin(gameState.pin);
    var sessionObj = {
      pin: cleanP,
      accessMode: gameState.accessMode || 'public',
      myPlayerId: gameState.myPlayerId,
      name: gameState.playerProfile.name || 'Người chơi',
      avatar: gameState.playerProfile.avatar || '🐼',
      isReady: !!gameState.isReady,
      clockOffset: gameState.clockOffset || 0,
      status: gameState.status,
      playerLastChoice: gameState.playerLastChoice,
      playerLocalScore: gameState.playerLocalScore,
      playerLocalStreak: gameState.playerLocalStreak,
      lastPhaseAction: gameState.playerLastPhaseAction || '',
      lastPhasePayload: gameState.playerLastPhasePayload || null,
      roomExpiresAt: gameState.roomExpiresAt || null,
      roomDurationLabel: gameState.roomDurationLabel || '',
      updatedAt: Date.now()
    };
    try {
      localStorage.setItem('wq_arena_player_session_' + cleanP, JSON.stringify(sessionObj));
      localStorage.setItem('wq_arena_last_player_pin', cleanP);
    } catch (e) { }
  }

  function restorePlayerSessionByPin(pin) {
    var cleanP = normalizePin(pin);
    if (!cleanP) return false;
    try {
      var raw = localStorage.getItem('wq_arena_player_session_' + cleanP);
      if (!raw) return false;
      var sess = JSON.parse(raw);
      if (!sess || !sess.myPlayerId) return false;

      // Kiểm tra hạn lưu trữ của phòng
      if (sess.roomExpiresAt && Number(sess.roomExpiresAt) > 0 && Date.now() >= Number(sess.roomExpiresAt)) {
        localStorage.removeItem('wq_arena_player_session_' + cleanP);
        return false;
      }
      var detectedAccessMode = sess.accessMode || 'public';
      var hostRoomRaw = localStorage.getItem('wq_arena_host_room_' + cleanP);
      if (hostRoomRaw) {
        try {
          var hostRoom = JSON.parse(hostRoomRaw);
          if (hostRoom && hostRoom.expiresAt && Number(hostRoom.expiresAt) > 0 && Date.now() >= Number(hostRoom.expiresAt)) {
            localStorage.removeItem('wq_arena_player_session_' + cleanP);
            return false;
          }
          if (hostRoom) {
            sess.roomExpiresAt = hostRoom.expiresAt;
            sess.roomDurationLabel = hostRoom.durationLabel;
            if (hostRoom.accessMode) detectedAccessMode = hostRoom.accessMode;
          }
        } catch (e2) { }
      }

      gameState.role = 'player';
      gameState.pin = cleanP;
      gameState.accessMode = detectedAccessMode;
      gameState.myPlayerId = sess.myPlayerId;
      gameState.isReady = !!sess.isReady;
      gameState.clockOffset = Number(sess.clockOffset) || 0;
      gameState.playerProfile.name = sess.name || gameState.playerProfile.name || 'Bạn';
      gameState.playerProfile.avatar = sess.avatar || gameState.playerProfile.avatar || '🐼';
      gameState.playerProfile.isReady = gameState.isReady;
      gameState.status = sess.status || 'player_lobby';
      gameState.playerLastChoice = (typeof sess.playerLastChoice === 'number') ? sess.playerLastChoice : -1;
      gameState.playerLocalScore = Number(sess.playerLocalScore) || 0;
      gameState.playerLocalStreak = Number(sess.playerLocalStreak) || 0;
      gameState.playerLastPhaseAction = sess.lastPhaseAction || '';
      gameState.playerLastPhasePayload = sess.lastPhasePayload || null;
      gameState.roomExpiresAt = sess.roomExpiresAt || null;
      gameState.roomDurationLabel = sess.roomDurationLabel || '30 phút';

      syncBrowserUrl(cleanP, 'player');
      startCloudPolling(cleanP);
      startExpiryCountdownTicker();
      updatePlayerReadyUI();

      var avatarEl = document.getElementById('playerWaitingAvatar');
      var nameEl = document.getElementById('playerWaitingName');
      var pinEl = document.getElementById('playerConnectedPin');
      var headerAvatar = document.getElementById('playerHeaderAvatar');
      var headerName = document.getElementById('playerHeaderName');
      var curScoreEl = document.getElementById('playerCurrentScore');

      if (avatarEl) avatarEl.textContent = gameState.playerProfile.avatar;
      if (nameEl) nameEl.textContent = gameState.playerProfile.name;
      if (pinEl) pinEl.textContent = formatPinCode(cleanP);
      if (headerAvatar) headerAvatar.textContent = gameState.playerProfile.avatar;
      if (headerName) headerName.textContent = gameState.playerProfile.name;
      if (curScoreEl) curScoreEl.textContent = gameState.playerLocalScore.toLocaleString();

      // Nạp danh sách phòng chờ từ cache
      var cachedRoster = [];
      try {
        var savedRosterStr = localStorage.getItem('wq_arena_roster_' + cleanP);
        if (savedRosterStr) {
          var parsedRoster = JSON.parse(savedRosterStr);
          if (parsedRoster && Array.isArray(parsedRoster.players)) {
            cachedRoster = parsedRoster.players;
          }
        }
      } catch (e3) { }
      renderPlayerWaitingRoster(cachedRoster);

      // Gửi tín hiệu kết nối lại với cùng myPlayerId để Host đồng bộ trạng thái
      broadcastMsg('player_join', {
        id: gameState.myPlayerId,
        name: gameState.playerProfile.name,
        avatar: gameState.playerProfile.avatar,
        pin: cleanP,
        isReconnect: true
      });

      // Khôi phục đúng màn hình Pha hiện tại của người chơi
      if (gameState.status === 'player_game' && gameState.playerLastPhaseAction && gameState.playerLastPhasePayload) {
        var act = gameState.playerLastPhaseAction;
        var pay = gameState.playerLastPhasePayload;
        if (act === 'phase_1_getready') {
          onPlayerReceivePhase1(pay, true);
        } else if (act === 'phase_2_active') {
          if (gameState.playerLastChoice !== -1) {
            showView('playerGameView');
            hideAllPlayerSubCards();
            var submittedState = document.getElementById('playerSubmittedState');
            var submittedDesc = document.getElementById('playerSubmittedDesc');
            var chosenLetter = OPTION_LETTERS[gameState.playerLastChoice] || 'A';
            if (submittedDesc) {
              submittedDesc.textContent = 'Bạn đã chọn phương án ' + chosenLetter + '. Đang chờ kết quả câu hỏi...';
            }
            if (submittedState) submittedState.style.display = 'block';
          } else {
            onPlayerReceivePhase2(pay, true);
          }
        } else if (act === 'phase_4_reveal') {
          onPlayerReceivePhase4(pay, true);
        } else if (act === 'phase_5_leaderboard' || act === 'game_over') {
          onPlayerReceivePhase5(pay, true);
        } else {
          showView('playerLobbyView');
        }
      } else {
        gameState.status = 'player_lobby';
        showView('playerLobbyView');
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function playerLeaveRoom(silent) {
    stopPlayerJoinHeartbeat();
    stopCloudPolling();
    if (gameState.playerTimerInterval) {
      clearInterval(gameState.playerTimerInterval);
      gameState.playerTimerInterval = null;
    }
    var oldPin = normalizePin(gameState.pin);
    if (oldPin) {
      try {
        localStorage.removeItem('wq_arena_player_session_' + oldPin);
      } catch (e) { }
    }
    try {
      localStorage.removeItem('wq_arena_last_player_pin');
    } catch (e) { }

    gameState.pin = '';
    gameState.myPlayerId = '';
    gameState.status = 'config';
    gameState.playerLastChoice = -1;
    gameState.playerLastPhaseAction = '';
    gameState.playerLastPhasePayload = null;
    syncBrowserUrl('', '');

    if (isAdminLoggedIn()) {
      switchRoleTab('host');
    } else {
      showView('playerJoinView');
    }

    if (!silent && typeof showToast === 'function') {
      showToast('Đã rời phòng thi đấu.', 'info');
    }
  }

  function checkUrlParams() {
    pruneExpiredRooms();
    var urlParams = new URLSearchParams(window.location.search);
    var pinParam = normalizePin(urlParams.get('pin'));
    var roleParam = (urlParams.get('role') || '').trim().toLowerCase();

    // ==================== 1. QUẢN TRỊ VIÊN (ADMIN) ĐÃ ĐĂNG NHẬP ====================
    if (isAdminLoggedIn()) {
      // 1A. Nếu URL có pinParam
      if (pinParam) {
        var hostRoomData = localStorage.getItem('wq_arena_host_room_' + pinParam);
        var activeHostPin = normalizePin(localStorage.getItem('wq_arena_active_host_pin'));
        var isMyHostRoom = !!hostRoomData || (activeHostPin === pinParam);

        // Nếu phòng này do chính Admin này làm chủ:
        if (isMyHostRoom) {
          // Chỉ khôi phục vai trò người chơi khi URL CỐ Ý truyền role=player (mở tab test người chơi)
          if (roleParam === 'player') {
            if (restorePlayerSessionByPin(pinParam)) {
              renderAdminReturnBanner(pinParam);
              return;
            }
          }
          // Ngược lại, luôn khôi phục vai trò Host điều khiển phòng thi đấu!
          if (restoreHostRoomByPin(pinParam)) {
            return;
          }
        } else {
          // Phòng của người khác hoặc không còn lưu trên máy:
          if (roleParam === 'player') {
            if (restorePlayerSessionByPin(pinParam)) {
              renderAdminReturnBanner(pinParam);
              return;
            }
          }
        }
      }

      // 1B. Nếu mở trang không có mã PIN hoặc không tìm thấy phòng:
      // Luôn đưa Admin về Bảng Thiết Lập & Tạo Game (hostConfigView)
      // Dọn sạch URL để reload F5 không bị kẹt
      syncBrowserUrl('', '');
      switchRoleTab('host');
      return;
    }

    // ==================== 2. NGƯỜI CHƠI THÔNG THƯỜNG (CHƯA ĐĂNG NHẬP ADMIN) ====================
    if (pinParam) {
      // Khôi phục phiên đang chơi nếu lỡ tải lại trang
      if (restorePlayerSessionByPin(pinParam)) {
        return;
      }
      // Người chơi mới vào link có mã PIN
      switchRoleTab('player');
      var tabJoinPrivate = document.getElementById('tabJoinPrivate');
      if (tabJoinPrivate) tabJoinPrivate.click();
      var pinInput = document.getElementById('playerInputPin');
      if (pinInput) pinInput.value = pinParam;

      var badge = document.getElementById('playerJoinRoomBadge');
      var sub = document.getElementById('playerJoinRoomSub');
      if (badge) badge.textContent = 'Phòng thi đấu #' + formatPinCode(pinParam);
      if (sub) sub.textContent = 'Đang kiểm tra mã phòng thi đấu...';

      verifyRoomExists(pinParam).then(function (res) {
        if (!res.valid) {
          if (res.error === 'expired') {
            if (badge) badge.textContent = 'Phòng #' + formatPinCode(pinParam) + ' đã hết hạn';
            if (sub) sub.textContent = 'Phòng này đã hết thời gian lưu trữ. Vui lòng chọn hoặc tạo phòng mới.';
            if (typeof showToast === 'function') showToast('Phòng #' + formatPinCode(pinParam) + ' đã hết thời hạn lưu trữ!', 'error');
          } else {
            if (badge) badge.textContent = 'Phòng #' + formatPinCode(pinParam) + ' không tồn tại';
            if (sub) sub.textContent = 'Mã phòng trong link không tồn tại hoặc đã đóng. Vui lòng kiểm tra lại mã PIN.';
            if (typeof showToast === 'function') showToast('Mã phòng #' + formatPinCode(pinParam) + ' không tồn tại hoặc đã đóng!', 'error');
          }
          if (pinInput) { pinInput.value = ''; pinInput.focus(); }
        } else {
          if (sub) sub.textContent = 'Mã phòng hợp lệ! Hãy nhập Tên hiển thị (Nickname) của bạn để vào phòng.';
          var nameInput = document.getElementById('playerInputName');
          if (nameInput) nameInput.focus();
        }
      });
      return;
    }

    // Mở trang không có mã PIN:
    var lastPlayerPin = normalizePin(localStorage.getItem('wq_arena_last_player_pin'));
    if (lastPlayerPin && restorePlayerSessionByPin(lastPlayerPin)) {
      return;
    }
    switchRoleTab('player');
  }

  function switchRoleTab(role) {
    var tabHostBtn = document.getElementById('tabHostBtn');
    var tabPlayerBtn = document.getElementById('tabPlayerBtn');

    if (isAdminLoggedIn()) {
      // Khi đã đăng nhập Admin, vai trò chủ đạo luôn là 'host'
      gameState.role = 'host';
      gameState.myPlayerId = '';
      gameState.playerLastChoice = -1;
      gameState.playerLastPhaseAction = '';
      gameState.playerLastPhasePayload = null;

      var adminNameEl = document.getElementById('adminCurrentName');
      if (adminNameEl) adminNameEl.textContent = getAdminName();

      if (role === 'lobby_view') {
        // Tab 2: Phòng Chờ & Người Chơi
        if (tabPlayerBtn) tabPlayerBtn.classList.add('active');
        if (tabHostBtn) tabHostBtn.classList.remove('active');

        if (gameState.pin) {
          syncBrowserUrl(gameState.pin, 'host');
          renderLobby();
          showView('hostLobbyView');
        } else {
          var activeHostPin = normalizePin(localStorage.getItem('wq_arena_active_host_pin'));
          if (activeHostPin && restoreHostRoomByPin(activeHostPin)) {
            return;
          }
          if (typeof showToast === 'function') {
            showToast('Chưa có phòng thi đấu nào đang mở. Hãy thiết lập cấu hình và bấm Tạo Game nhé!', 'info');
          }
          switchRoleTab('host');
        }
      } else {
        // Tab 1: Thiết Lập & Tạo Game (hostConfigView)
        if (tabHostBtn) tabHostBtn.classList.add('active');
        if (tabPlayerBtn) tabPlayerBtn.classList.remove('active');
        syncBrowserUrl('', '');
        renderSavedRoomsList();
        showView('hostConfigView');
      }
    } else {
      // Người chơi thông thường
      gameState.role = 'player';
      if (tabPlayerBtn) tabPlayerBtn.classList.add('active');
      if (tabHostBtn) tabHostBtn.classList.remove('active');
      if (gameState.status === 'player_lobby' && gameState.pin) {
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
        var found = customDecks.find(function (d) {
          return String(d.cloudId || d.id || d.name) === customId ||
            String(d.id) === customId ||
            String(d.name) === customId;
        });
        return (found && Array.isArray(found.words)) ? found.words : [];
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

  function fetchCustomDeckWordsFromCloud(customId) {
    return fetch(CLOUD_API_BASE + '/api/decks/' + encodeURIComponent(customId))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.success && res.data && Array.isArray(res.data.words) && res.data.words.length > 0) {
          var normalizedWords = res.data.words.map(normalizeCloudWord);
          try {
            var currentList = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
            var target = currentList.find(function (d) {
              return String(d.cloudId || d.id || d.name) === String(customId) || String(d.id) === String(customId);
            });
            if (target) {
              target.words = normalizedWords;
              target.wordCount = normalizedWords.length;
              localStorage.setItem('wq_custom_decks', JSON.stringify(currentList));
            }
          } catch (e) { }
          return normalizedWords;
        }
        return [];
      })
      .catch(function () { return []; });
  }

  // ==================== ADMIN: TẠO PHÒNG & SINH BỘ ĐỀ ====================
  async function createRoom() {
    if (!isAdminLoggedIn()) {
      showView('adminLoginView');
      return;
    }

    var deckSelect = document.getElementById('hostDeckSelect');
    var qTypeSelect = document.getElementById('hostQuestionType');
    var qCountSelect = document.getElementById('hostQuestionCount');
    var timeSelect = document.getElementById('hostTimePerQuestion');
    var durationSelect = document.getElementById('hostRoomDuration');

    var deckVal = deckSelect ? deckSelect.value : 'HSK 1';
    var words = getWordsFromDeckVal(deckVal);

    // Nếu chọn bộ từ Tự tạo trên Cloud mà words chưa kịp tải vào cache thì tải ngay lập tức
    if ((!words || words.length === 0) && deckVal && deckVal.indexOf('custom:') === 0) {
      var customId = deckVal.replace('custom:', '');
      if (typeof showToast === 'function') {
        showToast('Đang tải danh sách từ vựng của bộ tự tạo...', 'info');
      }
      words = await fetchCustomDeckWordsFromCloud(customId);
    }

    if (!words || words.length === 0) {
      if (typeof showToast === 'function') {
        showToast('Bộ từ này đang trống, chưa có từ vựng nào!', 'error');
      }
      return;
    }

    var durKey = (durationSelect && durationSelect.value) ? durationSelect.value : '30m';
    var durConfig = ROOM_DURATION_MAP[durKey] || ROOM_DURATION_MAP['30m'];
    var nowMs = Date.now();

    var accessModeRadio = document.querySelector('input[name="hostAccessMode"]:checked');
    var accessMode = accessModeRadio ? accessModeRadio.value : 'public';

    gameState.role = 'host';
    gameState.accessMode = accessMode;
    gameState.deckValue = deckVal;
    gameState.deckWords = words;
    gameState.deckName = (deckSelect && deckSelect.options[deckSelect.selectedIndex])
      ? deckSelect.options[deckSelect.selectedIndex].text.replace(/\s*\(\d+\s*từ\)/, '')
      : deckVal;
    gameState.questionType = qTypeSelect ? qTypeSelect.value : 'hanzi_to_mean';
    gameState.totalQuestions = Math.min(parseInt(qCountSelect ? qCountSelect.value : '10', 10) || 10, words.length);
    gameState.timePerQuestion = parseInt(timeSelect ? timeSelect.value : '15', 10) || 15;
    gameState.roomDurationKey = durKey;
    gameState.roomDurationLabel = durConfig.label;
    gameState.roomCreatedAt = nowMs;
    gameState.roomExpiresAt = durConfig.ms > 0 ? (nowMs + durConfig.ms) : null;

    gameState.pin = String(Math.floor(100000 + Math.random() * 900000));
    gameState.players = [];
    gameState.status = 'lobby';
    gameState.phase = 0;

    var tabHostBtn = document.getElementById('tabHostBtn');
    var tabPlayerBtn = document.getElementById('tabPlayerBtn');
    if (tabPlayerBtn) tabPlayerBtn.classList.add('active');
    if (tabHostBtn) tabHostBtn.classList.remove('active');

    generateQuestions(gameState.pin);
    saveHostRoomState();
    syncBrowserUrl(gameState.pin, 'host');
    startExpiryCountdownTicker();
    renderLobby();
    showView('hostLobbyView');
    SFX.pop();

    startCloudPolling(gameState.pin);

    var roomPayload = {
      pin: gameState.pin,
      accessMode: gameState.accessMode,
      gameMode: gameState.gameMode,
      deckName: gameState.deckName,
      totalQuestions: gameState.totalQuestions,
      timePerQuestion: gameState.timePerQuestion,
      expiresAt: gameState.roomExpiresAt,
      durationLabel: gameState.roomDurationLabel,
      playerCount: 0,
      players: [],
      questions: gameState.questions,
      status: 'lobby',
      createdAt: nowMs,
      updatedAt: nowMs
    };

    broadcastMsg('room_created', roomPayload);
    publishRoomMeta(roomPayload);

    if (gameState.accessMode === 'public') {
      publishPublicRoom(roomPayload);
    }
  }

  function generateQuestions(seedPin) {
    var rng = createSeededRng(seedPin);
    var words = gameState.deckWords.slice().map(function (w) {
      return typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(w) : w;
    });
    shuffleWithRng(words, rng);

    var selectedWords = words.slice(0, gameState.totalQuestions);
    var mode = gameState.gameMode;
    var fallbackPool = (typeof DATA !== 'undefined' && Array.isArray(DATA['HSK 1'])) ? DATA['HSK 1'] : [];

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
      if (distractors.length < 3 && fallbackPool.length > 0) {
        var extraPool = fallbackPool.filter(function (fw) {
          var fh = cleanHanzi(fw.h);
          return fh !== cleanH && !distractors.some(function (d) { return cleanHanzi(d.h) === fh; });
        });
        shuffleWithRng(extraPool, rng);
        distractors = distractors.concat(extraPool.slice(0, 3 - distractors.length));
      }
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
        promptText = 'Nghe phát âm';
        promptSub = 'Lắng nghe giọng đọc tiếng Trung để chọn từ đúng';
        promptTypeDesc = 'Thính âm đoán chữ: Chọn từ và nghĩa đúng';
        correctAnswerText = cleanH + ' — ' + (w.m || '');
      } else if (qType === 'sentence_fill') {
        var exSentence = w.ex || w.e || '';
        var exMeaning = w.exm || w.m || '';
        if (exSentence && exSentence.indexOf(cleanH) !== -1) {
          promptText = exSentence.replace(cleanH, ' [ ___ ] ');
          promptSub = exMeaning ? ('Nghĩa: ' + exMeaning) : (w.p || '');
          promptTypeDesc = 'Điền câu: Chọn từ điền vào [ ___ ]';
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

  // ==================== QUẢN LÝ METADATA PHÒNG TRÊN CLOUD & XÁC THỰC MÃ PIN ====================
  var _cloudRoomMetaDeckMap = {};

  function publishRoomMeta(roomSummary) {
    if (!roomSummary || !roomSummary.pin) return;
    var pin = normalizePin(roomSummary.pin);
    var cleanSummary = Object.assign({}, roomSummary, { pin: pin, updatedAt: Date.now() });

    fetch(CLOUD_API_BASE + '/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'arena_meta_' + pin,
        name: JSON.stringify(cleanSummary),
        words: []
      })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.deck_id) {
        _cloudRoomMetaDeckMap[pin] = res.deck_id;
      }
    }).catch(function () { });
  }

  function unpublishRoomMeta(pin) {
    var cleanP = normalizePin(pin);
    if (!cleanP) return;
    var cloudId = _cloudRoomMetaDeckMap[cleanP];
    if (cloudId) {
      fetch(CLOUD_API_BASE + '/api/decks/' + cloudId, { method: 'DELETE' }).catch(function () { });
      delete _cloudRoomMetaDeckMap[cleanP];
    }
  }

  async function verifyRoomExists(pin) {
    var cleanPin = normalizePin(pin);
    if (!cleanPin || cleanPin.length < 4) {
      return { valid: false, error: 'invalid_pin' };
    }

    // 1. Kiểm tra trên bộ nhớ cục bộ máy hiện tại (0ms)
    try {
      var hostRoomRaw = localStorage.getItem('wq_arena_host_room_' + cleanPin);
      if (hostRoomRaw) {
        var hostRoom = JSON.parse(hostRoomRaw);
        if (hostRoom) {
          if (hostRoom.expiresAt && Number(hostRoom.expiresAt) > 0 && Date.now() >= Number(hostRoom.expiresAt)) {
            return { valid: false, error: 'expired', room: hostRoom };
          }
          return { valid: true, room: hostRoom, source: 'local_host' };
        }
      }
    } catch (e) { }

    // 2. Kiểm tra trong danh sách phòng công khai đã cache
    try {
      var pubRooms = getSavedPublicRooms();
      var matchPub = pubRooms.find(function (pr) { return normalizePin(pr.pin) === cleanPin; });
      if (matchPub) {
        if (matchPub.expiresAt && Number(matchPub.expiresAt) > 0 && Date.now() >= Number(matchPub.expiresAt)) {
          return { valid: false, error: 'expired', room: matchPub };
        }
        return { valid: true, room: matchPub, source: 'cached_public' };
      }
    } catch (e) { }

    // 3. Kiểm tra trên Cloudflare D1 (Cross-device, 4G / mạng khác)
    try {
      var metaPromise = fetch(CLOUD_API_BASE + '/api/decks?user_id=' + encodeURIComponent('arena_meta_' + cleanPin))
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });

      var pubPromise = fetch(CLOUD_API_BASE + '/api/decks?user_id=arena_public_rooms')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });

      var syncPromise = fetch(CLOUD_API_BASE + '/api/decks?user_id=' + encodeURIComponent('arena_sync_' + cleanPin))
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });

      var results = await Promise.all([metaPromise, pubPromise, syncPromise]);
      var metaJson = results[0];
      var pubJson = results[1];
      var syncJson = results[2];

      // Xét 3A: arena_meta_PIN
      if (metaJson && Array.isArray(metaJson.data) && metaJson.data.length > 0) {
        for (var m = metaJson.data.length - 1; m >= 0; m--) {
          var mDeck = metaJson.data[m];
          if (mDeck && mDeck.name) {
            try {
              var cloudRoom = JSON.parse(mDeck.name);
              if (cloudRoom && normalizePin(cloudRoom.pin) === cleanPin) {
                if (cloudRoom.expiresAt && Number(cloudRoom.expiresAt) > 0 && Date.now() >= Number(cloudRoom.expiresAt)) {
                  return { valid: false, error: 'expired', room: cloudRoom };
                }
                return { valid: true, room: cloudRoom, source: 'cloud_meta' };
              }
            } catch (eMeta) { }
          }
        }
      }

      // Xét 3B: arena_public_rooms
      if (pubJson && Array.isArray(pubJson.data)) {
        for (var i = 0; i < pubJson.data.length; i++) {
          try {
            var pData = JSON.parse(pubJson.data[i].name);
            if (pData && normalizePin(pData.pin) === cleanPin) {
              if (pData.expiresAt && Number(pData.expiresAt) > 0 && Date.now() >= Number(pData.expiresAt)) {
                return { valid: false, error: 'expired', room: pData };
              }
              return { valid: true, room: pData, source: 'cloud_public' };
            }
          } catch (ePub) { }
        }
      }

      // Xét 3C: arena_sync_PIN
      if (syncJson && Array.isArray(syncJson.data) && syncJson.data.length > 0) {
        for (var j = syncJson.data.length - 1; j >= 0; j--) {
          try {
            var syncMsg = JSON.parse(syncJson.data[j].name);
            if (syncMsg && syncMsg.payload && normalizePin(syncMsg.payload.pin) === cleanPin) {
              var sPayload = syncMsg.payload;
              if (sPayload.expiresAt && Number(sPayload.expiresAt) > 0 && Date.now() >= Number(sPayload.expiresAt)) {
                return { valid: false, error: 'expired', room: sPayload };
              }
              return { valid: true, room: sPayload, source: 'cloud_sync' };
            }
          } catch (eSync) { }
        }
      }
    } catch (errNet) {
      console.warn('Lỗi kiểm tra phòng từ Cloud:', errNet);
    }

    return { valid: false, error: 'not_found' };
  }

  // ==================== QUẢN LÝ PHÒNG THI ĐẤU CÔNG KHAI (PUBLIC ROOMS) ====================
  var _publicRoomsPollInterval = null;
  var _publicRoomCloudDeckMap = {};

  function getSavedPublicRooms() {
    try {
      var arr = JSON.parse(localStorage.getItem('wq_arena_public_rooms') || '[]');
      if (!Array.isArray(arr)) return [];
      var now = Date.now();
      return arr.filter(function (r) {
        return r && r.pin && (!r.expiresAt || Number(r.expiresAt) <= 0 || now < Number(r.expiresAt));
      });
    } catch (e) {
      return [];
    }
  }

  function saveSavedPublicRooms(rooms) {
    try {
      localStorage.setItem('wq_arena_public_rooms', JSON.stringify(rooms || []));
    } catch (e) { }
  }

  function publishPublicRoom(roomSummary) {
    if (!roomSummary || !roomSummary.pin) return;
    var pin = normalizePin(roomSummary.pin);
    var list = getSavedPublicRooms().filter(function (r) { return normalizePin(r.pin) !== pin; });
    var cleanSummary = Object.assign({}, roomSummary, { pin: pin, accessMode: 'public', updatedAt: Date.now() });
    list.unshift(cleanSummary);
    saveSavedPublicRooms(list);

    // Phát tín hiệu đồng bộ qua BroadcastChannel & Storage event
    broadcastMsg('public_room_sync', cleanSummary);

    // Lưu vào Cloudflare Worker D1 để điện thoại 4G / máy khác thấy ngay
    fetch(CLOUD_API_BASE + '/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'arena_public_rooms',
        name: JSON.stringify(cleanSummary),
        words: []
      })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.deck_id) {
        _publicRoomCloudDeckMap[pin] = res.deck_id;
      }
    }).catch(function () { });
  }

  function unpublishPublicRoom(pin) {
    var cleanP = normalizePin(pin);
    if (!cleanP) return;
    var list = getSavedPublicRooms().filter(function (r) { return normalizePin(r.pin) !== cleanP; });
    saveSavedPublicRooms(list);
    broadcastMsg('public_room_removed', { pin: cleanP });

    var cloudId = _publicRoomCloudDeckMap[cleanP];
    if (cloudId) {
      fetch(CLOUD_API_BASE + '/api/decks/' + cloudId, { method: 'DELETE' }).catch(function () { });
      delete _publicRoomCloudDeckMap[cleanP];
    }
  }

  function fetchPublicRooms(onDone) {
    var localRooms = getSavedPublicRooms();
    renderPublicRoomsList(localRooms);

    fetch(CLOUD_API_BASE + '/api/decks?user_id=arena_public_rooms')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !Array.isArray(res.data)) {
          if (typeof onDone === 'function') onDone(localRooms);
          return;
        }
        var now = Date.now();
        var cloudRooms = [];
        res.data.forEach(function (d) {
          if (!d || !d.name) return;
          try {
            var rObj = JSON.parse(d.name);
            if (rObj && rObj.pin && rObj.accessMode === 'public') {
              if (!rObj.expiresAt || Number(rObj.expiresAt) <= 0 || now < Number(rObj.expiresAt)) {
                _publicRoomCloudDeckMap[normalizePin(rObj.pin)] = d.id;
                cloudRooms.push(rObj);
              } else {
                fetch(CLOUD_API_BASE + '/api/decks/' + d.id, { method: 'DELETE' }).catch(function () { });
              }
            }
          } catch (e) { }
        });

        var map = {};
        localRooms.forEach(function (lr) { map[normalizePin(lr.pin)] = lr; });
        cloudRooms.forEach(function (cr) {
          var p = normalizePin(cr.pin);
          if (!map[p] || (cr.updatedAt && cr.updatedAt > (map[p].updatedAt || 0))) {
            map[p] = cr;
          }
        });

        var merged = Object.values(map).sort(function (a, b) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });

        saveSavedPublicRooms(merged);
        renderPublicRoomsList(merged);
        if (typeof onDone === 'function') onDone(merged);
      })
      .catch(function () {
        if (typeof onDone === 'function') onDone(localRooms);
      });
  }

  function startPublicRoomsPolling() {
    if (_publicRoomsPollInterval) clearInterval(_publicRoomsPollInterval);
    _publicRoomsPollInterval = setInterval(function () {
      if (gameState.role === 'player' && (gameState.status === 'config' || gameState.status === 'player_join')) {
        var joinView = document.getElementById('playerJoinView');
        if (joinView && joinView.style.display !== 'none') {
          fetchPublicRooms();
        }
      }
    }, 4000);
  }

  function renderPublicRoomsList(roomsList) {
    var listEl = document.getElementById('publicRoomsList');
    var countBadge = document.getElementById('publicRoomsCountBadge');
    if (!listEl) return;

    var rooms = Array.isArray(roomsList) ? roomsList : getSavedPublicRooms();
    if (countBadge) countBadge.textContent = rooms.length;

    if (rooms.length === 0) {
      listEl.innerHTML =
        '<div class="empty-public-rooms">' +
        '<div class="empty-pub-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>' +
        '<div class="empty-pub-title">Hiện chưa có phòng thi đấu công khai nào đang mở</div>' +
        '<div class="empty-pub-desc">Bạn có thể chọn tab <b>"Nhập Mã PIN"</b> để vào phòng riêng tư, hoặc nhờ Admin tạo phòng công khai nhé!</div>' +
        '</div>';
      return;
    }

    listEl.innerHTML = '';
    rooms.forEach(function (r) {
      var pin = normalizePin(r.pin);
      var expText = formatRemainingExpiry(r.expiresAt, r.durationLabel);
      var pCount = Array.isArray(r.players) ? r.players.length : (Number(r.playerCount) || 0);
      var modeName = GAMEMODE_NAMES[r.gameMode] || 'Phản xạ tốc độ';

      var topLeaderText = 'Chưa có điểm';
      if (Array.isArray(r.players) && r.players.length > 0) {
        var sorted = r.players.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
        if (sorted[0]) {
          topLeaderText = 'Top 1: ' + (sorted[0].avatar || '') + ' ' + sorted[0].name + ' (' + (sorted[0].score || 0).toLocaleString() + ' đ)';
        }
      }

      var card = document.createElement('div');
      card.className = 'public-room-card';
      card.innerHTML =
        '<div class="pub-card-top">' +
        '<div class="pub-card-tags">' +
        '<span class="pub-tag-badge">Công khai</span>' +
        '<span class="pub-tag-mode">' + modeName + '</span>' +
        '</div>' +
        '<span class="pub-card-exp">' + expText + '</span>' +
        '</div>' +
        '<div class="pub-card-main">' +
        '<h4 class="pub-card-title">' + (r.deckName || 'HSK 1') + '</h4>' +
        '<div class="pub-card-sub">#' + formatPinCode(pin) + ' • ' + (r.totalQuestions || 10) + ' câu • ' + (r.timePerQuestion || 15) + 's/câu</div>' +
        '<div class="pub-card-leader-row">' +
        '<span class="pub-card-players-count">' + pCount + ' đấu thủ</span>' +
        '<span class="pub-card-top-player">' + topLeaderText + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="pub-card-actions">' +
        '<button type="button" class="btn-pub-view-lb" data-pin="' + pin + '">Bảng xếp hạng</button>' +
        '<button type="button" class="btn-pub-join" data-pin="' + pin + '">Vào thi đấu</button>' +
        '</div>';
      listEl.appendChild(card);
    });

    listEl.querySelectorAll('.btn-pub-view-lb').forEach(function (btn) {
      btn.onclick = function () {
        var pin = btn.dataset.pin;
        var r = rooms.find(function (x) { return normalizePin(x.pin) === pin; });
        if (r) openPublicLeaderboardModal(r);
      };
    });

    listEl.querySelectorAll('.btn-pub-join').forEach(function (btn) {
      btn.onclick = function () {
        handleJoinPublicRoomClick(btn.dataset.pin);
      };
    });
  }

  function openPublicLeaderboardModal(r) {
    var modal = document.getElementById('publicLeaderboardModal');
    var badge = document.getElementById('pubModalBadge');
    var title = document.getElementById('pubModalTitle');
    var meta = document.getElementById('pubModalMeta');
    var listEl = document.getElementById('pubModalLeaderboardList');
    var joinBtn = document.getElementById('btnJoinFromPubModal');
    if (!modal) return;

    var pin = normalizePin(r.pin);
    if (badge) badge.textContent = 'Phòng công khai #' + formatPinCode(pin);
    if (title) title.textContent = 'Bảng xếp hạng đấu thủ (' + (r.deckName || 'HSK 1') + ')';
    if (meta) {
      meta.textContent = (GAMEMODE_NAMES[r.gameMode] || 'Tranh tài') + ' • ' + (r.totalQuestions || 10) + ' câu • ' + formatRemainingExpiry(r.expiresAt, r.durationLabel);
    }

    var players = Array.isArray(r.players) ? r.players.slice() : [];
    players.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });

    if (listEl) {
      if (players.length === 0) {
        listEl.innerHTML = '<div class="empty-lobby-text" style="padding:22px;text-align:center;">Chưa có đấu thủ nào trong phòng. Bạn hãy là người đầu tiên tham gia nhé!</div>';
      } else {
        listEl.innerHTML = '';
        players.forEach(function (p, idx) {
          var rank = idx + 1;
          var row = document.createElement('div');
          row.className = 'leaderboard-row' + (rank <= 3 ? (' top-' + rank) : '');
          var rankBadge = '#' + rank;
          var streakBadge = (p.streak >= 2 ? ('<span class="lb-streak">Chuỗi ' + p.streak + '</span>') : '<span class="lb-ready-badge">Sẵn sàng</span>');
          row.innerHTML =
            '<div class="lb-rank">' + rankBadge + '</div>' +
            '<div class="lb-avatar">' + (p.avatar || '🐼') + '</div>' +
            '<div class="lb-name">' + (p.name || 'Người chơi') + (p.isBot ? ' <span class="bot-badge">Bot</span>' : '') + streakBadge + '</div>' +
            '<div class="lb-score">' + (p.score || 0).toLocaleString() + ' đ</div>';
          listEl.appendChild(row);
        });
      }
    }

    if (joinBtn) {
      joinBtn.onclick = function () {
        closePublicLeaderboardModal();
        handleJoinPublicRoomClick(pin);
      };
    }

    modal.style.display = 'flex';
  }

  function closePublicLeaderboardModal() {
    var modal = document.getElementById('publicLeaderboardModal');
    if (modal) modal.style.display = 'none';
  }

  function handleJoinPublicRoomClick(pin) {
    var cleanPin = normalizePin(pin);
    if (!cleanPin) return;

    var pubRooms = getSavedPublicRooms();
    var matchPub = pubRooms.find(function (pr) { return normalizePin(pr.pin) === cleanPin; });

    var currentName = (gameState.playerProfile.name || '').trim();
    if (!currentName || currentName === 'Bạn') {
      if (typeof window.wqShowCustomPrompt === 'function') {
        window.wqShowCustomPrompt('Tham Gia Phòng Công Khai', 'Vui lòng nhập Biệt danh (Nickname) của bạn để xuất hiện trên Bảng xếp hạng:', '', function (val) {
          if (val && val.trim()) {
            savePlayerProfile(val.trim(), gameState.playerProfile.avatar);
            joinRoomAsPlayer(cleanPin, val.trim(), gameState.playerProfile.avatar, matchPub);
          }
        });
      } else {
        var tabPriv = document.getElementById('tabJoinPrivate');
        if (tabPriv) tabPriv.click();
        var pinInput = document.getElementById('playerInputPin');
        if (pinInput) pinInput.value = cleanPin;
        var nameInput = document.getElementById('playerInputName');
        if (nameInput) {
          nameInput.focus();
          if (typeof showToast === 'function') showToast('Vui lòng gõ Biệt danh của bạn để vào phòng công khai!', 'info');
        }
      }
      return;
    }

    joinRoomAsPlayer(cleanPin, currentName, gameState.playerProfile.avatar, matchPub);
  }

  // ==================== HIỂN THỊ PHÒNG CHỜ (LOBBY) ====================
  function buildRoomShareUrl() {
    var base = window.location.origin + window.location.pathname;
    var params = new URLSearchParams({
      pin: gameState.pin,
      role: 'player'
    });
    return base + '?' + params.toString();
  }

  function renderLobby() {
    var pinEl = document.getElementById('displayRoomPin');
    var deckInfoEl = document.getElementById('lobbyDeckInfo');
    var accessBadge = document.getElementById('lobbyAccessBadge');
    var pinLabel = document.getElementById('lobbyPinLabel');
    var qrHint = document.getElementById('lobbyQrHintText');

    if (pinEl) pinEl.textContent = formatPinCode(gameState.pin);
    if (deckInfoEl) {
      deckInfoEl.textContent = (GAMEMODE_NAMES[gameState.gameMode] || 'Kahoot') + ' • ' + gameState.deckName + ' • ' + gameState.totalQuestions + ' câu (' + gameState.timePerQuestion + 's)';
    }

    var isPublic = (gameState.accessMode === 'public');
    if (accessBadge) {
      accessBadge.textContent = isPublic ? 'Phòng công khai' : 'Phòng riêng tư';
      accessBadge.className = 'lobby-access-pill ' + (isPublic ? 'is-public' : 'is-private');
    }
    if (pinLabel) {
      pinLabel.textContent = isPublic ? 'Mã phòng (Công khai)' : 'Mã phòng thi đấu';
    }
    if (qrHint) {
      qrHint.textContent = isPublic ? 'Phòng công khai: Người chơi có thể thấy trên sảnh và tham gia trực tiếp' : 'Người chơi quét mã QR hoặc nhập PIN để vào phòng';
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
      accessMode: gameState.accessMode || 'public',
      expiresAt: gameState.roomExpiresAt,
      durationLabel: gameState.roomDurationLabel,
      players: gameState.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar || '🐼',
          score: p.score || 0,
          streak: p.streak || 0,
          isBot: !!p.isBot,
          isReady: !!p.isReady
        };
      })
    };
    try {
      localStorage.setItem('wq_arena_roster_' + normalizePin(gameState.pin), JSON.stringify(rosterPayload));
    } catch (e) { }
    broadcastMsg('lobby_roster_sync', rosterPayload);

    if (gameState.accessMode === 'public') {
      publishPublicRoom({
        pin: gameState.pin,
        accessMode: 'public',
        gameMode: gameState.gameMode,
        deckName: gameState.deckName,
        totalQuestions: gameState.totalQuestions,
        timePerQuestion: gameState.timePerQuestion,
        expiresAt: gameState.roomExpiresAt,
        durationLabel: gameState.roomDurationLabel,
        playerCount: gameState.players.length,
        players: rosterPayload.players,
        status: gameState.status,
        updatedAt: Date.now()
      });
    }
  }

  function renderPlayerList() {
    var simplePanel = document.getElementById('hostPlayersPanelSimple');
    var publicLbPanel = document.getElementById('hostPublicLeaderboardPanel');
    var listEl = document.getElementById('lobbyPlayersList');
    var publicLbList = document.getElementById('hostLobbyLeaderboardList');
    var countEl = document.getElementById('playerCount');
    var lbCountEl = document.getElementById('hostLbPlayerCount');
    var topCountEl = document.getElementById('lobbyTopPlayerCount');
    var tabCountEl = document.getElementById('adminTabPlayerCount');
    var startBtn = document.getElementById('btnStartGame');

    var count = gameState.players.length;
    var readyCount = gameState.players.filter(function (p) { return p.isReady; }).length;
    if (countEl) countEl.textContent = count;
    if (lbCountEl) lbCountEl.textContent = count;
    if (topCountEl) topCountEl.textContent = count;
    if (tabCountEl) tabCountEl.textContent = count;

    if (startBtn) {
      startBtn.disabled = count === 0;
      var readyLabel = count > 0 ? (' (' + readyCount + '/' + count + ' sẵn sàng)') : '';
      startBtn.innerHTML = '<span>Bắt đầu trận đấu' + readyLabel + ' ➔</span>';
      if (count > 0 && readyCount === count) {
        startBtn.classList.add('all-ready');
      } else {
        startBtn.classList.remove('all-ready');
      }
    }

    saveHostRoomState();
    broadcastLobbyRoster();

    var isPublic = (gameState.accessMode === 'public');

    if (isPublic) {
      // ===== PHÒNG CÔNG KHAI: HIỆN BẢNG XẾP HẠNG TRỰC TIẾP =====
      if (publicLbPanel) publicLbPanel.style.display = 'block';
      if (simplePanel) simplePanel.style.display = 'none';

      if (!publicLbList) return;
      if (count === 0) {
        publicLbList.innerHTML = '<div class="empty-lobby-text">Đang chờ người chơi tham gia phòng công khai... (Hoặc bấm "Thêm đối thủ ảo" để thử ngay)</div>';
        return;
      }

      var sorted = gameState.players.slice().sort(function (a, b) {
        return (b.score || 0) - (a.score || 0);
      });

      publicLbList.innerHTML = '';
      sorted.forEach(function (p, idx) {
        var rank = idx + 1;
        var row = document.createElement('div');
        row.className = 'leaderboard-row' + (rank <= 3 ? (' top-' + rank) : '');
        var rankBadge = '#' + rank;
        var streakBadge = (p.streak >= 2 ? ('<span class="lb-streak">Chuỗi ' + p.streak + '</span>') : '<span class="lb-ready-badge">Sẵn sàng</span>');
        row.innerHTML =
          '<div class="lb-rank">' + rankBadge + '</div>' +
          '<div class="lb-avatar">' + (p.avatar || '🐼') + '</div>' +
          '<div class="lb-name">' + (p.name || 'Người chơi') + (p.isBot ? ' <span class="bot-badge">Bot</span>' : '') + streakBadge + '</div>' +
          '<div class="lb-score">' + (p.score || 0).toLocaleString() + ' đ</div>' +
          '<button type="button" class="chip-remove-btn" data-id="' + p.id + '" title="Xóa khỏi phòng">×</button>';
        publicLbList.appendChild(row);
      });

      publicLbList.querySelectorAll('.chip-remove-btn').forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          var id = btn.dataset.id;
          gameState.players = gameState.players.filter(function (p) { return p.id !== id; });
          renderPlayerList();
        };
      });
    } else {
      // ===== PHÒNG RIÊNG TƯ: HIỆN DANH SÁCH CHIP NGƯỜI CHƠI =====
      if (publicLbPanel) publicLbPanel.style.display = 'none';
      if (simplePanel) simplePanel.style.display = 'block';

      if (!listEl) return;
      if (count === 0) {
        listEl.innerHTML = '<div class="empty-lobby-text">Đang chờ người chơi quét mã QR hoặc nhập PIN vào phòng... (Hoặc bấm "+ Thêm bạn học ảo 🤖" để test ngay)</div>';
        return;
      }

      listEl.innerHTML = '';
      gameState.players.forEach(function (p) {
        var chip = document.createElement('div');
        chip.className = 'player-chip' + (p.isBot ? ' bot' : '');
        var readyPill = p.isReady
          ? '<span class="chip-ready-tag is-ready">Sẵn sàng</span>'
          : '<span class="chip-ready-tag not-ready">Chờ</span>';
        chip.innerHTML =
          '<span class="player-chip-avatar">' + p.avatar + '</span>' +
          '<span class="player-chip-name">' + p.name + '</span>' +
          readyPill +
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
      isBot: true,
      isReady: true
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
    if (gameState.phase4AutoTimer) {
      clearInterval(gameState.phase4AutoTimer);
      gameState.phase4AutoTimer = null;
    }
    if (gameState.phase5AutoTimer) {
      clearInterval(gameState.phase5AutoTimer);
      gameState.phase5AutoTimer = null;
    }
    if (gameState.soloAutoAdvanceTimer) {
      clearTimeout(gameState.soloAutoAdvanceTimer);
      clearInterval(gameState.soloAutoAdvanceTimer);
      gameState.soloAutoAdvanceTimer = null;
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
    var now = Date.now();
    var phase1EndAt = now + (prepSec * 1000);
    var phase2EndAt = phase1EndAt + (gameState.timePerQuestion * 1000);

    gameState.phase1EndAt = phase1EndAt;
    gameState.questionStartTime = phase1EndAt;
    gameState.questionEndTime = phase2EndAt;
    gameState.timerRemaining = gameState.timePerQuestion;

    if (getReadyNum) getReadyNum.textContent = prepSec;
    if (getReadyTitle) getReadyTitle.textContent = qLabel + ' – Chuẩn bị...';

    // Phát âm thanh câu hỏi ngay ở Pha 1 để người chơi lắng nghe trước khi bung đáp án
    if (q.hanziAudio && typeof speak === 'function') {
      setTimeout(function () { speak(q.hanziAudio); }, 180);
    }
    SFX.tick();

    // Gửi tín hiệu Pha 1 (Pre-load đề bài & options, mốc timeline đồng bộ) xuống tất cả điện thoại
    saveHostRoomState();
    broadcastMsg('phase_1_getready', {
      pin: gameState.pin,
      questionIndex: qIdx,
      totalQuestions: gameState.totalQuestions,
      prompt: q.prompt,
      subPrompt: q.subPrompt,
      typeDesc: q.typeDesc,
      options: q.options,
      prepSeconds: prepSec,
      phase1EndAt: phase1EndAt,
      phase2StartAt: phase1EndAt,
      phase2EndAt: phase2EndAt,
      durationSec: gameState.timePerQuestion,
      expiresAt: gameState.roomExpiresAt,
      durationLabel: gameState.roomDurationLabel
    });

    var lastDisplayedPrepSec = prepSec;
    gameState.phase1Timer = setInterval(function () {
      var remMs = Math.max(0, phase1EndAt - Date.now());
      var currentSec = Math.ceil(remMs / 1000);
      if (currentSec !== lastDisplayedPrepSec && currentSec > 0) {
        lastDisplayedPrepSec = currentSec;
        if (getReadyNum) getReadyNum.textContent = currentSec;
        if (timerSecEl) timerSecEl.textContent = currentSec;
        SFX.tick();
      }
      if (remMs <= 0) {
        clearInterval(gameState.phase1Timer);
        gameState.phase1Timer = null;
        // Chuyển ngay sang Pha 2: Bung 4 ô đáp án!
        startPhase2ActiveAnswering();
      }
    }, 100);
  }

  // ==================== PHA 2: BUNG ĐÁP ÁN & ĐẾM NGƯỢC (ACTIVE ANSWERING) ====================
  // Đúng giây thứ 0 của nhịp chuẩn bị, 4 ô đáp án đồng loạt bật lên trên Admin & Điện thoại.
  // Tuyệt đối KHÔNG gửi kèm thông tin đáp án nào đúng (correctIndex) xuống điện thoại để chống nhìn trộm mã nguồn!
  function startPhase2ActiveAnswering(overrideSec) {
    clearAllRoundTimers();

    var qIdx = gameState.currentQuestionIndex;
    var q = gameState.questions[qIdx];
    if (!q) return;

    showView('hostGameView');

    gameState.status = 'phase2';
    gameState.phase = 2;

    var durationSec = gameState.timePerQuestion;
    var durationMs = durationSec * 1000;
    if (!overrideSec) {
      if (!gameState.questionEndTime || gameState.questionEndTime <= Date.now()) {
        gameState.questionStartTime = Date.now();
        gameState.questionEndTime = gameState.questionStartTime + durationMs;
      }
    } else {
      gameState.questionStartTime = Date.now();
      gameState.questionEndTime = Date.now() + (overrideSec * 1000);
      durationSec = overrideSec;
      durationMs = overrideSec * 1000;
    }
    gameState.timerRemaining = Math.max(0, Math.ceil((gameState.questionEndTime - Date.now()) / 1000));

    var qCounterEl = document.getElementById('hostQCounter');
    var qTextEl = document.getElementById('hostQuestionText');
    var qSubEl = document.getElementById('hostQuestionSub');
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

    if (qCounterEl) qCounterEl.textContent = 'Câu số ' + (qIdx + 1) + '/' + gameState.totalQuestions;
    if (qTextEl) qTextEl.textContent = q.prompt;
    if (qSubEl) qSubEl.textContent = q.subPrompt || '';
    if (phaseBadge) {
      phaseBadge.className = 'game-phase-pill phase-2';
      phaseBadge.textContent = 'Pha 2: Đang nhận đáp án';
    }
    if (qTypeBadge) qTypeBadge.textContent = q.typeDesc;
    if (timerSecEl) timerSecEl.textContent = gameState.timerRemaining;
    if (timerBadge) timerBadge.classList.remove('urgent');

    var curAnswered = getActivePlayers().filter(function (x) { return x.lastAnswerIndex !== -1; }).length;
    if (answeredCountEl) answeredCountEl.textContent = String(curAnswered);
    if (totalPlayingEl) totalPlayingEl.textContent = getActivePlayers().length;
    if (progressBar) progressBar.style.width = Math.max(0, (gameState.timerRemaining / gameState.timePerQuestion) * 100) + '%';

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

    saveHostRoomState();
    SFX.revealPop();

    // Chạy đồng hồ đếm ngược Pha 2 đồng bộ theo mốc questionEndTime
    var lastTickSec = gameState.timerRemaining;
    function updateHostPhase2Tick() {
      var remMs = Math.max(0, gameState.questionEndTime - Date.now());
      var currentSec = Math.ceil(remMs / 1000);
      gameState.timerRemaining = currentSec;

      if (timerSecEl) timerSecEl.textContent = currentSec;
      var pct = Math.max(0, Math.min(100, (remMs / durationMs) * 100));
      if (progressBar) progressBar.style.width = pct + '%';

      if (currentSec !== lastTickSec) {
        lastTickSec = currentSec;
        if (currentSec <= 5 && currentSec > 0) {
          if (timerBadge) timerBadge.classList.add('urgent');
          SFX.urgentTick();
        } else if (currentSec > 5) {
          SFX.tick();
        }
      }

      // ĐIỀU KIỆN 1 (HẾT GIỜ): Đồng hồ chạm mốc 0 giây -> Tự động đóng cổng nhận đáp án & chuyển sang Pha 4
      if (remMs <= 0) {
        clearAllRoundTimers();
        gameState.wasEarlyCutoff = false;
        startPhase4AnswerReveal();
      }
    }

    updateHostPhase2Tick();
    gameState.timerInterval = setInterval(updateHostPhase2Tick, 100);

    // Kích hoạt Bot mô phỏng trả lời (nếu trong phòng có Bot)
    runBotSimulation(q);

    // Gửi tín hiệu Pha 2 xuống điện thoại: CHỈ gửi 4 phương án A, B, C, D và mốc endTime
    broadcastMsg('phase_2_active', {
      pin: gameState.pin,
      questionIndex: qIdx,
      totalQuestions: gameState.totalQuestions,
      prompt: q.prompt,
      options: q.options,
      durationSec: durationSec,
      startTime: gameState.questionStartTime,
      endTime: gameState.questionEndTime,
      expiresAt: gameState.roomExpiresAt,
      durationLabel: gameState.roomDurationLabel
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

    saveHostRoomState();
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

    showView('hostGameView');
    gameState.status = 'phase4';
    gameState.phase = 4;

    var q = gameState.questions[gameState.currentQuestionIndex];
    if (!q) return;
    var correctIdx = Number(q.correctIndex);
    var correctLetter = OPTION_LETTERS[correctIdx] || 'A';

    var qCounterEl = document.getElementById('hostQCounter');
    var qTypeBadge = document.getElementById('hostQTypeBadge');
    var qTextEl = document.getElementById('hostQuestionText');
    var qSubEl = document.getElementById('hostQuestionSub');
    var phase1Box = document.getElementById('hostPhase1Box');
    var answersGrid = document.getElementById('hostAnswersGrid');

    if (qCounterEl) qCounterEl.textContent = 'Câu số ' + (gameState.currentQuestionIndex + 1) + '/' + gameState.totalQuestions;
    if (qTypeBadge) qTypeBadge.textContent = q.typeDesc;
    if (qTextEl) qTextEl.textContent = q.prompt;
    if (qSubEl) qSubEl.textContent = q.subPrompt || '';
    if (phase1Box) phase1Box.style.display = 'none';
    if (answersGrid) answersGrid.style.display = 'grid';

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
      var ansTextEl = document.getElementById('hostAns' + i);
      var cardEl = document.querySelector('.k-ans-card[data-index="' + i + '"]');
      var statPill = document.getElementById('hostAnsStat' + i);
      if (ansTextEl) ansTextEl.textContent = q.options[i] || '';
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

    saveHostRoomState();

    broadcastMsg('phase_4_reveal', {
      pin: gameState.pin,
      questionIndex: gameState.currentQuestionIndex,
      correctIndex: correctIdx,
      correctLetter: correctLetter,
      correctText: q.options[correctIdx],
      counts: counts,
      leaderScore: leaderScore,
      expiresAt: gameState.roomExpiresAt,
      durationLabel: gameState.roomDurationLabel,
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

    // Tự động đếm ngược 3 giây để chuyển tiếp sang Pha 5 (Bảng Xếp Hạng Đấu Thủ)
    if (gameState.phase4AutoTimer) {
      clearInterval(gameState.phase4AutoTimer);
      gameState.phase4AutoTimer = null;
    }
    var goP5Btn = document.getElementById('btnGoPhase5Leaderboard');
    var p4SecondsLeft = 3;
    function updateP4ButtonLabel() {
      if (goP5Btn) {
        goP5Btn.innerHTML = '<span>Tự động chuyển bảng xếp hạng sau ' + p4SecondsLeft + 's...</span>';
      }
    }
    updateP4ButtonLabel();
    if (goP5Btn) {
      goP5Btn.onclick = function () {
        if (gameState.phase4AutoTimer) {
          clearInterval(gameState.phase4AutoTimer);
          gameState.phase4AutoTimer = null;
        }
        startPhase5Leaderboard();
      };
    }
    gameState.phase4AutoTimer = setInterval(function () {
      p4SecondsLeft--;
      if (p4SecondsLeft <= 0) {
        if (gameState.phase4AutoTimer) {
          clearInterval(gameState.phase4AutoTimer);
          gameState.phase4AutoTimer = null;
        }
        startPhase5Leaderboard();
      } else {
        updateP4ButtonLabel();
      }
    }, 1000);
  }

  // ==================== PHA 5: BẢNG XẾP HẠNG TRUNG GIAN (LEADERBOARD & CHUYỂN CÂU) ====================
  function startPhase5Leaderboard() {
    if (gameState.phase4AutoTimer) {
      clearInterval(gameState.phase4AutoTimer);
      gameState.phase4AutoTimer = null;
    }

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
      titleEl.textContent = 'Bảng Xếp Hạng Đấu Thủ (Sau Câu ' + (gameState.currentQuestionIndex + 1) + ' / ' + gameState.totalQuestions + ')';
    }

    // Tìm người chơi có chuỗi thắng (streak) cao nhất để vinh danh trên Banner
    var streakPlayer = sorted.slice().sort(function (a, b) { return b.streak - a.streak; })[0];
    if (calloutEl) {
      if (streakPlayer && streakPlayer.streak >= 2) {
        calloutEl.style.display = 'inline-flex';
        calloutEl.textContent = streakPlayer.avatar + ' ' + streakPlayer.name + ' lập chuỗi ' + streakPlayer.streak + ' câu đúng liên tiếp';
      } else if (sorted[0] && sorted[0].lastPointsEarned > 0) {
        calloutEl.style.display = 'inline-flex';
        calloutEl.textContent = sorted[0].avatar + ' ' + sorted[0].name + ' đang dẫn đầu với ' + sorted[0].score.toLocaleString() + ' điểm';
      } else {
        calloutEl.style.display = 'none';
      }
    }

    var isLast = gameState.currentQuestionIndex >= gameState.totalQuestions - 1 ||
      (gameState.gameMode === 'survival' && getActivePlayers().length === 0);

    // Hiển thị đầy đủ tất cả người chơi trong phòng (không giới hạn Top 5)
    if (listEl) {
      listEl.innerHTML = '';
      sorted.forEach(function (p, idx) {
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
        row.style.animationDelay = (idx * 0.05) + 's';

        var plusBadge = p.lastPointsEarned > 0
          ? '<span class="lb-plus-points">+' + p.lastPointsEarned + '</span>'
          : '';

        row.innerHTML =
          '<div class="lb-rank">#' + rank + ' ' + deltaHtml + '</div>' +
          '<div class="lb-avatar">' + p.avatar + '</div>' +
          '<div class="lb-name">' + p.name +
          (p.streak >= 2 ? ' <span class="lb-streak">Chuỗi ' + p.streak + '</span>' : '') +
          '</div>' +
          plusBadge +
          '<div class="lb-score">' + p.score.toLocaleString() + ' đ</div>';
        listEl.appendChild(row);
      });
    }

    saveHostRoomState();
    SFX.pop();

    // Phát tín hiệu Pha 5 xuống điện thoại để từng máy cập nhật thứ hạng & khoảng cách điểm
    broadcastMsg('phase_5_leaderboard', {
      pin: gameState.pin,
      questionIndex: gameState.currentQuestionIndex,
      leaderScore: leaderScore,
      expiresAt: gameState.roomExpiresAt,
      durationLabel: gameState.roomDurationLabel,
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

    // Tự động đếm ngược 3 giây để chuyển tiếp sang Câu tiếp theo (hoặc Podium)
    if (gameState.phase5AutoTimer) {
      clearInterval(gameState.phase5AutoTimer);
      gameState.phase5AutoTimer = null;
    }
    var p5SecondsLeft = 3;
    function updateP5ButtonLabel() {
      if (continueBtn) {
        if (isLast) {
          continueBtn.innerHTML = '<span>Tự động chuyển vinh danh sau ' + p5SecondsLeft + 's...</span>';
        } else {
          continueBtn.innerHTML = '<span>Tự động chuyển câu ' + (gameState.currentQuestionIndex + 2) + ' sau ' + p5SecondsLeft + 's...</span>';
        }
      }
    }
    updateP5ButtonLabel();
    if (continueBtn) {
      continueBtn.onclick = function () {
        if (gameState.phase5AutoTimer) {
          clearInterval(gameState.phase5AutoTimer);
          gameState.phase5AutoTimer = null;
        }
        advanceToNextQuestion();
      };
    }
    gameState.phase5AutoTimer = setInterval(function () {
      p5SecondsLeft--;
      if (p5SecondsLeft <= 0) {
        if (gameState.phase5AutoTimer) {
          clearInterval(gameState.phase5AutoTimer);
          gameState.phase5AutoTimer = null;
        }
        advanceToNextQuestion();
      } else {
        updateP5ButtonLabel();
      }
    }, 1000);
  }

  function advanceToNextQuestion() {
    clearAllRoundTimers();
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

    var p1 = sorted[0] || { name: '--', score: 0, avatar: '🐼' };
    var p2 = sorted[1] || { name: '--', score: 0, avatar: '🦊' };
    var p3 = sorted[2] || { name: '--', score: 0, avatar: '🐰' };

    var a1 = document.getElementById('podiumAvatar1');
    var n1 = document.getElementById('podiumName1');
    var s1 = document.getElementById('podiumScore1');

    var a2 = document.getElementById('podiumAvatar2');
    var n2 = document.getElementById('podiumName2');
    var s2 = document.getElementById('podiumScore2');

    var a3 = document.getElementById('podiumAvatar3');
    var n3 = document.getElementById('podiumName3');
    var s3 = document.getElementById('podiumScore3');

    if (a1) a1.textContent = p1.avatar || '🐼';
    if (n1) n1.textContent = p1.name;
    if (s1) s1.textContent = p1.score.toLocaleString() + ' đ';

    if (a2) a2.textContent = p2.avatar || '🦊';
    if (n2) n2.textContent = p2.name;
    if (s2) s2.textContent = p2.score.toLocaleString() + ' đ';

    if (a3) a3.textContent = p3.avatar || '🐰';
    if (n3) n3.textContent = p3.name;
    if (s3) s3.textContent = p3.score.toLocaleString() + ' đ';

    var subText = document.getElementById('podiumSubtitleText');
    if (subText && sorted[0]) {
      subText.textContent = 'Quán quân: ' + sorted[0].avatar + ' ' + sorted[0].name + ' xuất sắc dẫn đầu với ' + sorted[0].score.toLocaleString() + ' điểm!';
    }

    saveHostRoomState();
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

  function updatePlayerReadyUI() {
    var btn = document.getElementById('btnPlayerToggleReady');
    var btnText = document.getElementById('playerReadyBtnText');
    var statusText = document.getElementById('playerReadyStatusText');
    var indTag = document.getElementById('playerReadyIndicatorTag');
    var isReady = !!gameState.isReady;

    if (btn) {
      if (isReady) {
        btn.classList.add('is-ready-active');
        if (btnText) btnText.textContent = '✓ Đã sẵn sàng (Bấm để hủy)';
      } else {
        btn.classList.remove('is-ready-active');
        if (btnText) btnText.textContent = 'Sẵn sàng thi đấu';
      }
    }

    if (statusText) {
      if (isReady) {
        statusText.textContent = 'Bạn đã sẵn sàng! Đang chờ Quản trị viên bấm bắt đầu trận đấu.';
      } else {
        statusText.textContent = 'Chạm "Sẵn sàng thi đấu" để thông báo cho Quản trị viên bắt đầu trận.';
      }
    }

    if (indTag) {
      if (isReady) {
        indTag.className = 'player-ready-indicator-tag is-ready';
        indTag.textContent = 'Đã sẵn sàng';
      } else {
        indTag.className = 'player-ready-indicator-tag not-ready';
        indTag.textContent = 'Chưa sẵn sàng';
      }
    }
  }

  function togglePlayerReady() {
    gameState.isReady = !gameState.isReady;
    gameState.playerProfile.isReady = gameState.isReady;
    updatePlayerReadyUI();
    savePlayerSessionState();

    if (gameState.isReady) {
      SFX.pop();
    } else {
      SFX.tick();
    }

    // Gửi tín hiệu sẵn sàng lên Host
    broadcastMsg('player_ready', {
      pin: gameState.pin,
      playerId: gameState.myPlayerId,
      isReady: gameState.isReady
    });

    // Cập nhật ngay tag hiển thị trên chip của chính mình nếu có trong DOM
    var myChipTag = document.querySelector('#playerLobbyRosterList .player-chip.is-me-chip .chip-ready-tag');
    if (myChipTag) {
      if (gameState.isReady) {
        myChipTag.className = 'chip-ready-tag is-ready';
        myChipTag.textContent = 'Sẵn sàng';
      } else {
        myChipTag.className = 'chip-ready-tag not-ready';
        myChipTag.textContent = 'Chờ';
      }
    }
  }

  function renderPlayerWaitingRoster(playersList) {
    var rosterBox = document.getElementById('playerLobbyRosterBox');
    var lbBox = document.getElementById('playerLobbyLeaderboardBox');
    var accessTag = document.getElementById('playerRoomAccessTag');
    var hintText = document.getElementById('playerWaitingHintText');
    var readyActionBox = document.getElementById('playerReadyActionBox');

    var isPublic = (gameState.accessMode === 'public');

    if (accessTag) {
      accessTag.textContent = isPublic ? 'Công khai' : 'Riêng tư';
      accessTag.className = 'player-room-access-tag ' + (isPublic ? 'is-public' : 'is-private');
    }

    var list = Array.isArray(playersList) ? playersList.slice() : [];
    // Đảm bảo luôn có mặt bản thân người chơi trong danh sách hiển thị trên màn hình chờ của mình
    if (gameState.myPlayerId && !list.some(function (x) { return x.id === gameState.myPlayerId; })) {
      list.push({
        id: gameState.myPlayerId,
        name: gameState.playerProfile.name || 'Bạn',
        avatar: gameState.playerProfile.avatar || '🐼',
        score: gameState.playerLocalScore || 0,
        streak: gameState.playerLocalStreak || 0,
        isBot: false,
        isReady: !!gameState.isReady
      });
    }

    var pulsingLoader = document.querySelector('#playerLobbyView .pulsing-loader');
    var btnSoloStart = document.getElementById('btnPlayerStartPublicSolo');

    if (isPublic) {
      // ===== PHÒNG CÔNG KHAI: HIỆN BẢNG XẾP HẠNG TRỰC TIẾP & NÚT BẮT ĐẦU CHƠI NGAY =====
      if (lbBox) lbBox.style.display = 'block';
      if (rosterBox) rosterBox.style.display = 'none';
      if (hintText) hintText.style.display = 'none';
      if (pulsingLoader) pulsingLoader.style.display = 'none';
      if (readyActionBox) readyActionBox.style.display = 'none';
      if (btnSoloStart) {
        btnSoloStart.style.display = 'block';
        btnSoloStart.onclick = startPublicSoloGame;
      }

      var lbListEl = document.getElementById('playerLobbyLeaderboardList');
      var myRankBadge = document.getElementById('playerLobbyMyRankBadge');

      // Sắp xếp theo điểm số giảm dần
      var sorted = list.slice().sort(function (a, b) {
        return (b.score || 0) - (a.score || 0);
      });

      var myRank = sorted.findIndex(function (p) { return p.id === gameState.myPlayerId; }) + 1;
      if (myRankBadge) {
        myRankBadge.textContent = 'Hạng ' + (myRank || 1) + ' / ' + sorted.length;
      }

      if (lbListEl) {
        lbListEl.innerHTML = '';
        sorted.forEach(function (p, idx) {
          var rank = idx + 1;
          var isMe = (p.id === gameState.myPlayerId);
          var row = document.createElement('div');
          row.className = 'leaderboard-row' + (rank <= 3 ? (' top-' + rank) : '') + (isMe ? ' is-self' : '');

          var rankBadge = '#' + rank;
          var streakOrStatus = (p.streak >= 2 ? ('<span class="lb-streak">Chuỗi ' + p.streak + '</span>') : '<span class="lb-ready-badge">Sẵn sàng</span>');

          row.innerHTML =
            '<div class="lb-rank">' + rankBadge + '</div>' +
            '<div class="lb-avatar">' + (p.avatar || '🐼') + '</div>' +
            '<div class="lb-name">' + (p.name || 'Người chơi') + (isMe ? ' <b class="lb-you-tag">(Bạn)</b>' : '') + streakOrStatus + '</div>' +
            '<div class="lb-score">' + (p.score || 0).toLocaleString() + ' đ</div>';
          lbListEl.appendChild(row);
        });
      }
    } else {
      // ===== PHÒNG RIÊNG TƯ: HIỆN DANH SÁCH CHIP NGƯỜI CHƠI (CHỜ ADMIN BẤM BẮT ĐẦU) =====
      if (lbBox) lbBox.style.display = 'none';
      if (rosterBox) rosterBox.style.display = 'block';
      if (btnSoloStart) btnSoloStart.style.display = 'none';
      if (pulsingLoader) pulsingLoader.style.display = 'block';
      if (readyActionBox) readyActionBox.style.display = 'block';
      if (hintText) {
        hintText.style.display = 'block';
        hintText.textContent = 'Bạn đã có mặt trên màn hình lớn! Nhấn "Sẵn sàng thi đấu" và chờ Quản trị viên bấm Bắt đầu.';
      }

      var listEl = document.getElementById('playerLobbyRosterList');
      var badgeEl = document.getElementById('playerLobbyCountBadge');
      if (badgeEl) badgeEl.textContent = list.length + ' người';

      if (listEl) {
        listEl.innerHTML = '';
        list.forEach(function (p) {
          var isMe = (p.id === gameState.myPlayerId);
          var isReady = isMe ? !!gameState.isReady : !!p.isReady;
          var chip = document.createElement('div');
          chip.className = 'player-chip' + (p.isBot ? ' bot' : '') + (isMe ? ' is-me-chip' : '');
          var readyPill = isReady
            ? '<span class="chip-ready-tag is-ready">Sẵn sàng</span>'
            : '<span class="chip-ready-tag not-ready">Chờ</span>';
          chip.innerHTML =
            '<span class="player-chip-avatar">' + (p.avatar || '🐼') + '</span>' +
            '<span class="player-chip-name">' + (p.name || 'Người chơi') + (isMe ? ' (Bạn)' : '') + '</span>' +
            readyPill;
          listEl.appendChild(chip);
        });
      }
    }

    updatePlayerReadyUI();
  }

  async function playerJoin() {
    var pinInput = document.getElementById('playerInputPin');
    var nameInput = document.getElementById('playerInputName');
    var joinBtn = document.getElementById('btnPlayerJoin');
    var pin = normalizePin(pinInput ? pinInput.value : '');
    var name = (nameInput ? nameInput.value : '').trim();

    if (!pin || pin.length < 4) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập mã PIN phòng gồm 6 chữ số!', 'warning');
      if (pinInput) pinInput.focus();
      return;
    }
    if (!name) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập Tên hiển thị (Nickname) của bạn!', 'warning');
      if (nameInput) nameInput.focus();
      return;
    }

    if (joinBtn) {
      joinBtn.disabled = true;
      joinBtn.innerHTML = '<span>Đang kiểm tra phòng thi đấu...</span>';
    }

    try {
      var checkResult = await verifyRoomExists(pin);

      if (!checkResult.valid) {
        SFX.wrong();
        if (checkResult.error === 'expired') {
          if (typeof showToast === 'function') {
            showToast('Phòng #' + formatPinCode(pin) + ' đã hết thời hạn lưu trữ.', 'error');
          }
        } else {
          if (typeof showToast === 'function') {
            showToast('Phòng #' + formatPinCode(pin) + ' không tồn tại hoặc đã đóng! Vui lòng kiểm tra lại mã PIN.', 'error');
          }
        }
        if (pinInput) {
          pinInput.focus();
          pinInput.select();
        }
        return;
      }

      joinRoomAsPlayer(pin, name, gameState.playerProfile.avatar, checkResult.room);
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Không thể kết nối đến máy chủ. Vui lòng thử lại!', 'error');
      }
    } finally {
      if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.innerHTML = '<span>Vào phòng thi đấu ➔</span>';
      }
    }
  }

  function joinRoomAsPlayer(pin, name, avatar, verifiedRoom) {
    var cleanPin = normalizePin(pin);
    if (!cleanPin || cleanPin.length < 4) {
      if (typeof showToast === 'function') showToast('Mã phòng không hợp lệ!', 'error');
      return;
    }
    if (!name || !name.trim()) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập Biệt danh của bạn!', 'warning');
      return;
    }

    var cleanName = name.trim();
    var cleanAvatar = avatar || gameState.playerProfile.avatar || '🐼';

    // 1. Áp dụng thông tin từ phòng đã được xác thực (verifiedRoom)
    var targetRoom = verifiedRoom || null;

    if (!targetRoom) {
      try {
        var hostRoomRaw = localStorage.getItem('wq_arena_host_room_' + cleanPin);
        if (hostRoomRaw) {
          targetRoom = JSON.parse(hostRoomRaw);
        }
      } catch (e) { }

      if (!targetRoom) {
        var pubRooms = getSavedPublicRooms();
        targetRoom = pubRooms.find(function (pr) { return normalizePin(pr.pin) === cleanPin; });
      }
    }

    // NẾU VẪN KHÔNG CÓ targetRoom HỢP LỆ: CHẶN LẠI VÀ BÁO LỖI, TUYỆT ĐỐI KHÔNG TỰ TẠO PHÒNG DUMMY!
    if (!targetRoom) {
      SFX.wrong();
      if (typeof showToast === 'function') {
        showToast('Phòng #' + formatPinCode(cleanPin) + ' không tồn tại hoặc đã đóng! Vui lòng kiểm tra lại mã PIN.', 'error');
      }
      return;
    }

    // Kiểm tra thời hạn lưu trữ
    if (targetRoom.expiresAt && Number(targetRoom.expiresAt) > 0 && Date.now() >= Number(targetRoom.expiresAt)) {
      SFX.wrong();
      if (typeof showToast === 'function') {
        showToast('Phòng #' + formatPinCode(cleanPin) + ' đã hết thời hạn lưu trữ.', 'error');
      }
      return;
    }

    // Cập nhật cấu hình phòng thi đấu chính xác từ Host
    gameState.accessMode = targetRoom.accessMode || 'private';
    gameState.gameMode = targetRoom.gameMode || 'speed';
    gameState.deckName = targetRoom.deckName || 'HSK 1';
    gameState.timePerQuestion = targetRoom.timePerQuestion || 15;
    gameState.roomExpiresAt = targetRoom.expiresAt || null;
    gameState.roomDurationLabel = targetRoom.durationLabel || '30 phút';

    if (Array.isArray(targetRoom.questions) && targetRoom.questions.length > 0) {
      gameState.questions = targetRoom.questions;
      gameState.totalQuestions = targetRoom.questions.length;
    } else {
      if (!gameState.deckWords || gameState.deckWords.length === 0) {
        gameState.deckWords = getWordsFromDeckVal(gameState.deckName || 'HSK 1');
      }
      generateQuestions(cleanPin);
    }
    savePlayerProfile(cleanName, cleanAvatar);

    // Nếu trước đó đã có phiên trong phòng này với cùng tên thì tái sử dụng ID để giữ nguyên điểm số
    var existingSessionId = '';
    try {
      var prevSessRaw = localStorage.getItem('wq_arena_player_session_' + cleanPin);
      if (prevSessRaw) {
        var prevSess = JSON.parse(prevSessRaw);
        if (prevSess && prevSess.myPlayerId && prevSess.name === cleanName) {
          existingSessionId = prevSess.myPlayerId;
        }
      }
    } catch (e) { }

    gameState.role = 'player';
    gameState.status = 'player_lobby';
    gameState.pin = cleanPin;
    gameState.myPlayerId = existingSessionId || ('player_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    gameState.playerJoinAcked = false;
    gameState.playerLastChoice = -1;
    gameState.playerLocalScore = 0;
    gameState.playerLocalStreak = 0;
    gameState.playerLastPhaseAction = '';
    gameState.playerLastPhasePayload = null;

    var avatarEl = document.getElementById('playerWaitingAvatar');
    var nameEl = document.getElementById('playerWaitingName');
    var pinEl = document.getElementById('playerConnectedPin');
    var headerAvatar = document.getElementById('playerHeaderAvatar');
    var headerName = document.getElementById('playerHeaderName');

    if (avatarEl) avatarEl.textContent = cleanAvatar;
    if (nameEl) nameEl.textContent = cleanName;
    if (pinEl) pinEl.textContent = formatPinCode(cleanPin);
    if (headerAvatar) headerAvatar.textContent = cleanAvatar;
    if (headerName) headerName.textContent = cleanName;

    // Hiển thị danh sách phòng chờ
    var cachedRoster = [];
    try {
      var savedRosterStr = localStorage.getItem('wq_arena_roster_' + cleanPin);
      if (savedRosterStr) {
        var parsedRoster = JSON.parse(savedRosterStr);
        if (parsedRoster) {
          if (parsedRoster.expiresAt !== undefined) gameState.roomExpiresAt = parsedRoster.expiresAt;
          if (parsedRoster.durationLabel) gameState.roomDurationLabel = parsedRoster.durationLabel;
          if (parsedRoster.accessMode) gameState.accessMode = parsedRoster.accessMode;
          if (Array.isArray(parsedRoster.players)) {
            cachedRoster = parsedRoster.players;
          }
        }
      }
    } catch (e) { }
    renderPlayerWaitingRoster(cachedRoster);

    syncBrowserUrl(cleanPin, 'player');
    savePlayerSessionState();
    startExpiryCountdownTicker();

    showView('playerLobbyView');
    SFX.pop();

    startCloudPolling(cleanPin);

    var joinPayload = {
      id: gameState.myPlayerId,
      name: cleanName,
      avatar: cleanAvatar,
      pin: cleanPin,
      isReady: !!gameState.isReady
    };
    broadcastMsg('player_join', joinPayload);

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
    clearTimeout(gameState.soloPhaseTimer);
    clearTimeout(gameState.soloTimeoutTimer);
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

  // Pha 1 trên điện thoại: Hiện đề bài trước 3 giây, pre-fill options và đếm ngược đồng bộ mốc Host
  function onPlayerReceivePhase1(p, isRestore) {
    if (!isRestore) {
      gameState.playerLastChoice = -1;
    }
    gameState.status = 'player_game';
    gameState.playerLastPhaseAction = 'phase_1_getready';
    gameState.playerLastPhasePayload = p;
    if (p.expiresAt !== undefined) gameState.roomExpiresAt = p.expiresAt;
    if (p.durationLabel) gameState.roomDurationLabel = p.durationLabel;
    savePlayerSessionState();

    showView('playerGameView');
    hideAllPlayerSubCards();

    var miniPrompt = document.getElementById('playerMiniPrompt');
    var p1Card = document.getElementById('playerPhase1Card');
    var p1Badge = document.getElementById('playerPhase1Badge');
    var p1Prompt = document.getElementById('playerPhase1Prompt');
    var p1Sub = document.getElementById('playerPhase1Sub');
    var p1Sec = document.getElementById('playerPhase1Sec');
    var timerSecEl = document.getElementById('playerTimerSec');
    var timerBadge = document.getElementById('playerTimerBadge');
    if (timerBadge) timerBadge.style.display = 'inline-flex';
    if (timerBadge) timerBadge.style.display = 'inline-flex';

    var qLabel = 'Câu số ' + ((p.questionIndex || 0) + 1) + '/' + (p.totalQuestions || 10);
    if (miniPrompt) miniPrompt.textContent = qLabel + ' • Đọc đề';
    if (p1Badge) p1Badge.textContent = qLabel + ' – Chuẩn bị...';
    if (p1Prompt) p1Prompt.textContent = p.prompt || '';
    if (p1Sub) p1Sub.textContent = p.subPrompt || 'Hãy nhìn kỹ đề bài trước khi 4 phương án A, B, C, D mở ra!';

    // Pre-fill trước các ô đáp án để khi chuyển Pha 2 là xuất hiện tức thì không bị giật lag
    if (Array.isArray(p.options)) {
      for (var i = 0; i < 4; i++) {
        var lbl = document.getElementById('playerPadLabel' + i);
        if (lbl) lbl.textContent = p.options[i] || '';
      }
    }

    var prepSec = p.prepSeconds || 3;
    var phase1EndAt = p.phase1EndAt || (getHostNow() + (prepSec * 1000));
    var durationSec = p.durationSec || 15;
    var phase2EndAt = p.phase2EndAt || (phase1EndAt + (durationSec * 1000));

    // Nếu thời điểm nhận tín hiệu mà đã quá hạn Pha 1 (ví dụ mạng chậm hoặc f5 muộn) -> Chuyển thẳng sang Pha 2!
    if (getHostNow() >= phase1EndAt) {
      onPlayerReceivePhase2({
        pin: p.pin,
        questionIndex: p.questionIndex,
        totalQuestions: p.totalQuestions,
        prompt: p.prompt,
        options: p.options,
        durationSec: durationSec,
        startTime: phase1EndAt,
        endTime: phase2EndAt,
        expiresAt: p.expiresAt,
        durationLabel: p.durationLabel
      }, isRestore);
      return;
    }

    if (p1Card) p1Card.style.display = 'flex';

    var lastDisplayedPrepSec = -1;
    function updatePlayerP1Tick() {
      var remMs = Math.max(0, phase1EndAt - getHostNow());
      var currentSec = Math.ceil(remMs / 1000);
      if (currentSec !== lastDisplayedPrepSec) {
        lastDisplayedPrepSec = currentSec;
        if (p1Sec) p1Sec.textContent = currentSec;
        if (timerSecEl) timerSecEl.textContent = currentSec;
      }

      if (remMs <= 0) {
        if (gameState.playerTimerInterval) {
          clearInterval(gameState.playerTimerInterval);
          gameState.playerTimerInterval = null;
        }
        // Tự động bung đáp án Pha 2 chuẩn xác theo đồng hồ mốc Host!
        onPlayerReceivePhase2({
          pin: p.pin,
          questionIndex: p.questionIndex,
          totalQuestions: p.totalQuestions,
          prompt: p.prompt,
          options: p.options,
          durationSec: durationSec,
          startTime: phase1EndAt,
          endTime: phase2EndAt,
          expiresAt: p.expiresAt,
          durationLabel: p.durationLabel
        }, false);
      }
    }

    updatePlayerP1Tick();
    gameState.playerTimerInterval = setInterval(updatePlayerP1Tick, 100);
  }

  // Pha 2 trên điện thoại: Bung 4 nút A, B, C, D cùng lúc và đếm ngược theo endTime đồng bộ
  function onPlayerReceivePhase2(p, isRestore) {
    if (!isRestore) {
      gameState.playerLastChoice = -1;
    }
    var wasAlreadyInPhase2 = (gameState.status === 'player_game' && gameState.playerLastPhaseAction === 'phase_2_active');
    gameState.status = 'player_game';
    gameState.playerLastPhaseAction = 'phase_2_active';
    gameState.playerLastPhasePayload = p;
    if (p.expiresAt !== undefined) gameState.roomExpiresAt = p.expiresAt;
    if (p.durationLabel) gameState.roomDurationLabel = p.durationLabel;
    savePlayerSessionState();

    showView('playerGameView');
    hideAllPlayerSubCards();

    var miniPrompt = document.getElementById('playerMiniPrompt');
    var p2Wrap = document.getElementById('playerPhase2Wrap');
    var barFill = document.getElementById('playerTimerBarFill');
    var timerSecEl = document.getElementById('playerTimerSec');
    var timerBadge = document.getElementById('playerTimerBadge');
    if (timerBadge) timerBadge.style.display = 'inline-flex';

    var qLabel = 'Câu ' + ((p.questionIndex || 0) + 1) + ': ' + (p.prompt || '');
    if (miniPrompt) miniPrompt.textContent = qLabel;

    if (Array.isArray(p.options)) {
      for (var i = 0; i < 4; i++) {
        var lbl = document.getElementById('playerPadLabel' + i);
        if (lbl) lbl.textContent = p.options[i] || '';
      }
    }

    if (p2Wrap) p2Wrap.style.display = 'block';
    if (!isRestore && !wasAlreadyInPhase2) {
      SFX.revealPop();
    }

    var durationSec = p.durationSec || 15;
    var durationMs = durationSec * 1000;
    var endTime = p.endTime || (getHostNow() + durationMs);

    var lastTickSec = -1;
    function updatePlayerP2Tick() {
      var remainingMs = Math.max(0, endTime - getHostNow());
      var remainingSec = Math.ceil(remainingMs / 1000);

      if (remainingSec !== lastTickSec) {
        lastTickSec = remainingSec;
        if (timerSecEl) timerSecEl.textContent = remainingSec;
        if (timerBadge) {
          if (remainingSec <= 5 && remainingSec > 0) {
            timerBadge.classList.add('urgent');
          } else {
            timerBadge.classList.remove('urgent');
          }
        }
      }

      var pct = Math.max(0, Math.min(100, (remainingMs / durationMs) * 100));
      if (barFill) barFill.style.width = pct + '%';

      if (remainingMs <= 0) {
        if (gameState.playerTimerInterval) {
          clearInterval(gameState.playerTimerInterval);
          gameState.playerTimerInterval = null;
        }
      }
    }

    updatePlayerP2Tick();
    gameState.playerTimerInterval = setInterval(updatePlayerP2Tick, 100);
  }

  // Pha 3 trên điện thoại: Người chơi chạm chọn 1 đáp án -> Khóa màn hình cá nhân ngay lập tức
  function playerSubmitAnswer(choiceIndex) {
    var numericChoice = parseInt(choiceIndex, 10);
    if (isNaN(numericChoice) || gameState.playerLastChoice !== -1) return;

    gameState.playerLastChoice = numericChoice;
    savePlayerSessionState();
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

    // NẾU ĐANG CHƠI PHÒNG CÔNG KHAI (SOLO RUNNER):
    // Lập tức ngắt sớm chuyển sang Pha 4 chấm điểm cho người chơi!
    if (gameState.isSoloRunner) {
      clearTimeout(gameState.soloTimeoutTimer);
      setTimeout(function () {
        runPublicSoloPhase4(gameState.currentQuestionIndex, numericChoice);
      }, 350);
    }
  }

  // Pha 4 trên điện thoại: Lật bài -> Đổi toàn bộ nền sang Xanh Lá (Chính xác!) hoặc Đỏ (Sai mất rồi!)
  function onPlayerReceivePhase4(p, isRestore) {
    gameState.status = 'player_game';
    gameState.playerLastPhaseAction = 'phase_4_reveal';
    gameState.playerLastPhasePayload = p;
    if (p.expiresAt !== undefined) gameState.roomExpiresAt = p.expiresAt;
    if (p.durationLabel) gameState.roomDurationLabel = p.durationLabel;

    showView('playerGameView');
    hideAllPlayerSubCards();

    var timerBadge = document.getElementById('playerTimerBadge');
    if (timerBadge) timerBadge.style.display = 'none';

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
    } else if (!isRestore) {
      if (isCorrect) {
        gameState.playerLocalScore += earned;
        gameState.playerLocalStreak += 1;
      } else {
        gameState.playerLocalStreak = 0;
      }
    }
    savePlayerSessionState();

    if (curScoreEl) curScoreEl.textContent = gameState.playerLocalScore.toLocaleString();
    if (headerStreak) {
      if (gameState.playerLocalStreak >= 2) {
        headerStreak.style.display = 'inline-flex';
        headerStreak.innerHTML = 'Chuỗi <span>' + gameState.playerLocalStreak + '</span>';
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
      if (resultIcon) {
        resultIcon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#266b4d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
      }
      if (resultText) resultText.textContent = 'Chính xác';
      if (scorePlus) scorePlus.textContent = '+' + earned + ' điểm';
      if (streakPill) {
        if (gameState.playerLocalStreak >= 2) {
          streakPill.style.display = 'inline-block';
          streakPill.textContent = 'Chuỗi ' + gameState.playerLocalStreak + ' câu đúng liên tiếp';
        } else {
          streakPill.style.display = 'none';
        }
      }
      var isLast = (gameState.currentQuestionIndex >= gameState.totalQuestions - 1);

      if (rankStatus) {
        rankStatus.textContent = gameState.isSoloRunner
          ? (isLast ? 'Hoàn thành lượt thi. Đang tổng kết bảng xếp hạng...' : 'Tự động chuyển câu mới sau 2.5s...')
          : 'Hãy nhìn lên màn hình lớn để xem biểu đồ thống kê.';
      }
      if (!isRestore) SFX.correct();
    } else {
      var isLast = (gameState.currentQuestionIndex >= gameState.totalQuestions - 1);
      var correctLetter = p.correctLetter || OPTION_LETTERS[p.correctIndex] || 'A';
      if (resultIcon) {
        if (gameState.playerLastChoice === -1) {
          resultIcon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ab6f24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        } else {
          resultIcon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#b83a2d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        }
      }
      if (resultText) {
        resultText.textContent = gameState.playerLastChoice === -1 ? 'Hết giờ' : 'Chưa chính xác';
      }
      if (scorePlus) {
        scorePlus.textContent = 'Đáp án đúng là ' + correctLetter + ': ' + (p.correctText || '');
      }
      if (streakPill) streakPill.style.display = 'none';
      if (rankStatus) {
        rankStatus.textContent = gameState.isSoloRunner
          ? (isLast ? 'Hết trận. Đang tổng kết bảng xếp hạng...' : 'Tự động chuyển câu mới sau 2.5s...')
          : 'Chuẩn bị cho câu tiếp theo.';
      }
      if (!isRestore) SFX.wrong();
    }

    // Cơ chế tự động chuyển câu phòng công khai (Solo): Hoàn toàn tự động, KHÔNG CẦN BẤM NÚT CÂU TIẾP THEO
    var soloNextBtn = document.getElementById('playerSoloNextBtn');
    if (soloNextBtn) soloNextBtn.style.display = 'none';

    var progressWrap = document.getElementById('soloAutoProgressWrap');
    var progressFill = document.getElementById('soloAutoProgressFill');
    var progressText = document.getElementById('soloAutoProgressText');

    if (gameState.isSoloRunner) {
      if (progressWrap) progressWrap.style.display = 'flex';
      if (progressText) {
        progressText.textContent = isLast ? 'Tự động tổng kết sau 2.5s...' : 'Tự động chuyển câu sau 2.5s...';
      }
      if (progressFill) {
        progressFill.style.transition = 'none';
        progressFill.style.width = '100%';
        void progressFill.offsetHeight;
        progressFill.style.transition = 'width 2.5s linear';
        progressFill.style.width = '0%';
      }

      if (gameState.soloAutoAdvanceTimer) {
        clearTimeout(gameState.soloAutoAdvanceTimer);
        gameState.soloAutoAdvanceTimer = null;
      }

      gameState.soloAutoAdvanceTimer = setTimeout(function () {
        gameState.soloAutoAdvanceTimer = null;
        if (progressWrap) progressWrap.style.display = 'none';
        if (isLast) {
          finishPublicSoloGame();
        } else {
          runPublicSoloQuestion(gameState.currentQuestionIndex + 1);
        }
      }, 2500);

      // Cho phép chạm bất kỳ đâu trên màn hình kết quả để qua ngay nếu không muốn đợi
      if (resultOverlay) {
        resultOverlay.style.cursor = 'pointer';
        resultOverlay.onclick = function () {
          if (!gameState.isSoloRunner) return;
          if (gameState.soloAutoAdvanceTimer) {
            clearTimeout(gameState.soloAutoAdvanceTimer);
            gameState.soloAutoAdvanceTimer = null;
          }
          if (progressWrap) progressWrap.style.display = 'none';
          if (isLast) {
            finishPublicSoloGame();
          } else {
            runPublicSoloQuestion(gameState.currentQuestionIndex + 1);
          }
        };
      }
    } else {
      if (progressWrap) progressWrap.style.display = 'none';
      if (resultOverlay) {
        resultOverlay.style.cursor = 'default';
        resultOverlay.onclick = null;
      }
    }
  }

  // Pha 5 trên điện thoại: Cập nhật thứ hạng hiện tại
  function onPlayerReceivePhase5(p, isRestore) {
    gameState.status = 'player_game';
    gameState.playerLastPhaseAction = 'phase_5_leaderboard';
    gameState.playerLastPhasePayload = p;
    if (p.expiresAt !== undefined) gameState.roomExpiresAt = p.expiresAt;
    if (p.durationLabel) gameState.roomDurationLabel = p.durationLabel;
    savePlayerSessionState();

    showView('playerGameView');
    hideAllPlayerSubCards();

    var timerBadge = document.getElementById('playerTimerBadge');
    if (timerBadge) timerBadge.style.display = 'none';

    var p5Card = document.getElementById('playerPhase5Card');
    var p5Medal = document.getElementById('playerPhase5Medal');
    var p5Title = document.getElementById('playerPhase5Title');
    var p5Gap = document.getElementById('playerPhase5Gap');
    var p5Total = document.getElementById('playerPhase5Total');

    var myRankObj = (p.rankings || []).find(function (x) { return x.id === gameState.myPlayerId; });
    if (myRankObj) {
      var r = myRankObj.rank;
      if (p5Medal) {
        p5Medal.textContent = '#' + r;
      }
      if (p5Title) {
        p5Title.textContent = 'Bạn đang đứng Hạng ' + r;
      }
      if (p5Gap) {
        if (r === 1) {
          p5Gap.textContent = 'Bạn đang dẫn đầu cả phòng';
        } else {
          p5Gap.textContent = 'Chỉ kém người dẫn đầu ' + (myRankObj.gapToLeader || 0).toLocaleString() + ' điểm';
        }
      }
      if (p5Total) {
        p5Total.textContent = 'Tổng điểm hiện tại: ' + myRankObj.score.toLocaleString() + ' đ';
      }
    }

    if (p5Card) p5Card.style.display = 'block';
    if (!isRestore) SFX.pop();
  }

  // ==================== CƠ CHẾ TỰ ĐỘNG THI ĐẤU PHÒNG CÔNG KHAI (SOLO RUNNER) ====================
  function startPublicSoloGame() {
    if (!gameState.pin) return;
    stopPlayerJoinHeartbeat();

    // 1. Đảm bảo danh sách câu hỏi đã sẵn sàng
    if (!Array.isArray(gameState.questions) || gameState.questions.length === 0) {
      try {
        var hostRoomRaw = localStorage.getItem('wq_arena_host_room_' + gameState.pin);
        if (hostRoomRaw) {
          var hr = JSON.parse(hostRoomRaw);
          if (hr && Array.isArray(hr.questions) && hr.questions.length > 0) {
            gameState.questions = hr.questions;
            gameState.totalQuestions = hr.questions.length;
            gameState.timePerQuestion = hr.timePerQuestion || 15;
            gameState.gameMode = hr.gameMode || gameState.gameMode;
          }
        }
      } catch (e1) { }
    }

    if (!Array.isArray(gameState.questions) || gameState.questions.length === 0) {
      var pubRooms = getSavedPublicRooms();
      var matchPub = pubRooms.find(function (pr) { return normalizePin(pr.pin) === normalizePin(gameState.pin); });
      if (matchPub && Array.isArray(matchPub.questions) && matchPub.questions.length > 0) {
        gameState.questions = matchPub.questions;
        gameState.totalQuestions = matchPub.questions.length;
        gameState.timePerQuestion = matchPub.timePerQuestion || 15;
        gameState.gameMode = matchPub.gameMode || gameState.gameMode;
      }
    }

    if (!Array.isArray(gameState.questions) || gameState.questions.length === 0) {
      if (!gameState.deckWords || gameState.deckWords.length === 0) {
        gameState.deckWords = getWordsFromDeckVal(gameState.deckName || gameState.deckValue || 'HSK 1');
      }
      generateQuestions(gameState.pin);
    }

    gameState.isSoloRunner = true;
    gameState.currentQuestionIndex = 0;
    gameState.totalQuestions = (gameState.questions && gameState.questions.length) || 10;
    gameState.playerLocalScore = 0;
    gameState.playerLocalStreak = 0;
    gameState.playerLastChoice = -1;

    runPublicSoloQuestion(0);
  }

  function runPublicSoloQuestion(qIdx) {
    if (gameState.soloAutoAdvanceTimer) {
      clearTimeout(gameState.soloAutoAdvanceTimer);
      clearInterval(gameState.soloAutoAdvanceTimer);
      gameState.soloAutoAdvanceTimer = null;
    }
    var progressWrap = document.getElementById('soloAutoProgressWrap');
    if (progressWrap) progressWrap.style.display = 'none';

    if (qIdx >= gameState.totalQuestions || qIdx >= gameState.questions.length) {
      finishPublicSoloGame();
      return;
    }

    gameState.currentQuestionIndex = qIdx;
    gameState.playerLastChoice = -1;
    var q = gameState.questions[qIdx];
    if (!q) {
      finishPublicSoloGame();
      return;
    }

    // Pha 1: Get Ready 3s
    var p1Payload = {
      pin: gameState.pin,
      questionIndex: qIdx,
      totalQuestions: gameState.totalQuestions,
      prompt: q.prompt,
      subPrompt: q.subPrompt,
      prepSeconds: 3,
      expiresAt: gameState.roomExpiresAt,
      durationLabel: gameState.roomDurationLabel
    };

    onPlayerReceivePhase1(p1Payload, false);

    if (q.hanziAudio && typeof speak === 'function') {
      speak(q.hanziAudio);
    }

    clearTimeout(gameState.soloPhaseTimer);
    gameState.soloPhaseTimer = setTimeout(function () {
      if (gameState.role !== 'player' || !gameState.isSoloRunner) return;
      var durationSec = gameState.timePerQuestion || 15;
      var endTime = Date.now() + durationSec * 1000;
      gameState.soloQuestionStartTime = Date.now();
      gameState.soloQuestionEndTime = endTime;

      var p2Payload = {
        pin: gameState.pin,
        questionIndex: qIdx,
        totalQuestions: gameState.totalQuestions,
        prompt: q.prompt,
        options: q.options,
        durationSec: durationSec,
        endTime: endTime,
        expiresAt: gameState.roomExpiresAt,
        durationLabel: gameState.roomDurationLabel
      };

      onPlayerReceivePhase2(p2Payload, false);

      // Đếm ngược hết giờ Pha 2
      clearTimeout(gameState.soloTimeoutTimer);
      gameState.soloTimeoutTimer = setTimeout(function () {
        if (gameState.role !== 'player' || !gameState.isSoloRunner) return;
        if (gameState.playerLastChoice === -1) {
          runPublicSoloPhase4(qIdx, -1);
        }
      }, durationSec * 1000);
    }, 3000);
  }

  function runPublicSoloPhase4(qIdx, choiceIdx) {
    var q = gameState.questions[qIdx];
    if (!q) return;

    var isCorrect = (choiceIdx !== -1 && Number(choiceIdx) === Number(q.correctIndex));
    var correctLetter = OPTION_LETTERS[q.correctIndex] || 'A';

    var earned = 0;
    if (isCorrect) {
      var timeUsedMs = Date.now() - (gameState.soloQuestionStartTime || Date.now());
      var totalDurationMs = (gameState.timePerQuestion || 15) * 1000;
      var speedRatio = Math.max(0, Math.min(1, 1 - (timeUsedMs / totalDurationMs)));
      earned = Math.round(500 + 500 * speedRatio);
      gameState.playerLocalScore += earned;
      gameState.playerLocalStreak += 1;
    } else {
      gameState.playerLocalStreak = 0;
    }

    // Cập nhật điểm và thứ hạng lên BXH Công Khai
    updatePlayerScoreInPublicRoom(gameState.pin, gameState.myPlayerId, gameState.playerLocalScore, gameState.playerLocalStreak);

    var p4Payload = {
      pin: gameState.pin,
      questionIndex: qIdx,
      correctIndex: q.correctIndex,
      correctLetter: correctLetter,
      correctText: q.options[q.correctIndex] || '',
      scores: [{
        id: gameState.myPlayerId,
        score: gameState.playerLocalScore,
        streak: gameState.playerLocalStreak,
        lastEarned: earned
      }],
      expiresAt: gameState.roomExpiresAt,
      durationLabel: gameState.roomDurationLabel
    };

    onPlayerReceivePhase4(p4Payload, false);
  }

  function finishPublicSoloGame() {
    if (gameState.soloAutoAdvanceTimer) {
      clearTimeout(gameState.soloAutoAdvanceTimer);
      clearInterval(gameState.soloAutoAdvanceTimer);
      gameState.soloAutoAdvanceTimer = null;
    }
    var progressWrap = document.getElementById('soloAutoProgressWrap');
    if (progressWrap) progressWrap.style.display = 'none';

    gameState.status = 'player_game';
    gameState.isSoloRunner = false;
    hideAllPlayerSubCards();
    showView('playerGameView');

    updatePlayerScoreInPublicRoom(gameState.pin, gameState.myPlayerId, gameState.playerLocalScore, gameState.playerLocalStreak);

    var myRank = 1;
    var totalPlayers = 1;
    var pubRooms = getSavedPublicRooms();
    var matchPub = pubRooms.find(function (pr) { return normalizePin(pr.pin) === normalizePin(gameState.pin); });
    if (matchPub && Array.isArray(matchPub.players)) {
      var sorted = matchPub.players.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
      totalPlayers = sorted.length;
      var foundIdx = sorted.findIndex(function (p) { return p.id === gameState.myPlayerId; });
      if (foundIdx !== -1) myRank = foundIdx + 1;
    }

    var p5Card = document.getElementById('playerPhase5Card');
    var p5Medal = document.getElementById('playerPhase5Medal');
    var p5Title = document.getElementById('playerPhase5Title');
    var p5Gap = document.getElementById('playerPhase5Gap');
    var p5Total = document.getElementById('playerPhase5Total');

    if (p5Medal) {
      p5Medal.textContent = '#' + myRank;
    }
    if (p5Title) {
      p5Title.textContent = 'Hoàn thành bài thi! Hạng #' + myRank + (totalPlayers > 1 ? (' / ' + totalPlayers + ' người') : '');
    }
    if (p5Gap) {
      p5Gap.textContent = (myRank === 1)
        ? 'Bạn đang giữ vị trí Top 1 của phòng'
        : ('Đã ghi danh vào bảng xếp hạng phòng #' + formatPinCode(gameState.pin));
    }
    if (p5Total) {
      p5Total.textContent = 'Tổng điểm đạt được: ' + (gameState.playerLocalScore || 0).toLocaleString() + ' đ';
    }

    var p5Wait = document.getElementById('playerPhase5WaitHint') || document.querySelector('#playerPhase5Card .phase5-wait-hint');
    if (p5Wait) {
      p5Wait.innerHTML =
        '<div class="solo-finish-actions">' +
        '<button type="button" class="btn btn-hero-primary" id="btnSoloBackToLobby">Xem bảng xếp hạng phòng</button>' +
        '<button type="button" class="btn btn-secondary" id="btnSoloPlayAgain">Thi đấu lại</button>' +
        '</div>';

      var backBtn = document.getElementById('btnSoloBackToLobby');
      if (backBtn) {
        backBtn.onclick = function () {
          showView('playerLobbyView');
          renderPlayerWaitingRoster((matchPub && matchPub.players) || []);
        };
      }
      var replayBtn = document.getElementById('btnSoloPlayAgain');
      if (replayBtn) {
        replayBtn.onclick = function () {
          startPublicSoloGame();
        };
      }
    }

    if (p5Card) p5Card.style.display = 'block';
    SFX.fanfare();
    if (typeof confetti === 'function') {
      try {
        confetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
      } catch (e) { }
    }
  }

  function updatePlayerScoreInPublicRoom(pin, playerId, score, streak) {
    var cleanPin = normalizePin(pin);
    if (!cleanPin) return;

    var playerName = gameState.playerProfile.name || 'Người chơi';
    var playerAvatar = gameState.playerProfile.avatar || '🐼';

    var pubRooms = getSavedPublicRooms();
    var matchPub = pubRooms.find(function (pr) { return normalizePin(pr.pin) === cleanPin; });

    if (matchPub) {
      if (!Array.isArray(matchPub.players)) matchPub.players = [];
      var existing = matchPub.players.find(function (p) { return p.id === playerId; });
      if (existing) {
        existing.score = Math.max(existing.score || 0, score);
        existing.streak = Math.max(existing.streak || 0, streak);
      } else {
        matchPub.players.push({
          id: playerId,
          name: playerName,
          avatar: playerAvatar,
          score: score,
          streak: streak,
          isBot: false
        });
      }
      matchPub.playerCount = matchPub.players.length;
      matchPub.updatedAt = Date.now();
      saveSavedPublicRooms(pubRooms);
    }

    try {
      var rList = (matchPub && matchPub.players) || [];
      localStorage.setItem('wq_arena_roster_' + cleanPin, JSON.stringify({
        pin: cleanPin,
        accessMode: 'public',
        players: rList,
        updatedAt: Date.now()
      }));
    } catch (e) { }

    try {
      var hostRoomRaw = localStorage.getItem('wq_arena_host_room_' + cleanPin);
      if (hostRoomRaw) {
        var hostRoom = JSON.parse(hostRoomRaw);
        if (hostRoom && Array.isArray(hostRoom.players)) {
          var hExisting = hostRoom.players.find(function (p) { return p.id === playerId; });
          if (hExisting) {
            hExisting.score = Math.max(hExisting.score || 0, score);
            hExisting.streak = Math.max(hExisting.streak || 0, streak);
          } else {
            hostRoom.players.push({
              id: playerId,
              name: playerName,
              avatar: playerAvatar,
              score: score,
              streak: streak,
              isBot: false
            });
          }
          localStorage.setItem('wq_arena_host_room_' + cleanPin, JSON.stringify(hostRoom));
          if (gameState.role === 'host' && normalizePin(gameState.pin) === cleanPin) {
            gameState.players = hostRoom.players;
            renderPlayerList();
          }
        }
      }
    } catch (e) { }

    broadcastMsg('lobby_roster_sync', {
      pin: cleanPin,
      accessMode: 'public',
      players: (matchPub && matchPub.players) || []
    }, true);
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

    if (action === 'public_room_sync' || action === 'public_room_removed') {
      if (gameState.role === 'player' && (gameState.status === 'config' || gameState.status === 'player_join')) {
        renderPublicRoomsList(getSavedPublicRooms());
      }
    }

    // --- XỬ LÝ PHÍA ADMIN (HOST) ---
    if (gameState.role === 'host') {
      if (normalizePin(p.pin) !== normalizePin(gameState.pin)) return;

      if (action === 'player_ready') {
        var targetP = gameState.players.find(function (x) { return x.id === p.playerId; });
        if (targetP) {
          targetP.isReady = !!p.isReady;
          renderPlayerList();
          broadcastLobbyRoster();
          saveHostRoomState();
        }
      } else if (action === 'player_join') {
        var existingById = gameState.players.find(function (x) { return x.id === p.id; });
        if (!existingById) {
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
            isBot: false,
            isReady: !!p.isReady
          });
          SFX.pop();
          renderPlayerList();
          broadcastLobbyRoster();
          if (typeof showToast === 'function') {
            showToast((p.avatar || '🐼') + ' ' + p.name + ' đã vào phòng!', 'success');
          }
        } else {
          existingById.name = p.name || existingById.name;
          existingById.avatar = p.avatar || existingById.avatar;
          if (typeof p.isReady === 'boolean') {
            existingById.isReady = p.isReady;
          }
          renderPlayerList();
          broadcastLobbyRoster();
        }

        // Nếu trận đấu đang diễn ra ở Pha 2 mà người chơi vừa tải lại trang / vào lại, gửi lại câu hỏi hiện tại cho họ
        var curQ = gameState.questions[gameState.currentQuestionIndex];
        if (curQ && gameState.status === 'phase2') {
          broadcastMsg('phase_2_active', {
            pin: gameState.pin,
            questionIndex: gameState.currentQuestionIndex,
            totalQuestions: gameState.totalQuestions,
            prompt: curQ.prompt,
            options: curQ.options,
            durationSec: gameState.timePerQuestion,
            endTime: gameState.questionEndTime,
            expiresAt: gameState.roomExpiresAt,
            durationLabel: gameState.roomDurationLabel
          }, false);
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
      } else if (action === 'player_score_update') {
        var existingPS = gameState.players.find(function (x) { return x.id === p.playerId; });
        if (!existingPS && p.playerId) {
          gameState.players.push({
            id: p.playerId,
            name: p.name || 'Người chơi',
            avatar: p.avatar || '🐼',
            score: p.score || 0,
            prevRank: gameState.players.length + 1,
            streak: p.streak || 0,
            lives: 3,
            lastAnswerIndex: -1,
            answeredAt: Date.now(),
            lastPointsEarned: p.earned || 0,
            isBot: false
          });
        } else if (existingPS) {
          existingPS.score = Math.max(existingPS.score || 0, p.score || 0);
          existingPS.streak = Math.max(existingPS.streak || 0, p.streak || 0);
          existingPS.lastPointsEarned = p.earned || 0;
        }
        renderPlayerList();
      }
      return;
    }

    // --- XỬ LÝ PHÍA NGƯỜI CHƠI (PLAYER) ---
    if (gameState.role === 'player') {
      if (normalizePin(p.pin) !== normalizePin(gameState.pin)) return;

      // Đồng bộ đồng hồ mốc thời gian máy Host (Host Clock Offset compensation)
      if (data.timestamp && typeof data.timestamp === 'number') {
        var sampleOffset = data.timestamp - Date.now();
        if (!gameState.clockOffset) {
          gameState.clockOffset = sampleOffset;
        } else {
          gameState.clockOffset = Math.round(gameState.clockOffset * 0.7 + sampleOffset * 0.3);
        }
      }

      if (p.expiresAt !== undefined) gameState.roomExpiresAt = p.expiresAt;
      if (p.durationLabel) gameState.roomDurationLabel = p.durationLabel;
      updateExpiryBadges();

      if (action === 'lobby_roster_sync') {
        if (p.accessMode) {
          gameState.accessMode = p.accessMode;
        }
        var incomingPlayers = Array.isArray(p.players) ? p.players : [];
        if (incomingPlayers.some(function (x) { return x.id === gameState.myPlayerId; })) {
          gameState.playerJoinAcked = true;
          stopPlayerJoinHeartbeat();
        }
        savePlayerSessionState();
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
        if (p5Wait) p5Wait.textContent = 'Trận đấu đã kết thúc. Hãy xem Bục Vinh Quang trên màn hình lớn.';
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
      } else if (e.key === 'wq_arena_public_rooms' && e.newValue) {
        if (gameState.role === 'player' && (gameState.status === 'config' || gameState.status === 'player_join')) {
          renderPublicRoomsList(getSavedPublicRooms());
        }
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
          if (typeof showToast === 'function') showToast('Đăng nhập Quản trị viên thành công.', 'success');
          switchRoleTab('host');
        } else {
          SFX.wrong();
          if (typeof showToast === 'function') showToast('Sai tài khoản hoặc mật khẩu Quản trị viên. (Mặc định: admin / 123456)', 'error');
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
        gameState.role = 'host';
        gameState.myPlayerId = '';
        gameState.playerLastChoice = -1;
        gameState.playerLastPhaseAction = '';
        gameState.playerLastPhasePayload = null;
        syncBrowserUrl('', '');
        switchRoleTab('host');
        if (typeof showToast === 'function') {
          showToast('Đã mở bảng Tạo phòng thi đấu.', 'success');
        }
      } else {
        stopCloudPolling();
        cleanupCloudRoomMessages();
        gameState.role = 'player';
        gameState.pin = '';
        gameState.myPlayerId = '';
        gameState.status = 'config';
        syncBrowserUrl('', '');
        switchRoleTab('player');
      }
    });

    window.addEventListener('wq-admin-open-host', function () {
      if (isAdminLoggedIn()) {
        syncBrowserUrl('', '');
        switchRoleTab('host');
      }
    });

    var btnLobbyCreateNewGame = document.getElementById('btnLobbyCreateNewGame');
    if (btnLobbyCreateNewGame) {
      btnLobbyCreateNewGame.onclick = function () {
        saveHostRoomState();
        switchRoleTab('host');
      };
    }

    var btnAdminGoCreateFromJoin = document.getElementById('btnAdminGoCreateFromJoin');
    if (btnAdminGoCreateFromJoin) {
      btnAdminGoCreateFromJoin.onclick = function () {
        switchRoleTab('host');
      };
    }

    var btnAdminReturnHostFromLobby = document.getElementById('btnAdminReturnHostFromLobby');
    if (btnAdminReturnHostFromLobby) {
      btnAdminReturnHostFromLobby.onclick = function () {
        var cleanPin = normalizePin(gameState.pin || localStorage.getItem('wq_arena_active_host_pin'));
        if (cleanPin && restoreHostRoomByPin(cleanPin)) {
          return;
        }
        switchRoleTab('host');
      };
    }

    var btnAdminCreateNewFromLobby = document.getElementById('btnAdminCreateNewFromLobby');
    if (btnAdminCreateNewFromLobby) {
      btnAdminCreateNewFromLobby.onclick = function () {
        switchRoleTab('host');
      };
    }

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

    // Chọn Chế độ phòng (Công khai vs Riêng tư)
    var accessCards = document.querySelectorAll('#hostAccessModeCards .arena-access-card');
    accessCards.forEach(function (card) {
      card.onclick = function () {
        accessCards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        var rInput = card.querySelector('input[type="radio"]');
        if (rInput) rInput.checked = true;
        SFX.tick();
      };
    });

    // Tabs Người chơi: Phòng Công Khai vs Nhập Mã PIN
    var tabJoinPublic = document.getElementById('tabJoinPublic');
    var tabJoinPrivate = document.getElementById('tabJoinPrivate');
    var panelJoinPublic = document.getElementById('panelJoinPublic');
    var panelJoinPrivate = document.getElementById('panelJoinPrivate');

    if (tabJoinPublic && tabJoinPrivate) {
      tabJoinPublic.onclick = function () {
        tabJoinPublic.classList.add('active');
        tabJoinPrivate.classList.remove('active');
        if (panelJoinPublic) panelJoinPublic.style.display = 'block';
        if (panelJoinPrivate) panelJoinPrivate.style.display = 'none';
        fetchPublicRooms();
      };
      tabJoinPrivate.onclick = function () {
        tabJoinPrivate.classList.add('active');
        tabJoinPublic.classList.remove('active');
        if (panelJoinPrivate) panelJoinPrivate.style.display = 'block';
        if (panelJoinPublic) panelJoinPublic.style.display = 'none';
      };
    }

    var btnRefreshPublicRooms = document.getElementById('btnRefreshPublicRooms');
    if (btnRefreshPublicRooms) {
      btnRefreshPublicRooms.onclick = function () {
        fetchPublicRooms(function () {
          if (typeof showToast === 'function') showToast('Đã làm mới danh sách phòng công khai!', 'info');
        });
      };
    }

    var btnEditQuickProfile = document.getElementById('btnEditQuickProfile');
    if (btnEditQuickProfile) {
      btnEditQuickProfile.onclick = function () {
        if (tabJoinPrivate) tabJoinPrivate.click();
        var nameInput = document.getElementById('playerInputName');
        if (nameInput) nameInput.focus();
      };
    }

    var closePublicLbModalBtn = document.getElementById('closePublicLbModalBtn');
    if (closePublicLbModalBtn) closePublicLbModalBtn.onclick = closePublicLeaderboardModal;

    var btnClosePubModal = document.getElementById('btnClosePubModal');
    if (btnClosePubModal) btnClosePubModal.onclick = closePublicLeaderboardModal;

    var btnAddBot = document.getElementById('btnAddBot');
    if (btnAddBot) btnAddBot.onclick = addMockBot;

    var btnAddBotLb = document.getElementById('btnAddBotLb');
    if (btnAddBotLb) btnAddBotLb.onclick = addMockBot;

    var btnCancelRoom = document.getElementById('btnCancelRoom');
    if (btnCancelRoom) {
      btnCancelRoom.onclick = function () {
        saveHostRoomState();
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
      btnGoPhase5Leaderboard.onclick = function () {
        if (gameState.phase4AutoTimer) {
          clearInterval(gameState.phase4AutoTimer);
          gameState.phase4AutoTimer = null;
        }
        startPhase5Leaderboard();
      };
    }

    // Nút điều khiển của Admin từ Pha 5 -> Câu tiếp theo (Quay lại Pha 1)
    var btnContinueGame = document.getElementById('btnContinueGame');
    if (btnContinueGame) {
      btnContinueGame.onclick = function () {
        if (gameState.phase5AutoTimer) {
          clearInterval(gameState.phase5AutoTimer);
          gameState.phase5AutoTimer = null;
        }
        advanceToNextQuestion();
      };
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
        saveHostRoomState();
        switchRoleTab('host');
        populateDeckOptions();
      };
    }

    var btnExitArena = document.getElementById('btnExitArena');
    if (btnExitArena) {
      btnExitArena.onclick = function () {
        saveHostRoomState();
        window.location.href = '../index.html';
      };
    }

    // Player Join & Leave
    var btnPlayerJoin = document.getElementById('btnPlayerJoin');
    if (btnPlayerJoin) btnPlayerJoin.onclick = playerJoin;

    var playerInputPin = document.getElementById('playerInputPin');
    if (playerInputPin) {
      playerInputPin.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var nameIn = document.getElementById('playerInputName');
          if (nameIn && !nameIn.value.trim()) {
            nameIn.focus();
          } else {
            playerJoin();
          }
        }
      });
    }

    var playerInputName = document.getElementById('playerInputName');
    if (playerInputName) {
      playerInputName.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          playerJoin();
        }
      });
    }

    var btnPlayerToggleReady = document.getElementById('btnPlayerToggleReady');
    if (btnPlayerToggleReady) {
      btnPlayerToggleReady.onclick = togglePlayerReady;
    }

    var btnPlayerStartPublicSolo = document.getElementById('btnPlayerStartPublicSolo');
    if (btnPlayerStartPublicSolo) {
      btnPlayerStartPublicSolo.onclick = startPublicSoloGame;
    }

    var btnPlayerLeaveLobby = document.getElementById('btnPlayerLeaveLobby');
    if (btnPlayerLeaveLobby) {
      btnPlayerLeaveLobby.onclick = function () {
        playerLeaveRoom(false);
      };
    }

    var btnPlayerLeaveGame = document.getElementById('btnPlayerLeaveGame');
    if (btnPlayerLeaveGame) {
      btnPlayerLeaveGame.onclick = function () {
        playerLeaveRoom(false);
      };
    }

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
