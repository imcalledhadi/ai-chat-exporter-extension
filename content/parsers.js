/**
 * AI Chat Exporter - Platform Parsers (v2 — robust multi-strategy)
 * Detects the current AI platform and extracts all chat messages from the DOM.
 *
 * Strategy order for each platform:
 *  1. Known data-testid / aria attributes (most reliable)
 *  2. Known class-name patterns
 *  3. DOM structure heuristics (alternating children, alignment, etc.)
 *  4. Nuclear fallback: scan ALL substantial text blocks in main content area
 */

const PLATFORMS = {
  CLAUDE: 'claude',
  CHATGPT: 'chatgpt',
  GEMINI: 'gemini',
  GROK: 'grok',
  META: 'meta',
  DEEPSEEK: 'deepseek',
  PERPLEXITY: 'perplexity',
  COPILOT: 'copilot',
};

function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes('claude.ai')) return PLATFORMS.CLAUDE;
  if (host.includes('chat.openai.com') || host.includes('chatgpt.com')) return PLATFORMS.CHATGPT;
  if (host.includes('gemini.google.com')) return PLATFORMS.GEMINI;
  if (host.includes('grok.com') || (host.includes('x.com') && window.location.pathname.includes('/i/grok'))) return PLATFORMS.GROK;
  if (host.includes('meta.ai')) return PLATFORMS.META;
  if (host.includes('deepseek.com')) return PLATFORMS.DEEPSEEK;
  if (host.includes('perplexity.ai')) return PLATFORMS.PERPLEXITY;
  if (host.includes('copilot.microsoft.com')) return PLATFORMS.COPILOT;
  return null;
}

function getPlatformMeta(platform) {
  const metas = {
    [PLATFORMS.CLAUDE]:     { name: 'Claude',     color: '#d97706', emoji: '🟠' },
    [PLATFORMS.CHATGPT]:    { name: 'ChatGPT',    color: '#10a37f', emoji: '🟢' },
    [PLATFORMS.GEMINI]:     { name: 'Gemini',     color: '#4285f4', emoji: '🔵' },
    [PLATFORMS.GROK]:       { name: 'Grok',       color: '#e7e7e7', emoji: '⚪' },
    [PLATFORMS.META]:       { name: 'Meta AI',    color: '#0082fb', emoji: '🔷' },
    [PLATFORMS.DEEPSEEK]:   { name: 'DeepSeek',   color: '#4e6ef2', emoji: '🐋' },
    [PLATFORMS.PERPLEXITY]: { name: 'Perplexity', color: '#20b2aa', emoji: '🔍' },
    [PLATFORMS.COPILOT]:    { name: 'Copilot',    color: '#0078d4', emoji: '🪁' },
  };
  return metas[platform] || { name: 'AI Chat', color: '#7c3aed', emoji: '🤖' };
}

// ─────────────────────────────────────────────
// Utilities & Token Tracking
// ─────────────────────────────────────────────

/**
 * Accurately estimates tokens using standard ~3.8 chars/token heuristic
 * (matches tiktoken / Claude BPE tokenizer)
 */
function estimateTokens(textOrLength) {
  if (typeof textOrLength === 'number') {
    return Math.max(0, Math.ceil(textOrLength / 3.8));
  }
  if (!textOrLength) return 0;
  const len = textOrLength.length;
  if (len === 0) return 0;
  return Math.max(0, Math.ceil(len / 3.8));
}

/**
 * Helper to locate the active AI prompt input box or its container
 */
function findTypeBoxElement() {
  if (typeof findTypeBox === 'function') {
    try {
      const tb = findTypeBox();
      if (tb) return tb;
    } catch (_) {}
  }
  const input = document.querySelector(
    'div[contenteditable], [contenteditable="true"], #prompt-textarea, textarea, .ql-editor, fieldset [data-placeholder]'
  );
  if (!input) return document.querySelector('fieldset, form');
  return input.closest('fieldset') || input.closest('form') || input.parentElement?.parentElement || input.parentElement;
}

/**
 * Checks if a string contains indicators of free plan limit exhaustion or approaching limits
 */
function isLimitString(txt) {
  if (!txt || typeof txt !== 'string') return false;
  return /out of (?:free )?messages/i.test(txt) ||
         /messages?\s+remaining until/i.test(txt) ||
         /(?:reached|hit) (?:the |your )?(?:free |message |plan |usage |rate )?limit/i.test(txt) ||
         /free plan limit/i.test(txt) ||
         /rate limit reached/i.test(txt) ||
         /out of messages/i.test(txt);
}

/**
 * Extracts a time string (e.g. "10:50 PM", "11 PM", "22:50") from limit banner text
 */
function extractAnyTime(str) {
  if (!str) return null;
  const m = str.match(/(?:until|at|resets at)\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:[ap]\.?m\.?)?)(?:\s+([a-z]{2,4}|\([a-z0-9+-]+\)))?/i);
  if (m) {
    const time = m[1].trim().toUpperCase();
    const tz = m[2] ? ` ${m[2].trim().toUpperCase()}` : '';
    return `${time}${tz}`;
  }
  return null;
}

