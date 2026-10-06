// Ortak yerleşim ("sığma") modeli: kasa içi geometri, parça ölçüleri ve yerleşim planı.
// 3D sahne ile uyumluluk denetimi aynı hesabı kullanır; böylece uyumlu sayılan bir sistemde
// parçalar 3D'de birbirine geçmez, geçecekse bu modül bunu uyumsuzluk olarak bildirir.
// Birim mm. Dünya ekseni: +x kasanın önü, +y yukarı, +z cam yan panel; orijin kasa tabanının ortası.
// Anakart yerel ekseni: orijin kartın üst-arka köşesi; u öne (+x), v aşağı (-y), z karttan dışarı (+z).

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const memo = (fn) => {
  const m = new WeakMap();
  let nil;
  return (x) => {
    if (!x || typeof x !== 'object') return (nil ??= fn(null));
    let v = m.get(x);
    if (v === undefined) { v = fn(x); m.set(x, v); }
    return v;
  };
};

// ===================================================================== anakart
export const FF_DIMS = {
  'Mini ITX': [170, 170], 'Mini DTX': [170, 203], 'Micro ATX': [244, 244], 'ATX': [244, 305], 'E-ATX': [277, 305],
  'SSI-EEB': [330, 305], 'SSI-CEB': [305, 267], 'XL-ATX': [345, 262],
};
const DIMM_FROM_SOCKET = 62; // işlemci soketi merkezinden ilk bellek yuvasına (gerçek kartlarda ~58-66 mm)
const DIMM_PITCH = 9.6; // bellek yuvaları arası
const RAM_HALF = 3.4; // bellek modülünün yuva ekseninden yarı kalınlığı
const IO_DEPTH = 29; // arka I/O örtüsü kartın arka kenarından bu kadar içeri uzanır (3D model de böyle çizer)
const DIMM_IO_GAP = 6; // soketin iki yanında yuva olan kartlarda dıştaki yuva ile I/O örtüsü arası

export const boardLayout = memo((x) => {
  const ff = x ? x.ff : 'ATX';
  const def = FF_DIMS[ff] || FF_DIMS.ATX;
  let w = (x && x.w) || def[0], h = (x && x.h) || def[1];
  w = clamp(w, 150, 360); h = clamp(h, 150, 340);
  const itx = w < 200 && h < 215;
  const sock = (x && x.sock) || 'AM5';
  const big = /TR|WRX|LGA4677|LGA3647|LGA4189|LGA2066|LGA2011/.test(sock);
  const s = itx ? { u: w * 0.5 - 12, v: 66 } : { u: Math.min(116, w * 0.46), v: big ? 105 : 80 };
  const nSlots = clamp((x && x.slots) || (itx ? 2 : 4), 1, 8);
  const pitch = DIMM_PITCH;
  if (nSlots === 8 && !itx) {
    // Soketin iki yanında 4'er yuva (HEDT / iş istasyonu kartları): soldaki grubun en dış yuvası arka I/O
    // örtüsünün önünde kalmalı; gerçek kartlarda soket bu yüzden daha öndedir. Sağdaki grup ise kartın ön
    // kenarındaki 24 pin konnektöre taşmayacak kadar öne alınabilir.
    const minU = IO_DEPTH + DIMM_IO_GAP + RAM_HALF + 3 * pitch + DIMM_FROM_SOCKET;
    const maxU = w - 14 - RAM_HALF - 3 * pitch - DIMM_FROM_SOCKET;
    s.u = Math.max(s.u, Math.min(minU, maxU));
  }
  const dimm = [];
  if (nSlots === 8) {
    for (let i = 0; i < 4; i++) dimm.push({ u: s.u - DIMM_FROM_SOCKET - (3 - i) * pitch, v: s.v + 4 });
    for (let i = 0; i < 4; i++) dimm.push({ u: s.u + DIMM_FROM_SOCKET + i * pitch, v: s.v + 4 });
  } else {
    const startU = itx ? w - 16 - (nSlots - 1) * pitch : s.u + DIMM_FROM_SOCKET;
    // yuva + mandallar 151 mm: kartın üst kenarından taşmasın
    for (let i = 0; i < nSlots; i++) dimm.push({ u: Math.min(startU + i * pitch, w - 16 - (nSlots - 1 - i) * pitch), v: Math.max(s.v + 4, 77) });
  }
  const pcie = [];
  const P = 20.32; // genişleme yuvası aralığı
  const p1 = itx ? h - 24 : s.v + (big ? 95 : 82);
  const nX16 = clamp((x && x.x16) || (itx ? 1 : 2), 1, 4);
  const nX1 = clamp((x && x.x1) || 0, 0, 3);
  const nM2 = clamp(x && x.m2 != null ? x.m2 : 2, 0, 6);
  const kMax = Math.max(1, Math.floor((h - 14 - p1) / P) + 1);
  const x16Ks = itx ? [0] : [0, 3, 6].filter((k) => k < kMax).slice(0, nX16);
  x16Ks.forEach((k) => pcie.push({ u: 52, v: p1 + k * P, len: 89, x16: true }));
  // M.2: birincisi işlemci ile ilk PCIe arasında, diğerleri x16 yuvalarının arasında
  const m2Cands = [{ u: itx ? 42 : 58, v: p1 - 30 }];
  if (!itx && kMax > 2) m2Cands.push({ u: 58, v: p1 + 1.5 * P });
  if (!itx && kMax > 5) m2Cands.push({ u: 58, v: p1 + 4.5 * P }, { u: 150, v: p1 + 4.5 * P });
  const m2 = [];
  for (let i = 0; i < nM2; i++) {
    if (i < m2Cands.length) m2.push({ ...m2Cands[i], len: 80, back: false });
    else { const j = i - m2Cands.length; m2.push({ u: 50 + (j % 2) * 95, v: (itx ? 40 : 120) + Math.floor(j / 2) * 40, len: 80, back: true }); }
  }
  // x1 yuvaları yalnızca M.2 ile çakışmayan aralıklara
  const x1Ks = [];
  if (!itx) {
    if (nM2 < 2 && kMax > 1) x1Ks.push(1);
    if (nM2 < 3 && kMax > 4) x1Ks.push(4);
  }
  x1Ks.slice(0, nX1).forEach((k) => pcie.push({ u: 52, v: p1 + k * P, len: 25, x16: false }));
  const chip = itx ? null : { u: w - 14 - 28, v: clamp(p1 + 1.5 * P, p1 + 18, h - 30) };
  // VRM soğutucuları soketin üstünde ve solunda; üstteki, soğutucu fanlarının altına girmesin diye soketin
  // soluna kadar uzanır. Arka I/O örtüsü ilk PCIe yuvasının üstünde biter.
  const vrmU1 = Math.max(60, Math.min(w * 0.55, s.u - 25));
  const ioH = Math.max(60, Math.min(s.v + 75, p1 - 18, h * 0.55));
  const vrmLeft = !dimm.some((d) => d.u < s.u && d.u > 20);
  return { w, h, itx, sock, socket: s, dimm, pcie, m2, chip, atx24: { u: w - 6, v: s.v + 36 }, vrmU1, ioH, vrmLeft, p1 };
});

// Kartın üzerindeki hacimli bileşenler (anakart yerel kutuları). makeMotherboard aynı ölçüleri çizer.
export function boardParts(L) {
  const s = L.socket;
  const parts = [
    { tag: 'pcb', u0: 0, u1: L.w, v0: 0, v1: L.h, z0: -2, z1: 16 }, // kart + alçak bileşenler (yuvalar, soketler)
    { tag: 'io', u0: 0.5, u1: IO_DEPTH, v0: 6, v1: 6 + L.ioH, z0: 0, z1: 40.5 },
    { tag: 'vrm', u0: 28, u1: L.vrmU1, v0: 8, v1: 32, z0: 0, z1: 31 },
  ];
  if (L.vrmLeft) parts.push({ tag: 'vrm', u0: 29, u1: 51, v0: 12, v1: s.v + 40, z0: 0, z1: 34 });
  return parts;
}

// anakart seçilmemişken yer tutucu kartın ölçüsü: kasanın desteklediği ve sığan en büyük form faktörü
const GHOST = Object.fromEntries(Object.keys(FF_DIMS).map((f) => [f, { ff: f }]));
export function ghostLayout(cs) {
  if (!cs) return boardLayout(null);
  const G = caseGeom(cs);
  const list = (cs.mb && cs.mb.length ? cs.mb : ['ATX']).filter((f) => FF_DIMS[f]).sort((a, b) => FF_DIMS[b][1] - FF_DIMS[a][1]);
  const ff = list.find((f) => FF_DIMS[f][1] <= G.maxBoardHFit + 1) || list[list.length - 1] || 'ATX';
  return boardLayout(GHOST[ff] || null);
}

