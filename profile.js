// ---------- WQProfile module (Single User) ----------
(function() {
  let profileModal = null;
  let statsModal = null;

  const WQProfile = {

    openProfileModal() {
      // Lấy data trực tiếp từ WQStorage (single-user, không cần auth)
      const favorites   = WQStorage.getFavorites() || [];
      const progress    = WQStorage.getProgress()  || {};
      const srsData     = WQStorage.getSRS()        || {};

      const learnedList = progress.learned || [];
      const learnedCount = learnedList.length;
      const favoritesCount = favorites.length;

      // SRS stats
      let rememberedCount = 0;
      let reviewTodayCount = 0;
      const todayStr = new Date().toISOString().split('T')[0];
      Object.values(srsData).forEach(item => {
        if (item.interval >= 4) rememberedCount++;
        if (item.nextReview && item.nextReview <= todayStr) reviewTodayCount++;
      });

      const modalBody = document.getElementById('profileModalBody');
      if (!modalBody) return;

      modalBody.innerHTML = `
        <div class="profile-summary" style="display:flex; flex-direction:column; gap:20px;">
          <div style="text-align:center; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:3.5rem; margin-bottom:8px;">🧑‍🎓</div>
            <h3 style="font-size:1.6rem; color:#fff; font-family:'Plus Jakarta Sans', sans-serif;">Học viên</h3>
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
            <div class="stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); padding:14px; border-radius:16px; text-align:center;">
              <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Đã nhớ</div>
              <div style="font-size:1.8rem; font-weight:800; color:var(--neon-green, #4ade80); margin-top:4px;">${rememberedCount} <span style="font-size:0.9rem; font-weight:500; color:var(--text-muted);">từ</span></div>
            </div>
            <div class="stat-card" style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); padding:14px; border-radius:16px; text-align:center;">
              <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Ôn hôm nay</div>
              <div style="font-size:1.8rem; font-weight:800; color:var(--neon-red, #f87171); margin-top:4px;">${reviewTodayCount} <span style="font-size:0.9rem; font-weight:500; color:var(--text-muted);">từ</span></div>
            </div>
          </div>
        </div>
      `;

      if (profileModal) profileModal.classList.add('active');
    },

    openStatsModal() {
      const progress   = WQStorage.getProgress() || {};
      const learnedList = progress.learned || [];

      const statsModalBody = document.getElementById('statsModalBody');
      if (!statsModalBody || typeof DATA === 'undefined') return;

      statsModalBody.innerHTML = '';

      const container = document.createElement('div');
      container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

      const title = document.createElement('h3');
      title.textContent = 'Tiến trình hoàn thành HSK';
      title.style.cssText = "font-family:'Plus Jakarta Sans', sans-serif; font-size:1.25rem; font-weight:700; color:#fff; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:10px;";
      container.appendChild(title);

      Object.keys(DATA).forEach(lvl => {
        const words = DATA[lvl];
        const totalWords = words.length;
        const learnedInLevel = words.filter(w => learnedList.includes(w.h)).length;
        const percent = totalWords > 0 ? Math.round((learnedInLevel / totalWords) * 100) : 0;

        const levelRow = document.createElement('div');
        levelRow.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
        // Escape để an toàn — lvl là key từ DATA nội bộ nên không có XSS risk,
        // nhưng giữ thói quen dùng textContent cho dynamic values
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex; justify-content:space-between; font-size:0.9rem; font-weight:600;';
        const spanLvl = document.createElement('span');
        spanLvl.style.color = '#fff';
        spanLvl.textContent = lvl;
        const spanCount = document.createElement('span');
        spanCount.style.color = 'var(--text-secondary)';
        spanCount.textContent = `${learnedInLevel} / ${totalWords} từ (${percent}%)`;
        labelRow.appendChild(spanLvl);
        labelRow.appendChild(spanCount);

        const barBg = document.createElement('div');
        barBg.style.cssText = 'width:100%; height:10px; background:rgba(255,255,255,0.04); border-radius:5px; border:1px solid rgba(255,255,255,0.05); overflow:hidden;';
        const barFill = document.createElement('div');
        barFill.style.cssText = `width:${percent}%; height:100%; background:var(--accent-gradient); border-radius:5px; transition:width 0.5s ease;`;

        barBg.appendChild(barFill);
        levelRow.appendChild(labelRow);
        levelRow.appendChild(barBg);
        container.appendChild(levelRow);
      });

      statsModalBody.appendChild(container);
      if (statsModal) statsModal.classList.add('active');
    }
  };

  // Close modals events
  document.addEventListener('DOMContentLoaded', () => {
    profileModal = document.getElementById('profileModal');
    statsModal   = document.getElementById('statsModal');

    const closeProfile = document.getElementById('closeProfileModalBtn');
    if (closeProfile && profileModal) {
      closeProfile.onclick = () => profileModal.classList.remove('active');
    }

    const closeStats = document.getElementById('closeStatsModalBtn');
    if (closeStats && statsModal) {
      closeStats.onclick = () => statsModal.classList.remove('active');
    }

    window.addEventListener('click', (e) => {
      if (profileModal && e.target === profileModal) profileModal.classList.remove('active');
      if (statsModal   && e.target === statsModal)   statsModal.classList.remove('active');
    });
  });

  window.WQProfile = WQProfile;
})();
