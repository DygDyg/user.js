// ==UserScript==
// @name         GXPlayer parallel upload auto + sound
// @description	 Добавляет паралельную загрузку файлов насайт GXPlayer
// @namespace    gxplayer-parallel-upload
// @version      2.11
// @match        https://gxplayer.xyz/users/upload.php*
// @icon         https://gxplayer.xyz/favicon.ico
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/gxplayer-parallel-upload/gxplayer-parallel-upload.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/gxplayer-parallel-upload/gxplayer-parallel-upload.user.js
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  if (window.__GX_PARALLEL_UPLOAD__) return;
  window.__GX_PARALLEL_UPLOAD__ = true;
  const START_CONCURRENCY = 2;
  const MAX_CONCURRENCY = 5;
  const SPEED_WINDOW_MS = 5000;
  const MEASURE_MS = 15000;
  const WARMUP_MS = 10000;
  const MIN_GAIN = 0.05;
  const RECHECK_MS = 180000;
  const CHUNK_SIZE = 1024 * 1024 * 1024;
  const API_URL = 'uploadajax.php';
  const WATCH_URL = 'https://watch.gxplayer.xyz/watch?v=';
  const STORAGE_KEY = 'gx-parallel-concurrency';
  const USER_MAX_CONCURRENCY = 20;
  let savedConcurrency = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null && raw !== '') {
      const parsed = Number(raw);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= USER_MAX_CONCURRENCY) savedConcurrency = parsed;
    }
  } catch (e) { console.warn('[GX parallel] localStorage unavailable:', e); }
  let concurrency = savedConcurrency ?? START_CONCURRENCY;
  let manualConcurrency = savedConcurrency !== null;
  let queue = [];
  let active = 0;
  let counter = 0;
  let speedSamples = new Map(); // per-job samples of transmitted bytes
  let speedHistory = [];
  let autoPhase = 'baseline';
  let phaseSince = Date.now();
  let baselineSpeed = 0;
  let bestConcurrency = START_CONCURRENCY;
  let nextProbeAt = 0;
  let autoStatus = 'Прогрев';
  let last429 = 0;
  let finishedSoundPlayed = false;
  let retryAllRunning = false;
  let hideCompleted = false;
  const zone = document.querySelector('#zone-upload');
  const list = document.querySelector('#zone-upload .content-wrapper');
  let input = document.querySelector('#upload');
  if (!zone || !list || !input) return;
  installStyles();
  installPanel();
  hardPatchInput();
  hardPatchDrop();
  setInterval(autoTune, 1000);
  setInterval(updatePanel, 1000);

  function hardPatchInput() {
    input.removeAttribute('onchange');
    input.onchange = null;
    const fresh = input.cloneNode(true);
    fresh.removeAttribute('onchange');
    input.replaceWith(fresh);
    input = fresh;
    input.addEventListener('change', e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      addFiles([...e.target.files]);
      input.value = '';
    }, true);
  }

  function hardPatchDrop() {
    if (window.jQuery) {
      try {
        jQuery(zone).off();
        jQuery(input).off();
      } catch (e) {}
    }
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
      zone.addEventListener(ev, e => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (ev === 'drop') {
          addFiles([...e.dataTransfer.files]);
        }
      }, true);
    });
  }

  function installPanel() {
    document.querySelector('#gx-parallel-panel')?.remove();
    document.querySelector('#gx-side-stats')?.remove();
    const panel = document.createElement('div');
    panel.id = 'gx-side-stats';
    panel.innerHTML = `
      <div class="gx-side-title">⚡ Parallel upload</div>
      <div class="gx-side-row gx-stream-row">
        <label for="gx-concurrency-input">Потоки</label>
        <div class="gx-stream-control">
          <button type="button" class="gx-step-btn" id="gx-step-down" aria-label="Уменьшить потоки" title="Уменьшить потоки">−</button>
          <input id="gx-concurrency-input" type="number" min="1" max="20" step="1" value="${concurrency}" title="Количество одновременных загрузок (1–20)">
          <button type="button" class="gx-step-btn" id="gx-step-up" aria-label="Увеличить потоки" title="Увеличить потоки">+</button>
        </div>
      </div>
      <div class="gx-side-row"><span>Скорость</span><b id="gx-speed">0</b><span class="gx-unit">Mbps</span></div>
      <div class="gx-side-row"><span>Режим</span><button type="button" id="gx-mode">${manualConcurrency ? 'Ручной' : 'Авто'}</button></div>
      <div class="gx-side-row"><span>Настройка</span><b id="gx-auto-status">${manualConcurrency ? 'Зафиксировано' : 'Прогрев'}</b></div>
      <hr>
      <div class="gx-side-row ok"><span>Загружено</span><b id="gx-done">0</b></div>
      <div class="gx-side-row wait"><span>Осталось</span><b id="gx-left">0</b></div>
      <div class="gx-side-row err"><span>Ошибки</span><b id="gx-errors">0</b></div>
      <div class="gx-side-row"><span>Объём остаток</span><b id="gx-bytes">0</b></div>
      <div class="gx-side-eta">ETA: <b id="gx-eta">—</b></div>
      <button type="button" id="gx-toggle-completed" aria-pressed="false">🙈 Скрыть загруженные</button>
      <button type="button" id="gx-retry-all" style="display:none">🔄 Повторить все</button>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#gx-retry-all').addEventListener('click', retryAllFailed);
    panel.querySelector('#gx-toggle-completed').addEventListener('click', () => {
      hideCompleted = !hideCompleted;
      for (const job of queue) updateCompletedVisibility(job);
      updatePanel();
    });
    panel.querySelector('#gx-mode').addEventListener('click', () => {
      manualConcurrency = !manualConcurrency;
      try {
        if (manualConcurrency) localStorage.setItem(STORAGE_KEY, String(concurrency));
        else localStorage.removeItem(STORAGE_KEY);
      } catch (e) { console.warn('[GX parallel] storage:', e); }
      if (!manualConcurrency) resetAuto();
      updatePanel();
    });
    const streamInput = panel.querySelector('#gx-concurrency-input');
    panel.querySelector('#gx-step-down').addEventListener('click', () => {
      streamInput.value = Math.max(1, concurrency - 1);
      streamInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    panel.querySelector('#gx-step-up').addEventListener('click', () => {
      streamInput.value = Math.min(USER_MAX_CONCURRENCY, concurrency + 1);
      streamInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    streamInput.addEventListener('change', () => {
      const requested = Number(streamInput.value);
      if (!Number.isFinite(requested)) {
        streamInput.value = concurrency;
        return;
      }
      concurrency = Math.max(1, Math.min(USER_MAX_CONCURRENCY, Math.trunc(requested)));
      manualConcurrency = true;
      streamInput.value = concurrency;
      autoStatus = 'Зафиксировано';
      try { localStorage.setItem(STORAGE_KEY, String(concurrency)); }
      catch (e) { console.warn('[GX parallel] cannot save concurrency:', e); }
      pump();
      updatePanel();
    });
  }

  function installStyles() {
    document.querySelector('#gx-parallel-style')?.remove();
    const style = document.createElement('style');
    style.id = 'gx-parallel-style';
    style.textContent = `
      #gx-side-stats {
        position: fixed !important;
        left: 18px !important;
        bottom: 18px !important;
        width: 236px !important;
        z-index: 1080 !important;
        padding: 12px 14px !important;
        border-radius: 12px !important;
        background: #162033 !important;
        color: #fff !important;
        font-size: 13px !important;
        line-height: 1.35 !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.35) !important;
        pointer-events: auto !important;
      }
      #gx-side-stats #gx-toggle-completed {
        display: block !important;
        width: 100% !important;
        margin-top: 10px !important;
        padding: 7px 8px !important;
        border: 1px solid #36547b !important;
        border-radius: 7px !important;
        background: #233b5d !important;
        color: #d8eaff !important;
        cursor: pointer !important;
        font-size: 12px !important;
      }
      #gx-side-stats #gx-toggle-completed:hover { background: #36577b !important; }
      #gx-side-stats #gx-retry-all {
        display: block;
        width: 100% !important;
        box-sizing: border-box !important;
        margin: 7px 0 0 !important;
        padding: 8px 10px !important;
        border: 1px solid #9d515b !important;
        border-radius: 7px !important;
        background: #58303b !important;
        color: #ffe2e6 !important;
        font: 600 12px/1.4 system-ui, sans-serif !important;
        text-align: center !important;
        cursor: pointer !important;
        box-shadow: none !important;
        transition: background .16s, border-color .16s !important;
      }
      #gx-side-stats #gx-retry-all:hover:not(:disabled) {
        background: #713846 !important;
        border-color: #c76c79 !important;
      }
      #gx-side-stats #gx-retry-all:focus-visible {
        outline: 2px solid #ffaeb9 !important;
        outline-offset: 2px !important;
      }
      #gx-side-stats #gx-retry-all:disabled {
        opacity: .65 !important;
        cursor: wait !important;
      }
      #zone-upload .content-wrapper .gx-card.gx-completed-hidden { display: none !important; }
      #gx-side-stats .gx-stream-control {
        display: inline-flex !important;
        align-items: center !important;
        gap: 0 !important;
        height: 30px !important;
        overflow: hidden !important;
        border: 1px solid #3a4c68 !important;
        border-radius: 8px !important;
        background: #0d1626 !important;
      }
      #gx-side-stats #gx-concurrency-input {
        width: 34px !important;
        min-width: 0 !important;
        height: 28px !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        outline: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        color: #fff !important;
        text-align: center !important;
        font: 600 13px/28px system-ui,sans-serif !important;
        appearance: textfield !important;
        -moz-appearance: textfield !important;
      }
      #gx-side-stats #gx-concurrency-input::-webkit-inner-spin-button,
      #gx-side-stats #gx-concurrency-input::-webkit-outer-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      #gx-side-stats .gx-step-btn {
        display: grid !important;
        place-items: center !important;
        width: 29px !important;
        min-width: 29px !important;
        height: 28px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        color: #a9bdd7 !important;
        font: 600 18px/1 system-ui,sans-serif !important;
        cursor: pointer !important;
        box-shadow: none !important;
        transition: background .16s,color .16s !important;
      }
      #gx-side-stats .gx-step-btn:hover {
        background: #263a56 !important;
        color: #fff !important;
      }
      #gx-side-stats .gx-step-btn:active { background: #38577d !important; }
      #gx-side-stats .gx-step-btn:focus-visible,
      #gx-side-stats #gx-mode:focus-visible {
        outline: 2px solid #74b9ff !important;
        outline-offset: -2px !important;
      }
      #gx-side-stats #gx-mode {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 83px !important;
        height: 28px !important;
        box-sizing: border-box !important;
        padding: 0 12px !important;
        margin: 0 !important;
        border: 1px solid #36547b !important;
        border-radius: 16px !important;
        background: #233b5d !important;
        color: #d8eaff !important;
        font: 600 12px/1 system-ui,sans-serif !important;
        cursor: pointer !important;
        box-shadow: none !important;
        transition: background .16s,border-color .16s !important;
      }
      #gx-side-stats #gx-mode[data-mode="auto"] {
        background: #173e43 !important;
        border-color: #2d7771 !important;
        color: #9af2df !important;
      }
      #gx-side-stats #gx-mode:hover {
        background: #36577b !important;
        border-color: #6c95c5 !important;
      }
      #gx-side-stats #gx-mode[data-mode="auto"]:hover { background: #20565b !important; }
      #gx-side-stats .gx-stream-row,
      #gx-side-stats .gx-side-row:has(#gx-mode) {
        align-items: center !important;
      }
      #gx-side-stats .gx-side-title {
        font-weight: 700 !important;
        margin-bottom: 8px !important;
        font-size: 14px !important;
      }
      #gx-side-stats .gx-side-row {
        display: flex !important;
        align-items: baseline !important;
        justify-content: space-between !important;
        gap: 8px !important;
        margin: 3px 0 !important;
      }
      #gx-side-stats .gx-side-row span:first-child {
        opacity: .8 !important;
      }
      #gx-side-stats .gx-unit {
        margin-left: 4px !important;
        opacity: .7 !important;
        font-size: 11px !important;
      }
      #gx-side-stats hr {
        border: 0 !important;
        border-top: 1px solid rgba(255,255,255,.12) !important;
        margin: 8px 0 !important;
      }
      #gx-side-stats .ok b { color: #7dffa0 !important; }
      #gx-side-stats .wait b { color: #ffd36b !important; }
      #gx-side-stats .err b { color: #ff8b8b !important; }
      #gx-side-stats .gx-side-eta {
        margin-top: 8px !important;
        padding-top: 8px !important;
        border-top: 1px solid rgba(255,255,255,.12) !important;
        font-size: 13px !important;
      }
      @media (max-width: 1199px) {
        #gx-side-stats {
          left: 12px !important;
          bottom: 12px !important;
          width: 210px !important;
        }
      }
      #zone-upload .content-wrapper .gx-card {
        display: block !important;
        clear: both !important;
        margin: 12px 0 !important;
        padding: 14px !important;
        border: 1px solid rgba(255,255,255,.12) !important;
        border-radius: 10px !important;
        background: rgba(0,0,0,.16) !important;
        overflow: hidden !important;
      }
      .gx-head {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        margin-bottom: 10px !important;
      }
      .gx-icon {
        width: 36px !important;
        min-width: 36px !important;
        font-size: 30px !important;
      }
      .gx-name {
        flex: 1 !important;
        min-width: 0 !important;
        font-weight: 600 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .gx-state {
        min-width: 70px !important;
        text-align: right !important;
        font-size: 13px !important;
      }
      .gx-row {
        display: grid !important;
        grid-template-columns: 1fr 230px auto !important;
        gap: 10px !important;
        align-items: end !important;
        margin-bottom: 10px !important;
      }
      .gx-field label {
        display: block !important;
        margin-bottom: 4px !important;
        font-size: 12px !important;
        opacity: .85 !important;
      }
      .gx-title,
      .gx-folder {
        width: 100% !important;
        height: 36px !important;
        box-sizing: border-box !important;
      }
      .gx-progress {
        height: 22px !important;
        background: rgba(255,255,255,.12) !important;
        border-radius: 6px !important;
        overflow: hidden !important;
      }
      .gx-bar {
        height: 100% !important;
        width: 0%;
        line-height: 22px !important;
        text-align: center !important;
        transition: width .2s linear !important;
      }
      .progress-bar-danger {
        background-color: red !important;
      }
      .gx-retry {
        margin-top: 8px !important;
      }
      .gx-text {
        font-size: 13px !important;
        margin-bottom: 5px !important;
      }
      .gx-result input {
        width: 100% !important;
        margin-top: 8px !important;
      }
      @media (max-width: 800px) {
        .gx-row { grid-template-columns: 1fr !important; }
      }

    `;
    document.head.appendChild(style);
  }

  function addFiles(files) {
    finishedSoundPlayed = false;
    removeNativeDuplicates();
    for (const file of files) {
      if (!isAllowed(file)) continue;
      const id = counter++;
      const item = createItem(id, file);
      queue.push({
        id,
        file,
        item,
        started: false,
        canceled: false,
        done: false,
        failed: false,
        xhr: null,
        loaded: 0,
        titleInput: item.querySelector('.gx-title'),
        folderSelect: item.querySelector('.gx-folder'),
      });
    }
    setTimeout(removeNativeDuplicates, 100);
    setTimeout(removeNativeDuplicates, 500);
    pump();
    updatePanel();
  }

  function removeNativeDuplicates() {
    list.querySelectorAll('.media:not(.gx-card), .accordion:not(.gx-safe)').forEach(el => {
      if (!el.closest('.gx-card')) el.remove();
    });
  }

  function isAllowed(file) {
    const name = file.name.toLowerCase();
    return /\.(mkv|mp4|avi|mov|ts|m2ts|webm)$/i.test(name) || (file.type || '').startsWith('video/');
  }

  function createItem(id, file) {
    const div = document.createElement('div');
    div.className = `gx-card gx-file-${id}`;
    const folderOptions = document.querySelector('#folderOptions')?.innerHTML || '';
    div.innerHTML = `
      <div class="gx-head">
        <div class="gx-icon"><i class="fa fa-file-movie-o"></i></div>
        <div class="gx-name" title="${esc(file.name)}">${esc(file.name)}</div>
        <div class="gx-state">Queued</div>
      </div>
      <div class="gx-row">
        <div class="gx-field">
          <label>Title:</label>
          <input class="form-control gx-title" value="${esc(file.name)}">
        </div>
        <div class="gx-field">
          <label>Folder:</label>
          <select class="form-control gx-folder">
            <option value="">No folder</option>
            ${folderOptions}
          </select>
        </div>
        <button type="button" class="btn btn-danger btn-sm gx-cancel">Cancel</button>
      </div>
      <div class="gx-text">Waiting...</div>
      <div class="gx-progress progress">
        <div class="gx-bar progress-bar progress-bar-striped progress-bar-primary active"></div>
      </div>
      <div class="gx-result"></div>
    `;
    div.querySelector('.gx-cancel').onclick = () => cancel(id);
    list.appendChild(div);
    return div;
  }

  function pump() {
    while (active < concurrency) {
      const job = queue.find(j => !j.started && !j.canceled && !j.failed && !j.done);
      if (!job) break;
      job.started = true;
      active++;
      uploadJob(job)
        .catch(err => fail(job, err.message || String(err)))
        .finally(() => {
          active--;
          speedSamples.delete(job.id);
          updatePanel();
          pump();
          checkAllDone();
        });
    }
  }

  async function uploadJob(job) {
    update(job, 0, 'Getting session...');
    const session = await postForm({
      reason: 'upload',
      name: job.file.name,
      size: job.file.size,
    });
    if (!session?.status) throw new Error(session?.msg || 'Session failed');
    const uploadUrl = session.url || session.resumeUri || session.uploadUrl;
    if (!uploadUrl) throw new Error('No upload URL');
    const fileId = await uploadChunks(job, uploadUrl);
    const saved = await postForm({
      reason: 'save',
      fileId: btoa(fileId),
      name: encodeURIComponent(job.file.name),
      size: job.file.size,
      title: encodeURIComponent(job.titleInput.value || job.file.name),
      folderId: encodeURIComponent(job.folderSelect.value || ''),
    });
    if (!saved?.status) throw new Error(saved?.msg || 'Save failed');
    done(job, saved.slug || saved.file_code || saved.fileCode || saved.embed_link || saved.link || '');
  }

  async function uploadChunks(job, uploadUrl) {
    const file = job.file;
    const total = file.size;
    const chunks = Math.ceil(total / CHUNK_SIZE);
    const startedAt = Date.now();
    let fileId = null;
    for (let i = 0; i < chunks; i++) {
      if (job.canceled) throw new Error('Canceled');
      const start = i * CHUNK_SIZE;
      const end = Math.min(total, start + CHUNK_SIZE);
      const chunk = file.slice(start, end);
      const res = await sendChunkRetry(job, uploadUrl, chunk, start, end, total, startedAt);
      if (res?.id) fileId = res.id;
    }
    if (!fileId) throw new Error('No fileId returned');
    return fileId;
  }

  async function sendChunkRetry(job, url, chunk, start, end, total, startedAt) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        return await sendChunk(job, url, chunk, start, end, total, startedAt);
      } catch (e) {
        if (String(e.message).includes('429')) {
          last429 = Date.now();
          if (!manualConcurrency) {
            concurrency = Math.max(1, concurrency - 1);
            bestConcurrency = concurrency;
            nextProbeAt = Date.now() + RECHECK_MS;
            autoPhase = 'cooldown';
            autoStatus = '429: пауза проверки';
          }
          updatePanel();
        }
        if (attempt === 5) throw e;
        update(job, Math.floor(start * 100 / total), `Retry ${attempt}/5: ${e.message}`);
        await sleep(1000 * attempt * attempt);
      }
    }
  }

  function sendChunk(job, url, chunk, start, end, total, startedAt) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      job.xhr = xhr;
      xhr.responseType = 'json';
      xhr.open('PATCH', url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${total}`);
      xhr.upload.onprogress = e => {
        if (!e.lengthComputable) return;
        const now = Date.now();
        const loaded = start + e.loaded;
        job.loaded = loaded;
        const samples = speedSamples.get(job.id) || [];
        // Offset remains monotonic across chunks; reset on retry/new session.
        if (samples.length && loaded < samples[samples.length - 1].bytes) samples.length = 0;
        samples.push({ t: now, bytes: loaded });
        while (samples.length > 1 && samples[0].t < now - SPEED_WINDOW_MS) samples.shift();
        speedSamples.set(job.id, samples);
        const first = samples[0];
        const speed = samples.length > 1 && now > first.t
          ? Math.max(0, loaded - first.bytes) * 1000 / (now - first.t) : 0;
        const percent = Math.floor(loaded * 100 / total);
        const left = speed > 0 ? (total - loaded) / speed : 0;
        update(job, percent, `${percent}% | ${mbps(speed)} Mbps | left: ${fmt(left)}`);
        updatePanel();
      };
      xhr.onload = () => {
        if (xhr.status === 308) return resolve(null);
        if (xhr.status === 200 || xhr.status === 201) return resolve(xhr.response || null);
        if (xhr.status === 429) return reject(new Error('429 Rate limit'));
        reject(new Error(`HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.onabort = () => reject(new Error('Canceled'));
      xhr.send(chunk);
    });
  }

  async function postForm(obj) {
    const body = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => body.append(k, v));
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      credentials: 'same-origin',
    });
    return res.json();
  }

  function totalSpeedNow() {
    const now = Date.now();
    let sum = 0;
    for (const samples of speedSamples.values()) {
      if (samples.length < 2) continue;
      const first = samples[0], last = samples[samples.length - 1];
      if (now - last.t > 2500 || last.t <= first.t) continue;
      sum += Math.max(0, last.bytes - first.bytes) * 1000 / (last.t - first.t);
    }
    return sum;
  }

  function resetAuto() {
    autoPhase = 'baseline';
    phaseSince = Date.now();
    speedHistory = [];
    bestConcurrency = concurrency;
    baselineSpeed = 0;
    nextProbeAt = 0;
    autoStatus = 'Прогрев';
  }

  function autoTune() {
    if (manualConcurrency) { autoStatus = 'Зафиксировано'; updatePanel(); return; }
    const now = Date.now();
    const waiting = queue.some(j => !j.started && !j.canceled && !j.failed && !j.done);
    const current = totalSpeedNow();
    // Require active transfers and a full measurement window.
    const transferring = [...speedSamples.values()].filter(a => a.length > 1 && now - a[a.length - 1].t < 2500).length;
    if (!transferring || active === 0) {
      phaseSince = now;
      speedHistory = [];
      autoStatus = 'Ожидание загрузок';
      updatePanel(); return;
    }
    if (autoPhase === 'cooldown') {
      if (now >= nextProbeAt) { resetAuto(); }
      else autoStatus = 'Проверка позже';
      updatePanel(); return;
    }
    if (now - last429 < 60000) { autoStatus = 'Ожидание после 429'; updatePanel(); return; }
    if (now - phaseSince < WARMUP_MS) { autoStatus = 'Прогрев'; updatePanel(); return; }
    if (current > 0) speedHistory.push(current);
    if (speedHistory.length > 60) speedHistory.shift();
    if (now - phaseSince < WARMUP_MS + MEASURE_MS) {
      autoStatus = 'Измерение'; updatePanel(); return;
    }
    if (speedHistory.length < 5) {
      phaseSince = now; speedHistory = []; updatePanel(); return;
    }
    const measured = speedHistory.reduce((a,b) => a+b, 0) / speedHistory.length;
    speedHistory = [];
    phaseSince = now;
    if (autoPhase === 'baseline') {
      baselineSpeed = measured;
      bestConcurrency = concurrency;
      if (!waiting || concurrency >= USER_MAX_CONCURRENCY) {
        autoPhase = 'cooldown'; nextProbeAt = now + RECHECK_MS;
        autoStatus = 'Нет очереди для теста';
      } else {
        concurrency++;
        autoPhase = 'probe';
        autoStatus = 'Проверка +1 потока';
        pump();
      }
    } else if (autoPhase === 'probe') {
      const gain = baselineSpeed > 0 ? (measured - baselineSpeed) / baselineSpeed : 0;
      if (gain >= MIN_GAIN) {
        baselineSpeed = measured;
        bestConcurrency = concurrency;
        if (waiting && concurrency < USER_MAX_CONCURRENCY) {
          concurrency++;
          autoStatus = `Прирост ${(gain*100).toFixed(1)}%, ещё +1`;
          pump();
        } else {
          autoPhase = 'cooldown'; nextProbeAt = now + RECHECK_MS;
          autoStatus = 'Оптимизация завершена';
        }
      } else {
        concurrency = bestConcurrency;
        autoPhase = 'cooldown'; nextProbeAt = now + RECHECK_MS;
        autoStatus = `Прирост ${(gain*100).toFixed(1)}%, откат`;
      }
    }
    updatePanel();
  }

  function liveJobs() {
    return queue.filter(j => !j.canceled);
  }

  function remainingBytes() {
    return liveJobs()
      .filter(j => !j.done && !j.failed)
      .reduce((sum, j) => sum + Math.max(0, j.file.size - (j.loaded || 0)), 0);
  }

  function updateCompletedVisibility(job) {
    if (job?.item) job.item.classList.toggle('gx-completed-hidden', hideCompleted && job.done);
  }

  function updatePanel() {
    const jobs = liveJobs();
    const doneCount = jobs.filter(j => j.done).length;
    const errorCount = jobs.filter(j => j.failed).length;
    const leftCount = jobs.filter(j => !j.done && !j.failed).length;
    const totalSpeed = totalSpeedNow();
    const leftBytes = remainingBytes();
    const etaSec = totalSpeed > 0 && leftBytes > 0 ? leftBytes / totalSpeed : 0;

    const set = (id, value) => {
      const el = document.querySelector(id);
      if (el) el.textContent = value;
    };
    const streamInput = document.querySelector('#gx-concurrency-input');
    if (streamInput && document.activeElement !== streamInput) streamInput.value = concurrency;
    set('#gx-speed', Math.round(totalSpeed * 8 / 1024 / 1024));
    set('#gx-auto-status', autoStatus);
    set('#gx-mode', manualConcurrency ? 'Ручной' : 'Авто');
    const modeButton = document.querySelector('#gx-mode');
    if (modeButton) {
      modeButton.dataset.mode = manualConcurrency ? 'manual' : 'auto';
      modeButton.title = manualConcurrency ? 'Переключить на автоматическую настройку' : 'Переключить на ручную настройку';
      modeButton.setAttribute('aria-pressed', String(!manualConcurrency));
    }
    set('#gx-done', doneCount);
    const completedButton = document.querySelector('#gx-toggle-completed');
    if (completedButton) {
      completedButton.textContent = hideCompleted ? `👁 Показать загруженные (${doneCount})` : `🙈 Скрыть загруженные (${doneCount})`;
      completedButton.setAttribute('aria-pressed', String(hideCompleted));
    }
    set('#gx-left', leftCount);
    set('#gx-errors', errorCount);
    const retryAllButton = document.querySelector('#gx-retry-all');
    if (retryAllButton) {
      retryAllButton.style.display = errorCount > 0 || retryAllRunning ? 'block' : 'none';
      retryAllButton.disabled = retryAllRunning;
      retryAllButton.textContent = retryAllRunning ? '⏳ Повторяем...' : `🔄 Повторить все (${errorCount})`;
    }
    set('#gx-bytes', humanSize(leftBytes));
    set('#gx-eta', leftBytes === 0 ? (jobs.length ? 'готово' : '—') : (totalSpeed > 0 ? fmt(etaSec) : 'нет скорости'));
  }

  function update(job, percent, text) {
    const bar = job.item.querySelector('.gx-bar');
    job.item.querySelector('.gx-text').textContent = text;
    job.item.querySelector('.gx-state').textContent = `${percent}%`;
    bar.style.width = `${percent}%`;
    bar.textContent = percent > 7 ? `${percent}%` : '';
  }

  function done(job, slug) {
    job.done = true;
    job.loaded = job.file.size;
    const bar = job.item.querySelector('.gx-bar');
    bar.className = 'gx-bar progress-bar progress-bar-success';
    bar.style.width = '100%';
    bar.textContent = 'Done';
    job.item.querySelector('.gx-state').textContent = 'Done';
    job.item.querySelector('.gx-cancel')?.remove();
    updateCompletedVisibility(job);
    const iframe = slug
      ? `<iframe src="${WATCH_URL + slug}" frameborder="0" scrolling="0" allowfullscreen></iframe>`
      : '';
    const value = slug ? `${slug} | ${iframe}` : 'Uploaded';
    job.item.querySelector('.gx-result').innerHTML =
      `<input class="form-control" readonly value="${esc(value)}">`;
    updatePanel();
  }

  function fail(job, msg) {
    job.failed = true;
    job.started = true;
    job.done = false;
    job.xhr = null;
    speedSamples.delete(job.id);
    const bar = job.item.querySelector('.gx-bar');
    bar.className = 'gx-bar progress-bar progress-bar-danger';
    bar.style.width = '100%';
    bar.textContent = 'Error';
    job.item.querySelector('.gx-text').textContent = msg;
    job.item.querySelector('.gx-state').textContent = 'Error';
    const result = job.item.querySelector('.gx-result');
    result.innerHTML = `
      <button type="button" class="btn btn-warning btn-sm gx-retry">
        Повторить загрузку
      </button>
    `;
    result.querySelector('.gx-retry').onclick = () => retryJob(job);
    updatePanel();
  }

  async function retryAllFailed() {
    if (retryAllRunning) return;
    const failedJobs = queue.filter(j => j.failed && !j.done && !j.canceled);
    if (!failedJobs.length) return;
    retryAllRunning = true;
    updatePanel();
    try {
      for (let i = 0; i < failedJobs.length; i++) {
        const job = failedJobs[i];
        if (job.failed && !job.done && !job.canceled) retryJob(job);
        if (i < failedJobs.length - 1) await sleep(1000);
      }
    } finally {
      retryAllRunning = false;
      updatePanel();
    }
  }

  function retryJob(job) {
    if (!job || job.done || job.canceled) return;
    finishedSoundPlayed = false;
    try {
      job.xhr?.abort();
    } catch (e) {}
    job.failed = false;
    job.started = false;
    job.done = false;
    job.canceled = false;
    job.xhr = null;
    job.loaded = 0;
    speedSamples.delete(job.id);
    const bar = job.item.querySelector('.gx-bar');
    bar.className = 'gx-bar progress-bar progress-bar-striped progress-bar-primary active';
    bar.style.width = '0%';
    bar.textContent = '';
    job.item.querySelector('.gx-state').textContent = 'Queued';
    job.item.querySelector('.gx-text').textContent = 'Waiting...';
    job.item.querySelector('.gx-result').innerHTML = '';
    pump();
    updatePanel();
  }

  function cancel(id) {
    const job = queue.find(j => j.id === id);
    if (!job) return;
    job.canceled = true;
    try {
      job.xhr?.abort();
    } catch (e) {}
    job.item.remove();
    speedSamples.delete(id);
    pump();
    checkAllDone();
    updatePanel();
  }

  function checkAllDone() {
    const hasPending = queue.some(j => !j.canceled && !j.done && !j.failed);
    if (!hasPending && active === 0 && queue.length > 0 && !finishedSoundPlayed) {
      finishedSoundPlayed = true;
      playDoneSound();
    }
  }

  function playDoneSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const notes = [
        [880, 0.00, 0.12],
        [1175, 0.14, 0.12],
        [1568, 0.28, 0.18],
      ];
      notes.forEach(([freq, delay, duration]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration + 0.05);
      });
    } catch (e) {
      console.warn('[GX parallel] sound failed:', e);
    }
  }

  function mbps(bytesPerSecond) {
    return Math.round(bytesPerSecond * 8 / 1024 / 1024);
  }

  function humanSize(bytes) {
    bytes = Math.max(0, bytes || 0);
    if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(0) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function esc(str) {
    const map = {'&':'&'+'amp;','<':'&'+'lt;','>':'&'+'gt;','"':'&'+'quot;',"'":'&#039;'};
    return String(str).replace(/[&<>"']/g, ch => map[ch]);
  }
})();