# 🐼 Hệ thống Học Tiếng Trung HSK & Tự Tạo Bộ Từ

Ứng dụng web học từ vựng, viết chữ Hán và luyện ghép câu tiếng Trung hiện đại (SPA/MPA Hybrid), hỗ trợ **HSK 1–6** và **Bộ từ tự tạo đồng bộ Cloud (Cloudflare Workers + D1)**.

---

## 📂 1. Cấu trúc thư mục dự án (`D:\hanyu`)

```text
D:\hanyu\
├── index.html                  # Trang chủ (Dashboard, Chuỗi học tập, Danh sách cấp độ HSK)
├── styles.css                  # Toàn bộ hệ thống giao diện (Light/White mặc định + Dark Mode)
├── storage.js                  # Module WQStorage quản lý tiến độ, yêu thích, SRS trong localStorage
├── api-client.js               # Module WeiQuanAPI kết nối Cloudflare Workers API
├── profile.js                  # Module WQProfile hiển thị Modal Hồ sơ cá nhân & tiến độ
├── sw.js                       # Service Worker (Network-First + Offline Cache fallback)
├── manifest.json               # Cấu hình PWA & Icons
├── logo.png / logo-light.png   # Logo Gấu Trúc bản Sáng (512x512 PNG)
├── logo-dark.png               # Logo Gấu Trúc bản Tối phát sáng Neon (512x512 PNG)
│
├── data/
│   ├── data.js                 # Dữ liệu HSK (DATA) + Ngân hàng câu ví dụ (window.WQ_SENTENCE_BANK)
│   └── hsk_1.json ...          # Dữ liệu JSON gốc theo từng cấp độ HSK
│
├── pages/                      # Các trang chức năng chính
│   ├── arena.html              # 🏆 Đấu trường thi đấu Kahoot thời gian thực (Host & Player)
│   ├── flash.html              # Học Flashcard 3D lật thẻ + Autoplay
│   ├── quiz.html               # Trắc nghiệm 6 chế độ (Hán, Pinyin, Nghĩa, Nghe)
│   ├── sentence.html           # 🧩 Ghép câu (Sắp xếp từ) & Hoàn thiện câu (Điền từ vào chỗ trống)
│   ├── write.html              # Tập viết nét chữ Hán (HanziWriter)
│   ├── custom.html             # Tự tạo bộ từ + Nhập JSON thông minh + Lịch sử bộ từ Cloud
│   ├── stats.html              # Thống kê học tập & SRS
│   ├── favorites.html          # Danh sách từ vựng yêu thích
│   └── settings.html           # Cài đặt giao diện Sáng/Tối, tốc độ Autoplay, xóa tiến độ
│
├── js/                         # Logic điều khiển từng trang (Plain JS, không dùng bundler)
│   ├── layout.js               # Inject Sidebar + Header + Nút gạt Sáng/Tối + Favicon động
│   ├── shared.js               # State toàn cục (AppState), TTS phát âm, Tìm kiếm, Theme, Enrich câu
│   ├── arena.js                # Game Engine Đấu Trường Hanyu, Web Audio SFX, 5-Phase Lifecycle
│   ├── flash.js                # Logic trang Flashcard (pages/flash.html)
│   ├── quiz.js                 # Logic trang Trắc nghiệm (pages/quiz.html)
│   ├── sentence.js             # Logic trang Ghép câu & Điền từ + Tooltip từ vựng + Chấm xanh/đỏ từng từ
│   ├── write.js                # Logic trang Tập viết chữ Hán (pages/write.html)
│   ├── custom.js               # Logic trang Tự tạo bộ từ & Form nhập JSON (pages/custom.html)
│   ├── stats.js                # Logic trang Thống kê (pages/stats.html)
│   ├── favorites.js            # Logic trang Yêu thích (pages/favorites.html)
│   └── settings.js             # Logic trang Cài đặt (pages/settings.html)
│
├── backend/                    # Cloudflare Workers + D1 SQLite Backend
│   ├── src/index.js            # REST API (/api/vocabulary, /api/decks, /api/search, ...)
│   ├── schema.sql              # Schema cơ sở dữ liệu D1
│   ├── migrate_alter_custom_deck_words.sql
│   └── migrate_custom_deck_sentences.sql
│
└── tools/
    └── convert_data.py         # Script tổng hợp data/*.json thành data/data.js (bảo toàn WQ_SENTENCE_BANK)
```

---

## 🧠 2. Kiến trúc Frontend & Luồng hoạt động

