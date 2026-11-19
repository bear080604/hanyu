// ---------- WQProfile & Admin Authentication Module ----------
(function () {
  var profileModal = null;
  var statsModal = null;

  var ADMIN_ACCOUNTS = {
    admin: '123456',
    teacher: '123456',
    wenqing: 'admin123'
  };

  function isAdminLoggedIn() {
    return sessionStorage.getItem('wq_arena_admin_logged') === '1' ||
      localStorage.getItem('wq_arena_admin_logged') === '1';
  }

  function getAdminUsername() {
    return localStorage.getItem('wq_arena_admin_user') || 'admin';
  }

  function loginAdmin(username, password) {
    var u = String(username || '').trim().toLowerCase();
    var p = String(password || '').trim();
    if ((u === 'admin' && (p === '123456' || p === 'admin123' || p === 'admin')) ||
      (ADMIN_ACCOUNTS[u] && ADMIN_ACCOUNTS[u] === p)) {
      sessionStorage.setItem('wq_arena_admin_logged', '1');
      localStorage.setItem('wq_arena_admin_logged', '1');
      localStorage.setItem('wq_arena_admin_user', username.trim() || 'admin');
      syncHeaderProfileButton();
      window.dispatchEvent(new CustomEvent('wq-admin-auth-changed', {
        detail: { loggedIn: true, username: getAdminUsername() }
      }));
      return true;
    }
    return false;
  }

  function logoutAdmin() {
    sessionStorage.removeItem('wq_arena_admin_logged');
    localStorage.removeItem('wq_arena_admin_logged');
    syncHeaderProfileButton();
    window.dispatchEvent(new CustomEvent('wq-admin-auth-changed', {
      detail: { loggedIn: false }
    }));
  }

  function syncHeaderProfileButton() {
    var btn = document.getElementById('openProfileBtn');
    if (!btn) return;
    var span = btn.querySelector('span');
    if (isAdminLoggedIn()) {
      if (span) span.textContent = 'Admin';
      btn.classList.add('is-admin-active');
      btn.title = 'Đã đăng nhập Quản trị viên (' + getAdminUsername() + ')';
    } else {
      if (span) span.textContent = 'Hồ sơ';
      btn.classList.remove('is-admin-active');
      btn.title = 'Đăng nhập Quản trị viên (Admin)';
    }
  }

  function getArenaHref() {
    var isInPages = location.pathname.indexOf('/pages/') !== -1;
    return isInPages ? 'arena.html' : 'pages/arena.html';
  }

  var WQProfile = {
    isAdminLoggedIn: isAdminLoggedIn,
    getAdminUsername: getAdminUsername,
    loginAdmin: loginAdmin,
    logoutAdmin: logoutAdmin,
    syncHeaderProfileButton: syncHeaderProfileButton,

    openProfileModal: function () {
      profileModal = profileModal || document.getElementById('profileModal');
      var modalBody = document.getElementById('profileModalBody');
      if (!modalBody) return;

      // Update modal title
      var modalTitle = profileModal ? profileModal.querySelector('h2') : null;

      if (isAdminLoggedIn()) {
        if (modalTitle) modalTitle.textContent = 'Tài khoản Quản trị viên';

        var favorites = (window.WQStorage && WQStorage.getFavorites()) || [];
        var progress = (window.WQStorage && WQStorage.getProgress()) || {};
        var learnedCount = (progress.learned || []).length;
        var adminUser = getAdminUsername();
        var onArenaPage = location.pathname.indexOf('arena.html') !== -1;

        modalBody.innerHTML =
          '<div class="profile-admin-logged">' +
            '<div class="profile-admin-header">' +
              '<div class="profile-admin-avatar">👑</div>' +
              '<div class="profile-admin-meta">' +
                '<div class="profile-admin-role-badge">Quản trị viên hệ thống</div>' +
                '<h3 class="profile-admin-name">' + adminUser + '</h3>' +
                '<p class="profile-admin-sub">Đã cấp quyền Tạo phòng &amp; Điều khiển Đấu trường Kahoot</p>' +
              '</div>' +
            '</div>' +

            '<div class="profile-admin-stats">' +
              '<div class="profile-mini-stat">' +
                '<span class="p-stat-label">Từ đã học</span>' +
                '<span class="p-stat-val">' + learnedCount + ' từ</span>' +
              '</div>' +
              '<div class="profile-mini-stat">' +
                '<span class="p-stat-label">Từ yêu thích</span>' +
                '<span class="p-stat-val">' + favorites.length + ' từ</span>' +
              '</div>' +
            '</div>' +

            '<div class="profile-admin-actions">' +
              '<button type="button" class="btn btn-hero-primary" id="modalGoArenaHostBtn" style="width:100%;">' +
                '<span>🎮 ' + (onArenaPage ? 'Mở Bảng Tạo & Điều Khiển Trò Chơi' : 'Đi tới Đấu Trường (Tạo Trò Chơi)') + '</span>' +
              '</button>' +
              '<button type="button" class="btn btn-secondary" id="modalAdminLogoutBtn" style="width:100%;">' +
                '<span>Đăng xuất tài khoản Admin</span>' +
              '</button>' +
            '</div>' +
          '</div>';

        var goBtn = document.getElementById('modalGoArenaHostBtn');
        if (goBtn) {
          goBtn.onclick = function () {
            if (profileModal) profileModal.classList.remove('active');
            if (onArenaPage) {
              window.dispatchEvent(new CustomEvent('wq-admin-open-host'));
            } else {
              window.location.href = getArenaHref();
            }
          };
        }

        var outBtn = document.getElementById('modalAdminLogoutBtn');
        if (outBtn) {
          outBtn.onclick = function () {
            logoutAdmin();
            if (profileModal) profileModal.classList.remove('active');
            if (typeof window.showToast === 'function') {
              window.showToast('Đã đăng xuất tài khoản Quản trị viên.', 'info');
            }
          };
        }
      } else {
        if (modalTitle) modalTitle.textContent = 'Đăng nhập';

        modalBody.innerHTML =
          '<form id="profileAdminLoginForm" class="profile-login-form" onsubmit="return false;">' +
            '<div class="arena-form-group">' +
              '<label class="arena-label" for="profAdminUser">Tài khoản:</label>' +
              '<input type="text" id="profAdminUser" class="auth-input" placeholder="Nhập tài khoản" autocomplete="username">' +
            '</div>' +

            '<div class="arena-form-group">' +
              '<label class="arena-label" for="profAdminPass">Mật khẩu:</label>' +
              '<input type="password" id="profAdminPass" class="auth-input" placeholder="Nhập mật khẩu" autocomplete="current-password">' +
            '</div>' +

            '<div id="profLoginError" class="profile-login-error" style="display:none;">Sai tài khoản hoặc mật khẩu!</div>' +

            '<button type="submit" class="btn btn-hero-primary" style="width:100%; margin-top:4px;">' +
              '<span>Đăng nhập</span>' +
            '</button>' +
          '</form>';

        var form = document.getElementById('profileAdminLoginForm');
        var uInput = document.getElementById('profAdminUser');
        var pInput = document.getElementById('profAdminPass');
        var errBox = document.getElementById('profLoginError');

        if (uInput) {
          setTimeout(function () { uInput.focus(); }, 60);
        }

        if (form) {
          form.onsubmit = function (e) {
            e.preventDefault();
            var u = uInput ? uInput.value : '';
            var p = pInput ? pInput.value : '';
            if (loginAdmin(u, p)) {
              if (errBox) errBox.style.display = 'none';
              if (profileModal) profileModal.classList.remove('active');
              if (typeof window.showToast === 'function') {
                window.showToast('👑 Đăng nhập Quản trị viên thành công!', 'success');
              }
            } else {
              if (errBox) errBox.style.display = 'block';
              if (pInput) pInput.select();
            }
            return false;
          };
        }
      }

      if (profileModal) profileModal.classList.add('active');
    },

    openStatsModal: function () {
      var progress = (window.WQStorage && WQStorage.getProgress()) || {};
      var learnedList = progress.learned || [];

      var statsModalBody = document.getElementById('statsModalBody');
      if (!statsModalBody || typeof DATA === 'undefined') return;

      statsModalBody.innerHTML = '';

      var container = document.createElement('div');
      container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

      var title = document.createElement('h3');
      title.textContent = 'Tiến trình hoàn thành HSK';
      title.style.cssText = "font-family:'Plus Jakarta Sans', sans-serif; font-size:1.25rem; font-weight:700; color:var(--text-primary); border-bottom:1px solid var(--glass-border); padding-bottom:10px;";
      container.appendChild(title);

      Object.keys(DATA).forEach(function (lvl) {
        var words = DATA[lvl];
        if (!Array.isArray(words)) return;
        var totalWords = words.length;
        var learnedInLevel = words.filter(function (w) { return learnedList.includes(w.h); }).length;
        var percent = totalWords > 0 ? Math.round((learnedInLevel / totalWords) * 100) : 0;

        var levelRow = document.createElement('div');
        levelRow.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
        var labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex; justify-content:space-between; font-size:0.9rem; font-weight:600;';
        var spanLvl = document.createElement('span');
        spanLvl.style.color = 'var(--text-primary)';
        spanLvl.textContent = lvl;
        var spanCount = document.createElement('span');
        spanCount.style.color = 'var(--text-secondary)';
        spanCount.textContent = learnedInLevel + ' / ' + totalWords + ' từ (' + percent + '%)';
        labelRow.appendChild(spanLvl);
        labelRow.appendChild(spanCount);

        var barBg = document.createElement('div');
        barBg.style.cssText = 'width:100%; height:10px; background:rgba(139,92,246,0.1); border-radius:5px; border:1px solid var(--glass-border); overflow:hidden;';
        var barFill = document.createElement('div');
        barFill.style.cssText = 'width:' + percent + '%; height:100%; background:var(--accent-gradient); border-radius:5px; transition:width 0.5s ease;';

        barBg.appendChild(barFill);
        levelRow.appendChild(labelRow);
        levelRow.appendChild(barBg);
        container.appendChild(levelRow);
      });

      statsModalBody.appendChild(container);
      if (statsModal) statsModal.classList.add('active');
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    profileModal = document.getElementById('profileModal');
    statsModal = document.getElementById('statsModal');

    syncHeaderProfileButton();

    var closeProfile = document.getElementById('closeProfileModalBtn');
    if (closeProfile && profileModal) {
      closeProfile.onclick = function () { profileModal.classList.remove('active'); };
    }

    var closeStats = document.getElementById('closeStatsModalBtn');
    if (closeStats && statsModal) {
      closeStats.onclick = function () { statsModal.classList.remove('active'); };
    }

    window.addEventListener('click', function (e) {
      if (profileModal && e.target === profileModal) profileModal.classList.remove('active');
      if (statsModal && e.target === statsModal) statsModal.classList.remove('active');
    });
  });

  window.WQProfile = WQProfile;
})();
