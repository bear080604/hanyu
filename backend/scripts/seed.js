#!/usr/bin/env node
/**
 * Script để seed data HSK vào Cloudflare D1
 * Chạy: node scripts/seed.js
 */

const fs = require('fs');
const path = require('path');

// Load data từ JSON files
const hsk1Path = path.join(__dirname, '../../data/data_hsk1.json');
const hsk2Path = path.join(__dirname, '../../data/data_hsk2.json');

const hsk1Data = JSON.parse(fs.readFileSync(hsk1Path, 'utf-8'));
const hsk2Data = JSON.parse(fs.readFileSync(hsk2Path, 'utf-8'));

function esc(str) {
  if (!str) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function transformItem(item, level) {
  if (!item.word || !item.pinyin || !item.meanings || item.meanings.length === 0) {
    return null;
  }

  const firstMeaning = item.meanings[0];
  const meaning = firstMeaning.meaning || item.meanings.map(m => m.meaning).filter(Boolean).join('; ') || '—';
  if (!meaning || meaning === '—') return null; // skip nếu không có nghĩa

  return {
    hanzi: item.word,
    pinyin: item.pinyin.replace(/\//g, '').trim(),
    meaning: meaning,
    example: firstMeaning.example || null,
    example_pinyin: firstMeaning.example_pinyin ? firstMeaning.example_pinyin.replace(/\//g, '').trim() : null,
    example_meaning: firstMeaning.example_meaning || null,
    pos: firstMeaning.pos || null,
    meanings_json: JSON.stringify(item.meanings),
    level: level,
  };
}

console.log('📚 Đang chuẩn bị seed data...\n');

const hsk1Transformed = hsk1Data.map(item => transformItem(item, 'HSK1')).filter(Boolean);
const hsk2Transformed = hsk2Data.map(item => transformItem(item, 'HSK2')).filter(Boolean);

console.log(`✓ HSK 1: ${hsk1Transformed.length} từ`);
console.log(`✓ HSK 2: ${hsk2Transformed.length} từ`);
console.log(`✓ Tổng: ${hsk1Transformed.length + hsk2Transformed.length} từ\n`);

const allWords = [...hsk1Transformed, ...hsk2Transformed];
const sqlStatements = [];

sqlStatements.push('-- WeiQuan Chinese HSK Data Seed (full columns)');
sqlStatements.push('-- Auto-generated\n');

allWords.forEach(word => {
  sqlStatements.push(
    `INSERT OR REPLACE INTO vocabulary (hanzi, pinyin, meaning, example, example_pinyin, example_meaning, pos, meanings_json, level) VALUES (${esc(word.hanzi)}, ${esc(word.pinyin)}, ${esc(word.meaning)}, ${esc(word.example)}, ${esc(word.example_pinyin)}, ${esc(word.example_meaning)}, ${esc(word.pos)}, ${esc(word.meanings_json)}, '${word.level}');`
  );
});

const sqlContent = sqlStatements.join('\n');
const outputPath = path.join(__dirname, '../seed.sql');

fs.writeFileSync(outputPath, sqlContent, 'utf-8');

console.log('✅ Đã tạo file seed.sql');
console.log(`📁 Location: ${outputPath}`);
console.log(`\n📝 Chạy lệnh sau để import vào D1:`);
console.log(`   npx wrangler d1 execute DB --remote --file=seed.sql\n`);
