// Kategori tanımları: etiketler, ikonlar, filtreler ve listede gösterilecek özellikler.

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  case: svg('<rect x="6" y="2.5" width="12" height="19" rx="2"/><circle cx="12" cy="7" r="1.6"/><path d="M9.5 16.5h5M9.5 19h5"/>'),
  mobo: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><rect x="7" y="7" width="5" height="5" rx=".8"/><path d="M15 6.5v6M17 6.5v6M7 15.5h8M7 18h5"/>'),
  cpu: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".6"/><path d="M9 3v3.5M12 3v3.5M15 3v3.5M9 17.5V21M12 17.5V21M15 17.5V21M3 9h3.5M3 12h3.5M3 15h3.5M17.5 9H21M17.5 12H21M17.5 15H21"/>'),
  cooler: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.8"/><path d="M12 10.2c-.5-2.6.6-4.8 2.6-5.5M13.8 12.6c2.5.9 3.9 3 3.4 5M10.4 13c-2 1.8-4.4 2-5.9.7"/>'),
  ram: svg('<rect x="2.5" y="7" width="19" height="8.5" rx="1.2"/><path d="M5.5 10h2v2.5h-2zM9.5 10h2v2.5h-2zM13.5 10h2v2.5h-2zM17.5 10h1.5v2.5h-1.5zM5 15.5V18M8 15.5V18M11 15.5V18M14 15.5V18M17 15.5V18"/>'),
  gpu: svg('<rect x="2.5" y="6" width="19" height="10.5" rx="1.6"/><circle cx="8.5" cy="11.25" r="3"/><circle cx="16" cy="11.25" r="3"/><path d="M5 16.5V19h7.5v-2.5"/>'),
  storage: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="11" r="4"/><circle cx="12" cy="11" r=".9"/><path d="M6.5 17.5h2"/>'),
  psu: svg('<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="12" cy="12" r="4.3"/><path d="M12 7.7v8.6M7.7 12h8.6M9 9l6 6M15 9l-6 6"/>'),
};

export const CATEGORIES = [
  { key: 'case', label: 'Kasa', plural: 'kasa', required: true },
  { key: 'mobo', label: 'Anakart', plural: 'anakart', required: true },
  { key: 'cpu', label: 'İşlemci', plural: 'işlemci', required: true },
  { key: 'cooler', label: 'İşlemci Soğutucu', plural: 'soğutucu', required: true },
  { key: 'ram', label: 'Bellek (RAM)', plural: 'bellek', required: true, qty: true },
  { key: 'gpu', label: 'Ekran Kartı', plural: 'ekran kartı', required: false },
  { key: 'storage', label: 'Depolama', plural: 'depolama', required: true, multi: 6 },
  { key: 'psu', label: 'Güç Kaynağı', plural: 'güç kaynağı', required: true },
];

export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

export const EPEY_SLUG = {
  cpu: 'islemci', mobo: 'anakart', gpu: 'ekran-karti', ram: 'bellek-ram',
  storage: 'sabit-disk', psu: 'power-supply-psu', case: 'bilgisayar-kasasi', cooler: 'islemci-sogutucu',
};

export function epeyUrl(cat, item) {
  if (!item.u) return 'https://www.epey.com/' + EPEY_SLUG[cat] + '/';
  return item.u.startsWith('http') ? item.u : `https://www.epey.com/${EPEY_SLUG[cat]}/${item.u}.html`;
}

export function imageUrl(item, size = 'k') {
  if (!item.im) return '';
  if (item.im.startsWith('http')) return size === 'k' ? item.im : item.im.replace('/k_', `/${size}_`);
  return `https://resim.epey.com/${item.id}/${size}_${item.im}`;
}

const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPrice = (v) => (v == null ? '—' : (v >= 1000 || v === 0 ? nf0.format(Math.round(v)) : nf2.format(v)) + ' TL');
export const fmtNum = (v) => nf0.format(v);
export const fmtCap = (gb) => (gb >= 1000 ? `${+(gb / 1000).toFixed(gb % 1000 ? 1 : 0)} TB` : `${gb} GB`);

