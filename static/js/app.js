/**
 * English Teacher AI - Main Application JavaScript
 * With Security Enhancements
 */

// ==================== CSRF TOKEN ====================
let csrfToken = null;

async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    try {
        const res = await fetch('/api/csrf-token');
        if (res.ok) {
            const data = await res.json();
            csrfToken = data.csrf_token;
            return csrfToken;
        }
    } catch (e) {
        console.error('Failed to get CSRF token:', e);
    }
    return null;
}

// Secure fetch wrapper
async function secureFetch(url, options = {}) {
    const token = await getCsrfToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token && ['POST', 'PUT', 'DELETE', 'PATCH'].includes((options.method || 'GET').toUpperCase())) {
        headers['X-CSRFToken'] = token;
    }

    return fetch(url, {
        ...options,
        headers,
        credentials: 'same-origin'  // Include cookies
    });
}

// ==================== DOM ELEMENTS ====================
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const micBtn = document.getElementById('micBtn');
const sendBtn = document.getElementById('sendBtn');
const welcomeSection = document.getElementById('welcomeSection');
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('mainContent');
const conversationList = document.getElementById('conversationList');
const vocabPopup = document.getElementById('vocabPopup');
const vocabPanel = document.getElementById('vocabPanel');
const vocabList = document.getElementById('vocabList');

// ==================== STATE ====================
let isRecording = false;
let manualStop = false;
let isProcessing = false;
let recognition = null;
let currentConversationId = null;
let conversations = {};
let vocabularies = [];
let selectedText = '';
let streamAbortController = null;
let currentStreamReader = null;
let accumulatedText = '';
let isAutoSendMode = false;
let isAutoPlayMode = false; // Tự động phát khi trả lời - mặc định TẮT

// Audio state
let currentAudio = null;
let currentPlayingBtn = null;
let isSpeaking = false;
let audioQueue = [];
let isPlayingQueue = false;

// TTS Pre-fetch cache
let ttsCache = new Map();
let lastPrefetchedSegments = 0;

// ==================== SVG ICONS ====================
const svgIcons = {
    user: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>`
};

// ==================== INPUT SANITIZATION ====================
function sanitizeInput(text, maxLength = 5000) {
    if (!text) return '';
    return String(text).trim().slice(0, maxLength);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== UTILITY FUNCTIONS ====================
function createEyeAvatar() {
    return `<div class="eye-avatar"><div class="eye left"><div class="pupil"></div></div><div class="eye right"><div class="pupil"></div></div></div>`;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ==================== VOCABULARY FUNCTIONS ====================
async function loadVocabularies() {
    try {
        const res = await secureFetch('/api/vocabularies');
        if (res.ok) {
            const data = await res.json();
            vocabularies = data.vocabularies;
            renderVocabList();
        }
    } catch (err) {
        console.error('Load vocabularies error:', err);
    }
}

function renderVocabList() {
    if (vocabularies.length === 0) {
        vocabList.innerHTML = '<div class="vocab-empty">Chưa có từ vựng nào được lưu</div>';
        return;
    }

    vocabList.innerHTML = vocabularies.map(v => `
        <div class="vocab-item" data-id="${v.id}">
            <div class="vocab-header">
                <span class="vocab-word" onclick="speakEnglish('${v.word.replace(/'/g, "\\'")}')">${v.word}</span>
                <button class="btn-delete-vocab" onclick="deleteVocab(${v.id})" title="Xóa">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
            <div class="vocab-note-section">
                ${v.note
            ? `<div class="vocab-note">${v.note}</div>
                       <button class="btn-edit-note" onclick="editVocabNote(${v.id})">Sửa nghĩa</button>`
            : `<button class="btn-add-note" onclick="editVocabNote(${v.id})">+ Thêm nghĩa</button>`
        }
            </div>
            <div class="vocab-date">${new Date(v.created_at).toLocaleDateString('vi-VN')}</div>
        </div>
    `).join('');
}

async function editVocabNote(id) {
    const vocab = vocabularies.find(v => v.id === id);
    if (!vocab) return;

    const item = document.querySelector(`.vocab-item[data-id="${id}"]`);
    const noteSection = item.querySelector('.vocab-note-section');

    noteSection.innerHTML = `
        <textarea class="vocab-note-input" placeholder="Nhập nghĩa của từ...">${vocab.note || ''}</textarea>
        <div class="vocab-note-actions">
            <button class="btn-save-note" onclick="saveVocabNote(${id})">Lưu</button>
            <button class="btn-cancel-note" onclick="renderVocabList()">Hủy</button>
        </div>
    `;

    const input = noteSection.querySelector('.vocab-note-input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
}

async function saveVocabNote(id) {
    const item = document.querySelector(`.vocab-item[data-id="${id}"]`);
    const input = item.querySelector('.vocab-note-input');
    const note = input.value.trim();

    try {
        const res = await secureFetch(`/api/vocabularies/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ note })
        });

        if (res.ok) {
            const data = await res.json();
            const idx = vocabularies.findIndex(v => v.id === id);
            if (idx !== -1) {
                vocabularies[idx] = data.vocabulary;
            }
            renderVocabList();
        }
    } catch (err) {
        console.error('Save note error:', err);
    }
}

function toggleVocabPanel() {
    vocabPanel.classList.toggle('active');
    if (!vocabPanel.classList.contains('active')) {
        document.getElementById('vocabSearchInput').value = '';
        renderVocabList();
    }
}

