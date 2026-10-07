// ==================== FAVORITES.JS — Favorites page logic ====================
// Runs on favorites.html only. Requires js/shared.js to be loaded first.
// Reads AppState.favorites and renders into #favModalList.
// Uses speak(), showToast() from shared.js.

// ==================== RENDER FAV MODAL LIST ====================
function renderFavModalList() {
  var listEl = document.getElementById('favModalList');
  if (!listEl) return;

  var favs = (window.AppState && window.AppState.favorites) || [];

  if (!favs || favs.length === 0) {
    listEl.innerHTML =
      '<div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">' +
        '<div style="font-size: 3rem; margin-bottom: 16px;">❤️</div>' +
        '<p style="font-size: 1rem;">Chưa có từ yêu thích nào.</p>' +
        '<p style="font-size: 0.9rem; margin-top: 8px;">Nhấn ⭐ trong Flashcard để thêm từ vào đây.</p>' +
      '</div>';
    return;
  }

  listEl.innerHTML = '';

  favs.forEach(function(w, idx) {
    var card = document.createElement('div');
    card.className = 'glass-card fav-item';
    card.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; margin-bottom: 10px; gap: 12px;';

    // Left: word info
    var infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'flex: 1; min-width: 0;';
    infoDiv.innerHTML =
      '<span style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-right: 10px;">' + w.h + '</span>' +
      '<span style="font-size: 0.9rem; color: var(--accent-purple);">' + (w.p || '') + '</span>' +
      '<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + (w.m || '') + '</div>' +
      (w.levelGoc ? '<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">' + w.levelGoc + '</div>' : '');

    // Right: action buttons
    var actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = 'display: flex; gap: 8px; flex-shrink: 0;';

    // Speak button
    var speakBtn = document.createElement('button');
    speakBtn.className = 'icon-btn';
    speakBtn.title = 'Phát âm';
    speakBtn.setAttribute('aria-label', 'Phát âm ' + w.h);
    speakBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>' +
        '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>' +
        '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>' +
      '</svg>';
    speakBtn.onclick = (function(word) {
      return function(e) {
        e.stopPropagation();
        if (typeof speak === 'function') speak(word.h);
      };
    })(w);

    // Delete button
    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.title = 'Xóa khỏi yêu thích';
    deleteBtn.setAttribute('aria-label', 'Xóa ' + w.h + ' khỏi yêu thích');
    deleteBtn.style.color = 'var(--neon-red, #ef4444)';
    deleteBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polyline points="3 6 5 6 21 6"></polyline>' +
        '<path d="M19 6l-1 14H6L5 6"></path>' +
        '<path d="M10 11v6"></path>' +
        '<path d="M14 11v6"></path>' +
        '<path d="M9 6V4h6v2"></path>' +
      '</svg>';
    deleteBtn.onclick = (function(word) {
      return function(e) {
        e.stopPropagation();
        _removeFavorite(word.h);
      };
    })(w);

    actionsDiv.appendChild(speakBtn);
    actionsDiv.appendChild(deleteBtn);

    card.appendChild(infoDiv);
    card.appendChild(actionsDiv);
    listEl.appendChild(card);
  });
}

// ==================== REMOVE FAVORITE ====================
function _removeFavorite(hanzi) {
  var favs = (window.AppState && window.AppState.favorites) || [];
  var idx = favs.findIndex(function(f) { return f.h === hanzi; });
  if (idx === -1) return;

  favs.splice(idx, 1);

  // Persist
  if (window.WQStorage && WQStorage.saveFavorites) {
    WQStorage.saveFavorites(favs);
  } else {
    localStorage.setItem('wq_favorites', JSON.stringify(favs));
  }

  if (window.AppState) window.AppState.favorites = favs;

  // Update the level selector option text if function exists
  if (typeof updateFavOptionText === 'function') updateFavOptionText();

  if (typeof showToast === 'function') showToast('Đã bỏ yêu thích "' + hanzi + '"', 'info');

  renderFavModalList();
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener('DOMContentLoaded', function() {
  // Load favorites from localStorage into AppState
  var storedFavs = [];
  if (window.WQStorage && WQStorage.getFavorites) {
    storedFavs = WQStorage.getFavorites() || [];
  } else {
    try { storedFavs = JSON.parse(localStorage.getItem('wq_favorites')) || []; } catch(e) {}
  }

  if (window.AppState) {
    window.AppState.favorites = storedFavs;
  }

  renderFavModalList();
});