const STORAGE_KIND = { nvme: 'NVMe SSD', m2sata: 'M.2 SATA SSD', ssd: 'SATA SSD', hdd: 'HDD' };
const COOLER_KIND = { air: 'Hava soğutma', aio: 'Sıvı soğutma' };
export const storageKindLabel = (k) => STORAGE_KIND[k] || 'Depolama';

// Her kategori için: listede gösterilecek kısa özellikler (chips) ve tek satırlık özet.
export const SPECS = {
  cpu: (x) => [
    x.sock && { t: x.sock, hl: true },
    x.cores && `${x.cores} çekirdek / ${x.thr || x.cores} izlek`,
    x.boost ? `${x.boost} GHz` : x.base ? `${x.base} GHz` : null,
    x.tdp && `${x.tdp} W`,
    x.mem && x.mem.length && x.mem.join('/'),
    x.igpu ? 'Dahili grafik' : 'Grafik yok',
    x.pm && `PassMark ${fmtNum(x.pm)}`,
  ],
  mobo: (x) => [
    x.sock && { t: x.sock, hl: true },
    x.chip,
    x.ff,
    x.mem && { t: x.mem, hl: true },
    x.slots && `${x.slots} RAM yuvası`,
    x.m2 != null && `${x.m2}× M.2`,
    x.wifi ? 'Wi-Fi' : null,
  ],
  gpu: (x) => [
    x.chip && { t: x.chip, hl: true },
    x.vram && `${x.vram} GB ${x.vt || ''}`.trim(),
    x.len && `${x.len} mm`,
    x.tdp && `${x.tdp} W`,
    x.rec && `Önerilen PSU ${x.rec} W`,
    x.pm && `PassMark ${fmtNum(x.pm)}`,
  ],
  ram: (x) => [
    x.mt && { t: x.mt, hl: true },
    x.cap && (x.mods > 1 ? `${x.mods}×${x.per} GB` : `${x.cap} GB`),
    x.spd && `${x.spd} MT/s`,
    x.cl && `CL${x.cl}`,
    x.rgb ? 'RGB' : null,
  ],
  storage: (x) => [
    { t: storageKindLabel(x.kind), hl: true },
    x.cap && fmtCap(x.cap),
    x.rd && `Okuma ${fmtNum(x.rd)} MB/s`,
    x.bus,
    x.ff && x.kind !== 'nvme' && x.kind !== 'm2sata' ? `${x.ff}"` : null,
  ],
  psu: (x) => [
    x.w && { t: `${x.w} W`, hl: true },
    x.eff,
    x.mod,
    x.ff && x.ff !== 'ATX' ? x.ff : null,
    x.atx3 ? 'ATX 3.x' : null,
  ],
  case: (x) => [
    x.ct && { t: x.ct, hl: true },
    x.gpu && `GPU ≤ ${x.gpu} mm`,
    x.cool && `Soğutucu ≤ ${x.cool} mm`,
    x.fans != null && `${x.fans} fan`,
    x.glass ? 'Cam panel' : null,
    x.psu ? `PSU dahil${x.psuw ? ' ' + x.psuw + ' W' : ''}` : null,
    x.col,
  ],
  cooler: (x) => [
    { t: COOLER_KIND[x.kind] || 'Soğutucu', hl: true },
    x.kind === 'aio' && x.rad ? `${x.rad} mm radyatör` : null,
    x.kind === 'air' && x.ht ? `${x.ht} mm yükseklik` : null,
    x.tower,
    x.tdp && `${x.tdp} W TDP`,
    x.rgb ? 'RGB' : null,
  ],
};

export function specChips(cat, item) {
  return (SPECS[cat](item) || []).filter(Boolean).map((s) => (typeof s === 'string' ? { t: s } : s));
}

export function shortSpecs(cat, item, n = 4) {
  return specChips(cat, item).slice(0, n).map((c) => c.t).join(' · ');
}