// RAM modüllerinin dolduracağı yuvalar (işlemciye yakın taraftan A1, A2, B1, B2…)
export function ramSlotOrder(nSlots, n) {
  if (n >= nSlots) return [...Array(nSlots).keys()];
  if (nSlots === 4) return n === 1 ? [1] : n === 2 ? [1, 3] : [0, 1, 3].slice(0, n);
  if (nSlots === 8) return [1, 3, 5, 7, 0, 2, 4, 6].slice(0, n).sort((a, b) => a - b);
  return [...Array(n).keys()];
}

// ===================================================================== parça ölçüleri
// Ekran kartı: Hreal = epey'deki yükseklik (PCIe uçlarının altından üst kenara).
// Model yerelinde z=0 PCB'nin alt kenarı; altın uçlar z=-6..0; soğutucu z=3'ten başlar; kapak üstü H+4.3, güç soketi H+5.
export function gpuPlugs(x) {
  if (Array.isArray(x.pw) && x.pw.length) return x.pw.slice(0, 3).map((p) => (+p >= 12 ? '16' : +p === 6 ? '6' : '8'));
  const c = x.conn || '';
  if (/pinsiz/i.test(c)) return [];
  if (/16|12V/i.test(c)) return ['16'];
  if (!c && x.tdp && x.tdp <= 75) return [];
  const t = x.tdp || 200;
  return t > 300 ? ['8', '8', '8'] : t > 200 ? ['8', '8'] : ['8'];
}
// ölçüsü eksik kartlar için fan sayısına göre tipik (üst çeyrek) değerler
const GPU_DEF = { len: [249, 241, 249, 329, 358], ht: [127, 112, 127, 140, 149], th: [46, 39, 46, 61, 76] };
export const gpuDims = memo((x) => {
  const cool = (x && x.cool) || 'fan';
  const lp = !!(x && x.lp);
  const nf = clamp((x && x.fans) || 0, 0, 4);
  const L = clamp((x && x.len) || (lp ? 170 : GPU_DEF.len[nf]), 140, 390);
  const Hreal = clamp((x && x.ht) || (lp ? 69 : GPU_DEF.ht[nf]), 60, 175);
  const H = Hreal - 10;
  let T = (x && x.th) || (cool === 'block' ? 24 : cool === 'passive' ? 36 : cool === 'liquid' ? 40 : lp ? (nf <= 1 ? 20 : 38) : GPU_DEF.th[nf]);
  if (T > Hreal * 0.8) T = 50; // kalınlık ile yükseklik karışmışsa
  T = clamp(T, 16, 90);
  const plugs = x ? gpuPlugs(x) : ['8'];
  return { L, H, Hreal, T, cool, lp, plugs };
});
// Kartın anakarttaki yeri: braket arka kenardan 8 mm geride, PCB alt kenarı kartın 9 mm üstünde
export const GPU_OFFSET = { u: -8, z: 9 };
export function gpuSlot(L) {
  return L.pcie.find((q) => q.x16) || { u: 52, v: L.socket.v + 82 };
}
// güç soketlerinin kart üzerindeki yeri (x başlangıcı ve genişliği); kablolar buradan çıkar
export function gpuSocketsLayout(gd) {
  const out = [];
  let px = gd.L * 0.6;
  for (const p of gd.plugs) {
    const w = p === '16' ? 18 : p === '6' ? 15 : 20;
    out.push({ x: px + w / 2, w, type: p });
    px += w + 3;
  }
  return out;
}

// Güç kaynağı: epey ölçüleri bazen karışık (ör. 180 × 56 × 150); standart gövde ölçüleriyle düzeltilir
export const psuDims = memo((x) => {
  const ff = (x && x.ff) || 'ATX';
  const modular = !!(x && x.mod && !/değil|olmayan/i.test(x.mod));
  if (/SFX/i.test(ff)) return { dw: 125, dh: 63.5, dd: /SFX-L/i.test(ff) ? 130 : 100, sfx: true, modular };
  // ATX: genişlik 150 ve yükseklik 86 standarttır; uzunluk 140-220 mm arası değişir
  let dd = x && x.dd >= 120 && x.dd <= 240 ? x.dd : 150;
  if (x && x.dw > 160 && x.dw <= 240 && x.dd && x.dd <= 160) dd = x.dw; // genişlik/uzunluk karışmış
  return { dw: 150, dh: 86, dd: clamp(dd, 140, 220), sfx: false, modular };
});
// PSU gövdesi + ön yüzdeki kablolar (modüler değilse kablo demeti ~27 mm çıkar)
export function psuBodyLen(pd) { return pd.dd + (pd.modular ? 2 : 12); }

// Bellek modülü yüksekliği (modülün alt kenarından)
export const ramDims = memo((x) => {
  const bare = !!(x && x.hs === 0 && !x.rgb);
  const ht = bare ? 31 : clamp((x && x.ht) || (x && x.rgb ? 44 : 35), 30, 60);
  return { ht, bare };
});
export const RAM_Z = 2.2; // modülün alt kenarı kartın 2,2 mm üstünde (yuvanın içinde)

// Radyatör (+ fanları) ölçüleri; epey'deki uzunluk/kalınlık hatalıysa boyut sınıfından türetilir
export function radDims(spec) {
  const size = (spec && spec.rad) || 240;
  const fam140 = size % 140 === 0 && size % 120 !== 0;
  const fsz = fam140 ? 140 : 120;
  const n = Math.max(1, Math.round(size / fsz));
  let L = spec && spec.radl;
  if (!L || L < size + 8 || L > size + 70) L = size + 35;
  let T = spec && spec.radt;
  if (!T || T < 18 || T > 60) T = 27;
  const Wd = fsz + 2;
  // montaj kutusu (radyatör yerelinde): x ±L/2, y [-T/2-25.5, T/2+2] (fanlar -y), z ±(Wd+4)/2
  return { size, fsz, n, L, T, Wd, yMin: -T / 2 - 25.5, yMax: T / 2 + 2, zHalf: (Wd + 4) / 2, thick: T + 27.5 };
}
export const gpuRadSize = (g) => (g && g.cool === 'liquid' ? ((g.fans || 2) >= 3 ? 360 : g.fans === 1 ? 120 : 240) : 0);

