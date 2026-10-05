// Uyumluluk kuralları ve güç hesabı.
// sel: { kategori: [{ item, qty }] } biçiminde mevcut seçimler.

import { fmtCap, storageKindLabel } from './catalog.js';

export const one = (sel, cat) => (sel[cat] && sel[cat][0] ? sel[cat][0].item : null);
const qtyOf = (sel, cat) => (sel[cat] && sel[cat][0] ? sel[cat][0].qty || 1 : 0);

// ---- soket montaj grupları: aynı gruptaki soketler aynı soğutucu bağlantısını kullanır ----
const MOUNT_GROUPS = [
  ['AM4', 'AM5'],
  ['AM3+', 'AM3', 'AM2+', 'AM2', 'FM2+', 'FM2', 'FM1'],
  ['LGA1150', 'LGA1151', 'LGA1155', 'LGA1156', 'LGA1200'],
  ['LGA1700', 'LGA1851'],
  ['LGA2011', 'LGA2011-3', 'LGA2066'],
  ['TR4', 'TRX4', 'TR5', 'WRX8', 'WRX90'],
];
const groupOf = (s) => MOUNT_GROUPS.findIndex((g) => g.includes(s));

export function coolerSocketFit(cooler, sock) {
  if (!sock || !cooler.socks || !cooler.socks.length) return 'unknown';
  if (cooler.socks.includes(sock)) return 'exact';
  const g = groupOf(sock);
  if (g >= 0 && cooler.socks.some((s) => groupOf(s) === g)) return 'mount';
  return 'no';
}

// ---- form faktörü ----
const FF_RANK = { 'Mini ITX': 1, 'Mini DTX': 1.5, 'Micro ATX': 2, 'ATX': 3, 'SSI-CEB': 3.5, 'E-ATX': 4, 'SSI-EEB': 4, 'XL-ATX': 5 };
export function caseFitsBoard(cs, mb) {
  if (!mb.ff || !cs.mb || !cs.mb.length) return 'unknown';
  if (cs.mb.includes(mb.ff)) return 'yes';
  const r = FF_RANK[mb.ff];
  if (r == null) return 'unknown';
  const max = Math.max(...cs.mb.map((f) => FF_RANK[f] || 0));
  // ATX destekleyen kasa mATX / ITX kartları da taşır; tersi olmaz
  if (max >= r && r <= 3) return 'yes';
  return 'no';
}

// ---- radyatör ----
const FAM120 = [120, 240, 360, 480];
const FAM140 = [140, 280, 420];
function radFitsList(size, list) {
  if (!list || !list.length) return false;
  if (list.includes(size)) return true;
  if (FAM120.includes(size)) return list.some((p) => (FAM120.includes(p) && p >= size) || (FAM140.includes(p) && p >= size + 40));
  if (FAM140.includes(size)) return list.some((p) => FAM140.includes(p) && p >= size);
  return list.some((p) => p >= size);
}
const RAD_POS_ORDER = ['t', 'f', 's', 'b', 'r'];
export const RAD_POS_LABEL = { t: 'üst', f: 'ön', s: 'yan', b: 'alt', r: 'arka' };
// ön ve yan yuvalar bazı kasalarda aynı bölgeyi paylaşır; ikisine birden radyatör konmaz
export const RAD_SAME = { f: ['f', 's'], s: ['f', 's'] };
export function radiatorMount(cs, size, exclude = []) {
  if (!cs || !cs.rad) return null;
  const ex = exclude.flatMap((p) => RAD_SAME[p] || [p]);
  for (const p of RAD_POS_ORDER) if (!ex.includes(p) && radFitsList(size, cs.rad[p])) return p;
  return null;
}
// Hibrit sıvı soğutmalı ekran kartlarının radyatör boyutu epey'de yok; fan sayısından tahmin edilir
export const gpuRadSize = (g) => (g && g.cool === 'liquid' ? ((g.fans || 2) >= 3 ? 360 : g.fans === 1 ? 120 : 240) : 0);
// Kasadaki radyatör yerleşimi: işlemci AIO'su ve ekran kartı radyatörü aynı yuvaya konmaz
export function radiatorPlan(cs, cooler, gpu) {
  const cpuSize = cooler && cooler.kind === 'aio' ? cooler.rad || 240 : 0;
  const gpuSize = gpuRadSize(gpu);
  const res = { cpu: null, gpu: null, cpuSize, gpuSize };
  if (!cs || !cs.rad) return res;
  const fits = (size, ex = []) => RAD_POS_ORDER.filter((p) => !ex.includes(p) && radFitsList(size, cs.rad[p]));
  const cpuOpts = cpuSize ? fits(cpuSize) : [null];
  for (const c of cpuOpts) {
    const g = gpuSize ? fits(gpuSize, c ? RAD_SAME[c] || [c] : [])[0] || null : null;
    if (!gpuSize || g) return { ...res, cpu: c, gpu: g };
  }
  return { ...res, cpu: cpuOpts[0] ?? null };
}
const hasRadData = (cs) => cs && cs.rad && Object.keys(cs.rad).length > 0;

