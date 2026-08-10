# Thiết kế giới hạn một lượt quay theo thiết bị

## Mục tiêu

- Người chơi không cần nhập mã tham gia.
- Mỗi trình duyệt được quay một lần trong mỗi chiến dịch.
- Admin có thể reset một thiết bị để thiết bị đó có đúng một lượt khả dụng.
- Reset giữ nguyên toàn bộ kết quả và lịch sử cũ.

## Giới hạn đã chấp nhận

Thiết bị được nhận diện bằng cookie cố định. Xóa cookie, dùng chế độ ẩn danh hoặc đổi trình duyệt sẽ được tính là thiết bị mới. Không dùng IP hoặc fingerprint trình duyệt để tránh khóa nhầm và thu thập dữ liệu không cần thiết.

## Kiến trúc

Tái sử dụng bảng `access_codes` làm nơi lưu cả dữ liệu mã cũ và thiết bị mới. Thêm cột `kind` với giá trị mặc định `code`; bản ghi được tạo tự động cho trình duyệt có `kind = 'device'`. Bảng `spins` tiếp tục liên kết qua `access_code_id`, nên không phải chuyển lịch sử quay hiện có.

Cookie thiết bị dùng tên riêng theo chiến dịch, chứa token đã ký với `campaignId`, `codeId` và thời hạn. Cookie có `HttpOnly`, `SameSite=Strict`, `Secure` trên HTTPS và thời hạn dài. Cookie thiếu hoặc không hợp lệ khiến server tạo một thiết bị mới.

## Luồng người chơi

1. Giao diện tải API chiến dịch.
2. Server kiểm tra cookie thiết bị của chiến dịch.
3. Nếu chưa có thiết bị hợp lệ, server tạo bản ghi `access_codes` loại `device` với `spins_limit = 1`, `spins_used = 0`, tạo nhãn như `TB-A1B2C3D4` và đặt cookie.
4. API trả chiến dịch, thiết bị hiện tại, số lượt còn lại và lịch sử của thiết bị.
5. Giao diện hiển thị nút **Quay ngay** khi còn lượt; không hiển thị form nhập mã.
6. Sau khi quay thành công, server tăng `spins_used`, giảm kho quà và lưu kết quả.
7. Khi hết lượt, giao diện hiển thị chính xác **“Bạn đã hết lượt quay.”** cùng lịch sử kết quả.

Giới hạn được kiểm tra lại trên server bằng cập nhật có điều kiện `spins_used < spins_limit`; việc bấm nhiều lần hoặc gửi request song song không được tạo thêm lượt hợp lệ.

## Luồng quản trị

Tab **Mã tham gia** đổi thành **Thiết bị**. Bỏ chức năng tạo mã, nhập CSV, khóa/mở mã và trường số lượt mặc định.

Danh sách thiết bị hiển thị:

- nhãn thiết bị rút gọn;
- thời điểm thiết bị được tạo;
- số lần đã quay;
- số lượt hiện còn;
- kết quả gần nhất nếu có;
- nút **Reset lượt**.

Reset thực hiện cập nhật `spins_limit = spins_used + 1`. Vì vậy thiết bị có đúng một lượt khả dụng và bấm reset nhiều lần trước khi quay không cộng dồn. Kết quả cũ, kho quà đã trao và lịch sử audit không bị thay đổi.

## API và dữ liệu

- API đọc chiến dịch tự tạo hoặc khôi phục phiên thiết bị và có thể trả `Set-Cookie`.
- API quay dùng thiết bị từ cookie thay cho phiên được cấp sau khi nhập mã.
- Xóa API claim mã tham gia vì không còn caller.
- Thêm API admin reset thiết bị, yêu cầu phiên admin và chỉ cập nhật bản ghi `kind = 'device'` thuộc chiến dịch tương ứng.
- API chi tiết chiến dịch trả danh sách thiết bị thay cho danh sách mã.
- Seed demo không tạo mã `MAYMAN2026`; trang chủ không quảng bá mã demo.
- Dữ liệu `kind = 'code'` cũ được giữ lại nhưng không xuất hiện trong giao diện thiết bị.

## Xử lý lỗi và bảo mật

- Token sai chiến dịch, hết hạn hoặc trỏ tới bản ghi không tồn tại được xem như chưa có thiết bị.
- Thiết bị không còn lượt nhận phản hồi xung đột và không bị trừ kho quà.
- Thiết bị hoặc phần thưởng vừa hết lượt do request cạnh tranh nhận thông báo có thể thử tải lại; không tạo kết quả trùng.
- Reset thiết bị không tồn tại trả `404`; request không có phiên admin trả `401`.
- Không lưu IP, fingerprint hoặc user-agent đầy đủ.

## Kiểm thử

- Thiết bị mới có đúng một lượt.
- Cùng cookie không thể quay lần hai.
- Cookie khác trong cùng chiến dịch được tính là thiết bị khác.
- Cùng cookie ở chiến dịch khác có một lượt riêng.
- Reset cấp đúng một lượt và không cộng dồn khi gọi lặp lại.
- Reset giữ nguyên lịch sử kết quả cũ.
- API và giao diện không còn yêu cầu mã tham gia.
- Admin chỉ thấy bản ghi `kind = 'device'` và có thể reset thiết bị được chọn.
- Lint, build và toàn bộ test hiện có tiếp tục chạy thành công.

## Ngoài phạm vi

- Chống lách bằng xóa cookie, chế độ ẩn danh hoặc trình duyệt khác.
- Nhận diện người dùng bằng tài khoản, IP hoặc fingerprint.
- Xóa hay hoàn kho kết quả cũ khi reset.
- Migration đổi tên hoàn toàn bảng `access_codes` và khóa ngoại `access_code_id`.
