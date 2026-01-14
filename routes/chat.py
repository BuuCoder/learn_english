"""
Chat routes - AI conversation handling
"""

import json
import uuid
import threading
from datetime import datetime

from flask import Blueprint, request, jsonify, Response, stream_with_context
from flask_login import login_required, current_user

from models import db, User, Conversation, Message
from config import IS_PRODUCTION, MAX_PROMPT_TOKENS, MAX_COMPLETION_TOKENS
from prompts import TEACHER_PROMPT, MAX_HISTORY_MESSAGES
from services.ai_service import client
from services.tts_service import pre_generate_tts
from utils.security import sanitize_input, sanitize_html, validate_uuid, log_security_event
from utils.helpers import estimate_tokens


chat_bp = Blueprint('chat', __name__)


@chat_bp.route("/api/chat", methods=["POST"])
@login_required
def chat():
    # Kiểm tra Content-Type
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400
    
    data = request.get_json(silent=True) or {}
    user_message = sanitize_input(data.get("message", ""), max_length=5000)
    conversation_id = data.get("conversation_id")
    retry_message_id = data.get("retry_message_id")
    
    if not user_message.strip():
        return jsonify({"error": "Tin nhắn trống"}), 400
    
    if not current_user.can_use_tokens():
        return jsonify({"error": "Bạn đã hết token. Vui lòng liên hệ admin để nâng cấp."}), 403
    
    # Validate and get/create conversation
    conv = None
    if conversation_id:
        if not validate_uuid(conversation_id):
            return jsonify({"error": "Invalid conversation ID"}), 400
        conv = Conversation.query.filter_by(id=conversation_id, user_id=current_user.id).first()
        if not conv:
            return jsonify({"error": "Không tìm thấy cuộc trò chuyện"}), 404
    else:
        conv_id = str(uuid.uuid4())
        title = sanitize_html(user_message[:30]) + ('...' if len(user_message) > 30 else '')
        conv = Conversation(
            id=conv_id,
            user_id=current_user.id,
            title=title
        )
        db.session.add(conv)
        db.session.commit()
    
    # Handle retry
    if retry_message_id:
        existing_msg = Message.query.filter_by(id=retry_message_id, conversation_id=conv.id).first()
        if existing_msg:
            existing_msg.status = 'completed'
            user_msg = existing_msg
        else:
            return jsonify({"error": "Không tìm thấy tin nhắn"}), 404
    else:
        user_msg = Message(
            conversation_id=conv.id,
            role='user',
            content=user_message,
            status='pending'
        )
        db.session.add(user_msg)
    
    db.session.commit()
    
    # Get history
    history = [{"role": m.role, "content": m.content} for m in conv.messages if m.status == 'completed' or m.id == user_msg.id]
    
    # Limit history by message count first (to save tokens)
    if len(history) > MAX_HISTORY_MESSAGES:
        history = history[-MAX_HISTORY_MESSAGES:]
    
    # Then trim by token count
    total_tokens = estimate_tokens(TEACHER_PROMPT)
    trimmed_history = []
    for msg in reversed(history):
        msg_tokens = estimate_tokens(msg["content"])
        if total_tokens + msg_tokens > MAX_PROMPT_TOKENS:
            break
        total_tokens += msg_tokens
        trimmed_history.insert(0, msg)
    
    history = trimmed_history
    
    # Store context
    conv_id = conv.id
    user_msg_id = user_msg.id
    user_id = current_user.id
    original_user_message = user_message
    
    # Create assistant message
    assistant_msg = Message(
        conversation_id=conv_id,
        role='assistant',
        content='',
        status='pending'
    )
    db.session.add(assistant_msg)
    db.session.commit()
    assistant_msg_id = assistant_msg.id
    
    def update_assistant_message(content, status='pending', prompt_tokens=0, completion_tokens=0, total_tokens=0):
        try:
            msg = Message.query.get(assistant_msg_id)
            if msg:
                msg.content = content
                msg.status = status
                if status == 'completed':
                    msg.prompt_tokens = prompt_tokens
                    msg.completion_tokens = completion_tokens
                    msg.total_tokens = total_tokens
                    
                    user_msg_obj = Message.query.get(user_msg_id)
                    if user_msg_obj:
                        user_msg_obj.status = 'completed'
                    
                    conv_obj = Conversation.query.get(conv_id)
                    if conv_obj:
                        conv_obj.total_tokens += total_tokens
                        if len([m for m in conv_obj.messages if m.status == 'completed']) <= 2:
                            conv_obj.title = sanitize_html(original_user_message[:30]) + ('...' if len(original_user_message) > 30 else '')
                    
                    user_obj = User.query.get(user_id)
                    if user_obj:
                        user_obj.add_tokens_used(total_tokens)
                
                db.session.commit()
        except Exception as e:
            log_security_event('DB_ERROR', f"Error updating message: {str(e)[:100]}", user_id)
            db.session.rollback()
    
    def generate():
        assistant_message = ""
        prompt_tokens = 0
        completion_tokens = 0
        chunk_count = 0
        
        yield f"data: {json.dumps({'type': 'init', 'assistant_message_id': assistant_msg_id, 'conversation_id': conv_id})}\n\n"
        
        try:
            stream = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": TEACHER_PROMPT},
                    *history
                ],
                temperature=0.7,
                max_tokens=MAX_COMPLETION_TOKENS,
                stream=True
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    assistant_message += content
                    chunk_count += 1
                    
                    yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"
                    
                    if chunk_count % 10 == 0:
                        update_assistant_message(assistant_message)
                
                if hasattr(chunk, 'usage') and chunk.usage:
                    usage = chunk.usage
                    if isinstance(usage, dict):
                        prompt_tokens = usage.get('prompt_tokens', 0)
                        completion_tokens = usage.get('completion_tokens', 0)
                    else:
                        prompt_tokens = getattr(usage, 'prompt_tokens', 0)
                        completion_tokens = getattr(usage, 'completion_tokens', 0)
            
            if prompt_tokens == 0:
                prompt_tokens = estimate_tokens(TEACHER_PROMPT + str(history))
            if completion_tokens == 0:
                completion_tokens = estimate_tokens(assistant_message)
            
            total_tokens = prompt_tokens + completion_tokens
            
            update_assistant_message(assistant_message, 'completed', prompt_tokens, completion_tokens, total_tokens)
            
            yield f"data: {json.dumps({'type': 'done', 'conversation_id': conv_id, 'message_id': user_msg_id, 'assistant_message_id': assistant_msg_id, 'tokens': {'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens, 'total_tokens': total_tokens}})}\n\n"
            
            tts_thread = threading.Thread(target=pre_generate_tts, args=(assistant_message, "+10%"))
            tts_thread.start()
            
        except Exception as e:
            if assistant_message:
                update_assistant_message(assistant_message, 'cancelled')
            error_msg = "Đã xảy ra lỗi khi xử lý yêu cầu" if IS_PRODUCTION else str(e)
            log_security_event('CHAT_ERROR', f"Chat stream error: {str(e)[:200]}", user_id)
            yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )


@chat_bp.route("/api/reset", methods=["POST"])
@login_required
def reset():
    return jsonify({"message": "OK"})
