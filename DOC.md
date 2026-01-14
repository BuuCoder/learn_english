# 📚 Tài liệu chức năng - English Teacher AI

## Tổng quan

English Teacher AI là ứng dụng học tiếng Anh với trợ lý AI "Teacher Da Vinci", hỗ trợ:
- Chat học tiếng Anh real-time
- Text-to-Speech đa ngôn ngữ (Việt/Anh)
- Lưu từ vựng cá nhân
- Quản lý hội thoại

---

## 1. Hệ thống Authentication

### 1.1 Đăng ký (`/api/register`)
- **Method:** POST
- **Yêu cầu mật khẩu:**
  - Tối thiểu 12 ký tự
  - Ít nhất 1 chữ hoa, 1 chữ thường, 1 số, 1 ký tự đặc biệt
- **Rate limit:** 5 requests/phút

### 1.2 Đăng nhập (`/api/login`)
- **Method:** POST
- **Bảo mật:**
  - Khóa tài khoản sau 5 lần đăng nhập thất bại (30 phút)
  - Session timeout: 24 giờ (có thể cấu hình)
- **Rate limit:** 10 requests/phút

### 1.3 Đăng xuất (`/api/logout`)
- **Method:** POST
- **Yêu cầu:** Đã đăng nhập + CSRF token

### 1.4 Thông tin user (`/api/me`)
- **Method:** GET
- **Response:** username, email, token usage

---

## 2. Chat với AI

### 2.1 Gửi tin nhắn (`/chat`)
- **Method:** POST (Server-Sent Events)
- **Tính năng:**
  - Streaming response real-time
  - Tự động tách ngôn ngữ Việt/Anh
  - Đề xuất hành động sau mỗi câu trả lời
  - Ước tính và tracking token usage
- **Rate limit:** 60 requests/phút
- **Giới hạn:** 5000 ký tự/tin nhắn

### 2.2 Format response AI
```
[Vietsub] Nội dung tiếng Việt
[Engsub] English content
[Actions] action1 | action2 | action3
```

---

## 3. Quản lý Conversation

### 3.1 Danh sách (`/api/conversations`)
- **GET:** Lấy tất cả conversations
- **POST:** Tạo conversation mới

### 3.2 Chi tiết (`/api/conversations/<id>`)
- **GET:** Lấy conversation với messages
- **DELETE:** Xóa mềm (có thể hoàn tác trong 15 giây)

### 3.3 Đổi tên (`/api/conversations/<id>/rename`)
- **Method:** PUT
- **Body:** `{ "title": "Tên mới" }`

### 3.4 Khôi phục (`/api/conversations/restore`)
- **Method:** POST
- **Body:** `{ "id": "conversation_id" }`
- **Giới hạn:** Trong vòng 15 giây sau khi xóa

---

## 4. Từ vựng (Vocabulary)

### 4.1 Danh sách (`/api/vocabularies`)
- **GET:** Lấy tất cả từ vựng của user
- **POST:** Thêm từ mới
  ```json
  { "word": "hello", "note": "xin chào" }
  ```

### 4.2 Cập nhật (`/api/vocabularies/<id>`)
- **PUT:** Sửa từ/ghi chú
- **DELETE:** Xóa từ

### 4.3 Tính năng UI
- Bôi đen từ tiếng Anh trong chat → Popup "Lưu từ vựng"
- Tìm kiếm từ vựng
- Click vào từ để nghe phát âm

---

## 5. Text-to-Speech (TTS)

### 5.1 Phát âm đoạn text (`/tts`)
- **Method:** POST
- **Body:** `{ "text": "Hello", "lang": "en" }`
- **Ngôn ngữ:** `vi` (Việt), `en` (Anh)
- **Rate limit:** 60 requests/phút

### 5.2 Phát âm segment (`/tts/single`)
- Tương tự `/tts`, dùng cho từng segment

### 5.3 Cấu hình giọng đọc (`/voices`)
- **GET:** Danh sách giọng có sẵn
- **POST:** Đổi giọng đọc (lưu per-user trong session)

**Giọng có sẵn:**
| Ngôn ngữ | Giọng |
|----------|-------|
| Tiếng Việt | Hoài My (Nữ), Nam Minh (Nam) |
| Tiếng Anh US | Jenny (Nữ), Guy (Nam), Aria (Nữ) |
| Tiếng Anh UK | Sonia (Nữ), Ryan (Nam) |

---

## 6. Bảo mật

### 6.1 CSRF Protection
- Tất cả API POST/PUT/DELETE yêu cầu CSRF token
- Lấy token: `GET /api/csrf-token`
- Gửi trong header: `X-CSRFToken`

### 6.2 Rate Limiting
| Endpoint | Giới hạn |
|----------|----------|
| Login | 10/phút |
| Register | 5/phút |
| Chat | 60/phút |
| TTS | 60/phút |
| Mặc định | 200/giờ |

### 6.3 CORS (Production)
- Chỉ cho phép domain trong `ALLOWED_ORIGINS`
- Block tất cả request từ domain khác

### 6.4 Security Logging
- Log file: `logs/security.log`
- Events: login thất bại, account locked, rate limit, blocked origins

---

## 7. Token System

### 7.1 Giới hạn
- Mặc định: 100,000 tokens/user
- Cấu hình: `TOKEN_LIMIT_PER_USER` trong `.env`

### 7.2 Tracking
- Mỗi tin nhắn chat tính token (prompt + completion)
- Hiển thị usage trong UI
- Block khi hết token

---

## 8. API Response Format

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "error": "Mô tả lỗi"
}
```

### HTTP Status Codes
| Code | Ý nghĩa |
|------|---------|
| 200 | Thành công |
| 400 | Bad request |
| 401 | Chưa đăng nhập |
| 403 | Không có quyền / Account locked |
| 404 | Không tìm thấy |
| 429 | Rate limit exceeded |
| 500 | Server error |

---

## 9. Health Check

### Endpoint (`/health`)
- **Method:** GET
- **Response:** `{ "status": "healthy", "timestamp": "..." }`
- **Dùng cho:** Load balancer, monitoring

---

## 10. Database Schema

### Users
| Field | Type | Mô tả |
|-------|------|-------|
| id | INT | Primary key |
| username | VARCHAR(80) | Unique |
| email | VARCHAR(120) | Unique |
| password_hash | VARCHAR(256) | Bcrypt hash |
| total_tokens_used | INT | Token đã dùng |
| token_limit | INT | Giới hạn token |
| failed_login_attempts | INT | Số lần login thất bại |
| locked_until | DATETIME | Thời điểm hết khóa |
| is_active | BOOLEAN | Trạng thái tài khoản |

### Conversations
| Field | Type | Mô tả |
|-------|------|-------|
| id | UUID | Primary key |
| user_id | INT | Foreign key → Users |
| title | VARCHAR(200) | Tiêu đề |
| total_tokens | INT | Tổng token |
| is_deleted | BOOLEAN | Soft delete |
| deleted_at | DATETIME | Thời điểm xóa |

### Messages
| Field | Type | Mô tả |
|-------|------|-------|
| id | INT | Primary key |
| conversation_id | UUID | Foreign key |
| role | VARCHAR(20) | user/assistant |
| content | TEXT | Nội dung |
| status | VARCHAR(20) | pending/completed/cancelled |
| prompt_tokens | INT | Token prompt |
| completion_tokens | INT | Token completion |

### Vocabularies
| Field | Type | Mô tả |
|-------|------|-------|
| id | INT | Primary key |
| user_id | INT | Foreign key |
| word | VARCHAR(200) | Từ vựng |
| note | TEXT | Ghi chú/nghĩa |
