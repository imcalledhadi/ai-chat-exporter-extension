/**
 * AI Chat Exporter — Popup Logic
 * Handles: platform detection display, tab switching, message selection,
 * options management, and export triggering.
 */

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

const state = {
  chatData: null,
  selectedFormat: 'pdf',
  selectedIndices: null, // null = all
  options: {
    showTimestamps: true,
    pageSize: 'A4',
    pageType: 'A4',
    pageBorder: 'normal',
    showPageNumbers: true,
    margins: 'normal',
  },
};

const platformColors = {
  claude:     '#d97706',
  chatgpt:    '#10a37f',
  gemini:     '#4285f4',
  grok:       '#e7e7e7',
  meta:       '#0082fb',
  deepseek:   '#4e6ef2',
  perplexity: '#20b2aa',
  copilot:    '#0078d4',
};

// ─────────────────────────────────────────────
// DOM References
// ─────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const dom = {
  platformBar:      $('platformBar'),
  platformDot:      $('platformDot'),
  platformName:     $('platformName'),
  msgCount:         $('msgCount'),
  loadingState:     $('loadingState'),
  errorState:       $('errorState'),
  errorMsg:         $('errorMsg'),
  mainContent:      $('mainContent'),
  formatGrid:       $('formatGrid'),
  selectionSummary: $('selectionSummary'),
  selectionText:    $('selectionText'),
  changeSelBtn:     $('changeSelectionBtn'),
  exportBtn:        $('exportBtn'),
  exportBtnText:    $('exportBtnText'),
  exportStatus:     $('exportStatus'),
  statusIcon:       $('statusIcon'),
  statusText:       $('statusText'),
  messagesList:     $('messagesList'),
  retryBtn:         $('retryBtn'),
  limitTrackerBar:  $('limitTrackerBar'),
  limitPercent:     $('limitPercent'),
  limitTokens:      $('limitTokens'),
  limitProgressFill: $('limitProgressFill'),
  handoffStatus:    $('handoffStatus'),
  handoffStatusText: $('handoffStatusText'),
  settingsBtn:      $('settingsBtn'),
  loadChatBar:      $('loadChatBar'),
  loadChatStatus:   $('loadChatStatus'),
  loadFullChatBtn:  $('loadFullChatBtn'),
  scopeAllBtn:      $('scopeAllBtn'),
  scopeCustomBtn:   $('scopeCustomBtn'),
  doneSelectingBtn: $('doneSelectingBtn'),
};

// ─────────────────────────────────────────────
// Tab Switching
// ─────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      const panel = document.getElementById(`panel${capitalize(target)}`);
      if (panel) panel.classList.remove('hidden');
    });
  });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─────────────────────────────────────────────
// Format Selection
// ─────────────────────────────────────────────

function selectFormat(format) {
  const fmt = format || 'pdf';
  state.selectedFormat = fmt;
  document.querySelectorAll('.format-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.format === fmt);
  });
  const fmtSelect = $('optDefaultFormat');
  if (fmtSelect && fmtSelect.value !== fmt) {
    fmtSelect.value = fmt;
  }
  updateExportButton();
}

function initFormatCards() {
  document.querySelectorAll('.format-card').forEach(card => {
    card.addEventListener('click', () => {
      selectFormat(card.dataset.format);
    });
  });
}

function updateExportButton() {
  const btn = dom.exportBtn;
  if (!btn) return;

  if (!state.selectedFormat) {
    state.selectedFormat = 'pdf';
    document.querySelector('.format-card[data-format="pdf"]')?.classList.add('selected');
  }

  if (!state.chatData) {
    btn.disabled = true;
    dom.exportBtnText.textContent = 'Loading chat…';
    return;
  }

  if (state.selectedIndices && state.selectedIndices.length === 0) {
    btn.disabled = true;
    dom.exportBtnText.textContent = 'No messages selected';
    return;
  }

  btn.disabled = false;
  const formatLabels = {
    pdf: 'Export as PDF',
    word: 'Export as Word (.doc)',
    markdown: 'Export as Markdown',
    html: 'Export as HTML',
    txt: 'Export as Plain Text',
    json: 'Export as JSON',
  };
  dom.exportBtnText.textContent = formatLabels[state.selectedFormat] || `Export as ${state.selectedFormat.toUpperCase()}`;
}

