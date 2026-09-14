/**
 * WeiQuan Chinese API Client
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
    return this.request(`/api/decks/${deckId}`);
  }

  async createDeck(userId, name, words) {
    return this.request('/api/decks', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, name, words }),
    });
  }

  async getDecks(userId) {
    return this.request(`/api/decks?user_id=${userId}`);
  }

  async getDeck(deckId) {
    return this.request(`/api/decks/${deckId}`);
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
const API_BASE_URL = 'https://apihanyu.phuonganhkhanh683.workers.dev'; // Production API
const api = new WeiQuanAPI(API_BASE_URL);

window.WeiQuanAPI = api;
console.log('✅ WeiQuan API Client loaded');
