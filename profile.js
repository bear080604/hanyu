// ---------- WQProfile & Admin Authentication Module ----------
(function () {
  var profileModal = null;

  function escHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isAdminLoggedIn() {
    var hasToken = Boolean(sessionStorage.getItem('wq_arena_admin_token') || localStorage.getItem('wq_arena_admin_token'));
    return hasToken && (
      sessionStorage.getItem('wq_arena_admin_logged') === '1' ||
      localStorage.getItem('wq_arena_admin_logged') === '1'
    );
  }

  function getAdminUsername() {
    return localStorage.getItem('wq_arena_admin_user') || 'admin';
  }

  function getAdminToken() {
    return sessionStorage.getItem('wq_arena_admin_token') || localStorage.getItem('wq_arena_admin_token') || '';
  }

  async function loginAdmin(username, password) {
    var u = String(username || '').trim();
    var p = String(password || '').trim();
    if (!u || !p) return false;

    try {
      var res;
      if (window.WeiQuanAPI && typeof window.WeiQuanAPI.adminLogin === 'function') {
        res = await window.WeiQuanAPI.adminLogin(u, p);
      } else {
        var r = await fetch('https://hanyu.phuonganhkhanh683.workers.dev/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        res = await r.json();
        if (!r.ok) return false;
      }

      if (res && res.success && res.token) {
        sessionStorage.setItem('wq_arena_admin_logged', '1');
        localStorage.setItem('wq_arena_admin_logged', '1');
        sessionStorage.setItem('wq_arena_admin_token', res.token);
        localStorage.setItem('wq_arena_admin_token', res.token);
        localStorage.setItem('wq_arena_admin_user', res.username || u);
        syncHeaderProfileButton();
        window.dispatchEvent(new CustomEvent('wq-admin-auth-changed', {
          detail: { loggedIn: true, username: getAdminUsername() }
        }));
        return true;
      }
    } catch (e) {
      console.warn('Admin login request failed:', e);
    }
    return false;
  }

  function logoutAdmin() {
    sessionStorage.removeItem('wq_arena_admin_logged');
    localStorage.removeItem('wq_arena_admin_logged');
    sessionStorage.removeItem('wq_arena_admin_token');
    localStorage.removeItem('wq_arena_admin_token');
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
    getAdminToken: getAdminToken,
    loginAdmin: loginAdmin,
    logoutAdmin: logoutAdmin,
    syncHeaderProfileButton: syncHeaderProfileButton,

    openProfileModal: function () {
      profileModal = profileModal || document.getElementById('profileModal');
      var modalBody = document.getElementById('profileModalBody');
      if (!modalBody) return;

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
          '<h3 class="profile-admin-name">' + escHtml(adminUser) + '</h3>' +
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

          '<button type="submit" class="btn btn-hero-primary" id="profLoginSubmitBtn" style="width:100%; margin-top:4px;">' +
          '<span>Đăng nhập</span>' +
          '</button>' +
          '</form>';

        var form = document.getElementById('profileAdminLoginForm');
        var uInput = document.getElementById('profAdminUser');
        var pInput = document.getElementById('profAdminPass');
        var errBox = document.getElementById('profLoginError');
        var submitBtn = document.getElementById('profLoginSubmitBtn');

        if (uInput) {
          setTimeout(function () { uInput.focus(); }, 60);
        }

        if (form) {
          form.onsubmit = async function (e) {
            e.preventDefault();
            var u = uInput ? uInput.value : '';
            var p = pInput ? pInput.value : '';
            if (submitBtn) submitBtn.disabled = true;
            var ok = await loginAdmin(u, p);
            if (submitBtn) submitBtn.disabled = false;
            if (ok) {
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
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    profileModal = document.getElementById('profileModal');
    syncHeaderProfileButton();

    var closeProfile = document.getElementById('closeProfileModalBtn');
    if (closeProfile && profileModal) {
      closeProfile.onclick = function () { profileModal.classList.remove('active'); };
    }

    window.addEventListener('click', function (e) {
      if (profileModal && e.target === profileModal) profileModal.classList.remove('active');
    });
  });

  window.WQProfile = WQProfile;
})();
