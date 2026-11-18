// ==================== LAYOUT.JS ====================
// Injects sidebar + header into every page.
// Load this as the FIRST script (non-defer) so the shell exists before page JS runs.

(function () {
  // Apply default Light Theme immediately before DOM paint (unless user explicitly toggled to 'dark' in v2)
  var savedTheme = localStorage.getItem('wq_theme_mode');
  if (!savedTheme || savedTheme === 'light') {
    document.documentElement.classList.add('light-theme');
    localStorage.setItem('wq_theme_mode', 'light');
    localStorage.setItem('wq_theme', 'light');
  } else {
    document.documentElement.classList.remove('light-theme');
  }

  // Clear legacy service worker caches so updates take effect immediately
  if (typeof caches !== 'undefined' && caches.keys) {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) {
        if (k !== 'wenqing-v11') caches.delete(k);
      });
    }).catch(function () { });
  }

  // Detect if we're at root or inside pages/
  var isInPages = location.pathname.indexOf('/pages/') !== -1;
  var root = isInPages ? '../' : '';

  function updateThemeFavicon(isLight) {
    var iconHref = root + (isLight ? 'logo-light.png' : 'logo-dark.png');
    var fav = document.querySelector('link[rel="icon"]');
    if (!fav) {
      fav = document.createElement('link');
      fav.rel = 'icon';
      fav.type = 'image/png';
      document.head.appendChild(fav);
    }
    fav.href = iconHref;

    var touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (!touchIcon) {
      touchIcon = document.createElement('link');
      touchIcon.rel = 'apple-touch-icon';
      document.head.appendChild(touchIcon);
    }
    touchIcon.href = iconHref;
  }
  window.updateThemeFavicon = updateThemeFavicon;
  updateThemeFavicon(document.documentElement.classList.contains('light-theme'));

  var SVG_ICONS = {
    home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    flash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
    quiz: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
    sentence: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
    write: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path></svg>',
    stats: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    favorites: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
    custom: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'
  };

  var NAV_ITEMS = [
    { page: 'home', href: root + 'index.html', icon: SVG_ICONS.home, label: 'Trang chủ' },
    { page: 'flash', href: root + 'pages/flash.html', icon: SVG_ICONS.flash, label: 'Flashcard' },
    { page: 'quiz', href: root + 'pages/quiz.html', icon: SVG_ICONS.quiz, label: 'Trắc nghiệm' },
    { page: 'sentence', href: root + 'pages/sentence.html', icon: SVG_ICONS.sentence, label: 'Ghép câu' },
    { page: 'write', href: root + 'pages/write.html', icon: SVG_ICONS.write, label: 'Nét chữ' },
    { page: 'stats', href: root + 'pages/stats.html', icon: SVG_ICONS.stats, label: 'Thống kê' },
    { page: 'favorites', href: root + 'pages/favorites.html', icon: SVG_ICONS.favorites, label: 'Yêu thích' },
    { page: 'custom', href: root + 'pages/custom.html', icon: SVG_ICONS.custom, label: 'Tự tạo' },
    { page: 'settings', href: root + 'pages/settings.html', icon: SVG_ICONS.settings, label: 'Cài đặt' },
  ];

  var PAGE_TITLES = {
    'index.html': 'Trang chủ',
    '': 'Trang chủ',
    'flash.html': 'Flashcard',
    'quiz.html': 'Trắc nghiệm',
    'sentence.html': 'Ghép câu',
    'write.html': 'Nét chữ',
    'stats.html': 'Thống kê',
    'favorites.html': 'Yêu thích',
    'custom.html': 'Tự tạo',
    'settings.html': 'Cài đặt',
  };

  var LEARN_PAGES = ['flash.html', 'quiz.html', 'sentence.html', 'write.html'];

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

    return '<div class="app-container">' +
      '<aside class="sidebar" id="sidebar">' +
      '<div class="sidebar-logo">' +
      '<div class="logo-img-wrap">' +
      '<img src="' + root + 'logo-light.png" alt="Logo Sáng" class="logo-img logo-img-light">' +
      '<img src="' + root + 'logo-dark.png" alt="Logo Tối" class="logo-img logo-img-dark">' +
      '</div>' +
      '</div>' +
      '<nav class="sidebar-menu">' + buildNavItems() + '</nav>' +
      '</aside>' +
      '<div class="sidebar-backdrop" id="sidebarBackdrop"></div>' +

      '<div class="main-content-layout">' +
      '<header class="app-header">' +
      '<div class="header-left">' +
      '<button class="hamburger-btn" id="sidebarToggleBtn" aria-label="Toggle Sidebar">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
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
      '<button class="btn btn-icon-only" id="shuffleBtn" title="Xáo trộn thứ tự">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="16 3 21 3 21 8"></polyline>' +
      '<line x1="4" y1="20" x2="21" y2="3"></line>' +
      '<polyline points="21 16 21 21 16 21"></polyline>' +
      '<line x1="15" y1="15" x2="21" y2="21"></line>' +
      '<line x1="4" y1="4" x2="9" y2="9"></line>' +
      '</svg>' +
      '</button>' +
      '</div>' +
      '<button class="btn btn-profile" id="openProfileBtn">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
      '<span>Hồ sơ</span>' +
      '</button>' +
      '<button class="theme-switch" id="themeBtn" type="button" role="switch" aria-label="Gạt đổi giao diện Sáng / Tối" title="Đổi giao diện Sáng / Tối">' +
      '<span class="theme-switch-track">' +
      '<span class="theme-switch-icon sun"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg></span>' +
      '<span class="theme-switch-icon moon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span>' +
      '<span class="theme-switch-thumb"></span>' +
      '</span>' +
      '</button>' +
      '</div>' +
      '</header>' +

      '<!-- Legacy stubs for app.js compatibility -->' +
      '<button id="favListBtn" style="display:none !important;"></button>' +
      '<div class="tabs" style="display:none !important;">' +
      '<div class="tab-indicator" id="tabIndicator"></div>' +
      '<div class="tab active" data-p="flash">Flashcard</div>' +
      '<div class="tab" data-p="quiz">Trắc nghiệm</div>' +
      '<div class="tab" data-p="write">Nét chữ</div>' +
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
    Array.from(document.body.children).forEach(function (el) {
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
    extras.forEach(function (el) {
      // Skip canvas (already in shell) and layout/script stubs
      if (el.id === 'bg-canvas') return;
      document.body.appendChild(el);
    });

    // Bind header theme switch immediately upon shell injection
    var themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
      var isLightNow = document.documentElement.classList.contains('light-theme');
      themeBtn.setAttribute('aria-checked', isLightNow ? 'true' : 'false');
      themeBtn.onclick = function () {
        if (typeof window.toggleAppTheme === 'function') {
          window.toggleAppTheme();
        } else {
          var nowLight = document.documentElement.classList.toggle('light-theme');
          localStorage.setItem('wq_theme_mode', nowLight ? 'light' : 'dark');
          localStorage.setItem('wq_theme', nowLight ? 'light' : 'dark');
          themeBtn.setAttribute('aria-checked', nowLight ? 'true' : 'false');
          updateThemeFavicon(nowLight);
        }
      };
    }
  }

  // Run immediately (script is non-defer)
  // But DOM may not be ready yet for body content — use DOMContentLoaded for inject
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // Sidebar toggle (hamburger + drawer on mobile)
  document.addEventListener('DOMContentLoaded', function () {
    var toggleBtn = document.getElementById('sidebarToggleBtn');
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebarBackdrop');

    function closeMobileSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
      document.body.classList.remove('sidebar-open');
    }

    function toggleMobileSidebar() {
      if (!sidebar) return;
      var isOpen = sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('active', isOpen);
      document.body.classList.toggle('sidebar-open', isOpen);
    }

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleMobileSidebar();
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', closeMobileSidebar);
    }

    // Close drawer when clicking any menu link on mobile
    var menuLinks = document.querySelectorAll('.sidebar-menu .menu-item');
    menuLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          closeMobileSidebar();
        }
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMobileSidebar();
    });
  });

})();
