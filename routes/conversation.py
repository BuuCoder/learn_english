"""
Conversation routes
"""

import uuid
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db, Conversation, Message
from utils.security import sanitize_input, sanitize_html, validate_uuid
from utils.helpers import estimate_tokens


conversation_bp = Blueprint('conversation', __name__)


@conversation_bp.route("/api/conversations", methods=["GET"])
@login_required
def get_conversations():
    """Lấy danh sách conversations của user (không bao gồm đã xóa)"""
    # Cleanup: Hard delete conversations soft-deleted more than 15 seconds ago
    cleanup_threshold = datetime.utcnow() - timedelta(seconds=15)
    old_deleted = Conversation.query.filter(
        Conversation.user_id == current_user.id,
        Conversation.is_deleted == True,
        Conversation.deleted_at < cleanup_threshold
    ).all()
    
    for conv in old_deleted:
        db.session.delete(conv)
    
    if old_deleted:
        db.session.commit()
    
    # Get active conversations
    convs = Conversation.query.filter_by(
        user_id=current_user.id, 
        is_deleted=False
    ).order_by(Conversation.updated_at.desc()).all()
    return jsonify({"conversations": [c.to_dict() for c in convs]})


@conversation_bp.route("/api/conversations", methods=["POST"])
@login_required
def create_conversation():
    """Tạo conversation mới"""
    conv_id = str(uuid.uuid4())
    conv = Conversation(
        id=conv_id,
        user_id=current_user.id,
        title="Cuộc trò chuyện mới"
    )
    db.session.add(conv)
    db.session.commit()
    return jsonify({"conversation": conv.to_dict()})


@conversation_bp.route("/api/conversations/<conv_id>", methods=["GET"])
@login_required
def get_conversation(conv_id):
    """Lấy chi tiết conversation với messages"""
    if not validate_uuid(conv_id):
        return jsonify({"error": "Invalid conversation ID"}), 400
    
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first()
    if not conv:
        return jsonify({"error": "Không tìm thấy cuộc trò chuyện"}), 404
    
    # Mark pending messages as cancelled
    pending_messages = Message.query.filter_by(conversation_id=conv_id, status='pending').all()
    for msg in pending_messages:
        if msg.role == 'assistant' and msg.content:
            msg.status = 'cancelled'
            if msg.total_tokens == 0:
                msg.completion_tokens = estimate_tokens(msg.content)
                msg.prompt_tokens = msg.completion_tokens * 2
                msg.total_tokens = msg.prompt_tokens + msg.completion_tokens
                conv.total_tokens += msg.total_tokens
                current_user.add_tokens_used(msg.total_tokens)
        elif msg.role == 'user':
            msg.status = 'cancelled'
        else:
            db.session.delete(msg)
    
    if pending_messages:
        db.session.commit()
    
    return jsonify({"conversation": conv.to_dict(include_messages=True)})


@conversation_bp.route("/api/conversations/<conv_id>", methods=["DELETE"])
@login_required
def delete_conversation(conv_id):
    """Soft delete conversation"""
    if not validate_uuid(conv_id):
        return jsonify({"error": "Invalid conversation ID"}), 400
    
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first()
    if not conv:
        return jsonify({"error": "Không tìm thấy cuộc trò chuyện"}), 404
    
    conv.is_deleted = True
    conv.deleted_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"success": True})


@conversation_bp.route("/api/conversations/<conv_id>/rename", methods=["PUT"])
@login_required
def rename_conversation(conv_id):
    """Đổi tên conversation"""
    if not validate_uuid(conv_id):
        return jsonify({"error": "Invalid conversation ID"}), 400
    
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first()
    if not conv:
        return jsonify({"error": "Không tìm thấy cuộc trò chuyện"}), 404
    
    data = request.json or {}
    new_title = sanitize_html(sanitize_input(data.get("title", ""), max_length=200))
    if not new_title:
        return jsonify({"error": "Tên không được để trống"}), 400
    
    conv.title = new_title
    db.session.commit()
    return jsonify({"success": True, "conversation": conv.to_dict()})


@conversation_bp.route("/api/conversations/restore", methods=["POST"])
@login_required
def restore_conversation():
    """Khôi phục conversation đã xóa mềm (trong vòng 15 giây)"""
    data = request.json or {}
    conv_id = data.get("id")
    
    if not conv_id or not validate_uuid(conv_id):
        return jsonify({"error": "Invalid conversation ID"}), 400
    
    conv = Conversation.query.filter_by(
        id=conv_id, 
        user_id=current_user.id,
        is_deleted=True
    ).first()
    
    if not conv:
        return jsonify({"error": "Không tìm thấy cuộc trò chuyện đã xóa"}), 404
    
    if conv.deleted_at:
        time_diff = (datetime.utcnow() - conv.deleted_at).total_seconds()
        if time_diff > 15:
            return jsonify({"error": "Đã quá thời gian hoàn tác"}), 400
    
    conv.is_deleted = False
    conv.deleted_at = None
    db.session.commit()
    
    return jsonify({"success": True, "conversation": conv.to_dict()})


@conversation_bp.route("/api/messages/<int:message_id>/finalize", methods=["POST"])
@login_required
def finalize_message(message_id):
    """Finalize a cancelled/pending message with estimated tokens"""
    msg = Message.query.get(message_id)
    if not msg:
        return jsonify({"error": "Không tìm thấy tin nhắn"}), 404
    
    conv = Conversation.query.get(msg.conversation_id)
    if not conv or conv.user_id != current_user.id:
        return jsonify({"error": "Không có quyền"}), 403
    
    data = request.json or {}
    status = data.get("status", "cancelled")
    if status not in ['completed', 'cancelled']:
        status = 'cancelled'
    
    if msg.total_tokens == 0 and msg.content:
        msg.prompt_tokens = estimate_tokens(msg.content) * 2
        msg.completion_tokens = estimate_tokens(msg.content)
        msg.total_tokens = msg.prompt_tokens + msg.completion_tokens
        
        conv.total_tokens += msg.total_tokens
        current_user.add_tokens_used(msg.total_tokens)
    
    msg.status = status
    db.session.commit()
    
    return jsonify({
        "success": True,
        "message": msg.to_dict(),
        "user_tokens": {
            "used": current_user.total_tokens_used,
            "limit": current_user.token_limit,
            "remaining": current_user.tokens_remaining
        }
    })
