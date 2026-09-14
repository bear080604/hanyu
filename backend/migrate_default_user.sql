-- Migration: Set all users to default_user
-- This is for single-user app setup

-- Update existing users to default_user
UPDATE users SET username = 'default_user' WHERE id = 1;

-- If no users exist, create default_user
INSERT OR IGNORE INTO users (id, username) VALUES (1, 'default_user');

-- Verify
SELECT 'Users after migration:' as info;
SELECT * FROM users;

SELECT 'Custom decks count:' as info;
SELECT COUNT(*) as total_decks FROM custom_decks;

SELECT 'Custom deck words count:' as info;
SELECT COUNT(*) as total_words FROM custom_deck_words;