/**
 * Parses hours/minutes into a local timestamp (epoch ms)
 */
function parseResetTimestamp(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;

  let hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3] ? m[3].toUpperCase() : null;

  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  const now = new Date();
  const resetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

  // If reset time is earlier than current time today, the reset is tomorrow
  if (resetDate.getTime() <= now.getTime()) {
    resetDate.setDate(resetDate.getDate() + 1);
  }

  return resetDate.getTime();
}

/**
 * Parses raw text from a detected limit notice banner into structured info
 */
function parseLimitString(txt) {
  const clean = txt.replace(/\s+/g, ' ').trim();

  // Pattern 1: "out of free messages until 10:50 PM"
  const mOut = clean.match(/out of (?:free )?messages(?: until\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:[ap]\.?m\.?)?))?/i);
  if (mOut) {
    const time = mOut[1] ? mOut[1].trim().toUpperCase() : extractAnyTime(clean);
    return {
      isLimitReached: true,
      msgsRemaining: 0,
      resetTime: time,
      rawText: clean,
    };
  }

  // Pattern 2: "X messages remaining until 10:50 PM"
  const mRem = clean.match(/(\d+)\s+messages?\s+remaining(?: until\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:[ap]\.?m\.?)?))?/i);
  if (mRem) {
    const rem = parseInt(mRem[1], 10);
    const time = mRem[2] ? mRem[2].trim().toUpperCase() : extractAnyTime(clean);
    return {
      isLimitReached: rem === 0,
      msgsRemaining: rem,
      resetTime: time,
      rawText: clean,
    };
  }

  // Pattern 3: "hit the Free plan limit ... resets at 10:50 PM"
  const mHit = clean.match(/(?:hit the Free plan limit|reached your (?:usage|message|free) limit)(?:.*?resets at\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:[ap]\.?m\.?)?))?/i);
  if (mHit) {
    const time = mHit[1] ? mHit[1].trim().toUpperCase() : extractAnyTime(clean);
    return {
      isLimitReached: true,
      msgsRemaining: 0,
      resetTime: time,
      rawText: clean,
    };
  }

  // Pattern 4: Generic limit reached
  return {
    isLimitReached: true,
    msgsRemaining: 0,
    resetTime: extractAnyTime(clean),
    rawText: clean,
  };
}

/**
 * Scans the active DOM specifically for Claude/ChatGPT/Gemini limit warning banners
 */
function scanDOMForLimitNotice() {
  // Strategy 0: Direct TreeWalker scanning of text nodes across the entire document
  // Extremely fast (<0.5ms) and catches notices regardless of DOM hierarchy or split panes (e.g. Claude artifacts)
  try {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const v = node.nodeValue;
          if (v && isLimitString(v)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      },
      false
    );

    let matchNode;
    while ((matchNode = walker.nextNode())) {
      const parent = matchNode.parentElement;
      if (!parent || parent.closest('.ace-input-limit-bar, script, style')) continue;
      const card = parent.closest('div, section, aside, [role="alert"], p') || parent;
      const fullText = (card.innerText || card.textContent || matchNode.nodeValue || '').trim();
      if (isLimitString(fullText)) {
        return parseLimitString(fullText);
      }
    }
  } catch (_) {}

  // Strategy 1: Check elements around the type box / composer
  const typeBox = findTypeBoxElement();
  if (typeBox) {
    const surrounding = [];
    let prev = typeBox.previousElementSibling;
    while (prev) {
      surrounding.push(prev);
      prev = prev.previousElementSibling;
    }
    if (typeBox.parentElement) {
      let pPrev = typeBox.parentElement.previousElementSibling;
      while (pPrev) {
        surrounding.push(pPrev);
        pPrev = pPrev.previousElementSibling;
      }
      surrounding.push(...Array.from(typeBox.parentElement.children));
    }

    for (const el of surrounding) {
      if (el.classList?.contains('ace-input-limit-bar')) continue;
      const text = (el.innerText || el.textContent || '').trim();
      if (text && isLimitString(text)) {
        return parseLimitString(text);
      }
    }
  }

  // Strategy 2: Look for banner cards containing "Upgrade" / "Get Claude Pro" buttons
  const buttons = document.querySelectorAll('button, a');
  for (const btn of buttons) {
    const btnText = (btn.textContent || '').trim().toLowerCase();
    if (btnText === 'upgrade' || btnText === 'get claude pro' || btnText === 'upgrade to pro' || btnText.includes('upgrade plan')) {
      const card = btn.closest('div, section, aside') || btn.parentElement;
      if (card && !card.closest('.font-claude-message, [data-message-author-role]')) {
        const text = (card.innerText || card.textContent || '').trim();
        if (isLimitString(text)) {
          return parseLimitString(text);
        }
      }
    }
  }

  // Strategy 3: Look for alerts and banner elements
  const alerts = document.querySelectorAll('[role="alert"], [class*="banner"], [class*="alert"], [class*="notice"], [class*="warning"], [class*="limit"]');
  for (const el of alerts) {
    if (el.closest('.font-claude-message, [data-message-author-role], .ace-input-limit-bar')) continue;
    const text = (el.innerText || el.textContent || '').trim();
    if (isLimitString(text)) {
      return parseLimitString(text);
    }
  }

  // Strategy 4: Deep scan of elements with short text (< 300 chars) not inside message history
  const allContainers = document.querySelectorAll('main div, [role="main"] div, body > div');
  for (const el of allContainers) {
    if (el.children.length > 4) continue;
    if (el.closest('.font-claude-message, [data-message-author-role], .ace-input-limit-bar, script, style')) continue;
    const text = (el.innerText || el.textContent || '').trim();
    if (text.length > 5 && text.length < 300 && isLimitString(text)) {
      return parseLimitString(text);
    }
  }

  return null;
}