function filterVocabularies() {
    const query = document.getElementById('vocabSearchInput').value.toLowerCase().trim();

    if (!query) {
        renderVocabList();
        return;
    }

    const filtered = vocabularies.filter(v =>
        v.word.toLowerCase().includes(query) ||
        (v.note && v.note.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        vocabList.innerHTML = '<div class="vocab-empty">Không tìm thấy từ vựng phù hợp</div>';
        return;
    }

    vocabList.innerHTML = filtered.map(v => `
        <div class="vocab-item" data-id="${v.id}">
            <div class="vocab-header">
                <span class="vocab-word" onclick="speakEnglish('${v.word.replace(/'/g, "\\'")}')">${highlightMatch(v.word, query)}</span>
                <button class="btn-delete-vocab" onclick="deleteVocab(${v.id})" title="Xóa">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
            <div class="vocab-note-section">
                ${v.note
            ? `<div class="vocab-note">${highlightMatch(v.note, query)}</div>
                       <button class="btn-edit-note" onclick="editVocabNote(${v.id})">Sửa nghĩa</button>`
            : `<button class="btn-add-note" onclick="editVocabNote(${v.id})">+ Thêm nghĩa</button>`
        }
            </div>
            <div class="vocab-date">${new Date(v.created_at).toLocaleDateString('vi-VN')}</div>
        </div>
    `).join('');
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function showVocabPopup(x, y) {
    vocabPopup.style.left = x + 'px';
    vocabPopup.style.top = y + 'px';
    vocabPopup.classList.add('active');
}

function hideVocabPopup() {
    vocabPopup.classList.remove('active');
    selectedText = '';
}

async function saveSelectedVocab() {
    if (!selectedText) return;

    try {
        const res = await secureFetch('/api/vocabularies', {
            method: 'POST',
            body: JSON.stringify({ word: selectedText })
        });

        const data = await res.json();
        if (res.ok) {
            vocabularies.unshift(data.vocabulary);
            renderVocabList();
            // Tự động mở panel từ vựng sau khi lưu thành công
            if (!vocabPanel.classList.contains('active')) {
                toggleVocabPanel();
            }
        } else if (res.status === 409) {
            alert('Từ này đã có trong danh sách!');
        }
    } catch (err) {
        console.error('Save vocab error:', err);
    }

    hideVocabPopup();
}

async function deleteVocab(id) {
    try {
        const res = await secureFetch(`/api/vocabularies/${id}`, { method: 'DELETE' });
        if (res.ok) {
            vocabularies = vocabularies.filter(v => v.id !== id);
            renderVocabList();
        }
    } catch (err) {
        console.error('Delete vocab error:', err);
    }
}

function handleTextSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    const isEnglish = /^[a-zA-Z\s\-'.,!?]+$/.test(text) && text.length > 0 && text.length < 100;

    if (isEnglish && selection.rangeCount > 0) {
        selectedText = text;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const x = rect.left + (rect.width / 2) - 60;
        const y = rect.top - 45 + window.scrollY;

        showVocabPopup(Math.max(10, x), Math.max(10, y));
    } else {
        hideVocabPopup();
    }
}


// ==================== CONVERSATION FUNCTIONS ====================
async function loadConversations() {
    try {
        const res = await secureFetch('/api/conversations');
        if (res.ok) {
            const data = await res.json();
            conversations = {};
            data.conversations.forEach(conv => {
                conversations[conv.id] = {
                    id: conv.id,
                    title: conv.title,
                    messages: [],
                    createdAt: new Date(conv.created_at).getTime(),
                    totalTokens: conv.total_tokens
                };
            });
            renderConversationList();
        }
    } catch (e) {
        console.error('Failed to load conversations:', e);
    }
}

// Default greeting message (no API call needed)
const DEFAULT_GREETING = `[Vietsub] Chào bạn! Mình là Teacher Da Vinci, giáo viên tiếng Anh của bạn.
[Vietsub] Mình sẽ giúp bạn học tiếng Anh một cách tự nhiên và thú vị. Bạn có thể hỏi mình về từ vựng, ngữ pháp, cách phát âm, hoặc luyện hội thoại.
[Vietsub] Bạn muốn bắt đầu với chủ đề gì hôm nay?
[Actions] Học từ vựng cơ bản | Luyện phát âm | Ngữ pháp tiếng Anh | Hội thoại giao tiếp`;

async function createNewConversation() {
    stopSpeaking();
    clearTTSCache();

    try {
        const res = await secureFetch('/api/conversations', { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            const conv = data.conversation;
            currentConversationId = conv.id;
            conversations[conv.id] = {
                id: conv.id,
                title: conv.title,
                messages: [],
                createdAt: new Date(conv.created_at).getTime(),
                totalTokens: 0
            };

            history.pushState({ conversationId: currentConversationId }, '', `?c=${currentConversationId}`);
            renderConversationList();

            // Show default greeting instead of empty chat
            showDefaultGreeting();
        }
    } catch (e) {
        console.error('Failed to create conversation:', e);
    }
}

function showDefaultGreeting() {
    chatMessages.innerHTML = '';
    welcomeSection.style.display = 'none';
    chatMessages.classList.add('active');

    // Add greeting message to UI (not saved to DB)
    addMessageToUI(DEFAULT_GREETING, 'assistant', null, 'completed', null);
}

async function loadConversation(id, forceReload = false) {
    if (!forceReload && id === currentConversationId) return;
    stopSpeaking();
    clearTTSCache();

    currentConversationId = id;

    // Close sidebar on mobile after selecting conversation
    if (window.innerWidth <= 768) {
        closeSidebar();
    }

    try {
        const res = await secureFetch(`/api/conversations/${id}`);
        if (res.ok) {
            const data = await res.json();
            const conv = data.conversation;

            conversations[id] = {
                id: conv.id,
                title: conv.title,
                messages: conv.messages.map(m => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    status: m.status || 'completed',
                    tokens: m.tokens
                })),
                createdAt: new Date(conv.created_at).getTime(),
                totalTokens: conv.total_tokens
            };

            history.pushState({ conversationId: id }, '', `?c=${id}`);
            renderConversationUI(conversations[id]);
            renderConversationList();
        }
    } catch (e) {
        console.error('Failed to load conversation:', e);
    }
}

function renderConversationUI(conv) {
    chatMessages.innerHTML = '';
    if (conv.messages.length > 0) {
        welcomeSection.style.display = 'none';
        chatMessages.classList.add('active');
        conv.messages.forEach(msg => {
            addMessageToUI(msg.content, msg.role, msg.tokens || null, msg.status || 'completed', msg.id);
        });
        setTimeout(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
        }, 50);
    } else {
        // Show default greeting for empty conversation
        showDefaultGreeting();
    }
}

// Undo delete conversation state
let deletedConversationId = null;
let deleteUndoTimeout = null;