// ---- depolama sayımları ----
const isM2 = (s) => s.kind === 'nvme' || s.kind === 'm2sata';
const isSata = (s) => s.kind === 'ssd' || s.kind === 'hdd';
function storageCounts(entries) {
  let m2 = 0, sata = 0, hdd = 0, ssd = 0;
  for (const { item, qty } of entries) {
    const q = qty || 1;
    if (isM2(item)) m2 += q;
    if (isSata(item)) sata += q;
    if (item.kind === 'hdd' && item.ff !== '2.5') hdd += q;
    else if (isSata(item)) ssd += q;
  }
  return { m2, sata, hdd, ssd };
}

const archBase = (a) => (a || '').replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();

/**
 * Bir ürünün mevcut seçimlerle uyumunu kontrol eder.
 * Döndürür: [{ level: 'err' | 'warn' | 'info', msg }]
 * 'err' olan ürünler seçicide varsayılan olarak gizlenir.
 */
export function checkItem(cat, x, sel) {
  const out = [];
  const err = (msg, blocker, power) => out.push({ level: 'err', msg, blocker, power });
  const warn = (msg, power) => out.push({ level: 'warn', msg, power });
  const info = (msg) => out.push({ level: 'info', msg });

  const cs = cat === 'case' ? x : one(sel, 'case');
  const mb = cat === 'mobo' ? x : one(sel, 'mobo');
  const cpu = cat === 'cpu' ? x : one(sel, 'cpu');
  const cooler = cat === 'cooler' ? x : one(sel, 'cooler');
  const gpu = cat === 'gpu' ? x : one(sel, 'gpu');
  const ram = cat === 'ram' ? x : one(sel, 'ram');
  const ramQty = cat === 'ram' ? 1 : qtyOf(sel, 'ram');
  const psu = cat === 'psu' ? x : one(sel, 'psu');
  let storage = sel.storage || [];
  if (cat === 'storage') storage = [...storage, { item: x, qty: 1 }];

  const involves = (...cats) => cats.includes(cat);

  // İşlemci ↔ anakart
  if (cpu && mb && involves('cpu', 'mobo')) {
    if (cpu.sock && mb.sock && cpu.sock !== mb.sock) {
      err(`Soket uyumsuz: işlemci ${cpu.sock}, anakart ${mb.sock}`, cat === 'cpu' ? 'mobo' : 'cpu');
    } else {
      if (cpu.mem && cpu.mem.length && mb.mem && !cpu.mem.includes(mb.mem)) {
        err(`İşlemci ${mb.mem} desteklemiyor (${cpu.mem.join('/')})`, cat === 'cpu' ? 'mobo' : 'cpu');
      }
      if (cpu.arch && mb.archs && mb.archs.length) {
        const a = archBase(cpu.arch);
        if (!mb.archs.some((m) => archBase(m) === a)) {
          warn(`Anakart ${cpu.arch} mimarisini resmi olarak listelemiyor; BIOS güncellemesi gerekebilir`);
        }
      }
    }
  }

  // Bellek ↔ anakart / işlemci
  if (ram && involves('ram', 'mobo', 'cpu')) {
    if (mb && involves('ram', 'mobo')) {
      if (mb.mem && ram.mt && mb.mem !== ram.mt) err(`Bellek türü uyumsuz: anakart ${mb.mem}, bellek ${ram.mt}`, cat === 'ram' ? 'mobo' : 'ram');
      const sticks = (ram.mods || 1) * ramQty;
      if (mb.slots && sticks > mb.slots) err(`${sticks} modül var ama anakartta ${mb.slots} bellek yuvası var`, cat === 'ram' ? 'mobo' : 'ram');
      const total = (ram.cap || 0) * ramQty;
      if (mb.mmax && total > mb.mmax) err(`Toplam ${total} GB, anakart en fazla ${mb.mmax} GB destekliyor`, cat === 'ram' ? 'mobo' : 'ram');
      if (mb.mspd && ram.spd && ram.spd > mb.mspd) info(`Bellek anakartın desteklediği ${mb.mspd} MT/s hızında çalışır`);
    }
    if (cpu && involves('ram', 'cpu') && !(mb && mb.mem)) {
      if (cpu.mem && cpu.mem.length && ram.mt && !cpu.mem.includes(ram.mt)) err(`İşlemci ${ram.mt} desteklemiyor (${cpu.mem.join('/')})`, cat === 'ram' ? 'cpu' : 'ram');
    }
  }

  // Kasa ↔ anakart
  if (cs && mb && involves('case', 'mobo')) {
    if (caseFitsBoard(cs, mb) === 'no') err(`${mb.ff} anakart bu kasaya sığmaz (kasa: ${cs.mb.join(', ')})`, cat === 'case' ? 'mobo' : 'case');
  }

  // Kasa ↔ ekran kartı
  if (cs && gpu && involves('case', 'gpu')) {
    if (cs.gpu && gpu.len) {
      if (gpu.len > cs.gpu) err(`Ekran kartı ${gpu.len} mm, kasa en fazla ${cs.gpu} mm alıyor`, cat === 'case' ? 'gpu' : 'case');
      else if (cs.gpu - gpu.len < 15) warn(`Ekran kartı kasaya çok az payla sığıyor (${cs.gpu - gpu.len} mm)`);
    } else if (!cs.gpu && cs.d && gpu.len && gpu.len > cs.d - 30) {
      // epey'de sınır yoksa kasa derinliğinden tahmin et
      err(`Ekran kartı ${gpu.len} mm, kasa derinliği ${cs.d} mm (sığmayabilir)`, cat === 'case' ? 'gpu' : 'case');
    }
  }

  // Soğutucu ↔ işlemci / anakart soketi
  if (cooler && involves('cooler', 'cpu', 'mobo')) {
    const sock = (cpu && cpu.sock) || (mb && mb.sock);
    const other = cat === 'cooler' ? (cpu ? 'cpu' : 'mobo') : 'cooler';
    if (sock && (cat === 'cooler' || (cat === 'cpu' && cpu) || (cat === 'mobo' && !cpu))) {
      const fit = coolerSocketFit(cooler, sock);
      if (fit === 'no') err(`Soğutucu ${sock} soketini desteklemiyor`, other);
      else if (fit === 'mount') info(`${sock} için ${cooler.socks.find((s) => groupOf(s) === groupOf(sock))} montajı kullanılır`);
    }
    if (cpu && involves('cooler', 'cpu') && cooler.tdp && cpu.tdp && cooler.tdp < cpu.tdp) {
      warn(`Soğutucu ${cooler.tdp} W, işlemci ${cpu.tdp} W TDP — yetersiz kalabilir`);
    }
  }

  // Soğutucu ↔ kasa
  if (cooler && cs && involves('cooler', 'case')) {
    if (cooler.kind !== 'aio' && cooler.ht && cs.cool) {
      if (cooler.ht > cs.cool) err(`Soğutucu ${cooler.ht} mm, kasa en fazla ${cs.cool} mm yükseklik alıyor`, cat === 'case' ? 'cooler' : 'case');
    } else if (cooler.kind !== 'aio' && cooler.ht && !cs.cool && cs.w && cooler.ht > cs.w - 45) {
      // epey'de sınır yoksa kasa genişliğinden tahmin et
      err(`Soğutucu ${cooler.ht} mm, kasa genişliği ${cs.w} mm (sığmayabilir)`, cat === 'case' ? 'cooler' : 'case');
    }
    if (cooler.kind === 'aio' && cooler.rad && hasRadData(cs)) {
      const pos = radiatorPlan(cs, cooler, gpu).cpu;
      if (!pos) err(`Kasa ${cooler.rad} mm radyatör desteklemiyor`, cat === 'case' ? 'cooler' : 'case');
      else if (cat === 'cooler') info(`Radyatör kasanın ${RAD_POS_LABEL[pos]} kısmına takılır`);
    }
  }

  // Sıvı soğutmalı ekran kartının radyatörü ↔ kasa (ve işlemci AIO'su)
  if (cs && gpu && gpu.cool === 'liquid' && hasRadData(cs) && (involves('case', 'gpu') || (cat === 'cooler' && x.kind === 'aio'))) {
    const plan = radiatorPlan(cs, cooler, gpu);
    if (!plan.gpu) {
      const alone = radiatorPlan(cs, null, gpu).gpu;
      if (cat !== 'cooler' || alone) {
        warn(alone && plan.cpu
          ? `Ekran kartının ~${plan.gpuSize} mm radyatörü, işlemci radyatörüyle birlikte kasaya sığmayabilir`
          : `Ekran kartının ~${plan.gpuSize} mm radyatörü için kasada uygun yer görünmüyor`);
      }
    } else if (cat === 'gpu') info(`Ekran kartının radyatörü kasanın ${RAD_POS_LABEL[plan.gpu]} kısmına takılır`);
  }

  // Depolama ↔ anakart / kasa
  if (cat === 'storage' || ((cat === 'mobo' || cat === 'case') && storage.length)) {
    const c = storageCounts(storage);
    if (mb && involves('storage', 'mobo')) {
      if (mb.m2 != null && c.m2 > mb.m2) err(mb.m2 ? `Anakartta ${mb.m2} M.2 yuvası var, ${c.m2} M.2 sürücü seçildi` : 'Anakartta M.2 yuvası yok', cat === 'mobo' ? 'storage' : 'mobo');
      if (mb.sata != null && c.sata > mb.sata) err(mb.sata ? `Anakartta ${mb.sata} SATA portu var, ${c.sata} SATA sürücü seçildi` : 'Anakartta SATA portu yok', cat === 'mobo' ? 'storage' : 'mobo');
    }
    if (cs && involves('storage', 'case')) {
      if (cs.b35 === 0 && c.hdd > 0) err('Kasada 3.5" disk yuvası yok', cat === 'case' ? 'storage' : 'case');
      else if (cs.b35 != null && c.hdd > cs.b35) warn(`Kasada ${cs.b35} adet 3.5" yuva var`);
      if (cs.b25 != null && cs.b35 != null && c.ssd + c.hdd > cs.b25 + cs.b35) warn(`Kasada toplam ${cs.b25 + cs.b35} disk yuvası var`);
    }
  }

  // Güç kaynağı
  if (cat === 'psu') {
    const need = estimatePower(sel);
    if (cs && cs.psu) warn(`Seçili kasada ${cs.psuw ? cs.psuw + ' W ' : ''}güç kaynağı zaten var`);
    if (need.draw > 0 && x.w) {
      if (x.w < need.draw) err(`Yetersiz: sistem ~${need.draw} W çekiyor`, undefined, true);
      else if (x.w < need.rec) warn(`Önerilen en az ${need.rec} W`, true);
    }
  }
  if ((cat === 'gpu' || cat === 'cpu') && psu && psu.w) {
    const s2 = { ...sel, [cat]: [{ item: x, qty: 1 }] };
    const need = estimatePower(s2);
    if (psu.w < need.draw) err(`Güç kaynağı (${psu.w} W) yetersiz kalır: ~${need.draw} W`, 'psu', true);
    else if (psu.w < need.rec) warn(`Güç kaynağı önerilen ${need.rec} W'ın altında kalır`, true);
  }
  if (cat === 'gpu' && psu && /16|12VHPWR|12V-2x6/i.test(x.conn || '') && !psu.pcie5) {
    info('16 pin güç bağlantısı için adaptör gerekebilir');
  }

  return out;
}

