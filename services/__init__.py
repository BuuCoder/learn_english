"""
Service modules
"""

from .tts_service import (
    TTLCache,
    audio_cache,
    generate_tts_audio,
    generate_tts_audio_async,
    pre_generate_tts,
    get_user_voice_config,
    set_user_voice_config,
    DEFAULT_VOICE_CONFIG,
    AVAILABLE_VOICES,
    VALID_VOICE_IDS
)

from .ai_service import (
    client,
    chat_with_ai
)