async function deleteConversation(id, e) {
    e.stopPropagation();

    // Soft delete on server
    try {
        const res = await secureFetch(`/api/conversations/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            console.error('Failed to delete conversation');
            return;
        }
    } catch (err) {
        console.error('Failed to delete conversation:', err);
        return;
    }

    // Save ID for undo
    deletedConversationId = id;
    const wasCurrent = id === currentConversationId;

    // Remove from UI
    delete conversations[id];

    if (wasCurrent) {
        const remaining = Object.keys(conversations);
        if (remaining.length > 0) {
            await loadConversation(remaining[0]);
        } else {
            await createNewConversation();
        }
    } else {
        renderConversationList();
    }

    // Show undo toast
    showDeleteUndoToast();
}

function showDeleteUndoToast() {
    // Remove existing toast
    const existingToast = document.querySelector('.undo-toast');
    if (existingToast) existingToast.remove();
    if (deleteUndoTimeout) clearTimeout(deleteUndoTimeout);

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = `
        <span>Đã xóa cuộc trò chuyện</span>
        <button onclick="undoDeleteConversation()">Hoàn tác</button>
        <div class="undo-progress"></div>
    `;
    document.body.appendChild(toast);

    // Clear undo after 10s
    deleteUndoTimeout = setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
        deletedConversationId = null;
    }, 10000);
}

async function undoDeleteConversation() {
    if (!deletedConversationId) return;

    // Restore on server
    try {
        const res = await secureFetch('/api/conversations/restore', {
            method: 'POST',
            body: JSON.stringify({ id: deletedConversationId })
        });

        if (res.ok) {
            // Reload conversations to get restored one
            await loadConversations();
            await loadConversation(deletedConversationId);
        } else {
            const data = await res.json();
            console.error('Failed to restore:', data.error);
        }
    } catch (err) {
        console.error('Failed to restore conversation:', err);
    }

    // Remove toast
    const toast = document.querySelector('.undo-toast');
    if (toast) toast.remove();
    if (deleteUndoTimeout) clearTimeout(deleteUndoTimeout);

    deletedConversationId = null;
}

function renderConversationList() {
    const sorted = Object.values(conversations).sort((a, b) => b.createdAt - a.createdAt);
    conversationList.innerHTML = sorted.map(conv => `
        <div class="conversation-item ${conv.id === currentConversationId ? 'active' : ''}" 
             onclick="loadConversation('${conv.id}')" data-id="${conv.id}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="title">${conv.title}</span>
            <button class="btn-rename" onclick="startRenameConversation('${conv.id}', event)" title="Đổi tên">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            <button class="btn-delete" onclick="deleteConversation('${conv.id}', event)" title="Xóa">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
        </div>
    `).join('');
}

function startRenameConversation(id, e) {
    e.stopPropagation();
    const item = document.querySelector(`.conversation-item[data-id="${id}"]`);
    const titleSpan = item.querySelector('.title');
    const btnRename = item.querySelector('.btn-rename');
    const btnDelete = item.querySelector('.btn-delete');
    const currentTitle = conversations[id].title;

    if (btnRename) btnRename.style.display = 'none';
    if (btnDelete) btnDelete.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'title-input';
    input.value = currentTitle;
    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    const saveRename = async () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) {
            try {
                const res = await secureFetch(`/api/conversations/${id}/rename`, {
                    method: 'PUT',
                    body: JSON.stringify({ title: newTitle })
                });
                if (res.ok) {
                    conversations[id].title = newTitle;
                }
            } catch (err) {
                console.error('Rename error:', err);
            }
        }
        renderConversationList();
    };

    input.addEventListener('blur', saveRename);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            renderConversationList();
        }
    });
}

function resetChatUI() {
    chatMessages.innerHTML = '';
    chatMessages.classList.remove('active');
    welcomeSection.style.display = 'block';
}

// ==================== SIDEBAR FUNCTIONS ====================
function toggleSidebar() {
    const isMobile = window.innerWidth <= 768;
    const overlay = document.getElementById('sidebarOverlay');

    if (isMobile) {
        // On mobile, use 'open' class to show sidebar
        const isOpen = sidebar.classList.toggle('open');
        if (overlay) {
            overlay.classList.toggle('active', isOpen);
        }
    } else {
        // On desktop, use 'collapsed' class to hide sidebar
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
        document.getElementById('inputSection').classList.toggle('sidebar-collapsed');
    }
}

function closeSidebar() {
    sidebar.classList.remove('open');
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// ==================== VOICE FUNCTIONS ====================
let voicesData = null;

async function loadVoices() {
    try {
        const res = await fetch('/api/voices');
        voicesData = await res.json();

        const viSelect = document.getElementById('voiceVi');
        const enSelect = document.getElementById('voiceEn');

        viSelect.innerHTML = voicesData.voices.vi.map(v =>
            `<option value="${v.id}" ${v.id === voicesData.current.vi ? 'selected' : ''}>${v.name}</option>`
        ).join('');

        enSelect.innerHTML = voicesData.voices.en.map(v =>
            `<option value="${v.id}" ${v.id === voicesData.current.en ? 'selected' : ''}>${v.name}</option>`
        ).join('');
    } catch (e) {
        console.error('Error loading voices:', e);
    }
}

function toggleVoiceMenu() {
    const menu = document.getElementById('voiceMenu');
    const overlay = document.getElementById('voiceMenuOverlay');
    const isActive = menu.classList.contains('active');

    if (isActive) {
        menu.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    } else {
        menu.classList.add('active');
        if (overlay) overlay.classList.add('active');
    }
    document.getElementById('userMenu').classList.remove('active');
}

function closeVoiceMenu() {
    const menu = document.getElementById('voiceMenu');
    const overlay = document.getElementById('voiceMenuOverlay');
    menu.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

async function updateVoice() {
    const viVoice = document.getElementById('voiceVi').value;
    const enVoice = document.getElementById('voiceEn').value;

    try {
        await fetch('/api/voices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vi: viVoice, en: enVoice })
        });
    } catch (e) {
        console.error('Error updating voice:', e);
    }
}

// ==================== USER MENU FUNCTIONS ====================
function toggleUserMenu() {
    const menu = document.getElementById('userMenu');
    menu.classList.toggle('active');
    document.getElementById('voiceMenu').classList.remove('active');
}

function openAccount() {
    alert('Chức năng tài khoản đang phát triển');
    toggleUserMenu();
}

async function logout() {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
        try {
            await secureFetch('/api/logout', { method: 'POST' });
        } catch (e) { }
        window.location.href = '/login';
    }
}

async function loadUserInfo() {
    try {
        const res = await secureFetch('/api/me');
        if (res.ok) {
            const data = await res.json();
            const user = data.user;

            // Update header user menu (desktop)
            document.getElementById('userName').textContent = user.username;
            document.getElementById('userEmail').textContent = user.email;
            document.getElementById('userEmailTop').textContent = user.email;

            // Update sidebar user section
            const sidebarUserName = document.getElementById('sidebarUserName');
            const sidebarUserEmail = document.getElementById('sidebarUserEmail');
            const sidebarTokenText = document.getElementById('sidebarTokenText');
            const sidebarTokenSimple = document.getElementById('sidebarTokenSimple');
            const tokenProgress = document.getElementById('tokenProgress');

            if (sidebarUserName) sidebarUserName.textContent = user.username;
            if (sidebarUserEmail) sidebarUserEmail.textContent = user.email;

            // Calculate percentage
            const percentage = Math.round((user.total_tokens_used / user.token_limit) * 100);
            const limitFormatted = user.token_limit >= 1000000
                ? (user.token_limit / 1000000).toFixed(1) + '000.000'
                : user.token_limit >= 1000
                    ? Math.round(user.token_limit / 1000) + '.000'
                    : user.token_limit;

            document.getElementById('tokenUsageText').textContent =
                `Đã dùng ${percentage}% trong ${limitFormatted} credits`;

            // Update sidebar token display (mobile - full)
            if (sidebarTokenText) {
                sidebarTokenText.textContent = `Usage: ${user.total_tokens_used.toLocaleString()} / ${user.token_limit.toLocaleString()} credits`;
            }

            // Update sidebar token display (desktop - simple)
            if (sidebarTokenSimple) {
                sidebarTokenSimple.textContent = `Usage: ${user.total_tokens_used.toLocaleString()} / ${user.token_limit.toLocaleString()} credits`;
            }

            if (tokenProgress) {
                tokenProgress.style.width = `${Math.min(percentage, 100)}%`;
            }
        }
    } catch (e) {
        console.error('Failed to load user info:', e);
    }
}

// ==================== OPTIONS MENU ====================
function toggleOptionsMenu() {
    const menu = document.getElementById('optionsMenu');
    const btn = document.getElementById('optionsBtn');
    menu.classList.toggle('active');
    btn.classList.toggle('active');
}

function toggleVoiceMode() {
    isAutoSendMode = !isAutoSendMode;
    const toggle = document.getElementById('autoSendToggle');
    toggle.classList.toggle('active', isAutoSendMode);
}

function toggleAutoPlay() {
    isAutoPlayMode = !isAutoPlayMode;
    const toggle = document.getElementById('autoPlayToggle');
    toggle.classList.toggle('active', isAutoPlayMode);
}


// ==================== TTS FUNCTIONS ====================

// Extract English words/phrases from Vietnamese text
function extractEnglishFromVietnamese(text) {
    const segments = [];
    // Pattern to match English words (including hyphenated like "go-went-gone")
    const englishPattern = /([a-zA-Z][a-zA-Z\-']*(?:\s+[a-zA-Z][a-zA-Z\-']*)*)/g;

    let lastIndex = 0;
    let match;

    while ((match = englishPattern.exec(text)) !== null) {
        const englishWord = match[1];
        // Skip very short words that might be Vietnamese abbreviations
        if (englishWord.length < 2) continue;
        // Skip if it's just common Vietnamese words that look English
        if (/^(a|i|o|u|e)$/i.test(englishWord)) continue;

        // Add Vietnamese part before this English word
        const vietPart = text.substring(lastIndex, match.index).trim();
        if (vietPart) {
            segments.push({ text: vietPart, lang: 'vi' });
        }

        // Add English word
        segments.push({ text: englishWord, lang: 'en' });
        lastIndex = match.index + match[0].length;
    }

    // Add remaining Vietnamese part
    const remaining = text.substring(lastIndex).trim();
    if (remaining) {
        segments.push({ text: remaining, lang: 'vi' });
    }

    return segments.length > 0 ? segments : [{ text: text, lang: 'vi' }];
}

function splitByLanguage(text) {
    text = text.replace(/\[Actions\].*$/gi, '').trim();
    // Remove [Table] content completely (don't read tables)
    text = text.replace(/\[Table\][^[]*(?=\[|$)/gi, '');
    // Remove [Tip] content completely (don't read tips)
    text = text.replace(/\[Tip\][^[]*(?=\[|$)/gi, '');
    // Remove ** markdown
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    // Remove other markdown characters
    text = text.replace(/[*#_`~]/g, '');

    const segments = [];
    const pattern = /\[(Vietsub|Engsub)\]\s*([^[\]]*?)(?=\[(Vietsub|Engsub)\]|$)/gi;
    let match, hasTag = false;

    while ((match = pattern.exec(text)) !== null) {
        hasTag = true;
        let content = match[2].trim();
        if (!content || content.length < 2) continue;

        // Remove patterns like "A -", "B -", "C -" at the start
        content = content.replace(/^[A-Z]\s*-\s*/, '');
        // Remove double quotes
        content = content.replace(/"/g, '');
        // Replace / with space (e.g., "was/were" -> "was were")
        content = content.replace(/\//g, ' ');
        content = content.trim();

        if (!content || content.length < 2) continue;

        const lang = match[1].toLowerCase() === 'vietsub' ? 'vi' : 'en';

        // Simply add the segment without further splitting
        segments.push({ text: content, lang: lang });
    }

    if (!hasTag && text.trim()) {
        let cleanText = text.replace(/\[[^\]]*\]/g, '').trim();
        // Also replace / in fallback text
        cleanText = cleanText.replace(/\//g, ' ');
        if (cleanText && cleanText.length >= 2) {
            segments.push({ text: cleanText, lang: 'vi' });
        }
    }

    return segments;
}

// Pre-fetch TTS - only first 2 segments during streaming
const MAX_PREFETCH_DURING_STREAM = 2;

function prefetchTTS(text) {
    const tagPattern = /\[(Vietsub|Engsub)\]/gi;
    const tags = text.match(tagPattern) || [];
    const segments = splitByLanguage(text);
    if (segments.length === 0) return;

    const completedSegments = Math.max(0, tags.length - 1);

    // Only prefetch first 2 segments during streaming
    const maxToFetch = Math.min(completedSegments, MAX_PREFETCH_DURING_STREAM);

    for (let i = lastPrefetchedSegments; i < maxToFetch && i < segments.length; i++) {
        const seg = segments[i];
        if (!seg.text || seg.text.trim().length < 2) continue;

        const cacheKey = `${seg.lang}:${seg.text}`;
        if (ttsCache.has(cacheKey)) continue;

        ttsCache.set(cacheKey, 'fetching');

        fetch('/api/tts/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: seg.text, lang: seg.lang })
        })
            .then(res => res.ok ? res.blob() : null)
            .then(blob => {
                if (blob) {
                    ttsCache.set(cacheKey, URL.createObjectURL(blob));
                } else {
                    ttsCache.delete(cacheKey);
                }
            })
            .catch(() => ttsCache.delete(cacheKey));
    }

    lastPrefetchedSegments = Math.max(lastPrefetchedSegments, maxToFetch);
}

// Pre-fetch last segment when stream completes (only if within first 2)
function prefetchLastSegment(text) {
    const segments = splitByLanguage(text);
    if (segments.length === 0) return;

    // Only prefetch up to 2 segments total
    const maxToFetch = Math.min(segments.length, MAX_PREFETCH_DURING_STREAM);

    for (let i = lastPrefetchedSegments; i < maxToFetch; i++) {
        const seg = segments[i];
        if (!seg.text || seg.text.trim().length < 2) continue;

        const cacheKey = `${seg.lang}:${seg.text}`;
        if (ttsCache.has(cacheKey)) continue;

        ttsCache.set(cacheKey, 'fetching');

        fetch('/api/tts/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: seg.text, lang: seg.lang })
        })
            .then(res => res.ok ? res.blob() : null)
            .then(blob => {
                if (blob) {
                    ttsCache.set(cacheKey, URL.createObjectURL(blob));
                } else {
                    ttsCache.delete(cacheKey);
                }
            })
            .catch(() => ttsCache.delete(cacheKey));
    }

    lastPrefetchedSegments = maxToFetch;
}

