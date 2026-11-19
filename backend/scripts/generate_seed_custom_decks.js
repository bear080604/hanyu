const fs = require('fs');
const path = require('path');

global.window = global;
let content = fs.readFileSync(path.join(__dirname, '../../data/data.js'), 'utf8');
content = content.replace('const DATA =', 'global.DATA =');
eval(content);

const vocabMap = new Map();
for (const lvl of Object.keys(global.DATA)) {
  for (const w of global.DATA[lvl]) {
    const words = (w.h || '').split('|').map(s => s.trim());
    for (const single of words) {
      if (!vocabMap.has(single)) {
        vocabMap.set(single, { p: w.p, m: w.m });
      }
    }
  }
}

const migration = fs.readFileSync(path.join(__dirname, '../migrate_custom_deck_sentences.sql'), 'utf8');
const lines = migration.split('\n');

const decks = {};
let currentDeckId = null;

lines.forEach(l => {
  const mDeck = l.match(/-- Deck (\d+): (.+)/);
  if (mDeck) {
    currentDeckId = parseInt(mDeck[1]);
    decks[currentDeckId] = { name: mDeck[2].trim(), words: [] };
    return;
  }
  const mUpdate = l.match(/UPDATE custom_deck_words SET example = '([^']*)', example_pinyin = '([^']*)', example_meaning = '([^']*)' WHERE deck_id = (\d+) AND hanzi = '([^']*)';/);
  if (mUpdate) {
    const [, ex, exp, exm, deckId, hanzi] = mUpdate;
    const v = vocabMap.get(hanzi) || { p: exp.split(' ')[0] || '', m: exm };
    decks[parseInt(deckId)].words.push({
      hanzi,
      pinyin: v.p || '',
      meaning: v.m || '',
      example: ex,
      example_pinyin: exp,
      example_meaning: exm
    });
  }
});

function esc(str) {
  if (!str) return 'NULL';
  return `'` + String(str).replace(/'/g, "''") + `'`;
}

const sql = [];
sql.push('-- Seed Default User & Custom Decks (Bài 4 - Bài 10)');
sql.push("INSERT OR IGNORE INTO users (id, username) VALUES (1, 'default_user');\n");

for (const [deckId, deck] of Object.entries(decks)) {
  sql.push(`INSERT OR REPLACE INTO custom_decks (id, user_id, name) VALUES (${deckId}, 1, ${esc(deck.name)});`);
  deck.words.forEach((w, idx) => {
    sql.push(
      `INSERT OR REPLACE INTO custom_deck_words (deck_id, hanzi, pinyin, meaning, example, example_pinyin, example_meaning, sort_order) VALUES (${deckId}, ${esc(w.hanzi)}, ${esc(w.pinyin)}, ${esc(w.meaning)}, ${esc(w.example)}, ${esc(w.example_pinyin)}, ${esc(w.example_meaning)}, ${idx});`
    );
  });
  sql.push('');
}

const outPath = path.join(__dirname, '../seed_custom_decks.sql');
fs.writeFileSync(outPath, sql.join('\n'), 'utf8');
console.log('✅ Generated', outPath, 'with', sql.length, 'lines across', Object.keys(decks).length, 'decks');
