# PC Toplama · 3D bilgisayar toplama

Parçaları birbiriyle **uyumlu** olacak şekilde seçtiren ve seçilen sistemi **3D olarak** gösteren bir bilgisayar toplama sitesi. Ürün bilgileri, fiyatlar ve görseller [epey.com](https://www.epey.com)'dan alınır.

**Canlı site:** https://yigitkalaycioglu.github.io/bilgisayar-toplama/

## Özellikler

- **Uyumluluk filtresi (iki yönlü):** AM5 anakart seçilince yalnızca AM5 işlemciler listelenir; önce işlemci seçilirse anakartlar ona göre süzülür. Kontrol edilenler:
  - işlemci ↔ anakart soketi ve desteklenen bellek türü (DDR4/DDR5), mimari desteği (uyarı)
  - bellek ↔ anakart: tür, modül sayısı / yuva sayısı, azami kapasite
  - anakart form faktörü ↔ kasa (ATX, Micro ATX, Mini ITX, E-ATX…)
  - ekran kartı uzunluğu ↔ kasanın azami GPU uzunluğu
  - hava soğutucu yüksekliği ↔ kasa; sıvı soğutma radyatörü ↔ kasanın radyatör desteği; soğutucu ↔ soket (aynı montajı kullanan soketler dahil)
  - M.2 / SATA sürücü sayısı ↔ anakart yuvaları, 3.5" diskler ↔ kasa yuvaları
  - güç kaynağı ↔ tahmini sistem tüketimi (yetersiz olanlar gizlenir, önerilen değer gösterilir)
- Uyumsuz ürünler varsayılan olarak gizlenir; istenirse nedenleriyle soluk gösterilir ve "Değiştir ve seç" ile çakışan parça otomatik çıkarılır.
- **3D önizleme (three.js):** kasa seçilince kasa gelir, anakart kasaya yerleşir, işlemci sokete, RAM'ler yuvalara, ekran kartı PCIe yuvasına, M.2 SSD anakarta, PSU örtünün altına, AIO radyatörü kasanın uygun yerine takılır. Ölçüler epey verisinden gelir (kasa boyutları, GPU uzunluğu/kalınlığı/fan sayısı, soğutucu yüksekliği, radyatör boyu, RAM yüksekliği, renkler, RGB).
  - ayrık (patlatılmış) görünüm, yan paneli aç/kapat, RGB aç/kapat, otomatik döndürme
  - parçanın üzerine gelince adı, tıklayınca yakın plan
- Arama, marka/özellik filtreleri, fiyat aralığı, sıralama (fiyat, performans, fiyat/performans).
- **Her ziyaretçi kendi oturumunda:** seçilen sistem yalnızca o tarayıcı sekmesinde tutulur (sayfa yenilenince korunur); site her yeni ziyarette boş açılır ve başkasının topladığı sistem görünmez. Sunucuda hiçbir seçim saklanmaz.
- **Paylaş** düğmesi sistemi bilerek başkasına göndermek için bağlantı üretir; bağlantıyı açan kişi sistemi kendi oturumunda görür. **Listeyi kopyala** ile parça listesi metin olarak alınabilir.

## Veriler nasıl güncellenir?

`scraper/` klasöründeki betikler yalnızca Python standart kütüphanesini kullanır.

```bash
python scraper/epey_scraper.py          # liste sayfalarından fiyatları, yeni ürünlerin detaylarını çeker
python scraper/build_data.py            # data/*.json dosyalarını üretir
```

- Yalnızca epey.com `robots.txt`'nin izin verdiği sayfalar (kategori liste sayfaları ve ürün sayfaları) okunur; istekler arasında bekleme vardır ve sunucu yavaşlama isterse (HTTP 429) otomatik olarak beklenir.
- Fiyatı olan (satışta) ürünler alınır. Teknik özellikler `scraper/cache/` altında saklandığı için sonraki çalışmalarda yalnızca fiyatlar ve yeni ürünler indirilir (ilk tam tarama ~2 saat, sonrakiler ~10-15 dakika).
- **Otomatik güncelleme:** `.github/workflows/update-data.yml` her gün 06:17'de (TSİ) çalışır. Fiyatları tazeler, epey'e yeni eklenen ürünleri siteye ekler, satıştan kalkanları çıkarır ve sonucu commit'ler; GitHub Pages siteyi kendiliğinden yeniden yayınlar. Actions sekmesinden "Run workflow" ile elle de başlatılabilir.
- Bir kategorinin listesi yarıda kesilirse ya da ürün sayısı şüpheli biçimde düşerse o kategorinin önceki verisi korunur.

## Yerelde çalıştırma

Derleme adımı yoktur; herhangi bir statik sunucu yeterli:

```bash
python -m http.server 8000
# http://localhost:8000
```

## Yapı

```
index.html, css/          arayüz
js/main.js                durum, seçici pencere, özet
js/catalog.js             kategori tanımları, filtreler, gösterilen özellikler
js/compat.js              uyumluluk kuralları ve güç hesabı
js/three/                 3D sahne ve prosedürel parça modelleri
vendor/three.bundle.js    three.js r186 (MIT)
data/                     sitenin kullandığı sade JSON verisi
scraper/                  epey.com toplayıcı ve veri derleyici
```

## Not

Fiyatlar epey.com'daki en düşük mağaza fiyatıdır ve değişmiş olabilir; satın almadan önce ürün sayfasını kontrol edin. Uyumluluk kontrolleri epey'deki teknik verilere dayanır; eksik ya da hatalı veri olabileceği için kritik alımlarda üretici sayfasını da doğrulayın. Bu site epey.com ile bağlantılı değildir.
