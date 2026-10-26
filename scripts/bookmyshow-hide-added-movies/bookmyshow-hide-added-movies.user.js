// ==UserScript==
// @name         BookMyShow hide added movies + copy ID
// @namespace    bms-hide-added
// @version      1.2
// @description  Скрывает фильмы BookMyShow по ID + копирование
// @match        https://in.bookmyshow.com/explore/upcoming-movies-*
// @match        https://in.bookmyshow.com/explore/movies-*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/bookmyshow-hide-added-movies/bookmyshow-hide-added-movies.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/bookmyshow-hide-added-movies/bookmyshow-hide-added-movies.user.js
// @author       ДугДуг
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'hiddenMovieIds';

    const getIds = () => GM_getValue(STORAGE_KEY, []);
    const saveIds = (ids) => GM_setValue(STORAGE_KEY, [...new Set(ids)]);

    const addId = (id) => {
        const ids = getIds();
        if (!ids.includes(id)) {
            ids.push(id);
            saveIds(ids);
        }
    };

    const removeId = (id) => {
        saveIds(getIds().filter(x => x !== id));
    };

    const extractMovieId = (href) => {
        const match = href.match(/\/movies\/[^/]+\/[^/]+\/(ET\d+)/i);
        return match ? match[1] : null;
    };

    const findMovieCard = (link) => {
        return link.closest('a[href*="/movies/"]') || link;
    };

    const hideCard = (card, id) => {
        card.dataset.bmsHidden = '1';
        card.style.display = 'none';
        card.title = `Скрыто: ${id}`;
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).catch(() => {
            alert('Не удалось скопировать');
        });
    };

    const addButtons = (card, id) => {
        if (card.dataset.bmsButtonsAdded === '1') return;
        card.dataset.bmsButtonsAdded = '1';

        // Добавляем стили один раз
        if (!document.getElementById('bms-btn-style')) {
            const style = document.createElement('style');
            style.id = 'bms-btn-style';
            style.textContent = `
                .bms-btn {
                    position:absolute;
                    padding:4px 6px;
                    border:0;
                    border-radius:6px;
                    color:#fff;
                    font-size:12px;
                    cursor:pointer;
                    z-index:9999;

                    opacity:0.6;
                    transform:scale(1);
                    transition: all 0.2s ease;
                }

                .bms-btn:hover {
                    opacity:1;
                    transform:scale(1.2);
                    box-shadow: 0 0 6px rgba(0,0,0,0.5);
                }
            `;
            document.head.appendChild(style);
        }

        // Кнопка копирования (слева)
        const copyBtn = document.createElement('button');
        copyBtn.className = 'bms-btn';
        copyBtn.textContent = '📋';
        copyBtn.title = 'Копировать ID';
        copyBtn.style.top = '8px';
        copyBtn.style.left = '8px';
        copyBtn.style.background = '#1976d2';

        copyBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(id);
        };

        // Кнопка скрытия (справа)
        const hideBtn = document.createElement('button');
        hideBtn.className = 'bms-btn';
        hideBtn.textContent = '✖';
        hideBtn.title = 'Скрыть фильм';
        hideBtn.style.top = '8px';
        hideBtn.style.right = '8px';
        hideBtn.style.background = '#d32f2f';

        hideBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            addId(id);
            hideCard(card, id);
        };

        const pos = getComputedStyle(card).position;
        if (pos === 'static') {
            card.style.position = 'relative';
        }

        card.appendChild(copyBtn);
        card.appendChild(hideBtn);
    };

    const processPage = () => {
        const hiddenIds = getIds();

        document.querySelectorAll('a[href*="/movies/"]').forEach(link => {
            const id = extractMovieId(link.href);
            if (!id) return;

            const card = findMovieCard(link);
            if (!card) return;

            if (hiddenIds.includes(id)) {
                hideCard(card, id);
            } else {
                addButtons(card, id);
            }
        });
    };

    // Меню Tampermonkey
    GM_registerMenuCommand('Показать скрытые ID', () => {
        const ids = getIds();
        alert(ids.length ? ids.join('\n') : 'Пусто');
    });

    GM_registerMenuCommand('Добавить ID вручную', () => {
        const id = prompt('Введите ID (например ET00482723)');
        if (!id) return;

        const clean = id.trim().toUpperCase();
        if (!/^ET\d+$/.test(clean)) {
            alert('Неверный формат');
            return;
        }

        addId(clean);
        processPage();
    });

    GM_registerMenuCommand('Удалить ID вручную', () => {
        const id = prompt('Введите ID для удаления');
        if (!id) return;

        removeId(id.trim().toUpperCase());
        location.reload();
    });

    GM_registerMenuCommand('Очистить список', () => {
        if (confirm('Очистить список скрытых фильмов?')) {
            saveIds([]);
            location.reload();
        }
    });

    processPage();

    new MutationObserver(processPage).observe(document.body, {
        childList: true,
        subtree: true
    });

})();