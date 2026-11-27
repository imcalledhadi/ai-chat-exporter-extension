/**
   AI Chat Exporter — Options Page Controller
   Manages user preferences and platform activation toggles.
   Saves to chrome.storage.sync (with chrome.storage.local fallback).
*/

const DEFAULT_SETTINGS = {
  // In-page UI Features
  showLimitTracker: true,
  showHandoffButton: true,
  showFloatingExportBtn: true,
  showResponseExportBtns: true,

  // Bot Activation
  enableClaude: true,
  enableChatGPT: true,
  enableGemini: true,
  enableGrok: true,
  enableDeepSeek: true,
  enableMetaAI: true,
  enablePerplexity: true,
  enableCopilot: true,

  // Export Defaults
  defaultFormat: 'pdf',
  pageType: 'A4',
  pageBorder: 'normal',
  includeUserPrompts: true,
  showTimestamps: false,
  showPageNumbers: true,
};

const ELEMENTS = {
  // Features
  showLimitTracker: document.getElementById('optLimitTracker'),
  showHandoffButton: document.getElementById('optHandoffButton'),
  showFloatingExportBtn: document.getElementById('optFloatingBtn'),
  showResponseExportBtns: document.getElementById('optResponseBtns'),

  // Bots
  enableClaude: document.getElementById('enableClaude'),
  enableChatGPT: document.getElementById('enableChatGPT'),
  enableGemini: document.getElementById('enableGemini'),
  enableGrok: document.getElementById('enableGrok'),
  enableDeepSeek: document.getElementById('enableDeepSeek'),
  enableMetaAI: document.getElementById('enableMetaAI'),
  enablePerplexity: document.getElementById('enablePerplexity'),
  enableCopilot: document.getElementById('enableCopilot'),

  // Export Defaults
  defaultFormat: document.getElementById('optDefaultFormat'),
  pageType: document.getElementById('optPageType'),
  pageBorder: document.getElementById('optPageBorder'),
  includeUserPrompts: document.getElementById('optIncludeUserPrompts'),
  showTimestamps: document.getElementById('optShowTimestamps'),
  showPageNumbers: document.getElementById('optShowPageNumbers'),

  // Actions
  resetBtn: document.getElementById('resetDefaultsBtn'),
  toast: document.getElementById('saveToast'),
};

let _toastTimeout = null;
function showToast(msg = 'Settings saved') {
  if (_toastTimeout) clearTimeout(_toastTimeout);
  ELEMENTS.toast.querySelector('span').textContent = msg;
  ELEMENTS.toast.classList.remove('hidden');
  _toastTimeout = setTimeout(() => {
    ELEMENTS.toast.classList.add('hidden');
  }, 1800);
}

function loadSettings() {
  const storage = chrome.storage?.sync || chrome.storage?.local;
  if (!storage) return;

  storage.get(['ace_settings'], (res) => {
    const settings = Object.assign({}, DEFAULT_SETTINGS, res.ace_settings || {});

    // Bind checkboxes
    Object.keys(ELEMENTS).forEach(key => {
      const el = ELEMENTS[key];
      if (!el || key === 'resetBtn' || key === 'toast') return;

      if (el.type === 'checkbox') {
        el.checked = settings[key] !== false;
      } else if (el.tagName === 'SELECT') {
        el.value = settings[key] || DEFAULT_SETTINGS[key];
      }
    });
  });
}

function saveSettings() {
  const current = {};

  Object.keys(ELEMENTS).forEach(key => {
    const el = ELEMENTS[key];
    if (!el || key === 'resetBtn' || key === 'toast') return;

    if (el.type === 'checkbox') {
      current[key] = el.checked;
    } else if (el.tagName === 'SELECT') {
      current[key] = el.value;
    }
  });

  // Save to sync with fallback to local
  if (chrome.storage?.sync) {
    chrome.storage.sync.set({ ace_settings: current }, () => {
      showToast('Settings saved');
    });
  }
  if (chrome.storage?.local) {
    chrome.storage.local.set({ ace_settings: current });
  }
}

function bindEvents() {
  // Auto-save on any change
  Object.keys(ELEMENTS).forEach(key => {
    const el = ELEMENTS[key];
    if (!el || key === 'resetBtn' || key === 'toast') return;

    el.addEventListener('change', () => {
      saveSettings();
    });
  });

  // Reset to defaults
  ELEMENTS.resetBtn.addEventListener('click', () => {
    if (!confirm('Reset all extension settings to their default values?')) return;

    Object.keys(DEFAULT_SETTINGS).forEach(key => {
      const el = ELEMENTS[key];
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = DEFAULT_SETTINGS[key];
      } else if (el.tagName === 'SELECT') {
        el.value = DEFAULT_SETTINGS[key];
      }
    });

    saveSettings();
    showToast('Reset to defaults');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  bindEvents();
});