// İşlemci soğutucusu geometrisi (soket merkezine göre: x kartın u yönü, y kartın -v yönü;
// z soğutucu tabanından, taban kartın COOLER_Z mm üstünde)
export const COOLER_Z = 7.6;
export function coolerType(x) {
  const t = ((x && x.tower) || '').toLocaleLowerCase('tr');
  if ((x && x.kind === 'stock') || /stok/.test(t)) return (x.pipes || 0) >= 3 || (x.ht || 0) > 100 ? 'low' : 'radial';
  if (/çift|dual/.test(t)) return 'dual';
  if (/alçak|düşük|low|top|yatay|üstten/.test(t)) return 'low';
  return 'single';
}
// epey'de "Uzunluk"/"Genişlik" ürüne göre karışık girilmiş: fan boyutuna yakın olan genişliktir
function towerFootprint(x, fsz, defDepth) {
  const vals = [x.len, x.wid].filter((v) => v && v >= 40 && v <= 200);
  if (vals.length === 2) {
    const [a, b] = vals;
    const width = Math.abs(a - (fsz + 5)) <= Math.abs(b - (fsz + 5)) ? a : b;
    const depth = width === a ? b : a;
    return { width, depth };
  }
  if (vals.length === 1) return Math.abs(vals[0] - (fsz + 5)) < 15 ? { width: vals[0], depth: defDepth } : { width: fsz + 5, depth: vals[0] };
  return { width: fsz + 5, depth: defDepth };
}
export const coolerGeom = memo((x) => {
  const type = coolerType(x);
  if (type === 'radial') {
    const Hc = clamp(x.ht || 58, 38, 100);
    const wid = clamp(x.wid || x.fsz || 95, 70, 130), len = clamp(x.len || wid, 70, 130);
    const R = Math.min(wid, len) / 2;
    const fanT = Hc < 50 ? 12 : 20;
    const finR = Math.min(R - 2, 54);
    return { type, Hc, R, finR, fanT, top: Hc,
      boxes: [{ tag: 'fins', x0: -finR, x1: finR, y0: -finR, y1: finR, z0: 4, z1: Hc - fanT - 1 },
        { tag: 'fan', x0: -R, x1: R, y0: -R, y1: R, z0: Hc - fanT - 1, z1: Hc }] };
  }
  if (type === 'low') {
    const Hc = clamp(x.ht || 58, 30, 190);
    const fsz = clamp(x.fsz || 120, 80, 140);
    const ex = clamp(x.wid || fsz + 5, 80, 170); // kart u yönü
    const ey = clamp(x.len || ex, 80, 170);      // kart v yönü
    const fanT = Hc < 60 ? 15 : 25;
    const fanSize = Math.min(fsz, ex - 4, ey - 4);
    return { type, Hc, fsz: fanSize, ex, ey, fanT, finZ0: 9, finZ1: Hc - fanT - 1, top: Hc,
      boxes: [{ tag: 'fins', x0: -ex / 2, x1: ex / 2, y0: -ey / 2, y1: ey / 2, z0: 9, z1: Hc - fanT - 1 },
        { tag: 'fan', x0: -fanSize / 2, x1: fanSize / 2, y0: -fanSize / 2, y1: fanSize / 2, z0: Hc - fanT, z1: Hc }] };
  }
  const towers = type === 'dual' ? 2 : 1;
  const Hc = clamp(x.ht || 155, 60, 190);
  const fsz = clamp(x.fsz || 120, 80, 140);
  const fp = towerFootprint(x, fsz, towers === 2 ? 130 : 80);
  const width = clamp(fp.width, Math.max(90, fsz - 5), fsz + 35);
  const depthTotal = clamp(fp.depth, towers === 2 ? 100 : 50, 175);
  const fanCount = clamp(x.fans || (towers === 2 ? 2 : 1), 1, 3);
  const stackDepth = towers === 2 ? (depthTotal - 25 * Math.max(1, fanCount - 1)) / 2 : depthTotal - 25 * fanCount;
  const sd = clamp(stackDepth, 22, 70);
  const zStart = towers === 2 ? 52 : 38, zEnd = Hc - 3;
  const stackCenters = towers === 2 ? [-(sd / 2 + 12.5), sd / 2 + 12.5] : [-(fanCount > 1 ? 0 : 12.5)];
  const fanZ = clamp(zStart + (zEnd - zStart) / 2, fsz / 2 + 4, Hc - fsz / 2);
  const fanXs = (towers === 2
    ? (fanCount >= 2 ? [stackCenters[1] + sd / 2 + 12.5, 0] : [0])
    : [stackCenters[0] + sd / 2 + 12.5, ...(fanCount > 1 ? [stackCenters[0] - sd / 2 - 12.5] : [])]).slice(0, fanCount);
  const boxes = stackCenters.map((cx) => ({ tag: 'fins', x0: cx - sd / 2 - 1, x1: cx + sd / 2 + 1, y0: -width / 2 - 1, y1: width / 2 + 1, z0: zStart, z1: Hc + 1.5 }));
  boxes.push({ tag: 'base', x0: -35, x1: 35, y0: -21, y1: 21, z0: 0, z1: 12 });
  const fans = fanXs.map((fx) => ({ x: fx, z: fanZ, size: fsz }));
  return { type, Hc, fsz, width, depthTotal, fanCount, sd, zStart, zEnd, stackCenters, fanZ, fans, boxes, top: Hc + 1.5 };
});
export const PUMP = { r: 33, z1: 50, fitY: 41 };
// pompa bloğu: yarıçap ~33 mm, yükseklik epey'deki pompa ölçüsünden (yoksa 50 mm)
export const pumpDims = (x) => ({ r: 33, z1: clamp((x && x.ph) || 50, 35, 90), fitY: 41 });

// ===================================================================== kasa
export const caseDims = (cs) => {
  let W = cs.w || ({ 'Mini ITX': 200, 'Micro ATX': 210 }[cs.ct] ?? 225);
  let H = cs.h || ({ 'Mini ITX': 340, 'Micro ATX': 420, 'E-ATX': 520 }[cs.ct] ?? 470);
  let D = cs.d || ({ 'Mini ITX': 360, 'Micro ATX': 400, 'E-ATX': 500 }[cs.ct] ?? 450);
  if (W > D * 1.35 && D < 300) [W, D] = [D, W];
  // yatık (masaüstü/rack) kasalar: kart yatay durur; model dik kasa gibi kurar
  let horiz = false;
  if (H < 250 && W > H) { [W, H] = [H, W]; horiz = true; }
  return { W: clamp(W, 90, 380), H: clamp(H, 200, 720), D: clamp(D, 200, 680), horiz };
};
// kasanın desteklediği en geniş anakart (kasa derinliği yönünde)
function maxBoardW(cs) {
  const list = cs.mb && cs.mb.length ? cs.mb : [cs.ct || 'ATX'];
  let best = 0;
  for (const f of list) { const d = FF_DIMS[f]; if (d && d[0] > best) best = d[0]; }
  return best || 244;
}
// kasanın desteklediği en büyük anakartın yüksekliği
function maxBoardH(cs) {
  const list = cs.mb && cs.mb.length ? cs.mb : [cs.ct || 'ATX'];
  let best = 0;
  for (const f of list) { const d = FF_DIMS[f]; if (d && d[1] > best) best = d[1]; }
  return best || 305;
}
export const caseArch = (cs, W, horiz = false) => {
  const p = (cs.pos || '').toLocaleLowerCase('tr');
  if (horiz) return 'bottomFront';
  // "Yan Cephe" her zaman çift bölme demek değil: dar ya da cam-kart arası tek bölmeli kasa gibi olanlar hariç
  if (/yan/.test(p) && W >= 262 && (!cs.cool || W - cs.cool >= 90)) return 'dual';
  if (/üst/.test(p)) return /ön/.test(p) ? 'topFront' : 'topRear';
  if (/alt/.test(p) && /ön/.test(p)) return 'bottomFront';
  return 'std';
};
const ATX_DH = 86;
const SHROUD_MIN = 89; // ATX PSU (86) + örtü sacı (2 mm) + pay