// ─────────────────────────────────────────────
// Message List (Selective Export)
// ─────────────────────────────────────────────

function renderMessagesList() {
  const list = dom.messagesList;
  list.innerHTML = '';
  if (!state.chatData?.messages?.length) {
    list.innerHTML = '<p style="color:var(--text3);text-align:center;padding:24px;font-size:12px">No messages found.</p>';
    return;
  }

  const selectedSet = state.selectedIndices
    ? new Set(state.selectedIndices)
    : new Set(state.chatData.messages.map(m => m.index));

  state.chatData.messages.forEach(msg => {
    const item = document.createElement('div');
    item.className = 'message-item' + (selectedSet.has(msg.index) ? ' selected' : '');
    item.dataset.index = msg.index;
    item.dataset.role = msg.role;

    const preview = (msg.text || '').substring(0, 100).replace(/\n+/g, ' ');
    const roleLabel = msg.role === 'user' ? 'You' : (state.chatData.platformMeta?.name || 'AI');

    item.innerHTML = `
      <div class="msg-checkbox"></div>
      <span class="msg-role-badge ${msg.role === 'user' ? 'user' : 'ai'}">${roleLabel}</span>
      <div class="msg-preview">${escapeHtmlSimple(preview)}</div>
    `;

    item.addEventListener('click', () => toggleMessage(msg.index, item));
    list.appendChild(item);
  });

  updateSelectionSummary();
}

function toggleMessage(index, item) {
  if (!state.selectedIndices) {
    // Was "all" — init with all except this one
    state.selectedIndices = state.chatData.messages
      .map(m => m.index)
      .filter(i => i !== index);
  } else {
    const idx = state.selectedIndices.indexOf(index);
    if (idx > -1) {
      state.selectedIndices.splice(idx, 1);
    } else {
      state.selectedIndices.push(index);
    }
  }
  item.classList.toggle('selected');
  updateSelectionSummary();
}

function updateSelectionSummary() {
  const total = state.chatData?.messages?.length || 0;
  const isAll = !state.selectedIndices || state.selectedIndices.length === total;
  const selected = state.selectedIndices ? state.selectedIndices.length : total;

  if (dom.selectionText) {
    dom.selectionText.textContent = isAll
      ? `All messages selected (${total})`
      : `${selected} of ${total} messages selected`;
  }

  if (dom.scopeAllBtn && dom.scopeCustomBtn) {
    dom.scopeAllBtn.classList.toggle('active', isAll);
    dom.scopeCustomBtn.classList.toggle('active', !isAll);
  }

  updateExportButton();
}

function initMessageControls() {
  // Scope toggles
  dom.scopeAllBtn?.addEventListener('click', () => {
    state.selectedIndices = null;
    renderMessagesList();
    updateSelectionSummary();
  });

  dom.scopeCustomBtn?.addEventListener('click', () => {
    document.querySelector('[data-tab="messages"]')?.click();
  });

  dom.doneSelectingBtn?.addEventListener('click', () => {
    document.querySelector('[data-tab="export"]')?.click();
  });

  // Select all
  $('selectAllBtn')?.addEventListener('click', () => {
    state.selectedIndices = null;
    renderMessagesList();
    updateSelectionSummary();
  });

  // Deselect all
  $('deselectAllBtn')?.addEventListener('click', () => {
    state.selectedIndices = [];
    document.querySelectorAll('.message-item').forEach(el => el.classList.remove('selected'));
    updateSelectionSummary();
  });

  // Invert
  $('invertSelBtn')?.addEventListener('click', () => {
    const allIndices = state.chatData.messages.map(m => m.index);
    const currentSet = state.selectedIndices ? new Set(state.selectedIndices) : new Set(allIndices);
    state.selectedIndices = allIndices.filter(i => !currentSet.has(i));
    renderMessagesList();
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      document.querySelectorAll('.message-item').forEach(item => {
        if (filter === 'all' || item.dataset.role === filter) {
          item.classList.remove('filtered-out');
        } else {
          item.classList.add('filtered-out');
        }
      });
    });
  });

  // Change selection shortcut
  dom.changeSelBtn?.addEventListener('click', () => {
    document.querySelector('[data-tab="messages"]')?.click();
  });
}

