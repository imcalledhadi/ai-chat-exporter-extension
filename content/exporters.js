/**
 * AI Chat Exporter — Export Engines
 * Converts parsed chat data into PDF, Word (DOCX), TXT, HTML, JSON formats.
 */

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilename(name) {
  return (name || 'chat')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 80);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
}

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function htmlToMarkdown(html) {
  if (!html) return '';
  // Create a detached DOM to parse
  const div = document.createElement('div');
  div.innerHTML = html;
  return nodeToMarkdown(div).trim();
}

function nodeToMarkdown(node, context = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  const children = () => Array.from(node.childNodes).map(n => nodeToMarkdown(n, context)).join('');

  switch (tag) {
    case 'h1': return `\n# ${children()}\n`;
    case 'h2': return `\n## ${children()}\n`;
    case 'h3': return `\n### ${children()}\n`;
    case 'h4': return `\n#### ${children()}\n`;
    case 'h5': return `\n##### ${children()}\n`;
    case 'h6': return `\n###### ${children()}\n`;
    case 'p':  return `\n${children()}\n`;
    case 'br': return '\n';
    case 'hr': return '\n---\n';
    case 'strong':
    case 'b':  return `**${children()}**`;
    case 'em':
    case 'i':  return `*${children()}*`;
    case 's':
    case 'del': return `~~${children()}~~`;
    case 'code': {
      if (node.parentElement?.tagName?.toLowerCase() === 'pre') return node.textContent;
      return `\`${node.textContent}\``;
    }
    case 'pre': {
      const codeEl = node.querySelector('code');
      const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || '';
      const code = codeEl ? codeEl.textContent : node.textContent;
      return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    }
    case 'blockquote': return `\n> ${children().split('\n').join('\n> ')}\n`;
    case 'a': {
      const href = node.getAttribute('href') || '#';
      return `[${children()}](${href})`;
    }
    case 'img': {
      const alt = node.getAttribute('alt') || 'image';
      const src = node.getAttribute('src') || '';
      return `![${alt}](${src})`;
    }
    case 'ul': {
      return '\n' + Array.from(node.children).map(li => `- ${nodeToMarkdown(li, context).trim()}`).join('\n') + '\n';
    }
    case 'ol': {
      return '\n' + Array.from(node.children).map((li, i) => `${i + 1}. ${nodeToMarkdown(li, context).trim()}`).join('\n') + '\n';
    }
    case 'li': return children();
    case 'table': return tableToMarkdown(node) + '\n';
    case 'thead':
    case 'tbody':
    case 'tr':
    case 'th':
    case 'td': return children();
    case 'div':
    case 'section':
    case 'article': return children();
    case 'span': return children();
    default: return children();
  }
}

function tableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';

  const toRow = (tr) => Array.from(tr.querySelectorAll('th, td'))
    .map(cell => cell.innerText.replace(/\|/g, '\\|').trim());

  const header = toRow(rows[0]);
  const separator = header.map(() => '---');
  const body = rows.slice(1).map(toRow);

  const lines = [
    '| ' + header.join(' | ') + ' |',
    '| ' + separator.join(' | ') + ' |',
    ...body.map(r => '| ' + r.join(' | ') + ' |'),
  ];
  return '\n' + lines.join('\n') + '\n';
}

// ─────────────────────────────────────────────
// Markdown Exporter
// ─────────────────────────────────────────────

function exportMarkdown(chatData, options = {}) {
  const { showTimestamps = true, selectedIndices = null } = options;
  const { title, messages, platformMeta, url, exportedAt } = chatData;

  const msgs = selectedIndices
    ? messages.filter(m => selectedIndices.includes(m.index))
    : messages;

  let md = `# ${title}\n\n`;
  md += `**Platform:** ${platformMeta.name}  \n`;
  md += `**Exported:** ${formatTimestamp(exportedAt)}  \n`;
  md += `**URL:** ${url}  \n\n`;
  md += `---\n\n`;

  msgs.forEach(msg => {
    const roleLabel = msg.role === 'user' ? '## 👤 You' : `## 🤖 ${platformMeta.name}`;
    md += roleLabel + '\n\n';
    if (showTimestamps && msg.timestamp) {
      md += `*${formatTimestamp(msg.timestamp)}*\n\n`;
    }
    const content = msg.html ? htmlToMarkdown(msg.html) : msg.text;
    md += content.trim() + '\n\n---\n\n';
  });

  downloadBlob(
    new Blob([md], { type: 'text/markdown;charset=utf-8' }),
    `${sanitizeFilename(title)}.md`
  );
}