export const caseGeom = memo((cs) => {
  const { W, H, D, horiz } = caseDims(cs);
  let arch = caseArch(cs, W, horiz);
  // ekran kartı arka bölmede dikey duran (sandviç / "The Tower") kasalar
  const vgpu = !!(cs.gpu && cs.d && cs.gpu > cs.d && (cs.ct === 'Mini ITX' || (cs.h && cs.h >= 1.6 * cs.d) || /The Tower|Revolt|H2 Flow|Evolv Shift|Ncore/i.test(cs.n || '')));
  const t = 3;
  const xR = -D / 2 + t, xF = D / 2 - t, zBack = -W / 2 + t, zGlass = W / 2;
  const bh = maxBoardH(cs), bw = maxBoardW(cs);
  // "Yan Cephe" diye geçen dar (tek bölmeli) kasalarda PSU çoğu zaman önde durur; altta örtülü yerleşime
  // kart sığmıyorsa PSU'yu öne al (ör. DeepCool CH260, Asus Prime AP201)
  if (arch === 'std' && /yan/i.test(cs.pos || '') && H - 2 * t - 4 < SHROUD_MIN + 1 + bh + 3) arch = 'bottomFront';
  // ayak yüksekliği: alçak kasalarda kart sığsın diye kısalır (gerçek bütçe kasalarında boşluklar dar).
  // Önde duran PSU ile kartın çakışıp çakışmadığı seçilen kart ve PSU ölçüsüyle planda denetlenir.
  const need = arch === 'std' ? SHROUD_MIN + 1 + bh + 3 : arch === 'topRear' ? 1 + bh + 2 + ATX_DH + 0.5 : 1 + bh + 3;
  const f = clamp(H - 2 * t - need, 4, 14);
  const yB = f, floorY = f + t, yT = H - t;

  // anakart tepsisi: cam ile kart arası, epey'deki "işlemci soğutucu yüksekliği" sınırına göre ayarlanır
  let trayZ;
  if (arch === 'dual') {
    // çift bölme: tepsinin arkası ~ genişlik - soğutucu sınırı - 28 mm (PSU sığsın diye en az 90 mm)
    trayZ = zBack + (cs.cool ? clamp(W - cs.cool - 28, 90, 110) : 96);
  } else if (vgpu && cs.cool) {
    // sandviç kasa: soğutucu bölmesi soğutucu sınırı kadar, geri kalanı ekran kartı bölmesi
    trayZ = clamp(zGlass - 1 - cs.cool - COOLER_Z - 8, zBack + 8, zGlass - 60);
  } else {
    trayZ = -W / 2 + clamp(W * 0.12, 8, 34);
    if (cs.cool) trayZ = Math.min(trayZ, zGlass - 1 - cs.cool - COOLER_Z - 8);
    trayZ = Math.max(trayZ, zBack + 8);
  }
  const boardZ = trayZ + 8;
  const mainZ = (trayZ + zGlass) / 2;

  // güç kaynağı örtüsü (yalnız klasik altta PSU'lu kasalarda)
  let shroudTop = floorY;
  if (arch === 'std') shroudTop = floorY + clamp(H * 0.2, SHROUD_MIN, Math.max(SHROUD_MIN, Math.min(104, yT - floorY - bh - 8)));
  const frontRad = !!(cs.rad && ((cs.rad.f && cs.rad.f.length) || (cs.rad.s && cs.rad.s.length)));
  const frontGap = arch === 'dual' ? 20 : clamp(D * 0.11, 38, 70);
  const radData = !!(cs.rad && Object.keys(cs.rad).length);
  const shroudX1 = xF - (frontRad || !radData ? 62 : 28); // ön radyatör için örtüde pay
  const shroudZ1 = Math.min(zGlass - 1.5, Math.max(zGlass - 6, 78)); // dar kasalarda PSU'ya yer kalsın

  // anakart konumu: üst radyatör destekleyen kasalarda kartın üstünde ~60 mm boşluk bırakılır
  const boardRearX = xR + 10;
  const topRad = !!(cs.rad && cs.rad.t && cs.rad.t.length);
  const zoneBottom = arch === 'std' ? shroudTop + 1 : floorY + 1;
  const zoneTop = arch === 'topRear' ? yT - ATX_DH - 2.5 : yT - 3;
  const prefGap = topRad ? 60 : clamp((yT - zoneBottom - bh) * 0.5, 16, 64);
  let boardTopY = Math.min(zoneTop, yT - prefGap);
  if (boardTopY - bh < zoneBottom) boardTopY = Math.min(zoneTop, zoneBottom + bh);
  const maxBoardHFit = boardTopY - zoneBottom; // bu kasaya sığan en uzun kart

  // ---- kasa fanı yuvaları ----
  const fsz = cs.fsz && cs.fsz >= 80 ? Math.min(cs.fsz, 200) : 120;
  const io1 = boardZ + 42; // arka I/O örtüsünün cama yakın kenarı (+pay)
  const fanZBeside = (size, base) => clamp(Math.max(base, io1 + size / 2), zBack + size / 2 + 1, zGlass - size / 2 - 2);
  let rearSize = Math.min(fsz, 140);
  while (rearSize > 80 && io1 + rearSize > zGlass - 2) rearSize -= 10;
  const rearOk = io1 + rearSize <= zGlass - 2;
  const rearTopY = arch === 'topRear' ? yT - ATX_DH - 4 : yT - 22;
  const slots = [];
  const rear = rearOk ? { g: 'r', pos: [xR + 13.5, rearTopY - rearSize / 2, fanZBeside(rearSize, mainZ)], axis: 'x', size: rearSize } : null;
  const fronts = [];
  if (arch !== 'dual') {
    const n = Math.min(3, Math.floor((yT - floorY - 30) / (fsz + 4)));
    for (let i = 0; i < n; i++) fronts.push({ g: 'f', pos: [xF - 15, yT - 30 - fsz / 2 - i * (fsz + 4), 0], axis: 'x', size: fsz });
  }
  const tops = [];
  {
    const n = Math.min(3, Math.floor((D - 150) / (fsz + 4)));
    const zTop = boardTopY + 1 > yT - 27 ? fanZBeside(fsz, mainZ + 6) : clamp(mainZ + 6, zBack + fsz / 2 + 1, zGlass - fsz / 2 - 2);
    for (let i = 0; i < n; i++) {
      const x = xF - frontGap - 15 - fsz / 2 - i * (fsz + 4);
      if (x - fsz / 2 < xR + 30) break;
      tops.push({ g: 't', pos: [x, yT - 14, zTop], axis: 'y', size: fsz });
    }
  }
  const bottoms = [];
  if (arch === 'dual') {
    const n = Math.min(3, Math.floor((D - 80) / (fsz + 4)));
    for (let i = 0; i < n; i++) bottoms.push({ g: 'b', pos: [xF - 30 - fsz / 2 - i * (fsz + 4), floorY + 14, mainZ], axis: 'y', size: fsz });
  }
  if (arch === 'dual') slots.push(...bottoms, ...tops, ...(rear ? [rear] : []));
  else slots.push(...(rear ? [rear] : []), ...fronts, ...tops);
  const nFans = clamp(cs.fans || 0, 0, 10);
  const fans = slots.slice(0, nFans).map((s) => ({ ...s, box: fanBox(s) }));
  const rearSlot = rear || { g: 'r', pos: [xR + 13.5, rearTopY - 60, fanZBeside(120, mainZ)], axis: 'x', size: 120 };

  // ---- kablo geçiş lastikleri ----
  const trayX1 = xF - frontGap;
  const grommets = [0.72, 0.42, 0.16].map((yy, i) => ({ x: trayX1 - 16, y: shroudTop + (yT - shroudTop) * yy, h: [70, 55, 40][i] }));

  // ---- disk yuvaları (öncelik sırasıyla) ----
  const back = trayZ - zBack; // tepsinin arkasındaki boşluk
  const bays35 = [], bays25 = [];
  const hdd = { L: 147, T: 26.1, W: 101.6 };
  if (arch === 'std') {
    const n = Math.min(3, Math.max(0, Math.floor((shroudTop - floorY - 3) / 29)));
    for (const x of [xF - 30 - hdd.L / 2, shroudX1 - 6 - hdd.L / 2, xF - 3 - hdd.L / 2]) {
      for (let i = 0; i < n; i++) bays35.push(flatBay(x, floorY + 1.5 + hdd.T / 2 + i * 29, shroudZ1 - 2 - hdd.W / 2, hdd));
    }
  }
  if (back >= 31) {
    for (let i = 0; i < 3; i++) {
      const y = yT - 20 - hdd.W / 2 - i * (hdd.W + 10);
      if (y - hdd.W / 2 < (arch === 'std' ? shroudTop : floorY) + 4) break;
      bays35.push(standBay(xF - 34 - hdd.L / 2, y, trayZ - 2 - hdd.T / 2, hdd));
    }
  }
  if (arch !== 'std' && arch !== 'dual') {
    for (let i = 0; i < 3; i++) bays35.push(flatBay(xF - 32 - hdd.L / 2, floorY + 1.5 + hdd.T / 2 + i * 30, mainZ, hdd));
    // altta duran PSU'nun üstünde
    for (let i = 0; i < 2; i++) bays35.push(flatBay(xF - 32 - hdd.L / 2, floorY + ATX_DH + 4 + hdd.T / 2 + i * 30, mainZ, hdd));
  }
  const ssd = { L: 100, T: 9.5, W: 69.85 };
  if (back >= 12) {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
      const y = yT - 60 - row * 80;
      if (y - ssd.W / 2 < (arch === 'std' ? shroudTop : floorY) + 4) continue;
      bays25.push(standBay(xR + 70 + col * 115, y, trayZ - 1.5 - ssd.T / 2, ssd));
    }
  }
  if (arch === 'std') for (let i = 0; i < 4; i++) bays25.push(flatBay(shroudX1 - 8 - ssd.L / 2 - (i >> 1) * 108, shroudTop + 0.5 + ssd.T / 2, mainZ + (i % 2 ? 40 : -40), ssd));
  else for (let i = 0; i < 2; i++) bays25.push(flatBay(xF - 32 - ssd.L / 2, floorY + 1.5 + ssd.T / 2 + 92 + i * 12, mainZ, ssd));

  // ---- kasanın kendi engelleri (örtünün üst ve yan duvarı) ----
  const obstacles = [];
  if (arch === 'std') {
    obstacles.push({ x0: xR, x1: shroudX1, y0: shroudTop - 2, y1: shroudTop, z0: trayZ, z1: shroudZ1, tag: 'shroud', cat: 'case' });
    obstacles.push({ x0: xR, x1: shroudX1, y0: floorY, y1: shroudTop, z0: shroudZ1 - 1, z1: shroudZ1 + 1, tag: 'shroud', cat: 'case' });
  }
  // tepsi (anakartın arkası); üstte PSU'lu kasalarda PSU'nun altında biter
  obstacles.push({ x0: xR, x1: trayX1, y0: shroudTop, y1: arch === 'topRear' ? yT - ATX_DH - 2 : yT, z0: trayZ - 0.75, z1: trayZ + 0.75, tag: 'tray', cat: 'case' });

  return {
    W, H, D, t, f, yB, floorY, yT, xR, xF, zBack, zGlass, arch, dual: arch === 'dual', topPsu: arch === 'topRear' || arch === 'topFront', horiz, vgpu, topRad,
    hasShroud: arch === 'std', shroudTop, shroudX1, shroudZ1, frontGap, trayZ, trayX1, boardZ, mainZ, boardRearX, boardTopY, maxBoardHFit,
    fans, slots, rearSlot, grommets, bays35, bays25, obstacles,
  };
});
const flatBay = (x, y, z, d) => ({ pos: [x, y, z], rot: [0, 0, 0], stand: false });
// tepsinin arkasına dik takılı (geniş yüzü tepsiye paralel)
const standBay = (x, y, z, d) => ({ pos: [x, y, z], rot: [Math.PI / 2, 0, 0], stand: true });
const bayBox = (b, d) => {
  const [x, y, z] = b.pos;
  return b.stand ? { x0: x - d.L / 2, x1: x + d.L / 2, y0: y - d.W / 2, y1: y + d.W / 2, z0: z - d.T / 2, z1: z + d.T / 2 }
    : { x0: x - d.L / 2, x1: x + d.L / 2, y0: y - d.T / 2, y1: y + d.T / 2, z0: z - d.W / 2, z1: z + d.W / 2 };
};
export const DRIVE_DIMS = { hdd35: { L: 147, T: 26.1, W: 101.6 }, hdd25: { L: 100, T: 9.5, W: 69.85 }, ssd: { L: 100, T: 7, W: 69.85 } };
export function fanBox(s) {
  const [x, y, z] = s.pos, h = s.size / 2 + 1.5, t = 14;
  return s.axis === 'x' ? { x0: x - t, x1: x + t, y0: y - h, y1: y + h, z0: z - h, z1: z + h } : { x0: x - h, x1: x + h, y0: y - t, y1: y + t, z0: z - h, z1: z + h };
}

