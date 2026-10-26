// ==UserScript==
// @name         TBank QR Screenshot Upload (v5)
// @namespace    https://dygdyg.ru/
// @version      1.5
// @description  Автоматический скриншот выбранного окна и вставка QR-кода в форму Т-Банка (работает при SPA-навигации)
// @match        https://www.tbank-online.com/*

// @grant        none
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/tbank-qr-screenshot-upload/tbank-qr-screenshot-upload.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/tbank-qr-screenshot-upload/tbank-qr-screenshot-upload.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TARGET_URL = /^https:\/\/www\.tbank-online\.com\/mybank\/payments\/scan/;
  let currentButton = null;
  let observer = null;

  // Проверяем URL каждые 500 мс (для SPA-навигации)
  setInterval(checkPage, 500);

  function checkPage() {
    if (TARGET_URL.test(location.href)) {
      if (!observer) {
        observeInputChanges();
      }
      tryInsertButton();
    } else {
      // Если мы ушли со страницы, отключаем наблюдатель
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      currentButton = null;
    }
  }

  // Следим за изменениями DOM, чтобы отловить пересоздание input
  function observeInputChanges() {
    observer = new MutationObserver(() => {
      if (TARGET_URL.test(location.href)) tryInsertButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Функция вставки кнопки, если input найден
  function tryInsertButton() {
    const input = document.querySelector('input[data-qa-type="molecule-desktop-qr-load-attach-file.input"]');
    if (!input) return;

    // Если кнопка уже стоит у этого input — не дублируем
    if (currentButton && currentButton.isConnected && currentButton.nextSibling === input) return;

    createButton(input);
  }

  // Создание кнопки
  function createButton(input) {
    // Если старая кнопка есть — удаляем
    if (currentButton && currentButton.isConnected) currentButton.remove();

    const btn = document.createElement('button');
    btn.textContent = '📷 Захватить окно';
    Object.assign(btn.style, {
      display: 'block',
      marginBottom: '8px',
      padding: '8px 12px',
      background: '#FFD700',
      color: '#000',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '14px',
      zIndex: 999999,
      position: 'relative',
      transition: 'background 0.2s, transform 0.1s'
    });

    btn.addEventListener('mouseenter', () => btn.style.background = '#ffdf33');
    btn.addEventListener('mouseleave', () => btn.style.background = '#FFD700');
    btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.97)');
    btn.addEventListener('mouseup', () => btn.style.transform = 'scale(1)');

    input.parentNode.insertBefore(btn, input);
    currentButton = btn;

    btn.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "window" },
          preferCurrentTab: false,
          audio: false
        });

        const track = stream.getVideoTracks()[0];
        const imageCapture = new ImageCapture(track);
        const bitmap = await imageCapture.grabFrame();

        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        track.stop();

        canvas.toBlob((blob) => {
          const file = new File([blob], 'qr_window.png', { type: 'image/png' });
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));

          btn.textContent = '✅ Захвачено';
          btn.style.background = '#9BE47A';
          setTimeout(() => {
            btn.textContent = '📷 Захватить окно';
            btn.style.background = '#FFD700';
          }, 1500);
        }, 'image/png');
      } catch (err) {
        console.error(err);
        btn.textContent = '⚠️ Ошибка';
        btn.style.background = '#f55';
        setTimeout(() => {
          btn.textContent = '📷 Захватить окно';
          btn.style.background = '#FFD700';
        }, 2000);
      }
    });
  }
})();