// Performans/puan karşılaştırması için tek sayı
export function perfScore(cat, x) {
  switch (cat) {
    case 'cpu': return x.pm || (x.sc || 0) * 400;
    case 'gpu': return x.pm || (x.sc || 0) * 300;
    case 'ram': return (x.cap || 0) * 10 + (x.spd || 0) / 100 - (x.cl || 0) / 10;
    case 'storage': return (x.rd || 0) + (x.cap || 0) / 2;
    case 'psu': return (x.w || 0) + (({ 'Titanyum': 5, 'Platin': 4, 'Altın': 3, 'Gümüş': 2, 'Bronz': 1 })[(x.eff || '').replace('80+ ', '')] || 0) * 50;
    case 'cooler': return x.kind === 'aio' ? 200 + (x.rad || 0) : (x.tdp || 150) + (x.ht || 0) / 4;
    default: return x.sc || 0;
  }
}

// Filtre panelleri: her biri item -> değer (veya değer dizisi) döndürür.
export const FACETS = {
  cpu: [
    { id: 'br', label: 'Marka', get: (x) => x.br },
    { id: 'sock', label: 'Soket', get: (x) => x.sock },
    { id: 'fam', label: 'Seri', get: (x) => x.fam },
    { id: 'cores', label: 'Çekirdek', get: (x) => x.cores && `${x.cores} çekirdek`, sort: 'num' },
    { id: 'igpu', label: 'Dahili grafik', get: (x) => (x.igpu ? 'Var' : 'Yok') },
    { id: 'seg', label: 'Tür', get: (x) => x.seg },
  ],
  mobo: [
    { id: 'br', label: 'Marka', get: (x) => x.br },
    { id: 'sock', label: 'Soket', get: (x) => x.sock },
    { id: 'chip', label: 'Yonga seti', get: (x) => x.chip },
    { id: 'ff', label: 'Form faktörü', get: (x) => x.ff },
    { id: 'mem', label: 'Bellek', get: (x) => x.mem },
    { id: 'wifi', label: 'Wi-Fi', get: (x) => (x.wifi ? 'Var' : 'Yok') },
  ],
  gpu: [
    { id: 'mk', label: 'Yonga üreticisi', get: (x) => x.mk },
    { id: 'chip', label: 'Grafik işlemcisi', get: (x) => x.chip },
    { id: 'br', label: 'Marka', get: (x) => x.br },
    { id: 'vram', label: 'Bellek', get: (x) => x.vram && `${x.vram} GB`, sort: 'num' },
  ],
  ram: [
    { id: 'mt', label: 'Bellek türü', get: (x) => x.mt },
    { id: 'cap', label: 'Toplam kapasite', get: (x) => x.cap && `${x.cap} GB`, sort: 'num' },
    { id: 'kit', label: 'Modül', get: (x) => x.mods && (x.mods > 1 ? `${x.mods}'li kit` : 'Tek modül') },
    { id: 'spd', label: 'Hız', get: (x) => x.spd && `${x.spd} MT/s`, sort: 'num' },
    { id: 'br', label: 'Marka', get: (x) => x.br },
    { id: 'rgb', label: 'RGB', get: (x) => (x.rgb ? 'Var' : 'Yok') },
  ],
  storage: [
    { id: 'kind', label: 'Tür', get: (x) => storageKindLabel(x.kind) },
    { id: 'cap', label: 'Kapasite', get: (x) => x.cap && fmtCap(x.cap), sort: 'cap' },
    { id: 'br', label: 'Marka', get: (x) => x.br },
    { id: 'bus', label: 'Arayüz', get: (x) => x.bus },
  ],
  psu: [
    { id: 'w', label: 'Güç', get: (x) => x.w && `${x.w} W`, sort: 'num' },
    { id: 'eff', label: 'Verimlilik', get: (x) => x.eff },
    { id: 'mod', label: 'Kablo', get: (x) => x.mod },
    { id: 'ff', label: 'Boyut', get: (x) => x.ff },
    { id: 'br', label: 'Marka', get: (x) => x.br },
  ],
  case: [
    { id: 'ct', label: 'Kasa türü', get: (x) => x.ct },
    { id: 'br', label: 'Marka', get: (x) => x.br },
    { id: 'col', label: 'Renk', get: (x) => x.col },
    { id: 'glass', label: 'Cam yan panel', get: (x) => (x.glass ? 'Var' : 'Yok') },
    { id: 'psu', label: 'Güç kaynağı', get: (x) => (x.psu ? 'Dahil' : 'Dahil değil') },
  ],
  cooler: [
    { id: 'kind', label: 'Tür', get: (x) => COOLER_KIND[x.kind] },
    { id: 'rad', label: 'Radyatör', get: (x) => (x.kind === 'aio' && x.rad ? `${x.rad} mm` : null), sort: 'num' },
    { id: 'tower', label: 'Yapı', get: (x) => x.tower },
    { id: 'br', label: 'Marka', get: (x) => x.br },
    { id: 'rgb', label: 'RGB', get: (x) => (x.rgb ? 'Var' : 'Yok') },
  ],
};