### 2.1. Thứ tự nạp Script chuẩn trên mọi trang `.html`
Mỗi trang trong `pages/*.html` (hoặc `index.html`) nạp các file script theo đúng thứ tự sau:
1. `data/data.js` — Nạp biến toàn cục `DATA` và `window.WQ_SENTENCE_BANK`.
2. `js/layout.js` *(không `defer`)* — Chạy ngay lập tức để:
   - Áp dụng class `light-theme` lên `<html>` dựa theo `localStorage.getItem('wq_theme_mode')` (mặc định là `'light'`).
   - Dựng khung giao diện chung (`Sidebar` + `Header` + `#themeBtn` + Logo Gấu Trúc Sáng/Tối `.logo-img-light` / `.logo-img-dark` + Favicon động).
   - Đưa nội dung trong `#page-main-content` của từng trang vào `<main id="page-main">`.
3. `storage.js`, `api-client.js`, `profile.js` *(có `defer`)*.
4. `js/shared.js` *(có `defer`)* — Khởi tạo `window.AppState`, thanh tìm kiếm toàn cục, phát âm TTS (`speak()`), đồng bộ dữ liệu từ API và hàm `window.enrichWordWithSentence(word)`.
5. `js/<ten-trang>.js` *(có `defer`)* — Logic riêng của trang hiện tại.

### 2.2. Các khóa `localStorage` quan trọng
| Key | Ý nghĩa |
| :--- | :--- |
| `wq_theme_mode` / `wq_theme` | Chế độ giao diện: `'light'` (mặc định) hoặc `'dark'` |
| `wq_progress` | Tiến độ học (`{ level, rangeIndex, fcIdx, wIdx, learned: [...] }`) |
| `wq_favorites` | Danh sách các từ vựng đã đánh dấu yêu thích (`[{ h, p, m, ... }]`) |
| `wq_srs` | Dữ liệu ôn tập ngắt quãng Spaced Repetition theo chữ Hán |
| `wq_custom_decks` | Danh sách các bộ từ tự tạo đã lưu (`[{ id, cloudId, name, words, wordCount, createdAt }]`) |
| `wq_custom_sentences` | Từ điển câu ví dụ do người dùng tự thêm/nhập JSON (`{ "汉字": { ex, exp, exm, p, m } }`) |
| `wq_pending_deck` | Bộ từ tạm thời khi chuyển hướng học giữa `custom.html` → `flash.html` / `quiz.html` / `sentence.html` |
| `wq_pending_mode` | Chế độ học đang chờ (`'flashcard'`, `'quiz'`, `'sentence'`, hoặc `'both'` cho lộ trình 3 bước) |
| `WQ_ARENA_HOST_ROOMS` | Danh sách metadata các phòng đấu do Host quản lý (`[{ pin, title, mode, qCount, ... }]`) |
| `WQ_ARENA_ROOM_<PIN>` | Trạng thái chi tiết phòng đấu: danh sách câu hỏi, pha hiện tại, bảng điểm |
| `WQ_ARENA_PLAYER_PROFILE` | Hồ sơ tạm của người chơi trong Đấu trường (`{ name, avatar }`) |

---

## 📋 3. Chuẩn dữ liệu Từ vựng & Form Nhập JSON (`custom.js`)

### 3.1. Cấu trúc chuẩn của 1 đối tượng từ vựng (`Word Object`)
```json
{
  "h": "老师",
  "p": "lǎoshī",
  "m": "Giáo viên",
  "ex": "王老师教我们汉语。",
  "exp": "Wáng lǎoshī jiāo wǒmen Hànyǔ.",
  "exm": "Thầy Vương dạy chúng tôi tiếng Trung.",
  "tokens": [
    { "h": "王老师", "p": "Wáng lǎoshī", "m": "Thầy Vương" },
    { "h": "教", "p": "jiāo", "m": "dạy" },
    { "h": "我们", "p": "wǒmen", "m": "chúng tôi" },
    { "h": "汉语", "p": "Hànyǔ", "m": "tiếng Trung" }
  ],
  "blank": "老师",
  "options": ["老师", "学生", "朋友", "医生"]
}
```
- `h` *(bắt buộc)*: Chữ Hán (hỗ trợ cả các alias: `hanzi`, `word`, `char`, `zh`, `chinese`).
- `p`: Phiên âm Pinyin (alias: `pinyin`, `py`). Nếu bỏ trống, hệ thống tự tra trong `DATA` & `WQ_SENTENCE_BANK`.
- `m`: Nghĩa tiếng Việt (alias: `meaning`, `mean`, `vi`, `vn`, `translation`).
- `ex`: Câu ví dụ tiếng Trung dùng cho cả Flashcard và phần **🧩 Ghép câu & Điền từ** (alias: `e`, `example`, `sentence`, `s`). Có thể dùng dấu `/` trong `ex` (ví dụ `"王老师 / 教 / 我们 / 汉语。"`) để chỉ định chỗ cắt từ nhanh.
- `exp`: Pinyin của câu ví dụ (alias: `ep`, `example_pinyin`, `sentence_pinyin`).
- `exm`: Nghĩa tiếng Việt của câu ví dụ (alias: `em`, `example_meaning`, `sentence_meaning`, `example_vi`).
- `tokens` *(tùy chọn)*: Mảng quy định sẵn các mảnh từ để ghép câu (`arrange`) kèm Pinyin `p` và Nghĩa `m` cho từng mảnh (dùng khi trỏ chuột hiện Tooltip). Nếu không truyền `tokens`, `sentence.js` tự động tách câu bằng `segmentChineseSentence()`.
- `blank` & `options` *(tùy chọn)*: Từ cần đục lỗ và 4 phương án trắc nghiệm cho chế độ Điền từ (`fill`). Nếu không truyền, hệ thống tự đục lỗ từ `h` và tự lấy 3 từ khác trong bộ từ làm phương án nhiễu.
- `examples` *(hoặc `sentences` — tùy chọn)*: Mảng chứa nhiều câu ví dụ khác nhau cho cùng 1 từ (`[{ ex, exp, exm, tokens, blank, options }, ...]`). Khi vào lượt học (hoặc khi làm sai và gặp lại từ đó trong cùng turn học), hệ thống tự động **random câu ví dụ khác nhau** (không lặp lại câu vừa ra). Ngoài ra cũng có thể viết tắt nhiều câu ngăn cách bằng dấu `||` ngay trong `ex`, `exp`, `exm`, hoặc lặp lại nhiều object cùng từ `h` trong JSON để hệ thống tự gộp.

