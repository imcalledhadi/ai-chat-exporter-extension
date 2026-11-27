/**
 * AI Chat Exporter — Background Service Worker
 * Handles: PDF tab opening, cross-tab communication, downloads.
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Open a new tab with the PDF print template
  if (msg.action === 'openPdfTab') {
    const blob = new Blob([msg.html], { type: 'text/html;charset=utf-8' });
    // Can't use blob URLs in background worker directly — use data URL
    // Convert HTML to data URL for new tab
    const encoded = encodeURIComponent(msg.html);
    const dataUrl = 'data:text/html;charset=utf-8,' + encoded;

    chrome.tabs.create({ url: dataUrl, active: true }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });
    return true; // async
  }

  // Open the popup programmatically (triggered from FAB)
  if (msg.action === 'openPopup') {
    // Note: chrome.action.openPopup() requires user gesture in MV3
    // The FAB click IS a user gesture, so we attempt it
    try {
      chrome.action.openPopup();
    } catch (e) {
      // Fallback: create a popup-like tab
      console.warn('[ACE] Cannot open popup automatically:', e.message);
    }
    sendResponse({ success: true });
    return true;
  }

  // Open extension options / settings page
  if (msg.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return true;
  }

  // Handle direct download requests from content scripts
  if (msg.action === 'download') {
    chrome.downloads.download({
      url: msg.dataUrl,
      filename: msg.filename,
      saveAs: false,
    }, (downloadId) => {
      sendResponse({ success: true, downloadId });
    });
    return true;
  }

  // Open a new tab (e.g. for AI handoff / continuation)
  if (msg.action === 'openTab') {
    chrome.tabs.create({ url: msg.url, active: true }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });
    return true;
  }
});

// On extension install/update: show a welcome notification
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: 'https://claude.ai',
      active: true,
    });
  }
});
