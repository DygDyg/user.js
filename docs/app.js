'use strict';

const grid = document.querySelector('#grid');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const count = document.querySelector('#count');
const statCount = document.querySelector('#stat-count');
const REPO = 'https://github.com/DygDyg/user.js';

let scripts = [];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function makeCard(s) {
  const card = el('article', 'card');

  const meta = el('div', 'meta');
  meta.append(
    el('span', '', s.category || 'Другое'),
    el('span', 'ver', 'v' + (s.version || '0.1.0'))
  );
  card.append(meta, el('h3', '', s.name || s.slug), el('p', '', s.description || ''));

  if (Array.isArray(s.sites) && s.sites.length) {
    const sites = el('div', 'sites');
    for (const site of s.sites.slice(0, 4)) sites.append(el('span', 'site-chip', site));
    card.append(sites);
  }

  const actions = el('div', 'actions');
  const install = el('a', 'install', 'Установить ↗');
  install.href = './scripts/' + s.slug + '/' + s.slug + '.user.js';
  const docs = el('a', 'readme', 'Документация');
  docs.href = REPO + '/blob/main/scripts/' + s.slug + '/README.md';
  docs.target = '_blank';
  docs.rel = 'noopener noreferrer';
  actions.append(install, docs);
  card.append(actions);
  return card;
}

function render() {
  const q = search.value.trim().toLocaleLowerCase('ru');
  const filtered = scripts.filter(s =>
    (!category.value || s.category === category.value) &&
    [s.name, s.description, s.category, ...(Array.isArray(s.sites) ? s.sites : [])]
      .join(' ').toLocaleLowerCase('ru').includes(q)
  );

  count.textContent = String(filtered.length);
  grid.replaceChildren();

  if (!filtered.length) {
    grid.append(el('p', 'empty',
      scripts.length ? 'Ничего не найдено. Измените запрос.' : 'Здесь скоро появятся первые скрипты.'));
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

    for (const name of [...new Set(scripts.map(s => s.category).filter(Boolean))].sort()) {
      const option = el('option', '', name);
      option.value = name;
      category.append(option);
    }
    if (statCount) statCount.textContent = String(scripts.length);
    render();
  } catch (e) {
    grid.replaceChildren(el('p', 'empty', 'Ошибка загрузки каталога. Обновите страницу.'));
    console.error(e);
  }
}

search.addEventListener('input', render);
category.addEventListener('change', render);
init();
