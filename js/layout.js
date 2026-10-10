// ==================== LAYOUT.JS ====================
// Injects sidebar + header into every page.
// Load this as the FIRST script (non-defer) so the shell exists before page JS runs.

(function () {
  // Detect if we're at root or inside pages/
  var isInPages = location.pathname.indexOf('/pages/') !== -1;
  var root = isInPages ? '../' : '';

  var NAV_ITEMS = [
    { page: 'home',      href: root + 'index.html',          icon: '🏠', label: 'Trang chủ' },
    { page: 'flash',     href: root + 'pages/flash.html',    icon: '📇', label: 'Flashcard' },
    { page: 'quiz',      href: root + 'pages/quiz.html',     icon: '✏️', label: 'Trắc nghiệm' },
    { page: 'write',     href: root + 'pages/write.html',    icon: '🖌️', label: 'Nét chữ' },
    { page: 'stats',     href: root + 'pages/stats.html',    icon: '📊', label: 'Thống kê' },
    { page: 'favorites', href: root + 'pages/favorites.html',icon: '❤️', label: 'Yêu thích' },
    { page: 'custom',    href: root + 'pages/custom.html',   icon: '📝', label: 'Tự tạo' },
    { page: 'settings',  href: root + 'pages/settings.html', icon: '⚙️', label: 'Cài đặt' },
  ];

  var PAGE_TITLES = {
    'index.html':     'Trang chủ',
    '':               'Trang chủ',
    'flash.html':     'Flashcard',
    'quiz.html':      'Trắc nghiệm',
    'write.html':     'Nét chữ',
    'stats.html':     'Thống kê',
    'favorites.html': 'Yêu thích',
    'custom.html':    'Tự tạo',
    'settings.html':  'Cài đặt',
  };

  var LEARN_PAGES = ['flash.html', 'quiz.html', 'write.html'];

  function currentPageName() {
    return location.pathname.split('/').pop() || 'index.html';
  }

  function buildNavItems() {
    var page = currentPageName();
    return NAV_ITEMS.map(function (item) {
      var active = (item.page === 'home' && (page === 'index.html' || page === ''))
        || (item.page !== 'home' && page === item.page + '.html')
        ? ' active' : '';
      return '<a href="' + item.href + '" class="menu-item' + active + '" data-page="' + item.page + '">' +
        '<span class="menu-icon">' + item.icon + '</span>' +
        '<span class="menu-text">' + item.label + '</span>' +
        '</a>';
    }).join('');
  }

  function buildShell() {
    var page = currentPageName();
    var title = PAGE_TITLES[page] || '';
    var learnDisplay = LEARN_PAGES.indexOf(page) !== -1 ? 'flex' : 'none';

    return '<canvas id="bg-canvas"></canvas>' +
      '<div class="app-container">' +
        '<aside class="sidebar" id="sidebar">' +
          '<div class="sidebar-logo">' +
            '<svg class="logo-img" width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="WenQing Logo">' +
              '<defs>' +
                '<linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">' +
                  '<stop offset="0%" stop-color="#8B5CF6"/>' +
                  '<stop offset="100%" stop-color="#06B6D4"/>' +
                '</linearGradient>' +
              '</defs>' +
              '<rect width="40" height="40" rx="10" fill="url(#logoGrad)"/>' +
              '<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"' +
              ' font-family="\'PingFang SC\',\'Noto Serif SC\',serif"' +
              ' font-size="24" font-weight="700" fill="#fff">文</text>' +
            '</svg>' +
            '<span class="logo-text">WenQing <span>文卿</span></span>' +
          '</div>' +
          '<nav class="sidebar-menu">' + buildNavItems() + '</nav>' +
        '</aside>' +

        '<div class="main-content-layout">' +
          '<header class="app-header">' +
            '<div class="header-left">' +
              '<button class="hamburger-btn" id="sidebarToggleBtn" aria-label="Toggle Sidebar">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                  '<line x1="3" y1="12" x2="21" y2="12"></line>' +
                  '<line x1="3" y1="6" x2="21" y2="6"></line>' +
                  '<line x1="3" y1="18" x2="21" y2="18"></line>' +
                '</svg>' +
              '</button>' +
              '<h2 class="header-title" id="headerTitle">' + title + '</h2>' +
            '</div>' +
            '<div class="header-center">' +
              '<div class="search-wrapper">' +
                '<input type="text" id="searchInput" placeholder="Tìm kiếm từ, pinyin, nghĩa..." autocomplete="off">' +
                '<div class="search-suggestions" id="searchSuggestions"></div>' +
              '</div>' +
            '</div>' +
            '<div class="header-right">' +
              '<div class="learn-selectors-wrapper" id="learnSelectorsWrapper" style="display:' + learnDisplay + ';">' +
                '<div class="select-wrapper"><select id="levelSel"></select></div>' +
                '<div class="select-wrapper"><select id="rangeSel"></select></div>' +
                '<button class="btn" id="shuffleBtn" style="padding:10px 14px;border-radius:12px;">' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                    '<polyline points="16 3 21 3 21 8"></polyline>' +
                    '<line x1="4" y1="20" x2="21" y2="3"></line>' +
                    '<polyline points="21 16 21 21 16 21"></polyline>' +
                    '<line x1="15" y1="15" x2="21" y2="21"></line>' +
                    '<line x1="4" y1="4" x2="9" y2="9"></line>' +
                  '</svg>' +
                '</button>' +
              '</div>' +
              '<button class="btn" id="openProfileBtn" style="padding:8px 16px;border-radius:12px;font-size:0.85rem;display:inline-flex;align-items:center;gap:6px;">👤 Hồ sơ</button>' +
              '<button class="icon-btn" id="themeBtn" aria-label="Toggle Theme" style="display:none;"></button>' +
            '</div>' +
          '</header>' +

          '<!-- Legacy stubs for app.js compatibility -->' +
          '<button id="favListBtn" style="display:none !important;"></button>' +
          '<div class="tabs" style="display:none !important;">' +
            '<div class="tab-indicator" id="tabIndicator"></div>' +
            '<div class="tab active" data-p="flash">📇 Flashcard</div>' +
            '<div class="tab" data-p="quiz">✏️ Trắc nghiệm</div>' +
            '<div class="tab" data-p="write">🖌️ Nét chữ</div>' +
          '</div>' +

          '<main class="app-content" id="page-main">' +
          '</main>' +

          '<div class="footer">Dữ liệu HSK 1–6 · Nét chữ bởi HanziWriter · Phát âm chất lượng cao</div>' +
        '</div>' +
      '</div>';
  }

  function inject() {
    // Save page-main-content
    var existingMain = document.getElementById('page-main-content');
    var mainContent = existingMain ? existingMain.innerHTML : '';

    // Save all other top-level elements (modals, toastContainer, scripts, etc.)
    // that are NOT #page-main-content and NOT script tags (scripts already ran)
    var extras = [];
    Array.from(document.body.children).forEach(function(el) {
      if (el.id !== 'page-main-content' && el.tagName !== 'SCRIPT') {
        extras.push(el.cloneNode(true));
      }
    });

    // Inject shell
    document.body.innerHTML = buildShell();

    // Re-inject page content into <main>
    if (mainContent) {
      document.getElementById('page-main').innerHTML = mainContent;
    }

    // Re-append modals and other extras
    extras.forEach(function(el) {
      // Skip canvas (already in shell) and layout/script stubs
      if (el.id === 'bg-canvas') return;
      document.body.appendChild(el);
    });
  }

  // Run immediately (script is non-defer)
  // But DOM may not be ready yet for body content — use DOMContentLoaded for inject
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // Sidebar toggle (hamburger)
  document.addEventListener('DOMContentLoaded', function () {
    var toggleBtn = document.getElementById('sidebarToggleBtn');
    var sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', function () {
        sidebar.classList.toggle('collapsed');
      });
    }
  });

})();
