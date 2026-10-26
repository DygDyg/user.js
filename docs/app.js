'use strict';

const grid = document.querySelector('#grid');
const search = document.querySelector('#search');
const authorSel = document.querySelector('#author');
const sortSel = document.querySelector('#sort');
const catPills = document.querySelector('#cat-pills');
const count = document.querySelector('#count');
const statCount = document.querySelector('#stat-count');
const statCats = document.querySelector('#stat-cats');
const statAuthors = document.querySelector('#stat-authors');
const REPO = 'https://github.com/DygDyg/user.js';
const RAW = 'https://raw.githubusercontent.com/DygDyg/user.js/main';

let scripts = [];
let activeCategory = '';

/* ---------- modal (documentation) ---------- */
const overlay = document.querySelector('#modal-overlay');
const modalTitle = document.querySelector('#modal-title');
const modalBody = document.querySelector('#modal-body');
const modalGithub = document.querySelector('#modal-github-link');
const modalInstall = document.querySelector('#modal-install-link');
document.querySelector('#modal-close').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function closeModal() {
  overlay.hidden = true;
  document.body.style.overflow = '';
}

function openDocs(s) {
  modalTitle.textContent = s.name || s.slug;
  modalBody.innerHTML = '<p class="modal-loading">Загрузка…</p>';
  modalGithub.href = `${REPO}/blob/main/scripts/${s.slug}/README.md`;
  modalInstall.href = './scripts/' + s.slug + '/' + s.slug + '.user.js';
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  fetch(`./scripts/${s.slug}/README.md`, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(md => { modalBody.innerHTML = renderMarkdown(md); modalBody.scrollTop = 0; })
    .catch(() => {
      modalBody.innerHTML = '<p class="modal-loading">Не удалось загрузить документацию. ' +
        'Откройте её <a href="' + modalGithub.href + '" target="_blank" rel="noopener noreferrer">на GitHub ↗</a>.</p>';
    });
}

/* tiny safe markdown renderer (headings, lists, bold, links, code, blockquote) */
function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inlineMd(str) {
  return esc(str)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\.\/[^)\s]+|#)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  let html = '', list = null, inCode = false, codeBuf = [];
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^```/.test(line.trim())) {
      if (inCode) { html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`; codeBuf = []; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }
    let m;
    if (!line.trim()) { closeList(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) {
      closeList();
      const lvl = Math.min(m[1].length + 2, 5); // h1 in README -> h3 on page
      html += `<h${lvl}>${inlineMd(m[2])}</h${lvl}>`;
    } else if ((m = line.match(/^\s*[-*]\s+(.*)/))) {
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inlineMd(m[1])}</li>`;
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) {
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inlineMd(m[1])}</li>`;
    } else if ((m = line.match(/^>\s?(.*)/))) {
      closeList(); html += `<blockquote>${inlineMd(m[1])}</blockquote>`;
    } else if (/^\s*-{3,}\s*$/.test(line)) {
      closeList(); html += '<hr>';
    } else {
      closeList(); html += `<p>${inlineMd(line)}</p>`;
    }
  }
  closeList();
  if (inCode) html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`;
  return html;
}

/* ---------- helpers ---------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 62% 52%)`;
}

function makeCard(s) {
  const card = el('article', 'card');

  const meta = el('div', 'meta');
  meta.append(
    el('span', '', s.category || 'Другое'),
    el('span', 'ver', 'v' + (s.version || '0.1.0'))
  );
  card.append(meta, el('h3', '', s.name || s.slug), el('p', '', s.description || ''));

  /* author row */
  const author = s.author || 'DygDyg';
  const byline = el('div', 'byline');
  const ava = el('span', 'avatar', author.slice(0, 1).toLocaleUpperCase('ru'));
  ava.style.background = avatarColor(author);
  byline.append(ava, el('span', 'by-label', 'Автор:'), el('span', 'by-name', author));
  if (s.author_discord) byline.append(el('span', 'discord-chip', '💬 ' + s.author_discord));
  card.append(byline);

  if (Array.isArray(s.sites) && s.sites.length) {
    const sites = el('div', 'sites');
    for (const site of s.sites.slice(0, 3)) sites.append(el('span', 'site-chip', site));
    if (s.sites.length > 3) sites.append(el('span', 'site-chip more', '+' + (s.sites.length - 3)));
    card.append(sites);
  }

  const actions = el('div', 'actions');
  const install = el('a', 'install', 'Установить ↗');
  install.href = './scripts/' + s.slug + '/' + s.slug + '.user.js';
  const docs = el('button', 'readme', 'Документация');
  docs.type = 'button';
  docs.addEventListener('click', () => openDocs(s));
  actions.append(install, docs);
  card.append(actions);
  return card;
}

