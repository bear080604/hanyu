# 📝 Tính năng Tự tạo bộ từ

## Các cách thêm từ vào bộ từ

### 1. 🔍 Tìm kiếm từ database
- Gõ Hán tự, Pinyin, hoặc nghĩa tiếng Việt
- Hệ thống tự động gợi ý từ HSK 1-6
- Click vào từ gợi ý → Click "➕ Thêm từ này"

**Ưu điểm:**
- ✅ Đầy đủ thông tin: Hán tự, Pinyin, nghĩa, ví dụ
- ✅ Chính xác, chuẩn HSK
- ✅ Nhanh chóng

---

### 2. 📝 Nhập thủ công
- Mở "Hoặc nhập thủ công" 
- Điền: Hán tự, Pinyin, Nghĩa, Ví dụ (optional)
- Click "➕ Thêm từ thủ công"

**Ưu điểm:**
- ✅ Tự do tạo từ riêng
- ✅ Phù hợp với từ không có trong HSK
- ✅ Có thể tự viết nghĩa theo cách hiểu của bạn

---

### 3. 📥 Nhập JSON (MỚI!)
- Click "📥 Nhập JSON"
- Tải file `.json` hoặc dán JSON trực tiếp
- Click "✅ Nhập từ vựng"

**Ưu điểm:**
- ✅ Nhập hàng loạt (10-500+ từ cùng lúc)
- ✅ Import từ file HSK có sẵn
- ✅ Dễ dàng share/backup bộ từ
- ✅ Hỗ trợ ghi đè từ cũ khi cần update

---

## Format JSON hỗ trợ

### Cơ bản (Array)
```json
[
  {
    "h": "你好",
    "p": "nǐhǎo",
    "m": "Xin chào",
    "e": "你好，我是学生。"
  }
]
```

### Nâng cao (Object với level)
```json
{
  "HSK 1": [
    {"h": "爱", "p": "ài", "m": "Yêu"}
  ],
  "Tự tạo": [
    {"h": "学习", "p": "xuéxí", "m": "Học"}
  ]
}
```

---

## Xử lý từ trùng

Khi import JSON có từ đã tồn tại:

| Lựa chọn | Hành động | Khi nào dùng |
|----------|-----------|--------------|
| ✅ **Chỉ thêm từ mới** | Bỏ qua từ trùng | Import file mới, không muốn mất dữ liệu cũ |
| 🔄 **Ghi đè từ cũ** | Update từ trùng | Muốn cập nhật nghĩa/ví dụ mới |
| ❌ **Hủy bỏ** | Không import | Cần kiểm tra lại JSON |

---

## Quản lý bộ từ

### Lưu bộ từ
- Click "💾 Lưu bộ từ"
- Đặt tên cho bộ từ
- Bộ từ được lưu vào "Lịch sử bộ từ đã lưu"

### Học bộ từ
- Click "🎯 Học ngay" (bộ từ hiện tại)
- Hoặc click "🎯 Học" ở lịch sử
- Chọn chế độ: Flashcard / Quiz / Cả hai

### Tải lại bộ từ
- Vào "Lịch sử bộ từ đã lưu"
- Click "📥 Tải lại" để chỉnh sửa

### Xóa bộ từ
- Click icon 🗑️ ở danh sách từ (xóa 1 từ)
- Click 🗑️ ở lịch sử (xóa cả bộ từ)

---

## Tips & Tricks

### 💡 Import toàn bộ HSK level
```bash
1. Mở data_hsk1.json
2. Copy tất cả
3. Nhập JSON → Paste → Nhập
4. ✅ Có ngay 496 từ HSK1!
```

### 💡 Backup bộ từ
```bash
1. Vào Console browser (F12)
2. Gõ: copy(JSON.stringify(localStorage))
3. Paste vào file .txt
4. Khi cần restore → import lại
```

### 💡 Share bộ từ với bạn
```bash
1. Lưu bộ từ
2. Export ra JSON
3. Gửi file cho bạn
4. Bạn import vào app của họ
```

---

## Keyboard Shortcuts

| Phím | Chức năng |
|------|-----------|
| `Enter` | Thêm từ thủ công (khi focus input) |
| `Esc` | Đóng modal |
| `↑` `↓` | Di chuyển trong gợi ý search |

---

## Giới hạn

- ⚠️ Tối đa ~1000 từ/bộ (để đảm bảo performance)
- ⚠️ File JSON tối đa 5MB
- ⚠️ Lịch sử lưu tối đa 50 bộ từ

---

## Troubleshooting

**Q: Không tìm thấy từ trong database?**
→ Dùng "Nhập thủ công" hoặc tự tạo JSON

**Q: Import JSON bị lỗi?**
→ Kiểm tra format, dùng JSONLint validate

**Q: Muốn merge nhiều bộ từ?**
→ Tải từng bộ ra → Gộp JSON → Import lại

**Q: Làm sao export bộ từ ra JSON?**
→ Hiện tại chưa có nút export, sẽ update sau!

---

Tạo ngay bộ từ riêng của bạn! 🚀
