# 📥 Hướng dẫn nhập từ vựng bằng JSON

## Tính năng mới

Phần **Tự tạo bộ từ** hiện đã hỗ trợ **nhập hàng loạt từ vựng bằng JSON**!

---

## Cách sử dụng

1. Vào mục **"📝 Tự tạo"** trên sidebar
2. Click nút **"📥 Nhập JSON"**
3. Chọn 1 trong 2 cách:
   - **Tải file JSON** lên
   - **Dán JSON** trực tiếp vào ô textarea

4. Click **"✅ Nhập từ vựng"**

---

## Định dạng JSON hỗ trợ

### Format 1: Array đơn giản (Khuyên dùng)

```json
[
  {
    "h": "你好",
    "p": "nǐhǎo",
    "m": "Xin chào",
    "e": "你好，我是学生。"
  },
  {
    "h": "谢谢",
    "p": "xièxie",
    "m": "Cảm ơn"
  }
]
```

**Giải thích:**
- `h` = Hán tự (bắt buộc)
- `p` = Pinyin (bắt buộc)
- `m` = Nghĩa tiếng Việt (bắt buộc)
- `e` hoặc `ex` = Ví dụ (không bắt buộc)

---

### Format 2: Object có key level

```json
{
  "HSK 1": [
    {"h": "爱", "p": "ài", "m": "Yêu"},
    {"h": "八", "p": "bā", "m": "Số tám"}
  ],
  "HSK 2": [
    {"h": "班", "p": "bān", "m": "Lớp học"}
  ]
}
```

**Lưu ý:** Tất cả từ từ mọi level sẽ được gộp vào 1 bộ từ.

---

## File mẫu

File `sample_import.json` là ví dụ có 10 từ vựng cơ bản, bạn có thể dùng để test.

---

## Xử lý từ trùng lặp

Khi import JSON có chứa từ đã tồn tại trong danh sách, hệ thống sẽ hiển thị **modal xác nhận** với 3 lựa chọn:

### 1. ✅ Chỉ thêm từ mới
- Chỉ thêm các từ chưa có trong danh sách
- Bỏ qua tất cả từ trùng lặp
- **Không thay đổi** từ cũ

### 2. 🔄 Ghi đè từ cũ
- Thêm các từ mới
- **Cập nhật/ghi đè** các từ trùng lặp bằng version mới
- Hữu ích khi bạn muốn update nghĩa hoặc ví dụ

### 3. ❌ Hủy bỏ
- Không import gì cả
- Quay lại modal nhập JSON để chỉnh sửa

**Ví dụ:**
```
Bạn có 5 từ trong danh sách: 你好, 谢谢, 再见, 对不起, 没关系
Import JSON có 8 từ: 你好 (updated), 学习, 谢谢 (updated), 老师, 朋友, 晚安, 请, 是

→ Modal hiển thị:
  ✅ 6 từ mới: 学习, 老师, 朋友, 晚安, 请, 是
  ⚠️ 2 từ trùng: 你好, 谢谢

→ Nếu chọn "Chỉ thêm từ mới": Thêm 6 từ, giữ nguyên 你好 và 谢谢 cũ
→ Nếu chọn "Ghi đè": Thêm 6 từ, update 你好 và 谢谢 thành version mới
```

---

## Lưu ý

- Hệ thống sẽ **tự động phát hiện** các từ trùng dựa trên Hán tự (trường `h`)
- Hiển thị **so sánh** giữa version cũ và mới
- Chỉ các từ có đủ **h, p, m** mới được import
- JSON phải hợp lệ (dùng [JSONLint](https://jsonlint.com/) để kiểm tra nếu cần)

---

## Ví dụ sử dụng

### Scenario 1: Import từ data_hsk1.json

1. Mở file `data_hsk1.json` (hoặc `data_hsk2.json`)
2. Copy toàn bộ nội dung
3. Dán vào modal "Nhập JSON"
4. Click "✅ Nhập từ vựng"
5. ✅ Tất cả từ HSK1 (496 từ) hoặc HSK2 (770 từ) sẽ được thêm!

### Scenario 2: Tạo bộ từ riêng từ file Excel

1. Export Excel thành CSV
2. Dùng tool online convert CSV → JSON
3. Upload/paste JSON vào app
4. Hoàn thành!

### Scenario 3: Update từ đã có

1. Sửa file JSON với từ cũ nhưng nghĩa mới
2. Import vào app
3. Chọn "🔄 Ghi đè từ cũ"
4. ✅ Từ cũ được cập nhật!

---

## File mẫu

- `sample_import.json`: 10 từ vựng cơ bản để test
- `sample_with_duplicates.json`: File có từ trùng để test chức năng ghi đè

---

## Troubleshooting

**Q: JSON bị lỗi "không hợp lệ"?**
- Kiểm tra syntax: dấu `,` cuối, dấu `"` đóng/mở
- Dùng [JSONLint](https://jsonlint.com/) để validate

**Q: Import xong nhưng chỉ có vài từ?**
- Kiểm tra xem các từ còn lại có đủ trường `h`, `p`, `m` không

**Q: Muốn import từ nhiều file?**
- Import file 1 → import file 2 → tất cả sẽ gộp chung

---

## Contact

Nếu có vấn đề gì, hãy tạo issue trên GitHub! 🚀