// ---- radyatör montajları ----
export const RAD_POS_ORDER = ['t', 'f', 's', 'b', 'r'];
export const RAD_POS_LABEL = { t: 'üst', f: 'ön', s: 'yan', b: 'alt', r: 'arka' };
export const RAD_SAME = { f: ['f', 's'], s: ['f', 's'] };
const FAM120 = [120, 240, 360, 480];
const FAM140 = [140, 280, 420];
export function radFitsList(size, list) {
  if (!list || !list.length) return false;
  if (list.includes(size)) return true;
  if (FAM120.includes(size)) return list.some((p) => (FAM120.includes(p) && p >= size) || (FAM140.includes(p) && p >= size + 40));
  if (FAM140.includes(size)) return list.some((p) => FAM140.includes(p) && p >= size);
  return list.some((p) => p >= size);
}
// radyatörün (fanlarıyla) dünya konumu; döndürme radyatör yerelinden dünyaya
export function radPlacement(G, mount, rd, opt = {}) {
  const { xR, xF, yT, floorY, mainZ, zBack, zGlass, frontGap, dual } = G;
  const zh = rd.zHalf;
  const zMin = Math.max(zBack, G.trayZ + 1) + zh + 1, zMax = zGlass - zh - 2; // ana bölmede
  switch (mount) {
    case 't': {
      const cx = opt.x ?? clamp(xF - frontGap - rd.L / 2 + 10, xR + rd.L / 2 + 4, xF - rd.L / 2 - 4);
      const cy = yT - 2 - rd.yMax;
      const cz = clamp(opt.z ?? mainZ + 6, zMin, zMax);
      return { mount, pos: [cx, cy, cz], rot: [0, 0, 0], box: { x0: cx - rd.L / 2, x1: cx + rd.L / 2, y0: cy + rd.yMin, y1: cy + rd.yMax, z0: cz - zh, z1: cz + zh } };
    }
    case 'b': {
      const cx = opt.x ?? clamp(xF - 20 - rd.L / 2, xR + rd.L / 2 + 4, xF - rd.L / 2 - 4);
      const cy = floorY + 1 + rd.yMax;
      const cz = clamp(mainZ, zMin, zMax);
      return { mount, pos: [cx, cy, cz], rot: [Math.PI, 0, 0], box: { x0: cx - rd.L / 2, x1: cx + rd.L / 2, y0: cy - rd.yMax, y1: cy - rd.yMin, z0: cz - zh, z1: cz + zh } };
    }
    case 'r': {
      const s = G.rearSlot;
      const cx = xR + 1 - rd.yMin;
      const cy = clamp(opt.y ?? s.pos[1], floorY + rd.L / 2 + 2, yT - rd.L / 2 - 2);
      const cz = clamp(Math.max(s.pos[2], G.boardZ + 42 + zh), zMin, zMax);
      return { mount, pos: [cx, cy, cz], rot: [0, 0, -Math.PI / 2], box: { x0: cx + rd.yMin, x1: cx + rd.yMax, y0: cy - rd.L / 2, y1: cy + rd.L / 2, z0: cz - zh, z1: cz + zh } };
    }
    default: { // 'f' ve 's': ön tarafta dikey; fanlar ön panele bakar
      const cx = xF - 2 + rd.yMin;
      const cy = opt.y ?? clamp(yT - 24 - rd.L / 2, floorY + rd.L / 2 + 6, yT - rd.L / 2 - 4);
      const cz = clamp(dual ? mainZ + 10 : 0, zMin, zMax);
      return { mount, pos: [cx, cy, cz], rot: [0, 0, Math.PI / 2], box: { x0: cx - rd.yMax, x1: cx - rd.yMin, y0: cy - rd.L / 2, y1: cy + rd.L / 2, z0: cz - zh, z1: cz + zh } };
    }
  }
}
// bir montaj için denenecek kaydırmalar (üstte cama doğru, önde yukarı/aşağı)
function radOptions(G, m, rd) {
  const zh = rd.zHalf;
  if (m === 't') {
    const xs = [undefined, G.xF - rd.L / 2 - 4];
    const zs = [undefined, G.zGlass - zh - 2];
    return xs.flatMap((x) => zs.map((z) => ({ x, z })));
  }
  if (m === 'f' || m === 's') return [{}, { y: G.yT - rd.L / 2 - 4 }, { y: G.floorY + rd.L / 2 + 4 }];
  if (m === 'b') return [{}, { x: G.xR + rd.L / 2 + 4 }];
  return [{}];
}

// güç kaynağı için aday yerler (kasa tipine göre öncelikli)
function psuCandidates(G, pd) {
  const { xR, xF, yT, floorY, zBack, zGlass, trayZ, mainZ } = G;
  const len = psuBodyLen(pd);
  const zc = (z) => clamp(z, zBack + pd.dw / 2 + 1, zGlass - pd.dw / 2 - 1);
  const box = (x0, x1, y0, y1, z) => ({ x0, x1, y0, y1, z0: z - pd.dw / 2 - 0.3, z1: z + pd.dw / 2 + 0.3, tag: 'psu', cat: 'psu' });
  // arkaya yaslı: arka yüzü (fiş) kasanın arkasında, kablolar öne
  const rearAt = (name, y, z) => ({ name, pos: [xR + 1, y, z], rot: [0, 0, 0], box: box(xR + 1, xR + 1 + len, y - 0.5, y + pd.dh, z) });
  // öne yaslı: 180° döndürülmüş, fişi ön panelde, kablolar içe
  const frontAt = (name, y, z) => ({ name, pos: [xF - 1.5, y, z], rot: [0, Math.PI, 0], box: box(xF - 1.5 - len, xF - 1.5, y - 0.5, y + pd.dh, z) });
  const bottomRear = rearAt('bottomRear', floorY + 0.5, zc(G.hasShroud ? 0 : mainZ));
  const topRear = rearAt('topRear', yT - pd.dh - 0.5, zc(-20));
  const topFront = frontAt('topFront', yT - (G.topRad ? 60 : 0) - pd.dh - 0.5, zc(mainZ));
  const bottomFront = frontAt('bottomFront', floorY + 0.5, zc(mainZ));
  // çift bölmeli: tepsinin arkasında, yan yatırılmış (yüksekliği z boyunca)
  const px = Math.min(xF - 200, xF - 2 - len);
  const py = floorY + 1 + pd.dw / 2;
  const behind = { name: 'behind', pos: [px, py, trayZ - 4], rot: [-Math.PI / 2, 0, 0],
    box: { x0: px, x1: px + len, y0: py - pd.dw / 2 - 0.3, y1: py + pd.dw / 2 + 0.3, z0: trayZ - 4 - pd.dh, z1: trayZ - 3.5, tag: 'psu', cat: 'psu' } };
  switch (G.arch) {
    case 'dual': return [behind, bottomFront, bottomRear];
    case 'topRear': return [topRear, bottomRear, bottomFront];
    case 'topFront': return [topFront, bottomFront, bottomRear, topRear];
    case 'bottomFront': return [bottomFront, bottomRear];
    default: return [bottomRear];
  }
}