export const worstLevel = (problems) =>
  problems.some((p) => p.level === 'err') ? 'err' : problems.some((p) => p.level === 'warn') ? 'warn' : 'ok';

// ---- güç tahmini ----
export function estimatePower(sel) {
  const cpu = one(sel, 'cpu'), gpu = one(sel, 'gpu'), mb = one(sel, 'mobo');
  const cooler = one(sel, 'cooler'), ram = one(sel, 'ram'), cs = one(sel, 'case');
  const parts = [];
  if (cpu) {
    const t = cpu.tdp || 65;
    const f = cpu.seg === 'Sunucu' ? 1.1 : cpu.br === 'Intel' ? (t >= 65 ? 1.75 : 1.5) : 1.35;
    parts.push(['İşlemci', Math.round(t * f)]);
  }
  if (gpu) parts.push(['Ekran kartı', gpu.tdp || 200]);
  if (mb) parts.push(['Anakart', mb.ff === 'E-ATX' || mb.ff === 'SSI-EEB' ? 60 : mb.ff === 'Mini ITX' ? 30 : 45]);
  if (ram) parts.push(['Bellek', (ram.mods || 1) * qtyOf(sel, 'ram') * (ram.mt === 'DDR5' ? 6 : 4)]);
  for (const { item, qty } of sel.storage || []) parts.push([storageKindLabel(item.kind), (item.kind === 'hdd' ? 9 : item.kind === 'nvme' ? 7 : 4) * (qty || 1)]);
  if (cooler) parts.push(['Soğutucu', cooler.kind === 'aio' ? 6 + 3 * (cooler.fans || 2) : 3 * (cooler.fans || 1)]);
  if (cs && cs.fans) parts.push(['Kasa fanları', cs.fans * 3]);
  const draw = parts.reduce((a, [, w]) => a + w, 0);
  const rec = draw ? Math.max(gpu && gpu.rec ? gpu.rec : 0, Math.ceil((draw * 1.3) / 50) * 50, 400) : 0;
  return { draw, rec, parts };
}

