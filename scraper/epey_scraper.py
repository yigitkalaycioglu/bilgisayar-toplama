#!/usr/bin/env python3
"""epey.com bilgisayar parçası toplayıcı.

Yalnızca robots.txt'in izin verdiği yolları kullanır:
  - kategori liste sayfaları:  https://www.epey.com/<kategori>/  ve  /<kategori>/<n>/
  - ürün detay sayfaları:      https://www.epey.com/<kategori>/<urun>.html

Akış:
  1. Her kategorinin liste sayfaları sırayla gezilir. Epey varsayılan sıralamada fiyatı
     olan ürünleri önce gösterdiği için, hiç fiyatlı ürün içermeyen ilk sayfada durulur.
  2. Önbellekte olmayan (ya da --refresh-days'ten eski) her fiyatlı ürünün detay sayfası
     indirilir ve tüm teknik özellikleri ham hâliyle  cache/<kategori>.jsonl  içine yazılır.
  3. Fiyatlar her çalışmada liste sayfalarından tazelenir: cache/<kategori>_list.json

Ardından  build_data.py  bu ham veriyi sitenin kullandığı sade JSON dosyalarına dönüştürür.
Sadece standart kütüphane kullanılır.
"""

import argparse
import gzip
import html
import json
import os
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

BASE = "https://www.epey.com"
USER_AGENT = (
    "Mozilla/5.0 (compatible; BilgisayarToplamaBot/1.0; "
    "+https://github.com/yigitkalaycioglu/bilgisayar-toplama)"
)

# site anahtarı -> epey kategori adresi
CATEGORIES = {
    "cpu": "islemci",
    "mobo": "anakart",
    "gpu": "ekran-karti",
    "ram": "bellek-ram",
    "storage": "sabit-disk",
    "psu": "power-supply-psu",
    "case": "bilgisayar-kasasi",
    "cooler": "islemci-sogutucu",
}

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "cache")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


class RateLimiter:
    """Tüm iş parçacıkları arasında iki istek arasında en az `interval` saniye bırakır.

    Sunucu 429 döndürürse herkes birlikte bekler ve aralık kalıcı olarak büyütülür;
    uzun süre sorunsuz giderse aralık yavaşça başlangıç değerine döner.
    """

    def __init__(self, interval):
        self.base = interval
        self.interval = interval
        self.lock = threading.Lock()
        self.next_time = 0.0
        self.ok_streak = 0

    def wait(self):
        with self.lock:
            now = time.monotonic()
            t = max(now, self.next_time)
            self.next_time = t + self.interval * random.uniform(0.85, 1.25)
        delay = t - time.monotonic()
        if delay > 0:
            time.sleep(delay)

    def success(self):
        with self.lock:
            self.ok_streak += 1
            if self.ok_streak >= 200 and self.interval > self.base:
                self.interval = max(self.base, self.interval * 0.9)
                self.ok_streak = 0

    def throttled(self, pause):
        with self.lock:
            self.ok_streak = 0
            self.interval = min(self.interval * 1.3, 10.0)
            self.next_time = max(self.next_time, time.monotonic() + pause)
            return self.interval


class Fetcher:
    def __init__(self, interval):
        self.limiter = RateLimiter(interval)
        self.count = 0
        self.errors = 0
        self.lock = threading.Lock()

    def get(self, url, tries=6):
        last = None
        for attempt in range(tries):
            self.limiter.wait()
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "tr-TR,tr;q=0.9",
                    "Accept-Encoding": "gzip",
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=40) as r:
                    data = r.read()
                    if r.headers.get("Content-Encoding") == "gzip":
                        data = gzip.decompress(data)
                with self.lock:
                    self.count += 1
                self.limiter.success()
                return data.decode("utf-8", errors="replace")
            except urllib.error.HTTPError as e:
                last = e
                if e.code == 404:
                    return None
                if e.code in (403, 429) or e.code >= 500:
                    try:
                        retry_after = float(e.headers.get("Retry-After") or 0)
                    except ValueError:
                        retry_after = 0
                    pause = max(retry_after, 20 * (attempt + 1))
                    new_iv = self.limiter.throttled(pause)
                    log(f"  HTTP {e.code} {url} -> herkes {pause:.0f}s bekliyor, yeni aralık {new_iv:.2f}s")
                    continue
                raise
            except Exception as e:  # ağ hataları
                last = e
                wait = (2 ** attempt) * 5
                log(f"  hata {e!r} {url} -> {wait}s bekleniyor")
                time.sleep(wait)
        with self.lock:
            self.errors += 1
        log(f"  VAZGEÇİLDİ {url}: {last!r}")
        return None