// ─────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────

function saveExportOption(key, value) {
  state.options[key] = value;
  const storage = chrome.storage?.sync || chrome.storage?.local;
  if (!storage) return;
  storage.get(['ace_settings'], (res) => {
    const s = res?.ace_settings || {};
    s[key] = value;
    if (chrome.storage?.sync) chrome.storage.sync.set({ ace_settings: s });
    if (chrome.storage?.local) chrome.storage.local.set({ ace_settings: s });
  });
}

function initOptions() {
  // Default format select
  const fmtSelect = $('optDefaultFormat');
  if (fmtSelect) {
    fmtSelect.addEventListener('change', () => {
      saveExportOption('defaultFormat', fmtSelect.value);
      selectFormat(fmtSelect.value);
    });
  }

  // Page type select
  const pageTypeSelect = $('optPageType');
  if (pageTypeSelect) {
    pageTypeSelect.addEventListener('change', () => {
      state.options.pageType = pageTypeSelect.value;
      state.options.pageSize = pageTypeSelect.value;
      saveExportOption('pageType', pageTypeSelect.value);
    });
  }

  // Page border select
  const pageBorderSelect = $('optPageBorder');
  if (pageBorderSelect) {
    pageBorderSelect.addEventListener('change', () => {
      state.options.pageBorder = pageBorderSelect.value;
      state.options.margins = pageBorderSelect.value;
      saveExportOption('pageBorder', pageBorderSelect.value);
    });
  }

  // Toggles in Export Options tab
  const toggles = {
    optIncludePrompts: 'includeUserPrompts',
    optTimestamps: 'showTimestamps',
    optPageNums: 'showPageNumbers',
  };

  Object.entries(toggles).forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', () => {
      const isNowActive = !el.classList.contains('active');
      el.classList.toggle('active', isNowActive);
      el.setAttribute('aria-checked', isNowActive);
      state.options[key] = isNowActive;
      saveExportOption(key, isNowActive);
    });
  });
}

// ─────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────

function initExportButton() {
  dom.exportBtn.addEventListener('click', async () => {
    if (!state.selectedFormat) {
      selectFormat('pdf');
    }
    if (!state.chatData) return;
    if (state.selectedIndices && state.selectedIndices.length === 0) return;

    dom.exportBtn.classList.add('loading');
    dom.exportBtn.disabled = true;
    dom.exportStatus.classList.add('hidden');

    const options = {
      ...state.options,
      selectedIndices: state.selectedIndices,
    };

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      // Use sendMessage to talk to the content script (shares its execution context)
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'exportChat',
          format: state.selectedFormat,
          chatData: state.chatData,
          options,
        }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(resp);
          }
        });
      });

      if (response?.success) {
        showStatus('success', '✓', 'Export started! Check your downloads.');
      } else {
        showStatus('error', '✕', response?.error || 'Export failed.');
      }
    } catch (err) {
      console.error('[ACE] Export error:', err);
      showStatus('error', '✕', 'Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      dom.exportBtn.classList.remove('loading');
      updateExportButton();
    }
  });
}

function showStatus(type, icon, text) {
  dom.exportStatus.className = `export-status ${type}-state`;
  dom.statusIcon.className = `status-icon ${type}`;
  dom.statusIcon.textContent = icon;
  dom.statusText.textContent = text;
  dom.exportStatus.classList.remove('hidden');
  setTimeout(() => dom.exportStatus.classList.add('hidden'), 4000);
}

// ─────────────────────────────────────────────
// Platform Detection & Chat Parsing
// ─────────────────────────────────────────────