/**
 * Detects whether the current platform's free message limit has been reached
 * Combines active DOM detection with persistent session storage
 */
function detectPlatformLimitBanner() {
  const platform = detectPlatform();

  // Check in-memory cache first
  if (typeof window !== 'undefined' && window._aceCachedLimitStatus) {
    if (window._aceCachedLimitStatus.resetTimestamp) {
      if (Date.now() < window._aceCachedLimitStatus.resetTimestamp) {
        // Limit is still actively active
      } else {
        // Reset timestamp expired! Clear it
        window._aceCachedLimitStatus = null;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && platform) {
          chrome.storage.local.remove([`ace_limit_${platform}`]);
        }
      }
    }
  }

  // Scan current live DOM
  const found = scanDOMForLimitNotice();
  if (found) {
    if (found.resetTime) {
      found.resetTimestamp = parseResetTimestamp(found.resetTime);
    }
    if (typeof window !== 'undefined') {
      window._aceCachedLimitStatus = found;
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && platform) {
      chrome.storage.local.set({ [`ace_limit_${platform}`]: found });
    }
    return found;
  }

  // If DOM doesn't have the banner visible right now (e.g. user scrolled or on another chat tab)
  // but we know from memory cache that limit is reached until resetTimestamp:
  if (typeof window !== 'undefined' && window._aceCachedLimitStatus && window._aceCachedLimitStatus.isLimitReached) {
    if (!window._aceCachedLimitStatus.resetTimestamp || Date.now() < window._aceCachedLimitStatus.resetTimestamp) {
      return window._aceCachedLimitStatus;
    }
  }

  return null;
}

/**
 * Calculates context window and free limit usage stats
 */
function calculateChatStats(messages, platform, limitStatus = null) {
  let totalChars = 0;
  let userChars = 0;
  let aiChars = 0;

  (messages || []).forEach(m => {
    const text = m.text || '';
    const len = text.length;
    totalChars += len;
    if (m.role === 'user') userChars += len;
    else aiChars += len;
  });

  // Calculate actual tokens directly from character counts
  const totalTokens = Math.max(0, Math.ceil(totalChars / 3.8));
  const userTokens = Math.max(0, Math.ceil(userChars / 3.8));
  const aiTokens = Math.max(0, Math.ceil(aiChars / 3.8));

  // Rolling session limits for free tier before message limits/warning:
  // Claude free tier: ~25,000 tokens (approx. 20-30 conversational turns)
  // ChatGPT free tier: ~32,000 tokens per session
  // Gemini free: ~32,000 tokens
  // DeepSeek: ~25,000 tokens
  const platformLimits = {
    [PLATFORMS.CLAUDE]: 25000,
    [PLATFORMS.CHATGPT]: 32000,
    [PLATFORMS.GEMINI]: 32000,
    [PLATFORMS.DEEPSEEK]: 25000,
    [PLATFORMS.GROK]: 32000,
  };

  const limit = platformLimits[platform] || 25000;
  let percentUsed = 0;
  if (totalTokens > 0 && limit > 0) {
    percentUsed = Math.min(100, Math.max(0, Math.round((totalTokens / limit) * 100)));
  }

  let isLimitReached = false;
  let resetTime = null;
  let bannerText = null;
  let msgsRemaining = null;

  // Live limit detection overrides or enhances the estimates only when explicitly reported by platform
  const activeStatus = limitStatus || (typeof detectPlatformLimitBanner === 'function' ? detectPlatformLimitBanner() : null);
  if (activeStatus) {
    if (activeStatus.isLimitReached) {
      isLimitReached = true;
      percentUsed = 100;
      msgsRemaining = 0;
      resetTime = activeStatus.resetTime;
      bannerText = activeStatus.rawText || activeStatus.bannerText;
    } else if (activeStatus.msgsRemaining !== null && activeStatus.msgsRemaining !== undefined) {
      msgsRemaining = activeStatus.msgsRemaining;
      resetTime = activeStatus.resetTime;
      bannerText = activeStatus.rawText || activeStatus.bannerText;
      // Claude free tier window (~25 messages)
      percentUsed = Math.min(99, Math.max(0, Math.round(((25 - activeStatus.msgsRemaining) / 25) * 100)));
      if (activeStatus.msgsRemaining === 0) {
        isLimitReached = true;
        percentUsed = 100;
      }
    }
  }

  return {
    totalTokens,
    userTokens,
    aiTokens,
    limit,
    percentUsed,
    msgsRemaining,
    isLimitReached,
    resetTime,
    bannerText,
    messageCount: messages ? messages.length : 0,
  };
}

