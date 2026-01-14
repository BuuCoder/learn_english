"""
Helper utilities - text processing, caching
"""

import re
import hashlib


def estimate_tokens(text):
    """Ước tính số token từ text"""
    return len(text) // 3


def get_cache_key(text, lang, speed):
    """Tạo cache key từ text, lang và speed"""
    content = f"{text}|{lang}|{speed}"
    return hashlib.sha256(content.encode()).hexdigest()


def split_by_language(text):
    """Tách text thành các segments theo ngôn ngữ"""
    text = re.sub(r'\[Actions\].*$', '', text, flags=re.IGNORECASE).strip()
    
    segments = []
    pattern = r'\[(Vietsub|Engsub)\]\s*([^[\]]*?)(?=\[(Vietsub|Engsub)\]|$)'
    
    for match in re.finditer(pattern, text, re.IGNORECASE):
        lang_tag = match.group(1).lower()
        content = match.group(2).strip()
        content = re.sub(r'\*\*(.+?)\*\*', r'\1', content)
        content = re.sub(r'[*#_`~]', '', content)
        
        if content and len(content) >= 2:
            lang = 'vi' if lang_tag == 'vietsub' else 'en'
            segments.append({'text': content, 'lang': lang})
    
    return segments
