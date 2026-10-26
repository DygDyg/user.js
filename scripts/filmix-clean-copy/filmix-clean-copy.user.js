// ==UserScript==
// @name         Filmix: убрать "Смотреть подробнее" при копировании
// @namespace    dygdyg-filmix-copy-clean
// @version      1.0
// @description  Отключает добавление ссылки Filmix при копировании текста
// @match        https://filmix.gg/*
// @match        https://*.filmix.gg/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/filmix-clean-copy/filmix-clean-copy.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/filmix-clean-copy/filmix-clean-copy.user.js
// ==/UserScript==

(function () {
    'use strict';

    document.addEventListener('keydown', function (e) {
        const key = (e.key || '').toLowerCase();

        if ((e.ctrlKey || e.metaKey) && key === 'c') {
            const old = document.getElementById('copyinfo');
            if (old) old.remove();

            e.stopImmediatePropagation();
        }
    }, true);

    document.addEventListener('copy', function () {
        const old = document.getElementById('copyinfo');
        if (old) old.remove();
    }, true);

    document.addEventListener('keyup', function () {
        const old = document.getElementById('copyinfo');
        if (old) old.remove();
    }, true);
})();