// ─────────────────────────────────────────────
// Plain Text Exporter
// ─────────────────────────────────────────────

function exportTxt(chatData, options = {}) {
  const { showTimestamps = true, selectedIndices = null } = options;
  const { title, messages, platformMeta, url, exportedAt } = chatData;

  const msgs = selectedIndices
    ? messages.filter(m => selectedIndices.includes(m.index))
    : messages;

  const sep = '─'.repeat(60);
  let txt = `${title}\n${sep}\n`;
  txt += `Platform: ${platformMeta.name}\n`;
  txt += `Exported: ${formatTimestamp(exportedAt)}\n`;
  txt += `URL: ${url}\n`;
  txt += `${sep}\n\n`;

  msgs.forEach(msg => {
    const roleLabel = msg.role === 'user' ? 'YOU' : platformMeta.name.toUpperCase();
    txt += `[${roleLabel}]`;
    if (showTimestamps && msg.timestamp) txt += ` — ${formatTimestamp(msg.timestamp)}`;
    txt += '\n';
    txt += msg.text.trim() + '\n\n' + sep + '\n\n';
  });

  downloadBlob(
    new Blob([txt], { type: 'text/plain;charset=utf-8' }),
    `${sanitizeFilename(title)}.txt`
  );
}

// ─────────────────────────────────────────────
// JSON Exporter
// ─────────────────────────────────────────────

function exportJson(chatData, options = {}) {
  const { selectedIndices = null } = options;
  const { title, messages, platform, platformMeta, url, exportedAt } = chatData;

  const msgs = selectedIndices
    ? messages.filter(m => selectedIndices.includes(m.index))
    : messages;

  const output = {
    metadata: { title, platform, platformName: platformMeta.name, url, exportedAt, messageCount: msgs.length },
    messages: msgs.map(m => ({
      role: m.role,
      content: m.text,
      timestamp: m.timestamp || null,
      index: m.index,
    })),
  };

  downloadBlob(
    new Blob([JSON.stringify(output, null, 2)], { type: 'application/json;charset=utf-8' }),
    `${sanitizeFilename(title)}.json`
  );
}

// ─────────────────────────────────────────────
// HTML Exporter
// ─────────────────────────────────────────────

