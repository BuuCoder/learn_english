"""
Authentication routes
"""

from flask import Blueprint, request, jsonify, redirect, url_for, render_template
from flask_login import login_user, logout_user, login_required, current_user

from models import db, User
from config import TOKEN_LIMIT_PER_USER, RATE_LIMIT_LOGIN, RATE_LIMIT_REGISTER
from utils.security import (
    sanitize_input, validate_email, validate_username,
    validate_password_strength, check_account_lockout,
    record_failed_login, reset_failed_login, log_security_event
)


auth_bp = Blueprint('auth', __name__)


@auth_bp.route("/login", methods=["GET"])
def login_page():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template("login.html")


@auth_bp.route("/register", methods=["GET"])
def register_page():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template("register.html")


@auth_bp.route("/api/register", methods=["POST"])
def register():
    data = request.json or {}
    username = sanitize_input(data.get("username", ""), max_length=30)
    email = sanitize_input(data.get("email", ""), max_length=120).lower()
    password = data.get("password", "")
    
    # Validation
    if not username or not email or not password:
        return jsonify({"error": "Vui lòng điền đầy đủ thông tin"}), 400
    
    if not validate_username(username):
        return jsonify({"error": "Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới (3-30 ký tự)"}), 400
    
    if not validate_email(email):
        return jsonify({"error": "Email không hợp lệ"}), 400
    
    # Strong password validation
    password_errors = validate_password_strength(password)
    if password_errors:
        return jsonify({"error": password_errors[0]}), 400
    
    # Check existing user
    if User.query.filter_by(username=username).first() or User.query.filter_by(email=email).first():
        log_security_event('REGISTER_DUPLICATE', f"Duplicate registration attempt: {username}/{email}")
        return jsonify({"error": "Tên đăng nhập hoặc email đã tồn tại"}), 400
    
    try:
        user = User(
            username=username,
            email=email,
            token_limit=TOKEN_LIMIT_PER_USER
        )
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        log_security_event('USER_REGISTERED', f"New user registered: {username}", user.id)
        login_user(user)
        return jsonify({"success": True, "user": user.to_dict()})
    except Exception as e:
        db.session.rollback()
        log_security_event('REGISTER_ERROR', f"Registration failed: {str(e)[:100]}")
        return jsonify({"error": "Đã xảy ra lỗi, vui lòng thử lại"}), 500


@auth_bp.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    username = sanitize_input(data.get("username", ""), max_length=120)
    password = data.get("password", "")
    
    if not username or not password:
        return jsonify({"error": "Vui lòng nhập đầy đủ thông tin"}), 400
    
    # Find user
    user = User.query.filter(
        (User.username == username) | (User.email == username.lower())
    ).first()
    
    # Check lockout first
    if user and check_account_lockout(user):
        from datetime import datetime
        remaining = (user.locked_until - datetime.utcnow()).seconds // 60
        log_security_event('LOGIN_LOCKED', f"Login attempt on locked account: {username}", user.id if user else None)
        return jsonify({"error": f"Tài khoản bị khóa. Vui lòng thử lại sau {remaining} phút"}), 403
    
    # Verify credentials
    if not user or not user.check_password(password):
        if user:
            record_failed_login(user)
            log_security_event('LOGIN_FAILED', f"Failed login for user: {username}", user.id)
        else:
            log_security_event('LOGIN_FAILED', f"Failed login for unknown user: {username}")
        return jsonify({"error": "Tên đăng nhập hoặc mật khẩu không đúng"}), 401
    
    if not user.is_active:
        log_security_event('LOGIN_INACTIVE', f"Login attempt on inactive account: {username}", user.id)
        return jsonify({"error": "Tài khoản đã bị khóa"}), 403
    
    # Successful login
    reset_failed_login(user)
    remember = data.get("remember", False)
    login_user(user, remember=remember)
    log_security_event('LOGIN_SUCCESS', f"User logged in: {username}", user.id)
    return jsonify({"success": True, "user": user.to_dict()})


@auth_bp.route("/api/logout", methods=["POST"])
@login_required
def logout():
    user_id = current_user.id
    logout_user()
    log_security_event('LOGOUT', "User logged out", user_id)
    return jsonify({"success": True})


@auth_bp.route("/api/me", methods=["GET"])
@login_required
def get_current_user():
    return jsonify({"user": current_user.to_dict()})
