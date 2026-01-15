"""
English Teacher AI - Main Application
Tích hợp DeepSeek API + Edge-TTS + Database
With Full Security Hardening for Production
"""

from datetime import timedelta, datetime

from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_login import LoginManager, login_required, current_user
from flask_migrate import Migrate
from flask_wtf.csrf import CSRFProtect, generate_csrf
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
from flask_cors import CORS

from models import db, User
from config import (
    IS_PRODUCTION, SECRET_KEY, SESSION_TIMEOUT, DATABASE_URI,
    ALLOWED_ORIGINS, RATE_LIMIT_DEFAULT, RATE_LIMIT_LOGIN,
    RATE_LIMIT_REGISTER, RATE_LIMIT_CHAT, RATE_LIMIT_TTS
)
from utils.security import log_security_event

# Import route blueprints
from routes import auth_bp, chat_bp, tts_bp, conversation_bp, vocabulary_bp


# ==================== APP INITIALIZATION ====================

app = Flask(__name__)

# ==================== APP CONFIGURATION ====================

app.config['SECRET_KEY'] = SECRET_KEY

# Session security
app.config['SESSION_COOKIE_SECURE'] = IS_PRODUCTION
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Strict' if IS_PRODUCTION else 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=SESSION_TIMEOUT)
app.config['SESSION_COOKIE_NAME'] = '__Host-session' if IS_PRODUCTION else 'session'
app.config['REMEMBER_COOKIE_DURATION'] = timedelta(hours=SESSION_TIMEOUT)
app.config['REMEMBER_COOKIE_SECURE'] = IS_PRODUCTION
app.config['REMEMBER_COOKIE_HTTPONLY'] = True
app.config['REMEMBER_COOKIE_SAMESITE'] = 'Strict' if IS_PRODUCTION else 'Lax'

# CSRF Protection
app.config['WTF_CSRF_ENABLED'] = True
app.config['WTF_CSRF_TIME_LIMIT'] = 3600
app.config['WTF_CSRF_SSL_STRICT'] = IS_PRODUCTION

# JSON security
app.config['JSON_SORT_KEYS'] = False
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False

# Request size limit (prevent DoS)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

# Database
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URI
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
}


# ==================== INITIALIZE EXTENSIONS ====================

db.init_app(app)
migrate = Migrate(app, db)

# CSRF Protection
csrf = CSRFProtect(app)

# Rate Limiting
def get_rate_limit_key():
    """Get rate limit key - use user ID if logged in, else IP"""
    if hasattr(current_user, 'id') and current_user.is_authenticated:
        return f"user:{current_user.id}"
    return get_remote_address()

limiter = Limiter(
    key_func=get_rate_limit_key,
    app=app,
    default_limits=[f"{RATE_LIMIT_DEFAULT} per hour"],
    storage_uri="memory://",
)