function exportHtml(chatData, options = {}) {
  const { showTimestamps = true, selectedIndices = null, theme = 'dark' } = options;
  const { title, messages, platformMeta, url, exportedAt } = chatData;

  const msgs = selectedIndices
    ? messages.filter(m => selectedIndices.includes(m.index))
    : messages;

  const isDark = theme === 'dark';
  const bg = isDark ? '#0f0f17' : '#f8f9ff';
  const cardBg = isDark ? '#1a1a2e' : '#ffffff';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  const userBg = isDark ? '#1e1b4b' : '#f0f0ff';
  const aiBg = isDark ? '#0c1a14' : '#f0fff4';
  const borderColor = isDark ? '#2d2d4e' : '#e2e8f0';
  const accentColor = platformMeta.color || '#7c3aed';

  const messagesHtml = msgs.map(msg => {
    const isUser = msg.role === 'user';
    const label = isUser ? '👤 You' : `🤖 ${platformMeta.name}`;
    const msgBg = isUser ? userBg : aiBg;
    const content = msg.html || escapeHtml(msg.text);
    const timeStr = showTimestamps && msg.timestamp
      ? `<span class="timestamp">${formatTimestamp(msg.timestamp)}</span>` : '';

    return `
    <div class="message ${isUser ? 'user-message' : 'ai-message'}">
      <div class="message-header">
        <span class="role-label">${label}</span>${timeStr}
      </div>
      <div class="message-body">${content}</div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — ${platformMeta.name} Export</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: ${bg}; color: ${textColor}; line-height: 1.7; padding: 2rem 1rem; }
  .container { max-width: 860px; margin: 0 auto; }
  .header { background: ${cardBg}; border: 1px solid ${borderColor}; border-radius: 16px; padding: 2rem; margin-bottom: 2rem; }
  .header h1 { font-size: 1.6rem; font-weight: 700; color: ${accentColor}; margin-bottom: 0.5rem; }
  .meta { font-size: 0.85rem; opacity: 0.7; display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; }
  .meta span::before { content: attr(data-label) ": "; font-weight: 600; }
  .message { border-radius: 12px; margin-bottom: 1.5rem; overflow: hidden; border: 1px solid ${borderColor}; }
  .message-header { padding: 0.75rem 1.25rem; display: flex; justify-content: space-between; align-items: center; background: rgba(${isDark ? '255,255,255' : '0,0,0'},0.05); border-bottom: 1px solid ${borderColor}; }
  .role-label { font-weight: 600; font-size: 0.9rem; }
  .user-message .role-label { color: #818cf8; }
  .ai-message .role-label { color: ${accentColor}; }
  .timestamp { font-size: 0.78rem; opacity: 0.5; }
  .message-body { padding: 1.25rem; background: ${isDark ? 'transparent' : '#fff'}; }
  .message-body p { margin-bottom: 0.75rem; }
  .message-body pre { background: ${isDark ? '#0d0d1a' : '#f1f5f9'}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 1rem; overflow-x: auto; margin: 0.75rem 0; }
  .message-body code { font-family: 'JetBrains Mono', monospace; font-size: 0.85em; }
  .message-body p code { background: ${isDark ? '#1e1e3a' : '#f1f5f9'}; padding: 2px 6px; border-radius: 4px; }
  .message-body table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.9rem; }
  .message-body th, .message-body td { border: 1px solid ${borderColor}; padding: 0.5rem 0.75rem; text-align: left; }
  .message-body th { background: ${isDark ? '#1e1e3a' : '#f1f5f9'}; font-weight: 600; }
  .message-body ul, .message-body ol { padding-left: 1.5rem; margin: 0.5rem 0; }
  .message-body li { margin-bottom: 0.25rem; }
  .message-body blockquote { border-left: 3px solid ${accentColor}; padding-left: 1rem; opacity: 0.8; margin: 0.5rem 0; }
  .message-body h1,.message-body h2,.message-body h3,.message-body h4 { font-weight: 700; margin: 1rem 0 0.5rem; }
  .message-body a { color: ${accentColor}; text-decoration: none; }
  .message-body a:hover { text-decoration: underline; }
  .footer { text-align: center; font-size: 0.78rem; opacity: 0.4; margin-top: 3rem; padding-top: 2rem; border-top: 1px solid ${borderColor}; }
  @media print {
    body { background: #fff; color: #000; }
    .message { border: 1px solid #ccc; }
    .message-header { background: #f0f0f0; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <span data-label="Platform">${platformMeta.name}</span>
      <span data-label="Messages">${msgs.length}</span>
      <span data-label="Exported">${formatTimestamp(exportedAt)}</span>
      <span data-label="URL"><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></span>
    </div>
  </div>
  ${messagesHtml}
  <div class="footer">Exported with AI Chat Exporter</div>
</div>
</body>
</html>`;

  downloadBlob(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `${sanitizeFilename(title)}.html`
  );
}

// ─────────────────────────────────────────────
// PDF Exporter (Opens print-ready tab)
// ─────────────────────────────────────────────

function exportPdf(chatData, options = {}) {
  const { showTimestamps = true, selectedIndices = null, pageSize = 'A4', pageType = 'A4', showPageNumbers = true, margins = 'normal', pageBorder = 'normal' } = options;
  const { title, messages, platformMeta, url, exportedAt } = chatData;

  const msgs = selectedIndices
    ? messages.filter(m => selectedIndices.includes(m.index))
    : messages;

  const accentColor = platformMeta.color || '#7c3aed';

  const messagesHtml = msgs.map(msg => {
    const isUser = msg.role === 'user';
    const label = isUser ? '👤 You' : `🤖 ${platformMeta.name}`;
    const content = msg.html || escapeHtml(msg.text);
    const timeStr = showTimestamps && msg.timestamp
      ? `<div class="timestamp">${formatTimestamp(msg.timestamp)}</div>` : '';

    return `
    <div class="message ${isUser ? 'user-message' : 'ai-message'}">
      <div class="message-header">
        <span class="role-label">${label}</span>${timeStr}
      </div>
      <div class="message-body">${content}</div>
    </div>`;
  }).join('\n');

  const selectedSize = options.pageType || options.pageSize || 'A4';
  const pageSizeMap = {
    'A3': 'A3',
    'A4': 'A4',
    'A5': 'A5',
    'Legal': 'legal',
    'Letter': 'letter',
    'Tabloid': '11in 17in',
  };
  // Page Border: Empty space on all 4 sides (Normal = 1 inch, Narrow = 0.5 inch)
  const isNarrow = options.pageBorder === 'narrow' || options.margins === 'narrow';
  const marginValue = isNarrow ? '0.5in' : '1in';
  const pageCss = `@page { size: ${pageSizeMap[selectedSize] || 'A4'}; margin: ${marginValue}; }`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  ${pageCss}
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #000000;
    background: #ffffff;
    padding: 0;
  }
  .container { max-width: 100%; padding: 0; }
  .doc-header {
    border-bottom: 2px solid ${accentColor};
    padding-bottom: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .doc-header h1 { font-size: 18pt; color: ${accentColor}; margin-bottom: 0.3rem; }
  .meta { font-size: 9pt; color: #444444; }
  .message {
    border: 1px solid #bbbbbb;
    border-radius: 8px;
    margin-bottom: 1rem;
    page-break-inside: avoid;
    overflow: hidden;
  }
  .message-header {
    padding: 0.4rem 0.8rem;
    background: #f0f0f0;
    border-bottom: 1px solid #bbbbbb;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .role-label { font-weight: 700; font-size: 10pt; }
  .user-message .role-label { color: #5b5fc7; }
  .ai-message .role-label { color: ${accentColor}; }
  .timestamp { font-size: 8pt; color: #555555; }
  .message-body { padding: 0.8rem; color: #000000; }
  .message-body p { margin-bottom: 0.5rem; color: #000000; }
  .message-body pre {
    background: #f4f4f8;
    border: 1px solid #bbbbbb;
    border-radius: 4px;
    padding: 0.6rem;
    overflow-x: auto;
    margin: 0.5rem 0;
    font-size: 9pt;
    white-space: pre-wrap;
    word-break: break-all;
    color: #000000;
  }
  .message-body code { font-family: 'JetBrains Mono', monospace; font-size: 9pt; color: #000000; }
  .message-body p code {
    background: #f4f4f8;
    padding: 1px 4px;
    border-radius: 3px;
    color: #000000;
  }
  .message-body table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 10pt; }
  .message-body th, .message-body td { border: 1px solid #999999; padding: 0.3rem 0.5rem; color: #000000; }
  .message-body th { background: #e8e8e8; font-weight: 700; }
  .message-body ul, .message-body ol { padding-left: 1.2rem; margin: 0.3rem 0; color: #000000; }
  .message-body li { margin-bottom: 0.15rem; color: #000000; }
  .message-body blockquote { border-left: 3px solid ${accentColor}; padding-left: 0.8rem; color: #111111; }
  .message-body h1,.message-body h2,.message-body h3,.message-body h4 { margin: 0.5rem 0 0.25rem; font-weight: 700; color: #000000; }
  .message-body a { color: ${accentColor}; }
  .footer { text-align: center; font-size: 8pt; color: #888888; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #bbbbbb; }
  @media print {
    .no-print { display: none !important; }
  }
</style>
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 800);
  };
<\/script>
</head>
<body>
<div class="container">
  <div class="doc-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${platformMeta.name} · ${msgs.length} messages · Exported ${formatTimestamp(exportedAt)}
    </div>
  </div>
  ${messagesHtml}
  <div class="footer">Exported with AI Chat Exporter · ${escapeHtml(url)}</div>
</div>
</body>
</html>`;

  // Send to background to open in new tab
  chrome.runtime.sendMessage({
    action: 'openPdfTab',
    html,
    filename: sanitizeFilename(title),
  });
}

// ─────────────────────────────────────────────
// Word/DOCX Exporter (RTF-based, universally openable)
// ─────────────────────────────────────────────

function exportWord(chatData, options = {}) {
  const { showTimestamps = true, selectedIndices = null } = options;
  const { title, messages, platformMeta, url, exportedAt } = chatData;

  const msgs = selectedIndices
    ? messages.filter(m => selectedIndices.includes(m.index))
    : messages;

  // We generate rich HTML and let Word open it as .doc
  const accentColor = platformMeta.color || '#7c3aed';

  const messagesHtml = msgs.map(msg => {
    const isUser = msg.role === 'user';
    const label = isUser ? '👤 You' : `🤖 ${platformMeta.name}`;
    const content = msg.html || escapeHtml(msg.text);
    const timeStr = showTimestamps && msg.timestamp
      ? `<p style="font-size:9pt;color:#888">${formatTimestamp(msg.timestamp)}</p>` : '';

    const bgColor = isUser ? '#f0f0ff' : '#f0fff4';
    const borderColor = isUser ? '#818cf8' : accentColor;

    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12pt;border-collapse:collapse">
      <tr>
        <td style="background:${bgColor};border:1pt solid #ddd;border-radius:4pt;padding:10pt">
          <p style="font-weight:bold;color:${borderColor};margin:0 0 4pt">${label}</p>
          ${timeStr}
          <div>${content}</div>
        </td>
      </tr>
    </table>`;
  }).join('\n');

  const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<meta name=ProgId content=Word.Document>
<meta name=Generator content="AI Chat Exporter">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: 'Calibri', Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.5; }
  h1 { font-size: 18pt; color: ${accentColor}; margin-bottom: 4pt; }
  .meta { font-size: 9pt; color: #666; margin-bottom: 12pt; }
  pre { background: #f1f5f9; border: 1pt solid #ddd; padding: 8pt; font-size: 9pt; white-space: pre-wrap; font-family: 'Courier New', monospace; }
  code { font-family: 'Courier New', monospace; font-size: 9pt; background: #f1f5f9; padding: 1pt 3pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
  th, td { border: 1pt solid #ddd; padding: 4pt 6pt; }
  th { background: #f5f5f5; font-weight: bold; }
  hr { border: none; border-top: 1pt solid #ddd; margin: 12pt 0; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Platform: ${platformMeta.name} &nbsp;|&nbsp; Messages: ${msgs.length} &nbsp;|&nbsp; Exported: ${formatTimestamp(exportedAt)}</p>
<hr>
${messagesHtml}
<hr>
<p style="font-size:8pt;color:#999;text-align:center">Exported with AI Chat Exporter &middot; ${escapeHtml(url)}</p>
</body>
</html>`;

  downloadBlob(
    new Blob([wordHtml], { type: 'application/msword;charset=utf-8' }),
    `${sanitizeFilename(title)}.doc`
  );
}

// ─────────────────────────────────────────────
// Main Export Dispatcher
// ─────────────────────────────────────────────

function runExport(format, chatData, options) {
  switch (format) {
    case 'markdown': return exportMarkdown(chatData, options);
    case 'txt':      return exportTxt(chatData, options);
    case 'json':     return exportJson(chatData, options);
    case 'html':     return exportHtml(chatData, options);
    case 'pdf':      return exportPdf(chatData, options);
    case 'word':     return exportWord(chatData, options);
    default: console.error('[AI Chat Exporter] Unknown format:', format);
  }
}