async function detectAndParse() {
  showLoading(true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      showError('Cannot access the active tab.');
      return;
    }

    // First check if content script is alive via sendMessage
    const pingData = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(resp);
        }
      });
    });

    if (!pingData?.alive || !pingData?.platform) {
      // Content script not loaded yet — inject it now
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/parsers.js', 'content/exporters.js', 'content/content.js'],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/content.css'],
        });
      } catch (_) {}

      // Retry ping
      await new Promise(r => setTimeout(r, 500));
      const retryPing = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (resp) => {
          resolve(chrome.runtime.lastError ? null : resp);
        });
      });

      if (!retryPing?.alive || !retryPing?.platform) {
        showNoChatSettingsView();
        return;
      }
    }

    // Parse the chat via sendMessage
    const parseResp = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action: 'parseChat' }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });

    const chatData = parseResp?.data;

    if (!chatData || !chatData.messages || chatData.messages.length === 0) {
      showNoChatSettingsView(pingData?.platform || parseResp?.platform);
      return;
    }

    state.chatData = chatData;
    updatePlatformBar(chatData.platform, chatData.messages.length);
    updateLimitTracker(chatData.stats);
    showMainContent();
    renderMessagesList();
    updateSelectionSummary();

  } catch (err) {
    console.error('[ACE] Parse error:', err);
    showNoChatSettingsView();
  }
}

function updatePlatformBar(platform, count) {
  const names = {
    claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini',
    grok: 'Grok', meta: 'Meta AI', deepseek: 'DeepSeek',
    perplexity: 'Perplexity', copilot: 'Copilot',
  };

  dom.platformDot.className = 'platform-dot' + (count > 0 ? ' active' : ' error');
  dom.platformDot.style.background = count > 0 ? (platformColors[platform] || '#10b981') : '#ef4444';
  if (count > 0) dom.platformDot.style.boxShadow = `0 0 6px ${platformColors[platform] || '#10b981'}`;

  dom.platformName.textContent = names[platform] || platform;
  dom.msgCount.textContent = count > 0 ? `${count} messages` : '';
}

function updateLimitTracker(stats) {
  if (!stats) return;
  dom.limitTrackerBar.classList.remove('hidden');
  const pct = Math.min(100, Math.max(0, stats.percentUsed || 0));

  if (stats.isLimitReached) {
    dom.limitPercent.innerHTML = `<span style="color:#ef4444">100%</span> (Limit reached)`;
    dom.limitProgressFill.style.width = '100%';
    dom.limitProgressFill.className = 'limit-fill danger';
    const resetPart = stats.resetTime ? ` · Resets at ${stats.resetTime}` : '';
    dom.limitTokens.innerHTML = `<span style="color:#ef4444;font-weight:600">0 msgs left</span>${resetPart}`;
    return;
  }

  // If platform explicitly announced remaining messages (e.g. Claude warning)
  if (stats.msgsRemaining !== null && stats.msgsRemaining !== undefined && stats.resetTime) {
    dom.limitPercent.textContent = `${pct}%`;
    dom.limitProgressFill.style.width = `${pct}%`;
    dom.limitProgressFill.className = 'limit-fill' + (pct >= 85 ? ' danger' : pct >= 60 ? ' warning' : '');
    dom.limitTokens.textContent = `${stats.msgsRemaining} msgs left (Resets at ${stats.resetTime})`;
    return;
  }

  dom.limitPercent.textContent = `${pct}%`;
  dom.limitProgressFill.style.width = `${pct}%`;

  dom.limitProgressFill.className = 'limit-fill' + 
    (pct >= 85 ? ' danger' : pct >= 60 ? ' warning' : '');

  const tokensFormatted = stats.totalTokens >= 1000 
    ? `${(stats.totalTokens / 1000).toFixed(1)}k` 
    : `${stats.totalTokens}`;
  const limitFormatted = `${(stats.limit / 1000).toFixed(0)}k`;
  dom.limitTokens.textContent = `${tokensFormatted} / ${limitFormatted} tokens`;
}

// ─────────────────────────────────────────────
// Context Handoff (Continue in Another AI)
// ─────────────────────────────────────────────

const agentUrls = {
  chatgpt:  'https://chatgpt.com',
  gemini:   'https://gemini.google.com/app',
  deepseek: 'https://chat.deepseek.com',
  grok:     'https://grok.com',
  claude:   'https://claude.ai/new',
};

