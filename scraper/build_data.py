#!/usr/bin/env python3
"""Ham epey verisini (cache/) sitenin kullandığı sade JSON dosyalarına (../data/) dönüştürür.

Her kategori için yalnızca uyumluluk kontrolü, filtreleme ve 3D model için gereken
alanlar çıkarılır; kısa anahtarlar kullanılır (açıklamalar aşağıdaki fonksiyonlarda).
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from epey_scraper import load_cache  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "..", "data")

CATS = ["cpu", "mobo", "gpu", "ram", "storage", "psu", "case", "cooler"]

# ------------------------------------------------------------------ yardımcılar

def num(s, default=None):
    """'4.2 GHz' -> 4.2, '1.300 K IOPS' gibi binlik ayırıcıları değil ilk ondalık sayıyı alır."""
    if s is None:
        return default
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(s))
    if not m:
        return default
    v = float(m.group(0).replace(",", "."))
    return int(v) if v.is_integer() else v


def intnum(s, default=None):
    v = num(s, None)
    return int(round(v)) if v is not None else default


def first(sp, *labels):
    for l in labels:
        v = sp.get(l)
        if v:
            return v[0]
    return None


def allv(sp, label):
    return sp.get(label) or []


def yes(sp, label):
    v = first(sp, label)
    return 1 if v and v.strip().lower().startswith("var") else 0


def mm(s):
    """'435 mm' -> 435, '30.5 cm' -> 305"""
    if not s:
        return None
    v = num(s)
    if v is None:
        return None
    if "cm" in s and "mm" not in s:
        v = v * 10
    return int(round(v))


def within(v, lo, hi):
    """Makul aralık dışındaki (epey'de hatalı girilmiş) ölçüleri yok say."""
    return v if v is not None and lo <= v <= hi else None


def gb(s):
    """'1 TB' -> 1000, '512 GB' -> 512"""
    if not s:
        return None
    v = num(s)
    if v is None:
        return None
    if re.search(r"\bTB\b", s, re.I):
        v = v * 1000
    elif re.search(r"\bMB\b", s, re.I):
        v = v / 1000
    return int(round(v)) if v >= 1 else v


MULTI_BRANDS = [
    "Cooler Master", "Lian Li", "Fractal Design", "be quiet!", "Be Quiet!", "Super Flower", "High Power",
    "Western Digital", "Team Group", "Silicon Power", "Thermal Grizzly", "Power Color", "Inno 3D",
    "Asus ROG", "Thermal Take", "Hiksemi", "Sapphire Pulse",
]
BRAND_FIX = {
    "asus": "Asus", "msi": "MSI", "asrock": "ASRock", "gigabyte": "Gigabyte", "aorus": "Gigabyte", "nzxt": "NZXT",
    "corsair": "Corsair", "be quiet!": "be quiet!", "deepcool": "DeepCool", "xpg": "XPG", "adata": "ADATA",
    "g.skill": "G.Skill", "gskill": "G.Skill", "wd": "WD", "western digital": "WD", "teamgroup": "TeamGroup",
    "team": "TeamGroup", "team group": "TeamGroup", "pny": "PNY", "zotac": "Zotac", "evga": "EVGA",
    "xfx": "XFX", "powercolor": "PowerColor", "power color": "PowerColor", "inno3d": "Inno3D", "inno 3d": "Inno3D",
    "asus rog": "Asus", "thermal take": "Thermaltake", "thermaltake": "Thermaltake", "hp": "HP", "amd": "AMD",
    "intel": "Intel", "nvidia": "NVIDIA", "kioxia": "Kioxia", "id-cooling": "ID-Cooling", "lexar": "Lexar",
    "gamepower": "GamePower", "gamebooster": "GameBooster", "fsp": "FSP", "mzx": "MZX",
}


def brand_of(name):
    low = name.lower()
    for b in MULTI_BRANDS:
        if low.startswith(b.lower() + " ") or low == b.lower():
            return BRAND_FIX.get(b.lower(), b)
    tok = name.split()[0] if name.split() else ""
    return BRAND_FIX.get(tok.lower(), tok[:1].upper() + tok[1:] if tok.islower() else tok)


SOCKET_ALIASES = {"STR5": "TR5", "STRX4": "TRX4", "SWRX8": "WRX8", "STR4": "TR4", "SP3": "SP3", "SP5": "SP5"}


def norm_socket(s):
    if not s:
        return None
    s = s.strip()
    m = re.match(r"(AM\d\+?|FM\d\+?|sTRX?\d+|sWRX\d+|TRX?\d+|WRX\d+|SP\d)\b", s, re.I)
    if m:
        t = m.group(1).upper().replace(" ", "")
        return SOCKET_ALIASES.get(t, t)
    m = re.match(r"LGA\s*([\d]+(?:-\d)?)", s, re.I)
    if m:
        return "LGA" + m.group(1)
    return s.upper().replace(" ", "")


FF_MAP = [
    (r"ssi[\s-]*eeb|^eeb", "SSI-EEB"), (r"ssi[\s-]*ceb|^ceb", "SSI-CEB"), (r"xl[\s-]*atx", "XL-ATX"),
    (r"e[\s-]*atx|extended", "E-ATX"), (r"micro|m[\s-]*atx|µ", "Micro ATX"), (r"mini[\s-]*dtx", "Mini DTX"),
    (r"itx", "Mini ITX"), (r"^atx|\batx\b", "ATX"),
]


def norm_ff(s):
    if not s:
        return None
    low = s.lower().strip()
    for pat, val in FF_MAP:
        if re.search(pat, low):
            return val
    return s.strip()


COLOR_NORMAL = {"siyah": "Siyah", "beyaz": "Beyaz", "gri": "Gri", "gümüş": "Gümüş", "pembe": "Pembe",
                "mavi": "Mavi", "kırmızı": "Kırmızı", "yeşil": "Yeşil", "mor": "Mor", "turuncu": "Turuncu",
                "sarı": "Sarı", "kahverengi": "Kahverengi", "lacivert": "Lacivert", "altın": "Altın",
                "bej": "Bej", "şeffaf": "Şeffaf", "ahşap": "Ahşap"}


def color_of(sp, *labels, name=""):
    vals = []
    for l in labels:
        vals = allv(sp, l)
        if vals:
            break
    if not vals:
        return None
    norm = [COLOR_NORMAL.get(v.strip().lower(), v.strip()) for v in vals]
    if len(norm) > 1:
        # "Beyaz | Siyah" gibi seçeneklerde: adı beyaz diyorsa beyaz, yoksa siyah varsayılır
        if is_white_name(name) and "Beyaz" in norm:
            return "Beyaz"
        if "Siyah" in norm:
            return "Siyah"
    return norm[0]


WHITE_HINT = re.compile(r"\b(white|beyaz|ice|glacial|snow|frost|arctic white|w)\b", re.I)


def is_white_name(name):
    return bool(re.search(r"\b(white|beyaz|ice|glacial|snow|frost)\b", name, re.I))


# ------------------------------------------------------------------ kategoriler

def norm_cpu(sp, row):
    seg = first(sp, "İşlemci Türü")
    if seg and re.search(r"diz[üu]st[üu]|mobil|laptop", seg, re.I):
        return None
    sock = norm_socket(first(sp, "Soket"))
    if not sock:
        return None
    mem = []
    for l in ("Bellek Türü", "2.Bellek Türü"):
        v = first(sp, l)
        if v:
            t = re.match(r"(DDR\d)", v)
            if t and t.group(1) not in mem:
                mem.append(t.group(1))
    fam = first(sp, "İşlemci Ailesi") or ""
    return {
        "br": "AMD" if fam.startswith("AMD") or row["name"].startswith("AMD") else "Intel" if "Intel" in fam or row["name"].startswith("Intel") else brand_of(row["name"]),
        "sock": sock,
        "fam": first(sp, "İşlemci Serisi"),
        "gen": first(sp, "Jenerasyon"),
        "arch": first(sp, "İşlemci Mimarisi"),
        "seg": seg,
        "cores": intnum(first(sp, "Çekirdek")),
        "thr": intnum(first(sp, "İş Parçacığı")),
        "base": num(first(sp, "Temel Frekans")),
        "boost": num(first(sp, "Artırılmış Frekans")),
        "tdp": intnum(first(sp, "Isı Yayma Kapasitesi (TDP)")),
        "igpu": yes(sp, "Dahili Grafik İşlemci"),
        "ign": first(sp, "Grafik İşlemci Modeli"),
        "mem": mem,
        "mspd": intnum(first(sp, "Bellek Hızı")),
        "pm": intnum(first(sp, "PassMark Puanı (Çoğul)")),
        "pm1": intnum(first(sp, "PassMark Puanı (Tekil)")),
        "yr": intnum(first(sp, "Çıkış Yılı")),
        "unl": 1 if (first(sp, "Çarpan Kilidi") or "").startswith("Açık") else 0,
        "l3": num(first(sp, "Önbellek L3")),
        "pcie": first(sp, "PCIe Sürümü"),
    }


def cover_flag(sp, part):
    """Pasif/fanlı soğutma kapsamında parça varsa 1, kapsam bilgisi var ama parça yoksa 0, bilgi yoksa None."""
    cov = " | ".join(allv(sp, "Pasif Soğutma Kapsamı") + allv(sp, "Fan Soğutma Kapsamı"))
    if not cov:
        return None
    return 1 if part in cov else 0


def norm_mobo(sp, row):
    sock = norm_socket(first(sp, "İşlemci Soketi"))
    if not sock:
        return None
    mem = first(sp, "Bellek Teknolojisi")
    mem = re.match(r"(DDR\d)", mem).group(1) if mem and re.match(r"(DDR\d)", mem) else mem
    vout = 0
    for l in ("HDMI", "DisplayPort"):
        if yes(sp, l):
            vout += 1
    if yes(sp, "USB-C DP Desteği"):
        vout += 1
    pcie_v = allv(sp, "PCIe x16 Versiyonu")
    wifi = first(sp, "Wi-Fi Standardı") if yes(sp, "Wi-Fi") else None
    if wifi:
        m = re.match(r"(WiFi\s*\d+E?)", wifi, re.I)
        wifi = m.group(1).replace("WiFi", "Wi-Fi") if m else "Wi-Fi"
    return {
        "br": brand_of(row["name"]),
        "sock": sock,
        "chip": first(sp, "Yonga Seti Modeli"),
        "mem": mem,
        "slots": intnum(first(sp, "Bellek Yuvası")),
        "mmax": gb(first(sp, "Bellek Kapasitesi")),
        "mspd": intnum(first(sp, "Bellek Saat Hızı (OC)", "Bellek Saat Hızı")),
        "ff": norm_ff(first(sp, "Form Faktörü")),
        "m2": intnum(first(sp, "M.2 Yuvası Sayısı"), 0 if first(sp, "M.2 Yuvası") == "Yok" else None),
        "sata": intnum(first(sp, "SATA Yuvası Sayısı"), 0 if first(sp, "SATA Yuvası") == "Yok" else None),
        "x16": intnum(first(sp, "PCIe x16 Sayısı")),
        "x1": intnum(first(sp, "PCIe x1 Sayısı"), 0),
        "pcie": max(pcie_v, key=lambda v: num(v, 0)) if pcie_v else None,
        "wifi": wifi,
        "bt": yes(sp, "Bluetooth"),
        "archs": allv(sp, "İşlemci Mimarisi"),
        "vout": vout,
        "w": within(mm(first(sp, "En")), 140, 360),
        "h": within(mm(first(sp, "Boy")), 140, 360),
        "rgb": yes(sp, "Aydınlatma"),
        "white": 1 if is_white_name(row["name"]) else 0,
        "hsVRM": cover_flag(sp, "VRM"),
        "hsM2": cover_flag(sp, "M.2"),
        "lcd": yes(sp, "Ekran"),
    }


def gpu_maker(sp, name):
    v = (first(sp, "İşlemci Üreticisi") or "").lower()
    chip = (first(sp, "Grafik İşlemcisi") or name).lower()
    if "nvidia" in v or re.search(r"geforce|rtx|gtx|quadro", chip):
        return "NVIDIA"
    if "amd" in v or re.search(r"radeon|rx\s?\d", chip):
        return "AMD"
    if "intel" in v or re.search(r"\barc\b", chip):
        return "Intel"
    return first(sp, "İşlemci Üreticisi")


def norm_gpu(sp, row):
    chip = first(sp, "Grafik İşlemcisi")
    if not chip:
        return None
    fans = intnum(first(sp, "Fan Sayısı"))
    cool_raw = (first(sp, "Soğutma Tipi") or "").lower()
    cool = ("liquid" if "sıvı soğutmalı" in cool_raw else "block" if "destekli" in cool_raw
            else "passive" if "pasif" in cool_raw else "fan")
    tech = " | ".join(allv(sp, "Donanım Teknolojileri"))
    lp = 1 if re.search(r"düşük profil|\blp\b|low profile", tech + " " + row["name"], re.I) else 0
    bp_raw = (first(sp, "Arka Plaka Tipi") or "").lower()
    if bp_raw:
        bp = "plastic" if "plast" in bp_raw else "metal"
    else:
        bp = "metal" if yes(sp, "Arka Plaka") else ("none" if first(sp, "Arka Plaka") == "Yok" else None)
    conn_raw = first(sp, "Güç Bağlantısı") or ""
    pw = [] if "pinsiz" in conn_raw.lower() else re.findall(r"\d+", conn_raw)
    return {
        "br": brand_of(row["name"]),
        "mk": gpu_maker(sp, row["name"]),
        "chip": chip,
        "arch": first(sp, "GPU Mimarisi"),
        "vram": num(first(sp, "Bellek Boyutu")),
        "vt": first(sp, "Bellek Türü"),
        "boost": intnum(first(sp, "Artırılmış Frekans")),
        "tdp": intnum(first(sp, "Grafik Kartı Gücü")),
        "rec": intnum(first(sp, "Önerilen Sistem Gücü")),
        "conn": first(sp, "Güç Bağlantısı"),
        "len": within(mm(first(sp, "Derinlik")), 120, 460),
        "ht": within(mm(first(sp, "Yükseklik")), 60, 200),
        "th": within(mm(first(sp, "Genişlik")), 15, 100),
        "fans": fans,
        "cool": cool,
        "lp": lp,
        "bp": bp,
        "pw": pw,
        "dp": intnum(first(sp, "Display Port Çıkışı")),
        "hdmi": intnum(first(sp, "HDMI Çıkışı")),
        "rgbT": first(sp, "Aydınlatma Tipi"),
        "rgb": yes(sp, "Aydınlatma"),
        "col": color_of(sp, "Renk", "Renk Seçenekleri", name=row["name"]),
        "pm": intnum(first(sp, "PassMark Puanı")),
        "yr": intnum(first(sp, "GPU Çıkış Yılı")),
    }


def norm_ram(sp, row):
    plat = first(sp, "Platform")
    form = first(sp, "Bellek Modülü")
    mtype = first(sp, "Modül Türü")
    # masaüstü bellekler + masaüstü kartlara da takılan tamponsuz (UDIMM) sunucu bellekleri;
    # dizüstü (SO-DIMM) ve kayıtlı (RDIMM/LRDIMM) bellekler elenir
    unbuffered = bool(mtype and re.fullmatch(r"\s*UDIMM\s*", mtype, re.I))
    if plat and not re.search(r"masa", plat, re.I) and not unbuffered:
        return None
    if form and re.search(r"so-?dimm", form, re.I):
        return None
    if mtype and re.search(r"RDIMM|LRDIMM|Registered|SODIMM", mtype, re.I):
        return None
    mt = first(sp, "Bellek Teknolojisi")
    m = re.match(r"(DDR\d)", mt or "")
    if not m:
        return None
    cap = gb(first(sp, "Bellek Kapasitesi"))
    kit = first(sp, "Bellek Sayısı") or ""
    km = re.match(r"\s*(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*GB", kit)
    if km:
        mods, per = int(km.group(1)), num(km.group(2))
    else:
        km2 = re.match(r"\s*(\d+)", first(sp, "Bellek Kiti") or "")
        mods = int(km2.group(1)) if km2 else 1
        per = cap / mods if cap and mods else cap
    if cap is None and per:
        cap = int(mods * per)
    return {
        "br": brand_of(row["name"]),
        "mt": m.group(1),
        "cap": cap,
        "mods": mods,
        "per": int(per) if per and float(per).is_integer() else per,
        "spd": intnum(first(sp, "Bellek Hızı (OC)", "Bellek Hızı")),
        "cl": intnum(first(sp, "CL (Tepkime Süresi)")),
        "rgb": 1 if yes(sp, "Işıklandırma") and re.search(r"rgb", first(sp, "Işıklandırma Özelliği") or "rgb", re.I) else 0,
        "hs": yes(sp, "Soğutucu"),
        "col": color_of(sp, "Renk Seçenekleri", "Renk", name=row["name"]),
        "ht": within(mm(first(sp, "Yükseklik")), 25, 70),
    }


def norm_storage(sp, row):
    cls = (first(sp, "Cihaz Sınıfı") or "").upper()
    dtype = first(sp, "Cihaz Tipi") or ""
    if re.search(r"harici|taşınabilir|usb|external", dtype, re.I):
        return None
    iface = (first(sp, "Bağlantı Arayüzü") or "").lower()
    proto = (first(sp, "İletim Protokolü") or "").lower()
    bus = first(sp, "Veri Yolu") or ""
    frame = first(sp, "Çerçeve Boyutu") or ""
    if re.search(r"usb|thunderbolt", iface) or re.search(r"usb", bus, re.I):
        return None
    if re.search(r"msata", frame, re.I):
        return None
    if "HDD" in cls or "SSHD" in cls or "hdd" in dtype.lower():
        kind = "hdd"
    elif "m.2" in iface or "m.2" in frame.lower():
        kind = "nvme" if ("nvme" in proto or "pcie" in bus.lower()) else "m2sata"
    elif "pcie" in bus.lower() or "nvme" in proto:
        kind = "nvme"  # U.2 / eklenti kart nadir; M.2 kabul et
    elif "SSD" in cls:
        kind = "ssd"
    else:
        return None
    ff = None
    fm = re.search(r"(3\.5|2\.5)", frame)
    if kind in ("nvme", "m2sata"):
        fm2 = re.search(r"(22\d\d+)", frame)
        ff = "M.2 " + fm2.group(1) if fm2 else "M.2 2280"
    elif fm:
        ff = fm.group(1)
    else:
        ff = "3.5" if kind == "hdd" else "2.5"
    bus_std = first(sp, "Veri Yolu Standardı")
    if bus_std:
        bm = re.match(r"PCIe\s*(\d(?:\.\d)?)\s*[xX]\s*(\d)", bus_std)
        if bm:
            g = bm.group(1)
            bus_std = f"PCIe {g if '.' in g else g + '.0'} x{bm.group(2)}"
    elif kind in ("ssd", "hdd", "m2sata"):
        bus_std = "SATA III"
    rpm = intnum(first(sp, "Dönüş Hızı", "Devir Hızı"))
    return {
        "br": brand_of(row["name"]),
        "kind": kind,
        "ff": ff,
        "cap": gb(first(sp, "Kapasite")),
        "rd": intnum((first(sp, "Sıralı Okuma") or "").replace(".", "")),
        "wr": intnum((first(sp, "Sıralı Yazma") or "").replace(".", "")),
        "bus": bus_std,
        "hs": yes(sp, "Soğutucu"),
        "rpm": rpm,
        "col": color_of(sp, "Renk Seçenekleri", "Renk", name=row["name"]),
    }


EFF = [("titanyum", "80+ Titanyum"), ("titanium", "80+ Titanyum"), ("platin", "80+ Platin"),
       ("altın", "80+ Altın"), ("gold", "80+ Altın"), ("gümüş", "80+ Gümüş"), ("silver", "80+ Gümüş"),
       ("bronz", "80+ Bronz"), ("bronze", "80+ Bronz"), ("beyaz", "80+ Beyaz"), ("white", "80+ Beyaz"),
       ("standart", "80+ Standart"), ("80+", "80+ Standart"), ("80 plus", "80+ Standart")]


def norm_psu(sp, row):
    w = intnum(first(sp, "Güç"))
    if not w:
        return None
    certs = " | ".join(allv(sp, "Sertifika")).lower()
    eff = None
    for k, v in EFF:
        if k in certs:
            eff = v
            break
    compat = " | ".join(allv(sp, "Uyumluluk"))
    mod = first(sp, "Kablo Tipi")
    if mod:
        mod = {"Tam Modüler": "Tam modüler", "Yarı Modüler": "Yarı modüler", "Modüler Olmayan": "Modüler değil"}.get(mod, mod)
    dw, dh, dd = mm(first(sp, "Genişlik")), mm(first(sp, "Yükseklik")), mm(first(sp, "Derinlik"))
    ff_raw = first(sp, "Form Faktörü", "Boyut", "Tip")
    ff = "ATX"
    text = (ff_raw or "") + " " + row["name"]
    if re.search(r"sfx[\s-]*l", text, re.I):
        ff = "SFX-L"
    elif re.search(r"\bsfx\b", text, re.I) or (dw and dh and dw <= 126 and dh <= 66):
        ff = "SFX"
    elif re.search(r"\btfx\b", text, re.I):
        ff = "TFX"
    return {
        "br": brand_of(row["name"]),
        "w": w,
        "eff": eff,
        "mod": mod,
        "atx3": 1 if re.search(r"ATX\s*3", compat) else 0,
        "pcie5": 1 if re.search(r"PCIe\s*5", compat) or re.search(r"pcie\s*5|12vhpwr|12v-2x6", row["name"], re.I) else 0,
        "ff": ff,
        "dw": within(dw, 90, 220), "dh": within(dh, 40, 130), "dd": within(dd, 90, 260),
        "fan": mm(first(sp, "Fan Boyutu")),
        "rgb": yes(sp, "Aydınlatma"),
        "col": color_of(sp, "Renk Seçenekleri", "Renk", name=row["name"]),
    }


RAD_LABELS = {"Ön": "f", "Üst": "t", "Alt": "b", "Arka": "r", "Sağ": "s", "Sol": "s", "Yan": "s"}


def norm_case(sp, row):
    mb = []
    for v in allv(sp, "Anakart Uyumluluğu"):
        f = norm_ff(v)
        if f and f not in mb:
            mb.append(f)
    ct = norm_ff(first(sp, "Kasa Türü")) or (mb[0] if mb else None)
    rad = {}
    for label, vals in sp.items():
        m = re.match(r"Radyatör Desteği \((.+?)\)", label)
        if m:
            key = RAD_LABELS.get(m.group(1).strip())
            if key:
                sizes = sorted({intnum(v) for v in vals if intnum(v)})
                rad[key] = sorted(set(rad.get(key, [])) | set(sizes))
    mat = " | ".join(allv(sp, "Kasa Materyali")).lower()
    name = row["name"]
    pos = first(sp, "Güç Kaynağı Pozisyonu")
    fans_types = " | ".join(allv(sp, "Dahili Fan Tipi")) + " " + " | ".join(allv(sp, "Diğer Özellikler"))
    return {
        "br": brand_of(name),
        "ct": ct,
        "mb": mb,
        "gpu": within(mm(first(sp, "GPU Uzunluğu (max)")), 120, 700),
        "cool": within(mm(first(sp, "CPU Fan Yüksekliği")), 25, 300),
        "psu": yes(sp, "Güç Kaynağı (PSU)"),
        "psuw": intnum(first(sp, "Güç Kaynağı Kapasitesi")),
        "pos": pos,
        "rad": rad,
        "fans": intnum(first(sp, "Dahili Fan Sayısı")),
        "fsz": intnum(first(sp, "Dahili Fan Ebatları")),
        "frgb": 1 if re.search(r"ışıklı|rgb", fans_types, re.I) else 0,
        "glass": 1 if "cam" in mat else 0,
        "mesh": 1 if re.search(r"\b(flow|air|mesh|airflow|vent)\b", name, re.I) or "mesh" in mat or "file" in mat else 0,
        "w": within(mm(first(sp, "Genişlik")), 120, 500),
        "h": within(mm(first(sp, "Yükseklik")), 150, 800),
        "d": within(mm(first(sp, "Derinlik")), 150, 800),
        "col": color_of(sp, "Renk", "Renk Seçenekleri", name=row["name"]),
        "strip": 1 if any("Kasa" in v for v in allv(sp, "Aydınlatma Tipi")) else 0,
        "dglass": 1 if re.search(r"çift temperli cam", " | ".join(allv(sp, "Diğer Özellikler")), re.I) else 0,
        "b25": intnum(first(sp, "Disk Yuvası (2.5)")),
        "b35": intnum(first(sp, "Disk Yuvası (3.5)")),
        "rgb": yes(sp, "Aydınlatma"),
    }


def norm_cooler(sp, row):
    socks = []
    for l in ("AMD Soket Tipi", "Intel Soket Tipi", "Soket Tipi", "Soket"):
        for v in allv(sp, l):
            s = norm_socket(v)
            if s and s not in socks:
                socks.append(s)
    ctype = (first(sp, "Soğutma Türü") or "").lower()
    tower = first(sp, "Soğutucu Tipi")
    kind = "aio" if ("sıvı" in ctype or first(sp, "Radyatör Boyutu")) else "stock" if "stok" in (tower or "").lower() else "air"
    if kind == "aio" and tower in ("Kapalı Devre",):
        tower = "Kapalı devre"
    fans = intnum(first(sp, "Fan Sayısı"))
    ht = mm(first(sp, "Yükseklik"))
    return {
        "br": brand_of(row["name"]),
        "kind": kind,
        "socks": socks,
        "tower": tower,
        "ht": within(ht, 25, 200) if kind != "aio" else None,
        "pipes": intnum(first(sp, "Isı Borusu Sayısı")),
        "rad": intnum(first(sp, "Radyatör Boyutu")) if kind == "aio" else None,
        "radl": mm(first(sp, "Radyatör Uzunluğu")) if kind == "aio" else None,
        "radt": mm(first(sp, "Radyatör Yüksekliği")) if kind == "aio" else None,
        "fans": fans,
        "fsz": mm(first(sp, "Fan Boyutu (Büyük)", "Fan Boyutu")),
        "tdp": intnum(first(sp, "Isı Yayma Kapasitesi (TDP)")),
        "rgb": yes(sp, "Aydınlatma"),
        "col": color_of(sp, "Renk Seçenekleri", "Renk", name=row["name"]),
        "len": mm(first(sp, "Uzunluk")),
        "wid": mm(first(sp, "Genişlik")),
        "lcd": yes(sp, "Ekran"),
    }


NORMALIZERS = {
    "cpu": norm_cpu, "mobo": norm_mobo, "gpu": norm_gpu, "ram": norm_ram,
    "storage": norm_storage, "psu": norm_psu, "case": norm_case, "cooler": norm_cooler,
}

IMG_RE = re.compile(r"https://resim\.epey\.com/(\d+)/k_(.+)$")
URL_RE = re.compile(r"https://www\.epey\.com/[^/]+/(.+)\.html$")


def clean_record(rec):
    """None / boş değerleri at (JSON'u küçültür)."""
    return {k: v for k, v in rec.items() if v is not None and v != [] and v != {} and v != ""}


def build_category(cat):
    list_path = os.path.join(CACHE, f"{cat}_list.json")
    cache = load_cache(cat)
    if not os.path.exists(list_path) or not cache:
        print(f"{cat}: veri yok, atlanıyor")
        return None
    with open(list_path, encoding="utf-8") as f:
        listing = json.load(f)
    items, skipped, missing = [], 0, 0
    for order, row in enumerate(listing["rows"]):
        det = cache.get(row["id"])
        if not det or not det.get("specs"):
            missing += 1
            continue
        try:
            norm = NORMALIZERS[cat](det["specs"], row)
        except Exception as e:  # tek bir ürün tüm derlemeyi bozmasın
            print(f"  {cat} {row['id']} {row['name']}: {e!r}", file=sys.stderr)
            norm = None
        if not norm:
            skipped += 1
            continue
        im = row.get("img") or ""
        m = IMG_RE.match(im)
        if m and m.group(1) == row["id"]:
            im = m.group(2)
        elif not m:
            im = ""
        um = URL_RE.match(row["url"])
        rec = {
            "id": row["id"],
            "n": row["name"],
            "c": row.get("code") or None,
            "p": row["price"],
            "s": row.get("sites") or None,
            "sc": row.get("score"),
            "o": order,
            "im": im or None,
            "u": um.group(1) if um else row["url"],
        }
        rec.update(norm)
        items.append(clean_record(rec))
    print(f"{cat}: {len(items)} ürün (detayı eksik {missing}, uygun olmayan {skipped})")
    return {"cat": cat, "updated": listing.get("updated"), "items": items}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {"source": "https://www.epey.com", "built": datetime.now(timezone.utc).isoformat(timespec="seconds"), "counts": {}, "updated": {}}
    for cat in CATS:
        data = build_category(cat)
        if not data:
            continue
        # satır başına bir ürün: günlük güncellemelerde git farkları küçük kalır
        head = json.dumps({"cat": data["cat"], "updated": data["updated"]}, ensure_ascii=False, separators=(",", ":"))[:-1]
        body = ",\n".join(json.dumps(it, ensure_ascii=False, separators=(",", ":")) for it in data["items"])
        with open(os.path.join(OUT, f"{cat}.json"), "w", encoding="utf-8", newline="\n") as f:
            f.write(head + ',"items":[\n' + body + "\n]}\n")
        meta["counts"][cat] = len(data["items"])
        meta["updated"][cat] = data["updated"]
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