def clean(s):
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def parse_price(text):
    m = re.search(r"([\d\.]+(?:,\d+)?)\s*TL", text)
    if not m:
        return None
    return float(m.group(1).replace(".", "").replace(",", "."))


ROW_RE = re.compile(r'<ul id="(\d+)" class="metin row">(.*?)</ul>', re.S)


def parse_listing(page_html):
    rows = []
    for pid, body in ROW_RE.findall(page_html):
        a = re.search(r'<a href="([^"]+)" class="urunadi"[^>]*>(.*?)</a>', body, re.S)
        if not a:
            continue
        code = re.search(r'<span class="urunkodu">(.*?)</span>', body, re.S)
        img = re.search(r'<img src="([^"]+)"', body)
        price_cell = re.search(
            r'class="fiyat cell">(.*?)(?=<li class="ozellik|<li class="puan|$)', body, re.S
        )
        price_text = clean(price_cell.group(1)) if price_cell else ""
        sites = re.search(r"(\d+)\s*site", price_text)
        score = re.search(r'data-percent="(\d+)"', body)
        cols = {
            k: clean(v)
            for k, v in re.findall(r'<li class="ozellik ozellik(\d+) cell">(.*?)</li>', body, re.S)
        }
        rows.append(
            {
                "id": pid,
                "url": a.group(1),
                "name": clean(a.group(2)),
                "code": clean(code.group(1)) if code else "",
                "img": img.group(1) if img else "",
                "price": parse_price(price_text),
                "sites": int(sites.group(1)) if sites else 0,
                "score": int(score.group(1)) if score else None,
                "cols": cols,
            }
        )
    return rows


SPEC_RE = re.compile(
    r'<h3>.*?<span>(.*?)</span></h3>'
    r'|<li id="id(\d+)"[^>]*>\s*<strong[^>]*>(.*?)</strong>\s*<span class="cell[^"]*">(.*?)</span>\s*</li>',
    re.S,
)


def parse_detail(page_html):
    out = {"specs": {}, "groups": {}}
    t = re.search(r"<title>(.*?)</title>", page_html, re.S)
    if t:
        out["title"] = re.sub(r"\s*Fiyatı ve Özellikleri - Epey\s*$", "", clean(t.group(1)))
    b = page_html.find('<div id="bilgiler">')
    if b >= 0:
        e = page_html.find('id="fiyatlar"', b)
        sec = page_html[b : e if e > 0 else len(page_html)]
        group = ""
        for m in SPEC_RE.finditer(sec):
            if m.group(1) is not None:
                group = clean(m.group(1))
                continue
            label = clean(m.group(3))
            raw = m.group(4)
            vals = [clean(v) for v in re.findall(r"<span[^>]*>(.*?)</span>", raw, re.S)]
            vals = [v for v in vals if v]
            if not vals:
                c = clean(raw)
                vals = [c] if c else []
            if label in out["specs"]:
                label = f"{label} #{m.group(2)}"
            out["specs"][label] = vals
            out["groups"].setdefault(group, []).append(label)
    imgs = []
    for u in re.findall(r"https://resim\.epey\.com/\d+/m_[^\"'\s)]+\.(?:jpg|png|webp)", page_html):
        if u not in imgs:
            imgs.append(u)
    out["images"] = imgs[:6]
    return out


