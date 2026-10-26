// ==UserScript==
// @name         ChatGPT [+..+] Copy Helper
// @namespace    https://example.local
// @version      1.0.0
// @description  Ищет на странице фрагменты в виде [+ ... +] и добавляет кнопку для копирования содержимого в буфер обмена
// @author       ДугДуг
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/chatgpt-copy-helper/chatgpt-copy-helper.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/chatgpt-copy-helper/chatgpt-copy-helper.user.js
// ==/UserScript==

(function () {
  'use strict';

  // --- Стили кнопки и подсветки ---
  const css = `
  .plus-copy-wrap { display:inline-flex; align-items:center; gap:6px; }
  .plus-copy-chip {
    padding: 0 .25em; border-radius: 4px; outline: 1px solid rgba(0,0,0,.15);
    background: rgba(0,0,0,.04);
    font-family: inherit;
  }
  .plus-copy-btn {
    border: 1px solid rgba(0,0,0,.2);
    background: rgba(0,0,0,.04);
    padding: 2px 6px; border-radius: 4px; font-size: .85em; cursor: pointer;
    line-height: 1.6;
  }
  .plus-copy-btn:hover { filter: brightness(0.95); }
  .plus-copy-btn:active { transform: translateY(1px); }
  .plus-copied { outline-color: #22c55e !important; background: rgba(34,197,94,.12) !important; }
  `;
  if (typeof GM_addStyle === 'function') GM_addStyle(css);
  else {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  // --- Настройки/ограничения ---
  const SKIP_TAGS = new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','BUTTON','SELECT','OPTION','NOSCRIPT','IFRAME','SVG','MATH']);
  const PROCESSED_ATTR = 'data-plus-enhanced';
  const REGEX = /\[\+\s*([\s\S]*?)\s*\+\]/g; // захватывает между [+ ... +], допускает переносы строк

  // Делегирование кликов по кнопкам
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.plus-copy-btn');
    if (!btn) return;
    const wrap = btn.closest('.plus-copy-wrap');
    const data = wrap?.dataset?.content || '';
    try {
      await copyToClipboard(data);
      // Визуальный отклик
      wrap.classList.add('plus-copied');
      const orig = btn.textContent;
      btn.textContent = 'Скопировано';
      setTimeout(() => {
        wrap.classList.remove('plus-copied');
        btn.textContent = orig;
      }, 1200);
    } catch (err) {
      console.error('Clipboard error:', err);
      btn.textContent = 'Ошибка копирования';
      setTimeout(() => (btn.textContent = 'Копировать'), 1500);
    }
  });

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Фолбэк
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok ? Promise.resolve() : Promise.reject(new Error('execCommand failed'));
  }

  // Преобразование текстового узла: заменяет [ + + ] на <span><chip></span><button>
  function transformTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!REGEX.test(text)) return; // быстрое отрицание
    REGEX.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = REGEX.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) frag.appendChild(document.createTextNode(before));

      const inner = match[1]; // содержимое внутри [+ ... +]

      const wrap = document.createElement('span');
      wrap.className = 'plus-copy-wrap';
      wrap.setAttribute(PROCESSED_ATTR, '1');
      wrap.dataset.content = inner;

      const chip = document.createElement('span');
      chip.className = 'plus-copy-chip';
      chip.textContent = `[+ ${inner} +]`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'plus-copy-btn';
      btn.title = 'Скопировать содержимое внутри [+ +]';
      btn.textContent = 'Копировать';

      wrap.append(chip, btn);
      frag.appendChild(wrap);

      lastIndex = REGEX.lastIndex;
    }

    const tail = text.slice(lastIndex);
    if (tail) frag.appendChild(document.createTextNode(tail));

    textNode.parentNode.replaceChild(frag, textNode);
  }

  // Обход DOM с защитой от повторной обработки
  function walk(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.hasAttribute(PROCESSED_ATTR)) return;
    if (SKIP_TAGS.has(node.nodeName)) return;
    if (node.closest(`[${PROCESSED_ATTR}="container"]`)) return; // наши собственные контейнеры

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.includes('[+')) return NodeFilter.FILTER_REJECT;
        // Не трогаем текст внутри наших элементов
        if (n.parentElement && (n.parentElement.classList.contains('plus-copy-wrap') || n.parentElement.classList.contains('plus-copy-chip'))) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const toProcess = [];
    let tn;
    while ((tn = walker.nextNode())) toProcess.push(tn);
    toProcess.forEach(transformTextNode);
  }

  // Первичный проход
  const initialScan = () => walk(document.body);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialScan, { once: true });
  } else {
    initialScan();
  }

  // Наблюдатель за динамическим контентом (SPA/чат)
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    // Дебаунс, чтобы не перегружать при потоковых обновлениях
    setTimeout(() => {
      scheduled = false;
      // Сканируем только видимую часть документа для скорости
      walk(document.body);
    }, 120);
  });

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true
  });

})();