### 3.2. Các định dạng đầu vào mà Form Nhập JSON hỗ trợ
Form **📥 Nhập JSON** tại `pages/custom.html` (`js/custom.js`) tự động làm sạch lỗi cú pháp (xóa markdown ```` ```json ````, xóa dấu phẩy thừa ở cuối mảng/object, bỏ BOM) và hỗ trợ 5 định dạng:
1. **Mảng các object từ vựng chuẩn**: `[{"h": "...", "p": "...", "m": "...", "ex": "...", "exp": "...", "exm": "..."}]`
2. **Object kèm tên bộ từ**: `{"name": "Bài 11", "words": [...]}` (tự động điền tên bộ từ vào ô `Tên bộ từ`).
3. **Object theo cấp độ/bài học (`data.js` format)**: `{"Bài 11": [...]}`
4. **Object đơn lẻ 1 từ**: `{"h": "...", "p": "...", "m": "..."}`
5. **Mảng chuỗi chữ Hán nhanh**: `["你好", "老师", "学习"]` — tự động tra cứu Pinyin, Nghĩa và Câu ví dụ từ kho dữ liệu.

---

## 🧩 4. Tính năng Ghép câu & Hoàn thiện câu (`pages/sentence.html`, `js/sentence.js`)

1. **Ba chế độ luyện tập**:
   - `arrange` (**🧩 Sắp xếp câu**): Tách câu tiếng Trung thành các mảnh từ (word tiles) dựa trên thuật toán tách từ Maximum Forward Matching (`segmentChineseSentence`).
   - `fill` (**✍️ Hoàn thiện câu**): Đục lỗ từ mục tiêu trong câu và tạo 4 đáp án trắc nghiệm.
   - `mix` (**🔀 Kết hợp cả hai**): Xen kẽ tự động giữa sắp xếp câu và điền từ.
2. **Kiểm tra đúng/sai từng vị trí từ (Green / Red Tile Feedback)**:
   - Khi bấm **Kiểm tra** ở chế độ Sắp xếp câu, từng mảnh từ ở vị trí `1..N` được tô màu riêng biệt:
     - **Xanh lá (`.s-tile-correct`)**: Từ đã đặt đúng vị trí.
     - **Đỏ (`.s-tile-wrong`)**: Từ đặt sai vị trí.
   - Bấm vào từ màu đỏ hoặc nút **"🔄 Xếp lại từ sai"** sẽ giữ nguyên các từ đúng màu xanh ở đầu câu và chỉ đưa các từ sai về lại kho từ để xếp tiếp.
3. **Tooltip tra từ thông minh (`#sFloatingTooltip`)**:
   - Trỏ chuột (trên máy tính) hoặc chạm (trên điện thoại) vào bất kỳ mảnh từ hoặc từ ngữ cảnh nào trong câu để xem ngay **Chữ Hán + Pinyin + Nghĩa tiếng Việt** (`lookupTokenInfo` kết hợp từ điển đơn từ, từ ghép `COMPOUND_DICT` và `DATA`).

---

## 🎨 5. Giao diện Sáng / Tối (`.light-theme`) & Cache (`sw.js`)

1. **Nguyên tắc CSS**:
   - Luôn dùng biến CSS (`var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`, `var(--glass-bg)`, `var(--glass-border)`) thay vì hardcode `color: #fff` (chỉ dùng `color: #fff` trên các nút có nền `var(--accent-gradient)`).
   - Mọi quy tắc ghi đè cho giao diện Sáng nằm dưới selector `:root.light-theme` trong `styles.css`.
   - Hàm `window.toggleAppTheme()` trong `js/shared.js` điều khiển nút gạt `#themeBtn` (Header) và `#settingsThemeBtn` (Settings), tự động cập nhật Favicon và vẽ lại nét chữ HanziWriter (`renderWriter()`).
2. **Lưu ý khi chỉnh sửa code (Service Worker Cache)**:
   - Khi cập nhật HTML/CSS/JS, hãy tăng hằng số `CACHE_NAME` trong `sw.js` (ví dụ `'wenqing-v7'` → `'wenqing-v8'`) và thêm tên cache cũ vào danh sách xóa trong `js/layout.js` để trình duyệt cập nhật ngay lập tức.

---

## 🏆 6. Đấu Trường Hanyu Arena (`pages/arena.html`, `js/arena.js`)

Chế độ thi đấu đối kháng từ vựng tiếng Trung theo thời gian thực mô phỏng phong cách **Kahoot**:
1. **Chu trình 5 Pha tự động (Autonomous 5-Phase Lifecycle):**
   - **Phase 1 (Get Ready - 3s):** Hiện câu hỏi chữ Hán, phát âm TTS, ẩn 4 đáp án.
   - **Phase 2 (Answering):** 4 đáp án màu sắc (Đỏ, Xanh dương, Vàng, Xanh lá) mở đồng thời, tính điểm tốc độ và chuỗi thắng (Streak).
   - **Phase 3 (Smart Cut-off):** Tự động khóa câu trả lời khi người chơi nộp bài, tự ngắt giờ sớm khi 100% người chơi đã nộp bài.
   - **Phase 4 (Reveal & Stats - 4s):** Bật sáng đáp án đúng, hiện biểu đồ thống kê A/B/C/D ở Host; đổi màu toàn màn hình ở Player.
   - **Phase 5 (Full Leaderboard - 4s):** Hiện Bảng xếp hạng điểm số đầy đủ, tự động đếm lùi sang câu kế tiếp mà **không cần Admin bấm chuột thủ công**.
2. **Cơ chế 2 Chế độ phòng:**
   - **Công khai (Public):** Hiện danh sách phòng tại sảnh chờ. Người chơi có thể vào thi đấu tự do hoặc bấm **"Bắt đầu thi đấu ngay ➔" (Solo Play)** để tự luyện tập một mình mà không cần chờ Admin.
   - **Riêng tư (Private):** Bảo vệ bằng mã PIN 6 số hoặc QR Code. Kiểm tra tính hợp lệ nghiêm ngặt, từ chối và báo lỗi nếu nhập bừa mã không tồn tại.
3. **Đồng bộ Sẵn sàng & Đếm ngược 3-2-1:**
   - Người chơi bấm **"Sẵn sàng thi đấu"** để báo hiệu cho Admin.
   - Admin bấm **"Bắt đầu trận đấu"** kích hoạt đếm ngược `3... 2... 1...` hoàn toàn đồng bộ giữa Host và tất cả Player thông qua cơ chế bù lệch đồng hồ mạng (`clockSkewCompensation`).
4. **Bảo lưu & Chống trùng lặp điểm:**
   - Ràng buộc duy nhất 1 Nickname cho mỗi người chơi trong 1 phòng.
   - Khi thoát ra và vào lại cùng một tên, hệ thống tự động nhận diện và cập nhật mốc điểm cao nhất (`Math.max(oldScore, newScore)`), không sinh ra nhiều dòng trùng tên.
5. **Tiêu chuẩn tương phản cao (High-Contrast WCAG AA):**
   - Đảm bảo hiển thị sắc nét trên cả Light Theme và Dark Theme, khắc phục triệt để tình trạng chữ trắng trên nền sáng hoặc chữ xanh tối trên nền đen.

👉 *Xem chi tiết đầy đủ về kiến trúc, State Machine và Web Audio SFX tại tài liệu riêng: [ARENA.md](ARENA.md).*

---

## 🚀 7. Chạy thử nghiệm Local & Công cụ dữ liệu

```bash
# Chạy máy chủ tĩnh tại thư mục gốc D:\hanyu
python -m http.server 8000
# Mở trình duyệt tại: http://localhost:8000
```

```bash
# Cập nhật lại data/data.js từ các file JSON trong data/ (vẫn giữ nguyên WQ_SENTENCE_BANK)
python tools/convert_data.py
```
