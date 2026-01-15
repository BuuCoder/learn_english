"""
Security utilities - validation, sanitization, logging
"""

import os
import re
import uuid
import bleach
import logging
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler
from flask_limiter.util import get_remote_address

from config import MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION


# ==================== SECURITY LOGGING ====================

def setup_security_logging():
    """Setup security event logging"""
    if not os.path.exists('logs'):
        os.makedirs('logs')
    
    security_handler = RotatingFileHandler(
        'logs/security.log',
        maxBytes=10485760,  # 10MB
        backupCount=10
    )
    security_handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s'
    ))
    
    security_logger = logging.getLogger('security')
    security_logger.setLevel(logging.INFO)
    security_logger.addHandler(security_handler)
    
    return security_logger


# Initialize security logger
if os.getenv('SECURITY_LOGGING', 'true').lower() == 'true':
    security_logger = setup_security_logging()
else:
    security_logger = logging.getLogger('security')
    security_logger.addHandler(logging.NullHandler())


def log_security_event(event_type, message, user_id=None, ip=None):
    """Log security events"""
    ip = ip or get_remote_address()
    user_info = f"user_id={user_id}" if user_id else "anonymous"
    security_logger.info(f"[{event_type}] {message} | {user_info} | ip={ip}")


# ==================== INPUT SANITIZATION ====================

def sanitize_input(text, max_length=10000):
    """Sanitize user input to prevent XSS and injection"""
    if not text:
        return ""
    text = str(text).strip()
    text = text[:max_length]
    text = text.replace('\x00', '')
    # Remove control characters
    text = ''.join(char for char in text if ord(char) >= 32 or char in '\n\r\t')
    return text


def sanitize_html(text):
    """Remove all HTML tags"""
    if not text:
        return ""
    return bleach.clean(text, tags=[], strip=True)


# ==================== VALIDATION ====================

def validate_uuid(uuid_string):
    """Validate UUID format"""
    try:
        uuid.UUID(str(uuid_string))
        return True
    except (ValueError, AttributeError):
        return False


def validate_email(email):
    """Strict email validation"""
    if not email or len(email) > 254:
        return False
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_username(username):
    """Validate username format"""
    if not username:
        return False
    pattern = r'^[a-zA-Z0-9_]{3,30}$'
    return bool(re.match(pattern, username))


def validate_password_strength(password):
    """Validate password meets security requirements"""
    errors = []
    if len(password) < 6:
        errors.append("Mật khẩu phải có ít nhất 6 ký tự")
    if len(password) > 128:
        errors.append("Mật khẩu quá dài (tối đa 128 ký tự)")
    return errors


# ==================== ACCOUNT LOCKOUT ====================

def check_account_lockout(user):
    """Check if account is locked out"""
    from models import db
    
    if not user.locked_until:
        return False
    if datetime.utcnow() > user.locked_until:
        # Lockout expired, reset
        user.failed_login_attempts = 0
        user.locked_until = None
        db.session.commit()
        return False
    return True


def record_failed_login(user):
    """Record failed login attempt and lock if necessary"""
    from models import db
    
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    
    if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_DURATION)
        log_security_event('ACCOUNT_LOCKED', f"Account locked after {MAX_LOGIN_ATTEMPTS} failed attempts", user.id)
    
    db.session.commit()


def reset_failed_login(user):
    """Reset failed login counter on successful login"""
    from models import db
    
    user.failed_login_attempts = 0
    user.locked_until = None
    db.session.commit()
