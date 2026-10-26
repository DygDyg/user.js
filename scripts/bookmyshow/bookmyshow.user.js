// ==UserScript==
// @name         BookMyShow — Movie Info Collector FIX
// @namespace    https://dygdyg.ru/
// @version      1.8
// @description  Сбор данных фильма BookMyShow с обновлением данных при каждом открытии меню
// @match        https://in.bookmyshow.com/movies/*/*
// @grant        GM_setClipboard
// @downloadURL  https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/bookmyshow/bookmyshow.user.js
// @updateURL    https://raw.githubusercontent.com/DygDyg/user.js/main/scripts/bookmyshow/bookmyshow.user.js
// ==/UserScript==

(function () {
  "use strict";

  document.body.style.userSelect = "auto";

  function extractInitialState() {
    for (const s of document.querySelectorAll("script")) {
      const t = s.textContent;
      if (!t || !t.includes("window.__INITIAL_STATE__")) continue;

      try {
        const jsonStr = t
          .replace(/^.*?window\.__INITIAL_STATE__\s*=\s*/, "")
          .replace(/;\s*$/, "");
        return JSON.parse(jsonStr);
      } catch {}
    }

    return window.__INITIAL_STATE__ || null;
  }

  function extractYear(str) {
    if (!str) return "";
    const m = String(str).match(/\b(19|20)\d{2}\b/);
    return m ? m[0] : "";
  }

  function countryNameFromCode(code) {
    if (!code) return "";
    const c = String(code).toUpperCase();
    if (c === "IN") return "India";
    if (c === "US" || c === "USA") return "United States";
    if (c === "GB" || c === "UK") return "United Kingdom";
    return c;
  }

function normalizeDuration(v) {
  if (!v) return "";

  if (typeof v === "number") {
    return String(v);
  }

  const s = String(v).trim();

  // ISO8601 PT2H49M
  const iso = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso) {
    const h = parseInt(iso[1] || "0", 10);
    const m = parseInt(iso[2] || "0", 10);
    return String(h * 60 + m);
  }

  // 2h 49m
  const hm = s.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
  if (hm && (hm[1] || hm[2])) {
    const h = parseInt(hm[1] || "0", 10);
    const m = parseInt(hm[2] || "0", 10);
    return String(h * 60 + m);
  }

  // 그냥 숫자
  const num = s.match(/\d+/);
  if (num) return num[0];

  return s;
}
  function uniqueJoin(arr) {
    return [...new Set(
      arr
        .flatMap(x => String(x || "").split(","))
        .map(x => x.trim())
        .filter(Boolean)
    )].join(", ");
  }

  function getAllSynopsisQueryData(st) {
    return Object.values(st.synopsisMoviesApi?.queries || {})
      .map(q => q?.data)
      .filter(Boolean);
  }

  function getSeoEntries(st) {
    return Object.values(st.seo?.queries || {})
      .map(q => q?.data)
      .filter(Boolean);
  }

  function getMetaDom(key) {
    return (
      document.querySelector(`meta[property="${key}"]`)?.content ||
      document.querySelector(`meta[name="${key}"]`)?.content ||
      document.querySelector(`meta[itemprop="${key}"]`)?.content ||
      ""
    );
  }

  function getMetaFromState(st, key) {
    const lists = [];

    for (const seo of getSeoEntries(st)) {
      if (Array.isArray(seo?.pageMetaTags)) lists.push(seo.pageMetaTags);
      if (Array.isArray(seo?.seo?.metaProperties)) lists.push(seo.seo.metaProperties);
    }

    for (const d of getAllSynopsisQueryData(st)) {
      if (Array.isArray(d?.seo?.metaProperties)) lists.push(d.seo.metaProperties);
      if (Array.isArray(d?.pageMetaTags)) lists.push(d.pageMetaTags);
    }

    for (const list of lists) {
      const found = list.find(m => m?.keyValue === key || m?.keyName === key);
      if (found?.value) return found.value;
    }

    return "";
  }

  function getMeta(st, key) {
    return getMetaDom(key) || getMetaFromState(st, key);
  }

  function getMovieJsonLdList(st) {
    const list = [];

    for (const seo of getSeoEntries(st)) {
      if (seo?.ldSchema?.movieJsonLd) list.push(seo.ldSchema.movieJsonLd);
      if (seo?.seo?.movieJsonLd) list.push(seo.seo.movieJsonLd);
    }

    for (const data of getAllSynopsisQueryData(st)) {
      if (data?.seo?.movieJsonLd) list.push(data.seo.movieJsonLd);
    }

    return list.filter(Boolean);
  }

  function getBestMovieJsonLd(st) {
    const list = getMovieJsonLdList(st);

    return (
      list.find(m => m.actor?.length && m.director?.length) ||
      list.find(m => m.actor?.length || m.director?.length) ||
      list.find(m => m.description || m.image || m.name) ||
      {}
    );
  }

  function getBestBannerWidget(st) {
    const widgets = [];

    for (const data of getAllSynopsisQueryData(st)) {
      if (data?.bannerWidget && Object.keys(data.bannerWidget).length) {
        widgets.push(data.bannerWidget);
      }

      if (data?.eventState?.bannerWidget && Object.keys(data.eventState.bannerWidget).length) {
        widgets.push(data.eventState.bannerWidget);
      }
    }

    if (st.synopsisStore?.synopsisRender?.bannerWidget) {
      widgets.push(st.synopsisStore.synopsisRender.bannerWidget);
    }

    return widgets.find(Boolean) || {};
  }

  function getDynamicSynopsisData(st) {
    return getAllSynopsisQueryData(st).find(d =>
      d?.meta?.event ||
      d?.eventState?.eventName ||
      d?.bannerWidget
    ) || {};
  }

  function getWidgetByTitle(st, title) {
    const wanted = title.toLowerCase();

    for (const data of getAllSynopsisQueryData(st)) {
      const widgets = data?.widgets || {};
      for (const widget of Object.values(widgets)) {
        const t = String(widget?.header?.title || widget?.objectData?.title || "").toLowerCase();
        if (t === wanted) return widget;
      }
    }

    return null;
  }

  function getWidgetPeople(st, title, roleFilter = "") {
    const widget = getWidgetByTitle(st, title);
    if (!widget?.listData?.length) return "";

    const role = roleFilter.toLowerCase();

    return uniqueJoin(
      widget.listData
        .filter(p => !role || String(p.subtitle || "").toLowerCase().includes(role))
        .map(p => p.title)
    );
  }

  function getDescription(st, ld) {
    const about = getWidgetByTitle(st, "About the movie");

    return (
      ld.description ||
      about?.objectData?.description ||
      st.synopsisStore?.synopsis?.description ||
      getMeta(st, "og:description") ||
      getMeta(st, "description") ||
      ""
    );
  }

  function getBannerUrl(st, bannerWidget) {
    return (
      bannerWidget.bannerImageUrl ||
      bannerWidget[" "] ||
      bannerWidget?.multimedia?.objectData?.imageUrl ||
      getMeta(st, "og:image") ||
      getMeta(st, "twitter:image") ||
      getMeta(st, "image") ||
      ""
    );
  }

  function getPosterUrl(st, ld, bannerWidget) {
    return (
      ld.image ||
      bannerWidget?.multimedia?.objectData?.imageUrl ||
      getMeta(st, "image") ||
      getMeta(st, "og:image") ||
      getMeta(st, "twitter:image") ||
      ""
    );
  }

  function getAllTrailers(st, ld, bannerWidget) {
    const urls = [];

    const add = v => {
      if (v && typeof v === "string" && /^https?:\/\//i.test(v)) urls.push(v);
    };

    add(ld?.potentialAction?.target?.urlTemplate);
    add(ld?.hasPart?.potentialAction?.target?.urlTemplate);

    const bwVideos = bannerWidget?.multimedia?.objectData?.meta?.videos || [];
    bwVideos.forEach(v => add(v.videoUrl));

    const storeVideos = st.synopsisStore?.multiMedia?.multiMediaData?.videos || [];
    for (const group of storeVideos) {
      for (const item of group.data || []) add(item.videoUrl);
    }

    for (const data of getAllSynopsisQueryData(st)) {
      const videos = data?.bannerWidget?.multimedia?.objectData?.meta?.videos || [];
      videos.forEach(v => add(v.videoUrl));
    }

    return [...new Set(urls)].join(", ");
  }

  function getLanguages(st, ld, bannerWidget) {
    const fromLd = String(ld.inLanguage || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

    const fromBanner = (bannerWidget.languages || []).map(x => x.label);

    const fromMeta = [];
    for (const data of getAllSynopsisQueryData(st)) {
      if (Array.isArray(data?.meta?.event?.eventLanguage)) fromMeta.push(...data.meta.event.eventLanguage);
      if (Array.isArray(data?.eventState?.eventLanguage)) fromMeta.push(...data.eventState.eventLanguage);
    }

    return uniqueJoin([...fromLd, ...fromBanner, ...fromMeta]);
  }

  function getGenres(st, ld, bannerWidget) {
    if (Array.isArray(ld.genre) && ld.genre.length) return uniqueJoin(ld.genre);

    const fromBanner = (bannerWidget.genres || []).map(g => g.label);

    const fromMeta = [];
    for (const data of getAllSynopsisQueryData(st)) {
      const g = data?.meta?.event?.eventGenre || data?.eventState?.eventGenre || "";
      if (g) fromMeta.push(...String(g).split("|"));
    }

    return uniqueJoin([...fromBanner, ...fromMeta]);
  }

  function getFormat(st, bannerWidget) {
    const fromBanner = (bannerWidget.resolutions || []).map(r => r.label);

    const fromMeta = [];
    for (const data of getAllSynopsisQueryData(st)) {
      if (data?.meta?.event?.eventDimension) fromMeta.push(data.meta.event.eventDimension);
      if (data?.eventState?.eventDimension) fromMeta.push(data.eventState.eventDimension);
    }

    return uniqueJoin([...fromBanner, ...fromMeta]);
  }

  function getCensor(st, bannerWidget) {
    return (
      bannerWidget.censor ||
      getAllSynopsisQueryData(st)
        .map(d => d?.meta?.event?.eventCensor || d?.eventState?.eventCensor)
        .find(Boolean) ||
      ""
    );
  }

  function normalizeRatingValue(v) {
    if (typeof v === "string") {
      const m = v.match(/[\d.]+/);
      if (!m) return "";
      return m[0];
    }

    if (typeof v !== "number" || v <= 0) return "";

    const r = v > 10 ? v / 10 : v;
    return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
  }

  function getRating(st) {
    const candidates = [];

    candidates.push(st.synopsisStore?.ratingAndReviews?.rating);

    for (const data of getAllSynopsisQueryData(st)) {
      candidates.push(data?.meta?.ratings?.aggregatedRatingString);
      candidates.push(data?.meta?.ratings?.aggregatedRating);
      candidates.push(data?.seo?.aggregateRating?.ratingValue);
      candidates.push(data?.eventState?.analytics?.rating_percentage);
      candidates.push(data?.analytics?.rating_percentage);

      const rnrText =
        data?.desktopData?.rnrSection?.objectData?.states?.rnr?.widgetData?.data?.[0]?.data?.[0]?.data?.[0]?.components
          ?.map(c => c.text)
          ?.join("");

      candidates.push(rnrText);
    }

    for (const v of candidates) {
      const rating = normalizeRatingValue(v);
      if (rating) return rating;
    }

    return "";
  }

  function getVotesOrInterest(st) {
    const directVotes = st.synopsisStore?.ratingAndReviews?.totalRatingsCount;
    if (directVotes) return String(directVotes);

    for (const data of getAllSynopsisQueryData(st)) {
      const ratingCount = data?.seo?.aggregateRating?.ratingCount;
      if (ratingCount) return String(ratingCount);

      const reviewCount = data?.meta?.ratings?.ratingCount;
      if (reviewCount) return String(reviewCount);

      const rnrComponents =
        data?.desktopData?.rnrSection?.objectData?.states?.rnr?.widgetData?.data?.[0]?.data?.[0]?.data?.[0]?.data?.[1]?.components || [];

      const rnrText = rnrComponents.map(c => c.text).filter(Boolean).join("").trim();
      if (rnrText) return rnrText.replace(/[()]/g, "").trim();

      const interestedComponents =
        data?.desktopData?.interested?.objectData?.states?.interested?.widgetData?.data?.[0]?.data?.[0]?.components || [];

      const interestedText = interestedComponents.map(c => c.text).filter(Boolean).join("").trim();
      if (interestedText) return interestedText.replace(/\s+/g, " ");
    }

    return "";
  }

  function getReviewsCount(st) {
    for (const data of getAllSynopsisQueryData(st)) {
      const seeMore = Object.values(data?.widgets || {})
        .map(w => w?.header?.seeMoreText)
        .find(t => String(t || "").toLowerCase().includes("review"));

      if (seeMore) return seeMore;

      const reviewCount = data?.seo?.aggregateRating?.reviewCount;
      if (reviewCount) return String(reviewCount);
    }

    return "";
  }

  function getBookStatus(st, bannerWidget) {
    const dynamic = getDynamicSynopsisData(st);

    if (dynamic?.meta?.event?.bookButton === true || dynamic?.eventState?.bookButton === true) {
      return "Book tickets";
    }

    if (bannerWidget?.headingAttribute?.[0]?.title) {
      return bannerWidget.headingAttribute[0].title;
    }

    if (dynamic?.meta?.event?.bookButton === false || dynamic?.eventState?.bookButton === false) {
      return "Not bookable";
    }

    return "";
  }

  function getData() {
    const st = extractInitialState() || {};
    const ld = getBestMovieJsonLd(st);
    const bannerWidget = getBestBannerWidget(st);
    const dynamicData = getDynamicSynopsisData(st);

    const urlMatch = location.href.match(/\/movies\/(?:[^/]+\/)?[^/]+\/([A-Z0-9]+)/i);

    const actorsFromLd = Array.isArray(ld.actor)
      ? ld.actor.map(a => a?.name).filter(Boolean)
      : [];

    const directorsFromLd = Array.isArray(ld.director)
      ? ld.director.map(d => d?.name).filter(Boolean)
      : [];

    const musicFromLd = Array.isArray(ld.musicBy)
      ? ld.musicBy.map(d => d?.name).filter(Boolean)
      : [];

    const title =
      ld.name ||
      bannerWidget.heading ||
      dynamicData?.meta?.event?.eventName ||
      dynamicData?.eventState?.eventName ||
      st.synopsisStore?.synopsis?.eventName ||
      document.title.replace(/\s*\|.*$/, "").trim();

    return {
      id: urlMatch ? urlMatch[1] : "",
      title,
      original: ld.name || title,
      rating: getRating(st),
      votes: getVotesOrInterest(st),
      reviews: getReviewsCount(st),
      description: getDescription(st, ld),
      poster: getPosterUrl(st, ld, bannerWidget),
      banner: getBannerUrl(st, bannerWidget),
      trailer: getAllTrailers(st, ld, bannerWidget),
      duration: normalizeDuration(ld.duration || bannerWidget.duration),
      actors: uniqueJoin([...actorsFromLd, getWidgetPeople(st, "Cast")]),
      director: uniqueJoin([...directorsFromLd, getWidgetPeople(st, "Crew", "Director")]),
      music: uniqueJoin([...musicFromLd, getWidgetPeople(st, "Crew", "Musician")]),
      producer: getWidgetPeople(st, "Crew", "Producer"),
      presenter: getWidgetPeople(st, "Crew", "Presenter"),
      genre: getGenres(st, ld, bannerWidget),
      language: getLanguages(st, ld, bannerWidget),
      format: getFormat(st, bannerWidget),
      censor: getCensor(st, bannerWidget),
      bookStatus: getBookStatus(st, bannerWidget),
      country: countryNameFromCode(
        ld.releasedEvent?.location?.name ||
        ld.releasedEvent?.location?.["@id"] ||
        st.cookies?.rgn?.countryCode ||
        ""
      ),
      year:
        extractYear(ld.datePublished) ||
        extractYear(bannerWidget.releaseDate) ||
        extractYear(dynamicData?.meta?.event?.releaseDate) ||
        extractYear(dynamicData?.eventState?.releaseDate),
      releaseDate:
        ld.datePublished ||
        bannerWidget.releaseDate ||
        dynamicData?.meta?.event?.releaseDate ||
        dynamicData?.eventState?.releaseDate ||
        "",
      studio: "",
    };
  }

  function getCurrentMovieId() {
    return location.href.match(/\/movies\/(?:[^/]+\/)?[^/]+\/([A-Z0-9]+)/i)?.[1] || "";
  }

  function stateHasCurrentMovie(st) {
    const id = getCurrentMovieId();
    if (!id) return true;

    try {
      return JSON.stringify(st || {}).includes(id);
    } catch {
      return true;
    }
  }

  function waitForPageUpdate() {
    return new Promise(resolve => {
      let tries = 0;

      const timer = setInterval(() => {
        tries++;

        const st = extractInitialState();

        if (stateHasCurrentMovie(st) || tries > 20) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  }

  async function copyText(text) {
    try {
      if (typeof GM_setClipboard === "function") GM_setClipboard(String(text || ""));
      else await navigator.clipboard.writeText(String(text || ""));
    } catch {
      alert("Ошибка копирования");
    }
  }

  async function copyImage(url, btn) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);

      let blob = await new Promise(r => c.toBlob(r, "image/webp", 0.95));
      let type = "image/webp";

      try {
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      } catch {
        blob = await new Promise(r => c.toBlob(r, "image/png"));
        type = "image/png";
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      }

      btn.textContent = "✅";
      setTimeout(() => (btn.textContent = "📋 Копировать картинку"), 1500);
    } catch {
      alert("Ошибка копирования изображения. Возможно, сайт запрещает чтение картинки через CORS.");
    }
  }

  function makeLine(label, value) {
    const line = document.createElement("div");
    line.style.cssText =
      "display:flex;gap:6px;margin-bottom:8px;background:#2c2c2c;border-radius:6px;padding:6px 8px;";

    const l = document.createElement("div");
    l.textContent = label + ":";
    l.style.fontWeight = "bold";
    l.style.minWidth = "155px";

    const v = document.createElement("div");
    v.textContent = value || "—";
    v.style.flex = "1";
    v.style.fontSize = "13px";
    v.style.overflowWrap = "anywhere";
    v.style.whiteSpace = "pre-wrap";

    const b = document.createElement("button");
    b.textContent = "📋";
    Object.assign(b.style, {
      background: "#f5c518",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer",
      minWidth: "32px",
    });
    b.onclick = () => copyText(value || "");

    line.append(l, v, b);
    return line;
  }

  function makeImageBlock(title, url) {
    const w = document.createElement("div");
    w.style.textAlign = "center";
    w.style.margin = "12px 0";

    const titleEl = document.createElement("div");
    titleEl.textContent = title;
    titleEl.style.fontWeight = "bold";
    titleEl.style.marginBottom = "6px";

    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    img.style.background = "#111";

    const b = document.createElement("button");
    b.textContent = "📋 Копировать картинку";
    b.style.margin = "6px 0";
    b.onclick = () => copyImage(url, b);

    w.append(titleEl, img, b, makeLine(title + " URL", url));
    return w;
  }

  const modal = document.createElement("div");
  modal.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:10001";

  const box = document.createElement("div");
  box.style.cssText =
    "background:#1c1c1c;color:#fff;border-radius:10px;padding:20px;width:650px;max-width:95vw;max-height:90vh;overflow:auto";

  const body = document.createElement("div");

  const close = document.createElement("button");
  close.textContent = "✖ Закрыть";
  close.style.cssText =
    "display:block;margin:10px auto 0;padding:8px 14px;background:#f5c518;border:none;border-radius:6px;cursor:pointer";
  close.onclick = () => (modal.style.display = "none");

  const title = document.createElement("h2");
  title.textContent = "📋 BookMyShow данные";
  title.style.textAlign = "center";

  box.append(title, body, close);
  modal.appendChild(box);

  modal.onclick = e => {
    if (e.target === modal) modal.style.display = "none";
  };

  const btn = document.createElement("button");
  btn.textContent = "📋 BMS";
  Object.assign(btn.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: 10000,
    background: "#f5c518",
    border: "none",
    borderRadius: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: "bold",
  });

  btn.onclick = async () => {
    await waitForPageUpdate();

    const d = getData();
    body.replaceChildren();

    [
      ["BookMyShow ID", d.id],
      ["Название", d.title],
      ["Оригинальное название", d.original],
      ["Рейтинг", d.rating],
      ["Голоса / интерес", d.votes],
      ["Отзывы", d.reviews],
      ["Описание", d.description],
      ["Жанр", d.genre],
      ["Язык", d.language],
      ["Формат", d.format],
      ["Возрастной рейтинг", d.censor],
      ["Статус", d.bookStatus],
      ["Страна", d.country],
      ["Год", d.year],
      ["Дата релиза", d.releaseDate],
      ["Длительность", d.duration],
      ["Актёры", d.actors],
      ["Режиссёр", d.director],
      ["Продюсер", d.producer],
      ["Presenter", d.presenter],
      ["Музыка", d.music],
      ["Трейлеры", d.trailer],
      ["Студия", d.studio],
    ].forEach(([l, v]) => body.appendChild(makeLine(l, v)));

    if (d.poster) body.appendChild(makeImageBlock("Постер", d.poster));
    if (d.banner) body.appendChild(makeImageBlock("Баннер", d.banner));

    modal.style.display = "flex";
  };

  document.body.append(modal, btn);
})();