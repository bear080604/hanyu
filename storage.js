// ---------- WQStorage module - Single User ----------
(function() {
  const STORAGE_KEYS = {
    FAVORITES: 'wq_favorites',
    PROGRESS: 'wq_progress',
    SRS: 'wq_srs',
    CUSTOM_DECKS: 'wq_custom_decks',
    QUIZ_MODE: 'wq_quiz_mode',
    THEME: 'wq_theme'
  };

  const WQStorage = {
    // Favorites
    getFavorites() {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITES)) || [];
    },
    saveFavorites(data) {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(data || []));
    },

    // Progress
    getProgress() {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.PROGRESS)) || null;
    },
    saveProgress(data) {
      localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(data || {}));
    },

    // SRS Spaced Repetition
    getSRS() {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.SRS)) || {};
    },
    saveSRS(data) {
      localStorage.setItem(STORAGE_KEYS.SRS, JSON.stringify(data || {}));
    },

    // Custom Decks
    getCustomDecks() {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_DECKS)) || [];
    },
    saveCustomDecks(data) {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_DECKS, JSON.stringify(data || []));
    },

    // Reset everything
    resetAll() {
      localStorage.removeItem(STORAGE_KEYS.FAVORITES);
      localStorage.removeItem(STORAGE_KEYS.PROGRESS);
      localStorage.removeItem(STORAGE_KEYS.SRS);
      localStorage.removeItem(STORAGE_KEYS.CUSTOM_DECKS);
    },

    // Compatibility shims so older helper calls don't crash
    getUsers() { return []; },
    saveUsers() {},
    getCurrentUser() { return null; },
    setCurrentUser() {},
    updateUserData(username, field, data) {
      if (field === 'favorites') this.saveFavorites(data);
      else if (field === 'progress') this.saveProgress(data);
      else if (field === 'srs') this.saveSRS(data);
      else if (field === 'customDecks') this.saveCustomDecks(data);
    },
    getUserDataField(username, field, fallbackLocalKey) {
      if (field === 'favorites' || fallbackLocalKey === 'wq_favorites') return this.getFavorites();
      if (field === 'progress' || fallbackLocalKey === 'wq_progress') return this.getProgress();
      if (field === 'srs') return this.getSRS();
      if (field === 'customDecks') return this.getCustomDecks();
      return null;
    }
  };

  window.WQStorage = WQStorage;
})();