// ---- tüm sistemin özeti (sağ paneldeki liste) ----
export function evaluateBuild(sel, categories) {
  const res = [];
  const add = (level, msg) => res.push({ level, msg });
  const cs = one(sel, 'case'), mb = one(sel, 'mobo'), cpu = one(sel, 'cpu'), cooler = one(sel, 'cooler');
  const gpu = one(sel, 'gpu'), ram = one(sel, 'ram'), psu = one(sel, 'psu');

  // Her seçili ürünü diğerlerine karşı kontrol et (hataları tekrar etmeden topla)
  const seen = new Set();
  for (const c of categories) {
    for (const { item } of sel[c.key] || []) {
      const others = { ...sel };
      if (c.key === 'storage') others.storage = (sel.storage || []).filter((e) => e.item !== item);
      else others[c.key] = [];
      if (c.key === 'ram') others.__ramQty = qtyOf(sel, 'ram');
      for (const p of checkItemForSummary(c.key, item, others, sel)) {
        // güç uyarıları aşağıdaki tek "Güç" maddesinde toplanır
        if (p.level === 'info' || p.power || seen.has(p.msg)) continue;
        seen.add(p.msg);
        add(p.level, p.msg);
      }
    }
  }

  // Olumlu kontroller
  if (cpu && mb && cpu.sock === mb.sock) add('ok', `İşlemci ve anakart soketi uyumlu (${cpu.sock})`);
  if (ram && mb && ram.mt === mb.mem) add('ok', `Bellek türü uyumlu (${ram.mt}, ${(ram.mods || 1) * qtyOf(sel, 'ram')} modül)`);
  if (cs && mb && caseFitsBoard(cs, mb) === 'yes') add('ok', `${mb.ff} anakart kasaya uygun`);
  if (cs && gpu && cs.gpu && gpu.len && gpu.len <= cs.gpu) add('ok', `Ekran kartı kasaya sığıyor (${gpu.len}/${cs.gpu} mm)`);
  if (cs && cooler && cooler.kind !== 'aio' && cs.cool && cooler.ht && cooler.ht <= cs.cool) add('ok', `Soğutucu yüksekliği uygun (${cooler.ht}/${cs.cool} mm)`);
  const plan = cs ? radiatorPlan(cs, cooler, gpu) : null;
  if (plan && cooler && cooler.kind === 'aio' && cooler.rad && plan.cpu) add('ok', `${cooler.rad} mm radyatör kasanın ${RAD_POS_LABEL[plan.cpu]} kısmına takılır`);
  if (plan && plan.gpu) add('ok', `Ekran kartının ~${plan.gpuSize} mm radyatörü kasanın ${RAD_POS_LABEL[plan.gpu]} kısmına takılır`);

  // Güç
  const power = estimatePower(sel);
  const effPsuW = psu ? psu.w : cs && cs.psu ? cs.psuw : null;
  if (power.draw && effPsuW) {
    if (effPsuW < power.draw) add('err', `Güç kaynağı yetersiz: ${effPsuW} W < ~${power.draw} W`);
    else if (effPsuW < power.rec) add('warn', `Güç kaynağı ${effPsuW} W; önerilen ${power.rec} W`);
    else add('ok', `Güç kaynağı yeterli (${effPsuW} W ≥ ${power.rec} W önerilen)`);
  }

  // Eksikler
  if (cpu && !cpu.igpu && !gpu) add('err', 'Bu işlemcinin dahili grafiği yok; ekran kartı gerekli');
  if (cpu && cpu.igpu && !gpu && mb && mb.vout === 0) add('warn', 'Anakartta görüntü çıkışı yok; ekran kartı gerekebilir');
  const missing = categories
    .filter((c) => c.required && !(sel[c.key] && sel[c.key].length))
    .filter((c) => !(c.key === 'psu' && cs && cs.psu))
    .map((c) => c.label);
  if (missing.length) add('info', `Eksik parçalar: ${missing.join(', ')}`);

  const order = { err: 0, warn: 1, ok: 2, info: 3 };
  return res.sort((a, b) => order[a.level] - order[b.level]);
}

// Özet için: RAM adedini doğru hesaba katmak adına checkItem'i sarar
function checkItemForSummary(cat, item, others, full) {
  if (cat === 'ram') {
    const q = others.__ramQty || 1;
    const copy = { ...item, cap: (item.cap || 0) * q, mods: (item.mods || 1) * q };
    return checkItem('ram', copy, others);
  }
  if (cat === 'psu') {
    // psu kontrolü güç hesabını tüm sisteme göre yapar
    return checkItem('psu', item, { ...full, psu: [] });
  }
  return checkItem(cat, item, others);
}

export function describeCapacity(sel) {
  const ram = one(sel, 'ram');
  const r = ram ? `${(ram.cap || 0) * qtyOf(sel, 'ram')} GB RAM` : null;
  const st = (sel.storage || []).reduce((a, { item, qty }) => a + (item.cap || 0) * (qty || 1), 0);
  return [r, st ? `${fmtCap(st)} depolama` : null].filter(Boolean).join(' · ');
}
