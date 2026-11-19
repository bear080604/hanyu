/**
 * WenQing Chinese API Client
 * Connect frontend với Cloudflare Workers backend
 */

class WeiQuanAPI {
  constructor(baseURL) {
    this.baseURL = baseURL || 'http://localhost:8787'; // Default: local dev
    // Sau khi deploy, thay bằng: 'https://weiquan-api.YOUR-SUBDOMAIN.workers.dev'
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // ==================== VOCABULARY ====================

  async getVocabulary(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/vocabulary?${query}`);
  }

  async getVocabularyById(id) {
    return this.request(`/api/vocabulary/${id}`);
  }

  async addVocabulary(data) {
    return this.request('/api/vocabulary', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getLevels() {
    return this.request('/api/levels');
  }

  // ==================== SEARCH ====================

  async search(query) {
    return this.request(`/api/search?q=${encodeURIComponent(query)}`);
  }

  // ==================== CUSTOM DECKS ====================

  async getDecks(userId) {
    return this.request(`/api/decks?user_id=${userId}`);
  }

  async getDeckById(deckId) {
    const res = await this.request(`/api/decks/${deckId}`);
    if (res && res.data && Array.isArray(res.data.words)) {
      res.data.words = res.data.words.map(w => this._normalizeDeckWord(w));
    }
    return res;
  }

  _serializeWordForCloud(w) {
    if (!w) return w;
    if (Array.isArray(w.examples) && w.examples.length > 1) {
      return {
        ...w,
        ex: w.examples.map(x => x.ex || '').join(' || '),
        exp: w.examples.map(x => x.exp || '').join(' || '),
        exm: w.examples.map(x => x.exm || '').join(' || '),
      };
    }
    return w;
  }

  async createDeck(userId, name, words) {
    // Save any custom sentences (including examples, tokens, blank, options) to localStorage as well
    try {
      const savedSentences = JSON.parse(localStorage.getItem('wq_custom_sentences') || '{}');
      (words || []).forEach(w => {
        if (w && w.h && (w.ex || w.e || w.exm || w.exp || (Array.isArray(w.examples) && w.examples.length))) {
          const entry = {
            ex: w.ex || w.e || '',
            exp: w.exp || '',
            exm: w.exm || ''
          };
          if (Array.isArray(w.tokens) && w.tokens.length) entry.tokens = w.tokens;
          if (w.blank) entry.blank = w.blank;
          if (Array.isArray(w.options) && w.options.length) entry.options = w.options;
          if (Array.isArray(w.examples) && w.examples.length) entry.examples = w.examples;
          savedSentences[w.h.trim()] = entry;
        }
      });
      localStorage.setItem('wq_custom_sentences', JSON.stringify(savedSentences));
    } catch (e) { }

    const cloudWords = (words || []).map(w => this._serializeWordForCloud(w));
    return this.request('/api/decks', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, name, words: cloudWords }),
    });
  }

  async getDeck(deckId) {
    return this.getDeckById(deckId);
  }

  _normalizeDeckWord(w) {
    if (!w) return w;
    let m = w.m || w.meaning || '';
    let ex = w.ex || w.e || w.example || '';
    let exp = w.exp || w.example_pinyin || '';
    let exm = w.exm || w.example_meaning || '';

    const enriched = { ...w, h: w.h || w.hanzi, p: w.p || w.pinyin, m, ex, exp, exm };
    if (typeof window.enrichWordWithSentence === 'function') {
      return window.enrichWordWithSentence(enriched);
    }
    return enriched;
  }

  async updateDeck(deckId, data) {
    const payload = { ...data };
    if (Array.isArray(payload.words)) {
      payload.words = payload.words.map(w => this._serializeWordForCloud(w));
    }
    return this.request(`/api/decks/${deckId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteDeck(deckId) {
    return this.request(`/api/decks/${deckId}`, {
      method: 'DELETE',
    });
  }

  // ==================== HEALTH ====================

  async health() {
    return this.request('/api/health');
  }
}

// Export API client
const API_BASE_URL = 'https://hanyu.phuonganhkhanh683.workers.dev'; // Production API
const api = new WeiQuanAPI(API_BASE_URL);

window.WeiQuanAPI = api;
console.log('✅ WenQing API Client loaded');
