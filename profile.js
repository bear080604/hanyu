// ---------- WQProfile module ----------
(function() {
  let profileModal = null;
  let statsModal = null; // Ta có thể dùng chung hoặc tách riêng modal stats

  const WQProfile = {
    // Hàm mở modal Hồ sơ cá nhân
    openProfileModal() {
      const currentUser = WQAuth.getCurrentUser();
      if (!currentUser) return;

      const users = WQStorage.getUsers();
      const user = users.find(u => u.username === currentUser.username);
      if (!user) return;

      // Tính toán các thông số thống kê
      const favoritesCount = user.favorites ? user.favorites.length : 0;
      
      // Số từ đã học (tính từ mảng learned trong progress)
      const learnedList = user.progress && user.progress.learned ? user.progress.learned : [];
      const learnedCount = learnedList.length;

      // Số từ đã nhớ (các từ có srs interval >= 4 ngày)
      const srsData = user.srs || {};
      let rememberedCount = 0;
      let reviewTodayCount = 0;
      const todayStr = new Date().toISOString().split('T')[0];

      Object.keys(srsData).forEach(key => {
        const item = srsData[key];
        if (item.interval && item.interval >= 4) {
          rememberedCount++;
        }
        if (item.nextReview && item.nextReview <= todayStr) {
          reviewTodayCount++;
        }
      });

      // Tạo cấu trúc HTML cho nội dung hồ sơ
      const modalBody = document.getElementById('profileModalBody');
      if (modalBody) {
        modalBody.innerHTML = `
          <div class="profile-summary" style="display:flex; flex-direction:column; gap:20px;">
            <div style="text-align:center; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:3.5rem; margin-bottom:8px;">👤</div>
              <h3 style="font-size:1.6rem; color:#fff; font-family:'Plus Jakarta Sans', sans-serif;">${user.username}</h3>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Ngày tham gia: ${user.createdAt || 'N/A'}</p>
            </div>
            
            <div class="stats-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:14px;">
              <div class="stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); padding:14px; border-radius:16px; text-align:center;">
                <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Đã học</div>
                <div style="font-size:1.8rem; font-weight:800; color:var(--neon-cyan); margin-top:4px;">${learnedCount} <span style="font-size:0.9rem; font-weight:500; color:var(--text-muted);">từ</span></div>
              </div>
              <div class="stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); padding:14px; border-radius:16px; text-align:center;">
                <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Yêu thích</div>
                <div style="font-size:1.8rem; font-weight:800; color:#FBBF24; margin-top:4px;">${favoritesCount} <span style="font-size:0.9rem; font-weight:500; color:var(--text-muted);">từ</span></div>
              </div>
            </div>
            
            <div style="margin-top:10px; display:flex; flex-direction:column; gap:12px;">
              <button class="btn" id="showChangePwBtn" style="justify-content:center; padding:12px; border-radius:16px; border-color:var(--glass-border-hover);">
                🔑 Đổi mật khẩu
              </button>
              
              <!-- Form đổi mật khẩu ẩn -->
              <div id="changePwForm" style="display:none; flex-direction:column; gap:12px; padding:16px; background:rgba(255,255,255,0.01); border:1px solid var(--glass-border); border-radius:16px; margin-top:8px;">
                <h4 style="font-size:1rem; font-weight:700; color:#fff;">Thay đổi mật khẩu</h4>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  <input type="password" id="oldPwInput" placeholder="Mật khẩu hiện tại" class="auth-input" style="width:100%; padding:10px 14px; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:12px; color:#fff; outline:none;">
                  <input type="password" id="newPwInput" placeholder="Mật khẩu mới (≥6 ký tự)" class="auth-input" style="width:100%; padding:10px 14px; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:12px; color:#fff; outline:none;">
                  <input type="password" id="confirmNewPwInput" placeholder="Xác nhận mật khẩu mới" class="auth-input" style="width:100%; padding:10px 14px; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:12px; color:#fff; outline:none;">
                </div>
                <div style="display:flex; gap:10px; margin-top:4px;">
                  <button class="btn" id="submitChangePwBtn" style="flex:1; justify-content:center; background:var(--accent-gradient); color:#fff; border:none; padding:10px; border-radius:12px;">Cập nhật</button>
                  <button class="btn" id="cancelChangePwBtn" style="flex:1; justify-content:center; padding:10px; border-radius:12px;">Hủy</button>
                </div>
              </div>
            </div>
          </div>
        `;

        // Event toggle form đổi mật khẩu
        const showChangePwBtn = document.getElementById('showChangePwBtn');
        const changePwForm = document.getElementById('changePwForm');
        const cancelChangePwBtn = document.getElementById('cancelChangePwBtn');
        const submitChangePwBtn = document.getElementById('submitChangePwBtn');

        if (showChangePwBtn && changePwForm) {
          showChangePwBtn.onclick = () => {
            changePwForm.style.display = 'flex';
            showChangePwBtn.style.display = 'none';
          };
        }

        if (cancelChangePwBtn && showChangePwBtn && changePwForm) {
          cancelChangePwBtn.onclick = () => {
            changePwForm.style.display = 'none';
            showChangePwBtn.style.display = 'flex';
            // Reset input fields
            document.getElementById('oldPwInput').value = '';
            document.getElementById('newPwInput').value = '';
            document.getElementById('confirmNewPwInput').value = '';
          };
        }

        if (submitChangePwBtn) {
          submitChangePwBtn.onclick = async () => {
            const oldPw = document.getElementById('oldPwInput').value;
            const newPw = document.getElementById('newPwInput').value;
            const confirmNewPw = document.getElementById('confirmNewPwInput').value;

            const success = await WQAuth.changePassword(oldPw, newPw, confirmNewPw);
            if (success) {
              // Đóng form
              cancelChangePwBtn.click();
            }
          };
        }
      }

      if (profileModal) profileModal.classList.add('active');
    },

    // Hàm mở modal Tiến độ học
    openStatsModal() {
      const currentUser = WQAuth.getCurrentUser();
      if (!currentUser) return;

      const users = WQStorage.getUsers();
      const user = users.find(u => u.username === currentUser.username);
      if (!user) return;

      const learnedList = user.progress && user.progress.learned ? user.progress.learned : [];
      const statsModalBody = document.getElementById('statsModalBody');
      if (statsModalBody && typeof DATA !== 'undefined') {
        statsModalBody.innerHTML = '';
        
        const container = document.createElement('div');
        container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

        const title = document.createElement('h3');
        title.textContent = 'Tiến trình hoàn thành HSK';
        title.style.cssText = "font-family:'Plus Jakarta Sans', sans-serif; font-size:1.25rem; font-weight:700; color:#fff; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom:10px;";
        container.appendChild(title);

        // Duyệt qua từng level để tính tiến độ
        Object.keys(DATA).forEach(lvl => {
          const words = DATA[lvl];
          const totalWords = words.length;
          
          // Đếm xem có bao nhiêu từ của level này đã được học
          let learnedInLevel = 0;
          words.forEach(w => {
            if (learnedList.includes(w.h)) {
              learnedInLevel++;
            }
          });

          const percent = totalWords > 0 ? Math.round((learnedInLevel / totalWords) * 100) : 0;

          const levelRow = document.createElement('div');
          levelRow.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
          levelRow.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.9rem; font-weight:600;">
              <span style="color:#fff;">${lvl}</span>
              <span style="color:var(--text-secondary);">${learnedInLevel} / ${totalWords} từ (${percent}%)</span>
            </div>
            <div style="width:100%; height:10px; background:rgba(255,255,255,0.04); border-radius:5px; border:1px solid rgba(255,255,255,0.05); overflow:hidden;">
              <div style="width:${percent}%; height:100%; background:var(--accent-gradient); border-radius:5px; box-shadow:var(--shadow-neon-pink); transition: width 0.5s ease;"></div>
            </div>
          `;
          container.appendChild(levelRow);
        });

        statsModalBody.appendChild(container);
      }

      if (statsModal) statsModal.classList.add('active');
    }
  };

  // Close modals events
  document.addEventListener('DOMContentLoaded', () => {
    profileModal = document.getElementById('profileModal');
    statsModal = document.getElementById('statsModal');

    const closeProfile = document.getElementById('closeProfileModalBtn');
    if (closeProfile && profileModal) {
      closeProfile.onclick = () => profileModal.classList.remove('active');
    }
    const closeStats = document.getElementById('closeStatsModalBtn');
    if (closeStats && statsModal) {
      closeStats.onclick = () => statsModal.classList.remove('active');
    }

    // Đóng khi click ngoài vùng modal content
    window.addEventListener('click', (e) => {
      if (profileModal && e.target === profileModal) profileModal.classList.remove('active');
      if (statsModal && e.target === statsModal) statsModal.classList.remove('active');
    });
  });

  window.WQProfile = WQProfile;
})();
