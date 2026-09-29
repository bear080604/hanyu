# 🎉 Changelog: Tính năng Import JSON

## Ngày cập nhật
`[Date]`

## Thay đổi chính

### ✅ Đã thêm

1. **Nút "📥 Nhập JSON"** trong phần Tự tạo bộ từ
   - Vị trí: Cạnh nút "💾 Lưu bộ từ" và "🎯 Học ngay"
   - Màu xanh dương để dễ nhận biết

2. **Modal Import JSON** (`#importJsonModal`)
   - Upload file .json
   - Paste JSON trực tiếp vào textarea
   - Hướng dẫn 2 format JSON (Array đơn giản & Object với level)
   - Ví dụ code snippet với syntax highlight

3. **Modal Xác nhận Từ trùng** (`#duplicateConfirmModal`)
   - Hiển thị số lượng từ mới vs từ trùng
   - So sánh nghĩa cũ vs nghĩa mới (hiển thị tối đa 10 từ đầu)
   - 3 lựa chọn:
     * ✅ Chỉ thêm từ mới (bỏ qua trùng)
     * 🔄 Ghi đè từ cũ (update)
     * ❌ Hủy bỏ

4. **Logic xử lý Import**
   - Parse JSON hỗ trợ 2 format
   - Validate: bắt buộc h, p, m
   - Detect trùng dựa trên Hán tự (h)
   - Phân loại newWords vs duplicateWords
   - Toast notification rõ ràng

5. **File mẫu**
   - `sample_import.json`: 10 từ cơ bản
   - `sample_with_duplicates.json`: Test trùng lặp
   - `IMPORT_JSON_GUIDE.md`: Hướng dẫn chi tiết
   - `CUSTOM_DECK_FEATURES.md`: Tổng quan tính năng

### 🔧 Sửa đổi

1. **index.html**
   - Thêm nút "📥 Nhập JSON"
   - Thêm 2 modal mới (Import & Duplicate)
   - Đổi load `app.main.js` → `app.js`
   - Tăng version cache v5 → v6

2. **app.js**
   - Merge `initImportJsonEvents()` vào `initCustomDeckEvents()`
   - Thêm các hàm:
     * `openImportJsonModal()`
     * `closeImportJsonModal()`
     * `parseImportedJson()`
     * `importJsonWords()`
     * `processJsonImport()`
     * `showDuplicateConfirmDialog()`
     * `handleSkipDuplicates()`
     * `handleOverwriteDuplicates()`
     * `closeDuplicateModal()`
   - Fix thứ tự event initialization

3. **styles.css**
   - CSS cho `#importJsonModal`
   - CSS cho `#duplicateConfirmModal`
   - Hover effects cho buttons
   - Light theme compatibility

### 🐛 Bug Fixes

1. **Sửa lỗi nút "📥 Nhập JSON" không hoạt động**
   - Nguyên nhân: HTML load `app.main.js` thay vì `app.js`
   - Giải pháp: Đổi script src sang `app.js`

2. **Merge duplicate event listeners**
   - Gộp `initImportJsonEvents` vào `initCustomDeckEvents`
   - Tránh duplicate `DOMContentLoaded` listeners

## Cách sử dụng

### Import từ file JSON
```bash
1. Vào "📝 Tự tạo"
2. Click "📥 Nhập JSON"
3. Chọn file hoặc paste JSON
4. Click "✅ Nhập từ vựng"
5. Nếu có trùng → chọn Skip hoặc Overwrite
```

### Import toàn bộ HSK1 (496 từ)
```bash
1. Mở file data_hsk1.json
2. Copy all (Ctrl+A, Ctrl+C)
3. Paste vào modal Import JSON
4. Import → Done! ✅
```

## Format JSON hỗ trợ

### Format 1: Array
```json
[
  {"h":"你好","p":"nǐhǎo","m":"Xin chào","e":"你好，我是学生。"},
  {"h":"谢谢","p":"xièxie","m":"Cảm ơn"}
]
```

### Format 2: Object
```json
{
  "HSK 1": [{"h":"爱","p":"ài","m":"Yêu"}],
  "Custom": [{"h":"学习","p":"xuéxí","m":"Học"}]
}
```

## Breaking Changes
- ⚠️ **HTML bây giờ load `app.js` thay vì `app.main.js`**
- Nếu bạn có customization trong `app.main.js`, cần merge sang `app.js`

## Files Changed

```
✏️ Modified:
  - index.html
  - app.js  
  - styles.css

📄 Created:
  - sample_import.json
  - sample_with_duplicates.json
  - IMPORT_JSON_GUIDE.md
  - CUSTOM_DECK_FEATURES.md
  - CHANGELOG_IMPORT_JSON.md
  - test_import.html (for debugging)
```

## Testing

### Test case 1: Import file mới
- [x] Upload sample_import.json → 10 từ added ✅

### Test case 2: Import có trùng
- [x] Upload sample_with_duplicates.json → Modal duplicate hiện ✅
- [x] Chọn "Skip" → Chỉ thêm từ mới ✅
- [x] Chọn "Overwrite" → Update từ cũ ✅
- [x] Chọn "Cancel" → Không import gì ✅

### Test case 3: Import invalid JSON
- [x] Paste invalid JSON → Toast error ✅

### Test case 4: Import empty
- [x] Submit without file/text → Toast warning ✅

## Known Issues
- Không có

## Next Steps (Optional)
- [ ] Thêm nút "Export ra JSON" để backup bộ từ
- [ ] Drag & drop file JSON
- [ ] Import từ URL
- [ ] Batch import nhiều file cùng lúc
- [ ] Preview từ trước khi import
- [ ] Undo/Redo sau import

## Credits
- Feature requested by: User
- Implemented by: AI Assistant
- Tested by: [Your name]

---

**Status:** ✅ Ready to use
**Version:** 1.0.0