/* ---------- catalog ---------- */
function buildCatPills() {
  const cats = [...new Set(scripts.map(s => s.category).filter(Boolean))].sort();
  catPills.replaceChildren();
  const mk = (label, value) => {
    const b = el('button', 'cat-pill', label);
    b.type = 'button';
    b.dataset.value = value;
    if (value === activeCategory) b.classList.add('on');
    b.addEventListener('click', () => {
      activeCategory = value;
      catPills.querySelectorAll('.cat-pill').forEach(x => x.classList.toggle('on', x.dataset.value === value));
      render();
    });
    return b;
  };
  catPills.append(mk('Все · ' + scripts.length, ''));
  for (const c of cats) {
    const n = scripts.filter(s => s.category === c).length;
    catPills.append(mk(`${c} · ${n}`, c));
  }
}

function currentList() {
  const q = search.value.trim().toLocaleLowerCase('ru');
  const filtered = scripts.filter(s =>
    (!activeCategory || s.category === activeCategory) &&
    (!authorSel.value || s.author === authorSel.value) &&
    [s.name, s.description, s.category, s.author, ...(Array.isArray(s.sites) ? s.sites : [])]
      .join(' ').toLocaleLowerCase('ru').includes(q)
  );
  const sort = sortSel.value;
  if (sort === 'name') filtered.sort((a, b) => (a.name || a.slug).localeCompare(b.name || b.slug, 'ru'));
  else if (sort === 'category') filtered.sort((a, b) =>
    (a.category || '').localeCompare(b.category || '', 'ru') || (a.name || '').localeCompare(b.name || '', 'ru'));
  else if (sort === 'updated') filtered.sort((a, b) => {
    const pa = String(a.version || '0').split('.').map(Number), pb = String(b.version || '0').split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
    return 0;
  });
  return filtered;
}

function render() {
  const filtered = currentList();
  count.textContent = String(filtered.length);
  grid.replaceChildren();
  if (!filtered.length) {
    grid.append(el('p', 'empty',
      scripts.length ? 'Ничего не найдено. Измените запрос или сбросьте фильтры.' : 'Здесь скоро появятся первые скрипты.'));
    return;
  }
  for (const s of filtered) {
    if (typeof s.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(s.slug)) continue;
    grid.append(makeCard(s));
  }
}

function revealOnScroll() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(n => n.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }
  }, { threshold: 0.12 });
  items.forEach(n => io.observe(n));
}

async function init() {
  revealOnScroll();
  try {
    const response = await fetch('./data/scripts.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    scripts = Array.isArray(data.scripts) ? data.scripts : [];

    for (const name of [...new Set(scripts.map(s => s.author).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))) {
      const option = el('option', '', name);
      option.value = name;
      authorSel.append(option);
    }

    const cats = new Set(scripts.map(s => s.category).filter(Boolean));
    const authors = new Set(scripts.map(s => s.author).filter(Boolean));
    if (statCount) statCount.textContent = String(scripts.length);
    if (statCats) statCats.textContent = String(cats.size);
    if (statAuthors) statAuthors.textContent = String(authors.size);

    buildCatPills();
    render();
  } catch (e) {
    grid.replaceChildren(el('p', 'empty', 'Ошибка загрузки каталога. Обновите страницу.'));
    console.error(e);
  }
}

search.addEventListener('input', render);
authorSel.addEventListener('change', render);
sortSel.addEventListener('change', render);
init();
