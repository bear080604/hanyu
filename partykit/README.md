# ⚡ Hanyu Arena - PartyKit Real-time WebSocket Server

Server WebSocket chuyên biệt cho tính năng Đấu trường (Hanyu Arena), chạy trên hạ tầng Cloudflare Edge (Durable Objects), độ trễ cực thấp (<20ms) và không bị ngủ đông.

---

## 🚀 1. Chạy thử nghiệm Local (Dev mode)

```bash
cd partykit
npm install
npm run dev
```

Server sẽ lắng nghe tại `http://127.0.0.1:1999`.

---

## 🌐 2. Deploy lên PartyKit Cloud (Miễn phí 100%)

Chỉ cần chạy lệnh sau từ thư mục `partykit`:

```bash
cd partykit
npx partykit deploy
```

* Lần đầu tiên chạy, trình duyệt sẽ tự mở trang **PartyKit Login**: bạn chỉ cần bấm **"Log in with GitHub"** (dùng tài khoản GitHub `bear080604` của bạn).
* Sau khi deploy thành công, PartyKit sẽ cấp cho bạn một domain dạng:
  ```
  hanyu-arena.bear080604.partykit.dev
  ```

---

## ⚙️ 3. Cấu hình trên Frontend

Frontend Hanyu đã được tích hợp sẵn cơ chế **Dual-Mode (WebSocket First + HTTP Polling Fallback)**:
* Mặc định kết nối tới domain PartyKit của bạn: `hanyu-arena.bear080604.partykit.dev`.
* Nếu muốn đổi domain khác hoặc test local, bạn có thể lưu vào localStorage của trình duyệt:
  ```javascript
  localStorage.setItem('wq_partykit_host', 'hanyu-arena.bear080604.partykit.dev');
  // Hoặc test local:
  localStorage.setItem('wq_partykit_host', '127.0.0.1:1999');
  ```
* Nếu WebSocket chưa bật hoặc mất mạng, frontend sẽ tự động chuyển sang HTTP Smart Polling trên Cloudflare Worker mà không làm gián đoạn ván chơi.