function initHandoffButtons() {
  document.querySelectorAll('.handoff-card').forEach(card => {
    card.addEventListener('click', async () => {
      const agent = card.dataset.agent;
      const targetUrl = agentUrls[agent];
      if (!targetUrl || !state.chatData) return;

      const prompt = buildHandoffPrompt(state.chatData);

      // Save pending handoff in storage for automatic insertion in the target tab
      await chrome.storage.local.set({
        acePendingHandoff: {
          targetAgent: agent,
          prompt,
          sourcePlatform: state.chatData.platformMeta?.name || 'Claude',
          timestamp: Date.now(),
        }
      });

      // Also copy to clipboard as fallback
      try {
        await navigator.clipboard.writeText(prompt);
      } catch (_) {}

      // Show confirmation
      dom.handoffStatus.classList.remove('hidden');
      dom.handoffStatusText.textContent = `Context copied! Opening ${card.querySelector('.handoff-name')?.textContent || agent}…`;

      // Open target AI tab
      chrome.runtime.sendMessage({ action: 'openTab', url: targetUrl });
    });
  });
}

function buildHandoffPrompt(chatData) {
  const { title, messages, platformMeta } = chatData;
  const platformName = platformMeta?.name || 'Claude';

  let p = `[CONTINUING CONVERSATION FROM ${platformName.toUpperCase()}]\n`;
  p += `Topic: ${title}\n\n`;
  p += `We reached our usage limit on ${platformName}. Here is the complete transcript of our conversation so far:\n\n`;
  p += `--------------------------------------------------\n`;

  (messages || []).forEach(m => {
    const role = m.role === 'user' ? 'YOU (User)' : `${platformName} (Assistant)`;
    p += `\n[${role}]:\n${(m.text || '').trim()}\n`;
  });

  p += `\n--------------------------------------------------\n\n`;
  p += `Please review the context above and confirm you are ready to continue smoothly from where we left off. My next question / request will follow.`;
  return p;
}

// ─────────────────────────────────────────────
// UI State Management
// ─────────────────────────────────────────────

function showLoading(show) {
  dom.loadingState.classList.toggle('hidden', !show);
  dom.errorState.classList.add('hidden');
  dom.mainContent.classList.add('hidden');
  dom.loadChatBar?.classList.add('hidden');
  $('noChatBanner')?.classList.add('hidden');
  $('settingsPanel')?.classList.add('hidden');
}

function showError(msg) {
  dom.loadingState.classList.add('hidden');
  dom.errorState.classList.remove('hidden');
  dom.mainContent.classList.add('hidden');
  dom.loadChatBar?.classList.add('hidden');
  $('noChatBanner')?.classList.add('hidden');
  $('settingsPanel')?.classList.add('hidden');
  dom.errorMsg.textContent = msg;
  dom.platformDot.className = 'platform-dot error';
}

function showNoChatSettingsView(detectedPlatform) {
  state.chatData = null;
  dom.loadingState.classList.add('hidden');
  dom.mainContent.classList.add('hidden');
  dom.errorState.classList.add('hidden');
  dom.limitTrackerBar.classList.add('hidden');
  dom.loadChatBar?.classList.add('hidden');

  // Display the helpful banner and the customization options directly in the popup
  $('noChatBanner')?.classList.remove('hidden');
  $('settingsPanel')?.classList.remove('hidden');

  dom.platformDot.className = 'platform-dot settings-mode';
  dom.platformDot.style.background = '#8b5cf6';
  dom.platformDot.style.boxShadow = '0 0 8px rgba(139, 92, 246, 0.7)';

  if (detectedPlatform && detectedPlatform !== 'unknown') {
    const names = {
      claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini',
      grok: 'Grok', meta: 'Meta AI', deepseek: 'DeepSeek',
      perplexity: 'Perplexity', copilot: 'Copilot',
    };
    dom.platformName.textContent = `${names[detectedPlatform] || detectedPlatform} (No chat open)`;
  } else {
    dom.platformName.textContent = 'Settings & Customization';
  }
  dom.msgCount.textContent = '';

  const closeBtn = $('closeSettingsBtn');
  if (closeBtn) {
    closeBtn.textContent = '🔄 Scan Tab';
    closeBtn.title = 'Scan the current active tab for an AI conversation';
  }

  loadPopupSettings();
}

