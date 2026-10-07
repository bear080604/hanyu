// ==================== STATS.JS — Statistics page logic ====================
// Runs on stats.html only. Requires js/shared.js to be loaded first.
// Reads localStorage keys: wq_progress, wq_srs, wq_favorites, wq_custom_decks
// Renders into #statsModalBody inside #section-stats.

// ==================== RENDER STATS SECTION ====================
function renderStatsSection() {
  var bodyEl = document.getElementById('statsModalBody');
  if (!bodyEl) return;

  // ---------- Read learned words ----------
  var progressData = null;
  if (window.WQStorage && WQStorage.getProgress) {
    progressData = WQStorage.getProgress();
  } else {
    try { progressData = JSON.parse(localStorage.getItem('wq_progress')); } catch(e) {}
  }
  var learnedList = (progressData && progressData.learned) || [];

  // ---------- Read SRS data ----------
  var srsData = null;
  if (window.WQStorage && WQStorage.getSRS) {
    srsData = WQStorage.getSRS();
  } else {
    try { srsData = JSON.parse(localStorage.getItem('wq_srs')); } catch(e) {}
  }
  srsData = srsData || {};

  // ---------- Read favorites ----------
  var favList = [];
  if (window.WQStorage && WQStorage.getFavorites) {
    favList = WQStorage.getFavorites() || [];
  } else {
    try { favList = JSON.parse(localStorage.getItem('wq_favorites')) || []; } catch(e) {}
  }

  // ---------- Read custom decks ----------
  var customDecks = [];
  try { customDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || []; } catch(e) {}

  // ---------- Compute per-level progress ----------
  var levelStats = {};
  var totalWordsGlobal = 0;
  if (typeof DATA !== 'undefined') {
    Object.keys(DATA).forEach(function(lvl) {
      var words = DATA[lvl];
      if (!words || !words.length) return;
      var count = 0;
      words.forEach(function(w) { if (learnedList.indexOf(w.h) !== -1) count++; });
      levelStats[lvl] = { total: words.length, learned: count };
      totalWordsGlobal += words.length;
    });
  }

  // ---------- SRS review due today ----------
  var today = new Date().toISOString().split('T')[0];
  var dueToday = 0;
  Object.keys(srsData).forEach(function(h) {
    var item = srsData[h];
    if (item && item.nextReview && item.nextReview <= today) dueToday++;
  });

  var totalReviewed = Object.keys(srsData).length;

  // ---------- Compute current streak (approximation) ----------
  var streak = learnedList.length > 0 ? Math.max(1, Math.min(30, Math.ceil(learnedList.length / 5))) : 0;

  // ---------- Build HTML ----------
  var html = '';

  // Summary cards
  html += '<div class="stats-summary-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; margin-bottom: 28px;">';

  html += _statCard('📚', 'Đã học', learnedList.length + ' từ', 'var(--accent-purple)');
  html += _statCard('🔥', 'Chuỗi ngày', streak + ' ngày', '#f59e0b');
  html += _statCard('❤️', 'Yêu thích', favList.length + ' từ', '#ec4899');
  html += _statCard('🔄', 'Ôn tập hôm nay', dueToday + ' từ', '#06b6d4');
  html += _statCard('🧠', 'Tổng ôn tập', totalReviewed + ' lượt', '#10b981');
  html += _statCard('📝', 'Bộ tự tạo', customDecks.length + ' bộ', '#8b5cf6');

  html += '</div>';

  // Per-level progress
  if (Object.keys(levelStats).length > 0) {
    html += '<h3 style="margin-bottom: 16px; color: var(--text-primary);">Tiến độ từng cấp HSK</h3>';
    html += '<div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 28px;">';

    Object.keys(levelStats).forEach(function(lvl) {
      var s = levelStats[lvl];
      var pct = s.total > 0 ? Math.round((s.learned / s.total) * 100) : 0;
      html += '<div class="glass-card" style="padding: 16px 20px;">';
      html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">';
      html += '<span style="font-weight: 600; color: var(--text-primary);">' + lvl + '</span>';
      html += '<span style="font-size: 0.85rem; color: var(--text-secondary);">' + s.learned + ' / ' + s.total + ' từ (' + pct + '%)</span>';
      html += '</div>';
      html += '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ' + pct + '%;"></div></div>';
      html += '</div>';
    });

    html += '</div>';
  }

  // SRS breakdown (top mastered words)
  var srsKeys = Object.keys(srsData);
  if (srsKeys.length > 0) {
    // Sort by reviewCount descending to find most-reviewed
    srsKeys.sort(function(a, b) {
      return (srsData[b].reviewCount || 0) - (srsData[a].reviewCount || 0);
    });
    var topWords = srsKeys.slice(0, 10);

    html += '<h3 style="margin-bottom: 16px; color: var(--text-primary);">📈 Từ ôn tập nhiều nhất</h3>';
    html += '<div class="glass-card" style="padding: 16px 20px; margin-bottom: 28px;">';
    html += '<table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">';
    html += '<thead><tr style="color: var(--text-muted);">';
    html += '<th style="text-align: left; padding: 6px 10px;">Chữ</th>';
    html += '<th style="text-align: left; padding: 6px 10px;">Lần ôn</th>';
    html += '<th style="text-align: left; padding: 6px 10px;">Ôn tiếp</th>';
    html += '</tr></thead><tbody>';

    topWords.forEach(function(h) {
      var item = srsData[h];
      html += '<tr style="border-top: 1px solid var(--border-color);">';
      html += '<td style="padding: 8px 10px; font-size: 1.1rem; color: var(--text-primary);">' + h + '</td>';
      html += '<td style="padding: 8px 10px; color: var(--text-secondary);">' + (item.reviewCount || 0) + '</td>';
      html += '<td style="padding: 8px 10px; color: var(--text-secondary);">' + (item.nextReview || '—') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += '</div>';
  }

  // Words due for review today
  if (dueToday > 0) {
    var dueWords = Object.keys(srsData).filter(function(h) {
      var item = srsData[h];
      return item && item.nextReview && item.nextReview <= today;
    }).slice(0, 20);

    html += '<h3 style="margin-bottom: 16px; color: var(--text-primary);">🔔 Từ cần ôn hôm nay (' + dueToday + ' từ)</h3>';
    html += '<div class="glass-card" style="padding: 16px 20px; margin-bottom: 28px;">';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';

    dueWords.forEach(function(h) {
      html += '<span style="background: rgba(139,92,246,0.15); border: 1px solid var(--accent-purple); border-radius: 8px; padding: 6px 12px; font-size: 1rem; color: var(--text-primary);">' + h + '</span>';
    });

    if (dueToday > 20) {
      html += '<span style="color: var(--text-muted); font-size: 0.85rem; align-self: center;">…và ' + (dueToday - 20) + ' từ khác</span>';
    }

    html += '</div></div>';
  }

  // Favorites list preview
  if (favList.length > 0) {
    html += '<h3 style="margin-bottom: 16px; color: var(--text-primary);">❤️ Từ yêu thích (' + favList.length + ')</h3>';
    html += '<div class="glass-card" style="padding: 16px 20px;">';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';
    favList.slice(0, 30).forEach(function(w) {
      html += '<span title="' + (w.p || '') + ' — ' + (w.m || '') + '" style="background: rgba(236,72,153,0.12); border: 1px solid #ec4899; border-radius: 8px; padding: 6px 12px; font-size: 1rem; color: var(--text-primary); cursor: default;">' + w.h + '</span>';
    });
    if (favList.length > 30) {
      html += '<span style="color: var(--text-muted); font-size: 0.85rem; align-self: center;">…và ' + (favList.length - 30) + ' từ khác</span>';
    }
    html += '</div></div>';
  }

  bodyEl.innerHTML = html;
}

// ---------- Helper: small summary card ----------
function _statCard(icon, label, value, color) {
  return '<div class="glass-card" style="padding: 18px; text-align: center; border-top: 3px solid ' + color + ';">' +
    '<div style="font-size: 1.8rem; margin-bottom: 6px;">' + icon + '</div>' +
    '<div style="font-size: 1.3rem; font-weight: 700; color: ' + color + '; margin-bottom: 4px;">' + value + '</div>' +
    '<div style="font-size: 0.8rem; color: var(--text-muted);">' + label + '</div>' +
    '</div>';
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener('DOMContentLoaded', function() {
  // Render immediately — DATA may still be loading; shared.js DOMContentLoaded
  // calls initUIWithData which fires synchronously when DATA is embedded.
  // A short defer ensures DATA is populated before we compute per-level stats.
  setTimeout(function() {
    renderStatsSection();
  }, 200);
});