function clearTTSCache() {
    ttsCache.forEach((value, key) => {
        if (value && value !== 'fetching') {
            URL.revokeObjectURL(value);
        }
    });
    ttsCache.clear();
    lastPrefetchedSegments = 0;
}

async function speakEnglish(text) {
    stopSpeaking();
    try {
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, lang: 'en', speed: 1.0 })
        });
        if (!response.ok) return;
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        currentAudio = new Audio(audioUrl);
        currentAudio.onended = () => URL.revokeObjectURL(audioUrl);
        currentAudio.play();
    } catch (e) {
        console.error('TTS error:', e);
    }
}

function stopSpeaking() {
    isSpeaking = false;
    isPlayingQueue = false;
    audioQueue = [];

    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }

    if (currentPlayingBtn) {
        currentPlayingBtn.innerHTML = svgIcons.play;
        currentPlayingBtn.classList.remove('playing');
        currentPlayingBtn = null;
    }
}

async function speakTextWithCallback(text, onComplete, btn) {
    stopSpeaking();

    isSpeaking = true;
    currentPlayingBtn = btn;
    if (btn) {
        btn.innerHTML = svgIcons.stop;
        btn.classList.add('playing');
    }

    const segments = splitByLanguage(text);
    console.log('[TTS] Total segments:', segments.length);

    if (segments.length === 0) {
        isSpeaking = false;
        if (btn) {
            btn.innerHTML = svgIcons.play;
            btn.classList.remove('playing');
        }
        currentPlayingBtn = null;
        if (onComplete) onComplete();
        return;
    }

    // Look-ahead fetch: fetch next 2 segments while playing current
    const LOOK_AHEAD = 2;

    async function fetchSegmentIfNeeded(index) {
        if (index >= segments.length) return;
        const seg = segments[index];
        if (!seg.text || seg.text.trim().length < 2) return;

        const cacheKey = `${seg.lang}:${seg.text}`;
        if (ttsCache.has(cacheKey)) return; // Already fetching or cached

        ttsCache.set(cacheKey, 'fetching');

        try {
            const res = await fetch('/api/tts/single', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: seg.text, lang: seg.lang })
            });
            if (res.ok) {
                const blob = await res.blob();
                ttsCache.set(cacheKey, URL.createObjectURL(blob));
            } else {
                ttsCache.delete(cacheKey);
            }
        } catch {
            ttsCache.delete(cacheKey);
        }
    }

    // Play segments sequentially
    for (let i = 0; i < segments.length; i++) {
        if (!isSpeaking) break;

        // Start fetching next segments (look-ahead)
        for (let j = 1; j <= LOOK_AHEAD; j++) {
            fetchSegmentIfNeeded(i + j);
        }

        const seg = segments[i];
        if (!seg.text || seg.text.trim().length < 2) {
            console.log(`[TTS] Skipping segment ${i}: too short`);
            continue;
        }

        console.log(`[TTS] Playing segment ${i}/${segments.length}`);

        try {
            const cacheKey = `${seg.lang}:${seg.text}`;
            let audioUrl = null;

            // Wait for cache (prefetch or look-ahead)
            for (let w = 0; w < 150 && isSpeaking; w++) { // Max 15 seconds
                const cached = ttsCache.get(cacheKey);
                if (cached && cached !== 'fetching') {
                    audioUrl = cached;
                    ttsCache.delete(cacheKey);
                    break;
                }
                if (cached === undefined) {
                    // Not in cache, fetch now
                    ttsCache.set(cacheKey, 'fetching');
                    const res = await fetch('/api/tts/single', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: seg.text, lang: seg.lang })
                    });
                    if (res.ok) {
                        const blob = await res.blob();
                        audioUrl = URL.createObjectURL(blob);
                    }
                    ttsCache.delete(cacheKey);
                    break;
                }
                await new Promise(r => setTimeout(r, 100));
            }

            if (!audioUrl || !isSpeaking) {
                console.log(`[TTS] Segment ${i} skipped`);
                continue;
            }

            // Play and wait
            await new Promise((resolve) => {
                currentAudio = new Audio(audioUrl);
                currentAudio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                };
                currentAudio.onerror = () => {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                };
                currentAudio.play().catch(() => {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                });
            });

        } catch (e) {
            console.error(`[TTS] Segment ${i} error:`, e);
        }
    }

    console.log('[TTS] All done');
    isSpeaking = false;
    if (btn) {
        btn.innerHTML = svgIcons.play;
        btn.classList.remove('playing');
    }
    currentPlayingBtn = null;
    if (onComplete) onComplete();
}