def load_cache(cat):
    """Ham ürün detayları: cache/<kat>.jsonl (her satır bir ürün; git farkları küçük kalsın diye)."""
    path = os.path.join(CACHE_DIR, f"{cat}.jsonl")
    data = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    rec = json.loads(line)
                    data[rec.pop("id")] = rec
        return data
    old = os.path.join(CACHE_DIR, f"{cat}.json.gz")  # eski biçim
    if os.path.exists(old):
        with gzip.open(old, "rt", encoding="utf-8") as f:
            return json.load(f)
    return data


def save_cache(cat, data):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f"{cat}.jsonl")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        for pid in sorted(data, key=lambda k: int(k) if k.isdigit() else k):
            f.write(json.dumps({"id": pid, **data[pid]}, ensure_ascii=False, sort_keys=True) + "\n")
    os.replace(tmp, path)
    old = os.path.join(CACHE_DIR, f"{cat}.json.gz")
    if os.path.exists(old):
        os.remove(old)


def crawl_listing(fetcher, slug, max_pages):
    all_rows, seen = [], set()
    page = 1
    while page <= max_pages:
        url = f"{BASE}/{slug}/" if page == 1 else f"{BASE}/{slug}/{page}/"
        text = fetcher.get(url)
        if not text:
            break
        rows = parse_listing(text)
        priced = [r for r in rows if r["price"]]
        for r in priced:
            if r["id"] not in seen:
                seen.add(r["id"])
                all_rows.append(r)
        log(f"  {slug} sayfa {page}: {len(rows)} ürün, {len(priced)} fiyatlı (toplam {len(all_rows)})")
        if not rows or not priced:
            break
        page += 1
    return all_rows


def scrape_category(fetcher, key, slug, args):
    log(f"== {key} ({slug}) ==")
    rows = crawl_listing(fetcher, slug, args.max_pages)
    if not rows:
        log(f"  {key}: liste boş geldi, önceki veriler korunuyor")
        return False
    listing = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rows": rows,
    }
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(os.path.join(CACHE_DIR, f"{key}_list.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(listing, f, ensure_ascii=False, indent=0)

    cache = load_cache(key)
    now = time.time()
    todo = []
    for r in rows:
        c = cache.get(r["id"])
        if not c or not c.get("specs"):
            todo.append(r)
        elif args.refresh_days and now - c.get("ts", 0) > args.refresh_days * 86400:
            todo.append(r)
    if args.max_new is not None:
        todo = todo[: args.max_new]
    log(f"  {key}: {len(rows)} fiyatlı ürün, {len(todo)} detay sayfası indirilecek")

    done = 0
    lock = threading.Lock()

    def work(r):
        text = fetcher.get(r["url"])
        if not text:
            return r, None
        return r, parse_detail(text)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(work, r) for r in todo]
        for fut in as_completed(futs):
            r, det = fut.result()
            with lock:
                done += 1
                if det and det["specs"]:
                    det["ts"] = int(time.time())
                    det["url"] = r["url"]
                    cache[r["id"]] = det
                if done % 50 == 0 or done == len(todo):
                    save_cache(key, cache)
                    log(f"  {key}: {done}/{len(todo)} detay (istek: {fetcher.count}, hata: {fetcher.errors})")
    save_cache(key, cache)
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("categories", nargs="*", help="anahtarlar: " + ", ".join(CATEGORIES))
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--interval", type=float, default=1.0, help="istekler arası asgari süre (sn)")
    ap.add_argument("--max-pages", type=int, default=400)
    ap.add_argument("--max-new", type=int, default=None, help="kategori başına en fazla yeni detay")
    ap.add_argument("--refresh-days", type=float, default=0, help="bu kadar günden eski detayları yenile (0=asla)")
    args = ap.parse_args()

    cats = args.categories or list(CATEGORIES)
    for c in cats:
        if c not in CATEGORIES:
            ap.error(f"bilinmeyen kategori: {c}")
    fetcher = Fetcher(args.interval)
    ok = 0
    start = time.time()
    for key in cats:
        if scrape_category(fetcher, key, CATEGORIES[key], args):
            ok += 1
    log(f"bitti: {ok}/{len(cats)} kategori, {fetcher.count} istek, {fetcher.errors} hata, {time.time() - start:.0f} sn")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
