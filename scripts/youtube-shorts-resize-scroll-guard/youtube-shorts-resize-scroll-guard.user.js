// ==UserScript==
// @name         YouTube Shorts Resize Scroll Guard
// @namespace    local
// @version      0.2.0
// @description  Не даёт Shorts перелистываться при resize/переносе окна; обычный скролл не трогает
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/youtube-shorts-resize-scroll-guard/youtube-shorts-resize-scroll-guard.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/youtube-shorts-resize-scroll-guard/youtube-shorts-resize-scroll-guard.user.js
// @author       ДугДуг
// ==/UserScript==

(() => {
  const GUARD_MS = 350;
  const DRIFT_PX = 40;
  const DEBUG_FLASH_MS = 2000;
  const DEBUG_BORDER = '2px solid rgba(0, 200, 120, 0.85)';

  let guardUntil = 0;
  let userIntentUntil = 0;
  let saved = null; // { id, top, el, root }
  let flashTimer = 0;
  let flashTarget = null;
  let flashPrevOutline = '';

  const isShorts = () => location.pathname.startsWith('/shorts/');

  const shortIdFromUrl = () => {
    const m = location.pathname.match(/^\/shorts\/([^/?#]+)/);
    return m ? m[1] : null;
  };

  const activeRenderer = () =>
    document.querySelector('ytd-reel-video-renderer[is-active]') ||
    document.querySelector('ytd-reel-video-renderer');

  const scrollRoot = () => {
    const el = activeRenderer();
    let n = el;
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      const oy = s.overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && n.scrollHeight > n.clientHeight + 10) {
        return n;
      }
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  const clearDebugFlash = () => {
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = 0;
    }
    if (flashTarget) {
      flashTarget.style.outline = flashPrevOutline;
      flashTarget = null;
      flashPrevOutline = '';
    }
  };

  /** Незаметная отладка: тонкий outline на текущем шорте ~2с */
  const flashDebugRestore = (el) => {
    const target =
      el?.isConnected
        ? el
        : activeRenderer() ||
          document.querySelector('#shorts-player') ||
          document.querySelector('ytd-reel-video-renderer');

    if (!target) return;

    clearDebugFlash();
    flashTarget = target;
    flashPrevOutline = target.style.outline;
    target.style.outline = DEBUG_BORDER;
    target.style.outlineOffset = '-2px';

    flashTimer = setTimeout(() => {
      clearDebugFlash();
    }, DEBUG_FLASH_MS);
  };

  const capture = () => {
    if (!isShorts()) {
      saved = null;
      return;
    }
    const root = scrollRoot();
    const el = activeRenderer();
    saved = {
      id: shortIdFromUrl(),
      top: root.scrollTop,
      el,
      root,
    };
  };

  const markUserIntent = () => {
    userIntentUntil = performance.now() + 500;
    guardUntil = 0;
  };

  const armGuard = () => {
    if (!isShorts()) return;
    capture();
    guardUntil = performance.now() + GUARD_MS;
  };

  const restoreIfGhost = () => {
    if (!saved || !isShorts()) return;
    if (performance.now() < userIntentUntil) return;
    if (performance.now() > guardUntil) return;

    const root = saved.root?.isConnected ? saved.root : scrollRoot();
    const drifted = Math.abs(root.scrollTop - saved.top) >= DRIFT_PX;

    const idNow = shortIdFromUrl();
    const idJumped = saved.id && idNow && saved.id !== idNow;

    if (!drifted && !idJumped) return;

    let target = saved.el?.isConnected ? saved.el : null;
    if (!target && saved.id) {
      target = document
        .querySelector(`a[href*="/shorts/${saved.id}"]`)
        ?.closest('ytd-reel-video-renderer');
    }

    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
    } else {
      root.scrollTop = saved.top;
    }

    const ae = document.activeElement;
    if (ae && ae !== document.body && typeof ae.blur === 'function') ae.blur();

    flashDebugRestore(target || activeRenderer());
    capture();
  };

  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
    window.addEventListener(
      type,
      (e) => {
        if (!isShorts()) return;
        if (
          type === 'keydown' &&
          !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)
        ) {
          return;
        }
        markUserIntent();
      },
      { capture: true, passive: true }
    );
  }

  document.addEventListener(
    'click',
    (e) => {
      if (!isShorts()) return;
      if (e.target.closest('#navigation-button-up, #navigation-button-down, ytd-reel-video-renderer')) {
        markUserIntent();
      }
    },
    true
  );

  let resizeTimer = 0;
  const onResize = () => {
    if (!isShorts()) return;
    armGuard();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        restoreIfGhost();
        setTimeout(restoreIfGhost, 50);
        setTimeout(restoreIfGhost, 150);
      });
    }, 50);
  };

  window.addEventListener('resize', onResize, { passive: true });
  window.visualViewport?.addEventListener('resize', onResize, { passive: true });

  document.addEventListener(
    'scroll',
    () => {
      if (!isShorts()) return;
      if (performance.now() <= guardUntil) restoreIfGhost();
    },
    true
  );

  let lastHref = location.href;
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (isShorts() && performance.now() > guardUntil) capture();
  }, 300);

  capture();
})();
