"""
Text-to-Speech Service using Edge-TTS
"""

import io
import asyncio
import threading
import time
from collections import OrderedDict

import edge_tts

from utils.security import log_security_event
from utils.helpers import get_cache_key, split_by_language


# ==================== TTL CACHE ====================

class TTLCache:
    """Thread-safe cache with TTL"""
    def __init__(self, max_size=100, ttl_seconds=3600):
        self.cache = OrderedDict()
        self.max_size = max_size
        self.ttl = ttl_seconds
        self.lock = threading.Lock()
    
    def get(self, key):
        with self.lock:
            if key in self.cache:
                value, timestamp = self.cache[key]
                if time.time() - timestamp < self.ttl:
                    self.cache.move_to_end(key)
                    return value
                else:
                    del self.cache[key]
            return None
    
    def set(self, key, value):
        with self.lock:
            if key in self.cache:
                del self.cache[key]
            elif len(self.cache) >= self.max_size:
                self.cache.popitem(last=False)
            self.cache[key] = (value, time.time())
    
    def clear(self):
        with self.lock:
            self.cache.clear()


# Global audio cache
audio_cache = TTLCache(max_size=100, ttl_seconds=3600)


# ==================== VOICE CONFIGURATION ====================

DEFAULT_VOICE_CONFIG = {
    'vi': 'vi-VN-HoaiMyNeural',
    'en': 'en-US-JennyNeural'
}

AVAILABLE_VOICES = {
    'vi': [
        {'id': 'vi-VN-HoaiMyNeural', 'name': 'Hoài My (Nữ)', 'gender': 'Female'},
        {'id': 'vi-VN-NamMinhNeural', 'name': 'Nam Minh (Nam)', 'gender': 'Male'},
    ],
    'en': [
        {'id': 'en-US-JennyNeural', 'name': 'Jenny (Nữ - US)', 'gender': 'Female'},
        {'id': 'en-US-GuyNeural', 'name': 'Guy (Nam - US)', 'gender': 'Male'},
        {'id': 'en-US-AriaNeural', 'name': 'Aria (Nữ - US)', 'gender': 'Female'},
        {'id': 'en-GB-SoniaNeural', 'name': 'Sonia (Nữ - UK)', 'gender': 'Female'},
        {'id': 'en-GB-RyanNeural', 'name': 'Ryan (Nam - UK)', 'gender': 'Male'},
    ]
}

VALID_VOICE_IDS = set()
for voices in AVAILABLE_VOICES.values():
    for v in voices:
        VALID_VOICE_IDS.add(v['id'])


def get_user_voice_config():
    """Get voice config for current user from session"""
    from flask import session
    return session.get('voice_config', DEFAULT_VOICE_CONFIG.copy())


def set_user_voice_config(config):
    """Set voice config for current user in session"""
    from flask import session
    session['voice_config'] = config


# ==================== TTS GENERATION ====================

async def generate_tts_audio_async(text, lang, rate="+0%"):
    """Tạo audio từ text sử dụng edge-tts (async)"""
    try:
        voice_config = get_user_voice_config()
        voice = voice_config.get(lang, DEFAULT_VOICE_CONFIG[lang])
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        
        audio_buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])
        
        audio_buffer.seek(0)
        audio_data = audio_buffer.getvalue()
        
        if len(audio_data) == 0:
            return None
            
        return audio_data
    except Exception as e:
        log_security_event('TTS_ERROR', f"TTS generation failed: {str(e)[:100]}")
        return None


def generate_tts_audio(text, lang, rate="+0%"):
    """Wrapper sync cho generate_tts_audio_async"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(generate_tts_audio_async(text, lang, rate))
        finally:
            loop.close()
        return result
    except Exception as e:
        log_security_event('TTS_ERROR', f"TTS sync wrapper failed: {str(e)[:100]}")
        return None


def pre_generate_tts(text, rate="+0%"):
    """Pre-generate TTS cho tất cả segments trong background"""
    segments = split_by_language(text)
    
    for seg in segments:
        cache_key = get_cache_key(seg['text'], seg['lang'], rate)
        
        if audio_cache.get(cache_key):
            continue
        
        seg_rate = "+15%" if seg['lang'] == 'vi' else "+0%"
        audio_data = generate_tts_audio(seg['text'], seg['lang'], seg_rate)
        
        if audio_data:
            audio_cache.set(cache_key, audio_data)
