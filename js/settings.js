// ==================== SETTINGS.JS — Settings page logic ====================
// Runs on settings.html only. Requires js/shared.js to be loaded first.
// localStorage keys used: wq_theme, wq_autoplay_speed, wq_progress, wq_srs, wq_favorites, wq_custom_decks

// ==================== UPDATE SETTINGS UI ====================
// Reads current settings from localStorage and syncs the UI controls.
function updateSettingsUI() {
  // --- Theme ---
  var themeBtn = document.getElementById('settingsThemeBtn');
  if (themeBtn) {
    var isLight = document.documentElement.classList.contains('light-theme');
    themeBtn.textContent = isLight ? '☀️ Chế độ sáng' : '🌙 Chế độ tối';
  }

  // --- Autoplay speed ---
  var speedSel = document.getElementById('settingsAutoplaySpeed');
  if (speedSel) {
    var savedSpeed = localStorage.getItem('wq_autoplay_speed');
    if (savedSpeed) {
      speedSel.value = savedSpeed;
    }
    // If no saved value, the HTML default (5000) remains selected — correct behavior.
  }
}

// ==================== INIT SETTINGS EVENTS ====================
// Binds event handlers for all controls on the settings page.
function initSettingsEvents() {
  // --- Theme toggle ---
  var themeBtn = document.getElementById('settingsThemeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function() {
      var nowLight = document.documentElement.classList.toggle('light-theme');
      themeBtn.textContent = nowLight ? '☀️ Chế độ sáng' : '🌙 Chế độ tối';
      localStorage.setItem('wq_theme', nowLight ? 'light' : 'dark');

      // Keep any visible themeBtn (header, hidden) in sync
      var headerThemeBtn = document.getElementById('themeBtn');
      if (headerThemeBtn) headerThemeBtn.textContent = nowLight ? '☀️' : '🌙';

      if (typeof showToast === 'function') {
        showToast(nowLight ? '☀️ Đã chuyển sang chế độ sáng' : '🌙 Đã chuyển sang chế độ tối', 'info');
      }
    });
  }

  // --- Autoplay speed ---
  var speedSel = document.getElementById('settingsAutoplaySpeed');
  if (speedSel) {
    speedSel.addEventListener('change', function() {
      localStorage.setItem('wq_autoplay_speed', speedSel.value);
      if (typeof showToast === 'function') {
        var labels = { '3000': '3 giây', '5000': '5 giây', '8000': '8 giây' };
        var label = labels[speedSel.value] || speedSel.value + ' ms';
        showToast('Đã lưu tốc độ tự động: ' + label, 'success');
      }
    });
  }

  // --- Reset progress ---
  var resetBtn = document.getElementById('resetProgressBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      var popup = window.wqPopup;
      var doReset = function() {
        // Clear all progress-related keys
        localStorage.removeItem('wq_progress');
        localStorage.removeItem('wq_srs');

        // Reset in-memory AppState if available
        if (window.AppState) {
          window.AppState.fcIdx = 0;
          window.AppState.wIdx  = 0;
          window.AppState.qScore = 0;
          window.AppState.qTotal = 0;
          window.AppState.quizPool = [];
          window.AppState.quizAskedWords = [];
        }

        if (typeof showToast === 'function') showToast('🗑️ Đã xóa toàn bộ tiến trình học!', 'info');
      };

      if (popup && typeof popup.confirm === 'function') {
        popup.confirm(
          'Bạn có chắc muốn xóa toàn bộ tiến trình học? Hành động này không thể hoàn tác.',
          { title: 'Xác nhận xóa tiến trình', icon: '⚠️', okText: 'Xóa', cancelText: 'Hủy' }
        ).then(function(confirmed) {
          if (confirmed) doReset();
        });
      } else {
        // Fallback to native confirm if popup overlay not present
        if (window.confirm('Bạn có chắc muốn xóa toàn bộ tiến trình học?')) {
          doReset();
        }
      }
    });
  }
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener('DOMContentLoaded', function() {
  updateSettingsUI();
  initSettingsEvents();
});
