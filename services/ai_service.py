"""
AI Service - DeepSeek API integration
"""

from openai import OpenAI

from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL


# Initialize DeepSeek client
client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL
)


def chat_with_ai(messages, model="deepseek-chat", temperature=0.7, max_tokens=2000, stream=True):
    """
    Send chat request to DeepSeek API
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model name
        temperature: Creativity level (0-1)
        max_tokens: Max response tokens
        stream: Whether to stream response
    
    Returns:
        Stream object if stream=True, else completion object
    """
    return client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=stream
    )
