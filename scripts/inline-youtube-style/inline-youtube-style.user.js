// ==UserScript==
// @name         Inline YouTube Style
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add custom CSS to YouTube
// @match        https://www.youtube.com/*
// @grant        GM_addStyle
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/inline-youtube-style/inline-youtube-style.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/inline-youtube-style/inline-youtube-style.user.js
// ==/UserScript==

(function() {
	scale = 57
    GM_addStyle(`
	:root {
	--yt-cart-scale: ${scale}%;
	}
    ytd-rich-item-renderer[rendered-from-rich-grid],  {
    	--ytd-rich-item-row-usable-width: calc(var(--yt-cart-scale) - var(--ytd-rich-grid-gutter-margin) * 2);
	}
	ytd-rich-item-renderer[is-responsive-grid], ytd-rich-item-renderer.style-scope.ytd-rich-grid-renderer {
    width: calc(var(--yt-cart-scale) / var(--ytd-rich-grid-items-per-row) - var(--ytd-rich-grid-item-margin) - .01px);
}
    `);
})();
