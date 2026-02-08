const els = {
  pillStatus: document.getElementById("pillStatus"),
  pillUpdated: document.getElementById("pillUpdated"),
  statCount: document.getElementById("statCount"),
  statSpotify: document.getElementById("statSpotify"),
  statYoutube: document.getElementById("statYoutube"),
  statAll: document.getElementById("statAll"),
  chipsTop: document.getElementById("chipsTop"),
  tbody: document.getElementById("tbody"),
  qFilter: document.getElementById("qFilter"),
  srcFilter: document.getElementById("srcFilter"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnCopy: document.getElementById("btnCopy"),
};

let LAST_JSON = null;

function fmtTime(sec){
  try{
    const d = new Date(sec * 1000);
    return d.toLocaleString();
  }catch(e){
    return String(sec);
  }
}

function srcBadge(src){
  const dotClass = src === "spotify" ? "spotify" : (src === "youtube" ? "youtube" : "all");
  const label = src || "all";
  return `<span class="src"><span class="dot ${dotClass}"></span>${label}</span>`;
}

function escapeHtml(s){
  return (s ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTopQueries(rows){
  const map = new Map();
  for(const r of rows){
    const q = (r.q || "").trim();
    if(!q) continue;
    map.set(q, (map.get(q) || 0) + 1);
  }
  const top = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 12);

  els.chipsTop.innerHTML = top.length
    ? top.map(([q,c]) => `<button class="chip" data-q="${escapeHtml(q)}">${escapeHtml(q)} <small>${c}</small></button>`).join("")
    : `<span class="muted">Henüz kayıt yok.</span>`;

  els.chipsTop.querySelectorAll(".chip").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const q = btn.getAttribute("data-q") || "";
      els.qFilter.value = q;
      applyFilters();
    });
  });
}

function renderStats(rows){
  els.statCount.textContent = rows.length;

  let sp = 0, yt = 0, all = 0;
  for(const r of rows){
    if(r.source === "spotify") sp++;
    else if(r.source === "youtube") yt++;
    else all++;
  }
  els.statSpotify.textContent = sp;
  els.statYoutube.textContent = yt;
  els.statAll.textContent = all;
}

function applyFilters(){
  if(!LAST_JSON?.rows) return;

  const qf = (els.qFilter.value || "").trim().toLowerCase();
  const sf = (els.srcFilter.value || "all").trim().toLowerCase();

  const filtered = LAST_JSON.rows.filter(r=>{
    const okSrc = (sf === "all") ? true : (String(r.source||"").toLowerCase() === sf);
    const okQ = !qf ? true : String(r.q||"").toLowerCase().includes(qf);
    return okSrc && okQ;
  });

  renderTable(filtered);
  els.pillUpdated.textContent = `${filtered.length} kayıt`;
}

function renderTable(rows){
  if(!rows.length){
    els.tbody.innerHTML = `<tr><td colspan="5" class="muted">Kayıt yok.</td></tr>`;
    return;
  }

  els.tbody.innerHTML = rows.map(r=>{
    return `
      <tr>
        <td>${escapeHtml(fmtTime(r.created_at))}</td>
        <td>${srcBadge(escapeHtml(r.source))}</td>
        <td><strong>${escapeHtml(r.q)}</strong></td>
        <td>${escapeHtml(r.ip || "")}</td>
        <td class="small">${escapeHtml(r.user_agent || "")}</td>
      </tr>
    `;
  }).join("");
}

async function load(){
  els.pillStatus.textContent = "Yükleniyor…";
  els.pillStatus.className = "pill";

  try{
    // Basic auth zaten tarayıcıya girince otomatik gönderilir.
    const res = await fetch("/_admin/stats", { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    LAST_JSON = data;

    els.pillStatus.textContent = "Bağlandı";
    els.pillStatus.className = "pill ok";

    const rows = data.rows || [];
    renderStats(rows);
    renderTopQueries(rows);
    renderTable(rows);

    els.pillUpdated.textContent = `${rows.length} kayıt`;
  }catch(err){
    els.pillStatus.textContent = "Hata";
    els.pillStatus.className = "pill bad";
    els.tbody.innerHTML = `<tr><td colspan="5" class="muted">Veri alınamadı: ${escapeHtml(err.message)}</td></tr>`;
  }
}

els.btnRefresh.addEventListener("click", load);
els.qFilter.addEventListener("input", applyFilters);
els.srcFilter.addEventListener("change", applyFilters);

els.btnCopy.addEventListener("click", async ()=>{
  try{
    const txt = JSON.stringify(LAST_JSON ?? {}, null, 2);
    await navigator.clipboard.writeText(txt);
    els.btnCopy.textContent = "Kopyalandı ✓";
    setTimeout(()=> els.btnCopy.textContent = "JSON Kopyala", 900);
  }catch(e){
    alert("Kopyalanamadı.");
  }
});

load();
