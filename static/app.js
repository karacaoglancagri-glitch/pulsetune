// ---------- Elements
const qInput = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");

const grid = document.getElementById("grid");
const favGrid = document.getElementById("favGrid");

const statusText = document.getElementById("statusText");
const errorBox = document.getElementById("errorBox");
const emptyState = document.getElementById("emptyState");

const quickChips = document.getElementById("quickChips");
const historyChips = document.getElementById("historyChips");
const clearHistoryBtn = document.getElementById("clearHistory");
const clearFavsBtn = document.getElementById("clearFavs");
const favEmpty = document.getElementById("favEmpty");

const emptyChips = document.getElementById("emptyChips");
const favHintChips = document.getElementById("favHintChips");

const healthDot = document.getElementById("healthDot");
const healthText = document.getElementById("healthText");

// ---------- State
let selectedSource = "all";

// Sayfada tek bir YouTube embed açık kalsın
let openYouTube = { wrap: null, btn: null };

// ---------- Suggestions
const quick = [
  "lofi ders",
  "enerjik spor",
  "hüzünlü yağmur gece",
  "sakin uyku",
  "2000'ler pop",
  "trap sert",
  "romantik akşam",
];

// ---------- Storage
const LS_HISTORY = "pulsetune_history_v1";
const LS_FAVS = "pulsetune_favs_v1";

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- UI helpers
function setError(msg) {
  if (!msg) {
    errorBox.hidden = true;
    errorBox.textContent = "";
    return;
  }
  errorBox.hidden = false;
  errorBox.textContent = msg;
}
function setEmpty(show) {
  emptyState.style.display = show ? "block" : "none";
}
function sourceBadge(source) {
  return source === "spotify" ? "Spotify" : "YouTube";
}

// ---------- Skeletons
function renderSkeletons(count = 6) {
  grid.innerHTML = "";
  setEmpty(false);
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "skel shimmer";
    s.innerHTML = `
      <div class="skelTop"></div>
      <div class="skelBody">
        <div class="skelLine" style="width: 78%"></div>
        <div class="skelLine" style="width: 52%"></div>
        <div class="skelLine" style="width: 65%"></div>
      </div>
    `;
    grid.appendChild(s);
  }
}

// ---------- History
function getHistory() {
  return loadJSON(LS_HISTORY, []);
}
function pushHistory(q) {
  const cleaned = (q || "").trim();
  if (!cleaned) return;
  const h = getHistory();
  const next = [cleaned, ...h.filter((x) => x !== cleaned)].slice(0, 12);
  saveJSON(LS_HISTORY, next);
  renderHistory();
}
function clearHistory() {
  saveJSON(LS_HISTORY, []);
  renderHistory();
}
function renderHistory() {
  const h = getHistory();
  historyChips.innerHTML = "";

  if (h.length === 0) {
    const e = document.createElement("div");
    e.className = "chip is-empty";
    e.textContent = "Henüz geçmiş yok";
    historyChips.appendChild(e);
    return;
  }

  for (const item of h) {
    const el = document.createElement("div");
    el.className = "chip";
    el.textContent = item;
    el.addEventListener("click", () => {
      qInput.value = item;
      search();
    });
    historyChips.appendChild(el);
  }
}

// ---------- Favorites
function favKey(item) {
  const id = item.id || `${item.title}__${item.subtitle}`;
  return `${item.source}:${id}`;
}
function getFavs() {
  return loadJSON(LS_FAVS, {});
}
function setFavs(obj) {
  saveJSON(LS_FAVS, obj);
}
function isFav(item) {
  const f = getFavs();
  return Boolean(f[favKey(item)]);
}
function toggleFav(item) {
  const f = getFavs();
  const k = favKey(item);
  if (f[k]) delete f[k];
  else f[k] = item;
  setFavs(f);
  renderFavs();
}
function clearFavs() {
  setFavs({});
  renderFavs();
}
function renderFavs() {
  const f = getFavs();
  const arr = Object.values(f);

  favGrid.innerHTML = "";
  if (arr.length === 0) {
    favEmpty.style.display = "block";
    return;
  }
  favEmpty.style.display = "none";

  for (const item of arr) {
    favGrid.appendChild(createCard(item));
  }
}

