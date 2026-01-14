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
    def __init__(self, max_size=200, ttl_seconds=1800):  # Increased size, 30min TTL
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


# Global audio cache - larger for better hit rate
audio_cache = TTLCache(max_size=200, ttl_seconds=1800)

# Reusable event loop for better performance
_event_loop = None
_loop_lock = threading.Lock()

def get_event_loop():
    """Get or create a reusable event loop"""
    global _event_loop
    with _loop_lock:
        if _event_loop is None or _event_loop.is_closed():
            _event_loop = asyncio.new_event_loop()
        return _event_loop


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

async def generate_tts_audio_async(text, lang, rate="+0%", voice=None):
    """Tạo audio từ text sử dụng edge-tts (async) - optimized"""
    try:
        if voice is None:
            voice_config = get_user_voice_config()
            voice = voice_config.get(lang, DEFAULT_VOICE_CONFIG[lang])
        
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        
        # Collect audio chunks efficiently
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        
        if not audio_chunks:
            return None
        
        # Join all chunks at once (faster than incremental writes)
        return b''.join(audio_chunks)
        
    except Exception as e:
        log_security_event('TTS_ERROR', f"TTS generation failed: {str(e)[:100]}")
        return None


def generate_tts_audio(text, lang, rate="+0%"):
    """Wrapper sync cho generate_tts_audio_async - optimized with reusable loop"""
    try:
        loop = get_event_loop()
        # Run in the reusable loop
        future = asyncio.run_coroutine_threadsafe(
            generate_tts_audio_async(text, lang, rate), 
            loop
        )
        # Wait with timeout
        return future.result(timeout=5.0)
    except asyncio.TimeoutError:
        log_security_event('TTS_ERROR', 'TTS generation timeout')
        return None
    except Exception as e:
        log_security_event('TTS_ERROR', f"TTS sync wrapper failed: {str(e)[:100]}")
        # Fallback: create new loop
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(generate_tts_audio_async(text, lang, rate))
            finally:
                loop.close()
        except:
            return None


def generate_tts_audio_simple(text, lang, rate="+0%"):
    """Simple sync TTS generation - most reliable"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(generate_tts_audio_async(text, lang, rate))
        finally:
            loop.close()
    except Exception as e:
        log_security_event('TTS_ERROR', f"TTS simple failed: {str(e)[:100]}")
        return None


def pre_generate_tts(text, rate="+0%"):
    """Pre-generate TTS cho tất cả segments trong background"""
    segments = split_by_language(text)
    
    for seg in segments:
        cache_key = get_cache_key(seg['text'], seg['lang'], rate)
        
        if audio_cache.get(cache_key):
            continue
        
        seg_rate = "+15%" if seg['lang'] == 'vi' else "+0%"
        audio_data = generate_tts_audio_simple(seg['text'], seg['lang'], seg_rate)
        
        if audio_data:
            audio_cache.set(cache_key, audio_data)
