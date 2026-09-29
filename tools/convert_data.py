#!/usr/bin/env python3
# Script convert JSON data sang JavaScript embedded format

import json

def transform_item(item):
    """Transform một item từ JSON format sang format app cần"""
    if not item.get('word') or not item.get('pinyin'):
        return None
    
    # Lấy meaning đầu tiên (nếu có)
    meanings = item.get('meanings', [])
    if not meanings:
        return None
    
    first_meaning = meanings[0]
    
    return {
        'h': item['word'],
        'p': item['pinyin'].replace('/', '').strip(),
        'm': first_meaning.get('meaning', ''),
        'ex': first_meaning.get('example', '')
    }

def load_and_transform(filename):
    """Load và transform data từ file JSON"""
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    transformed = []
    for item in data:
        result = transform_item(item)
        if result:
            transformed.append(result)
    
    return transformed

# Load data
print('📚 Đang load data...')
hsk1_data = load_and_transform('data_hsk1.json')
hsk2_data = load_and_transform('data_hsk2.json')

print(f'✓ HSK 1: {len(hsk1_data)} từ')
print(f'✓ HSK 2: {len(hsk2_data)} từ')

# Tạo file data.js với embedded data
with open('data.js', 'w', encoding='utf-8') as f:
    f.write('// WeiQuan Chinese - HSK Vocabulary Data\n')
    f.write('// Auto-generated - DO NOT EDIT MANUALLY\n\n')
    f.write('const DATA = {\n')
    
    # HSK 1
    f.write('  "HSK 1": ')
    f.write(json.dumps(hsk1_data, ensure_ascii=False, indent=2))
    f.write(',\n\n')
    
    # HSK 2
    f.write('  "HSK 2": ')
    f.write(json.dumps(hsk2_data, ensure_ascii=False, indent=2))
    f.write(',\n\n')
    
    # HSK 3-6 empty arrays
    f.write('  "HSK 3": [],\n')
    f.write('  "HSK 4": [],\n')
    f.write('  "HSK 5": [],\n')
    f.write('  "HSK 6": []\n')
    f.write('};\n\n')
    
    # Export
    f.write('// Export DATA\n')
    f.write('window.DATA = DATA;\n')
    f.write('console.log("✅ HSK Data loaded successfully!");\n')
    f.write(f'console.log("📚 HSK 1: {len(hsk1_data)} từ");\n')
    f.write(f'console.log("📚 HSK 2: {len(hsk2_data)} từ");\n')

print('\n✅ Đã tạo file data.js thành công!')
print('📁 File: data.js')
print(f'📊 Tổng: {len(hsk1_data) + len(hsk2_data)} từ vựng')