// ===================================================================== kutu yardımcıları
const ov = (a, b, tol = 0.5) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > tol && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > tol && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > tol;
const firstHit = (box, list, skip) => list.find((o) => (!skip || !skip(o)) && ov(box, o));
function inside(G, b, tol = 0.5) {
  return b.x0 >= G.xR - tol && b.x1 <= G.xF - 0.5 + tol && b.y0 >= G.floorY - tol && b.y1 <= G.yT + tol && b.z0 >= G.zBack - tol && b.z1 <= G.zGlass + tol;
}
const cap = (s) => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);

// ===================================================================== yerleşim planı
const CAT_NAME = { case: 'kasa', mobo: 'anakart', cpu: 'işlemci', cooler: 'soğutucu', ram: 'bellek', gpu: 'ekran kartı', storage: 'disk', psu: 'güç kaynağı' };
const TAG_NAME = {
  pcb: 'anakart', io: 'anakartın arka I/O örtüsü', vrm: 'anakartın VRM soğutucusu', ram: 'bellek', cooler: 'işlemci soğutucusu', pump: 'pompa',
  gpu: 'ekran kartı', psu: 'güç kaynağı', rad: 'işlemci radyatörü', grad: 'ekran kartı radyatörü', drive: 'disk', shroud: 'güç kaynağı örtüsü',
  tray: 'anakart tepsisi', fan: 'kasa fanı',
};
// birbirine değmesi doğal olan parçalar (yuvaya takılı, soket üstü) ve yalnız görünümü
// ayarlanan çakışmalar (VRM soğutucusu alçak soğutucunun altına göre 3D'de alçaltılır)
const ALLOWED = new Set(['pcb|ram', 'pcb|gpu', 'pcb|cooler', 'pcb|pump', 'ram|ram', 'vrm|cooler', 'io|cooler', 'vrm|pump', 'io|pump']);
const allowedPair = (a, b) => ALLOWED.has(`${a}|${b}`) || ALLOWED.has(`${b}|${a}`);

// kasa ile gelen güç kaynağı: dar ITX kasalarda SFX, diğerlerinde ATX (3D model de bunu çizer)
const CASE_PSU = { SFX: { ff: 'SFX' }, ATX: { ff: 'ATX' } };
export function casePsuItem(cs) {
  return CASE_PSU[caseGeom(cs).W < 200 && /ITX/i.test(cs.ct || '') ? 'SFX' : 'ATX'];
}

// uygulamadaki seçimlerden (sel) plan girdisi
export function planInput(sel) {
  const one = (c) => (sel[c] && sel[c][0] ? sel[c][0].item : null);
  const storage = [];
  const seen = new Map();
  for (const { item, qty } of sel.storage || []) {
    for (let i = 0; i < (qty || 1); i++) {
      const n = seen.get(item.id) || 0;
      seen.set(item.id, n + 1);
      if (item.kind === 'ssd' || item.kind === 'hdd') storage.push({ item, key: `drv:${item.id}:${n}` });
    }
  }
  const m2 = [];
  for (const { item, qty } of sel.storage || []) if (item.kind === 'nvme' || item.kind === 'm2sata') for (let i = 0; i < (qty || 1); i++) m2.push(item);
  const cs = one('case'), psu = one('psu');
  return { cs, mb: one('mobo'), cooler: one('cooler'), ram: sel.ram && sel.ram[0] ? sel.ram[0] : null, gpu: one('gpu'), storage, m2, psu, casePsu: !!(cs && cs.psu && !psu) };
}

/**
 * s: { cs, mb, cooler, ram: {item, qty}|null, gpu, storage: [{item, key}], psu, casePsu }
 * Döndürür: { G, L, anchor, psu, rads: {cpu, gpu}, drives: Map(key -> yer), fanVisible[], coolerFanLift, finsZ0, vrmMaxZ, issues[] }
 */
