# 🚀 WeiQuan Chinese API - Cloudflare Workers

Backend API cho ứng dụng học tiếng Trung HSK, sử dụng Cloudflare Workers + D1 Database.

## 🌟 Tính năng

- ✅ RESTful API với CORS support
- 📚 Quản lý từ vựng HSK 1-6
- 🔍 Tìm kiếm nhanh (Hán tự, Pinyin, Nghĩa)
- 📝 Bộ từ tự tạo (Custom Decks)
- 👤 User progress tracking (optional)
- ⚡ Cực kỳ nhanh (Cloudflare Edge Network)
- 💰 Miễn phí (Free tier: 100k requests/day)

## 📋 Yêu cầu

- Node.js 16+
- Cloudflare account (free)
- Wrangler CLI

## 🚀 Cài đặt

### 1. Cài đặt Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Login Cloudflare

```bash
wrangler login
```

### 3. Tạo D1 Database

```bash
cd backend
npm install
npm run db:create
```

Lưu lại `database_id` và cập nhật vào `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "weiquan_hsk"
database_id = "your-database-id-here"  # ← Thay bằng database_id vừa tạo
```

### 4. Tạo schema

```bash
npm run db:init
```

### 5. Seed data

```bash
# Tạo file seed.sql từ data_hsk1.json và data_hsk2.json
npm run db:seed

# Import vào D1
wrangler d1 execute weiquan_hsk --file=./seed.sql
```

### 6. Test local

```bash
npm run dev
```

Mở: http://localhost:8787

### 7. Deploy lên production

```bash
npm run deploy
```

## 📡 API Endpoints

### Base URL (sau khi deploy)
```
https://weiquan-api.YOUR-SUBDOMAIN.workers.dev
```

### Vocabulary

#### Lấy tất cả từ vựng
```http
GET /api/vocabulary?level=HSK1&limit=100&offset=0
```

Response:
```json
{
  "success": true,
  "count": 100,
  "data": [
    {
      "id": 1,
      "hanzi": "爱",
      "pinyin": "ài",
      "meaning": "yêu, thương",
      "example": "我爱你",
      "level": "HSK1",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Lấy 1 từ vựng
```http
GET /api/vocabulary/1
```

#### Thêm từ mới (admin)
```http
POST /api/vocabulary
Content-Type: application/json

{
  "hanzi": "你好",
  "pinyin": "nǐ hǎo",
  "meaning": "xin chào",
  "example": "你好，朋友！",
  "level": "HSK1"
}
```

### Search

#### Tìm kiếm từ
```http
GET /api/search?q=爱
```

### Levels

#### Lấy danh sách levels
```http
GET /api/levels
```

Response:
```json
{
  "success": true,
  "data": [
    { "level": "HSK1", "count": 496 },
    { "level": "HSK2", "count": 770 }
  ]
}
```

### Custom Decks

#### Lấy danh sách bộ từ
```http
GET /api/decks?user_id=guest_123456
```

#### Tạo bộ từ mới
```http
POST /api/decks
Content-Type: application/json

{
  "user_id": "guest_123456",
  "name": "Bộ từ của tôi",
  "words": [
    { "h": "爱", "p": "ài", "m": "yêu" },
    { "h": "你好", "p": "nǐ hǎo", "m": "xin chào" }
  ]
}
```

#### Lấy chi tiết bộ từ
```http
GET /api/decks/1
```

#### Xóa bộ từ
```http
DELETE /api/decks/1
```

### Health Check

```http
GET /api/health
```

## 🔧 Development

### Local development
```bash
npm run dev
```

### Deploy
```bash
npm run deploy
```

### View logs
```bash
wrangler tail
```

### Query database trực tiếp
```bash
wrangler d1 execute weiquan_hsk --command="SELECT COUNT(*) FROM vocabulary"
```

## 📊 Database Schema

```sql
vocabulary          - Từ vựng HSK
users              - Người dùng (optional)
user_progress      - Tiến độ học
user_favorites     - Từ yêu thích
custom_decks       - Bộ từ tự tạo
custom_deck_words  - Từ trong bộ tự tạo
```

## 💰 Cloudflare Free Tier

- ✅ 100,000 requests/day
- ✅ 10ms CPU time per request
- ✅ 5GB D1 storage
- ✅ 5M row reads/day
- ✅ 100k row writes/day

**→ Đủ cho hàng nghìn user!**

## 📝 Notes

- API có CORS enabled (`Access-Control-Allow-Origin: *`)
- Không cần authentication cho read operations
- Write operations nên thêm auth sau (JWT/API Key)
- D1 là database SQLite serverless, cực nhanh

## 🔗 Resources

- [Cloudflare Workers](https://workers.cloudflare.com/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

---

Made with ❤️ for Chinese learners