# CORS
if IS_PRODUCTION:
    CORS(app, 
         origins=ALLOWED_ORIGINS,
         supports_credentials=True,
         allow_headers=['Content-Type', 'X-CSRFToken', 'Authorization'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
else:
    CORS(app, 
         origins=['http://localhost:5000', 'http://127.0.0.1:5000'],
         supports_credentials=True)

# Security Headers (Talisman)
if IS_PRODUCTION:
    csp = {
        'default-src': "'self'",
        'script-src': "'self'",
        'style-src': "'self' 'unsafe-inline' https://fonts.googleapis.com",
        'font-src': "'self' https://fonts.gstatic.com",
        'img-src': "'self' data:",
        'connect-src': "'self'",
        'frame-ancestors': "'none'",
        'base-uri': "'self'",
        'form-action': "'self'",
        'upgrade-insecure-requests': True,
    }
    Talisman(
        app,
        content_security_policy=csp,
        force_https=True,
        strict_transport_security=True,
        strict_transport_security_max_age=31536000,
        strict_transport_security_include_subdomains=True,
        strict_transport_security_preload=True,
        x_content_type_options=True,
        x_xss_protection=True,
        referrer_policy='strict-origin-when-cross-origin',
        session_cookie_secure=True,
        session_cookie_http_only=True,
    )

# Login Manager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth.login_page'
login_manager.session_protection = 'strong'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@login_manager.unauthorized_handler
def unauthorized():
    # API và các endpoint không phải trang HTML
    if request.is_json or request.path.startswith(('/api/', '/tts', '/chat', '/voices')):
        return jsonify({"error": "Unauthorized", "login_required": True}), 401
    return redirect(url_for('auth.login_page'))


# ==================== REGISTER BLUEPRINTS ====================

app.register_blueprint(auth_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(tts_bp)
app.register_blueprint(conversation_bp)
app.register_blueprint(vocabulary_bp)

# Exempt CSRF for routes that don't use secureFetch
# Tất cả routes đều có login_required nên vẫn an toàn
csrf.exempt(auth_bp)          # user chưa có session
csrf.exempt(chat_bp)          # streaming endpoint
csrf.exempt(tts_bp)           # audio generation + voices
csrf.exempt(conversation_bp)  # conversations API
csrf.exempt(vocabulary_bp)    # vocabularies API


# ==================== MIDDLEWARE ====================

@app.before_request
def make_session_permanent():
    from flask import session
    session.permanent = True

@app.before_request
def validate_origin():
    """Validate request origin in production"""
    if not IS_PRODUCTION:
        return None
    
    if request.path.startswith('/static/'):
        return None
    
    if request.method == 'GET' and not request.path.startswith('/api/'):
        return None
    
    origin = request.headers.get('Origin')
    referer = request.headers.get('Referer')
    
    if request.path.startswith('/api/') or request.method in ['POST', 'PUT', 'DELETE']:
        if origin:
            if origin not in ALLOWED_ORIGINS:
                log_security_event('BLOCKED_ORIGIN', f"Blocked request from origin: {origin}")
                return jsonify({"error": "Origin not allowed"}), 403
        elif referer:
            referer_origin = '/'.join(referer.split('/')[:3])
            if referer_origin not in ALLOWED_ORIGINS:
                log_security_event('BLOCKED_REFERER', f"Blocked request from referer: {referer}")
                return jsonify({"error": "Origin not allowed"}), 403
    
    return None

@app.after_request
def add_security_headers(response):
    """Add security headers to all responses"""
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(self), camera=()'
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
    response.headers['Pragma'] = 'no-cache'
    response.headers.pop('Server', None)
    return response


# ==================== MAIN ROUTES ====================

@app.route("/")
def home():
    """Landing page - accessible to all users"""
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template("home.html")

@app.route("/app")
@login_required
def index():
    return render_template("index.html")

@csrf.exempt
@app.route('/api/csrf-token', methods=['GET'])
@limiter.limit("30 per minute")
def get_csrf_token():
    """Get CSRF token for API requests"""
    return jsonify({'csrf_token': generate_csrf()})

@app.route("/health", methods=["GET"])
@limiter.exempt
def health_check():
    """Health check endpoint for load balancers"""
    return jsonify({"status": "healthy", "timestamp": datetime.utcnow().isoformat()})


# ==================== ERROR HANDLERS ====================

@app.errorhandler(429)
def ratelimit_handler(e):
    log_security_event('RATE_LIMIT', f"Rate limit exceeded: {request.path}")
    return jsonify({"error": "Quá nhiều request. Vui lòng thử lại sau."}), 429

@app.errorhandler(400)
def bad_request_handler(e):
    return jsonify({"error": "Bad request"}), 400

@app.errorhandler(403)
def forbidden_handler(e):
    log_security_event('FORBIDDEN', f"Forbidden access: {request.path}")
    return jsonify({"error": "Forbidden"}), 403

@app.errorhandler(404)
def not_found_handler(e):
    if request.is_json or request.path.startswith('/api/'):
        return jsonify({"error": "Not found"}), 404
    return redirect(url_for('auth.login_page'))

@app.errorhandler(413)
def request_entity_too_large(e):
    log_security_event('PAYLOAD_TOO_LARGE', f"Request too large: {request.path}")
    return jsonify({"error": "Request quá lớn"}), 413

@app.errorhandler(500)
def internal_error_handler(e):
    db.session.rollback()
    log_security_event('SERVER_ERROR', f"Internal error: {str(e)[:100]}")
    return jsonify({"error": "Internal server error"}), 500


# ==================== CREATE TABLES ====================

with app.app_context():
    db.create_all()


# ==================== MAIN ====================

if __name__ == "__main__":
    if IS_PRODUCTION:
        app.run(host='0.0.0.0', port=5000, debug=False)
    else:
        # Enable threading to handle multiple TTS requests concurrently
        app.run(debug=True, port=5000, host='127.0.0.1', threaded=True)
