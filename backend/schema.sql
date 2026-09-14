-- WeiQuan Chinese HSK Database Schema

-- Bảng từ vựng HSK
CREATE TABLE IF NOT EXISTS vocabulary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hanzi TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  meaning TEXT NOT NULL,
  example TEXT,
  level TEXT NOT NULL CHECK(level IN ('HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hanzi, level)
);

-- Index cho tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_level ON vocabulary(level);
CREATE INDEX IF NOT EXISTS idx_hanzi ON vocabulary(hanzi);
CREATE INDEX IF NOT EXISTS idx_pinyin ON vocabulary(pinyin);

-- Bảng người dùng (optional - cho tính năng account sau này)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng tiến độ học tập của user
CREATE TABLE IF NOT EXISTS user_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vocabulary_id INTEGER NOT NULL,
  learned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  review_count INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vocabulary_id) REFERENCES vocabulary(id) ON DELETE CASCADE,
  UNIQUE(user_id, vocabulary_id)
);

-- Bảng từ yêu thích
CREATE TABLE IF NOT EXISTS user_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vocabulary_id INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vocabulary_id) REFERENCES vocabulary(id) ON DELETE CASCADE,
  UNIQUE(user_id, vocabulary_id)
);

-- Bảng bộ từ tự tạo
CREATE TABLE IF NOT EXISTS custom_decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Bảng từ trong bộ tự tạo
CREATE TABLE IF NOT EXISTS custom_deck_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER NOT NULL,
  hanzi TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  meaning TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (deck_id) REFERENCES custom_decks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_custom_deck ON custom_deck_words(deck_id);
