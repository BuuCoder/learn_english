"""
Configuration settings for English Teacher AI
"""

import os
import secrets
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

# ==================== ENVIRONMENT DETECTION ====================
IS_PRODUCTION = os.getenv('FLASK_ENV') == 'production'

# ==================== SECRET KEY ====================
SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY or len(SECRET_KEY) < 32:
    if IS_PRODUCTION:
        raise ValueError("SECRET_KEY must be at least 32 characters in production!")
    SECRET_KEY = secrets.token_hex(32)

# ==================== SESSION SETTINGS ====================
SESSION_TIMEOUT = int(os.getenv('SESSION_TIMEOUT_HOURS', 24))

# ==================== SECURITY SETTINGS ====================
MAX_LOGIN_ATTEMPTS = int(os.getenv('MAX_LOGIN_ATTEMPTS', 5))
LOCKOUT_DURATION = int(os.getenv('LOCKOUT_DURATION_MINUTES', 30))
TOKEN_LIMIT_PER_USER = int(os.getenv('TOKEN_LIMIT_PER_USER', 100000))

# ==================== RATE LIMITS ====================
RATE_LIMIT_LOGIN = os.getenv('RATE_LIMIT_LOGIN', '10')
RATE_LIMIT_REGISTER = os.getenv('RATE_LIMIT_REGISTER', '5')
RATE_LIMIT_CHAT = os.getenv('RATE_LIMIT_CHAT', '60')
RATE_LIMIT_TTS = os.getenv('RATE_LIMIT_TTS', '200')  # Increased for TTS prefetch
RATE_LIMIT_DEFAULT = os.getenv('RATE_LIMIT_DEFAULT', '200')

# ==================== ALLOWED ORIGINS ====================
def get_allowed_origins():
    """Get allowed origins from environment"""
    origins = os.getenv('ALLOWED_ORIGINS', '')
    if origins:
        return [o.strip() for o in origins.split(',') if o.strip()]
    return []

ALLOWED_ORIGINS = get_allowed_origins()

if IS_PRODUCTION and not ALLOWED_ORIGINS:
    raise ValueError("ALLOWED_ORIGINS must be set in production! Example: ALLOWED_ORIGINS=https://yourdomain.com")

# ==================== DATABASE CONFIGURATION ====================
DB_TYPE = os.getenv('DB_TYPE', 'sqlite')
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '3306')
DB_NAME = os.getenv('DB_NAME', 'english_teacher')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')

def get_database_uri():
    if DB_TYPE == 'mysql':
        return f'mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4'
    return 'sqlite:///english_teacher.db'

DATABASE_URI = get_database_uri()

# ==================== API SETTINGS ====================
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# ==================== TOKEN LIMITS ====================
MAX_PROMPT_TOKENS = 8000
MAX_COMPLETION_TOKENS = 2000
