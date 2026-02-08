import os
import time
import sqlite3
import base64
import requests
from functools import wraps
from urllib.parse import quote_plus

from flask import Flask, request, jsonify, send_from_directory, Response

app = Flask(__name__, static_folder="static", static_url_path="")

DB_PATH = os.path.join(os.path.dirname(__file__), "app.db")

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()

# Admin Basic Auth (Render env)
ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "change-me")

# Admin path (gizlilik) -> Render env ile değiştir: ADMIN_PATH="x9k2p"
ADMIN_PATH = os.getenv("ADMIN_PATH", "_admin")

# Anahtar yoksa bile hata göstermeden demo sonuçlar
DEMO_FALLBACK = os.getenv("DEMO_FALLBACK", "1").strip() != "0"

_spotify_token = {"access_token": None, "expires_at": 0}


# ---------------- DB
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS search_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            q TEXT NOT NULL,
            source TEXT NOT NULL,
            ip TEXT NOT NULL,
            user_agent TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()
# Render/Gunicorn için: uygulama import edilince DB hazır olsun
try:
    init_db()
except Exception as e:
    print("init_db failed:", e)
def log_search(q: str, source: str):
    try:
        conn = db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO search_logs (q, source, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                q[:500],
                source[:30],
                request.headers.get("X-Forwarded-For", request.remote_addr or "")[:100],
                (request.headers.get("User-Agent", "") or "")[:300],
                int(time.time()),
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


# ---------------- Admin Auth (Basic)
def _basic_auth_ok() -> bool:
    """
    request.authorization Render arkasında bazen boş gelebiliyor.
    Bu yüzden Authorization header'ı elle parse ediyoruz.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Basic "):
        return False
    try:
        raw = base64.b64decode(auth.split(" ", 1)[1]).decode("utf-8")
        user, pw = raw.split(":", 1)
        return bool(user) and bool(pw) and user == ADMIN_USER and pw == ADMIN_PASS
    except Exception:
        return False


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # Env ile admin ayarlanmadıysa kapalı tut (güvenlik)
        if not ADMIN_USER or not ADMIN_PASS:
            return jsonify(ok=False, error="Admin is not configured"), 403

        if not _basic_auth_ok():
            return Response(
                "Unauthorized",
                401,
                {"WWW-Authenticate": 'Basic realm="PulseTune Admin"'},
            )
        return fn(*args, **kwargs)

    return wrapper


# ---------------- Search helpers
def spotify_search_url(q: str) -> str:
    return f"https://open.spotify.com/search/{quote_plus(q)}"


def youtube_search_url(q: str) -> str:
    return f"https://www.youtube.com/results?search_query={quote_plus(q)}"


def demo_results(q: str, source: str, limit: int):
    q = q.strip() or "music"
    sp_url = spotify_search_url(q)
    yt_url = youtube_search_url(q)

    base = [
        {
            "source": "spotify",
            "type": "track",
            "id": "demo_sp_1",
            "title": f"{q} • Night Drive (Demo)",
            "subtitle": "PulseTune Studio",
            "image": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=60",
            "url": sp_url,
            "preview": "",
        },
        {
            "source": "spotify",
            "type": "track",
            "id": "demo_sp_2",
            "title": f"{q} • Soft Mood (Demo)",
            "subtitle": "Neon Waves",
            "image": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=60",
            "url": sp_url,
            "preview": "",
        },
        {
            "source": "youtube",
            "type": "video",
            "id": "demo_yt_1",
            "title": f"{q} • Chill Mix (Demo)",
            "subtitle": "PulseTune Channel",
            "image": "https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=1200&q=60",
            "url": yt_url,
            "preview": "",
        },
        {
            "source": "youtube",
            "type": "video",
            "id": "demo_yt_2",
            "title": f"{q} • Workout Boost (Demo)",
            "subtitle": "Energy Lab",
            "image": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=60",
            "url": yt_url,
            "preview": "",
        },
    ]

    if source == "spotify":
        base = [x for x in base if x["source"] == "spotify"]
    elif source == "youtube":
        base = [x for x in base if x["source"] == "youtube"]

    return base[: max(1, min(limit, 20))]


def get_spotify_token():
    now = int(time.time())
    if _spotify_token["access_token"] and now < _spotify_token["expires_at"] - 30:
        return _spotify_token["access_token"]

    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return None

    r = requests.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "client_credentials"},
        auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET),
        timeout=12,
    )
    if r.status_code != 200:
        return None

    payload = r.json()
    token = payload.get("access_token")
    expires_in = int(payload.get("expires_in", 3600))
    _spotify_token["access_token"] = token
    _spotify_token["expires_at"] = now + expires_in
    return token


def normalize_spotify_tracks(items):
    results = []
    for t in items:
        album = t.get("album") or {}
        images = album.get("images") or []
        img = images[0]["url"] if images else ""
        artists = ", ".join([a.get("name", "") for a in (t.get("artists") or [])]).strip(", ")
        results.append(
            {
                "source": "spotify",
                "type": "track",
                "id": t.get("id", ""),
                "title": t.get("name", ""),
                "subtitle": artists,
                "image": img,
                "url": (t.get("external_urls") or {}).get("spotify", ""),
                "preview": t.get("preview_url") or "",
            }
        )
    return results


def search_spotify(q: str, limit: int = 10):
    token = get_spotify_token()
    if not token:
        if DEMO_FALLBACK:
            return {"ok": True, "results": demo_results(q, "spotify", limit)}
        return {"ok": True, "results": []}

    r = requests.get(
        "https://api.spotify.com/v1/search",
        headers={"Authorization": f"Bearer {token}"},
        params={"q": q, "type": "track", "limit": max(1, min(limit, 20))},
        timeout=12,
    )
    if r.status_code != 200:
        if DEMO_FALLBACK:
            return {"ok": True, "results": demo_results(q, "spotify", limit)}
        return {"ok": True, "results": []}

    data = r.json()
    items = ((data.get("tracks") or {}).get("items")) or []
    return {"ok": True, "results": normalize_spotify_tracks(items)}


def normalize_youtube(items):
    results = []
    for it in items:
        idinfo = it.get("id") or {}
        if idinfo.get("kind") != "youtube#video":
            continue
        vid = idinfo.get("videoId", "")
        snippet = it.get("snippet") or {}
        thumbs = snippet.get("thumbnails") or {}
        img = (thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}).get("url", "")
        results.append(
            {
                "source": "youtube",
                "type": "video",
                "id": vid,
                "title": snippet.get("title", ""),
                "subtitle": snippet.get("channelTitle", ""),
                "image": img,
                "url": f"https://www.youtube.com/watch?v={vid}" if vid else "",
                "preview": "",
            }
        )
    return results


def search_youtube(q: str, limit: int = 10):
    if not YOUTUBE_API_KEY:
        if DEMO_FALLBACK:
            return {"ok": True, "results": demo_results(q, "youtube", limit)}
        return {"ok": True, "results": []}

    r = requests.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "q": q,
            "type": "video",
            "maxResults": max(1, min(limit, 20)),
            "key": YOUTUBE_API_KEY,
            "safeSearch": "strict",
        },
        timeout=12,
    )
    if r.status_code != 200:
        if DEMO_FALLBACK:
            return {"ok": True, "results": demo_results(q, "youtube", limit)}
        return {"ok": True, "results": []}

    data = r.json()
    return {"ok": True, "results": normalize_youtube(data.get("items") or [])}


# ---------------- Routes
@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/health")
def health():
    spotify_ok = bool(SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET) or DEMO_FALLBACK
    youtube_ok = bool(YOUTUBE_API_KEY) or DEMO_FALLBACK
    return jsonify({"ok": True, "spotify_configured": spotify_ok, "youtube_configured": youtube_ok})


@app.get("/api/search")
def api_search():
    q = (request.args.get("q") or "").strip()
    source = (request.args.get("source") or "all").strip().lower()
    limit = int(request.args.get("limit") or "12")

    if not q:
        return jsonify({"ok": False, "error": "Arama boş olamaz.", "results": []}), 400

    limit = max(1, min(limit, 20))
    if source not in ("all", "spotify", "youtube"):
        source = "all"

    log_search(q, source)

    results = []
    if source in ("all", "spotify"):
        results.extend(search_spotify(q, limit=limit)["results"])
    if source in ("all", "youtube"):
        results.extend(search_youtube(q, limit=limit)["results"])

    qlow = q.lower()
    results.sort(
        key=lambda r: (
            0 if qlow in (r.get("title") or "").lower() else 1,
            r.get("source"),
            r.get("title"),
        )
    )
    return jsonify({"ok": True, "error": None, "results": results})


# ---------------- New Admin (hidden path + premium admin.html)
@app.get(f"/{ADMIN_PATH}")
@admin_required
def admin_page():
    # admin arayüz dosyası
    return send_from_directory(app.static_folder, "admin.html")


@app.get(f"/{ADMIN_PATH}/health")
@admin_required
def admin_health():
    return jsonify(ok=True, service="pulsetune")


@app.get(f"/{ADMIN_PATH}/stats")
@admin_required
def admin_stats():
    """
    Son 200 arama logunu JSON döndürür.
    admin.html burayı çağırır.
    """
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT q, source, ip, user_agent, created_at FROM search_logs ORDER BY id DESC LIMIT 200")
    rows = cur.fetchall()
    conn.close()

    out = []
    for r in rows:
        out.append(
            {
                "q": r["q"],
                "source": r["source"],
                "ip": r["ip"],
                "user_agent": r["user_agent"],
                "created_at": int(r["created_at"]),
            }
        )

    return jsonify(ok=True, count=len(out), rows=out)


# ---------------- (Optional) Keep old /_admin (backward compatible)
# Eğer istersen tamamen kapatırız. Şimdilik kalsın diye aynı sayfaya yönlendirdim.
@app.get("/_admin")
def legacy_admin_redirect():
    # Eski adresi bilen varsa yeni gizli panele yönlendir (auth yine ister)
    return Response(
        f"Moved. Use /{ADMIN_PATH}",
        status=301,
        headers={"Location": f"/{ADMIN_PATH}"},
    )


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
