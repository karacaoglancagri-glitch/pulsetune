const $ = (sel) => document.querySelector(sel);

const form = $("#searchForm");
const qInput = $("#q");
const resultsGrid = $("#resultsGrid");
const resultsMeta = $("#resultsMeta");

const sourceSelect = $("#sourceSelect");
const segBtns = Array.from(document.querySelectorAll(".segBtn"));

const historyChips = $("#historyChips");
const clearHistoryBtn = $("#clearHistory");

const favoritesBox = $("#favorites");
const clearFavBtn = $("#clearFav");
const healthLine = $("#healthLine");

const HISTORY_KEY = "pulsetune_history_v1";
const FAV_KEY = "pulsetune_favs_v1";

let currentSource = "all";
let lastResults = [];

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setSource(src) {
  currentSource = src;
  // seg
  segBtns.forEach(b => b.classList.toggle("active", b.dataset.source === src));
  // select
  sourceSelect.value = src;
}

sourceSelect.addEventListener("change", () => setSource(sourceSelect.value));
segBtns.forEach(btn => btn.addEventListener("click", () => setSource(btn.dataset.source)));

document.addEventListener("click", (e) => {
  const chip = e.target.closest(".chipBtn");
  if (!chip) return;
  const qq = chip.dataset.q;
  if (!qq) return;
  qInput.value = qq;
  doSearch(qq, currentSource);
});

clearHistoryBtn.addEventListener("click", () => {
  saveJSON(HISTORY_KEY, []);
  renderHistory();
});

clearFavBtn.addEventListener("click", () => {
  saveJSON(FAV_KEY, []);
  renderFavorites();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = qInput.value.trim();
  if (!q) return;
  doSearch(q, currentSource);
});

async function checkHealth() {
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    const data = await r.json();
    const sp = data.spotify_configured ? "Spotify hazır" : "Spotify anahtar yok (demo açık)";
    const yt = data.youtube_configured ? "YouTube hazır" : "YouTube anahtar yok (demo açık)";
    healthLine.textContent = `${sp} • ${yt}`;
  } catch {
    healthLine.textContent = "Bağlantı kontrolü yapılamadı.";
  }
}

function pushHistory(q) {
  const list = loadJSON(HISTORY_KEY, []);
  const cleaned = q.trim();
  const next = [cleaned, ...list.filter(x => x !== cleaned)].slice(0, 12);
  saveJSON(HISTORY_KEY, next);
  renderHistory();
}

function renderHistory() {
  const list = loadJSON(HISTORY_KEY, []);
  historyChips.innerHTML = "";
  if (!list.length) {
    const div = document.createElement("div");
    div.className = "notice";
    div.textContent = "Henüz geçmiş yok. Bir şey ara, burada görünsün.";
    historyChips.appendChild(div);
    return;
  }
  list.forEach(q => {
    const b = document.createElement("button");
    b.className = "chipBtn";
    b.textContent = `+ ${q}`;
    b.dataset.q = q;
    historyChips.appendChild(b);
  });
}

function getFavs() {
  return loadJSON(FAV_KEY, []);
}
function isFav(id) {
  return getFavs().some(x => x.id === id);
}
function toggleFav(item) {
  const favs = getFavs();
  const idx = favs.findIndex(x => x.id === item.id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.unshift(item);
  saveJSON(FAV_KEY, favs.slice(0, 50));
  renderFavorites();
  renderResults(lastResults); // yıldızı güncelle
}

function renderFavorites() {
  const favs = getFavs();
  favoritesBox.innerHTML = "";
  $("#favHint").style.display = favs.length ? "none" : "block";

  favs.forEach(item => favoritesBox.appendChild(buildCard(item, true)));
}

function actionLabel(item) {
  if (item.source === "youtube") return "İzle";
  return "Aç";
}

function buildCard(item, inFavorites=false) {
  const card = document.createElement("div");
  card.className = "card";

  const media = document.createElement("div");
  media.className = "media";

  const img = document.createElement("img");
  img.alt = item.title || "Kapak";
  img.loading = "lazy";
  img.src = item.image || "";
  media.appendChild(img);

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = item.source === "youtube" ? "YouTube" : "Spotify";
  media.appendChild(badge);

  const star = document.createElement("div");
  star.className = "star" + (isFav(item.id) ? " on" : "");
  star.textContent = "★";
  star.title = isFav(item.id) ? "Favoriden çıkar" : "Favoriye ekle";
  star.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFav(item);
  });
  media.appendChild(star);

  const body = document.createElement("div");
  body.className = "cardBody";

  const title = document.createElement("p");
  title.className = "title";
  title.textContent = item.title || "";
  body.appendChild(title);

  const sub = document.createElement("p");
  sub.className = "sub";
  sub.textContent = item.subtitle || "";
  body.appendChild(sub);

  const actions = document.createElement("div");
  actions.className = "actions";

  const openBtn = document.createElement("button");
  openBtn.className = "btn";
  openBtn.type = "button";
  openBtn.textContent = actionLabel(item);
  openBtn.addEventListener("click", () => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  });
  actions.appendChild(openBtn);

  body.appendChild(actions);

  card.appendChild(media);
  card.appendChild(body);

  // Kartın tamamına tıklayınca da aç
  card.addEventListener("click", () => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  });

  return card;
}

function renderResults(items) {
  lastResults = items || [];
  resultsGrid.innerHTML = "";

  if (!items || !items.length) {
    const div = document.createElement("div");
    div.className = "notice";
    div.style.gridColumn = "1 / -1";
    div.innerHTML = `
      <b>Henüz sonuç yok</b><br/>
      Bir arama yap, Spotify/YouTube’dan öneriler gelsin.
    `;
    resultsGrid.appendChild(div);
    return;
  }

  items.forEach(item => resultsGrid.appendChild(buildCard(item)));
}

async function doSearch(q, source) {
  const limit = 12;
  resultsMeta.textContent = "Aranıyor…";
  resultsGrid.innerHTML = "";

  pushHistory(q);

  const url = `/api/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}&limit=${limit}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const data = await r.json();

    if (!r.ok || !data.ok) {
      resultsMeta.textContent = "Hata oluştu.";
      renderResults([]);
      return;
    }

    const res = data.results || [];
    resultsMeta.textContent = `${res.length} sonuç`;
    renderResults(res);
  } catch (e) {
    resultsMeta.textContent = "Bağlantı hatası.";
    renderResults([]);
  }
}

// init
setSource("all");
renderHistory();
renderFavorites();
checkHealth();
