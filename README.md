# 🎓 English Teacher AI

Ứng dụng học tiếng Anh với AI, tích hợp DeepSeek API và Text-to-Speech.

## Yêu cầu hệ thống

- Python 3.10+
- MySQL 8.0+ (hoặc SQLite cho development)
- DeepSeek API Key

## Cài đặt nhanh

### 1. Clone và cài dependencies

```bash
git clone <repo-url>
cd english-teacher

# Tạo virtual environment
python -m venv venv

# Kích hoạt (Windows)
venv\Scripts\activate

# Kích hoạt (Linux/Mac)
source venv/bin/activate

# Cài dependencies
pip install -r requirements.txt
```

### 2. Cấu hình môi trường

```bash
cp .env.example .env
```

Chỉnh sửa file `.env`:

```env
# API Key (bắt buộc)
DEEPSEEK_API_KEY=your_api_key_here

# Database
DB_TYPE=sqlite                    # hoặc mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=english_teacher
DB_USER=root
DB_PASSWORD=your_password

# Security
SECRET_KEY=your-secret-key-min-32-chars
FLASK_ENV=development             # hoặc production

# Production only
ALLOWED_ORIGINS=https://yourdomain.com
```

### 3. Khởi tạo database

```bash
# Chạy migrations
flask db upgrade
```

### 4. Chạy ứng dụng

```bash
# Development
flask run

# Hoặc
python app.py
```

Truy cập: http://localhost:5000

## Cấu hình Production

Xem chi tiết tại [DEPLOY.md](DEPLOY.md)

**Checklist bắt buộc:**
- [ ] `FLASK_ENV=production`
- [ ] `SECRET_KEY` >= 32 ký tự ngẫu nhiên
- [ ] `ALLOWED_ORIGINS` chỉ chứa domain của bạn
- [ ] SSL/HTTPS
- [ ] MySQL thay vì SQLite

## Cấu trúc thư mục

```
english-teacher/
├── app.py              # Main application
├── models.py           # Database models
├── requirements.txt    # Dependencies
├── .env.example        # Environment template
├── migrations/         # Database migrations
├── static/
│   ├── css/main.css
│   └── js/app.js
├── templates/
│   ├── index.html
│   ├── login.html
│   └── register.html
└── logs/               # Security logs (auto-created)
```

## Lệnh hữu ích

```bash
# Tạo migration mới
flask db migrate -m "description"

# Áp dụng migrations
flask db upgrade

# Rollback migration
flask db downgrade

# Tạo secret key
python -c "import secrets; print(secrets.token_hex(32))"
```

## License

MIT
