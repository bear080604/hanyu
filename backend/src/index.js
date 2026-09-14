/**
 * WeiQuan Chinese HSK API
 * Cloudflare Workers + D1 Database
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // ==================== VOCABULARY ENDPOINTS ====================
      
      // GET /api/vocabulary - Lấy tất cả từ vựng hoặc theo level
      if (path === '/api/vocabulary' && method === 'GET') {
        const level = url.searchParams.get('level'); // HSK1, HSK2, etc.
        const search = url.searchParams.get('search'); // Tìm kiếm
        const limit = parseInt(url.searchParams.get('limit')) || 100;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        let query = 'SELECT * FROM vocabulary WHERE 1=1';
        const params = [];

        if (level) {
          query += ' AND level = ?';
          params.push(level.toUpperCase());
        }

        if (search) {
          query += ' AND (hanzi LIKE ? OR pinyin LIKE ? OR meaning LIKE ?)';
          const searchPattern = `%${search}%`;
          params.push(searchPattern, searchPattern, searchPattern);
        }

        query += ' ORDER BY id LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const { results } = await env.DB.prepare(query).bind(...params).all();
        
        return jsonResponse({
          success: true,
          count: results.length,
          data: results,
        });
      }

      // GET /api/vocabulary/:id - Lấy 1 từ vựng
      if (path.match(/^\/api\/vocabulary\/\d+$/) && method === 'GET') {
        const id = path.split('/').pop();
        const { results } = await env.DB.prepare(
          'SELECT * FROM vocabulary WHERE id = ?'
        ).bind(id).all();

        if (results.length === 0) {
          return errorResponse('Vocabulary not found', 404);
        }

        return jsonResponse({ success: true, data: results[0] });
      }

      // POST /api/vocabulary - Thêm từ vựng mới (admin)
      if (path === '/api/vocabulary' && method === 'POST') {
        const body = await request.json();
        const { hanzi, pinyin, meaning, example, level } = body;

        if (!hanzi || !pinyin || !meaning || !level) {
          return errorResponse('Missing required fields');
        }

        const result = await env.DB.prepare(
          'INSERT INTO vocabulary (hanzi, pinyin, meaning, example, level) VALUES (?, ?, ?, ?, ?)'
        ).bind(hanzi, pinyin, meaning, example || null, level.toUpperCase()).run();

        return jsonResponse({
          success: true,
          message: 'Vocabulary added',
          id: result.meta.last_row_id,
        }, 201);
      }

      // GET /api/levels - Lấy danh sách levels với số lượng từ
      if (path === '/api/levels' && method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT level, COUNT(*) as count 
          FROM vocabulary 
          GROUP BY level 
          ORDER BY level
        `).all();

        return jsonResponse({ success: true, data: results });
      }

      // ==================== SEARCH ENDPOINT ====================
      
      // GET /api/search?q=... - Tìm kiếm nhanh
      if (path === '/api/search' && method === 'GET') {
        const query = url.searchParams.get('q');
        if (!query) {
          return errorResponse('Missing search query');
        }

        const searchPattern = `%${query}%`;
        const { results } = await env.DB.prepare(`
          SELECT * FROM vocabulary 
          WHERE hanzi LIKE ? OR pinyin LIKE ? OR meaning LIKE ?
          LIMIT 50
        `).bind(searchPattern, searchPattern, searchPattern).all();

        return jsonResponse({
          success: true,
          count: results.length,
          data: results,
        });
      }

      // ==================== CUSTOM DECK ENDPOINTS ====================

      // GET /api/decks?user_id=... - Lấy danh sách bộ từ tự tạo
      if (path === '/api/decks' && method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return errorResponse('Missing user_id');
        }

        // Get numeric user ID from username
        const { results: userRecord } = await env.DB.prepare(
          'SELECT id FROM users WHERE username = ?'
        ).bind(userId).all();

        if (userRecord.length === 0) {
          // User doesn't exist yet, return empty array
          return jsonResponse({ success: true, data: [] });
        }

        const numericUserId = userRecord[0].id;

        const { results } = await env.DB.prepare(`
          SELECT d.*, COUNT(w.id) as word_count
          FROM custom_decks d
          LEFT JOIN custom_deck_words w ON d.id = w.deck_id
          WHERE d.user_id = ?
          GROUP BY d.id
          ORDER BY d.updated_at DESC
        `).bind(numericUserId).all();

        return jsonResponse({ success: true, data: results });
      }

      // POST /api/decks - Tạo bộ từ mới
      if (path === '/api/decks' && method === 'POST') {
        const body = await request.json();
        const { user_id, name, words } = body;

        if (!user_id || !name || !Array.isArray(words)) {
          return errorResponse('Missing required fields');
        }

        // Ensure user exists (auto-create if not)
        const { results: existingUser } = await env.DB.prepare(
          'SELECT id FROM users WHERE username = ?'
        ).bind(user_id).all();

        if (existingUser.length === 0) {
          // Create user
          await env.DB.prepare(
            'INSERT INTO users (username) VALUES (?)'
          ).bind(user_id).run();
        }

        // Get user's numeric ID
        const { results: userRecord } = await env.DB.prepare(
          'SELECT id FROM users WHERE username = ?'
        ).bind(user_id).all();
        
        const numericUserId = userRecord[0].id;

        // Tạo deck
        const deckResult = await env.DB.prepare(
          'INSERT INTO custom_decks (user_id, name) VALUES (?, ?)'
        ).bind(numericUserId, name).run();

        const deckId = deckResult.meta.last_row_id;
        
        console.log('✅ Created deck:', deckId, 'for user:', numericUserId);
        console.log('📝 Inserting', words.length, 'words...');

        // Thêm từ vào deck
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          console.log(`  Word ${i+1}:`, word);
          await env.DB.prepare(
            'INSERT INTO custom_deck_words (deck_id, hanzi, pinyin, meaning, sort_order) VALUES (?, ?, ?, ?, ?)'
          ).bind(deckId, word.h || word.hanzi, word.p || word.pinyin, word.m || word.meaning, i).run();
        }
        
        console.log('✅ Inserted', words.length, 'words into deck', deckId);

        return jsonResponse({
          success: true,
          message: 'Deck created',
          deck_id: deckId,
        }, 201);
      }

      // GET /api/decks/:id - Lấy chi tiết 1 bộ từ
      if (path.match(/^\/api\/decks\/\d+$/) && method === 'GET') {
        const deckId = path.split('/').pop();

        const { results: deck } = await env.DB.prepare(
          'SELECT * FROM custom_decks WHERE id = ?'
        ).bind(deckId).all();

        if (deck.length === 0) {
          return errorResponse('Deck not found', 404);
        }

        const { results: words } = await env.DB.prepare(
          'SELECT * FROM custom_deck_words WHERE deck_id = ? ORDER BY sort_order'
        ).bind(deckId).all();

        return jsonResponse({
          success: true,
          data: {
            ...deck[0],
            words: words.map(w => ({
              h: w.hanzi,
              p: w.pinyin,
              m: w.meaning,
            })),
          },
        });
      }

      // DELETE /api/decks/:id - Xóa bộ từ
      if (path.match(/^\/api\/decks\/\d+$/) && method === 'DELETE') {
        const deckId = path.split('/').pop();
        
        await env.DB.prepare('DELETE FROM custom_decks WHERE id = ?').bind(deckId).run();
        
        return jsonResponse({ success: true, message: 'Deck deleted' });
      }

      // ==================== HEALTH CHECK ====================
      
      if (path === '/api/health' || path === '/') {
        return jsonResponse({
          success: true,
          message: '🇨🇳 WeiQuan Chinese API',
          version: '1.0.0',
          endpoints: {
            vocabulary: '/api/vocabulary',
            search: '/api/search?q=...',
            levels: '/api/levels',
            decks: '/api/decks',
          },
        });
      }

      // 404 Not Found
      return errorResponse('Endpoint not found', 404);

    } catch (error) {
      console.error('API Error:', error);
      return errorResponse(error.message || 'Internal server error', 500);
    }
  },
};
