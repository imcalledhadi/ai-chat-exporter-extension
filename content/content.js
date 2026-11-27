/**
 * AI Chat Exporter — Content Script
 * Injected into all supported AI chat pages.
 * Handles: platform detection, message parsing, floating export button injection,
 * and communication with the popup.
 */

// Load parsers and exporters (they share the same content script context)
// parsers.js and exporters.js are loaded before this file via manifest order

let _cachedChatData = null;
let _fabInjected = false;
let _injectTimeout = null;
let activeDropdown = null;

// User preferences & bot activation settings
let _userSettings = {
  showLimitTracker: true,
  showHandoffButton: true,
  showFloatingExportBtn: true,
  showResponseExportBtns: true,
  enableClaude: true,
  enableChatGPT: true,
  enableGemini: true,
  enableGrok: true,
  enableDeepSeek: true,
  enableMetaAI: true,
  enablePerplexity: true,
  enableCopilot: true,
  includeUserPrompts: true,
};

function isPlatformEnabled(platform) {
  if (!platform) return false;
  const map = {
    [PLATFORMS.CLAUDE]: _userSettings.enableClaude,
    [PLATFORMS.CHATGPT]: _userSettings.enableChatGPT,
    [PLATFORMS.GEMINI]: _userSettings.enableGemini,
    [PLATFORMS.GROK]: _userSettings.enableGrok,
    [PLATFORMS.DEEPSEEK]: _userSettings.enableDeepSeek,
    [PLATFORMS.META]: _userSettings.enableMetaAI,
    [PLATFORMS.PERPLEXITY]: _userSettings.enablePerplexity,
    [PLATFORMS.COPILOT]: _userSettings.enableCopilot,
  };
  return map[platform] !== false;
}

function applySettings() {
  const platform = detectPlatform();
  if (!platform) return;

  const enabled = isPlatformEnabled(platform);

  // If this bot is disabled, remove all injected UI elements
  if (!enabled) {
    document.getElementById('ace-fab')?.remove();
    document.getElementById('ace-input-limit-bar')?.remove();
    document.querySelectorAll('.ace-response-export-btn, .ace-export-dropdown').forEach(el => el.remove());
    _fabInjected = false;
    return;
  }

  // Floating Export Button (FAB)
  const fab = document.getElementById('ace-fab');
  if (!_userSettings.showFloatingExportBtn) {
    if (fab) fab.style.display = 'none';
  } else {
    if (fab) fab.style.display = '';
    else injectFab();
  }

  // Limit Tracker
  const limitBar = document.getElementById('ace-input-limit-bar');
  if (!_userSettings.showLimitTracker) {
    if (limitBar) limitBar.style.display = 'none';
  } else {
    if (limitBar) {
      limitBar.style.display = '';
    } else {
      injectTypeBoxLimitLine();
    }
  }

  // Handoff Button
  const handoffBtn = document.getElementById('aceLimitHandoffBtn');
  if (handoffBtn) {
    handoffBtn.style.display = _userSettings.showHandoffButton ? '' : 'none';
  }

  // Per-response buttons
  const respBtns = document.querySelectorAll('.ace-response-export-btn');
  respBtns.forEach(btn => {
    btn.style.display = _userSettings.showResponseExportBtns ? '' : 'none';
  });
}

function loadSettings(cb) {
  const storage = chrome.storage?.sync || chrome.storage?.local;
  if (!storage) {
    if (cb) cb();
    return;
  }
  storage.get(['ace_settings'], (res) => {
    if (res?.ace_settings) {
      _userSettings = Object.assign({}, _userSettings, res.ace_settings);
    }
    applySettings();
    if (cb) cb();
  });
}

// Live update when settings change in Options or Popup
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes.ace_settings) {
      _userSettings = Object.assign({}, _userSettings, changes.ace_settings.newValue || {});
      applySettings();
    }
  });
}

// ─────────────────────────────────────────────
// Floating Action Button (FAB) Injection (Draggable)
// ─────────────────────────────────────────────

function injectFab() {
  const platform = detectPlatform();
  if (!platform || !isPlatformEnabled(platform) || !_userSettings.showFloatingExportBtn) return;
  if (_fabInjected || document.getElementById('ace-fab')) return;
  _fabInjected = true;

  // Create FAB container
  const fab = document.createElement('div');
  fab.id = 'ace-fab';
  fab.innerHTML = `
    <!-- Main Draggable Floating Export Button -->
    <button class="ace-fab-btn" id="ace-fab-btn" title="AI Chat Exporter" aria-label="Export chat">
      <span class="ace-fab-grip" title="Hold to move">
        <svg viewBox="0 0 8 14" fill="currentColor" width="7" height="12">
          <circle cx="2" cy="2" r="1.2"/>
          <circle cx="6" cy="2" r="1.2"/>
          <circle cx="2" cy="7" r="1.2"/>
          <circle cx="6" cy="7" r="1.2"/>
          <circle cx="2" cy="12" r="1.2"/>
          <circle cx="6" cy="12" r="1.2"/>
        </svg>
      </span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ace-fab-icon">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span class="ace-fab-label">Export</span>
    </button>
    <div class="ace-fab-tooltip">Export Chat (Hold grip to move)</div>
  `;

  document.body.appendChild(fab);

  const fabBtn = document.getElementById('ace-fab-btn');
  const gripEl = fab.querySelector('.ace-fab-grip');
  const wasJustDragged = makeFabDraggable(fab, gripEl);

  fabBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (wasJustDragged()) {
      return;
    }
    // Open full export modal with message selection and history auto-loader
    openFabExportModal(fabBtn);
  });
}