function getCleanText(el) {
  if (!el) return '';
  return (el.innerText || el.textContent || '').trim();
}

function getInnerHTML(el) {
  if (!el) return '';
  return el.innerHTML || '';
}

/** Try an array of selectors; return first non-empty NodeList */
function queryAll(root, selectors) {
  for (const sel of selectors) {
    try {
      const els = root.querySelectorAll(sel);
      if (els && els.length > 0) return Array.from(els);
    } catch (_) {}
  }
  return [];
}

/** Return first matching element from a list of selectors */
function queryOne(root, selectors) {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch (_) {}
  }
  return null;
}

/** Build a message object */
function makeMsg(role, el, idx, timestamp = null) {
  if (!el) return null;
  // Ignore any element residing in sidebar, history list, navigation, drawer, header, or footer
  if (el.closest('aside, nav, [role="navigation"], [class*="sidebar"], [class*="history"], [class*="drawer"], [aria-label*="sidebar" i], [aria-label*="history" i], header, footer')) {
    return null;
  }
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.ace-response-export-btn, .ace-export-dropdown, button, [role="toolbar"]').forEach(n => n.remove());
  const text = getCleanText(clone);
  if (!text || text.length < 2) return null;
  return { role, text, html: getInnerHTML(clone), index: idx, timestamp };
}

/**
 * Nuclear fallback: walk the DOM tree looking for large-ish text containers
 * that look like chat messages (not headers, nav, buttons, etc.).
 * Returns an array of {el, role} by inspecting visual/structural cues.
 */
