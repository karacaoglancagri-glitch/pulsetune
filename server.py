import os
import time
import sqlite3
import requests
from urllib.parse import quote_plus

from flask import Flask, request, jsonify, send_from_directory, Response

app = Flask(__name__, static_folder="static", static_url_path="")

DB_PATH = os.path.join(os.path.dirname(__file__), "app.db")

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "change-me")

# Anahtar yoksa bile hata göstermeden demo sonuçlar
DEMO_FALLBACK = os.getenv("DEMO_FALLBACK", "1").strip() != "0"

_spotify_token = {"access_token": None, "expires_at": 0}


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


def basic_auth_required():
    auth = request.authorization
    if not auth or auth.username != ADMIN_USER or auth.password != ADMIN_PASS:
        return Response("Unauthorized", 401, {"WWW-Authenticate": 'Basic realm="Admin Panel"'})
    return None


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
    results.sort(key=lambda r: (0 if qlow in (r.get("title") or "").lower() else 1, r.get("source"), r.get("title")))
    return jsonify({"ok": True, "error": None, "results": results})


@app.get("/_admin")
def admin_panel():
    denied = basic_auth_required()
    if denied:
        return denied

    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT q, source, ip, user_agent, created_at FROM search_logs ORDER BY id DESC LIMIT 200")
    rows = cur.fetchall()
    conn.close()

    def esc(s):
        return (
            (s or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#039;")
        )

    html_rows = []
    for r in rows:
        ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(int(r["created_at"])))
        html_rows.append(
            f"""
            <tr>
              <td>{esc(ts)}</td>
              <td>{esc(r['source'])}</td>
              <td>{esc(r['q'])}</td>
              <td>{esc(r['ip'])}</td>
              <td>{esc(r['user_agent'])}</td>
            </tr>
            """
        )

    return Response(
        f"""
        <!doctype html>
        <html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>Admin</title>
        <style>
          body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:24px;background:#0b1020;color:#fff}}
          table{{width:100%;border-collapse:collapse}}
          th,td{{border-bottom:1px solid rgba(255,255,255,.12);padding:10px;text-align:left;font-size:13px;vertical-align:top}}
          th{{color:rgba(255,255,255,.8)}}
          td{{color:rgba(255,255,255,.9)}}
        </style></head>
        <body>
          <h2>Admin Panel</h2>
          <p>Son 200 arama logu</p>
          <table>
            <thead><tr><th>Zaman</th><th>Kaynak</th><th>Sorgu</th><th>IP</th><th>User-Agent</th></tr></thead>
            <tbody>
              {''.join(html_rows) if html_rows else '<tr><td colspan="5">Log yok.</td></tr>'}
            </tbody>
          </table>
        </body></html>
        """,
        mimetype="text/html",
    )


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
