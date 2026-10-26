// ==UserScript==
// @name         Clean Copy REAL
// @namespace    clean-copy-real
// @version      2.0
// @match        *://filmix.my/*
// @run-at       document-end
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/clean-copy-real/clean-copy-real.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/clean-copy-real/clean-copy-real.user.js
// ==/UserScript==

document.addEventListener('copy', function (e) {
  e.stopImmediatePropagation();
  e.preventDefault();

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0).cloneRange();

  // Берём HTML, чистим ссылки "Смотреть подробнее"
  const div = document.createElement('div');
  div.appendChild(range.cloneContents());

  // удаляем элементы со ссылками
  div.querySelectorAll('a, span').forEach(el => {
    if (el.textContent.includes('Смотреть подробнее')) {
      el.remove();
    }
  });

  const cleanText = div.innerText.trim();

  e.clipboardData.setData('text/plain', cleanText);
}, true);