function showMainContent() {
  dom.loadingState.classList.add('hidden');
  dom.errorState.classList.add('hidden');
  $('noChatBanner')?.classList.add('hidden');
  $('settingsPanel')?.classList.add('hidden');
  dom.loadChatBar?.classList.remove('hidden');
  dom.mainContent.classList.remove('hidden');
  dom.settingsBtn?.classList.remove('active');
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function escapeHtmlSimple(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// In-Popup Settings Panel
// ─────────────────────────────────────────────

const POPUP_SETTINGS_MAP = {
  // Features
  showLimitTracker: 'popOptLimitTracker',
  showHandoffButton: 'popOptHandoffBtn',
  showFloatingExportBtn: 'popOptFloatingBtn',
  showResponseExportBtns: 'popOptResponseBtns',

  // Bots
  enableClaude: 'popEnableClaude',
  enableChatGPT: 'popEnableChatGPT',
  enableGemini: 'popEnableGemini',
  enableGrok: 'popEnableGrok',
  enableDeepSeek: 'popEnableDeepSeek',
  enableMetaAI: 'popEnableMetaAI',
  enablePerplexity: 'popEnablePerplexity',
  enableCopilot: 'popEnableCopilot',
};

let _lastVisibleView = null;

function toggleSettingsView() {
  const panel = $('settingsPanel');
  if (!panel) return;
  const isCurrentlyOpen = !panel.classList.contains('hidden');
  if (isCurrentlyOpen) {
    closeSettingsView();
  } else {
    openSettingsView();
  }
}

function openSettingsView() {
  const panel = $('settingsPanel');
  if (!panel) return;

  dom.mainContent.classList.add('hidden');
  dom.errorState.classList.add('hidden');
  dom.loadingState.classList.add('hidden');
  $('noChatBanner')?.classList.add('hidden');

  panel.classList.remove('hidden');
  dom.settingsBtn?.classList.add('active');

  const closeBtn = $('closeSettingsBtn');
  if (closeBtn) {
    closeBtn.textContent = state.chatData ? '← Back to Chat' : '🔄 Scan Tab';
    closeBtn.title = state.chatData ? 'Back to chat export' : 'Scan active tab for chat';
  }

  loadPopupSettings();
}

function closeSettingsView() {
  const panel = $('settingsPanel');
  if (!panel) return;

  if (state.chatData) {
    panel.classList.add('hidden');
    dom.settingsBtn?.classList.remove('active');
    dom.mainContent.classList.remove('hidden');
    document.querySelector('.tab[data-tab="export"]')?.click();
  } else {
    // In no-chat mode, acts as a re-scan trigger
    detectAndParse();
  }
}

function loadPopupSettings() {
  const storage = chrome.storage?.sync || chrome.storage?.local;
  if (!storage) return;

  storage.get(['ace_settings'], (res) => {
    const settings = res?.ace_settings || {};

    // Update toggles in Settings Panel
    Object.entries(POPUP_SETTINGS_MAP).forEach(([key, elId]) => {
      const el = $(elId);
      if (!el) return;
      const isChecked = settings[key] !== false; // default true
      el.classList.toggle('active', isChecked);
      el.setAttribute('aria-checked', isChecked);
    });
  });
}

function savePopupSetting(key, value) {
  const storage = chrome.storage?.sync || chrome.storage?.local;
  if (!storage) return;

  storage.get(['ace_settings'], (res) => {
    const current = res?.ace_settings || {};
    current[key] = value;

    if (chrome.storage?.sync) {
      chrome.storage.sync.set({ ace_settings: current });
    }
    if (chrome.storage?.local) {
      chrome.storage.local.set({ ace_settings: current });
    }
  });
}

function initPopupSettings() {
  // Open / Close triggers
  dom.settingsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleSettingsView();
  });

  $('closeSettingsBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeSettingsView();
  });

  $('openSettingsErrorBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openSettingsView();
  });

  $('popOpenFullOptionsBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  // Wire up toggles in Settings Panel
  Object.entries(POPUP_SETTINGS_MAP).forEach(([key, elId]) => {
    const el = $(elId);
    if (!el) return;
    el.addEventListener('click', () => {
      const isNowActive = !el.classList.contains('active');
      el.classList.toggle('active', isNowActive);
      el.setAttribute('aria-checked', isNowActive);
      savePopupSetting(key, isNowActive);
    });
  });

  // Initial load
  loadPopupSettings();
}

