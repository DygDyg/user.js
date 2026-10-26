// ==UserScript==
// @name         IMDb — Movie Info Collector (v3.4 Votes Parser + TTID)
// @namespace    https://dygdyg.ru/
// @version      3.4
// @description  IMDb: добавлен парсер голосов (2.2K → 2200), поле IMDb ID, студия, рейтинг, постер, актёры и прочее
// @match        https://www.imdb.com/title/*
// @match        https://imdb.com/title/*
// @match        https://m.imdb.com/title/*
// @grant        GM_setClipboard
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/imdb-movie-info-collector/imdb-movie-info-collector.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/imdb-movie-info-collector/imdb-movie-info-collector.user.js
// @author       ДугДуг
// ==/UserScript==

(function () {
  'use strict';

  const FIELDS = [
    { id: 'ttid', label: 'IMDb ID', selector: 'meta[property="og:url"]' },
    { id: 'title', label: 'Название', selector: '.hero__primary-text' },
    { id: 'original', label: 'Оригинальное название', selector: '[data-testid="hero-title-block__original-title"]' },
    { id: 'rating', label: 'Рейтинг', selector: '[data-testid="hero-rating-bar__aggregate-rating__score"] span:first-child' },
    { id: 'votes', label: 'Голоса', selector: '[data-testid="rating-histogram-vote-count"]' },
    { id: 'description', label: 'Описание', selector: '[data-testid="plot-xl"], [data-testid="plot-l"]' },
    { id: 'poster', label: 'Обложка', selector: '[data-testid="hero-media__poster"] img' },
    { id: 'actors', label: 'Актёры', selector: 'li[data-testid="title-pc-principal-credit"]', match: /Stars/i },
    { id: 'director', label: 'Режиссёр', selector: 'li[data-testid="title-pc-principal-credit"]', match: /Director/i },
    { id: 'genre', label: 'Жанр', selector: '[data-testid="genres"], li[data-testid="storyline-genres"]' },
    { id: 'country', label: 'Страна', selector: 'li[data-testid="title-details-origin"]' },
    { id: 'year', label: 'Год', selector: 'li[data-testid="title-details-releasedate"]' },
    { id: 'studio', label: 'Студия', selector: 'li[data-testid="title-details-companies"]' },
  ];

  function generateUUID() {
    return URL.createObjectURL(new Blob()).split('/').pop().replace(/-/g, '').slice(0, 32);
  }

  function showToast(text) {
    const toast = document.createElement('div');
    toast.textContent = text;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: '#f5c518',
      color: '#000',
      padding: '8px 14px',
      borderRadius: '8px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: 20000,
      transition: 'opacity 0.4s ease',
    });
    document.body.appendChild(toast);
    setTimeout(() => (toast.style.opacity = '0'), 2000);
    setTimeout(() => toast.remove(), 2500);
  }

  async function copyImage(url, btn) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      let blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.95));
      let type = 'image/webp';
      let file = generateUUID() + '.webp';

      try {
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      } catch {
        blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
        type = 'image/png';
        file = generateUUID() + '.png';
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      }

      showToast(`✅ Обложка скопирована (${file})`);
      btn.textContent = '✅';
      setTimeout(() => (btn.textContent = '📋'), 1500);
    } catch (err) {
      console.error(err);
      alert('❌ Ошибка при копировании изображения');
    }
  }

  async function copyText(text) {
    try {
      if (typeof GM_setClipboard === 'function') GM_setClipboard(text);
      else await navigator.clipboard.writeText(text);
      showToast('✅ Скопировано');
    } catch {
      alert('❌ Ошибка копирования текста');
    }
  }

  function extractLinks(el) {
    if (!el) return [];
    return [...el.querySelectorAll('a')].map(a => a.textContent.trim()).filter(Boolean);
  }

  function extractYear(t) {
    const m = t.match(/\b(19|20)\d{2}\b/);
    return m ? m[0] : '';
  }

  function parseVotes(text) {
    const match = text.trim().match(/^([\d.,]+)\s*([KMB])?/i);
    if (!match) return text;
    let num = parseFloat(match[1].replace(',', '.'));
    const suffix = match[2]?.toUpperCase();
    if (suffix === 'K') num *= 1000;
    else if (suffix === 'M') num *= 1000000;
    else if (suffix === 'B') num *= 1000000000;
    return Math.round(num);
  }

  function getData() {
    const r = {};
    for (const f of FIELDS) {
      let el = f.match
        ? [...document.querySelectorAll(f.selector)].find(e =>
            new RegExp(f.match).test(
              e.querySelector('.ipc-metadata-list-item__label')?.textContent || ''
            )
          )
        : document.querySelector(f.selector);

      if (!el && f.id !== 'ttid') continue;

      if (f.id === 'ttid') {
        const url = document.querySelector('meta[property="og:url"]')?.content || location.href;
        const match = url.match(/\/title\/(tt\d+)/);
        r.ttid = match ? match[1] : '—';
      } else if (f.id === 'poster') r.poster = el.src || '';
      else if (f.id === 'year') r.year = extractYear(el.textContent);
      else if (f.id === 'rating') {
        const num = parseFloat(el.textContent.trim().replace(',', '.'));
        r.rating = Number.isFinite(num)
          ? num % 1 === 0
            ? Math.round(num).toString()
            : num.toFixed(1)
          : el.textContent.trim();
      } else if (f.id === 'votes') {
        r.votes = parseVotes(el.textContent.trim());
      } else if (['actors', 'director', 'genre', 'country', 'studio'].includes(f.id)) {
        const links = extractLinks(el);
        r[f.id] = links.length ? links.join(', ') : el.textContent.trim();
      } else r[f.id] = el.textContent.replace(/^Original title:\s*/i, '').trim();
    }
    return r;
  }

  function makeLine(label, value, copyVal) {
    const line = document.createElement('div');
    line.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      gap:6px;margin-bottom:8px;background:#2c2c2c;
      border-radius:6px;padding:6px 8px;
    `;
    const l = document.createElement('div');
    l.style.fontWeight = 'bold';
    l.textContent = label + ':';
    const v = document.createElement('div');
    v.textContent = value || '—';
    v.style.cssText = `flex:1;font-size:13px;margin:0 6px;overflow-wrap:anywhere;`;
    const b = document.createElement('button');
    b.textContent = '📋';
    Object.assign(b.style, {
      background: '#f5c518',
      border: 'none',
      color: '#000',
      padding: '2px 6px',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px',
      flexShrink: 0,
    });
    b.onclick = () => copyText(copyVal);
    line.append(l, v, b);
    return line;
  }

  const modal = document.createElement('div');
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.6);
    display:none;align-items:center;justify-content:center;z-index:10001;
  `;
  document.body.appendChild(modal);

  const content = document.createElement('div');
  content.style.cssText = `
    background:#1c1c1c;color:#fff;border-radius:10px;padding:20px;
    width:520px;max-width:90%;max-height:90vh;overflow-y:auto;
    box-shadow:0 0 15px rgba(0,0,0,0.5);font-family:Arial,sans-serif;
  `;
  modal.appendChild(content);

  const header = document.createElement('h2');
  header.textContent = '📋 Данные IMDb';
  header.style.textAlign = 'center';
  content.appendChild(header);

  const body = document.createElement('div');
  content.appendChild(body);

  const jsonBtn = document.createElement('button');
  jsonBtn.textContent = '📦 Скопировать всё в JSON';
  Object.assign(jsonBtn.style, {
    background: '#f5c518',
    border: 'none',
    color: '#000',
    padding: '6px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'block',
    margin: '10px auto',
  });
  jsonBtn.onclick = () => {
    const data = getData();
    copyText(JSON.stringify(data, null, 2));
  };
  content.appendChild(jsonBtn);

  const close = document.createElement('button');
  close.textContent = '✖';
  Object.assign(close.style, {
    background: '#333',
    border: '1px solid #666',
    color: '#fff',
    padding: '4px 10px',
    cursor: 'pointer',
    borderRadius: '5px',
    display: 'block',
    margin: '10px auto 0',
    fontSize: '14px',
  });
  close.onclick = () => (modal.style.display = 'none');
  content.appendChild(close);

  const float = document.createElement('button');
  float.textContent = '📋 IMDb';
  Object.assign(float.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '10000',
    background: '#f5c518',
    border: '1px solid #888',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#000',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
  });
  document.body.appendChild(float);

  float.onclick = () => {
    updateModal();
    modal.style.display = 'flex';
  };

  function updateModal() {
    const d = getData();
    body.innerHTML = '';

    body.appendChild(makeLine('IMDb ID', d.ttid, d.ttid));
    body.appendChild(makeLine('Название', d.title, d.title));

    if (d.poster) {
      const img = document.createElement('div');
      img.style.cssText = 'text-align:center;margin:10px 0;';
      img.innerHTML = `<img src="${d.poster}" style="max-width:100%;border-radius:8px;">`;
      const btn = document.createElement('button');
      btn.textContent = '📋';
      Object.assign(btn.style, {
        marginTop: '6px',
        background: '#f5c518',
        border: 'none',
        color: '#000',
        padding: '4px 8px',
        borderRadius: '5px',
        cursor: 'pointer',
        fontSize: '14px',
      });
      btn.title = 'Копировать обложку';
      btn.onclick = () => copyImage(d.poster, btn);
      img.appendChild(btn);
      body.appendChild(img);
    }

    if (d.original && d.original !== d.title)
      body.appendChild(makeLine('Оригинальное название', d.original, d.original));
    if (d.rating) body.appendChild(makeLine('Рейтинг', d.rating, d.rating));
    if (d.votes) body.appendChild(makeLine('Голоса', d.votes, d.votes));
    if (d.description)
      body.appendChild(makeLine('Описание', d.description, d.description));

    for (const f of FIELDS.filter(x => !['ttid','title','original','rating','votes','poster','description'].includes(x.id))) {
      const val = d[f.id] || '—';
      body.appendChild(makeLine(f.label, val, val));
    }
  }
})();
