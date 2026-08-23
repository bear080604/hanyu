// ---------- WQAuth module ----------
(function() {
  // Thuật toán SHA-256 thuần JavaScript (đồng bộ) chạy được trên mọi môi trường
  function sha256PureJS(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;

    var result = '';
    var words = [];
    var asciiLength = ascii[lengthProperty];
    var hash = [];
    var k = [];
    var primeCounter = 0;

    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = 1;
        }
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1/3) * maxWord) | 0;
      }
    }
    
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return ""; // Non-ASCII fallback
      words[i >> 2] |= j << ((3 - i % 4) * 8);
    }
    words[words[lengthProperty]] = ((asciiLength * 8) / maxWord) | 0;
    words[words[lengthProperty]] = (asciiLength * 8);
    
    for (j = 0; j < words[lengthProperty]; j += 16) {
      var w = words.slice(j, j + 16);
      var oldHash = hash.slice(0);
      
      for (i = 0; i < 64; i++) {
        var wItem = w[i];
        if (i >= 16) {
          var s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          var s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        
        var ch = (oldHash[4] & oldHash[5]) ^ (~oldHash[4] & oldHash[6]);
        var maj = (oldHash[0] & oldHash[1]) ^ (oldHash[0] & oldHash[2]) ^ (oldHash[1] & oldHash[2]);
        var s0_h = rightRotate(oldHash[0], 2) ^ rightRotate(oldHash[0], 13) ^ rightRotate(oldHash[0], 22);
        var s1_h = rightRotate(oldHash[4], 6) ^ rightRotate(oldHash[4], 11) ^ rightRotate(oldHash[4], 25);
        
        var temp1 = oldHash[7] + s1_h + ch + k[i] + (wItem || 0);
        var temp2 = s0_h + maj;
        
        oldHash[7] = oldHash[6];
        oldHash[6] = oldHash[5];
        oldHash[5] = oldHash[4];
        oldHash[4] = (oldHash[3] + temp1) | 0;
        oldHash[3] = oldHash[2];
        oldHash[2] = oldHash[1];
        oldHash[1] = oldHash[0];
        oldHash[0] = (temp1 + temp2) | 0;
      }
      
      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }
    
    for (i = 0; i < 8; i++) {
      var byteStr = (hash[i] >>> 0).toString(16);
      result += byteStr.padStart(8, '0');
    }
    
    return result;
  }

  // Thuật toán fallback cũ để hỗ trợ tương thích ngược
  function hashFallbackOld(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'fb_' + Math.abs(hash).toString(16);
  }

  // Hàm băm mật khẩu SHA-256 đồng bộ (sử dụng Promise để giữ nguyên kiểu gọi)
  async function hashPassword(password) {
    return sha256PureJS(password);
  }

  // Toast Notification
  function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      padding: 14px 22px;
      border-radius: 16px;
      font-size: 0.95rem;
      font-weight: 600;
      color: #fff;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.1);
      transform: translateY(20px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
    `;

    // Màu sắc theo loại toast
    let icon = '🔔';
    if (type === 'success') {
      toast.style.background = 'rgba(16, 185, 129, 0.2)';
      toast.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      toast.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.15)';
      icon = '✓';
    } else if (type === 'error') {
      toast.style.background = 'rgba(239, 68, 68, 0.2)';
      toast.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      toast.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.15)';
      icon = '✗';
    } else if (type === 'info') {
      toast.style.background = 'rgba(59, 130, 246, 0.2)';
      toast.style.borderColor = 'rgba(59, 130, 246, 0.4)';
      toast.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.15)';
      icon = 'ℹ';
    }

    toast.innerHTML = `<span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:currentColor; color:rgba(0,0,0,0.6); font-size:0.75rem; font-weight:900;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    // Animation hiện
    setTimeout(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    }, 50);

    // Tự động ẩn sau 3.5 giây
    setTimeout(() => {
      toast.style.transform = 'translateY(-20px)';
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3500);
  }

  // Đối tượng currentUser toàn cục
  let currentUser = null;

  const WQAuth = {
    async register(username, password, confirmPassword) {
      // Validate
      if (!username || !password || !confirmPassword) {
        showToast("Vui lòng điền đầy đủ tất cả các trường!", "error");
        return false;
      }
      if (username.length < 4) {
        showToast("Tên đăng nhập phải có ít nhất 4 ký tự!", "error");
        return false;
      }
      if (password.length < 6) {
        showToast("Mật khẩu phải có ít nhất 6 ký tự!", "error");
        return false;
      }
      if (password !== confirmPassword) {
        showToast("Mật khẩu nhập lại không khớp!", "error");
        return false;
      }

      const users = WQStorage.getUsers();
      const isExist = users.some(u => u.username.toLowerCase() === username.toLowerCase());
      if (isExist) {
        showToast("Tên đăng nhập này đã được sử dụng!", "error");
        return false;
      }

      // Hash mật khẩu và lưu
      const hashedPassword = await hashPassword(password);
      const newUser = {
        id: Date.now(),
        username: username,
        password: hashedPassword,
        createdAt: new Date().toISOString().split('T')[0],
        progress: {},
        favorites: [],
        srs: {}
      };

      users.push(newUser);
      WQStorage.saveUsers(users);
      showToast("Đăng ký tài khoản thành công!", "success");

      // Tự động đăng nhập sau khi đăng ký
      await this.login(username, password, false);
      return true;
    },

    async login(username, password, remember = false) {
      if (!username || !password) {
        showToast("Vui lòng nhập tên đăng nhập và mật khẩu!", "error");
        return false;
      }

      const users = WQStorage.getUsers();
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user) {
        showToast("Tên đăng nhập hoặc mật khẩu không chính xác!", "error");
        return false;
      }

      // So sánh mật khẩu có hỗ trợ tương thích ngược
      let isMatched = false;
      if (user.password.startsWith('fb_')) {
        isMatched = (user.password === hashFallbackOld(password));
      } else {
        isMatched = (user.password === sha256PureJS(password));
      }

      if (!isMatched) {
        showToast("Tên đăng nhập hoặc mật khẩu không chính xác!", "error");
        return false;
      }

      // Đăng nhập thành công
      currentUser = {
        id: user.id,
        username: user.username
      };

      WQStorage.setCurrentUser(currentUser, remember);
      showToast(`Chào mừng bạn quay lại, ${user.username}!`, "success");
      
      // Xóa class khóa màn hình khi chưa đăng nhập
      document.body.classList.remove('not-logged-in');
      const authModal = document.getElementById('authModal');
      if (authModal) authModal.classList.remove('active');

      // Kích hoạt đồng bộ hóa dữ liệu học tập
      if (window.WQSyncData) {
        window.WQSyncData(currentUser.username);
      }
      
      this.updateUI();
      return true;
    },

    logout() {
      if (!currentUser) return;
      
      showToast("Đã đăng xuất tài khoản.", "info");
      currentUser = null;
      WQStorage.setCurrentUser(null);

      // Thêm class khóa màn hình khi chưa đăng nhập và hiển thị modal đăng nhập
      document.body.classList.add('not-logged-in');
      const authModal = document.getElementById('authModal');
      if (authModal) authModal.classList.add('active');

      // Kích hoạt đồng bộ hóa dữ liệu trả về Khách (Guest)
      if (window.WQSyncData) {
        window.WQSyncData(null);
      }

      this.updateUI();
    },

    async changePassword(oldPassword, newPassword, confirmNewPassword) {
      if (!currentUser) return false;

      if (!oldPassword || !newPassword || !confirmNewPassword) {
        showToast("Vui lòng điền đầy đủ các trường mật khẩu!", "error");
        return false;
      }
      if (newPassword.length < 6) {
        showToast("Mật khẩu mới phải có ít nhất 6 ký tự!", "error");
        return false;
      }
      if (newPassword !== confirmNewPassword) {
        showToast("Mật khẩu mới nhập lại không khớp!", "error");
        return false;
      }

      const users = WQStorage.getUsers();
      const idx = users.findIndex(u => u.username === currentUser.username);
      if (idx === -1) return false;

      // So sánh mật khẩu cũ có hỗ trợ tương thích ngược
      let isMatched = false;
      if (users[idx].password.startsWith('fb_')) {
        isMatched = (users[idx].password === hashFallbackOld(oldPassword));
      } else {
        isMatched = (users[idx].password === sha256PureJS(oldPassword));
      }

      if (!isMatched) {
        showToast("Mật khẩu cũ không chính xác!", "error");
        return false;
      }

      const hashedNew = await hashPassword(newPassword);
      users[idx].password = hashedNew;
      WQStorage.saveUsers(users);

      showToast("Đổi mật khẩu thành công!", "success");
      return true;
    },

    getCurrentUser() {
      return currentUser;
    },

    init() {
      currentUser = WQStorage.getCurrentUser();
      if (currentUser) {
        document.body.classList.remove('not-logged-in');
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.classList.remove('active');

        // Đồng bộ dữ liệu của User
        if (window.WQSyncData) {
          window.WQSyncData(currentUser.username);
        }
      } else {
        document.body.classList.add('not-logged-in');
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.classList.add('active');
      }
      this.updateUI();
    },

    updateUI() {
      const userMenuContainer = document.getElementById('userMenuContainer');
      if (!userMenuContainer) return;

      if (currentUser) {
        userMenuContainer.innerHTML = `
          <div class="user-profile-dropdown">
            <button class="btn user-btn" id="userDropdownBtn" style="padding: 10px 18px; display: inline-flex; align-items: center; gap: 8px;">
              👤 <span class="username-display">${currentUser.username}</span>
            </button>
            <div class="dropdown-menu-content" id="userDropdownContent">
              <a href="#" id="viewProfileBtn">Hồ sơ cá nhân</a>
              <a href="#" id="viewStatsBtn">Tiến độ học</a>
              <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 6px 0;">
              <a href="#" id="logoutBtn" style="color: var(--neon-red);">Đăng xuất</a>
            </div>
          </div>
        `;

        // Event listener dropdown toggle
        const btn = document.getElementById('userDropdownBtn');
        const content = document.getElementById('userDropdownContent');
        if (btn && content) {
          btn.onclick = (e) => {
            e.stopPropagation();
            content.classList.toggle('show');
          };
        }

        // Đóng menu khi bấm ra ngoài
        document.addEventListener('click', () => {
          if (content) content.classList.remove('show');
        });

        // Event profile
        const viewProfile = document.getElementById('viewProfileBtn');
        if (viewProfile && window.WQProfile) {
          viewProfile.onclick = (e) => {
            e.preventDefault();
            window.WQProfile.openProfileModal();
          };
        }

        // Event Stats
        const viewStats = document.getElementById('viewStatsBtn');
        if (viewStats && window.WQProfile) {
          viewStats.onclick = (e) => {
            e.preventDefault();
            window.WQProfile.openStatsModal();
          };
        }

        // Event logout
        const logout = document.getElementById('logoutBtn');
        if (logout) {
          logout.onclick = (e) => {
            e.preventDefault();
            this.logout();
          };
        }
      } else {
        userMenuContainer.innerHTML = `
          <button class="btn" id="openAuthBtn" style="padding: 10px 18px;">
            Đăng nhập
          </button>
        `;

        const openAuth = document.getElementById('openAuthBtn');
        if (openAuth) {
          openAuth.onclick = () => {
            const authModal = document.getElementById('authModal');
            if (authModal) authModal.classList.add('active');
          };
        }
      }
    }
  };

  // Các sự kiện UI của Auth Modal
  function initAuthEvents() {
    const authModal = document.getElementById('authModal');
    const closeAuthBtn = document.getElementById('closeAuthModalBtn');
    
    const tabLogin = document.getElementById('tabLoginBtn');
    const tabRegister = document.getElementById('tabRegisterBtn');
    const formLogin = document.getElementById('formLogin');
    const formRegister = document.getElementById('formRegister');

    if (tabLogin && tabRegister && formLogin && formRegister) {
      tabLogin.onclick = () => {
        tabLogin.classList.add('active');
        tabLogin.style.color = 'var(--text-primary)';
        tabLogin.style.borderBottom = '2px solid var(--accent-purple)';
        
        tabRegister.classList.remove('active');
        tabRegister.style.color = 'var(--text-secondary)';
        tabRegister.style.borderBottom = 'none';
        
        formLogin.style.display = 'flex';
        formRegister.style.display = 'none';
      };

      tabRegister.onclick = () => {
        tabRegister.classList.add('active');
        tabRegister.style.color = 'var(--text-primary)';
        tabRegister.style.borderBottom = '2px solid var(--accent-purple)';
        
        tabLogin.classList.remove('active');
        tabLogin.style.color = 'var(--text-secondary)';
        tabLogin.style.borderBottom = 'none';
        
        formRegister.style.display = 'flex';
        formLogin.style.display = 'none';
      };
    }

    if (closeAuthBtn && authModal) {
      closeAuthBtn.onclick = () => {
        if (WQAuth.getCurrentUser()) {
          authModal.classList.remove('active');
        }
      };
    }

    window.addEventListener('click', (e) => {
      if (authModal && e.target === authModal) {
        if (WQAuth.getCurrentUser()) {
          authModal.classList.remove('active');
        }
      }
    });

    const submitLogin = document.getElementById('submitLoginBtn');
    if (submitLogin) {
      submitLogin.onclick = async () => {
        const u = document.getElementById('loginUsername').value.trim();
        const p = document.getElementById('loginPassword').value;
        const remember = document.getElementById('loginRemember').checked;

        const success = await WQAuth.login(u, p, remember);
        if (success) {
          authModal.classList.remove('active');
          document.getElementById('loginUsername').value = '';
          document.getElementById('loginPassword').value = '';
        }
      };
    }

    const submitRegister = document.getElementById('submitRegisterBtn');
    if (submitRegister) {
      submitRegister.onclick = async () => {
        const u = document.getElementById('registerUsername').value.trim();
        const p = document.getElementById('registerPassword').value;
        const cp = document.getElementById('registerConfirmPassword').value;

        const success = await WQAuth.register(u, p, cp);
        if (success) {
          authModal.classList.remove('active');
          document.getElementById('registerUsername').value = '';
          document.getElementById('registerPassword').value = '';
          document.getElementById('registerConfirmPassword').value = '';
        }
      };
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAuthEvents();
  });

  window.WQAuth = WQAuth;
  window.showToast = showToast;
})();