function toggleAudio(text, btn) {
    if (currentPlayingBtn === btn && isSpeaking) {
        stopSpeaking();
    } else {
        speakTextWithCallback(text, null, btn);
    }
}

// ==================== INPUT FUNCTIONS ====================
function setInputLocked(locked) {
    isProcessing = locked;
    messageInput.disabled = locked;
    if (!locked) {
        messageInput.focus();
    }
}

function updateSendButtonVisibility() {
    const hasText = messageInput.value.trim().length > 0;
    sendBtn.classList.toggle('has-text', hasText);

    const clearBtn = document.getElementById('clearTextBtn');
    if (clearBtn) {
        clearBtn.style.display = hasText ? 'flex' : 'none';
    }
}

function clearMessageText() {
    messageInput.value = '';
    messageInput.style.height = '24px';
    messageInput.classList.remove('multiline');
    updateSendButtonVisibility();
    messageInput.focus();
}

function showRecordingControls(show) {
    // Simplified - mic button now handles both states via CSS
}

function stopRecording() {
    if (recognition && isRecording) {
        manualStop = true;
        recognition.stop();
    }
}

function toggleMic() {
    if (isRecording) {
        // Stop recording
        stopRecording();
    } else {
        // Start recording
        startRecording();
    }
}

function autoResizeTextarea() {
    messageInput.style.height = '24px';
    const maxHeight = 96;
    const newHeight = Math.min(messageInput.scrollHeight, maxHeight);
    messageInput.style.height = newHeight + 'px';

    if (newHeight > 24) {
        messageInput.classList.add('multiline');
    } else {
        messageInput.classList.remove('multiline');
    }
}


// ==================== MESSAGE FORMATTING ====================
function extractActions(content) {
    const actionsMatch = content.match(/\[Actions\]\s*(.+?)$/i);
    if (actionsMatch) {
        const actionsText = actionsMatch[1].trim();
        return actionsText.split('|').map(a => a.trim()).filter(a => a);
    }
    return [];
}

function removeActionsTag(content) {
    return content.replace(/\[Actions\]\s*.+?$/i, '').trim();
}

function formatMarkdown(text) {
    text = text.replace(/^\*\*\*$/gm, '<hr class="divider">');
    // Fix: handle ** with any content including special chars
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    const lines = text.split('\n');
    let inList = false;
    let result = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const listMatch = line.match(/^(\d+)\.\s+(.+)$/);

        if (listMatch) {
            if (!inList) {
                inList = true;
            }
            result.push(`<div class="list-item"><span class="list-num">${listMatch[1]}.</span> ${listMatch[2]}</div>`);
        } else {
            if (inList) {
                result.push('</ul>');
                inList = false;
            }
            if (line.trim() === '') {
                result.push('<hr class="divider">');
            } else {
                result.push(line);
            }
        }
    }
    if (inList) inList = false;

    text = result.join('\n');
    text = text.replace(/\n(?!<)/g, '<br>');
    text = text.replace(/\n</g, '<');

    return text;
}

// Format table from [Table] tag
// Format: [Table] Header1 | Header2 | Header3 || Row1Col1 | Row1Col2 | Row1Col3 || ...
function formatTable(tableContent, isStreaming = false) {
    // Check if table is complete (has at least header and one data row)
    const hasDataRow = tableContent.includes('||');

    // If streaming and no complete row yet, show loading
    if (isStreaming && !hasDataRow) {
        return `<div class="table-loading">
            <div class="table-loading-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
            </div>
            <span>Đang tạo bảng...</span>
        </div>`;
    }

    const rows = tableContent.split('||').map(r => r.trim()).filter(r => r);
    if (rows.length === 0) return '';

    let html = '<div class="vocab-table-wrapper"><table class="vocab-table">';

    // First row is header
    if (rows.length > 0) {
        const headerCells = rows[0].split('|').map(c => c.trim());
        html += '<thead><tr>';
        headerCells.forEach(cell => {
            html += `<th>${cell}</th>`;
        });
        html += '</tr></thead>';
    }

    // Body rows
    if (rows.length > 1) {
        html += '<tbody>';
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].split('|').map(c => c.trim());
            html += '<tr>';
            cells.forEach((cell, idx) => {
                const isEnglish = isEnglishText(cell);

                if (isEnglish) {
                    // Remove ... for cleaner speech, use data-speak for safe encoding
                    const speakText = cell.replace(/\.\.\./g, '').trim();
                    html += `<td class="english-cell" data-speak="${encodeURIComponent(speakText)}">${cell}</td>`;
                } else {
                    html += `<td>${cell}</td>`;
                }
            });
            html += '</tr>';
        }
        html += '</tbody>';
    }

    html += '</table></div>';
    return html;
}

function isEnglishText(text) {
    const hasLatinLetters = /[a-zA-Z]/.test(text);
    const hasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
    return hasLatinLetters && !hasVietnamese;
}

