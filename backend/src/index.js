/**
 * WeiQuan Chinese HSK API
 * Cloudflare Workers + D1 Database
 */

import { VOCAB_DATA } from './vocabData.js';

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

      // GET /api/vocabulary/all - Lấy toàn bộ từ vựng theo từng level (cho frontend DATA object)
      // Optimized: returns in-memory VOCAB_DATA directly (0 D1 row reads, immune to daily read quotas)
      if (path === '/api/vocabulary/all' && method === 'GET') {
        let data = VOCAB_DATA;
        if (env && env.DB) {
          try {
            const { results } = await env.DB.prepare(`
              SELECT hanzi, pinyin, meaning, example, example_pinyin, example_meaning, pos, level
              FROM vocabulary
              ORDER BY level, id
            `).all();

            if (results && results.length > 0) {
              const dbData = {};
              for (const row of results) {
                const lvl = (row.level || '').replace('HSK', 'HSK '); // HSK1 -> HSK 1
                if (!dbData[lvl]) dbData[lvl] = [];
                dbData[lvl].push({
                  h: row.hanzi,
                  p: row.pinyin,
                  m: row.meaning,
                  ex: row.example || '',
                  exp: row.example_pinyin || '',
                  exm: row.example_meaning || '',
                  pos: row.pos || '',
                });
              }
              data = { ...VOCAB_DATA, ...dbData };
            }
          } catch (dbErr) {
            console.warn('DB read failed, served from static VOCAB_DATA:', dbErr.message);
          }
        }

        return jsonResponse({ success: true, data });
      }

      // GET /api/vocabulary - Lấy tất cả từ vựng hoặc theo level
      if (path === '/api/vocabulary' && method === 'GET') {
        const level = url.searchParams.get('level'); // HSK1, HSK2, etc.
        const search = url.searchParams.get('search'); // Tìm kiếm
        const limit = parseInt(url.searchParams.get('limit')) || 100;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        if (env && env.DB) {
          try {
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
          } catch (dbErr) {
            console.warn('DB query failed, falling back to static vocabulary:', dbErr.message);
          }
        }

        // Fallback from VOCAB_DATA
        let list = [];
        const targetLevels = level ? [level.replace('HSK', 'HSK ')] : Object.keys(VOCAB_DATA);
        targetLevels.forEach(lvl => {
          if (VOCAB_DATA[lvl]) {
            VOCAB_DATA[lvl].forEach(w => {
              list.push({
                hanzi: w.h,
                pinyin: w.p,
                meaning: w.m,
                example: w.ex || '',
                example_pinyin: w.exp || '',
                example_meaning: w.exm || '',
                pos: w.pos || '',
                level: lvl.replace(' ', ''),
              });
            });
          }
        });

        if (search) {
          const sLower = search.toLowerCase();
          list = list.filter(w =>
            (w.hanzi && w.hanzi.includes(search)) ||
            (w.pinyin && w.pinyin.toLowerCase().includes(sLower)) ||
            (w.meaning && w.meaning.toLowerCase().includes(sLower))
          );
        }

        const paged = list.slice(offset, offset + limit);
        return jsonResponse({
          success: true,
          count: paged.length,
          total: list.length,
          data: paged,
        });
      }

      // GET /api/vocabulary/:id - Lấy 1 từ vựng
      if (path.match(/^\/api\/vocabulary\/\d+$/) && method === 'GET') {
        const id = path.split('/').pop();
        if (env && env.DB) {
          try {
            const { results } = await env.DB.prepare(
              'SELECT * FROM vocabulary WHERE id = ?'
            ).bind(id).all();

            if (results.length > 0) {
              return jsonResponse({ success: true, data: results[0] });
            }
          } catch (e) {}
        }
        return errorResponse('Vocabulary not found', 404);
      }

      // POST /api/vocabulary - Thêm từ vựng mới (admin)
      if (path === '/api/vocabulary' && method === 'POST') {
        if (!env || !env.DB) {
          return errorResponse('D1 Database not configured for write operations', 503);
        }
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
        if (env && env.DB) {
          try {
            const { results } = await env.DB.prepare(`
              SELECT level, COUNT(*) as count 
              FROM vocabulary 
              GROUP BY level 
              ORDER BY level
            `).all();

            if (results && results.length > 0) {
              return jsonResponse({ success: true, data: results });
            }
          } catch (e) {}
        }

        const fallbackLevels = Object.keys(VOCAB_DATA).map(lvl => ({
          level: lvl.replace(' ', ''),
          count: (VOCAB_DATA[lvl] || []).length,
        }));
        return jsonResponse({ success: true, data: fallbackLevels });
      }

      // ==================== SEARCH ENDPOINT ====================

      // GET /api/search?q=... - Tìm kiếm nhanh
      if (path === '/api/search' && method === 'GET') {
        const query = url.searchParams.get('q');
        if (!query) {
          return errorResponse('Missing search query');
        }

        if (env && env.DB) {
          try {
            const searchPattern = `%${query}%`;
            const { results } = await env.DB.prepare(`
              SELECT * FROM vocabulary 
              WHERE hanzi LIKE ? OR pinyin LIKE ? OR meaning LIKE ?
              LIMIT 50
            `).bind(searchPattern, searchPattern, searchPattern).all();

            if (results && results.length > 0) {
              return jsonResponse({
                success: true,
                count: results.length,
                data: results,
              });
            }
          } catch (e) {}
        }

        const qLower = query.toLowerCase();
        const matches = [];
        for (const [lvl, words] of Object.entries(VOCAB_DATA)) {
          for (const w of words) {
            if (
              (w.h && w.h.includes(query)) ||
              (w.p && w.p.toLowerCase().includes(qLower)) ||
              (w.m && w.m.toLowerCase().includes(qLower))
            ) {
              matches.push({
                hanzi: w.h,
                pinyin: w.p,
                meaning: w.m,
                example: w.ex || '',
                level: lvl.replace(' ', ''),
              });
              if (matches.length >= 50) break;
            }
          }
          if (matches.length >= 50) break;
        }

        return jsonResponse({
          success: true,
          count: matches.length,
          data: matches,
        });
      }

      // ==================== ARENA REALTIME SYNC ENDPOINTS ====================

      // POST /api/arena/sync - Lưu tin nhắn realtime cho phòng Arena (Siêu nhẹ, không JOIN)
      if (path === '/api/arena/sync' && method === 'POST') {
        const body = await request.json();
        const pin = String(body.pin || body.user_id || '').replace(/^arena_sync_/, '').trim();
        const msgStr = typeof body.msg === 'string' ? body.msg : JSON.stringify(body.msg || body.name || {});

        if (!pin) {
          return errorResponse('Missing pin', 400);
        }

        let msgId = Date.now();
        if (env && env.DB) {
          try {
            const res = await env.DB.prepare(
              'INSERT INTO arena_messages (pin, msg) VALUES (?, ?)'
            ).bind(pin, msgStr).run();
            msgId = res.meta.last_row_id;
          } catch (dbErr) {
            try {
              await env.DB.prepare(
                'CREATE TABLE IF NOT EXISTS arena_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, pin TEXT NOT NULL, msg TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
              ).run();
              const res2 = await env.DB.prepare(
                'INSERT INTO arena_messages (pin, msg) VALUES (?, ?)'
              ).bind(pin, msgStr).run();
              msgId = res2.meta.last_row_id;
            } catch (err2) {
              console.error('Failed to insert arena_message:', err2);
            }
          }
        }

        return jsonResponse({ success: true, id: msgId, deck_id: msgId }, 201);
      }

      // GET /api/arena/sync?pin=...&since=... - Lấy tin nhắn mới của phòng (Chỉ lấy tin nhắn mới)
      if (path === '/api/arena/sync' && method === 'GET') {
        const pin = String(url.searchParams.get('pin') || url.searchParams.get('user_id') || '').replace(/^arena_sync_/, '').trim();
        const sinceId = parseInt(url.searchParams.get('since')) || 0;

        if (!pin) {
          return errorResponse('Missing pin', 400);
        }

        if (env && env.DB) {
          try {
            const { results } = await env.DB.prepare(
              'SELECT id, msg FROM arena_messages WHERE pin = ? AND id > ? ORDER BY id ASC LIMIT 100'
            ).bind(pin, sinceId).all();

            const formatted = (results || []).map(r => ({
              id: r.id,
              msg: r.msg,
              name: r.msg
            }));
            return jsonResponse({ success: true, count: formatted.length, data: formatted });
          } catch (dbErr) {
            try {
              await env.DB.prepare(
                'CREATE TABLE IF NOT EXISTS arena_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, pin TEXT NOT NULL, msg TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
              ).run();
            } catch (e) {}
            return jsonResponse({ success: true, count: 0, data: [] });
          }
        }

        return jsonResponse({ success: true, count: 0, data: [] });
      }

      // DELETE /api/arena/sync?pin=... - Dọn dẹp tin nhắn khi kết thúc phòng
      if (path === '/api/arena/sync' && method === 'DELETE') {
        const pin = String(url.searchParams.get('pin') || '').trim();
        if (pin && env && env.DB) {
          try {
            await env.DB.prepare('DELETE FROM arena_messages WHERE pin = ?').bind(pin).run();
          } catch (e) {}
        }
        return jsonResponse({ success: true, message: 'Arena messages cleaned' });
      }

      // POST /api/arena/rooms - Đăng ký / cập nhật phòng Arena
      if (path === '/api/arena/rooms' && method === 'POST') {
        const body = await request.json();
        const pin = String(body.pin || '').trim();
        const name = String(body.name || '').trim();
        const isPublic = body.is_public ? 1 : 0;
        const metaJson = typeof body.meta === 'string' ? body.meta : JSON.stringify(body.meta || body);

        if (!pin) return errorResponse('Missing pin', 400);

        if (env && env.DB) {
          try {
            await env.DB.prepare(`
              INSERT OR REPLACE INTO arena_rooms (pin, name, is_public, meta_json, updated_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).bind(pin, name, isPublic, metaJson).run();
          } catch (e) {
            try {
              await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS arena_rooms (
                  pin TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  is_public INTEGER DEFAULT 0,
                  meta_json TEXT NOT NULL,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
              `).run();
              await env.DB.prepare(`
                INSERT OR REPLACE INTO arena_rooms (pin, name, is_public, meta_json, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
              `).bind(pin, name, isPublic, metaJson).run();
            } catch (err2) {}
          }
        }

        return jsonResponse({ success: true, message: 'Room saved', pin });
      }

      // GET /api/arena/rooms - Lấy danh sách phòng công khai hoặc chi tiết phòng
      if (path === '/api/arena/rooms' && method === 'GET') {
        const pin = url.searchParams.get('pin');
        if (env && env.DB) {
          try {
            if (pin) {
              const { results } = await env.DB.prepare(
                'SELECT * FROM arena_rooms WHERE pin = ?'
              ).bind(pin).all();
              if (results && results.length > 0) {
                return jsonResponse({ success: true, data: results[0] });
              }
              return errorResponse('Room not found', 404);
            }

            const { results } = await env.DB.prepare(`
              SELECT * FROM arena_rooms 
              WHERE is_public = 1 
              ORDER BY updated_at DESC 
              LIMIT 30
            `).all();

            const rooms = (results || []).map(r => {
              try {
                return JSON.parse(r.meta_json);
              } catch (e) {
                return { pin: r.pin, name: r.name };
              }
            });

            return jsonResponse({ success: true, count: rooms.length, data: rooms });
          } catch (e) {
            return jsonResponse({ success: true, count: 0, data: [] });
          }
        }
        return jsonResponse({ success: true, count: 0, data: [] });
      }

      // DELETE /api/arena/rooms/:pin - Xóa phòng
      if (path.startsWith('/api/arena/rooms/') && method === 'DELETE') {
        const pin = path.split('/').pop();
        if (pin && env && env.DB) {
          try {
            await env.DB.prepare('DELETE FROM arena_rooms WHERE pin = ?').bind(pin).run();
            await env.DB.prepare('DELETE FROM arena_messages WHERE pin = ?').bind(pin).run();
          } catch (e) {}
        }
        return jsonResponse({ success: true, message: 'Room removed' });
      }

      // ==================== CUSTOM DECK ENDPOINTS ====================

      // GET /api/decks?user_id=... - Lấy danh sách bộ từ tự tạo
      if (path === '/api/decks' && method === 'GET') {
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return errorResponse('Missing user_id');
        }

        // Fast-path bypass for legacy arena callers (loại bỏ hoàn toàn LEFT JOIN):
        if (userId.startsWith('arena_sync_')) {
          const pin = userId.replace('arena_sync_', '');
          if (env && env.DB) {
            try {
              const { results } = await env.DB.prepare(
                'SELECT id, msg as name FROM arena_messages WHERE pin = ? ORDER BY id ASC LIMIT 100'
              ).bind(pin).all();
              return jsonResponse({ success: true, count: results.length, data: results });
            } catch (e) {
              return jsonResponse({ success: true, count: 0, data: [] });
            }
          }
          return jsonResponse({ success: true, data: [] });
        }

        if (userId === 'arena_public_rooms') {
          if (env && env.DB) {
            try {
              const { results } = await env.DB.prepare(
                'SELECT pin as id, meta_json as name FROM arena_rooms WHERE is_public = 1 ORDER BY updated_at DESC LIMIT 30'
              ).all();
              return jsonResponse({ success: true, count: results.length, data: results });
            } catch (e) {
              return jsonResponse({ success: true, count: 0, data: [] });
            }
          }
          return jsonResponse({ success: true, data: [] });
        }

        if (userId.startsWith('arena_meta_')) {
          const pin = userId.replace('arena_meta_', '');
          if (env && env.DB) {
            try {
              const { results } = await env.DB.prepare(
                'SELECT pin as id, meta_json as name FROM arena_rooms WHERE pin = ?'
              ).bind(pin).all();
              return jsonResponse({ success: true, count: results.length, data: results });
            } catch (e) {
              return jsonResponse({ success: true, count: 0, data: [] });
            }
          }
          return jsonResponse({ success: true, data: [] });
        }

        if (!env || !env.DB) {
          return jsonResponse({ success: true, data: [] });
        }

        // Get numeric user ID from username
        const { results: userRecord } = await env.DB.prepare(
          'SELECT id FROM users WHERE username = ?'
        ).bind(userId).all();

        if (userRecord.length === 0) {
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

        // Fast-path bypass for legacy arena callers:
        if (user_id && user_id.startsWith('arena_sync_')) {
          const pin = user_id.replace('arena_sync_', '');
          const msgStr = typeof name === 'string' ? name : JSON.stringify(name || {});
          let msgId = Date.now();
          if (env && env.DB) {
            try {
              const res = await env.DB.prepare('INSERT INTO arena_messages (pin, msg) VALUES (?, ?)').bind(pin, msgStr).run();
              msgId = res.meta.last_row_id;
            } catch (e) {}
          }
          return jsonResponse({ success: true, deck_id: msgId, id: msgId }, 201);
        }

        if (user_id && user_id.startsWith('arena_meta_')) {
          const pin = user_id.replace('arena_meta_', '');
          const metaStr = typeof name === 'string' ? name : JSON.stringify(name || {});
          if (env && env.DB) {
            try {
              await env.DB.prepare('INSERT OR REPLACE INTO arena_rooms (pin, name, is_public, meta_json) VALUES (?, ?, 0, ?)').bind(pin, pin, metaStr).run();
            } catch (e) {}
          }
          return jsonResponse({ success: true, deck_id: pin }, 201);
        }

        if (user_id === 'arena_public_rooms') {
          let pin = '';
          try {
            const parsed = typeof name === 'string' ? JSON.parse(name) : name;
            pin = parsed.pin || '';
          } catch (e) {}
          const metaStr = typeof name === 'string' ? name : JSON.stringify(name || {});
          if (pin && env && env.DB) {
            try {
              await env.DB.prepare('INSERT OR REPLACE INTO arena_rooms (pin, name, is_public, meta_json) VALUES (?, ?, 1, ?)').bind(pin, pin, metaStr).run();
            } catch (e) {}
          }
          return jsonResponse({ success: true, deck_id: pin }, 201);
        }

        if (!env || !env.DB) {
          return errorResponse('D1 Database not configured for deck creation', 503);
        }

        if (!user_id || !name || !Array.isArray(words)) {
          return errorResponse('Missing required fields');
        }

        // Ensure user exists (auto-create if not)
        const { results: existingUser } = await env.DB.prepare(
          'SELECT id FROM users WHERE username = ?'
        ).bind(user_id).all();

        if (existingUser.length === 0) {
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

        // Thêm từ vào deck
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          await env.DB.prepare(
            'INSERT INTO custom_deck_words (deck_id, hanzi, pinyin, meaning, example, example_pinyin, example_meaning, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(
            deckId,
            word.h || word.hanzi,
            word.p || word.pinyin,
            word.m || word.meaning,
            word.ex || word.e || word.example || null,
            word.exp || word.example_pinyin || null,
            word.exm || word.example_meaning || null,
            i
          ).run();
        }

        return jsonResponse({
          success: true,
          message: 'Deck created',
          deck_id: deckId,
        }, 201);
      }

      // PUT /api/decks/:id - Cập nhật bộ từ tự tạo
      if (path.match(/^\/api\/decks\/\d+$/) && method === 'PUT') {
        if (!env || !env.DB) {
          return errorResponse('D1 Database not configured for deck updates', 503);
        }
        const deckId = path.split('/').pop();
        const body = await request.json();
        const { name, words } = body;

        const { results: deck } = await env.DB.prepare(
          'SELECT * FROM custom_decks WHERE id = ?'
        ).bind(deckId).all();

        if (deck.length === 0) {
          return errorResponse('Deck not found', 404);
        }

        if (name) {
          await env.DB.prepare(
            'UPDATE custom_decks SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(name, deckId).run();
        } else {
          await env.DB.prepare(
            'UPDATE custom_decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(deckId).run();
        }

        if (Array.isArray(words)) {
          await env.DB.prepare('DELETE FROM custom_deck_words WHERE deck_id = ?').bind(deckId).run();
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            await env.DB.prepare(
              'INSERT INTO custom_deck_words (deck_id, hanzi, pinyin, meaning, example, example_pinyin, example_meaning, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(
              deckId,
              word.h || word.hanzi,
              word.p || word.pinyin,
              word.m || word.meaning,
              word.ex || word.e || word.example || null,
              word.exp || word.example_pinyin || null,
              word.exm || word.example_meaning || null,
              i
            ).run();
          }
        }

        return jsonResponse({
          success: true,
          message: 'Deck updated',
          deck_id: Number(deckId),
        });
      }

      // GET /api/decks/:id - Lấy chi tiết 1 bộ từ
      if (path.match(/^\/api\/decks\/\d+$/) && method === 'GET') {
        if (!env || !env.DB) {
          return errorResponse('D1 Database not configured', 503);
        }
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
              ex: w.example || '',
              exp: w.example_pinyin || '',
              exm: w.example_meaning || '',
            })),
          },
        });
      }

      // DELETE /api/decks/:id - Xóa bộ từ
      if (path.match(/^\/api\/decks\/\d+$/) && method === 'DELETE') {
        if (!env || !env.DB) {
          return errorResponse('D1 Database not configured', 503);
        }
        const deckId = path.split('/').pop();
        await env.DB.prepare('DELETE FROM custom_decks WHERE id = ?').bind(deckId).run();
        try {
          await env.DB.prepare('DELETE FROM arena_messages WHERE id = ?').bind(deckId).run();
        } catch (e) {}
        return jsonResponse({ success: true, message: 'Deck deleted' });
      }

      // ==================== HEALTH CHECK ====================

      if (path === '/api/health' || path === '/') {
        return jsonResponse({
          success: true,
          message: '🇨🇳 WeiQuan Chinese API',
          version: '2.0.0',
          worker: 'hanyu',
          database_connected: Boolean(env && env.DB),
          endpoints: {
            vocabulary: '/api/vocabulary',
            vocabulary_all: '/api/vocabulary/all',
            search: '/api/search?q=...',
            levels: '/api/levels',
            decks: '/api/decks',
            arena_sync: '/api/arena/sync',
            arena_rooms: '/api/arena/rooms',
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
