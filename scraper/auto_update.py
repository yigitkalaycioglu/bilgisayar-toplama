#!/usr/bin/env python3
"""Günlük otomatik güncelleme: epey.com'dan veriyi çeker, derler ve GitHub'a gönderir.

epey.com, GitHub Actions gibi veri merkezi sunucularından gelen istekleri engellediği için
bu betik sahibinin kendi bilgisayarında Windows Görev Zamanlayıcı ile her gün çalıştırılır
(kurulum: scraper/install_task.ps1). Pencere açmadan çalışır, çıktısı scraper/auto_update.log
dosyasına yazılır. Herhangi bir adım başarısız olursa hiçbir şey gönderilmez.
"""

import os
import subprocess
import sys
import time
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, "scraper", "auto_update.log")
LOCK = os.path.join(ROOT, "scraper", "auto_update.lock")
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def log(msg):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def run(args, check=True):
    log("$ " + " ".join(args))
    p = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", creationflags=NO_WINDOW, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    out = (p.stdout or "") + (p.stderr or "")
    tail = out.strip().splitlines()[-25:]
    for ln in tail:
        log("  " + ln)
    if check and p.returncode != 0:
        raise RuntimeError(f"komut başarısız ({p.returncode}): {' '.join(args)}")
    return p


def trim_log(max_lines=3000):
    try:
        with open(LOG, encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) > max_lines:
            with open(LOG, "w", encoding="utf-8") as f:
                f.writelines(lines[-max_lines:])
    except OSError:
        pass


def main():
    # aynı anda iki kez çalışmasın (6 saatten eski kilit bayat sayılır)
    if os.path.exists(LOCK) and time.time() - os.path.getmtime(LOCK) < 6 * 3600:
        log("başka bir güncelleme sürüyor, çıkılıyor")
        return 0
    open(LOCK, "w").close()
    py = sys.executable.replace("pythonw.exe", "python.exe")
    try:
        log("=== güncelleme başladı ===")
        run(["git", "pull", "--rebase", "--autostash", "origin", "main"])
        run([py, "scraper/epey_scraper.py", "--refresh-days", "45", "--max-refresh", "150"])
        run([py, "scraper/build_data.py"])
        run(["git", "add", "data", "scraper/cache"])
        if run(["git", "diff", "--cached", "--quiet"], check=False).returncode == 0:
            log("değişiklik yok")
        else:
            run(["git", "commit", "-m", f"Veriler güncellendi ({datetime.now():%Y-%m-%d})"])
            run(["git", "push", "origin", "main"])
            log("gönderildi; GitHub Pages siteyi birkaç dakika içinde yeniler")
        log("=== bitti ===")
        return 0
    except Exception as e:  # noqa: BLE001
        log(f"HATA: {e}")
        return 1
    finally:
        try:
            os.remove(LOCK)
        except OSError:
            pass
        trim_log()


if __name__ == "__main__":
    sys.exit(main())
