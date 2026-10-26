// ==UserScript==
// @name         Paste4 -> BBUpload tools
// @namespace    https://paste4.org/
// @version      1.8
// @description  Ищет ссылки на bbupload на paste4, показывает размер и FileName, добавляет копирование, счётчик 1080р/720р, подсветку 1080р и закреплённый баннер
// @match        https://paste4.org/p/*
// @match        https://www.paste4.org/p/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      download.bbupload.to
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/paste4-bbupload-tools/paste4-bbupload-tools.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/paste4-bbupload-tools/paste4-bbupload-tools.user.js
// @author       ДугДуг
// ==/UserScript==

(function () {
  'use strict';

  const BB_RE = /https?:\/\/download\.bbupload\.to\/(?:watch|download)\?v=([A-Z0-9]+)/gi;
  const SEPARATOR_RE = /^-{20,}$/;
  const QUALITY_1080_RE = /1080[pр]/gi;
  const QUALITY_720_RE = /720[pр]/gi;

  const cache = new Map();
  let scanScheduled = false;

  addStyles();
  addQualityCounter();

  setTimeout(() => {
    highlight1080();
  }, 300);

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      body {
        padding-top: 52px !important;
      }

      .bbu-wrap[data-bbupload-sized="1"] {
        display: inline;
      }

      .bbu-quality-counter {
        position: fixed;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999999;

        display: block;
        padding: 8px 14px;

        border: 1px solid #4f6375;
        border-radius: 8px;

        background: rgba(31, 42, 51, 0.96);
        backdrop-filter: blur(4px);

        color: #d9ecff;
        font-size: 14px;
        font-weight: 700;

        box-shadow: 0 2px 10px rgba(0,0,0,0.35);
      }

      .bbu-highlight-1080 {
        background: rgba(255, 208, 0, 0.18);
        color: #ffd54a;
        font-weight: 700;
        padding: 0 2px;
        border-radius: 3px;
      }

      .bbu-size {
        color: #8fd3ff;
        margin-left: 6px;
        cursor: pointer;
        user-select: none;
        border-bottom: 1px dashed rgba(143, 211, 255, 0.45);
      }

      .bbu-size:hover {
        color: #b7e6ff;
        border-bottom-color: rgba(183, 230, 255, 0.8);
      }

      .bbu-size.bbu-copied {
        color: #caffd8;
        border-bottom-color: rgba(202, 255, 216, 0.85);
      }

      .bbu-copy-btn {
        margin-left: 6px;
        padding: 0 6px;
        font-size: 12px;
        line-height: 1.4;
        cursor: pointer;
        border: 1px solid #4f6375;
        border-radius: 4px;
        background: #1f2a33;
        color: #d9ecff;
        vertical-align: middle;
      }

      .bbu-copy-btn:hover {
        background: #2a3946;
      }

      .bbu-copy-btn.bbu-copied {
        border-color: #3f8f5a;
        color: #caffd8;
        background: #1f3527;
      }

      .bbu-file-name {
        display: block;
        margin-left: 18px;
        color: #ffd38f;
        font-size: 13px;
        line-height: 1.5;
        user-select: none;
        cursor: pointer;
        border-bottom: 1px dashed rgba(255, 211, 143, 0.45);
        width: fit-content;
      }

      .bbu-file-name:hover {
        color: #ffe1ad;
        border-bottom-color: rgba(255, 225, 173, 0.85);
      }

      .bbu-file-name.bbu-copied {
        color: #caffd8;
        border-bottom-color: rgba(202, 255, 216, 0.85);
      }

      .bbu-separator {
        color: #ffcc66;
        font-weight: 700;
      }
    `;

    document.head.appendChild(style);
  }

  function countMatches(text, re) {
    re.lastIndex = 0;
    const matches = text.match(re);
    re.lastIndex = 0;
    return matches ? matches.length : 0;
  }

  function addQualityCounter() {
    const counter = document.createElement('div');
    counter.className = 'bbu-quality-counter';
    counter.dataset.bbuploadSized = '1';

    const text = document.body ? document.body.innerText || '' : '';

    const count1080 = countMatches(text, QUALITY_1080_RE);
    const count720 = countMatches(text, QUALITY_720_RE);

    counter.textContent = `Найдено: 1080р — ${count1080} / 720р — ${count720}`;

    document.body.appendChild(counter);
  }

  function highlight1080() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;

          const parent = node.parentElement;

          if (!parent) return NodeFilter.FILTER_REJECT;

          if (
            parent.closest(
              'script, style, textarea, input, select, button, .bbu-highlight-1080, [data-bbupload-sized="1"]'
            )
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          if (!/1080[pр]/i.test(node.nodeValue)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let current;

    while ((current = walker.nextNode())) {
      nodes.push(current);
    }

    for (const node of nodes) {
      const text = node.nodeValue;

      const frag = document.createDocumentFragment();

      let lastIndex = 0;

      text.replace(/1080[pр]/gi, (match, offset) => {
        if (offset > lastIndex) {
          frag.appendChild(
            document.createTextNode(text.slice(lastIndex, offset))
          );
        }

        const span = document.createElement('span');
        span.className = 'bbu-highlight-1080';
        span.textContent = match;

        frag.appendChild(span);

        lastIndex = offset + match.length;
      });

      if (lastIndex < text.length) {
        frag.appendChild(
          document.createTextNode(text.slice(lastIndex))
        );
      }

      node.parentNode.replaceChild(frag, node);
    }
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return null;

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = 0;

    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }

    const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;

    return `${value.toFixed(decimals)} ${units[i]}`;
  }

  function parseSizeValue(value) {
    if (value == null) return null;

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (/^\d+$/.test(trimmed)) {
        return Number(trimmed);
      }

      return trimmed;
    }

    return null;
  }

  function extractInfoFromResponseText(text) {
    const info = {
      size: null,
      fileName: null
    };

    if (!text || typeof text !== 'string') return info;

    const possibleSizeKeys = [
      'size',
      'filesize',
      'file_size',
      'download_size',
      'content_length'
    ];

    const possibleNameKeys = [
      'FileName',
      'filename',
      'file_name',
      'name',
      'title'
    ];

    try {
      const data = JSON.parse(text);

      function readFromObject(obj) {
        if (!obj || typeof obj !== 'object') return;

        for (const key of possibleSizeKeys) {
          if (key in obj && info.size == null) {
            info.size = parseSizeValue(obj[key]);
          }
        }

        for (const key of possibleNameKeys) {
          if (key in obj && !info.fileName && obj[key] != null) {
            info.fileName = String(obj[key]).trim();
          }
        }
      }

      readFromObject(data);
      readFromObject(data.data);

      return info;
    } catch (_) {}

    return info;
  }

  function requestDownloadInfo(id) {
    const apiUrl =
      `https://download.bbupload.to/ajax.php?action=getdownload&data=${encodeURIComponent(id)}`;

    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: apiUrl,
        timeout: 20000,
        anonymous: true,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/plain, */*'
        },

        onload: (resp) => {
          try {
            resolve(extractInfoFromResponseText(resp.responseText));
          } catch (e) {
            console.error('BBUpload parse error:', e);
            resolve({ size: null, fileName: null });
          }
        },

        onerror: () => resolve({ size: null, fileName: null }),
        ontimeout: () => resolve({ size: null, fileName: null })
      });
    });
  }

  function getInfoById(id) {
    if (cache.has(id)) return cache.get(id);

    const promise = requestDownloadInfo(id);

    cache.set(id, promise);

    return promise;
  }

  function setCopiedState(element, originalText) {
    element.textContent = 'скопировано';
    element.classList.add('bbu-copied');

    setTimeout(() => {
      element.textContent = originalText;
      element.classList.remove('bbu-copied');
    }, 1200);
  }

  function fallbackCopy(text, onSuccess) {
    const ta = document.createElement('textarea');

    ta.value = text;

    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';

    document.body.appendChild(ta);

    ta.select();

    try {
      document.execCommand('copy');
      onSuccess();
    } catch (e) {
      console.error('Не удалось скопировать:', e);
    } finally {
      ta.remove();
    }
  }

  function copyText(text, onSuccess) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text);
      onSuccess();
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(onSuccess)
        .catch(() => fallbackCopy(text, onSuccess));

      return;
    }

    fallbackCopy(text, onSuccess);
  }

  function makeCopyButton(url) {
    const btn = document.createElement('button');

    btn.type = 'button';
    btn.textContent = 'копировать ссылку';
    btn.className = 'bbu-copy-btn';
    btn.dataset.bbuploadSized = '1';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const old = btn.textContent;

      copyText(url, () => setCopiedState(btn, old));
    });

    return btn;
  }

  function makeLink(url) {
    const a = document.createElement('a');

    a.href = url;
    a.textContent = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.dataset.bbuploadSized = '1';

    return a;
  }

  function makeSizeNode() {
    const span = document.createElement('span');

    span.className = 'bbu-size';
    span.dataset.bbuploadSized = '1';
    span.textContent = '[loading...]';
    span.title = 'Нажми, чтобы скопировать размер';
    span.dataset.copyValue = '';

    span.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const value = span.dataset.copyValue;

      if (!value) return;

      const old = span.textContent;

      copyText(value, () => setCopiedState(span, old));
    });

    return span;
  }

  function makeFileNameNode() {
    const span = document.createElement('span');

    span.className = 'bbu-file-name';
    span.dataset.bbuploadSized = '1';
    span.textContent = '';
    span.title = 'Нажми, чтобы скопировать название';
    span.dataset.copyValue = '';

    span.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const value = span.dataset.copyValue;

      if (!value) return;

      const old = span.textContent;

      copyText(value, () => setCopiedState(span, old));
    });

    return span;
  }

  function isIgnoredParent(parent) {
    return !!parent.closest(
      'script, style, textarea, input, select, button, [data-bbupload-sized="1"]'
    );
  }

  function collectTextNodes(root = document.body) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue) {
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;

          if (!parent || isIgnoredParent(parent)) {
            return NodeFilter.FILTER_REJECT;
          }

          const text = node.nodeValue;

          BB_RE.lastIndex = 0;

          const hasBb = BB_RE.test(text);

          BB_RE.lastIndex = 0;

          const isSeparator = SEPARATOR_RE.test(text.trim());

          if (!hasBb && !isSeparator) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];

    let current;

    while ((current = walker.nextNode())) {
      nodes.push(current);
    }

    return nodes;
  }

  function processSeparatorNode(node) {
    const text = node.nodeValue;

    if (!text) return false;

    if (!SEPARATOR_RE.test(text.trim())) {
      return false;
    }

    const span = document.createElement('span');

    span.className = 'bbu-separator';
    span.dataset.bbuploadSized = '1';
    span.textContent = text;

    node.parentNode.replaceChild(span, node);

    return true;
  }

  async function processTextNode(node) {
    const text = node.nodeValue;

    if (!text) return;

    if (processSeparatorNode(node)) return;

    const matches = [...text.matchAll(BB_RE)];

    if (!matches.length) return;

    const wrapper = document.createElement('span');

    wrapper.className = 'bbu-wrap';
    wrapper.dataset.bbuploadSized = '1';

    let lastIndex = 0;

    for (const match of matches) {
      const id = match[1];
	const fullUrl = `https://download.bbupload.to/download?v=${id}`;

      const start = match.index ?? 0;
      const end = start + fullUrl.length;

      if (start > lastIndex) {
        wrapper.appendChild(
          document.createTextNode(text.slice(lastIndex, start))
        );
      }

      wrapper.appendChild(makeLink(fullUrl));

      const sizeNode = makeSizeNode();
      const fileNameNode = makeFileNameNode();

      wrapper.appendChild(document.createTextNode(' '));
      wrapper.appendChild(sizeNode);

      wrapper.appendChild(document.createTextNode(' '));
      wrapper.appendChild(makeCopyButton(fullUrl));

      wrapper.appendChild(fileNameNode);

      getInfoById(id).then((info) => {
        const size = info && info.size;
        const fileName = info && info.fileName;

        if (typeof size === 'number') {
          const formatted = formatBytes(size);

          if (formatted) {
            sizeNode.textContent = `[${formatted}]`;
            sizeNode.dataset.copyValue = formatted;
          } else {
            sizeNode.textContent = '[no size]';
          }
        } else {
          sizeNode.textContent = '[no size]';
        }

        if (fileName) {
          fileNameNode.textContent = `↳ ${fileName}`;
          fileNameNode.dataset.copyValue = fileName;
        }
      });

      lastIndex = end;
    }

    if (lastIndex < text.length) {
      wrapper.appendChild(
        document.createTextNode(text.slice(lastIndex))
      );
    }

    node.parentNode.replaceChild(wrapper, node);
  }

  async function scan() {
    const nodes = collectTextNodes(document.body);

    for (const node of nodes) {
      await processTextNode(node);
    }
  }

  function scheduleScan() {
    if (scanScheduled) return;

    scanScheduled = true;

    setTimeout(async () => {
      scanScheduled = false;

      try {
        await scan();
      } catch (e) {
        console.error('BBUpload size script error:', e);
      }
    }, 250);
  }

  scheduleScan();

  const observer = new MutationObserver(() => {
    scheduleScan();
    highlight1080();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();