/**
 * WeiQuan Chinese HSK API
 * Cloudflare Workers + D1 Database
 */

import { VOCAB_DATA } from './vocabData.js';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Arena-Host-Token',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

async function signAdminToken(username, secret) {
  const payload = btoa(JSON.stringify({ u: username, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${sigHex}`;
}

async function verifyAdminToken(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  if (env && env.ADMIN_API_TOKEN && token === env.ADMIN_API_TOKEN) {
    return 'admin';
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sigHex] = parts;
  const secret = (env && (env.ADMIN_JWT_SECRET || env.ADMIN_PASSWORD)) || 'wenqing-server-secret-2026';
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expectedHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (sigHex !== expectedHex) return null;
    const parsed = JSON.parse(atob(payload));
    if (!parsed || !parsed.u || (parsed.exp && Date.now() > parsed.exp)) return null;
    return String(parsed.u);
  } catch (e) {
    return null;
  }
}

async function checkRoomHostAuth(env, pin, hostToken) {
  const roomObj = getArenaRoomStub(env, pin);
  if (!roomObj) return true;
  try {
    const res = await roomObj.fetch('https://arena-do/verify-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken: String(hostToken || '') }),
    });
    return res.ok;
  } catch (e) {
    return true;
  }
}

function normalizeArenaPin(rawPin) {
  const s = String(rawPin || '').replace(/^arena_(sync|meta)_/, '').trim();
  return s.replace(/\D/g, '') || s;
}

function getArenaRoomStub(env, rawPin) {
  if (!env || !env.ARENA_ROOM) return null;
  const cleanPin = normalizeArenaPin(rawPin);
  if (!cleanPin) return null;
  const id = env.ARENA_ROOM.idFromName(cleanPin.toUpperCase());
  return env.ARENA_ROOM.get(id);
}

const HOST_ONLY_ACTIONS = new Set([
  'room_created',
  'phase_1_getready',
  'phase_2_active',
  'phase_4_reveal',
  'phase_5_leaderboard',
  'game_over',
  'player_kick',
  'lobby_roster_sync',
  'join_rejected',
]);

let _customDeckWordsSchemaReady = false;

async function ensureCustomDeckWordsSchema(db) {
  if (_customDeckWordsSchemaReady || !db) return;
  try {
    const { results } = await db.prepare('PRAGMA table_info(custom_deck_words)').all();
    const existingCols = new Set((results || []).map(r => String(r.name || '').toLowerCase()));
    const needed = ['example', 'example_pinyin', 'example_meaning', 'meta_json'];
    for (const col of needed) {
      if (!existingCols.has(col)) {
        try {
          await db.prepare(`ALTER TABLE custom_deck_words ADD COLUMN ${col} TEXT`).run();
        } catch (alterErr) {
          // Ignore if another isolate added the column concurrently
        }
      }
    }
    _customDeckWordsSchemaReady = true;
  } catch (e) {
    // Let insertDeckWords handle fallback if PRAGMA/ALTER fails
  }
}

async function insertDeckWords(db, deckId, words) {
  if (!Array.isArray(words) || words.length === 0) return 0;
  await ensureCustomDeckWordsSchema(db);

  const cleanRows = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word || typeof word !== 'object') continue;
    const hanzi = String(word.h ?? word.hanzi ?? '').trim();
    if (!hanzi) continue;
    const pinyin = String(word.p ?? word.pinyin ?? '').trim();
    const meaning = String(word.m ?? word.meaning ?? '').trim();
    const rawEx = word.ex ?? word.e ?? word.example ?? '';
    const rawExp = word.exp ?? word.example_pinyin ?? '';
    const rawExm = word.exm ?? word.example_meaning ?? '';
    const meta = {};
    if (Array.isArray(word.examples) && word.examples.length > 0) meta.examples = word.examples;
    if (Array.isArray(word.tokens) && word.tokens.length > 0) meta.tokens = word.tokens;
    if (word.blank) meta.blank = String(word.blank);
    if (Array.isArray(word.options) && word.options.length > 0) meta.options = word.options;
    const metaJson = Object.keys(meta).length > 0 ? JSON.stringify(meta) : null;

    cleanRows.push({
      hanzi,
      pinyin,
      meaning,
      example: rawEx !== '' && rawEx != null ? String(rawEx) : null,
      examplePinyin: rawExp !== '' && rawExp != null ? String(rawExp) : null,
      exampleMeaning: rawExm !== '' && rawExm != null ? String(rawExm) : null,
      metaJson,
      sortOrder: cleanRows.length,
    });
  }

  if (cleanRows.length === 0) return 0;

  const CHUNK_SIZE = 50;
  try {
    const stmt = db.prepare(
      'INSERT INTO custom_deck_words (deck_id, hanzi, pinyin, meaning, example, example_pinyin, example_meaning, meta_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (let start = 0; start < cleanRows.length; start += CHUNK_SIZE) {
      const chunk = cleanRows.slice(start, start + CHUNK_SIZE);
      await db.batch(
        chunk.map(r =>
          stmt.bind(deckId, r.hanzi, r.pinyin, r.meaning, r.example, r.examplePinyin, r.exampleMeaning, r.metaJson, r.sortOrder)
        )
      );
    }
  } catch (fullInsertErr) {
    const msg = String(fullInsertErr && fullInsertErr.message || '').toLowerCase();
    if (msg.includes('no such column') || msg.includes('has no column')) {
      _customDeckWordsSchemaReady = false;
      const fallbackStmt = db.prepare(
        'INSERT INTO custom_deck_words (deck_id, hanzi, pinyin, meaning, sort_order) VALUES (?, ?, ?, ?, ?)'
      );
      for (let start = 0; start < cleanRows.length; start += CHUNK_SIZE) {
        const chunk = cleanRows.slice(start, start + CHUNK_SIZE);
        await db.batch(
          chunk.map(r => fallbackStmt.bind(deckId, r.hanzi, r.pinyin, r.meaning, r.sortOrder))
        );
      }
    } else {
      throw fullInsertErr;
    }
  }

  return cleanRows.length;
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

    // ==================== WEBSOCKET REALTIME (DURABLE OBJECTS / PARTYSOCKET) ====================
    const upgradeHeader = request.headers.get('Upgrade');
    if (
      (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') ||
      path.startsWith('/parties/') ||
      path === '/ws' ||
      path.startsWith('/arena/ws')
    ) {
      if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
        let pin = 'default';
        const match = path.match(/^\/parties\/[^\/]+\/([^\/\?]+)/);
        if (match) {
          pin = decodeURIComponent(match[1]);
        } else {
          pin = url.searchParams.get('pin') || url.searchParams.get('room') || 'default';
        }

        const cleanPin = pin.replace(/\D/g, '') || pin;
        if (env && env.ARENA_ROOM) {
          const id = env.ARENA_ROOM.idFromName(cleanPin.toUpperCase());
          const roomObj = env.ARENA_ROOM.get(id);
          return roomObj.fetch(request);
        } else {
          return new Response('Durable Object ARENA_ROOM not bound', { status: 503 });
        }
      }
    }

    try {
      // ==================== ADMIN AUTH ENDPOINT ====================
      if (path === '/api/admin/login' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const u = String(body.username || '').trim().toLowerCase();
        const p = String(body.password || '').trim();
        let accounts = { admin: (env && env.ADMIN_PASSWORD) || '123456', teacher: (env && env.ADMIN_PASSWORD) || '123456', wenqing: (env && env.ADMIN_PASSWORD) || 'admin123' };
        if (env && env.ADMIN_ACCOUNTS_JSON) {
          try { accounts = JSON.parse(env.ADMIN_ACCOUNTS_JSON); } catch (e) { }
        }
        const ok = Boolean(u && p && accounts[u] && accounts[u] === p);
        if (!ok) {
          return errorResponse('Invalid username or password', 401);
        }
        const secret = (env && (env.ADMIN_JWT_SECRET || env.ADMIN_PASSWORD)) || 'wenqing-server-secret-2026';
        const token = await signAdminToken(u, secret);
        return jsonResponse({ success: true, username: String(body.username || u).trim(), token });
      }

      // ==================== VOCABULARY ENDPOINTS ====================

      // GET /api/vocabulary/all - Lấy toàn bộ từ vựng theo từng level (0 D1 row reads mặc định, chỉ đọc D1 nếu ?source=db)
      if (path === '/api/vocabulary/all' && method === 'GET') {
        let data = VOCAB_DATA;
        if (url.searchParams.get('source') === 'db' && env && env.DB) {
          try {
            const { results } = await env.DB.prepare(`
              SELECT hanzi, pinyin, meaning, example, example_pinyin, example_meaning, pos, level
              FROM vocabulary
              ORDER BY level, id
            `).all();

            if (results && results.length > 0) {
              const dbData = {};
              for (const row of results) {
                const lvl = (row.level || '').replace('HSK', 'HSK ');
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

        return jsonResponse({ success: true, data }, 200, { 'Cache-Control': 'public, max-age=3600' });
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
          } catch (e) { }
        }
        return errorResponse('Vocabulary not found', 404);
      }

      // POST /api/vocabulary - Thêm từ vựng mới (admin only)
      if (path === '/api/vocabulary' && method === 'POST') {
        const adminUser = await verifyAdminToken(request, env);
        if (!adminUser) {
          return errorResponse('Unauthorized: Admin token required', 401);
        }
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
          } catch (e) { }
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
          } catch (e) { }
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
      // Mọi tin nhắn của phòng đều đi qua Durable Object (ArenaRoom) của PIN đó để WebSocket và HTTP thấy nhau 100%

      // POST /api/arena/sync - Lưu và phát tin nhắn realtime cho phòng Arena
      if (path === '/api/arena/sync' && method === 'POST') {
        const body = await request.json();
        const pin = normalizeArenaPin(body.pin || body.user_id);
        const msgObj = typeof body.msg === 'string'
          ? (() => { try { return JSON.parse(body.msg); } catch (e) { return {}; } })()
          : (body.msg || body.name || {});
        const hostToken = String(body.hostToken || request.headers.get('X-Arena-Host-Token') || '');

        if (!pin) {
          return errorResponse('Missing pin', 400);
        }

        const roomObj = getArenaRoomStub(env, pin);
        if (!roomObj) {
          return errorResponse('Durable Object ARENA_ROOM not bound', 503);
        }
        const doRes = await roomObj.fetch('https://arena-do/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, msg: msgObj, hostToken }),
        });
        const data = await doRes.json();
        return jsonResponse(data, doRes.status);
      }

      // GET /api/arena/sync?pin=...&since=... - Lấy tin nhắn mới của phòng từ Durable Object
      if (path === '/api/arena/sync' && method === 'GET') {
        const pin = normalizeArenaPin(url.searchParams.get('pin') || url.searchParams.get('user_id'));
        const sinceId = parseInt(url.searchParams.get('since') || url.searchParams.get('seq')) || 0;
        const latestOnly = url.searchParams.get('latest') === '1';

        if (!pin) {
          return errorResponse('Missing pin', 400);
        }

        const roomObj = getArenaRoomStub(env, pin);
        if (!roomObj) {
          return errorResponse('Durable Object ARENA_ROOM not bound', 503);
        }
        const doRes = await roomObj.fetch(
          `https://arena-do/since?pin=${encodeURIComponent(pin)}&since=${sinceId}${latestOnly ? '&latest=1' : ''}`
        );
        const data = await doRes.json();
        return jsonResponse(data, doRes.status);
      }

      // DELETE /api/arena/sync?pin=... - Dọn dẹp tin nhắn khi kết thúc phòng (yêu cầu hostToken hợp lệ hoặc phòng đã hết hạn)
      if (path === '/api/arena/sync' && method === 'DELETE') {
        const pin = normalizeArenaPin(url.searchParams.get('pin'));
        const hostToken = String(request.headers.get('X-Arena-Host-Token') || url.searchParams.get('token') || '');
        if (pin) {
          const roomObj = getArenaRoomStub(env, pin);
          if (roomObj) {
            const doRes = await roomObj.fetch(`https://arena-do/delete?pin=${encodeURIComponent(pin)}`, {
              method: 'DELETE',
              headers: hostToken ? { 'X-Arena-Host-Token': hostToken } : {},
            });
            if (doRes.status === 403) {
              return errorResponse('Forbidden: invalid hostToken', 403);
            }
          }
          if (env && env.DB) {
            try {
              await env.DB.prepare('DELETE FROM arena_messages WHERE pin = ?').bind(pin).run();
            } catch (e) { }
          }
        }
        return jsonResponse({ success: true, message: 'Arena messages cleaned' });
      }

      // POST /api/arena/rooms - Đăng ký / cập nhật phòng Arena
      if (path === '/api/arena/rooms' && method === 'POST') {
        const body = await request.json();
        const pin = normalizeArenaPin(body.pin);
        const name = String(body.name || '').trim();
        const isPublic = body.is_public ? 1 : 0;
        const metaJson = typeof body.meta === 'string' ? body.meta : JSON.stringify(body.meta || body);
        const hostToken = String(body.hostToken || request.headers.get('X-Arena-Host-Token') || '');

        if (!pin) return errorResponse('Missing pin', 400);
        const authorized = await checkRoomHostAuth(env, pin, hostToken);
        if (!authorized) return errorResponse('Forbidden: invalid hostToken', 403);

        if (env && env.DB) {
          try {
            await env.DB.prepare(`
              INSERT OR REPLACE INTO arena_rooms (pin, name, is_public, meta_json, updated_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).bind(pin, name, isPublic, metaJson).run();
          } catch (e) { }
        }

        return jsonResponse({ success: true, message: 'Room saved', pin });
      }

      // GET /api/arena/rooms - Lấy danh sách phòng công khai hoặc chi tiết phòng
      if (path === '/api/arena/rooms' && method === 'GET') {
        const rawPin = url.searchParams.get('pin');
        if (rawPin) {
          const pin = normalizeArenaPin(rawPin);
          if (env && env.DB) {
            try {
              const { results } = await env.DB.prepare(
                'SELECT * FROM arena_rooms WHERE pin = ?'
              ).bind(pin).all();
              if (results && results.length > 0) {
                return jsonResponse({ success: true, data: results[0] });
              }
            } catch (e) { }
          }
          return errorResponse('Room not found', 404);
        }

        let rooms = [];
        if (env && env.DB) {
          try {
            const { results } = await env.DB.prepare(`
              SELECT * FROM arena_rooms 
              WHERE is_public = 1 
              ORDER BY updated_at DESC 
              LIMIT 30
            `).all();

            if (results && results.length > 0) {
              rooms = results.map(r => {
                try {
                  return JSON.parse(r.meta_json);
                } catch (e) {
                  return { pin: r.pin, name: r.name };
                }
              });
            }
          } catch (e) { }
        }

        return jsonResponse({ success: true, count: rooms.length, data: rooms });
      }

      // DELETE /api/arena/rooms/:pin - Xóa phòng (yêu cầu hostToken hợp lệ hoặc phòng đã hết hạn)
      if (path.startsWith('/api/arena/rooms/') && method === 'DELETE') {
        const pin = normalizeArenaPin(path.split('/').pop());
        const hostToken = String(request.headers.get('X-Arena-Host-Token') || url.searchParams.get('token') || '');
        if (pin) {
          const roomObj = getArenaRoomStub(env, pin);
          if (roomObj) {
            const doRes = await roomObj.fetch(`https://arena-do/delete?pin=${encodeURIComponent(pin)}`, {
              method: 'DELETE',
              headers: hostToken ? { 'X-Arena-Host-Token': hostToken } : {},
            });
            if (doRes.status === 403) {
              return errorResponse('Forbidden: invalid hostToken', 403);
            }
          }
          if (env && env.DB) {
            try {
              await env.DB.prepare('DELETE FROM arena_rooms WHERE pin = ?').bind(pin).run();
              await env.DB.prepare('DELETE FROM arena_messages WHERE pin = ?').bind(pin).run();
            } catch (e) { }
          }
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

        // Fast-path bypass for legacy arena callers:
        if (userId.startsWith('arena_sync_')) {
          const pin = normalizeArenaPin(userId);
          const roomObj = getArenaRoomStub(env, pin);
          if (roomObj) {
            const doRes = await roomObj.fetch(`https://arena-do/since?pin=${encodeURIComponent(pin)}&since=0`);
            const data = await doRes.json();
            return jsonResponse(data, doRes.status);
          }
          return jsonResponse({ success: true, count: 0, data: [] });
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
          const pin = normalizeArenaPin(user_id);
          const msgObj = typeof name === 'string'
            ? (() => { try { return JSON.parse(name); } catch (e) { return {}; } })()
            : (name || {});
          const roomObj = getArenaRoomStub(env, pin);
          if (roomObj) {
            const doRes = await roomObj.fetch('https://arena-do/push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin, msg: msgObj, hostToken: body.hostToken || '' }),
            });
            const data = await doRes.json();
            return jsonResponse(data, doRes.status);
          }
          return jsonResponse({ success: true, deck_id: 0, id: 0 }, 201);
        }

        if (user_id && user_id.startsWith('arena_meta_')) {
          const pin = normalizeArenaPin(user_id);
          const hostToken = String(body.hostToken || request.headers.get('X-Arena-Host-Token') || '');
          const authorized = await checkRoomHostAuth(env, pin, hostToken);
          if (!authorized) return errorResponse('Forbidden: invalid hostToken', 403);
          const metaStr = typeof name === 'string' ? name : JSON.stringify(name || {});
          let isPub = 0;
          try {
            const parsed = typeof name === 'string' ? JSON.parse(name) : name;
            if (parsed && parsed.accessMode === 'public') isPub = 1;
          } catch (e) { }
          if (env && env.DB) {
            try {
              await env.DB.prepare('INSERT OR REPLACE INTO arena_rooms (pin, name, is_public, meta_json) VALUES (?, ?, ?, ?)').bind(pin, pin, isPub, metaStr).run();
            } catch (e) { }
          }
          return jsonResponse({ success: true, deck_id: pin }, 201);
        }

        if (user_id === 'arena_public_rooms') {
          let pin = '';
          try {
            const parsed = typeof name === 'string' ? JSON.parse(name) : name;
            pin = normalizeArenaPin(parsed.pin || '');
          } catch (e) { }
          const hostToken = String(body.hostToken || request.headers.get('X-Arena-Host-Token') || '');
          if (pin) {
            const authorized = await checkRoomHostAuth(env, pin, hostToken);
            if (!authorized) return errorResponse('Forbidden: invalid hostToken', 403);
          }
          const metaStr = typeof name === 'string' ? name : JSON.stringify(name || {});
          if (pin && env && env.DB) {
            try {
              await env.DB.prepare('INSERT OR REPLACE INTO arena_rooms (pin, name, is_public, meta_json) VALUES (?, ?, 1, ?)').bind(pin, pin, metaStr).run();
            } catch (e) { }
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

        // Thêm từ vào deck (batch + tự đảm bảo schema, nếu lỗi thì xóa deck rỗng tránh tạo vỏ 0 từ)
        try {
          await insertDeckWords(env.DB, deckId, words);
        } catch (insertErr) {
          try {
            await env.DB.prepare('DELETE FROM custom_decks WHERE id = ?').bind(deckId).run();
          } catch (cleanupErr) { }
          throw insertErr;
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
          await insertDeckWords(env.DB, deckId, words);
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
            words: words.map(w => {
              let extra = {};
              if (w.meta_json) {
                try {
                  const parsedMeta = JSON.parse(w.meta_json);
                  if (parsedMeta && typeof parsedMeta === 'object') extra = parsedMeta;
                } catch (e) { }
              }
              return {
                ...extra,
                h: w.hanzi,
                p: w.pinyin,
                m: w.meaning,
                ex: w.example || '',
                exp: w.example_pinyin || '',
                exm: w.example_meaning || '',
              };
            }),
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

// ==================== DURABLE OBJECT: ARENA ROOM ====================
// Mỗi phòng Arena (mã PIN) tương ứng với 1 Durable Object instance duy nhất trên toàn cầu
// Giữ toàn bộ nhật ký tin nhắn (200 tin gần nhất), seq tăng dần, xác thực hostToken và tự dọn phòng qua alarm()
const MAX_DO_LOG_SIZE = 200;
const INACTIVITY_TTL_MS = 2 * 60 * 60 * 1000; // 2 giờ không hoạt động

export class ArenaRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.seq = 0;
    this.log = [];
    this.hostToken = '';
    this.expiresAt = 0;
    this.lastActivity = Date.now();
    this.pin = '';
    this._loaded = false;
  }

  async _ensureLoaded() {
    if (this._loaded) return;
    await this.state.blockConcurrencyWhile(async () => {
      if (this._loaded) return;
      const stored = await this.state.storage.get(['seq', 'log', 'hostToken', 'expiresAt', 'lastActivity', 'pin']);
      this.seq = Number(stored.get('seq')) || 0;
      this.log = Array.isArray(stored.get('log')) ? stored.get('log') : [];
      this.hostToken = String(stored.get('hostToken') || '');
      this.expiresAt = Number(stored.get('expiresAt')) || 0;
      this.lastActivity = Number(stored.get('lastActivity')) || Date.now();
      this.pin = String(stored.get('pin') || '');
      this._loaded = true;
    });
  }

  async _saveState() {
    this.lastActivity = Date.now();
    await this.state.storage.put({
      seq: this.seq,
      log: this.log,
      hostToken: this.hostToken,
      expiresAt: this.expiresAt,
      lastActivity: this.lastActivity,
      pin: this.pin,
    });
    await this._scheduleAlarm();
  }

  async _scheduleAlarm() {
    try {
      const inactivityDeadline = (this.lastActivity || Date.now()) + INACTIVITY_TTL_MS;
      const targetTime = (this.expiresAt && this.expiresAt > 0)
        ? Math.min(this.expiresAt, inactivityDeadline)
        : inactivityDeadline;
      if (targetTime > Date.now()) {
        await this.state.storage.setAlarm(targetTime);
      } else {
        await this.state.storage.setAlarm(Date.now() + 1000);
      }
    } catch (e) { }
  }

  _verifyOrBindHost(token) {
    const cleanToken = String(token || '').trim();
    if (!cleanToken) return false;
    if (!this.hostToken) {
      this.hostToken = cleanToken;
      return true;
    }
    return this.hostToken === cleanToken;
  }

  async _appendAndBroadcast(msgObj, senderWs = null) {
    if (!msgObj || typeof msgObj !== 'object') return null;

    this.seq += 1;
    const now = Date.now();
    if (msgObj.payload && msgObj.payload.expiresAt && Number(msgObj.payload.expiresAt) > 0) {
      this.expiresAt = Number(msgObj.payload.expiresAt);
    }
    if (msgObj.payload && msgObj.payload.pin && !this.pin) {
      this.pin = normalizeArenaPin(msgObj.payload.pin);
    }

    const entry = {
      seq: this.seq,
      msg: msgObj,
      timestamp: now,
    };
    this.log.push(entry);
    if (this.log.length > MAX_DO_LOG_SIZE) {
      this.log.splice(0, this.log.length - MAX_DO_LOG_SIZE);
    }

    await this._saveState();

    const targetId = (msgObj.targetId || (msgObj.payload && msgObj.payload.targetId) || '').trim();
    const wireStr = JSON.stringify({ seq: entry.seq, msg: entry.msg });
    const sockets = this.state.getWebSockets();

    for (const client of sockets) {
      if (senderWs && client === senderWs) continue;
      if (targetId) {
        try {
          const att = client.deserializeAttachment() || {};
          if (att.playerId && att.playerId !== targetId && att.role !== 'host') {
            continue;
          }
        } catch (e) { }
      }
      try {
        client.send(wireStr);
      } catch (e) {
        try { client.close(1011, 'Send error'); } catch (err) { }
      }
    }

    return entry;
  }

  async fetch(request) {
    await this._ensureLoaded();

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const upgradeHeader = request.headers.get('Upgrade');

    const match = path.match(/^\/parties\/[^\/]+\/([^\/\?]+)/);
    const pinFromUrl = match ? decodeURIComponent(match[1]) : (url.searchParams.get('pin') || '');
    if (pinFromUrl && !this.pin) {
      this.pin = normalizeArenaPin(pinFromUrl);
    }

    // 1. WebSocket Upgrade
    if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
      const roleParam = (url.searchParams.get('role') || 'player').toLowerCase();
      const tokenParam = url.searchParams.get('token') || '';
      const playerIdParam = url.searchParams.get('playerId') || '';
      const sinceSeq = parseInt(url.searchParams.get('since')) || 0;

      let isHost = false;
      if (roleParam === 'host') {
        isHost = this._verifyOrBindHost(tokenParam);
        if (isHost) {
          await this._saveState();
        }
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      this.state.acceptWebSocket(server);
      try {
        server.serializeAttachment({
          role: isHost ? 'host' : 'player',
          playerId: playerIdParam,
        });
      } catch (e) { }

      // Gửi ack kèm seq hiện tại của phòng
      try {
        server.send(JSON.stringify({ type: 'pk_ack', seq: this.seq, isHost }));
        if (sinceSeq > 0 && this.log.length > 0) {
          for (const entry of this.log) {
            if (entry.seq > sinceSeq) {
              const targetId = (entry.msg && (entry.msg.targetId || (entry.msg.payload && entry.msg.payload.targetId))) || '';
              if (targetId && playerIdParam && targetId !== playerIdParam && !isHost) {
                continue;
              }
              server.send(JSON.stringify({ seq: entry.seq, msg: entry.msg }));
            }
          }
        }
      } catch (e) { }

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // 2. HTTP POST /init - Khởi tạo / xác thực hostToken
    if (path === '/init' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const requestedToken = body.hostToken || ('ht_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
      const isHost = this._verifyOrBindHost(requestedToken);
      if (body.pin && !this.pin) this.pin = normalizeArenaPin(body.pin);
      if (body.expiresAt) this.expiresAt = Number(body.expiresAt) || 0;
      await this._saveState();
      return jsonResponse({ success: isHost, hostToken: isHost ? this.hostToken : '', seq: this.seq }, isHost ? 200 : 403);
    }

    // 3. HTTP POST /push - Gửi tin nhắn qua HTTP và broadcast tới toàn bộ WebSocket trong phòng
    if (path === '/push' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.pin && !this.pin) {
        this.pin = normalizeArenaPin(body.pin);
      }
      const msgObj = typeof body.msg === 'string'
        ? (() => { try { return JSON.parse(body.msg); } catch (e) { return {}; } })()
        : (body.msg || {});
      const action = msgObj && msgObj.action;

      if (HOST_ONLY_ACTIONS.has(action)) {
        const isHost = this._verifyOrBindHost(body.hostToken);
        if (!isHost) {
          return jsonResponse({ error: 'Forbidden: invalid hostToken' }, 403);
        }
      }

      const entry = await this._appendAndBroadcast(msgObj, null);
      const seq = entry ? entry.seq : this.seq;
      return jsonResponse({ success: true, id: seq, seq, deck_id: seq }, 201);
    }

    // 4. HTTP GET /since - Đọc tin nhắn từ seq > since
    if (path === '/since' && method === 'GET') {
      const sinceSeq = parseInt(url.searchParams.get('since') || url.searchParams.get('seq')) || 0;
      const latestOnly = url.searchParams.get('latest') === '1';

      if (latestOnly) {
        return jsonResponse({ success: true, seq: this.seq, count: 0, data: [] });
      }

      const items = this.log.filter(e => e.seq > sinceSeq).map(e => ({
        id: e.seq,
        seq: e.seq,
        msg: e.msg,
        name: JSON.stringify(e.msg),
        timestamp: e.timestamp,
      }));
      return jsonResponse({
        success: true,
        seq: this.seq,
        count: items.length,
        data: items,
      });
    }

    // 5. HTTP POST /verify-host - Kiểm tra hostToken của phòng
    if (path === '/verify-host' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const isExpired = this.expiresAt && this.expiresAt > 0 && Date.now() >= this.expiresAt;
      if (!this.hostToken || isExpired) {
        if (body.hostToken && !this.hostToken) {
          this.hostToken = String(body.hostToken).trim();
          await this._saveState();
        }
        return jsonResponse({ success: true, authorized: true });
      }
      const ok = Boolean(body.hostToken && String(body.hostToken).trim() === this.hostToken);
      return jsonResponse({ success: ok, authorized: ok }, ok ? 200 : 403);
    }

    // 6. HTTP DELETE / hoặc /delete - Xóa phòng & đóng toàn bộ kết nối (chặn xóa trái phép phòng đang hoạt động)
    if (method === 'DELETE') {
      const tokenHeader = String(request.headers.get('X-Arena-Host-Token') || url.searchParams.get('token') || '').trim();
      const isExpired = this.expiresAt && this.expiresAt > 0 && Date.now() >= this.expiresAt;
      if (this.hostToken && !isExpired && tokenHeader !== this.hostToken) {
        return jsonResponse({ error: 'Forbidden: invalid hostToken' }, 403);
      }
      await this._cleanupRoom();
      return jsonResponse({ success: true, message: 'Room deleted' });
    }

    return jsonResponse({ success: true, seq: this.seq });
  }

  async webSocketMessage(ws, message) {
    await this._ensureLoaded();

    let msgObj = null;
    try {
      const parsed = typeof message === 'string' ? JSON.parse(message) : null;
      msgObj = (parsed && parsed.msg && typeof parsed.msg === 'object' && parsed.msg.action) ? parsed.msg : parsed;
    } catch (e) {
      return;
    }

    if (!msgObj || !msgObj.action) return;

    let att = {};
    try {
      att = ws.deserializeAttachment() || {};
    } catch (e) { }

    // Nếu client gửi kèm hostToken trong message để nâng cấp quyền host
    if (msgObj.hostToken && att.role !== 'host') {
      if (this._verifyOrBindHost(msgObj.hostToken)) {
        att = { ...att, role: 'host' };
        try { ws.serializeAttachment(att); } catch (e) { }
      }
    }

    const isHost = att.role === 'host';
    if (HOST_ONLY_ACTIONS.has(msgObj.action) && !isHost) {
      // Chặn người chơi giả mạo lệnh của chủ phòng
      return;
    }

    // Ghi nhận playerId vào attachment khi người chơi join để lọc targetId chính xác
    if (msgObj.action === 'player_join' && msgObj.payload && msgObj.payload.id) {
      const pid = String(msgObj.payload.id);
      if (att.playerId !== pid) {
        att = { ...att, playerId: pid };
        try { ws.serializeAttachment(att); } catch (e) { }
      }
    }

    // Xóa trường hostToken nội bộ trước khi lưu/broadcast cho các máy khác
    if (msgObj.hostToken) {
      delete msgObj.hostToken;
    }

    await this._appendAndBroadcast(msgObj, ws);
  }

  async webSocketClose(ws, code, reason, wasClean) {
    try {
      ws.close(code, reason);
    } catch (e) { }
  }

  async webSocketError(ws, error) {
    try {
      ws.close(1011, 'WebSocket error');
    } catch (e) { }
  }

  async _cleanupRoom() {
    const pinToClean = this.pin;
    this.seq = 0;
    this.log = [];
    this.hostToken = '';
    this.expiresAt = 0;

    const sockets = this.state.getWebSockets();
    for (const client of sockets) {
      try {
        client.close(1000, 'Room closed');
      } catch (e) { }
    }

    try {
      await this.state.storage.deleteAll();
    } catch (e) { }

    if (pinToClean && this.env && this.env.DB) {
      try {
        await this.env.DB.prepare('DELETE FROM arena_rooms WHERE pin = ?').bind(pinToClean).run();
        await this.env.DB.prepare('DELETE FROM arena_messages WHERE pin = ?').bind(pinToClean).run();
      } catch (e) { }
    }
  }

  async alarm() {
    await this._ensureLoaded();
    const now = Date.now();
    const isExpired = this.expiresAt && this.expiresAt > 0 && now >= this.expiresAt;
    const isInactive = (now - (this.lastActivity || 0)) >= INACTIVITY_TTL_MS;

    if (isExpired || isInactive) {
      await this._cleanupRoom();
    } else {
      await this._scheduleAlarm();
    }
  }
}
