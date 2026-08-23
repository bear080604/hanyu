// ---------- WQStorage module ----------
(function() {
  const STORAGE_KEYS = {
    USERS: 'wq_users',
    SESSION_USER: 'wq_current_user',
    LOCAL_FAVORITES: 'wq_favorites',
    LOCAL_PROGRESS: 'wq_progress'
  };

  const WQStorage = {
    getUsers() {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || [];
    },

    saveUsers(users) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    },

    getCurrentUser() {
      const local = localStorage.getItem(STORAGE_KEYS.SESSION_USER);
      if (local) return JSON.parse(local);
      const session = sessionStorage.getItem(STORAGE_KEYS.SESSION_USER);
      if (session) return JSON.parse(session);
      return null;
    },

    setCurrentUser(user, remember = false) {
      if (!user) {
        localStorage.removeItem(STORAGE_KEYS.SESSION_USER);
        sessionStorage.removeItem(STORAGE_KEYS.SESSION_USER);
        return;
      }
      const userStr = JSON.stringify(user);
      if (remember) {
        localStorage.setItem(STORAGE_KEYS.SESSION_USER, userStr);
      } else {
        sessionStorage.setItem(STORAGE_KEYS.SESSION_USER, userStr);
      }
    },

    updateUserData(username, field, data) {
      const users = this.getUsers();
      const idx = users.findIndex(u => u.username === username);
      if (idx !== -1) {
        if (!users[idx].progress) users[idx].progress = {};
        if (!users[idx].favorites) users[idx].favorites = [];
        if (!users[idx].srs) users[idx].srs = {};
        
        users[idx][field] = data;
        this.saveUsers(users);
      }
    },

    getUserDataField(username, field, fallbackLocalKey) {
      if (username) {
        const users = this.getUsers();
        const user = users.find(u => u.username === username);
        if (user) {
          if (user[field] === undefined) {
            if (field === 'favorites') user[field] = [];
            else if (field === 'srs') user[field] = {};
            else if (field === 'progress') user[field] = {};
          }
          return user[field];
        }
      }
      // Chế độ Guest (Khách)
      if (fallbackLocalKey === 'wq_favorites') {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_FAVORITES)) || [];
      } else if (fallbackLocalKey === 'wq_progress') {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_PROGRESS)) || null;
      }
      return field === 'favorites' ? [] : (field === 'srs' ? {} : {});
    }
  };

  window.WQStorage = WQStorage;
})();
