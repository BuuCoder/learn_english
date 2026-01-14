"""
Vocabulary routes
"""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db, Vocabulary
from utils.security import sanitize_input, sanitize_html


vocabulary_bp = Blueprint('vocabulary', __name__)


@vocabulary_bp.route("/api/vocabularies", methods=["GET"])
@login_required
def get_vocabularies():
    """Lấy danh sách từ vựng của user"""
    vocabs = Vocabulary.query.filter_by(user_id=current_user.id).order_by(Vocabulary.created_at.desc()).all()
    return jsonify({"vocabularies": [v.to_dict() for v in vocabs]})


@vocabulary_bp.route("/api/vocabularies", methods=["POST"])
@login_required
def add_vocabulary():
    """Thêm từ vựng mới"""
    data = request.json or {}
    word = sanitize_html(sanitize_input(data.get("word", ""), max_length=200))
    note = sanitize_html(sanitize_input(data.get("note", ""), max_length=1000))
    
    if not word:
        return jsonify({"error": "Từ vựng không được để trống"}), 400
    
    existing = Vocabulary.query.filter_by(user_id=current_user.id, word=word).first()
    if existing:
        return jsonify({"error": "Từ này đã có trong danh sách", "vocabulary": existing.to_dict()}), 409
    
    vocab = Vocabulary(user_id=current_user.id, word=word, note=note)
    db.session.add(vocab)
    db.session.commit()
    return jsonify({"success": True, "vocabulary": vocab.to_dict()})


@vocabulary_bp.route("/api/vocabularies/<int:vocab_id>", methods=["DELETE"])
@login_required
def delete_vocabulary(vocab_id):
    """Xóa từ vựng"""
    vocab = Vocabulary.query.filter_by(id=vocab_id, user_id=current_user.id).first()
    if not vocab:
        return jsonify({"error": "Không tìm thấy từ vựng"}), 404
    
    db.session.delete(vocab)
    db.session.commit()
    return jsonify({"success": True})


@vocabulary_bp.route("/api/vocabularies/<int:vocab_id>", methods=["PUT"])
@login_required
def update_vocabulary(vocab_id):
    """Cập nhật ghi chú từ vựng"""
    vocab = Vocabulary.query.filter_by(id=vocab_id, user_id=current_user.id).first()
    if not vocab:
        return jsonify({"error": "Không tìm thấy từ vựng"}), 404
    
    data = request.json or {}
    if "note" in data:
        vocab.note = sanitize_html(sanitize_input(data["note"], max_length=1000))
    if "word" in data:
        vocab.word = sanitize_html(sanitize_input(data["word"], max_length=200))
    
    db.session.commit()
    return jsonify({"success": True, "vocabulary": vocab.to_dict()})