function initAutoLoadChatControl() {
  dom.loadFullChatBtn?.addEventListener('click', async () => {
    dom.loadFullChatBtn.disabled = true;
    dom.loadFullChatBtn.textContent = 'Loading…';
    dom.loadChatStatus.textContent = 'Auto-scrolling to top to load conversation…';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');

      const resp = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'loadFullChat' }, (r) => {
          resolve(chrome.runtime.lastError ? null : r);
        });
      });

      if (resp?.success && resp.data) {
        state.chatData = resp.data;
        updatePlatformBar(resp.data.platform, resp.data.messages.length);
        updateLimitTracker(resp.data.stats);
        renderMessagesList();
        updateSelectionSummary();
        dom.loadChatStatus.textContent = `✓ Entire chat loaded! (${resp.data.messages.length} msgs)`;
        dom.loadFullChatBtn.textContent = 'Loaded';
      } else {
        dom.loadChatStatus.textContent = 'Could not auto-scroll. Try scrolling tab manually.';
        dom.loadFullChatBtn.textContent = 'Retry';
        dom.loadFullChatBtn.disabled = false;
      }
    } catch (err) {
      dom.loadChatStatus.textContent = 'Auto-scroll error';
      dom.loadFullChatBtn.disabled = false;
      dom.loadFullChatBtn.textContent = 'Retry';
    }
  });
}

function init() {
  initTabs();
  initFormatCards();
  initOptions();
  initExportButton();
  initMessageControls();
  initHandoffButtons();
  initPopupSettings();
  initAutoLoadChatControl();

  // Retry button
  dom.retryBtn.addEventListener('click', detectAndParse);

  // Set initial default format
  selectFormat(state.selectedFormat || 'pdf');

  // Load saved options and sync settings from storage
  const storage = chrome.storage?.sync || chrome.storage?.local;
  if (storage) {
    storage.get(['ace_settings'], (res) => {
      const s = res?.ace_settings;
      const fmt = s?.defaultFormat || 'pdf';
      selectFormat(fmt);
      if (s?.pageType) {
        state.options.pageType = s.pageType;
        state.options.pageSize = s.pageType;
        const pt = $('optPageType');
        if (pt) pt.value = s.pageType;
      }
      if (s?.pageBorder) {
        state.options.pageBorder = s.pageBorder;
        const pb = $('optPageBorder');
        if (pb) pb.value = s.pageBorder;
      }
      if (s?.includeUserPrompts !== undefined) {
        state.options.includeUserPrompts = s.includeUserPrompts;
        $('optIncludePrompts')?.classList.toggle('active', s.includeUserPrompts);
      }
      if (s?.showTimestamps !== undefined) {
        state.options.showTimestamps = s.showTimestamps;
        $('optTimestamps')?.classList.toggle('active', s.showTimestamps);
      }
      if (s?.showPageNumbers !== undefined) {
        state.options.showPageNumbers = s.showPageNumbers;
        $('optPageNums')?.classList.toggle('active', s.showPageNumbers);
      }
    });
  }

  // Start detection
  detectAndParse();
}

function applyStoredOptions() {
  if (state.selectedFormat) {
    const fmtSelect = $('optDefaultFormat');
    if (fmtSelect) fmtSelect.value = state.selectedFormat;
  }
  const pageTypeEl = $('optPageType');
  if (pageTypeEl) pageTypeEl.value = state.options.pageType || state.options.pageSize || 'A4';

  const pageBorderEl = $('optPageBorder');
  if (pageBorderEl) pageBorderEl.value = state.options.pageBorder || 'normal';

  if (state.options.includeUserPrompts !== undefined) {
    $('optIncludePrompts')?.classList.toggle('active', state.options.includeUserPrompts !== false);
    $('optIncludePrompts')?.setAttribute('aria-checked', state.options.includeUserPrompts !== false);
  }

  $('optTimestamps')?.classList.toggle('active', !!state.options.showTimestamps);
  $('optTimestamps')?.setAttribute('aria-checked', !!state.options.showTimestamps);

  $('optPageNums')?.classList.toggle('active', state.options.showPageNumbers !== false);
  $('optPageNums')?.setAttribute('aria-checked', state.options.showPageNumbers !== false);
}

document.addEventListener('DOMContentLoaded', init);
