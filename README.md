# Quay Vui

Ứng dụng vòng quay trúng thưởng chạy trên vinext và Cloudflare Workers, lưu dữ liệu lâu dài trong D1.

## Luồng người chơi

- Mở đường dẫn của một chiến dịch, không cần nhập mã.
- Trình duyệt nhận cookie thiết bị riêng cho chiến dịch.
- Mỗi thiết bị có một lượt quay ban đầu.
- Kết quả và lịch sử được lưu phía server.
- Xóa cookie, dùng ẩn danh hoặc trình duyệt khác được tính là thiết bị mới.

## Quản trị

- Đăng nhập bằng `ADMIN_PASSWORD`.
- Tạo, tạm dừng, kết thúc và nhân bản chiến dịch.
- Quản lý phần thưởng, xác suất, kho quà và kết quả bàn giao.
- Xem danh sách thiết bị và reset thiết bị được chọn về đúng một lượt khả dụng.

## Cấu hình

Tạo `.env` từ `.env.example` cho môi trường cục bộ:

```env
ADMIN_PASSWORD=replace-with-a-long-password
SESSION_SECRET=replace-with-at-least-32-random-characters
```

D1 được khai báo bằng binding `DB` trong `.openai/hosting.json`.

## Lệnh

```bash
npm install
npm run dev
npm run lint
npm test
npm run db:generate
```

Yêu cầu Node.js `>=22.13.0`.