export function planBuild(s) {
  const issues = [];
  const pairKey = (a, b) => [a, b || ''].sort().join('|');
  // cats: [asıl kategori, ...soruna yol açan diğer kategoriler]
  const add = (level, msg, a, b, generic = false) => {
    if (issues.some((i) => i.msg === msg)) return;
    if (generic && issues.some((i) => i.level === 'err' && pairKey(i.cats[0], i.cats[1]) === pairKey(a, Array.isArray(b) ? b[0] : b))) return;
    const rest = (Array.isArray(b) ? b : b ? [b] : []).filter((c, i, arr) => c && c !== a && arr.indexOf(c) === i);
    issues.push({ level, msg, cats: [a, ...rest] });
  };
  const cs = s.cs || null, mb = s.mb || null;
  const L = mb ? boardLayout(mb) : ghostLayout(cs);
  const G = cs ? caseGeom(cs) : null;
  const A = G ? { x: G.boardRearX, y: G.boardTopY, z: G.boardZ } : { x: -L.w / 2, y: L.h + 53, z: 0 };
  const W = (b, tag, cat) => ({ x0: A.x + b.u0, x1: A.x + b.u1, y0: A.y - b.v1, y1: A.y - b.v0, z0: A.z + b.z0, z1: A.z + b.z1, tag, cat });
  const sock = L.socket;
  const plan = { G, L, anchor: A, psu: null, rads: { cpu: null, gpu: null }, drives: new Map(), fanVisible: [], coolerFanLift: 0, finsZ0: null, vrmMaxZ: null, issues };
  const parts = []; // anakarta bağlı kutular

  const boardBoxes = mb ? boardParts(L).map((b) => W(b, b.tag, 'mobo')) : [];
  parts.push(...boardBoxes);
  // kartın arkasındaki M.2 yuvası tepsiye çok yakındır: soğutuculu SSD ancak soğutucusu sökülerek takılır
  (s.m2 || []).forEach((it, i) => {
    if (mb && it.hs && L.m2[i] && L.m2[i].back) add('warn', 'Kartın arkasındaki M.2 yuvasına soğutuculu SSD sığmaz; soğutucusu sökülerek takılır', 'storage', 'mobo');
  });

  // ---- bellek ----
  let ramTop = 0, ramBox = null, ramH = 0;
  if (s.ram && s.ram.item) {
    const rd = ramDims(s.ram.item);
    ramH = rd.ht;
    const n = Math.min((s.ram.item.mods || 1) * (s.ram.qty || 1), L.dimm.length);
    for (const i of ramSlotOrder(L.dimm.length, n)) {
      const d = L.dimm[i];
      const b = W({ u0: d.u - RAM_HALF, u1: d.u + RAM_HALF, v0: d.v - 66.5, v1: d.v + 66.5, z0: RAM_Z, z1: RAM_Z + rd.ht }, 'ram', 'ram');
      parts.push(b);
      ramBox = ramBox ? { ...ramBox, x0: Math.min(ramBox.x0, b.x0), x1: Math.max(ramBox.x1, b.x1) } : { ...b };
    }
    ramTop = RAM_Z + rd.ht;
  }

  // ---- işlemci soğutucusu (hava soğutucuda bellek yüksekse fan yukarı alınır) ----
  const cooler = s.cooler || null;
  let coolerTop = 0; // kart yüzeyinden
  const coolerBoxes = [];
  if (cooler && cooler.kind === 'aio') {
    const p = pumpDims(cooler);
    coolerBoxes.push(W({ u0: sock.u - p.r, u1: sock.u + p.r, v0: sock.v - p.fitY, v1: sock.v + p.r, z0: COOLER_Z, z1: COOLER_Z + p.z1 }, 'pump', 'cooler'));
    coolerTop = COOLER_Z + p.z1;
  } else if (cooler) {
    const cg = coolerGeom(cooler);
    const sb = (b) => W({ u0: sock.u + b.x0, u1: sock.u + b.x1, v0: sock.v - b.y1, v1: sock.v - b.y0, z0: COOLER_Z + b.z0, z1: COOLER_Z + b.z1 }, 'cooler', 'cooler');
    const ramHit = (b) => ramBox && ov(sb(b), ramBox, 0.3);
    let top = cg.top;
    if (cg.type === 'single' || cg.type === 'dual') {
      for (const fb of cg.boxes) if (fb.tag === 'fins' && ramHit(fb)) add('err', `Bellek (${ramH} mm) soğutucunun kanatçıklarına değer; daha alçak bellek gerekir`, 'cooler', 'ram');
      let lift = 0;
      for (const f of cg.fans) {
        const fb = { x0: f.x - 13, x1: f.x + 13, y0: -f.size / 2, y1: f.size / 2, z0: f.z - f.size / 2, z1: f.z + f.size / 2 };
        if (ramHit(fb)) lift = Math.max(lift, ramTop + 1.5 - COOLER_Z - fb.z0);
      }
      if (lift > 0) {
        const fanTop = Math.max(...cg.fans.map((f) => f.z + f.size / 2)) + lift;
        if (fanTop > cg.Hc + 35) add('err', `Bellek (${ramH} mm) soğutucu fanının altına sığmaz`, 'cooler', 'ram');
        else {
          top = Math.max(top, fanTop);
          add('warn', `Bellek (${ramH} mm) için soğutucunun fanı ${Math.ceil(lift)} mm yukarı alınır; toplam yükseklik ~${Math.ceil(top)} mm olur`, 'cooler', 'ram');
        }
        plan.coolerFanLift = lift;
      }
      for (const b of cg.boxes) coolerBoxes.push(sb(b));
      for (const f of cg.fans) coolerBoxes.push(sb({ x0: f.x - 13, x1: f.x + 13, y0: -f.size / 2, y1: f.size / 2, z0: f.z - f.size / 2 + plan.coolerFanLift, z1: f.z + f.size / 2 + plan.coolerFanLift }));
    } else if (cg.type === 'low') {
      const fins = cg.boxes[0];
      let z0 = fins.z0;
      if (ramHit(fins)) z0 = ramTop + 1.5 - COOLER_Z;
      if (cg.finZ1 - z0 < 10) add('err', `Bellek (${ramH} mm) bu alçak soğutucunun altına sığmaz`, 'cooler', 'ram');
      else if (z0 > fins.z0) plan.finsZ0 = z0;
      coolerBoxes.push(sb({ ...fins, z0: Math.min(z0, cg.finZ1 - 10) }), sb(cg.boxes[1]));
    } else {
      if (ramHit(cg.boxes[1]) || ramHit(cg.boxes[0])) add('err', `Soğutucu ilk bellek yuvasının üzerine taşar; bellek (${ramH} mm) sığmaz`, 'cooler', 'ram');
      for (const b of cg.boxes) coolerBoxes.push(sb(b));
    }
    coolerTop = COOLER_Z + top;
    // VRM soğutucuları alçak soğutucunun altına göre (yalnız görünüm)
    let lim = Infinity;
    for (const vb of boardBoxes.filter((b) => b.tag === 'vrm' || b.tag === 'io')) {
      for (const cb of coolerBoxes) if (ov(vb, cb, 0)) lim = Math.min(lim, cb.z0 - A.z - 1);
    }
    if (lim < Infinity) plan.vrmMaxZ = Math.max(4, lim);
  }
  parts.push(...coolerBoxes);

  // ---- ekran kartı ----
  const gpu = s.gpu || null;
  let gpuBox = null, gd = null;
  if (gpu && G && G.vgpu) {
    // dikey kartlı kasalar (yükseltici kablo ile): kart ya tepsinin arkasında (sandviç; ör. NZXT H2, Ncore 100)
    // ya da anakartın önünde dikey durur (ör. Hyte Revolt 3); sığan yerleşim seçilir
    gd = gpuDims(gpu);
    const ext = gd.cool === 'liquid' ? 12 : 0;
    const gy = G.topPsu ? G.yT - ATX_DH - 8 : G.yT - 15; // üstte PSU varsa kart onun altından başlar
    const zTop = Math.max(gd.H + 5.5, 113); // kartın üst kenarı ya da 120 mm'lik braket
    const cands = [];
    { // A: tepsinin arkasında, fanları arka panele bakar
      const gx = G.xF - 16, gz = G.trayZ - 10;
      cands.push({ box: { x0: gx - zTop, x1: gx + 8, y0: gy - gd.L - 1.5 - ext, y1: gy + 2.5, z0: gz - gd.T - 1, z1: gz + 9 }, pos: [gx, gy, gz], basis: [[0, -1, 0], [0, 0, 1], [-1, 0, 0]] });
    }
    { // B: anakartın önünde, kart düzlemine dik
      const gx = G.boardRearX + L.w + 3 + gd.T + 1, gz = G.boardZ + 2;
      cands.push({ box: { x0: gx - gd.T - 1, x1: gx + 9, y0: gy - gd.L - 1.5 - ext, y1: gy + 2.5, z0: gz - 8, z1: gz + zTop }, pos: [gx, gy, gz], basis: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] });
    }
    const fits = (c) => inside(G, c.box) && !firstHit(c.box, [...parts, ...G.obstacles]);
    const pick = cands.find(fits) || cands[0];
    gpuBox = { ...pick.box, tag: 'gpu', cat: 'gpu' };
    plan.gpuV = { pos: pick.pos, basis: pick.basis };
    parts.push(gpuBox);
  } else if (gpu) {
    gd = gpuDims(gpu);
    const p = gpuSlot(L);
    const ext = gd.cool === 'liquid' ? 12 : 0;
    // gövde (arka plaka PCB'nin 3,6 mm üstünde) ve braket (yuvanın 9 mm üstüne uzanır)
    gpuBox = W({ u0: GPU_OFFSET.u - 2, u1: GPU_OFFSET.u + gd.L + 1.5 + ext, v0: p.v - 3.6, v1: p.v + gd.T + 1, z0: GPU_OFFSET.z - 6, z1: GPU_OFFSET.z + gd.H + 5.5 }, 'gpu', 'gpu');
    parts.push(gpuBox, W({ u0: GPU_OFFSET.u - 2, u1: GPU_OFFSET.u + 14, v0: p.v - 9, v1: p.v + gd.T + 1, z0: GPU_OFFSET.z - 8, z1: GPU_OFFSET.z + 113 }, 'gpu', 'gpu'));
  }

  if (!G) { sweep(parts, add, plan); return plan; }

  // ---- kasa sınırları ----
  const { xF, floorY, zGlass } = G;
  if (mb && L.h > G.maxBoardHFit + 1) add('err', `${mb.ff || 'Bu'} anakart (${L.h} mm) bu kasanın iç yüksekliğine sığmaz`, 'mobo', 'case');
  if (gpuBox && G.vgpu) {
    if (!inside(G, gpuBox)) add('err', `Ekran kartı (${gd.L} × ${gd.Hreal} mm, ${gd.T} mm kalınlık) bu kasanın dikey kart yerine sığmaz`, 'gpu', 'case');
  } else if (gpuBox) {
    const room = zGlass - 1 - gpuBox.z1;
    if (room < 0) add('err', `Ekran kartı ${gd.Hreal} mm yüksekliğinde; bu kasada yan panele ${Math.max(0, Math.round(gd.Hreal + room))} mm yer var`, 'gpu', 'case');
    else if (gd.plugs.length && room < 25) add('warn', `Ekran kartının üst kenarındaki güç kablosu için yan panele ${Math.round(room)} mm kalıyor`, 'gpu', 'case');
    if (gpuBox.x1 > xF - 0.5 && !(cs.gpu && gd.L > cs.gpu)) add('err', `Ekran kartı ${gd.L} mm; bu kasanın içine sığmaz`, 'gpu', 'case');
    if (gpuBox.y0 < floorY + 0.5) add('err', `Ekran kartı (${gd.T} mm kalınlık) kasanın tabanına iner; bu kasada sığmaz`, 'gpu', 'case');
    else if (G.hasShroud && gpuBox.y0 < G.shroudTop && gpuBox.x0 < G.shroudX1) add('err', `Ekran kartı (${gd.T} mm kalınlık) güç kaynağı örtüsüne değer`, 'gpu', 'case');
  }
  if (cooler && coolerTop && A.z + coolerTop > zGlass - 1 && !(cooler.kind !== 'aio' && cs.cool && cooler.ht > cs.cool)) {
    add('err', `Soğutucu (${Math.round(coolerTop - COOLER_Z)} mm) bu kasada yan panele değer; en fazla ~${Math.max(0, Math.floor(zGlass - 1 - A.z - COOLER_Z))} mm sığar`, 'cooler', plan.coolerFanLift > 0 ? ['case', 'ram'] : 'case');
  }
  const caseObs = G.obstacles;
  const psuObs = caseObs.filter((o) => o.tag !== 'tray'); // PSU kasa paneline bağlanır; tepsi onun etrafında biter

  // ---- güç kaynağı (seçili ya da kasa ile gelen) ----
  const psuItem = s.psu || (s.casePsu ? casePsuItem(cs) : null);
  const pd = psuItem ? psuDims(psuItem) : null;
  const psuCands = pd ? psuCandidates(G, pd) : [null];

  // ---- radyatörler ----
  const radJobs = [];
  if (cooler && cooler.kind === 'aio') radJobs.push({ key: 'cpu', cat: 'cooler', tag: 'rad', rd: radDims(cooler), size: cooler.rad || 240 });
  if (gpu && gpu.cool === 'liquid') radJobs.push({ key: 'gpu', cat: 'gpu', tag: 'grad', rd: radDims({ rad: gpuRadSize(gpu) }), size: gpuRadSize(gpu) });
  const hasRadData = !!(cs.rad && Object.keys(cs.rad).length);
  const mountsFor = (size) => {
    if (hasRadData) return RAD_POS_ORDER.filter((p) => radFitsList(size, cs.rad[p] || (p === 's' ? cs.rad.l : null)));
    return size <= 140 ? ['r', 't', 'f'] : ['t', 'f']; // veri yoksa: kasa ölçüsüne göre makul yerler
  };
  let best = null;
  for (const pc of psuCands) {
    const blockers = [...parts, ...caseObs, ...(pc ? [pc.box] : [])];
    const rads = {}, why = {};
    let bad = 0;
    for (const job of radJobs) {
      const used = Object.values(rads).filter(Boolean).flatMap((r) => RAD_SAME[r.mount] || [r.mount]);
      const cause = (why[job.key] = new Set());
      let chosen = null;
      for (const m of mountsFor(job.size)) {
        if (used.includes(m)) { const other = radJobs.find((j) => rads[j.key] && (RAD_SAME[rads[j.key].mount] || [rads[j.key].mount]).includes(m)); if (other) cause.add(other.cat); continue; }
        for (const opt of radOptions(G, m, job.rd)) {
          const pl = radPlacement(G, m, job.rd, opt);
          if (!inside(G, pl.box)) { cause.add('case'); continue; }
          const hit = firstHit(pl.box, blockers);
          if (hit) { cause.add(hit.cat); continue; }
          const rr = Object.entries(rads).find(([, r]) => r && ov(r.box, pl.box));
          if (rr) { cause.add(radJobs.find((j) => j.key === rr[0]).cat); continue; }
          chosen = pl;
          break;
        }
        if (chosen) break;
      }
      rads[job.key] = chosen;
      if (!chosen) bad++;
    }
    // PSU'nun kasa tipindeki asıl yeri tepsiyle çakışamaz; diğer yerler için tepsi de engeldir
    const obsP = pc && pc === psuCands[0] ? psuObs : caseObs;
    const psuBad = pc && (firstHit(pc.box, [...parts, ...obsP]) || !inside(G, pc.box)) ? 1 : 0;
    const score = psuBad * 100 + bad * 10;
    if (!best || score < best.score) best = { pc, rads, score, why };
    if (score === 0) break;
  }
  const pc = best.pc;
  if (pd) {
    plan.psu = pc;
    const hit = firstHit(pc.box, [...parts, ...(pc === psuCands[0] ? psuObs : caseObs)]);
    if (!inside(G, pc.box)) add('err', `Güç kaynağı (${Math.round(pd.dd)} mm) bu kasaya sığmaz`, 'psu', 'case');
    else if (hit) add('err', `Güç kaynağı (${Math.round(pd.dd)} mm) kasada ${TAG_NAME[hit.tag] || CAT_NAME[hit.cat]} ile çakışıyor`, 'psu', hit.cat);
  }
  for (const job of radJobs) {
    let r = best.rads[job.key];
    const supported = mountsFor(job.size);
    if (!r) {
      if (hasRadData && !supported.length) {
        add('err', job.key === 'cpu' ? `Kasa ${job.size} mm radyatör desteklemiyor` : `Kasa ekran kartının ~${job.size} mm radyatörünü desteklemiyor`, job.cat, 'case');
      } else {
        const cause = [...(best.why[job.key] || [])].filter((c) => c !== job.cat);
        const names = cause.filter((c) => c !== 'case').map((c) => CAT_NAME[c]);
        const withTxt = names.length ? `${names.join(' ve ')} ile birlikte` : 'bu kasada';
        add('err', `${job.key === 'cpu' ? 'Radyatör' : 'Ekran kartının radyatörü'} (${job.size} mm) ${withTxt} yerleştirilemiyor`, job.cat, [...cause.filter((c) => c !== 'case'), 'case']);
      }
      r = { ...radPlacement(G, supported[0] || 't', job.rd), forced: true }; // yine de görünsün
    }
    plan.rads[job.key] = { ...r, size: job.size, rd: job.rd, tag: job.tag, cat: job.cat };
  }

  // ---- diskler ----
  const radBoxes = Object.values(plan.rads).filter(Boolean).map((r) => ({ ...r.box, tag: r.tag, cat: r.cat }));
  const blockersD = [...parts, ...caseObs, ...(pc ? [pc.box] : []), ...radBoxes];
  const sata = (s.storage || []).filter((e) => e.item && (e.item.kind === 'ssd' || e.item.kind === 'hdd'));
  const bigHdd = (it) => it.kind === 'hdd' && it.ff !== '2.5';
  const nH = sata.filter((e) => bigHdd(e.item)).length;
  if (cs.b35 != null && nH > cs.b35) add('err', cs.b35 ? `Kasada ${cs.b35} adet 3.5" disk yuvası var, ${nH} HDD seçildi` : 'Kasada 3.5" disk yuvası yok', 'storage', 'case');
  else if (cs.b25 != null && cs.b35 != null && sata.length > cs.b25 + cs.b35) add('err', `Kasada toplam ${cs.b25 + cs.b35} disk yuvası var, ${sata.length} disk seçildi`, 'storage', 'case');
  const used = [];
  const bayCause = new Set();
  const take = (list, d) => {
    for (const b of list) {
      if (used.some((u) => u.b === b)) continue;
      const box = bayBox(b, d);
      if (!inside(G, box)) continue;
      const hit = firstHit(box, blockersD);
      if (hit) { if (hit.cat !== 'case') bayCause.add(hit.cat); continue; }
      if (used.some((u) => ov(u.box, box))) continue;
      used.push({ b, box });
      return { pos: b.pos, rot: b.rot, box };
    }
    return null;
  };
  let noBay = 0;
  for (const e of [...sata].sort((a, b) => bigHdd(b.item) - bigHdd(a.item))) {
    const big = bigHdd(e.item);
    const d = big ? DRIVE_DIMS.hdd35 : e.item.kind === 'hdd' ? DRIVE_DIMS.hdd25 : DRIVE_DIMS.ssd;
    const pl = big ? take(G.bays35, d) : take(G.bays25, d) || take(G.bays35, d);
    if (pl) plan.drives.set(e.key, pl);
    else noBay++;
  }
  if (noBay) {
    const names = [...bayCause].map((c) => CAT_NAME[c]);
    add('err', `${noBay} disk için kasada uygun yuva kalmadı${names.length ? ` (${names.join(', ')} yuvaları kapatıyor)` : ''}`, 'storage', [...bayCause, 'case'], true);
  }

  // ---- kasa fanları: radyatörün yerine geçenler ve parçalarla çakışanlar gizlenir ----
  const all = [...parts, ...(pc ? [pc.box] : []), ...radBoxes, ...[...plan.drives.values()].map((d) => ({ ...d.box, tag: 'drive', cat: 'storage' }))];
  plan.fanVisible = G.fans.map((f) => !all.some((o) => ov(f.box, o, 0.3)));

  // ---- genel güvenlik taraması: kasa dışına taşma ve özel olarak ele alınmamış çakışmalar ----
  for (const o of all) {
    if (o.cat === 'mobo' && o.tag !== 'pcb') continue;
    if ((o.tag === 'rad' && plan.rads.cpu && plan.rads.cpu.forced) || (o.tag === 'grad' && plan.rads.gpu && plan.rads.gpu.forced)) continue;
    if (!inside(G, o, 1)) add('err', `${cap(TAG_NAME[o.tag] || CAT_NAME[o.cat])} kasanın içine sığmaz`, o.cat, 'case', true);
  }
  sweep([...all, ...caseObs], add, plan);
  return plan;
}
// PSU ve tepsi temas edebilir (tepsi PSU'nun etrafında biter)
function sweepSkip(a, b) {
  return (a.tag === 'psu' && b.tag === 'tray') || (a.tag === 'tray' && b.tag === 'psu');
}

// özel olarak ele alınmamış çakışmaları uyumsuzluk olarak bildir
function sweep(list, add, plan) {
  const forced = (o) => (o.tag === 'rad' && plan.rads.cpu && plan.rads.cpu.forced) || (o.tag === 'grad' && plan.rads.gpu && plan.rads.gpu.forced);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.cat === b.cat && a.cat !== 'storage') continue;
    if (allowedPair(a.tag, b.tag) || forced(a) || forced(b) || sweepSkip(a, b)) continue;
    if (!ov(a, b, 0.6)) continue;
    add('err', `${cap(TAG_NAME[a.tag] || CAT_NAME[a.cat])} ile ${TAG_NAME[b.tag] || CAT_NAME[b.cat]} çakışıyor`, a.cat, b.cat, true);
  }
}
