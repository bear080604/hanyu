#!/usr/bin/env node
/**
 * Script để seed data HSK vào Cloudflare D1
 * Chạy: node scripts/seed.js
 */

const fs = require('fs');
const path = require('path');

// Load data từ JSON files
const hsk1Path = path.join(__dirname, '../../data_hsk1.json');
const hsk2Path = path.join(__dirname, '../../data_hsk2.json');

const hsk1Data = JSON.parse(fs.readFileSync(hsk1Path, 'utf-8'));
const hsk2Data = JSON.parse(fs.readFileSync(hsk2Path, 'utf-8'));

function transformItem(item, level) {
  if (!item.word || !item.pinyin || !item.meanings || item.meanings.length === 0) {
    return null;
  }

  const firstMeaning = item.meanings[0];
  return {
    hanzi: item.word,
    pinyin: item.pinyin.replace(/\//g, '').trim(),
    meaning: firstMeaning.meaning || '',
    example: firstMeaning.example || null,
    level: level,
  };
}

console.log('📚 Đang chuẩn bị seed data...\n');

// Transform data
const hsk1Transformed = hsk1Data.map(item => transformItem(item, 'HSK1')).filter(Boolean);
const hsk2Transformed = hsk2Data.map(item => transformItem(item, 'HSK2')).filter(Boolean);

console.log(`✓ HSK 1: ${hsk1Transformed.length} từ`);
console.log(`✓ HSK 2: ${hsk2Transformed.length} từ`);
console.log(`✓ Tổng: ${hsk1Transformed.length + hsk2Transformed.length} từ\n`);

// Tạo SQL file để import
const allWords = [...hsk1Transformed, ...hsk2Transformed];
const sqlStatements = [];

sqlStatements.push('-- WeiQuan Chinese HSK Data Seed');
sqlStatements.push('-- Auto-generated\n');

allWords.forEach(word => {
  const hanzi = word.hanzi.replace(/'/g, "''");
  const pinyin = word.pinyin.replace(/'/g, "''");
  const meaning = word.meaning.replace(/'/g, "''");
  const example = word.example ? `'${word.example.replace(/'/g, "''")}'` : 'NULL';
  
  sqlStatements.push(
    `INSERT OR IGNORE INTO vocabulary (hanzi, pinyin, meaning, example, level) VALUES ('${hanzi}', '${pinyin}', '${meaning}', ${example}, '${word.level}');`
  );
});

const sqlContent = sqlStatements.join('\n');
const outputPath = path.join(__dirname, '../seed.sql');

fs.writeFileSync(outputPath, sqlContent, 'utf-8');

console.log('✅ Đã tạo file seed.sql');
console.log(`📁 Location: ${outputPath}`);
console.log(`\n📝 Chạy lệnh sau để import vào D1:`);
console.log(`   wrangler d1 execute weiquan_hsk --file=./seed.sql\n`);