// ---------- YouTube embed (single open)
function youtubeEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
function closeOpenYouTube() {
  if (!openYouTube.wrap) return;

  const iframe = openYouTube.wrap.querySelector("iframe");
  if (iframe) {
    const src = iframe.getAttribute("src");
    iframe.setAttribute("src", src); // stop video
  }
  openYouTube.wrap.style.display = "none";
  if (openYouTube.btn) openYouTube.btn.textContent = "İzle";
  openYouTube = { wrap: null, btn: null };
}

// ---------- Cards
function createCard(item) {
  const div = document.createElement("div");
  div.className = "card";

  const thumb = document.createElement("div");
  thumb.className = "thumb";

  const img = document.createElement("img");
  img.alt = item.title || "";
  img.src = item.image || "";
  thumb.appendChild(img);

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = sourceBadge(item.source);
  thumb.appendChild(badge);

  const fav = document.createElement("button");
  fav.className = "favBtn" + (isFav(item) ? " on" : "");
  fav.title = isFav(item) ? "Favoriden çıkar" : "Favoriye ekle";
  fav.textContent = "★";
  fav.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFav(item);
    fav.className = "favBtn" + (isFav(item) ? " on" : "");
    fav.title = isFav(item) ? "Favoriden çıkar" : "Favoriye ekle";
  });
  thumb.appendChild(fav);

  const meta = document.createElement("div");
  meta.className = "meta";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = item.title || "—";

  const sub = document.createElement("div");
  sub.className = "subline";
  sub.textContent = item.subtitle || "";

  const actions = document.createElement("div");
  actions.className = "actions";

  const open = document.createElement("a");
  open.className = "a";
  open.href = item.url || "#";
  open.target = "_blank";
  open.rel = "noopener";
  open.textContent = "Aç";
  actions.appendChild(open);

  // Spotify preview (varsa)
  let audio = null;
  if (item.source === "spotify" && item.preview) {
    const play = document.createElement("button");
    play.className = "play";
    play.textContent = "▶";
    play.title = "Preview çal";

    audio = document.createElement("audio");
    audio.className = "preview";
    audio.src = item.preview;

    let shown = false;
    play.addEventListener("click", async () => {
      try {
        if (!shown) {
          audio.style.display = "block";
          shown = true;
        }
        if (audio.paused) {
          await audio.play();
          play.textContent = "⏸";
        } else {
          audio.pause();
          play.textContent = "▶";
        }
      } catch {}
    });

    audio.addEventListener("ended", () => (play.textContent = "▶"));
    actions.appendChild(play);
  }

  // YouTube izleme (embed) + tek açık
  let embedWrap = null;
  if (item.source === "youtube" && item.id) {
    const watch = document.createElement("button");
    watch.className = "play";
    watch.textContent = "İzle";
    watch.title = "Site içinde izle";

    embedWrap = document.createElement("div");
    embedWrap.className = "embedWrap";
    embedWrap.innerHTML = `
      <iframe
        src="${youtubeEmbedUrl(item.id)}"
        title="YouTube video"
        frameborder="0"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen>
      </iframe>
    `;

    watch.addEventListener("click", () => {
      const isOpen = embedWrap.style.display === "block";

      if (!isOpen) closeOpenYouTube();

      if (isOpen) {
        const iframe = embedWrap.querySelector("iframe");
        if (iframe) {
          const src = iframe.getAttribute("src");
          iframe.setAttribute("src", src);
        }
        embedWrap.style.display = "none";
        watch.textContent = "İzle";
        openYouTube = { wrap: null, btn: null };
      } else {
        embedWrap.style.display = "block";
        watch.textContent = "Kapat";
        openYouTube = { wrap: embedWrap, btn: watch };
      }
    });

    actions.appendChild(watch);
  } else {
    // Spotify için ikinci kolon boş kalmasın diye küçük placeholder (opsiyonel)
    const ghost = document.createElement("div");
    ghost.style.opacity = "0";
    ghost.textContent = ".";
    actions.appendChild(ghost);
  }

  meta.appendChild(title);
  meta.appendChild(sub);
  meta.appendChild(actions);
  if (audio) meta.appendChild(audio);
  if (embedWrap) meta.appendChild(embedWrap);

  div.appendChild(thumb);
  div.appendChild(meta);
  return div;
}

