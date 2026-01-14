"""
Database Models cho English Teacher
With Security Enhancements
"""

from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import json

db = SQLAlchemy()


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    total_tokens_used = db.Column(db.Integer, default=0)
    token_limit = db.Column(db.Integer, default=100000)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Security fields
    failed_login_attempts = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime, nullable=True)
    last_login_at = db.Column(db.DateTime, nullable=True)
    last_login_ip = db.Column(db.String(45), nullable=True)  # IPv6 compatible
    password_changed_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    conversations = db.relationship('Conversation', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def set_password(self, password):
        # Use stronger hashing with higher iterations
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256:600000')
        self.password_changed_at = datetime.utcnow()
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def can_use_tokens(self, amount=0):
        """Kiểm tra user còn đủ token không"""
        return self.total_tokens_used + amount <= self.token_limit
    
    def add_tokens_used(self, amount):
        """Cộng thêm token đã sử dụng"""
        self.total_tokens_used += amount
    
    def record_login(self, ip_address=None):
        """Record successful login"""
        self.last_login_at = datetime.utcnow()
        self.last_login_ip = ip_address
        self.failed_login_attempts = 0
        self.locked_until = None
    
    @property
    def tokens_remaining(self):
        return max(0, self.token_limit - self.total_tokens_used)
    
    @property
    def is_locked(self):
        if not self.locked_until:
            return False
        return datetime.utcnow() < self.locked_until
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'total_tokens_used': self.total_tokens_used,
            'token_limit': self.token_limit,
            'tokens_remaining': self.tokens_remaining,
            'created_at': self.created_at.isoformat()
        }


class Conversation(db.Model):
    __tablename__ = 'conversations'
    
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), default='Cuộc trò chuyện mới')
    total_tokens = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Soft delete fields
    is_deleted = db.Column(db.Boolean, default=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    
    # Relationships
    messages = db.relationship('Message', backref='conversation', lazy=True, cascade='all, delete-orphan', order_by='Message.created_at')
    
    def to_dict(self, include_messages=False):
        data = {
            'id': self.id,
            'title': self.title,
            'total_tokens': self.total_tokens,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
        if include_messages:
            data['messages'] = [m.to_dict() for m in self.messages]
        return data


class Message(db.Model):
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.String(36), db.ForeignKey('conversations.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='completed')  # 'pending', 'completed', 'cancelled'
    prompt_tokens = db.Column(db.Integer, default=0)
    completion_tokens = db.Column(db.Integer, default=0)
    total_tokens = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'role': self.role,
            'content': self.content,
            'status': self.status,
            'tokens': {
                'prompt_tokens': self.prompt_tokens,
                'completion_tokens': self.completion_tokens,
                'total_tokens': self.total_tokens
            },
            'created_at': self.created_at.isoformat()
        }


class Vocabulary(db.Model):
    __tablename__ = 'vocabularies'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    word = db.Column(db.String(200), nullable=False)
    note = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship
    user = db.relationship('User', backref=db.backref('vocabularies', lazy=True, cascade='all, delete-orphan'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'word': self.word,
            'note': self.note,
            'created_at': self.created_at.isoformat()
        }