function formatList(content) {
    const rows = content.split('||').map(r => r.trim()).filter(r => r);
    if (rows.length === 0) return '';

    let html = '<div class="generated-list-container">';

    rows.forEach(row => {
        const items = row.split('|').map(i => i.trim()).filter(i => i);
        if (items.length === 0) return;

        // First item is Header
        const header = items[0];
        const listItems = items.slice(1);

        html += '<div class="list-group">';
        html += `<div class="list-header">${header}</div>`;

        if (listItems.length > 0) {
            html += '<ul class="generated-list">';
            listItems.forEach(item => {
                let displayItem = item.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                // Clean text for TTS
                let speakText = item.replace(/\*\*/g, '').replace(/\.\.\./g, '');
                const isEnglish = isEnglishText(speakText);

                html += `<li>`;
                if (isEnglish) {
                    html += `<span class="list-content english-sentence" data-speak="${encodeURIComponent(speakText)}">${displayItem}</span>`;
                } else {
                    html += `<span class="list-content">${displayItem}</span>`;
                }
                html += `</li>`;
            });
            html += '</ul>';
        }
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function formatMessageContent(content, isStreaming = false) {
    const cleanContent = removeActionsTag(content);

    // Updated pattern to include [Table], [Tip], and [List] tags
    const pattern = /\[(Vietsub|Engsub|Table|Tip|List)\]\s*([^[\]]*?)(?=\[(Vietsub|Engsub|Table|Tip|List)\]|$)/gi;
    let result = '';
    let hasTag = false;
    let lastVietnamese = '';
    let inList = false;

    const matches = [];
    let match;
    while ((match = pattern.exec(cleanContent)) !== null) {
        matches.push({ tag: match[1].toLowerCase(), text: match[2].trim() });
    }

    for (let i = 0; i < matches.length; i++) {
        const { tag, text } = matches[i];
        hasTag = true;

        if (!text) continue;

        // Handle [Tip] tag
        if (tag === 'tip') {
            // Flush any pending Vietnamese text
            if (lastVietnamese) {
                result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span>`;
                lastVietnamese = '';
            }
            result += `<div class="tip-box">
                <div class="tip-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z"/>
                    </svg>
                </div>
                <span class="tip-text">${text}</span>
            </div>`;
        }
        // Handle [Table] tag
        else if (tag === 'table') {
            // Flush any pending Vietnamese text
            if (lastVietnamese) {
                result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span>`;
                lastVietnamese = '';
            }
            result += formatTable(text, isStreaming);
        } else if (tag === 'list') {
            // Flush any pending Vietnamese text
            if (lastVietnamese) {
                result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span>`;
                lastVietnamese = '';
            }
            result += formatList(text);
        } else if (tag === 'engsub') {
            const isGrammarPattern = text.includes('+');
            const cleanText = text.replace(/\*\*/g, '');

            if (isGrammarPattern) {
                if (lastVietnamese) {
                    result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span>`;
                    lastVietnamese = '';
                }
                const formattedText = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                result += `<span class="english-grammar">${formattedText}</span> `;
            } else {
                const nextMatch = matches[i + 1];
                const nextStartsWithColon = nextMatch && nextMatch.tag === 'vietsub' && /^:/.test(nextMatch.text);

                const endsWithColon = cleanText.trim().endsWith(':');
                const hasSentenceEnding = /[.!?](?:\s|$)/.test(cleanText) && !/\.(js|ts|py|go|rs|rb|php|css|html|json|xml|yaml|yml|md|txt|sh|bash|c|cpp|h|java|kt|swift|vue|jsx|tsx)$/i.test(cleanText);
                const isShort = endsWithColon || nextStartsWithColon || (cleanText.split(' ').length <= 6 && !hasSentenceEnding);

                // Use data-speak attribute to avoid escape issues with special characters
                const speakText = cleanText.replace(/\.\.\./g, '').trim();

                if (isShort) {
                    if (lastVietnamese) {
                        result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span>`;
                        lastVietnamese = '';
                    }
                    result += `<span class="english-word" data-speak="${encodeURIComponent(speakText)}">${cleanText}</span> `;
                } else {
                    if (lastVietnamese) {
                        result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span>`;
                        lastVietnamese = '';
                    }
                    const displayText = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                    result += `<span class="english-sentence" data-speak="${encodeURIComponent(speakText)}">${displayText}</span>`;
                }
            }
        } else {
            const listMatch = text.match(/^(\d+)\.\s*/);
            const isNewSection = text.startsWith('**');
            const hasDialogue = /\*\*[^*]+:\*\*/.test(text);

            if (text.includes('***')) {
                if (inList) {
                    if (lastVietnamese) result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span></li>`;
                    result += '</ul>';
                    inList = false;
                    lastVietnamese = '';
                }
                const parts = text.split('***');
                if (lastVietnamese) {
                    lastVietnamese += ' ' + parts[0].trim();
                    result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span>`;
                } else if (parts[0].trim()) {
                    result += `<span class="vietnamese-text">${formatMarkdown(parts[0].trim())}</span>`;
                }
                result += '<br><hr class="divider">';
                lastVietnamese = parts[1] ? parts[1].trim() : '';
            } else if (hasDialogue) {
                if (inList) {
                    if (lastVietnamese) result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span></li>`;
                    result += '</ul>';
                    inList = false;
                }
                if (lastVietnamese) {
                    result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span><br><br>`;
                    lastVietnamese = '';
                }
                const dialogueFormatted = text.replace(/\*\*([^*]+):\*\*/g, '<br><strong>$1:</strong>');
                const cleanDialogue = dialogueFormatted.replace(/^<br>/, '');
                result += `<span class="vietnamese-text">${cleanDialogue}</span><br>`;
            } else if (listMatch) {
                if (!inList) {
                    if (lastVietnamese) {
                        result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span>`;
                        lastVietnamese = '';
                    }
                    result += '<ul class="vocab-list">';
                    inList = true;
                } else if (lastVietnamese) {
                    result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span></li>`;
                    lastVietnamese = '';
                }
                result += `<li><span class="list-num">${listMatch[1]}.</span> `;
                lastVietnamese = text.replace(/^\d+\.\s*/, '');
            } else if (isNewSection) {
                if (inList) {
                    if (lastVietnamese) {
                        result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span></li>`;
                    }
                    result += '</ul><br>';
                    inList = false;
                    lastVietnamese = '';
                } else if (lastVietnamese) {
                    result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span><br><br>`;
                    lastVietnamese = '';
                }
                lastVietnamese = text;
            } else {
                lastVietnamese += (lastVietnamese ? ' ' : '') + text;
            }
        }
    }

    if (lastVietnamese) {
        result += `<span class="vietnamese-text">${formatMarkdown(lastVietnamese)}</span>`;
        if (inList) result += '</li>';
    }
    if (inList) result += '</ul>';

    if (!hasTag) {
        return `<span class="vietnamese-text">${formatMarkdown(cleanContent)}</span>`;
    }

    return result;
}


// ==================== MESSAGE UI ====================
function addMessageToUI(content, role, tokenInfo = null, status = 'completed', messageId = null) {
    welcomeSection.style.display = 'none';
    chatMessages.classList.add('active');

    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (messageId) div.dataset.messageId = messageId;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = role === 'user' ? svgIcons.user : createEyeAvatar();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (role === 'assistant') {
        contentDiv.classList.add('formatted-content');
        contentDiv.innerHTML = formatMessageContent(content);

        if (status === 'cancelled') {
            const cancelledDiv = document.createElement('div');
            cancelledDiv.className = 'message-cancelled';

            const cancelledText = document.createElement('span');
            cancelledText.className = 'cancelled-text';
            cancelledText.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg> Phản hồi bị gián đoạn';

            const continueBtn = document.createElement('button');
            continueBtn.className = 'btn-retry';
            continueBtn.textContent = 'Tiếp tục chat';
            continueBtn.onclick = continueChat;

            cancelledDiv.appendChild(cancelledText);
            cancelledDiv.appendChild(continueBtn);
            contentDiv.appendChild(cancelledDiv);
        }

        if (status === 'completed') {
            const suggestedActions = extractActions(content);
            if (suggestedActions.length > 0) {
                const actionsContainer = document.createElement('div');
                actionsContainer.className = 'suggested-actions';
                suggestedActions.forEach(action => {
                    const btn = document.createElement('button');
                    btn.className = 'suggested-action-btn';
                    btn.textContent = action;
                    btn.onclick = () => {
                        messageInput.value = action;
                        sendMessage();
                    };
                    actionsContainer.appendChild(btn);
                });
                contentDiv.appendChild(actionsContainer);
            }
        }
    } else {
        contentDiv.textContent = content;

        if (status === 'cancelled') {
            const cancelledDiv = document.createElement('div');
            cancelledDiv.className = 'message-cancelled';

            const cancelledText = document.createElement('span');
            cancelledText.className = 'cancelled-text';
            cancelledText.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg> Chưa nhận được phản hồi';

            const retryBtn = document.createElement('button');
            retryBtn.className = 'btn-retry';
            retryBtn.textContent = 'Thử lại';
            retryBtn.onclick = () => retryMessage(messageId, content);

            const continueBtn = document.createElement('button');
            continueBtn.className = 'btn-continue';
            continueBtn.textContent = 'Tiếp tục chat';
            continueBtn.onclick = continueChat;

            cancelledDiv.appendChild(cancelledText);
            cancelledDiv.appendChild(retryBtn);
            cancelledDiv.appendChild(continueBtn);
            contentDiv.appendChild(cancelledDiv);
        }
    }

    div.appendChild(avatar);
    div.appendChild(contentDiv);

    if (role === 'assistant') {
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        const audioBtn = document.createElement('button');
        audioBtn.className = 'btn-audio-toggle';
        audioBtn.innerHTML = svgIcons.play;
        audioBtn.title = 'Nghe';
        audioBtn.onclick = () => toggleAudio(removeActionsTag(content), audioBtn);
        actions.appendChild(audioBtn);

        if (tokenInfo && tokenInfo.total_tokens) {
            const tokenBadge = document.createElement('span');
            tokenBadge.className = 'token-badge';
            tokenBadge.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> ${tokenInfo.total_tokens.toLocaleString()} tokens`;
            actions.appendChild(tokenBadge);
        }

        contentDiv.appendChild(actions);
    }

    chatMessages.appendChild(div);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function showLoading() {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.id = 'loading';
    div.innerHTML = `<div class="message-avatar">${createEyeAvatar()}</div><div class="loading-dots"><span></span><span></span><span></span></div>`;
    chatMessages.appendChild(div);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function hideLoading() {
    const el = document.getElementById('loading');
    if (el) el.remove();
}

// ==================== STREAMING CONTROLS ====================
function showStopButton() {
    sendBtn.disabled = false;
    sendBtn.classList.add('stop-mode');
    sendBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>`;
    sendBtn.onclick = stopStreaming;
}

function hideStopButton() {
    sendBtn.classList.remove('stop-mode');
    sendBtn.disabled = false;
    sendBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.4 20.4l17.45-7.48c.81-.35.81-1.49 0-1.84L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/>
    </svg>`;
    sendBtn.onclick = sendMessage;
}

async function stopStreaming() {
    if (streamAbortController) {
        streamAbortController.abort();
    }
    if (currentStreamReader) {
        try {
            await currentStreamReader.cancel();
        } catch (e) { }
    }
}

function continueChat() {
    messageInput.focus();
}


// ==================== SEND MESSAGE ====================
async function retryMessage(messageId, content) {
    if (isProcessing) return;

    const msgDiv = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (msgDiv) {
        const cancelledDiv = msgDiv.querySelector('.message-cancelled');
        if (cancelledDiv) cancelledDiv.remove();
    }

    setInputLocked(true);
    showStopButton();
    clearTTSCache(); // Clear cache for new response

    streamAbortController = new AbortController();

    const streamDiv = document.createElement('div');
    streamDiv.className = 'message assistant';
    streamDiv.id = 'streaming-message';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = createEyeAvatar();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content formatted-content';
    contentDiv.innerHTML = '<span class="streaming-cursor"></span>';

    streamDiv.appendChild(avatar);
    streamDiv.appendChild(contentDiv);
    chatMessages.appendChild(streamDiv);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

    let fullResponse = '';
    let tokenInfo = {};
    let assistantMsgId = null;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: content,
                conversation_id: currentConversationId,
                retry_message_id: messageId
            }),
            signal: streamAbortController.signal
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Lỗi server');
        }

        const reader = res.body.getReader();
        currentStreamReader = reader;
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.type === 'init') {
                            assistantMsgId = data.assistant_message_id;
                            if (data.conversation_id && data.conversation_id !== currentConversationId) {
                                currentConversationId = data.conversation_id;
                            }
                        } else if (data.type === 'chunk') {
                            fullResponse += data.content;
                            contentDiv.innerHTML = formatMessageContent(fullResponse, true) + '<span class="streaming-cursor"></span>';
                            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                            // Pre-fetch TTS for completed segments
                            prefetchTTS(fullResponse);
                        } else if (data.type === 'done') {
                            tokenInfo = data.tokens || {};
                            assistantMsgId = data.assistant_message_id;
                            // Pre-fetch last segment when stream completes
                            prefetchLastSegment(fullResponse);
                        } else if (data.type === 'error') {
                            throw new Error(data.error);
                        }
                    } catch (e) {
                        if (e.message !== 'Unexpected end of JSON input') {
                            console.error('Parse error:', e);
                        }
                    }
                }
            }
        }

        streamDiv.remove();
        addMessageToUI(fullResponse, 'assistant', tokenInfo);
        loadConversations();

        // Auto play if enabled
        if (isAutoPlayMode) {
            const lastMsg = chatMessages.querySelector('.message.assistant:last-child .btn-audio-toggle');
            if (lastMsg) {
                speakTextWithCallback(fullResponse, () => setInputLocked(false), lastMsg);
            } else {
                setInputLocked(false);
            }
        } else {
            setInputLocked(false);
        }

    } catch (e) {
        const streamMsg = document.getElementById('streaming-message');
        if (streamMsg) streamMsg.remove();

        if (e.name === 'AbortError' || e.message.includes('body stream')) {
            if (fullResponse && assistantMsgId) {
                try {
                    const finalizeRes = await secureFetch(`/api/messages/${assistantMsgId}/finalize`, {
                        method: 'POST',
                        body: JSON.stringify({ status: 'cancelled' })
                    });
                    if (finalizeRes.ok) {
                        const finalizeData = await finalizeRes.json();
                        const estimatedTokens = finalizeData.message?.tokens || null;
                        addMessageToUI(fullResponse, 'assistant', estimatedTokens, 'cancelled');
                    } else {
                        addMessageToUI(fullResponse, 'assistant', null, 'cancelled');
                    }
                } catch (err) {
                    addMessageToUI(fullResponse, 'assistant', null, 'cancelled');
                }
            } else if (fullResponse) {
                addMessageToUI(fullResponse, 'assistant', null, 'cancelled');
            }
            loadConversations();
        } else {
            addMessageToUI('Lỗi: ' + e.message, 'assistant');
        }
        setInputLocked(false);
    } finally {
        hideStopButton();
        streamAbortController = null;
        currentStreamReader = null;
    }
}

async function sendMessage() {
    const msg = messageInput.value.trim();
    if (!msg || isProcessing) return;
    if (isRecording) recognition.stop();

    setInputLocked(true);
    showStopButton();
    clearTTSCache(); // Clear cache for new response

    streamAbortController = new AbortController();

    addMessageToUI(msg, 'user');
    messageInput.value = '';
    messageInput.style.height = '24px';
    messageInput.classList.remove('multiline');
    sendBtn.classList.remove('has-text');

    welcomeSection.style.display = 'none';
    chatMessages.classList.add('active');

    const streamDiv = document.createElement('div');
    streamDiv.className = 'message assistant';
    streamDiv.id = 'streaming-message';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = createEyeAvatar();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content formatted-content';
    contentDiv.innerHTML = '<span class="streaming-cursor"></span>';

    streamDiv.appendChild(avatar);
    streamDiv.appendChild(contentDiv);
    chatMessages.appendChild(streamDiv);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

    let fullResponse = '';
    let tokenInfo = {};
    let assistantMsgId = null;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, conversation_id: currentConversationId }),
            signal: streamAbortController.signal
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Lỗi server');
        }

        const reader = res.body.getReader();
        currentStreamReader = reader;
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const jsonStr = line.slice(6);
                        const data = JSON.parse(jsonStr);

                        if (data.type === 'init') {
                            assistantMsgId = data.assistant_message_id;
                            if (data.conversation_id && data.conversation_id !== currentConversationId) {
                                currentConversationId = data.conversation_id;
                                history.replaceState({ conversationId: currentConversationId }, '', `?c=${currentConversationId}`);
                            }
                        } else if (data.type === 'chunk') {
                            fullResponse += data.content;
                            contentDiv.innerHTML = formatMessageContent(fullResponse) + '<span class="streaming-cursor"></span>';
                            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                            // Pre-fetch TTS for completed segments
                            prefetchTTS(fullResponse);
                        } else if (data.type === 'done') {
                            tokenInfo = data.tokens || {};
                            assistantMsgId = data.assistant_message_id;
                            // Pre-fetch last segment when stream completes
                            prefetchLastSegment(fullResponse);

                            if (data.conversation_id && data.conversation_id !== currentConversationId) {
                                currentConversationId = data.conversation_id;
                                history.replaceState({ conversationId: currentConversationId }, '', `?c=${currentConversationId}`);
                            }
                        } else if (data.type === 'error') {
                            throw new Error(data.error);
                        }
                    } catch (e) {
                        if (e.message !== 'Unexpected end of JSON input') {
                            console.error('Parse error:', e, 'Line:', line);
                        }
                    }
                }
            }
        }

        streamDiv.remove();
        addMessageToUI(fullResponse, 'assistant', tokenInfo);

        if (conversations[currentConversationId]) {
            conversations[currentConversationId].messages.push(
                { role: 'user', content: msg },
                { role: 'assistant', content: fullResponse, tokens: tokenInfo }
            );
            conversations[currentConversationId].title = msg.substring(0, 30) + (msg.length > 30 ? '...' : '');
        }

        loadConversations();
        renderConversationList();

        // Auto play if enabled
        if (isAutoPlayMode) {
            const lastMsg = chatMessages.querySelector('.message.assistant:last-child .btn-audio-toggle');
            if (lastMsg) {
                speakTextWithCallback(fullResponse, () => setInputLocked(false), lastMsg);
            } else {
                setInputLocked(false);
            }
        } else {
            setInputLocked(false);
        }

    } catch (e) {
        const streamMsg = document.getElementById('streaming-message');
        if (streamMsg) streamMsg.remove();

        if (e.name === 'AbortError' || e.message.includes('body stream')) {
            if (fullResponse && assistantMsgId) {
                try {
                    const finalizeRes = await secureFetch(`/api/messages/${assistantMsgId}/finalize`, {
                        method: 'POST',
                        body: JSON.stringify({ status: 'cancelled' })
                    });
                    if (finalizeRes.ok) {
                        const finalizeData = await finalizeRes.json();
                        const estimatedTokens = finalizeData.message?.tokens || null;
                        addMessageToUI(fullResponse, 'assistant', estimatedTokens, 'cancelled');
                    } else {
                        addMessageToUI(fullResponse, 'assistant', null, 'cancelled');
                    }
                } catch (err) {
                    addMessageToUI(fullResponse, 'assistant', null, 'cancelled');
                }
            } else if (fullResponse) {
                addMessageToUI(fullResponse, 'assistant', null, 'cancelled');
            }
            loadConversations();
        } else {
            addMessageToUI('Lỗi: ' + e.message, 'assistant');
        }
        setInputLocked(false);
    } finally {
        hideStopButton();
        streamAbortController = null;
        currentStreamReader = null;
    }
}

function sendQuickMessage(msg) {
    messageInput.value = msg;
    sendMessage();
}


// ==================== SPEECH RECOGNITION ====================
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        isRecording = true;
        manualStop = false;
        micBtn.classList.add('recording');
        // Hide X button while recording
        document.getElementById('clearTextBtn').style.display = 'none';
    };

    recognition.onresult = (e) => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
        messageInput.value = accumulatedText + (accumulatedText ? ' ' : '') + transcript;
        autoResizeTextarea();
    };

    recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove('recording');

        // Show X button if has text
        updateSendButtonVisibility();

        if (manualStop && messageInput.value.trim()) {
            if (isAutoSendMode) {
                sendMessage();
            }
        }
        manualStop = false;
        accumulatedText = '';
    };

    recognition.onerror = (e) => {
        if (e.error === 'no-speech' && isRecording && !manualStop) {
            recognition.start();
            return;
        }
        isRecording = false;
        micBtn.classList.remove('recording');
        updateSendButtonVisibility();
        accumulatedText = '';
    };
}

// ==================== EVENT LISTENERS ====================
// Mic button click
micBtn.addEventListener('click', () => {
    if (!recognition || isProcessing) return;

    if (isRecording) {
        // Stop recording - keep text
        manualStop = true;
        recognition.stop();
    } else {
        // Start recording - continue from existing text
        stopSpeaking();
        accumulatedText = messageInput.value.trim();  // Keep existing text
        recognition.lang = 'vi-VN';
        recognition.start();
    }
});

// Input events
messageInput.addEventListener('input', () => {
    autoResizeTextarea();
    updateSendButtonVisibility();
});

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isProcessing) {
        e.preventDefault();
        sendMessage();
    }
});

// Text selection for vocabulary
document.addEventListener('mouseup', (e) => {
    setTimeout(() => {
        if (vocabPopup.contains(e.target)) return;
        handleTextSelection();
    }, 10);
});

// Click on data-speak elements (Table cells, List items)
document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-speak]');
    // Avoid conflict with specific audio buttons if any
    if (target && !e.target.closest('.btn-audio-toggle')) {
        const text = decodeURIComponent(target.dataset.speak);
        if (text) {
            speakTextWithCallback(text);
        }
    }
});

document.addEventListener('mousedown', (e) => {
    if (!vocabPopup.contains(e.target)) {
        hideVocabPopup();
    }
});

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.voice-selector') && !e.target.closest('.voice-menu')) {
        document.getElementById('voiceMenu').classList.remove('active');
        const overlay = document.getElementById('voiceMenuOverlay');
        if (overlay) overlay.classList.remove('active');
    }
    if (!e.target.closest('.user-profile') && !e.target.closest('.mobile-nav-item.user-nav-item') && !e.target.closest('.user-menu')) {
        document.getElementById('userMenu').classList.remove('active');
    }
    if (!e.target.closest('.input-options')) {
        document.getElementById('optionsMenu').classList.remove('active');
        document.getElementById('optionsBtn').classList.remove('active');
    }
});

// Eye tracking
document.addEventListener('mousemove', (e) => {
    document.querySelectorAll('.message.assistant .pupil').forEach(pupil => {
        const eye = pupil.parentElement;
        const rect = eye.getBoundingClientRect();
        const angle = Math.atan2(e.clientY - rect.top - 5, e.clientX - rect.left - 5);
        const dist = Math.min(2, Math.hypot(e.clientX - rect.left - 5, e.clientY - rect.top - 5) / 50);
        pupil.style.transform = `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px))`;
    });
});

// Browser back/forward
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.conversationId) {
        loadConversation(e.state.conversationId);
    }
});

// ==================== MOBILE FUNCTIONS ====================
// Check if mobile and adjust UI
function checkMobileView() {
    const isMobile = window.innerWidth <= 768;
    const inputSection = document.getElementById('inputSection');

    if (isMobile) {
        // Ensure sidebar is closed on mobile by default
        sidebar.classList.remove('open');
        sidebar.classList.add('collapsed');
        mainContent.classList.add('expanded');
        if (inputSection) inputSection.classList.add('sidebar-collapsed');

        // Close sidebar overlay
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) overlay.classList.remove('active');
    } else {
        // Desktop: restore sidebar if it was open
        if (!sidebar.classList.contains('collapsed')) {
            mainContent.classList.remove('expanded');
            if (inputSection) inputSection.classList.remove('sidebar-collapsed');
        }
    }
}

// Handle keyboard on mobile - adjust input position
function setupMobileKeyboard() {
    const input = document.getElementById('messageInput');
    const inputSection = document.getElementById('inputSection');

    if (!input || !inputSection) return;

    // Use visualViewport API for better keyboard detection
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            const keyboardHeight = window.innerHeight - window.visualViewport.height;
            if (keyboardHeight > 100) {
                // Keyboard is open
                inputSection.style.bottom = keyboardHeight + 'px';
            } else {
                // Keyboard is closed
                inputSection.style.bottom = '0';
            }
        });
    }

    // Fallback for older browsers
    input.addEventListener('focus', () => {
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    });
}

// Listen for resize
window.addEventListener('resize', checkMobileView);

// Event delegation for click-to-speak on elements with data-speak attribute
document.addEventListener('click', function (e) {
    const speakElement = e.target.closest('[data-speak]');
    if (speakElement) {
        const text = decodeURIComponent(speakElement.dataset.speak);
        if (text) {
            speakEnglish(text);
        }
    }
});

// ==================== INITIALIZATION ====================
(async function init() {
    await loadConversations();
    await loadVocabularies();
    loadVoices();
    loadUserInfo();
    checkMobileView();
    setupMobileKeyboard();

    const urlParams = new URLSearchParams(window.location.search);
    const urlConvId = urlParams.get('c');

    if (urlConvId && conversations[urlConvId]) {
        await loadConversation(urlConvId, true);
    } else if (Object.keys(conversations).length > 0) {
        const latest = Object.values(conversations).sort((a, b) => b.createdAt - a.createdAt)[0];
        await loadConversation(latest.id, true);
    } else {
        resetChatUI();
    }
})();