function makeFabDraggable(fab, gripEl) {
  let isPointerDown = false;
  let isDragging = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;
  let justDragged = false;
  let pointerCaptured = false;
  const pad = 12;

  // Restore saved position from chrome.storage.local
  chrome.storage.local.get(['aceFabPos'], (res) => {
    if (res?.aceFabPos) {
      const pos = res.aceFabPos;
      const width = fab.offsetWidth || 130;
      const height = fab.offsetHeight || 44;
      const maxLeft = Math.max(pad, window.innerWidth - width - pad);
      const maxTop = Math.max(pad, window.innerHeight - height - pad);
      const left = Math.min(Math.max(pad, pos.left), maxLeft);
      const top = Math.min(Math.max(pad, pos.top), maxTop);

      fab.style.left = `${left}px`;
      fab.style.top = `${top}px`;
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
  });

  // Pointer event listeners on grip handle ("the dragger")
  gripEl.addEventListener('pointerdown', (e) => {
    // Only primary button
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();

    isPointerDown = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = fab.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    isDragging = false;
    pointerCaptured = false;

    try {
      gripEl.setPointerCapture(e.pointerId);
      pointerCaptured = true;
    } catch (_) {}
  });

  gripEl.addEventListener('pointermove', (e) => {
    // CRITICAL: NEVER move unless pointer is actively held down!
    if (!isPointerDown) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Only initiate drag after moving past threshold while held
    if (!isDragging && Math.hypot(dx, dy) > 3) {
      isDragging = true;
      fab.classList.add('ace-fab-dragging');
      closeActiveDropdown();
    }

    if (isDragging) {
      const rect = fab.getBoundingClientRect();
      const maxLeft = window.innerWidth - rect.width - pad;
      const maxTop = window.innerHeight - rect.height - pad;

      const newLeft = Math.min(Math.max(pad, startLeft + dx), maxLeft);
      const newTop = Math.min(Math.max(pad, startTop + dy), maxTop);

      fab.style.left = `${newLeft}px`;
      fab.style.top = `${newTop}px`;
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
  });

  function onPointerEnd(e) {
    if (!isPointerDown) return;
    isPointerDown = false;

    if (pointerCaptured) {
      try {
        gripEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
      pointerCaptured = false;
    }

    if (isDragging) {
      fab.classList.remove('ace-fab-dragging');
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 200);

      const rect = fab.getBoundingClientRect();
      chrome.storage.local.set({
        aceFabPos: {
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        }
      });
      isDragging = false;
    }
  }

  gripEl.addEventListener('pointerup', onPointerEnd);
  gripEl.addEventListener('pointercancel', onPointerEnd);

  // Keep button inside visible area on browser resize
  window.addEventListener('resize', () => {
    if (!fab.style.left || fab.style.left === 'auto') return;
    const rect = fab.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - pad;
    const maxTop = window.innerHeight - rect.height - pad;
    let left = rect.left;
    let top = rect.top;
    let adjusted = false;

    if (left > maxLeft) { left = Math.max(pad, maxLeft); adjusted = true; }
    if (top > maxTop) { top = Math.max(pad, maxTop); adjusted = true; }

    if (adjusted) {
      fab.style.left = `${left}px`;
      fab.style.top = `${top}px`;
      chrome.storage.local.set({ aceFabPos: { left: Math.round(left), top: Math.round(top) } });
    }
  });

  return () => justDragged;
}

let _isAutoScrolling = false;

function getChatScrollContainer() {
  const selectors = [
    // Claude
    '[data-testid="chat-messages"]',
    'main [class*="overflow-y-auto"]',
    // ChatGPT
    '[class*="react-scroll-to-bottom"]',
    'main div[class*="overflow-y-auto"]',
    // Gemini
    'infinite-scroller',
    '.conversation-container',
    'chat-window',
    // DeepSeek
    '[class*="chat-scroll"]',
    // General
    'main',
    '[role="main"]'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && (el.scrollHeight > el.clientHeight + 30 || el.scrollTop > 0)) {
      return el;
    }
  }

  const scrollables = Array.from(document.querySelectorAll('div, main, section, article')).filter(el => {
    if (el.clientHeight < 200) return false;
    const style = window.getComputedStyle(el);
    const overflow = style.overflowY;
    return (overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight + 40;
  });

  if (scrollables.length > 0) {
    scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return scrollables[0];
  }

  return document.scrollingElement || document.documentElement || document.body || window;
}

async function autoScrollLoadEntireChat(onProgress) {
  _isAutoScrolling = true;
  const container = getChatScrollContainer();
  const isWindow = container === window || container === document.documentElement || container === document.body || container === document.scrollingElement;

  let prevCount = (parseChat()?.messages?.length) || 0;
  let stagnantCount = 0;
  const maxRounds = 45;

  try {
    for (let round = 0; round < maxRounds; round++) {
      if (onProgress) {
        onProgress(prevCount, false, `Scanning chat history… (${prevCount} msgs found)`);
      }

      if (isWindow) {
        window.scrollTo(0, 0);
      } else {
        container.scrollTop = 0;
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
      }

      await new Promise(r => setTimeout(r, 450));

      const currentChat = parseChat();
      const currentCount = currentChat?.messages?.length || 0;
      const currentScrollTop = isWindow ? (window.scrollY || window.pageYOffset || 0) : container.scrollTop;

      if (currentCount > prevCount) {
        prevCount = currentCount;
        stagnantCount = 0;
      } else if (currentScrollTop <= 30) {
        stagnantCount++;
        if (stagnantCount >= 2) {
          break;
        }
      }
    }
  } finally {
    _isAutoScrolling = false;
  }

  const finalChat = parseChat();
  if (onProgress) {
    onProgress(finalChat?.messages?.length || prevCount, true, `All messages loaded! (${finalChat?.messages?.length || prevCount} total)`);
  }
  return finalChat;
}

function openFabExportModal(btn) {
  if (activeDropdown && activeDropdown._targetBtn === btn) {
    closeActiveDropdown();
    return;
  }
  closeActiveDropdown();

  let chatData = parseChat();
  if (!chatData || !chatData.messages) {
    chatData = { title: document.title || 'AI Chat', messages: [], platformMeta: getPlatformMeta(detectPlatform()) };
  }

  const platform = detectPlatform();
  const platformMeta = chatData.platformMeta || getPlatformMeta(platform) || { name: 'AI Chat', color: '#7c3aed' };

  let selectedFormat = _userSettings.defaultFormat || 'pdf';
  let selectedIndices = new Set(chatData.messages.map(m => m.index));
  let isCustomScope = false;
  let activeRoleFilter = 'all';

  const modal = document.createElement('div');
  modal.className = 'ace-export-modal ace-fab-modal';
  modal._targetBtn = btn;

  function renderModalContent() {
    const totalMsgs = chatData.messages.length;
    const selectedCount = selectedIndices.size;
    const formatLabels = {
      pdf: 'PDF',
      word: 'Word (.doc)',
      markdown: 'Markdown',
      html: 'HTML',
      txt: 'Plain Text',
      json: 'JSON',
    };

    modal.innerHTML = `
      <div class="ace-modal-header">
        <div class="ace-modal-title-row">
          <span>Export Conversation</span>
          <span class="ace-modal-badge">${platformMeta.name} · ${totalMsgs} msgs</span>
        </div>
        <button class="ace-modal-close-btn" id="aceModalCloseBtn" title="Close" aria-label="Close">✕</button>
      </div>

      <div class="ace-modal-body">
        <!-- Load Full Chat Banner -->
        <div class="ace-modal-load-bar" id="aceModalLoadBar">
          <div class="ace-modal-load-info">
            <span class="ace-modal-load-icon">⏫</span>
            <span id="aceModalLoadStatus">Need the whole chat? Older messages load on scroll.</span>
          </div>
          <button class="ace-modal-load-btn" id="aceModalLoadBtn" type="button">
            Load Full Chat
          </button>
        </div>

        <!-- Scope Switcher: All vs Choose Messages -->
        <div class="ace-modal-scope-row">
          <button class="ace-scope-tab ${!isCustomScope ? 'active' : ''}" id="aceScopeAll" type="button">
            All Messages (${totalMsgs})
          </button>
          <button class="ace-scope-tab ${isCustomScope ? 'active' : ''}" id="aceScopeCustom" type="button">
            Select Messages ✏️ (${selectedCount})
          </button>
        </div>

        <!-- Messages Selection Checklist Panel -->
        <div class="ace-modal-msgs-panel ${isCustomScope ? '' : 'ace-hidden'}" id="aceModalMsgsPanel">
          <div class="ace-msgs-toolbar">
            <button class="ace-link-btn" id="aceSelectAllMsgs" type="button">Select All</button>
            <span>·</span>
            <button class="ace-link-btn" id="aceDeselectAllMsgs" type="button">Deselect All</button>
            <div class="ace-msgs-filter">
              <button class="ace-filter-pill ${activeRoleFilter === 'all' ? 'active' : ''}" data-filter="all" type="button">All</button>
              <button class="ace-filter-pill ${activeRoleFilter === 'user' ? 'active' : ''}" data-filter="user" type="button">You</button>
              <button class="ace-filter-pill ${activeRoleFilter === 'assistant' ? 'active' : ''}" data-filter="assistant" type="button">AI</button>
            </div>
          </div>
          <div class="ace-msgs-list" id="aceModalMsgsList">
            ${chatData.messages.map(m => {
              const isSelected = selectedIndices.has(m.index);
              const preview = (m.text || '').substring(0, 75).replace(/\\s+/g, ' ');
              const roleTag = m.role === 'user' ? 'You' : (platformMeta.name || 'AI');
              const roleClass = m.role === 'user' ? 'user' : 'ai';
              const isVisible = activeRoleFilter === 'all' || m.role === activeRoleFilter;
              return `
                <div class="ace-msg-row ${isSelected ? 'selected' : ''}" data-index="${m.index}" data-role="${m.role}" style="${isVisible ? '' : 'display:none'}">
                  <div class="ace-msg-checkbox"></div>
                  <span class="ace-msg-role-tag ${roleClass}">${roleTag}</span>
                  <span class="ace-msg-snippet">${escapeHtml(preview)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Format Grid -->
        <div class="ace-modal-format-grid" id="aceModalFmtGrid">
          <button class="ace-modal-fmt-btn ${selectedFormat === 'pdf' ? 'selected' : ''}" data-format="pdf" type="button">
            <span class="ace-item-badge pdf">PDF</span>
            <span class="ace-modal-fmt-name">PDF</span>
          </button>
          <button class="ace-modal-fmt-btn ${selectedFormat === 'word' ? 'selected' : ''}" data-format="word" type="button">
            <span class="ace-item-badge word">DOC</span>
            <span class="ace-modal-fmt-name">Word</span>
          </button>
          <button class="ace-modal-fmt-btn ${selectedFormat === 'markdown' ? 'selected' : ''}" data-format="markdown" type="button">
            <span class="ace-item-badge md">MD</span>
            <span class="ace-modal-fmt-name">Markdown</span>
          </button>
          <button class="ace-modal-fmt-btn ${selectedFormat === 'html' ? 'selected' : ''}" data-format="html" type="button">
            <span class="ace-item-badge html">HTML</span>
            <span class="ace-modal-fmt-name">HTML</span>
          </button>
          <button class="ace-modal-fmt-btn ${selectedFormat === 'txt' ? 'selected' : ''}" data-format="txt" type="button">
            <span class="ace-item-badge txt">TXT</span>
            <span class="ace-modal-fmt-name">Plain Text</span>
          </button>
          <button class="ace-modal-fmt-btn ${selectedFormat === 'json' ? 'selected' : ''}" data-format="json" type="button">
            <span class="ace-item-badge json">JSON</span>
            <span class="ace-modal-fmt-name">JSON</span>
          </button>
        </div>

        <!-- Export Action Button -->
        <button class="ace-modal-export-btn" id="aceModalExportBtn" type="button" ${selectedCount === 0 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span id="aceModalExportText">${selectedCount === 0 ? 'Select at least 1 message' : `Export ${selectedCount} Messages as ${formatLabels[selectedFormat] || selectedFormat.toUpperCase()}`}</span>
        </button>
      </div>
    `;

    bindModalEvents();
  }

  function bindModalEvents() {
    modal.querySelector('#aceModalCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeActiveDropdown();
    });

    // Load full chat
    const loadBtn = modal.querySelector('#aceModalLoadBtn');
    const loadStatus = modal.querySelector('#aceModalLoadStatus');
    loadBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      loadBtn.disabled = true;
      loadBtn.textContent = 'Loading…';
      loadStatus.textContent = 'Auto-scrolling to top to load conversation…';

      await autoScrollLoadEntireChat((count, isDone, text) => {
        loadStatus.textContent = text;
      });

      chatData = parseChat() || chatData;
      selectedIndices = new Set(chatData.messages.map(m => m.index));
      renderModalContent();
    });

    // Scope tabs
    modal.querySelector('#aceScopeAll')?.addEventListener('click', (e) => {
      e.stopPropagation();
      isCustomScope = false;
      selectedIndices = new Set(chatData.messages.map(m => m.index));
      renderModalContent();
    });

    modal.querySelector('#aceScopeCustom')?.addEventListener('click', (e) => {
      e.stopPropagation();
      isCustomScope = true;
      renderModalContent();
    });

    // Message selection actions
    modal.querySelector('#aceSelectAllMsgs')?.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedIndices = new Set(chatData.messages.map(m => m.index));
      renderModalContent();
    });

    modal.querySelector('#aceDeselectAllMsgs')?.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedIndices = new Set();
      renderModalContent();
    });

    // Role filters
    modal.querySelectorAll('.ace-filter-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        activeRoleFilter = pill.dataset.filter;
        renderModalContent();
      });
    });

    // Message row toggles
    modal.querySelectorAll('.ace-msg-row').forEach(row => {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(row.dataset.index, 10);
        if (selectedIndices.has(idx)) {
          selectedIndices.delete(idx);
        } else {
          selectedIndices.add(idx);
        }
        renderModalContent();
      });
    });

    // Format buttons
    modal.querySelectorAll('.ace-modal-fmt-btn').forEach(fmtBtn => {
      fmtBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFormat = fmtBtn.dataset.format;
        renderModalContent();
      });
    });

    // Export button
    modal.querySelector('#aceModalExportBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedIndices.size === 0) return;
      const expBtn = modal.querySelector('#aceModalExportBtn');
      const expText = modal.querySelector('#aceModalExportText');
      if (expBtn) expBtn.disabled = true;
      if (expText) expText.textContent = 'Generating export…';

      chrome.storage.local.get(['aceOptions'], (result) => {
        const options = Object.assign({
          pageSize: _userSettings.pageType || 'A4',
          pageType: _userSettings.pageType || 'A4',
          pageBorder: _userSettings.pageBorder || 'normal',
          margins: _userSettings.pageBorder || 'normal',
          showTimestamps: true,
          showPageNumbers: true,
          selectedIndices: Array.from(selectedIndices),
        }, result?.aceOptions || {});

        runExport(selectedFormat, chatData, options);

        if (expText) expText.textContent = '✓ Export started! Check downloads';
        setTimeout(() => {
          closeActiveDropdown();
        }, 1200);
      });
    });
  }

  renderModalContent();
  document.body.appendChild(modal);
  activeDropdown = modal;

  // Position relative to FAB
  const fab = document.getElementById('ace-fab');
  const anchor = fab || btn;
  const rect = anchor.getBoundingClientRect();
  const modalWidth = 360;
  const modalHeight = Math.min(520, window.innerHeight - 30);

  let top = (rect.bottom + modalHeight > window.innerHeight)
    ? (rect.top - modalHeight - 10)
    : (rect.bottom + 10);
  if (top < 12) top = 12;

  let left = (rect.left + modalWidth > window.innerWidth)
    ? (rect.right - modalWidth)
    : rect.left;
  if (left < 12) left = 12;
  if (left + modalWidth > window.innerWidth - 12) {
    left = window.innerWidth - modalWidth - 12;
  }

  modal.style.top = `${top}px`;
  modal.style.left = `${left}px`;
}

// ─────────────────────────────────────────────
// Type Box Limit Line (Directly Below Type Box)
// ─────────────────────────────────────────────

function findTypeBox() {
  const platform = detectPlatform();

  // 1. Claude: fieldset is always the exact visual type box
  if (platform === PLATFORMS.CLAUDE) {
    const fieldset = document.querySelector('fieldset');
    if (fieldset && fieldset.offsetWidth > 100) return fieldset;
  }

  // 2. ChatGPT: #composer-background or form is the exact visual card
  if (platform === PLATFORMS.CHATGPT) {
    const composerBg = document.querySelector('#composer-background');
    if (composerBg && composerBg.offsetWidth > 100) return composerBg;
    const form = document.querySelector('form');
    if (form && form.offsetWidth > 100) return form;
  }

  // 3. Grok: Look for the capsule card enclosing the textarea and action buttons
  if (platform === PLATFORMS.GROK) {
    const input = document.querySelector('textarea, [contenteditable="true"]');
    if (input) {
      const card = input.closest('form, div[class*="rounded-2xl"], div[class*="rounded-3xl"], div[class*="rounded-xl"], div[class*="border"]');
      if (card && card.offsetWidth > 100 && card.offsetWidth < window.innerWidth * 0.95) return card;
    }
  }

  // 4. Gemini: The whole input pill is encapsulated by <input-area-v2> or .chat-input-container
  if (platform === PLATFORMS.GEMINI) {
    const inputAreaV2 = document.querySelector('input-area-v2, .input-area-v2, input-area');
    if (inputAreaV2 && inputAreaV2.offsetWidth > 100) {
      return inputAreaV2;
    }
    const chatInputContainer = document.querySelector('.chat-input-container, .input-area-container');
    if (chatInputContainer && chatInputContainer.offsetWidth > 100) {
      return chatInputContainer;
    }
    const richTextarea = document.querySelector('rich-textarea, [contenteditable="true"], textarea');
    if (richTextarea) {
      let curr = richTextarea.parentElement;
      let topContainer = null;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        if (curr.tagName.toLowerCase() === 'main' || curr.offsetWidth >= window.innerWidth * 0.95) break;
        const style = window.getComputedStyle(curr);
        const radius = parseFloat(style.borderRadius) || 0;
        const bg = style.backgroundColor;
        const hasBg = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
        const hasButtons = curr.querySelectorAll('button, [role="button"]').length > 0;
        if ((radius >= 16 || hasBg) && hasButtons) {
          topContainer = curr;
        }
        curr = curr.parentElement;
      }
      if (topContainer) return topContainer;
    }
  }

  // Universal resolution: walk up from the input to find the styled capsule/box
  const input = document.querySelector(
    'div[contenteditable], [contenteditable="true"], #prompt-textarea, textarea, .ql-editor, fieldset [data-placeholder], fieldset [tabindex="0"]'
  );
  if (!input) {
    return document.querySelector('fieldset, form[action*="converse"], form');
  }

  let curr = input.parentElement;
  let candidate = input;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    const tag = curr.tagName.toLowerCase();
    if (tag === 'fieldset' || tag === 'form') {
      candidate = curr;
      break;
    }

    try {
      const style = window.getComputedStyle(curr);
      const radius = parseFloat(style.borderRadius) || 0;
      const border = parseFloat(style.borderWidth) || 0;
      const bg = style.backgroundColor;
      const hasBg = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
      const hasButtons = curr.querySelectorAll('button, [role="button"]').length > 0;

      // Visual box criteria: rounded corners (>=10px) or border/bg, holding action buttons,
      // and NOT a full-screen layout wrapper
      if ((radius >= 10 || (border > 0 && hasBg)) && hasButtons) {
        if (curr.offsetWidth > 150 && curr.offsetWidth < window.innerWidth * 0.95) {
          candidate = curr;
          break;
        }
      }
    } catch (_) {}

    curr = curr.parentElement;
  }

  return candidate || input.closest('fieldset, form') || input.parentElement;
}

function syncLimitBarWidth(limitBar, typeBox) {
  if (!limitBar || !typeBox) return;

  // Look for visual pill inside typeBox if typeBox itself is full-width (e.g. Gemini outer container or Grok layout)
  let target = typeBox;
  const pillChild = typeBox.querySelector('.input-and-button-container, .input-area, [class*="input-and-button"], [class*="composer-background"], fieldset, form');
  if (pillChild && pillChild.offsetWidth > 150 && pillChild.offsetWidth <= 860) {
    target = pillChild;
  }

  const rect = target.getBoundingClientRect();
  let width = Math.round(rect.width);
  // Cap at standard maximum AI composer width (never stretch across full screen)
  if (width > 860) {
    width = 820;
  }
  if (width > 80) {
    limitBar.style.setProperty('width', `${width}px`, 'important');
    limitBar.style.setProperty('max-width', `${width}px`, 'important');
    limitBar.style.setProperty('min-width', `${Math.min(width, 280)}px`, 'important');
  }
}

function injectTypeBoxLimitLine() {
  const platform = detectPlatform();
  if (!platform || !isPlatformEnabled(platform) || !_userSettings.showLimitTracker) return;

  const typeBox = findTypeBox();
  if (!typeBox) return;

  let limitBar = document.getElementById('ace-input-limit-bar');
  if (!limitBar) {
    limitBar = document.createElement('div');
    limitBar.id = 'ace-input-limit-bar';
    limitBar.className = 'ace-input-limit-bar';
    limitBar.innerHTML = `
      <div class="ace-limit-bar-header">
        <div class="ace-limit-bar-left">
          <span class="ace-limit-dot"></span>
          <span class="ace-limit-percent-text" id="aceLimitPercentText">Free limit: <strong>0%</strong> used</span>
          <span class="ace-limit-sep">·</span>
          <span class="ace-limit-tokens-text" id="aceLimitTokensText">0 / 100k tokens</span>
        </div>
        <button type="button" class="ace-limit-handoff-link" id="aceLimitHandoffBtn" title="Continue this chat in another AI (ChatGPT, Gemini, etc.)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px">
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          </svg>
          <span>Continue in…</span>
        </button>
      </div>
      <div class="ace-limit-bar-track">
        <div class="ace-limit-bar-fill" id="aceLimitBarFill" style="width: 0%"></div>
      </div>
    `;

    limitBar.querySelector('#aceLimitHandoffBtn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleHandoffDropdown(limitBar.querySelector('#aceLimitHandoffBtn'));
    });
  }

  // Update handoff button visibility from user settings
  const handoffBtn = limitBar.querySelector('#aceLimitHandoffBtn');
  if (handoffBtn) {
    handoffBtn.style.display = _userSettings.showHandoffButton ? '' : 'none';
  }

  // Ensure it's placed directly below the type box
  if (limitBar.previousElementSibling !== typeBox) {
    typeBox.insertAdjacentElement('afterend', limitBar);
  }

  // Observe resizing of the type box to always keep width identical
  if (window.ResizeObserver && !typeBox._aceObserved) {
    typeBox._aceObserved = true;
    const ro = new ResizeObserver(() => {
      syncLimitBarWidth(limitBar, typeBox);
    });
    ro.observe(typeBox);
  }

  // Attach live typing listener
  attachInputTypingListener(typeBox);

  syncLimitBarWidth(limitBar, typeBox);
  updateLimitBarValues();
}

let _limitUpdateTimeout = null;
function attachInputTypingListener(typeBox) {
  if (!typeBox || typeBox._aceInputAttached) return;
  typeBox._aceInputAttached = true;

  typeBox.addEventListener('input', () => {
    if (_limitUpdateTimeout) clearTimeout(_limitUpdateTimeout);
    _limitUpdateTimeout = setTimeout(() => {
      updateLimitBarValues();
    }, 400);
  });
}

function updateLimitBarValues() {
  const percentText = document.getElementById('aceLimitPercentText');
  const tokensText = document.getElementById('aceLimitTokensText');
  const fill = document.getElementById('aceLimitBarFill');
  const dot = document.querySelector('#ace-input-limit-bar .ace-limit-dot');
  const handoffBtn = document.getElementById('aceLimitHandoffBtn');

  if (!percentText || !fill) return;

  try {
    const chatData = parseChat();
    if (!chatData || !chatData.stats) return;

    const stats = chatData.stats;
    const pct = stats.percentUsed;
    const tokensFormatted = stats.totalTokens >= 1000
      ? `${(stats.totalTokens / 1000).toFixed(1)}k`
      : `${stats.totalTokens}`;
    const limitFormatted = `${(stats.limit / 1000).toFixed(0)}k`;

    // CASE 1: Free limit is REACHED (100%)
    if (stats.isLimitReached) {
      const resetPart = stats.resetTime ? ` · Resets at ${stats.resetTime}` : '';
      percentText.innerHTML = `Free limit: <strong style="color:#ef4444;font-weight:700">100% reached</strong>`;
      tokensText.innerHTML = `<span style="color:#ef4444;font-weight:600">0 msgs left</span>${resetPart}`;
      fill.style.width = '100%';
      fill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
      if (dot) {
        dot.style.background = '#ef4444';
        dot.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.9)';
      }
      if (handoffBtn) {
        handoffBtn.classList.add('ace-pulse-attention');
        handoffBtn.title = `Free limit reached! Click to continue this chat in ChatGPT, Gemini, or DeepSeek`;
      }
      return;
    }

    // CASE 2: Limit approaching with explicit confirmed remaining messages / reset time from the platform
    if (stats.msgsRemaining !== null && stats.msgsRemaining !== undefined && stats.resetTime) {
      percentText.innerHTML = `Free limit: <strong style="color:#f59e0b">${pct}%</strong> used`;
      tokensText.textContent = `${stats.msgsRemaining} msgs left (Resets at ${stats.resetTime})`;
      fill.style.width = `${pct}%`;
      fill.style.background = 'linear-gradient(90deg, #f59e0b, #f97316)';
      if (dot) {
        dot.style.background = '#f59e0b';
        dot.style.boxShadow = '0 0 6px #f59e0b';
      }
      if (handoffBtn) {
        handoffBtn.classList.remove('ace-pulse-attention');
      }
      return;
    }

    // CASE 3: Normal token counter (exact tokens only, no arbitrary estimates)
    if (handoffBtn) {
      handoffBtn.classList.remove('ace-pulse-attention');
    }

    percentText.innerHTML = `Free limit: <strong>${pct}%</strong> used`;
    tokensText.textContent = `${tokensFormatted} / ${limitFormatted} tokens`;
    fill.style.width = `${pct}%`;

    if (pct >= 85) {
      fill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
      if (dot) {
        dot.style.background = '#ef4444';
        dot.style.boxShadow = '0 0 6px #ef4444';
      }
    } else if (pct >= 60) {
      fill.style.background = 'linear-gradient(90deg, #f59e0b, #f97316)';
      if (dot) {
        dot.style.background = '#f59e0b';
        dot.style.boxShadow = '0 0 6px #f59e0b';
      }
    } else {
      fill.style.background = 'linear-gradient(90deg, #10b981, #06b6d4)';
      if (dot) {
        dot.style.background = '#10b981';
        dot.style.boxShadow = '0 0 6px #10b981';
      }
    }
  } catch (_) {}
}

// ─────────────────────────────────────────────
// Floating Handoff Dropdown
// ─────────────────────────────────────────────

const AGENT_URLS = {
  chatgpt:  'https://chatgpt.com',
  gemini:   'https://gemini.google.com/app',
  deepseek: 'https://chat.deepseek.com',
  grok:     'https://grok.com',
  claude:   'https://claude.ai/new',
};

function toggleHandoffDropdown(btn) {
  if (activeDropdown && activeDropdown._isHandoff) {
    closeActiveDropdown();
    return;
  }
  closeActiveDropdown();

  const dropdown = document.createElement('div');
  dropdown.className = 'ace-export-dropdown ace-handoff-dropdown';
  dropdown._targetBtn = btn;
  dropdown._isHandoff = true;
  dropdown.innerHTML = `
    <div class="ace-dropdown-header">Continue Chat In</div>
    <div class="ace-dropdown-items">
      <button class="ace-dropdown-item" data-agent="chatgpt">
        <span class="ace-item-badge" style="background:rgba(16,163,127,0.2);color:#10a37f">GPT</span>
        <span class="ace-item-label">ChatGPT (GPT-4o)</span>
      </button>
      <button class="ace-dropdown-item" data-agent="gemini">
        <span class="ace-item-badge" style="background:rgba(66,133,244,0.2);color:#4285f4">GEM</span>
        <span class="ace-item-label">Google Gemini</span>
      </button>
      <button class="ace-dropdown-item" data-agent="deepseek">
        <span class="ace-item-badge" style="background:rgba(78,110,242,0.2);color:#4e6ef2">DS</span>
        <span class="ace-item-label">DeepSeek (R1 / V3)</span>
      </button>
      <button class="ace-dropdown-item" data-agent="grok">
        <span class="ace-item-badge" style="background:rgba(231,231,231,0.2);color:#e7e7e7">GROK</span>
        <span class="ace-item-label">xAI Grok</span>
      </button>
      <button class="ace-dropdown-item" data-agent="claude">
        <span class="ace-item-badge" style="background:rgba(217,119,6,0.2);color:#d97706">CLD</span>
        <span class="ace-item-label">New Claude Chat</span>
      </button>
    </div>
  `;

  dropdown.querySelectorAll('.ace-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      executeHandoff(item.dataset.agent);
      closeActiveDropdown();
    });
  });

  document.body.appendChild(dropdown);
  activeDropdown = dropdown;

  // Position above the handoff button
  const rect = btn.getBoundingClientRect();
  const dropdownHeight = 220;
  const dropdownWidth = 210;

  let top = rect.top - dropdownHeight - 8;
  if (top < 10) top = rect.bottom + 8;
  let left = rect.right - dropdownWidth;
  if (left < 10) left = 10;

  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
}

async function executeHandoff(agent) {
  const targetUrl = AGENT_URLS[agent];
  if (!targetUrl) return;

  const chatData = parseChat();
  if (!chatData || !chatData.messages) return;

  const platformName = chatData.platformMeta?.name || 'Claude';

  let p = `[CONTINUING CONVERSATION FROM ${platformName.toUpperCase()}]\n`;
  p += `Topic: ${chatData.title}\n\n`;
  p += `We reached our usage limit on ${platformName}. Here is the complete transcript of our conversation so far:\n\n`;
  p += `--------------------------------------------------\n`;

  chatData.messages.forEach(m => {
    const role = m.role === 'user' ? 'YOU (User)' : `${platformName} (Assistant)`;
    p += `\n[${role}]:\n${(m.text || '').trim()}\n`;
  });

  p += `\n--------------------------------------------------\n\n`;
  p += `Please review the context above and confirm you are ready to continue smoothly from where we left off. My next question / request will follow.`;

  // Store in chrome.storage.local for destination tab to auto-inject
  await chrome.storage.local.set({
    acePendingHandoff: {
      targetAgent: agent,
      prompt: p,
      sourcePlatform: platformName,
      timestamp: Date.now(),
    }
  });

  // Also copy to clipboard as reliable fallback
  try {
    await navigator.clipboard.writeText(p);
  } catch (_) {}

  // Open the target AI in a new tab
  chrome.runtime.sendMessage({ action: 'openTab', url: targetUrl });
}

// ─────────────────────────────────────────────
// Destination AI Auto-Insertion Receiver
// ─────────────────────────────────────────────

async function checkPendingHandoff() {
  try {
    const result = await new Promise(r => chrome.storage.local.get(['acePendingHandoff'], r));
    const handoff = result?.acePendingHandoff;
    if (!handoff || !handoff.prompt) return;

    // Check expiration (5 minutes)
    if (Date.now() - handoff.timestamp > 300000) {
      chrome.storage.local.remove(['acePendingHandoff']);
      return;
    }

    const platform = detectPlatform();
    const target = handoff.targetAgent;
    const isTarget = (target === 'chatgpt' && platform === 'chatgpt') ||
                     (target === 'gemini' && platform === 'gemini') ||
                     (target === 'deepseek' && platform === 'deepseek') ||
                     (target === 'grok' && platform === 'grok') ||
                     (target === 'claude' && platform === 'claude');

    if (!isTarget) return;

    // Remove pending so it doesn't fire again
    await chrome.storage.local.remove(['acePendingHandoff']);

    // Polling until chat input appears on the target page
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const input = document.querySelector(
        '#prompt-textarea, textarea, div[contenteditable="true"], .ql-editor'
      );

      if (input) {
        clearInterval(timer);
        insertPromptIntoInput(input, handoff.prompt, handoff.sourcePlatform);
      } else if (attempts > 30) {
        clearInterval(timer);
      }
    }, 600);
  } catch (_) {}
}

function insertPromptIntoInput(input, prompt, sourcePlatform) {
  input.focus();
  if (input.tagName.toLowerCase() === 'textarea') {
    input.value = prompt;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // Contenteditable (Claude, Gemini)
    document.execCommand('insertText', false, prompt);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  showHandoffBanner(sourcePlatform || 'Claude');
}

function showHandoffBanner(source) {
  if (document.querySelector('.ace-handoff-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'ace-handoff-banner';
  banner.innerHTML = `
    <span>✨ Conversation context transferred from <strong>${escapeHtml(source)}</strong>! Ready to continue.</span>
    <button class="ace-banner-close" title="Dismiss">&times;</button>
  `;
  document.body.appendChild(banner);

  banner.querySelector('.ace-banner-close').addEventListener('click', () => banner.remove());
  setTimeout(() => banner?.remove(), 8000);
}

// ─────────────────────────────────────────────
// Per-Response Export Button Injection
// ─────────────────────────────────────────────

function injectResponseButtons() {
  const platform = detectPlatform();
  if (!platform || !isPlatformEnabled(platform) || !_userSettings.showResponseExportBtns) return;

  // Find action bars across all supported platforms
  const bars = new Set();

  // Strategy 1: Find Copy / Retry / Feedback buttons NOT inside code blocks
  const actionBtns = document.querySelectorAll(
    'button[aria-label*="Copy" i], button[title*="Copy" i], button[data-testid*="copy" i], ' +
    'button[aria-label*="Retry" i], button[aria-label*="Try again" i], button[data-testid*="retry" i], ' +
    'button[aria-label*="Good response" i], button[aria-label*="Bad response" i]'
  );

  actionBtns.forEach(btn => {
    if (btn.closest('pre, code, [class*="code-block"], [class*="codeBlock"], [class*="highlight"], textarea, input')) {
      return;
    }
    if (btn.closest('header, nav, aside, [role="navigation"]')) {
      return;
    }
    const bar = btn.parentElement;
    if (bar && !bar.querySelector('.ace-response-export-btn')) {
      bars.add(bar);
    }
  });

  // Strategy 2: Common action bar container selectors
  const barSelectors = [
    '[data-testid="action-bar"]',
    '.response-action-buttons',
    '[class*="action-buttons"]',
    '[class*="actions-container"]',
    '[class*="message-actions"]',
    '[class*="MessageActions"]'
  ];

  barSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(bar => {
      if (!bar.closest('pre, code, header, nav') && !bar.querySelector('.ace-response-export-btn')) {
        bars.add(bar);
      }
    });
  });

  // Inject export button into each detected action bar
  bars.forEach(bar => {
    if (bar.querySelector('.ace-response-export-btn')) return;

    const exportBtn = document.createElement('button');
    exportBtn.className = 'ace-response-export-btn';
    exportBtn.type = 'button';
    exportBtn.title = 'Export this response';
    exportBtn.setAttribute('aria-label', 'Export this response');
    exportBtn.innerHTML = `
      <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `;

    exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleExportDropdown(exportBtn);
    });

    bar.appendChild(exportBtn);
  });
}

// ─────────────────────────────────────────────
// Export Dropdown Menu
// ─────────────────────────────────────────────

function closeActiveDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

function toggleExportDropdown(btn) {
  if (activeDropdown && activeDropdown._targetBtn === btn) {
    closeActiveDropdown();
    return;
  }
  closeActiveDropdown();

  const dropdown = document.createElement('div');
  dropdown.className = 'ace-export-dropdown';
  dropdown._targetBtn = btn;
  dropdown.innerHTML = `
    <div class="ace-dropdown-header">Export Response</div>
    <div class="ace-dropdown-items">
      <button class="ace-dropdown-item" data-format="pdf">
        <span class="ace-item-badge pdf">PDF</span>
        <span class="ace-item-label">Print / Save as PDF</span>
      </button>
      <button class="ace-dropdown-item" data-format="word">
        <span class="ace-item-badge word">DOC</span>
        <span class="ace-item-label">Word Document (.doc)</span>
      </button>
      <button class="ace-dropdown-item" data-format="markdown">
        <span class="ace-item-badge md">MD</span>
        <span class="ace-item-label">Markdown (.md)</span>
      </button>
      <button class="ace-dropdown-item" data-format="html">
        <span class="ace-item-badge html">HTML</span>
        <span class="ace-item-label">Web Page (.html)</span>
      </button>
      <button class="ace-dropdown-item" data-format="txt">
        <span class="ace-item-badge txt">TXT</span>
        <span class="ace-item-label">Plain Text (.txt)</span>
      </button>
      <button class="ace-dropdown-item" data-format="json">
        <span class="ace-item-badge json">JSON</span>
        <span class="ace-item-label">Structured JSON</span>
      </button>
    </div>
  `;

  dropdown.querySelectorAll('.ace-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const format = item.dataset.format;
      exportSingleResponse(btn, format);
      closeActiveDropdown();
    });
  });

  document.body.appendChild(dropdown);
  activeDropdown = dropdown;

  // Position relative to button
  const rect = btn.getBoundingClientRect();
  const dropdownHeight = 240;
  const dropdownWidth = 200;

  let top = rect.bottom + 6;
  if (rect.bottom + dropdownHeight > window.innerHeight && rect.top > dropdownHeight) {
    top = rect.top - dropdownHeight - 6;
  }

  let left = rect.left;
  if (left + dropdownWidth > window.innerWidth) {
    left = window.innerWidth - dropdownWidth - 12;
  }
  if (left < 10) left = 10;

  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
}

function getResponseData(btn) {
  const platform = detectPlatform() || 'chat';
  const meta = getPlatformMeta(platform);

  // ── Strategy A: 1-to-1 match from the robust platform parser (parseChat) ──
  // This guarantees complete parsing of all paragraphs, tables, code blocks, and markdown
  try {
    const fullChat = parseChat();
    if (fullChat && fullChat.messages && fullChat.messages.length > 0) {
      const allBtns = Array.from(document.querySelectorAll('.ace-response-export-btn'));
      const btnIdx = allBtns.indexOf(btn);

      // Pair each assistant response with its preceding user prompt
      const pairs = [];
      let lastUser = null;
      fullChat.messages.forEach(m => {
        if (m.role === 'user') {
          lastUser = m;
        } else if (m.role === 'assistant') {
          pairs.push({ assistant: m, user: lastUser });
        }
      });

      if (btnIdx >= 0 && btnIdx < pairs.length) {
        const pair = pairs[btnIdx];
        if (pair && pair.assistant && pair.assistant.text && pair.assistant.text.trim().length > 10) {
          const msgs = [];
          if (pair.user) {
            msgs.push({
              role: 'user',
              text: pair.user.text,
              html: pair.user.html || escapeHtml(pair.user.text).replace(/\n/g, '<br>'),
              index: 0,
              timestamp: pair.user.timestamp || null,
            });
          }
          msgs.push({
            role: 'assistant',
            text: pair.assistant.text,
            html: pair.assistant.html || escapeHtml(pair.assistant.text).replace(/\n/g, '<br>'),
            index: msgs.length,
            timestamp: pair.assistant.timestamp || new Date().toISOString(),
          });

          const promptTitle = pair.user?.text ? pair.user.text.replace(/\s+/g, ' ').substring(0, 60) : '';
          const title = promptTitle || (document.title || 'AI Response').replace(/ - (ChatGPT|Claude|Gemini|DeepSeek|Perplexity).*$/i, '').trim();

          return {
            title: title || 'Exported Response',
            messages: msgs,
            platform,
            platformMeta: meta,
            url: window.location.href,
            exportedAt: new Date().toISOString(),
          };
        }
      }
    }
  } catch (err) {
    console.warn('[ACE] Strategy A parseChat matching error:', err);
  }

  // ── Strategy B: Deep DOM extraction fallback ──
  // 1. Find true turn container across all AI platform designs
  const TURN_SELECTORS = [
    // Claude
    '[class*="font-claude-message"]',
    '[class*="font-claude-response"]',
    '[data-testid*="assistant-turn"]',
    '[data-testid*="ai-turn"]',
    '[data-testid*="ai-response"]',
    '[data-testid*="assistant"]',
    // ChatGPT
    '[data-message-author-role="assistant"]',
    'article',
    // Gemini
    'model-response',
    '[data-turn-role="model"]',
    '.response-container',
    // DeepSeek
    '[class*="ds-message"]',
    // Grok
    '[class*="message-bubble"]',
    '[data-testid*="message"]',
    // Generic
    '[class*="ChatMessage"]',
    '[class*="chat-message"]',
    '[class*="conversation-turn"]',
    '[data-testid*="conversation-turn"]',
    '[data-testid*="turn"]'
  ];

  let turn = null;
  for (const sel of TURN_SELECTORS) {
    turn = btn.closest(sel);
    if (turn) break;
  }

  // If no turn selector matched, walk up until we find an element containing > 40 chars
  if (!turn) {
    let p = btn.parentElement;
    while (p && p !== document.body && p.tagName.toLowerCase() !== 'main') {
      if ((p.innerText || '').trim().length > 40) {
        turn = p;
        break;
      }
      p = p.parentElement;
    }
  }
  if (!turn) turn = btn.parentElement?.parentElement?.parentElement || btn.parentElement;

  // 2. Find full message content container inside turn
  const BODY_SELECTORS = [
    // Claude
    '.standard-markdown',
    '[class*="standard-markdown"]',
    '[class*="font-claude-message"]',
    // ChatGPT
    '.markdown.prose',
    '.markdown',
    '[class*="prose"]',
    // Gemini
    'message-content',
    '.message-content',
    '.markdown-main-panel',
    '[class*="response-content"]',
    // DeepSeek
    '.ds-markdown',
    '[class*="ds-markdown"]',
    // Generic
    '[class*="message-content"]',
    '[class*="MessageContent"]'
  ];

  let contentEl = null;
  for (const sel of BODY_SELECTORS) {
    const found = turn.querySelector(sel);
    if (found && (found.innerText || '').trim().length > 30) {
      contentEl = found;
      break;
    }
  }

  // If no inner body selector matched with >30 chars, check previous siblings of action bar
  if (!contentEl) {
    let bar = btn.closest('[role="toolbar"], [class*="action"], [class*="button"]') || btn.parentElement;
    let prevSib = bar ? bar.previousElementSibling : null;
    while (prevSib) {
      if ((prevSib.innerText || '').trim().length > 30) {
        contentEl = prevSib;
        break;
      }
      prevSib = prevSib.previousElementSibling;
    }
  }

  if (!contentEl) contentEl = turn;

  // Clone and clean any action buttons/toolbars/tooltips from output
  const clone = contentEl.cloneNode(true);
  clone.querySelectorAll(
    '.ace-response-export-btn, .ace-export-dropdown, button, ' +
    '[role="toolbar"], [class*="action-bar"], [class*="action_bar"], ' +
    '[data-testid="action-bar"], .response-action-buttons, ' +
    'svg, [class*="tooltip"], [class*="copy-feedback"]'
  ).forEach(node => node.remove());

  const text = (clone.innerText || clone.textContent || '').trim();
  const html = clone.innerHTML || escapeHtml(text);

  // 3. Find previous user command / prompt
  let userMessage = null;
  let promptTitle = '';
  let current = turn.previousElementSibling;

  while (current && !userMessage) {
    const isUser = current.querySelector(
      '[data-testid*="user"], [data-testid*="human"], [data-message-author-role="user"], ' +
      'user-query, [class*="user-message"], [class*="font-user-message"], [data-is-human="true"]'
    ) ||
    current.getAttribute?.('data-message-author-role') === 'user' ||
    current.matches?.('[data-testid*="human"], [data-testid*="user"], user-query, [class*="user"]');

    const isAi = current.querySelector('[data-testid*="ai"], [data-message-author-role="assistant"], model-response') ||
      current.getAttribute?.('data-message-author-role') === 'assistant' ||
      current.matches?.('[data-testid*="ai"], [data-testid*="assistant"], model-response');

    if (isUser || (!isAi && (current.innerText || '').trim().length > 0)) {
      const uClone = current.cloneNode(true);
      uClone.querySelectorAll('button, svg, [role="toolbar"], .ace-response-export-btn, .ace-export-dropdown').forEach(n => n.remove());
      const uText = (uClone.innerText || uClone.textContent || '').trim();
      if (uText.length > 0) {
        promptTitle = uText.replace(/\s+/g, ' ').substring(0, 60);
        userMessage = {
          role: 'user',
          text: uText,
          html: escapeHtml(uText).replace(/\n/g, '<br>'),
          index: 0,
          timestamp: null,
        };
        break;
      }
    }
    current = current.previousElementSibling;
  }

  const title = promptTitle || (document.title || 'AI Response').replace(/ - (ChatGPT|Claude|Gemini|DeepSeek|Perplexity).*$/i, '').trim();

  const messages = [];
  if (userMessage) {
    messages.push(userMessage);
  }
  messages.push({
    role: 'assistant',
    text: text,
    html: html,
    index: messages.length,
    timestamp: new Date().toISOString(),
  });

  return {
    title: title || 'Exported Response',
    messages,
    platform,
    platformMeta: meta,
    url: window.location.href,
    exportedAt: new Date().toISOString(),
  };
}

function exportSingleResponse(btn, format) {
  try {
    const data = getResponseData(btn);
    if (!data || !data.messages || !data.messages[0].text) {
      console.warn('[ACE] Could not extract response content');
      flashButton(btn, false);
      return;
    }

    // Filter out user prompts if user disabled it in settings
    if (_userSettings.includeUserPrompts === false) {
      data.messages = data.messages.filter(m => m.role === 'assistant');
    }

    flashButton(btn, true);

    chrome.storage.local.get(['aceOptions'], (result) => {
      const options = Object.assign({
        pageSize: _userSettings.pageType || 'A4',
        pageType: _userSettings.pageType || 'A4',
        pageBorder: _userSettings.pageBorder || 'normal',
        margins: 'normal',
        showTimestamps: true,
        showPageNumbers: true,
      }, result?.aceOptions || {});

      runExport(format, data, options);
    });
  } catch (err) {
    console.error('[ACE] Single response export failed:', err);
    flashButton(btn, false);
  }
}

function flashButton(btn, success) {
  const original = btn.innerHTML;
  btn.innerHTML = success
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  setTimeout(() => {
    btn.innerHTML = original;
  }, 1600);
}

// Global click and key listeners for closing dropdown
document.addEventListener('click', (e) => {
  if (activeDropdown && !activeDropdown.contains(e.target) && !e.target.closest('#ace-fab, #ace-fab-btn, .ace-response-export-btn, .ace-handoff-btn')) {
    closeActiveDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeActiveDropdown();
  }
});

window.addEventListener('scroll', (e) => {
  if (_isAutoScrolling) return;
  if (activeDropdown && activeDropdown.classList.contains('ace-export-modal')) return;
  closeActiveDropdown();
}, { passive: true });

// ─────────────────────────────────────────────
// Message Listener (from popup)
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'loadFullChat') {
    (async () => {
      try {
        const fullChat = await autoScrollLoadEntireChat();
        _cachedChatData = fullChat;
        sendResponse({ success: true, data: fullChat });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // async
  }

  if (msg.action === 'parseChat') {
    try {
      _cachedChatData = parseChat();
      sendResponse({ success: true, data: _cachedChatData });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true; // async
  }

  if (msg.action === 'exportChat') {
    try {
      // Prefer chatData sent from popup (already parsed), fallback to cached or re-parse
      const chatData = msg.chatData || _cachedChatData || parseChat();
      if (!chatData) throw new Error('Could not parse chat data');
      runExport(msg.format, chatData, msg.options || {});
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (msg.action === 'ping') {
    sendResponse({ alive: true, platform: detectPlatform() });
    return true;
  }
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

function debouncedInjectButtons() {
  const platform = detectPlatform();
  if (!isPlatformEnabled(platform)) return;
  if (_injectTimeout) clearTimeout(_injectTimeout);
  _injectTimeout = setTimeout(() => {
    injectResponseButtons();
    injectTypeBoxLimitLine();
  }, 400);
}

function init() {
  const platform = detectPlatform();
  if (!platform) return;

  loadSettings(() => {
    if (!isPlatformEnabled(platform)) return;

    // Load cached platform limit from storage on startup (e.g. limit reached until 10:50 PM)
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([`ace_limit_${platform}`], (res) => {
          const saved = res[`ace_limit_${platform}`];
          if (saved && saved.resetTimestamp) {
            if (Date.now() < saved.resetTimestamp) {
              window._aceCachedLimitStatus = saved;
              updateLimitBarValues();
            } else {
              chrome.storage.local.remove([`ace_limit_${platform}`]);
            }
          }
        });
      }
    } catch (_) {}

    // Check if this page was opened from a context handoff to auto-insert
    checkPendingHandoff();

    // Initial injections
    setTimeout(injectFab, 1200);
    setTimeout(injectResponseButtons, 1400);
    setTimeout(injectTypeBoxLimitLine, 1800);
  });

  // Re-inject on SPA navigation (URL changes) and dynamic message streaming
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      _fabInjected = false;
      _cachedChatData = null;
      setTimeout(injectFab, 1200);
      setTimeout(injectTypeBoxLimitLine, 1800);
    }
    debouncedInjectButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Periodic background sync every 3 seconds while chatting
  setInterval(() => {
    const platform = detectPlatform();
    if (!isPlatformEnabled(platform) || !_userSettings.showLimitTracker) return;

    const typeBox = findTypeBox();
    const bar = document.getElementById('ace-input-limit-bar');
    if (bar && typeBox) {
      if (bar.previousElementSibling !== typeBox) {
        typeBox.insertAdjacentElement('afterend', bar);
      }
      syncLimitBarWidth(bar, typeBox);
    }
    updateLimitBarValues();
  }, 3000);

  // Listen to window resize to keep limit bar width synced with type box
  window.addEventListener('resize', () => {
    const platform = detectPlatform();
    if (!isPlatformEnabled(platform) || !_userSettings.showLimitTracker) return;

    const bar = document.getElementById('ace-input-limit-bar');
    const typeBox = findTypeBox();
    if (bar && typeBox) syncLimitBarWidth(bar, typeBox);
  }, { passive: true });
}

init();