// ---------- Render results
function renderResults(results) {
  closeOpenYouTube();
  grid.innerHTML = "";

  if (!results || results.length === 0) {
    setEmpty(true);
    return;
  }

  setEmpty(false);
  for (const item of results) {
    grid.appendChild(createCard(item));
  }
}

// ---------- Health check
async function healthCheck() {
  try {
    const r = await fetch("/api/health");
    const j = await r.json();

    if (j.ok) {
      const s = j.spotify_configured ? "Spotify ✓" : "Spotify ✕";
      const y = j.youtube_configured ? "YouTube ✓" : "YouTube ✕";
      healthText.textContent = `${s} • ${y}`;

      if (j.spotify_configured && j.youtube_configured) {
        healthDot.classList.add("ok");
        healthDot.classList.remove("bad");
      } else {
        healthDot.classList.add("bad");
        healthDot.classList.remove("ok");
      }
      return;
    }
  } catch {}

  healthText.textContent = "Sunucuya ulaşılamadı";
  healthDot.classList.add("bad");
  healthDot.classList.remove("ok");
}

// ---------- Search
async function search() {
  const q = (qInput.value || "").trim();
  if (!q) return;

  setError(null);
  statusText.textContent = "Aranıyor...";
  btnSearch.disabled = true;

  renderSkeletons(6);

  try {
    const params = new URLSearchParams({ q, source: selectedSource, limit: "12" });
    const r = await fetch(`/api/search?${params.toString()}`);
    const j = await r.json();

    if (!r.ok) {
      setError(j.error || "Bir hata oldu.");
      renderResults([]);
      statusText.textContent = "";
      return;
    }

    if (j.error) setError(j.error);
    else setError(null);

    pushHistory(q);
    renderResults(j.results || []);
    statusText.textContent = `${(j.results || []).length} sonuç`;
  } catch {
    setError("Sunucu hatası / bağlantı hatası.");
    renderResults([]);
    statusText.textContent = "";
  } finally {
    btnSearch.disabled = false;
  }
}

// ---------- Source buttons
function setupSourceButtons() {
  document.querySelectorAll(".segBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".segBtn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedSource = btn.dataset.source || "all";
    });
  });
}

// ---------- Chips builders
function buildChips(containerEl, items, onClick) {
  containerEl.innerHTML = "";
  for (const text of items) {
    const el = document.createElement("div");
    el.className = "chip";
    el.textContent = text;
    el.addEventListener("click", () => onClick(text));
    containerEl.appendChild(el);
  }
}

function setupChips() {
  // soldaki quick
  buildChips(quickChips, quick, (text) => {
    qInput.value = text;
    qInput.focus();
    search();
  });

  // sağdaki empty state chipleri
  buildChips(emptyChips, ["hüzünlü yağmur gece", "enerjik spor", "lofi ders"], (text) => {
    qInput.value = text;
    qInput.focus();
    search();
  });

  // favori boşken mini hint chipleri
  buildChips(favHintChips, ["akşam chill", "motivasyon", "yol müziği"], (text) => {
    qInput.value = text;
    qInput.focus();
    search();
  });
}

// ---------- Events
btnSearch.addEventListener("click", search);
qInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") search();
});
clearHistoryBtn.addEventListener("click", clearHistory);
clearFavsBtn.addEventListener("click", clearFavs);

// ---------- Init
setupSourceButtons();
setupChips();
renderHistory();
renderFavs();
setEmpty(true);
healthCheck();