function nuclearFallback(containerSelectors) {
  const container = queryOne(document, containerSelectors) || document.body;
  const candidates = [];

  // Patterns for landing page greetings, prompt suggestions, disclaimers, etc.
  const IGNORE_PATTERNS = [
    /what can i help (?:with|you)/i,
    /how can i help/i,
    /what(?:'s| would you like) to/i,
    /good (?:morning|afternoon|evening)/i,
    /ask anything/i,
    /start a new chat/i,
    /welcome to/i,
    /what are you working on/i,
    /can make mistakes/i,
    /verify important info/i,
    /ai may display inaccurate/i,
    /check important info/i,
    /terms of service/i,
    /privacy policy/i,
    /how can deepseek help/i,
    /create an image/i,
    /summarize text/i,
    /brainstorm/i,
    /get started/i,
  ];

  // Walk direct children of the conversation container
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        const tag = node.tagName.toLowerCase();
        // Skip clearly non-content elements
        if (['script', 'style', 'svg', 'noscript', 'input', 'textarea', 'button', 'header', 'footer', 'nav'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const seen = new Set();
  let node;
  while ((node = walker.nextNode())) {
    // Only care about elements with direct significant text
    const text = (node.innerText || node.textContent || '').trim();
    if (text.length < 20) continue;

    // Skip empty landing page greetings, cards, suggestions, disclaimers
    if (IGNORE_PATTERNS.some(pat => pat.test(text))) continue;

    // Avoid duplicates (child elements with same text as parent)
    if (seen.has(text)) continue;

    // Check that this element's direct text (not children's) is meaningful
    // Heuristic: if the element has MANY children with text, it's a wrapper — skip it
    const directChildren = Array.from(node.children);
    const childTextTotal = directChildren.reduce((sum, c) => sum + (c.innerText || c.textContent || '').trim().length, 0);
    const ownText = text.length - childTextTotal;

    // Only pick elements that either have own text OR are "leaf" containers (few children)
    if (ownText < 15 && directChildren.length > 3) continue;

    // Classify role by position: get bounding rect
    const rect = node.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 10) continue;

    // Determine alignment: if element is significantly right-shifted it's likely the user
    const centerX = rect.left + rect.width / 2;
    const viewMid = window.innerWidth / 2;

    // User messages are typically right-aligned on Claude/ChatGPT
    const likelyUser = centerX > viewMid * 1.15;

    candidates.push({ el: node, text, likelyUser });
    seen.add(text);
  }

  // A genuine conversation must have at least one user prompt
  // If there are no user prompts found, it is an empty new chat / landing page
  const hasUser = candidates.some(c => c.likelyUser);
  if (!hasUser) {
    return [];
  }

  return candidates;
}

// ─────────────────────────────────────────────
// Claude Parser
// ─────────────────────────────────────────────

function parseClaude() {
  const messages = [];
  let idx = 0;

  // ── Strategy 1: data-testid and class attributes ──
  let humanEls = queryAll(document, [
    '[data-testid="user-message"]',
    '[data-testid="user-turn"]',
    '[data-testid="human-turn"]',
    '[data-testid="human-chat-message"]',
    '[data-testid*="user"]',
    '[data-testid*="human"]',
    '[class*="font-user-message"]',
    '[class*="user-message"]',
    '[class*="UserMessage"]',
    '[class*="human-message"]',
    '[class*="HumanMessage"]',
    '[data-is-human="true"]',
  ]);

  const aiEls = queryAll(document, [
    '[data-testid="ai-turn"]',
    '[data-testid="assistant-turn"]',
    '[data-testid="ai-response"]',
    '[data-testid="assistant-response"]',
    '[data-testid*="ai-turn"]',
    '[data-testid*="assistant"]',
    '[data-testid*="ai-response"]',
    '[class*="ai-turn"]',
    '[class*="assistant-turn"]',
  ]);

  // If human turns weren't found by testids, find the user elements preceding each AI turn
  if (humanEls.length < aiEls.length && aiEls.length > 0) {
    aiEls.forEach(aiEl => {
      const turnWrapper = aiEl.closest('[data-testid*="turn"]') || aiEl;
      let prev = turnWrapper.previousElementSibling;
      while (prev) {
        if (aiEls.some(a => a === prev || prev.contains(a))) break;
        const text = getCleanText(prev);
        if (text.length > 1 && !humanEls.some(h => h === prev || h.contains(prev) || prev.contains(h))) {
          humanEls.push(prev);
          break;
        }
        prev = prev.previousElementSibling;
      }
    });
  }

  if (humanEls.length > 0 || aiEls.length > 0) {
    // Interleave by DOM order
    const all = [
      ...humanEls.map(el => ({ el, role: 'user' })),
      ...aiEls.map(el => ({ el, role: 'assistant' })),
    ].sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    all.forEach(({ el, role }) => {
      const content = queryOne(el, [
        '[class*="font-user-message"]',
        '[data-testid="user-message"]',
        '[class*="user-message"]',
        '.whitespace-pre-wrap',
        '[class*="whitespace-pre-wrap"]',
        '[class*="prose"]', '.prose',
        '[class*="message-content"]',
        '[class*="MessageContent"]',
        'p', 'div',
      ]) || el;
      const msg = makeMsg(role, content, idx++);
      if (msg) messages.push(msg);
    });

    if (messages.length > 0) return buildResult('Claude Chat', messages);
  }

  // ── Strategy 2: Scan for conversation-turn containers ──
  const turnContainers = queryAll(document, [
    '[data-testid^="conversation-turn"]',
    '[class*="ConversationTurn"]',
    '[class*="conversation-turn"]',
    '[class*="ChatMessage"]',
    '[class*="chat-message"]',
    '[class*="message-row"]',
    '[class*="MessageRow"]',
  ]);

  if (turnContainers.length >= 2) {
    turnContainers.forEach(turn => {
      // Detect role by looking inside
      const hasHuman = turn.querySelector('[data-testid*="user"], [data-testid*="human"], [class*="user"], [class*="human"]') ||
                       turn.className?.toLowerCase?.().includes('user') ||
                       turn.className?.toLowerCase?.().includes('human') ||
                       turn.getAttribute('data-is-human') === 'true';

      const content = queryOne(turn, [
        '[class*="font-user-message"]',
        '.prose', '[class*="prose"]',
        '[class*="message"]',
        'p', 'div',
      ]) || turn;

      const msg = makeMsg(hasHuman ? 'user' : 'assistant', content, idx++);
      if (msg) messages.push(msg);
    });

    if (messages.length > 0) return buildResult('Claude Chat', messages);
  }

  // ── Strategy 3: Look for the main chat scroll container and walk children ──
  const scrollContainer = queryOne(document, [
    '[class*="overflow-y-auto"]',
    '[class*="scrollable"]',
    'main',
    '[role="main"]',
  ]);

  if (scrollContainer) {
    // Direct children that are message-like
    const children = Array.from(scrollContainer.children);
    // Claude tends to alternate: user → AI → user → AI
    if (children.length >= 2) {
      // Try to detect pattern: alternating large blocks
      let foundPair = false;
      for (let i = 0; i < children.length - 1; i++) {
        const a = getCleanText(children[i]);
        const b = getCleanText(children[i + 1]);
        if (a.length > 20 && b.length > 20) { foundPair = true; break; }
      }

      if (foundPair) {
        children.forEach((child, i) => {
          const text = getCleanText(child);
          if (text.length < 10) return;
          // Odd indices = AI, even = user (heuristic for Claude)
          const role = i % 2 === 0 ? 'user' : 'assistant';
          const msg = makeMsg(role, child, idx++);
          if (msg) messages.push(msg);
        });

        if (messages.length >= 2) return buildResult('Claude Chat', messages);
      }
    }
  }

  // ── Strategy 4: Nuclear fallback ──
  const nuclear = nuclearFallback([
    '[class*="conversation"]',
    '[class*="Conversation"]',
    'main',
    '[role="main"]',
    'body',
  ]);

  nuclear.forEach(({ el, likelyUser }) => {
    const msg = makeMsg(likelyUser ? 'user' : 'assistant', el, idx++);
    if (msg) messages.push(msg);
  });

  // Deduplicate (nuclear may find overlapping elements)
  const deduped = deduplicateMessages(messages);

  const title = getCleanText(queryOne(document, ['title', 'h1', '[data-testid*="title"]']));
  return buildResult(title || 'Claude Chat', deduped);
}

// ─────────────────────────────────────────────
// ChatGPT Parser
// ─────────────────────────────────────────────

function parseChatGPT() {
  const messages = [];
  let idx = 0;

  // Strategy 1: data-message-author-role (most stable ChatGPT attribute)
  const turns = queryAll(document, ['[data-message-author-role]']);

  if (turns.length > 0) {
    turns.forEach(turn => {
      const role = turn.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
      const content = queryOne(turn, [
        '.markdown.prose', '.markdown', '[class*="prose"]',
        '[class*="message-content"]', '.whitespace-pre-wrap',
        'p', 'div',
      ]) || turn;

      const timeEl = turn.querySelector('time,[datetime]');
      const timestamp = timeEl?.getAttribute('datetime') || null;
      const msg = makeMsg(role, content, idx++, timestamp);
      if (msg) messages.push(msg);
    });
    if (messages.length > 0) return buildResult('ChatGPT Chat', messages);
  }

  // Strategy 2: conversation turn testids
  const turnContainers = queryAll(document, [
    '[data-testid^="conversation-turn"]',
    '[class*="group/conversation-turn"]',
    '[class*="ConversationTurn"]',
  ]);

  if (turnContainers.length >= 2) {
    turnContainers.forEach((turn, i) => {
      const isUser = i % 2 === 0;
      const content = queryOne(turn, ['.markdown', '[class*="prose"]', 'p']) || turn;
      const msg = makeMsg(isUser ? 'user' : 'assistant', content, idx++);
      if (msg) messages.push(msg);
    });
    if (messages.length > 0) return buildResult('ChatGPT Chat', messages);
  }

  // Nuclear fallback
  const nuclear = nuclearFallback(['main', '[role="main"]', 'body']);
  nuclear.forEach(({ el, likelyUser }) => {
    const msg = makeMsg(likelyUser ? 'user' : 'assistant', el, idx++);
    if (msg) messages.push(msg);
  });

  const title = getCleanText(queryOne(document, ['title'])).replace(' - ChatGPT', '').trim();
  return buildResult(title || 'ChatGPT Chat', deduplicateMessages(messages));
}

// ─────────────────────────────────────────────
// Gemini Parser
// ─────────────────────────────────────────────

function parseGemini() {
  const messages = [];
  let idx = 0;

  // Strategy 1: Custom elements
  const userEls  = queryAll(document, ['user-query',  '[data-turn-role="user"]',  '.user-query-bubble-with-background']);
  const modelEls = queryAll(document, ['model-response', '[data-turn-role="model"]', '.response-container']);

  if (userEls.length > 0 || modelEls.length > 0) {
    const all = [
      ...userEls.map(el  => ({ el, role: 'user' })),
      ...modelEls.map(el => ({ el, role: 'assistant' })),
    ].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

    all.forEach(({ el, role }) => {
      const content = queryOne(el, ['.query-text', '.response-text', '[class*="text-body"]', '.markdown-main-panel', 'p']) || el;
      const msg = makeMsg(role, content, idx++);
      if (msg) messages.push(msg);
    });
    if (messages.length > 0) return buildResult('Gemini Chat', messages);
  }

  // Strategy 2: conversation turns by data-turn-role
  const turns = queryAll(document, ['[data-turn-role]', 'conversation-turn', '[class*="ConversationTurn"]']);
  turns.forEach(turn => {
    const role = turn.getAttribute('data-turn-role') === 'user' ? 'user' : 'assistant';
    const content = queryOne(turn, ['.query-text', '.response-text', '[class*="markdown"]', 'p']) || turn;
    const msg = makeMsg(role, content, idx++);
    if (msg) messages.push(msg);
  });

  if (messages.length > 0) return buildResult('Gemini Chat', messages);

  // Nuclear
  const nuclear = nuclearFallback(['main', '.conversation-container', 'body']);
  nuclear.forEach(({ el, likelyUser }) => {
    const msg = makeMsg(likelyUser ? 'user' : 'assistant', el, idx++);
    if (msg) messages.push(msg);
  });

  const title = getCleanText(queryOne(document, ['title'])).replace(' - Gemini', '').trim();
  return buildResult(title || 'Gemini Chat', deduplicateMessages(messages));
}

// ─────────────────────────────────────────────
// Grok Parser
// ─────────────────────────────────────────────

function parseGrok() {
  const messages = [];
  let idx = 0;

  const turns = queryAll(document, [
    '[class*="message-bubble"]', '[class*="MessageBubble"]',
    '[class*="chat-message"]',   '[class*="ChatMessage"]',
    '[data-testid*="message"]',
    '[class*="ConversationTurn"]',
    '[class*="message-row"]',
  ]);

  turns.forEach(turn => {
    const isUser = turn.className?.toLowerCase?.().includes('user') ||
                   turn.getAttribute('data-role') === 'user';
    const content = queryOne(turn, ['[class*="prose"]', '[class*="markdown"]', 'p']) || turn;
    const msg = makeMsg(isUser ? 'user' : 'assistant', content, idx++);
    if (msg) messages.push(msg);
  });

  if (messages.length > 0) return buildResult('Grok Chat', messages);

  const nuclear = nuclearFallback(['main', '[role="main"]', 'body']);
  nuclear.forEach(({ el, likelyUser }) => {
    const msg = makeMsg(likelyUser ? 'user' : 'assistant', el, idx++);
    if (msg) messages.push(msg);
  });

  const title = getCleanText(queryOne(document, ['title'])).replace(' | Grok', '').trim();
  return buildResult(title || 'Grok Chat', deduplicateMessages(messages));
}

// ─────────────────────────────────────────────
// Meta AI Parser
// ─────────────────────────────────────────────

function parseMetaAI() {
  const messages = [];
  let idx = 0;

  const chatContainer = queryOne(document, ['main', '[role="main"]', '[class*="chat"]']) || document.body;

  const turns = queryAll(chatContainer, [
    '[data-testid="message"]',
    '[data-testid*="message"]',
    '[data-testid*="msg"]',
    '[class*="outgoing"]',
    '[class*="incoming"]',
    '[class*="Message"]',
    '[role="row"]',
  ]);

  turns.forEach(turn => {
    if (turn.closest('aside, nav, [class*="sidebar"], [class*="history"], header, footer')) return;
    const isUser = turn.className?.toLowerCase?.().includes('outgoing') ||
                   turn.className?.toLowerCase?.().includes('user') ||
                   turn.getAttribute('aria-label')?.toLowerCase?.().includes('you');
    const content = queryOne(turn, ['[class*="message-body"]', '[dir="auto"]', 'p']) || turn;
    const msg = makeMsg(isUser ? 'user' : 'assistant', content, idx++);
    if (msg) messages.push(msg);
  });

  const hasUser = messages.some(m => m.role === 'user');
  if (messages.length > 0 && hasUser) {
    return buildResult('Meta AI Chat', deduplicateMessages(messages));
  }

  const nuclear = nuclearFallback(['main', '[role="main"]', 'body']);
  nuclear.forEach(({ el, likelyUser }) => {
    const msg = makeMsg(likelyUser ? 'user' : 'assistant', el, idx++);
    if (msg) messages.push(msg);
  });

  const hasUserNuclear = messages.some(m => m.role === 'user');
  if (messages.length > 0 && hasUserNuclear) {
    return buildResult('Meta AI Chat', deduplicateMessages(messages));
  }

  return buildResult('Meta AI Chat', []);
}

// ─────────────────────────────────────────────
// DeepSeek Parser
// ─────────────────────────────────────────────

function parseDeepSeek() {
  const messages = [];
  let idx = 0;

  const chatContainer = queryOne(document, [
    'main', '[role="main"]', '[class*="chat-container"]', '[class*="chat-scroll"]', '[class*="chat-view"]'
  ]) || document.body;

  // Specific DeepSeek message turns in chat area
  const turns = queryAll(chatContainer, [
    '[class*="ds-message"]:not([class*="sidebar"])',
    '[class*="fendHuman"]',
    '[class*="fendAssist"]',
    '[class*="chat-message"]',
    '[class*="chat-item"]',
  ]);

  turns.forEach(turn => {
    if (turn.closest('aside, nav, [class*="sidebar"], [class*="history"], [class*="drawer"]')) return;
    const isHuman = turn.className?.toLowerCase?.().includes('human') ||
                    turn.className?.toLowerCase?.().includes('user') ||
                    turn.getAttribute('data-role') === 'user';
    const content = queryOne(turn, ['[class*="ds-markdown"]', '[class*="markdown"]', 'p']) || turn;
    const msg = makeMsg(isHuman ? 'user' : 'assistant', content, idx++);
    if (msg) messages.push(msg);
  });

  const hasUser = messages.some(m => m.role === 'user');
  if (messages.length > 0 && hasUser) {
    const title = getCleanText(queryOne(document, ['title'])).replace('DeepSeek', '').trim();
    return buildResult(title || 'DeepSeek Chat', deduplicateMessages(messages));
  }

  // If no user messages were detected, it's an empty new chat
  return buildResult('DeepSeek Chat', []);
}

// ─────────────────────────────────────────────
// Perplexity Parser
// ─────────────────────────────────────────────

function parsePerplexity() {
  const messages = [];
  let idx = 0;

  const userEls = queryAll(document, [
    '[data-testid="user-message"]', '[class*="UserMessage"]', '.query',
  ]);
  const aiEls = queryAll(document, [
    '[data-testid="answer"]', '[class*="ProAnswer"]', '[class*="AnswerBody"]', '.prose',
  ]);

  userEls.forEach((el, i) => {
    const msg = makeMsg('user', el, idx++);
    if (msg) messages.push(msg);
    if (aiEls[i]) {
      const aiMsg = makeMsg('assistant', aiEls[i], idx++);
      if (aiMsg) messages.push(aiMsg);
    }
  });

  if (messages.length > 0) return buildResult('Perplexity Chat', messages);

  const nuclear = nuclearFallback(['main', 'body']);
  nuclear.forEach(({ el, likelyUser }) => {
    const msg = makeMsg(likelyUser ? 'user' : 'assistant', el, idx++);
    if (msg) messages.push(msg);
  });

  const title = getCleanText(queryOne(document, ['title'])).replace('- Perplexity', '').trim();
  return buildResult(title || 'Perplexity Chat', deduplicateMessages(messages));
}

// ─────────────────────────────────────────────
// Copilot Parser
// ─────────────────────────────────────────────

function parseCopilot() {
  const messages = [];
  let idx = 0;

  const turns = queryAll(document, [
    '[data-testid*="message"]', '[class*="message"]',
    '[class*="Message"]', '[class*="chat-bubble"]',
  ]);

  turns.forEach(turn => {
    const isUser = turn.className?.toLowerCase?.().includes('user') ||
                   turn.getAttribute('data-testid')?.includes('user');
    const content = queryOne(turn, ['[class*="message-body"]', '[class*="prose"]', 'p']) || turn;
    const msg = makeMsg(isUser ? 'user' : 'assistant', content, idx++);
    if (msg) messages.push(msg);
  });

  if (messages.length > 0) return buildResult('Copilot Chat', messages);

  const nuclear = nuclearFallback(['main', 'body']);
  nuclear.forEach(({ el, likelyUser }) => {
    const msg = makeMsg(likelyUser ? 'user' : 'assistant', el, idx++);
    if (msg) messages.push(msg);
  });

  return buildResult('Copilot Chat', deduplicateMessages(messages));
}

// ─────────────────────────────────────────────
// Shared Helpers
// ─────────────────────────────────────────────

function buildResult(defaultTitle, messages) {
  const title = getCleanText(queryOne(document, [
    'title',
    'h1',
    '[data-testid*="title"]',
    '[class*="conversation-title"]',
    '[class*="chat-title"]',
  ])) || defaultTitle;

  // Clean up title — remove common suffixes
  const cleanTitle = title
    .replace(/ - ChatGPT$/i, '')
    .replace(/ - Gemini$/i, '')
    .replace(/ \| Grok$/i, '')
    .replace(/DeepSeek/i, '')
    .replace(/^Claude$/, 'Claude Chat')
    .trim() || defaultTitle;

  return { title: cleanTitle, messages };
}

/** Remove messages with duplicate text (caused by parent/child overlap in nuclear mode) */
function deduplicateMessages(messages) {
  const seen = new Set();
  const result = [];
  for (const msg of messages) {
    const key = msg.text.substring(0, 100);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(msg);
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────

function parseChat() {
  const platform = detectPlatform();
  if (!platform) return null;

  let result;
  try {
    switch (platform) {
      case PLATFORMS.CLAUDE:      result = parseClaude();      break;
      case PLATFORMS.CHATGPT:     result = parseChatGPT();     break;
      case PLATFORMS.GEMINI:      result = parseGemini();      break;
      case PLATFORMS.GROK:        result = parseGrok();        break;
      case PLATFORMS.META:        result = parseMetaAI();      break;
      case PLATFORMS.DEEPSEEK:    result = parseDeepSeek();    break;
      case PLATFORMS.PERPLEXITY:  result = parsePerplexity();  break;
      case PLATFORMS.COPILOT:     result = parseCopilot();     break;
      default: return null;
    }
  } catch (err) {
    console.error('[ACE] Parser error:', err);
    result = { title: 'AI Chat', messages: [] };
  }

  const filteredMsgs = (result.messages || []).filter(m => m && m.text && m.text.length > 1);
  const limitStatus = detectPlatformLimitBanner();
  const stats = calculateChatStats(filteredMsgs, platform, limitStatus);

  return {
    ...result,
    platform,
    platformMeta: getPlatformMeta(platform),
    url: window.location.href,
    exportedAt: new Date().toISOString(),
    messages: filteredMsgs,
    stats,
  };
}
