// ==UserScript==
// @name            PoEAutoTrade
// @namespace       http://tampermonkey.net/
// @version         0.7
// @description     Производит автопокупку товара в "живом поиске" на PoE Trade
// @author       ДугДуг
// @match           https://ru.pathofexile.com/*
// @match           https://www.pathofexile.com/*
// @icon            https://www.google.com/s2/favicons?sz=128&domain=pathofexile.com
// @updateURL       https://dygdyg.github.io/DygDygWEB/user.js/PoEAutoTrade.user.js
// @downloadURL     https://dygdyg.github.io/DygDygWEB/user.js/PoEAutoTrade.user.js
// @run-at          context-menu
// @grant           none
// ==/UserScript==

document.TradeTimers = document.TradeTimers || null
document.datalists = document.datalists || []
document.col = 0



/* document.querySelector('.results').setAttribute('id', 'test')
let observer = new MutationObserver(mutationRecords => {



    document.datalists[document.datalists.length] = document.querySelector('.resultset').querySelector('.row.tft-enhanced.showName')
});



observer.observe(test, {
    childList: true,
    subtree: false,
    characterDataOldValue: true
}); */


/* 
function tims1() {
    // console.log("...")
    if (document.querySelector('.btn.search-btn').disabled == true) {
        let res = document.querySelectorAll('.resultset')
        if (document.querySelectorAll('.resultset').length > 0) {
            if (document.querySelectorAll('.resultset').length > 1) {
                // document.querySelector('.resultset').remove()
            }
            if (document.querySelector('.resultset').querySelector('.row.tft-enhanced.showName')) {
                if (document.querySelector('.resultset').querySelector('.row.tft-enhanced.showName').querySelector('.load-more-btn') == null) {
                    if (document.querySelector('.resultset').querySelector('.row.tft-enhanced.showName').querySelector('.btn-default')) {
                        document.querySelector('.resultset').querySelector('.row.tft-enhanced.showName').querySelector('.btn-default').click()
                    }
                    document.querySelector('.resultset').querySelector('.row.tft-enhanced.showName').remove()
                    // document.querySelector('.resultset').remove()
                    document.col += 1
                    console.log(document.col)
                } else {
                    // document.querySelector('.resultset').querySelector('.row').querySelector('.load-more-btn').click()t
                }
            }
        }
    }
} */
if (!document.delay_edit) {
    document.querySelector('.nav.nav-tabs.main').innerHTML += "<input id='delay'>"
    document.delay_edit = document.querySelector('#delay')
    document.delay_edit.title = 'Задержка секунд: 1'
    document.delay_edit.type = 'range'
    document.delay_edit.value = 1
    document.delay_edit.min = 1
    document.delay_edit.max = 10
    document.delay_edit.onchange = function () {
        if(document.delay_edit.value==0) document.delay_edit.value = 1
        console.log(this.value)
        this.title = 'Задержка секунд: ' + this.value
        
    }
}

// .on("change", function (e) {console.log(e)})

function tims() {
    but = document.querySelectorAll('.btn.btn-xs.btn-default.direct-btn:not(.sold)')
    console.log("ok", document.delay_edit.value)
    if (but.length > 0) {
        but[but.length - 1].click()
        // but[but.length-1].parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.remove()
        but[but.length - 1].parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.style.backgroundColor = '#3f00ff42';
        but[but.length - 1].classList.add("sold");
         but[but.length - 1].parentNode.remove()
    }

/*     nbut = document.querySelectorAll('.btn.btn-xs.btn-default.dropdown-toggle.dropdown-toggle-split:not(.sold)')
    if (nbut.length > 0) {
        nbut[but.length - 1].parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.style.backgroundColor = 'rgb(255 0 224 / 26%)';
        nbut[but.length - 1].classList.add("sold");
        // but[but.length-1].parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.remove()
    } */
    if(document.TradeTimersFlag) document.TradeTimers = setTimeout(tims, document.delay_edit.value*1000)
}

if (document.TradeTimers == null) {
    console.log("start")
    if (document.querySelector('.multiselect__input').value) {
        document.querySelector("title").text = "🟢 " + document.querySelector('.multiselect__input').value
    } else {
        document.querySelector("title").text = "🟢 Торговля"
    }
    document.TradeTimersFlag = true
    document.TradeTimers = setTimeout(tims, document.delay_edit.value*1000)
} else {
    console.log("stop")
    if (document.querySelector('.multiselect__input').value) {
        // document.querySelector("title").text = "ss"
        document.querySelector("title").text = "🔴 " + document.querySelector('.multiselect__input')
    } else {
        document.querySelector("title").text = "🔴 Торговля"
    }
    setTimeout(document.TradeTimers)
    document.TradeTimersFlag = false
    document.TradeTimers = null
}