// Ürün satırındaki "Tüm özellikler" bölümü: [etiket, değer] çiftleri
const yn = (v) => (v == null ? null : v ? 'Var' : 'Yok');
const u = (v, unit) => (v == null || v === '' ? null : `${v} ${unit}`);
const RAD_NAMES = { f: 'Ön', t: 'Üst', b: 'Alt', r: 'Arka', s: 'Yan' };
export const DETAILS = {
  cpu: (x) => [
    ['Soket', x.sock], ['Çekirdek / izlek', x.cores && `${x.cores} / ${x.thr || x.cores}`],
    ['Temel / artırılmış', x.base && `${x.base} / ${x.boost || '—'} GHz`], ['TDP', u(x.tdp, 'W')],
    ['Bellek', x.mem && x.mem.length ? x.mem.join(', ') + (x.mspd ? ` (${x.mspd} MHz)` : '') : null],
    ['Dahili grafik', x.igpu ? x.ign || 'Var' : 'Yok'], ['L3 önbellek', u(x.l3, 'MB')], ['PCIe', x.pcie],
    ['Mimari', x.arch], ['Nesil', x.gen], ['Çarpan kilidi', x.unl == null ? null : x.unl ? 'Açık' : 'Kapalı'],
    ['PassMark (çoklu / tekli)', x.pm && `${fmtNum(x.pm)} / ${x.pm1 ? fmtNum(x.pm1) : '—'}`], ['Çıkış yılı', x.yr],
  ],
  mobo: (x) => [
    ['Soket', x.sock], ['Yonga seti', x.chip], ['Form faktörü', x.ff], ['Bellek', x.mem && `${x.mem}, ${x.slots || '?'} yuva`],
    ['Azami bellek', u(x.mmax, 'GB')], ['Bellek hızı (OC)', u(x.mspd, 'MT/s')], ['M.2 yuvası', x.m2], ['SATA', x.sata],
    ['PCIe x16', x.x16 && `${x.x16} adet${x.pcie ? ' (PCIe ' + x.pcie + ')' : ''}`], ['Wi-Fi', x.wifi || 'Yok'],
    ['Bluetooth', yn(x.bt)], ['Ölçüler', x.w && x.h ? `${x.w} × ${x.h} mm` : null],
  ],
  gpu: (x) => [
    ['Grafik işlemcisi', x.chip], ['Üretici', x.mk], ['Bellek', x.vram && `${x.vram} GB ${x.vt || ''}`.trim()],
    ['Artırılmış frekans', u(x.boost, 'MHz')], ['Kart gücü', u(x.tdp, 'W')], ['Önerilen PSU', u(x.rec, 'W')],
    ['Güç bağlantısı', x.conn], ['Uzunluk / yükseklik / kalınlık', x.len && `${x.len} / ${x.ht || '—'} / ${x.th || '—'} mm`],
    ['Fan', x.fans], ['RGB', yn(x.rgb)], ['Renk', x.col], ['PassMark', x.pm && fmtNum(x.pm)], ['Çıkış yılı', x.yr],
  ],
  ram: (x) => [
    ['Tür', x.mt], ['Kapasite', u(x.cap, 'GB')], ['Modül', x.mods && `${x.mods} × ${x.per} GB`], ['Hız', u(x.spd, 'MT/s')],
    ['Gecikme', x.cl && `CL${x.cl}`], ['Soğutucu', yn(x.hs)], ['RGB', yn(x.rgb)], ['Yükseklik', u(x.ht, 'mm')], ['Renk', x.col],
  ],
  storage: (x) => [
    ['Tür', storageKindLabel(x.kind)], ['Kapasite', x.cap && fmtCap(x.cap)], ['Boyut', x.ff && (x.ff.startsWith('M.2') ? x.ff : `${x.ff}"`)],
    ['Arayüz', x.bus], ['Sıralı okuma / yazma', x.rd && `${fmtNum(x.rd)} / ${x.wr ? fmtNum(x.wr) : '—'} MB/s`],
    ['Devir', u(x.rpm, 'RPM')], ['Soğutucu', x.hs ? 'Var' : null],
  ],
  psu: (x) => [
    ['Güç', u(x.w, 'W')], ['Verimlilik', x.eff], ['Kablo', x.mod], ['Boyut', x.ff], ['ATX 3.x', yn(x.atx3)],
    ['PCIe 5 / 16 pin', yn(x.pcie5)], ['Ölçüler', x.dw && x.dh && x.dd ? `${x.dw} × ${x.dh} × ${x.dd} mm` : null],
    ['Fan', u(x.fan, 'mm')], ['Renk', x.col],
  ],
  case: (x) => [
    ['Kasa türü', x.ct], ['Anakart desteği', x.mb && x.mb.join(', ')], ['Azami GPU uzunluğu', u(x.gpu, 'mm')],
    ['Azami soğutucu yüksekliği', u(x.cool, 'mm')],
    ['Radyatör desteği', x.rad ? Object.entries(x.rad).map(([k, v]) => `${RAD_NAMES[k] || k} ${Math.max(...v)}`).join(', ') + ' mm' : null],
    ['Dahili fan', x.fans != null ? (x.fans ? `${x.fans}${x.fsz ? ' × ' + x.fsz + ' mm' : ''}${x.frgb ? ' (ışıklı)' : ''}` : 'Yok') : null],
    ['Güç kaynağı', x.psu ? `Dahil${x.psuw ? ' (' + x.psuw + ' W)' : ''}` : 'Dahil değil'], ['PSU konumu', x.pos],
    ['Cam panel', yn(x.glass)], ['Disk yuvası (2.5" / 3.5")', x.b25 != null || x.b35 != null ? `${x.b25 ?? '—'} / ${x.b35 ?? '—'}` : null],
    ['Ölçüler (G × Y × D)', x.w && x.h && x.d ? `${x.w} × ${x.h} × ${x.d} mm` : null], ['Renk', x.col],
  ],
  cooler: (x) => [
    ['Tür', x.kind === 'aio' ? 'Sıvı soğutma' : 'Hava soğutma'], ['Yapı', x.tower], ['Radyatör', u(x.rad, 'mm')],
    ['Yükseklik', u(x.ht, 'mm')], ['Fan', x.fans && `${x.fans}${x.fsz ? ' × ' + x.fsz + ' mm' : ''}`], ['TDP', u(x.tdp, 'W')],
    ['Soketler', x.socks && x.socks.join(', ')], ['RGB', yn(x.rgb)], ['Ekran', x.lcd ? 'Var' : null], ['Renk', x.col],
  ],
};
export const detailRows = (cat, x) => (DETAILS[cat] ? DETAILS[cat](x).filter(([, v]) => v != null && v !== '' && v !== false) : []);
