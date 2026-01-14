"""
Text-to-Speech routes
"""

import io
import re

from flask import Blueprint, request, jsonify, send_file
from flask_login import login_required

from config import IS_PRODUCTION
from services.tts_service import (
    audio_cache, generate_tts_audio,
    get_user_voice_config, set_user_voice_config,
    AVAILABLE_VOICES, VALID_VOICE_IDS
)
from utils.security import sanitize_input, log_security_event
from utils.helpers import get_cache_key


tts_bp = Blueprint('tts', __name__)


@tts_bp.route("/api/voices", methods=["GET"])
@login_required
def get_voices():
    """Trả về danh sách giọng có sẵn"""
    return jsonify({
        "voices": AVAILABLE_VOICES,
        "current": get_user_voice_config()
    })


@tts_bp.route("/api/voices", methods=["POST"])
@login_required
def set_voices():
    """Cập nhật giọng đọc (per user via session)"""
    data = request.json or {}
    current_config = get_user_voice_config()
    
    # Validate voice IDs
    if 'vi' in data:
        if data['vi'] not in VALID_VOICE_IDS:
            return jsonify({"error": "Invalid voice ID"}), 400
        current_config['vi'] = data['vi']
    if 'en' in data:
        if data['en'] not in VALID_VOICE_IDS:
            return jsonify({"error": "Invalid voice ID"}), 400
        current_config['en'] = data['en']
    
    set_user_voice_config(current_config)
    
    return jsonify({"success": True, "current": current_config})


@tts_bp.route("/api/tts/test", methods=["GET"])
@login_required
def tts_test():
    """Test edge-tts functionality"""
    try:
        test_text = "Hello world"
        audio_data = generate_tts_audio(test_text, "en", "+0%")
        if audio_data:
            return jsonify({
                "success": True, 
                "message": "TTS working",
                "audio_size": len(audio_data)
            })
        else:
            return jsonify({"success": False, "message": "TTS returned None"}), 500
    except Exception as e:
        log_security_event('TTS_TEST_ERROR', f"TTS test failed: {str(e)[:100]}")
        error_msg = "TTS test failed" if IS_PRODUCTION else str(e)
        return jsonify({"success": False, "error": error_msg}), 500


@tts_bp.route("/api/tts/single", methods=["POST"])
@login_required
def tts_single():
    """API endpoint để tạo audio cho 1 segment"""
    try:
        data = request.json or {}
        text = sanitize_input(data.get("text", ""), max_length=1000)
        lang = data.get("lang", "vi")
        
        if lang not in ['vi', 'en']:
            lang = 'vi'
        
        rate = "+15%" if lang == 'vi' else "+0%"
        
        if not text or len(text) < 2:
            return jsonify({"error": "Text trống"}), 400
        
        # Remove markdown and special patterns
        text = re.sub(r'[*#_`~]', '', text)
        # Remove patterns like "A -", "B -", "C -" at the start
        text = re.sub(r'^[A-Z]\s*-\s*', '', text)
        # Remove double quotes
        text = text.replace('"', '')
        # Replace / with space (e.g., "was/were" -> "was were")
        text = text.replace('/', ' ')
        # Remove ellipsis (...) for cleaner speech
        text = text.replace('...', ' ')
        text = text.strip()
        
        if not text:
            return jsonify({"error": "Text trống"}), 400
        
        cache_key = get_cache_key(text, lang, rate)
        cached_audio = audio_cache.get(cache_key)
        if cached_audio:
            return send_file(io.BytesIO(cached_audio), mimetype="audio/mpeg", as_attachment=False)
        
        audio_data = generate_tts_audio(text, lang, rate)
        
        if audio_data:
            audio_cache.set(cache_key, audio_data)
            return send_file(io.BytesIO(audio_data), mimetype="audio/mpeg", as_attachment=False)
        else:
            return jsonify({"error": "Không thể tạo audio"}), 500
    except Exception as e:
        log_security_event('TTS_SINGLE_ERROR', f"TTS single failed: {str(e)[:100]}")
        return jsonify({"error": "Lỗi tạo audio"}), 500


@tts_bp.route("/api/tts", methods=["POST"])
@login_required
def tts():
    """API endpoint để tạo audio cho 1 đoạn text"""
    try:
        data = request.json or {}
        text = sanitize_input(data.get("text", ""), max_length=1000)
        lang = data.get("lang", "vi")
        
        if lang not in ['vi', 'en']:
            lang = 'vi'
        
        if not text:
            return jsonify({"error": "Text trống"}), 400
        
        # Remove markdown and special patterns
        text = re.sub(r'[*#_`~]', '', text)
        # Remove patterns like "A -", "B -", "C -" at the start
        text = re.sub(r'^[A-Z]\s*-\s*', '', text)
        # Remove double quotes
        text = text.replace('"', '')
        # Replace / with space (e.g., "was/were" -> "was were")
        text = text.replace('/', ' ')
        # Remove ellipsis (...) for cleaner speech
        text = text.replace('...', ' ')
        text = text.strip()
        
        if not text:
            return jsonify({"error": "Text trống"}), 400
        
        rate = "+15%" if lang == 'vi' else "+0%"
        
        cache_key = get_cache_key(text, lang, rate)
        cached_audio = audio_cache.get(cache_key)
        if cached_audio:
            return send_file(io.BytesIO(cached_audio), mimetype="audio/mpeg", as_attachment=False)
        
        audio_data = generate_tts_audio(text, lang, rate)
        
        if audio_data:
            audio_cache.set(cache_key, audio_data)
            return send_file(io.BytesIO(audio_data), mimetype="audio/mpeg", as_attachment=False)
        else:
            return jsonify({"error": "Không thể tạo audio"}), 500
    except Exception as e:
        log_security_event('TTS_ERROR', f"TTS failed: {str(e)[:100]}")
        return jsonify({"error": "Lỗi tạo audio"}), 500
