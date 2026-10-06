// Prosedürel 3D parça modelleri. Birim: milimetre.
// Dünya ekseni: +x kasanın önü, +y yukarı, +z cam yan panel (izleyiciye doğru).
// Anakart yerel ekseni: orijin kartın üst-arka köşesi, +x öne, -y aşağı, +z karttan dışarı.
import * as THREE from '../../vendor/three.bundle.js';
import { RoundedBoxGeometry, mergeGeometries } from '../../vendor/three.bundle.js';
import {
  M, rgbMaterial, pcbTexture, meshAlpha, finTexture, finVTexture, grillTexture, labelTexture,
  colorOf, isLight, cachedGeo, cloneTex,
} from './materials.js';
import {
  clamp, boardLayout, caseGeom, coolerGeom, gpuDims, gpuSocketsLayout, psuDims, ramDims, radDims, DRIVE_DIMS, pumpDims,
} from '../fit.js';

export { boardLayout };
const r1 = (v) => Math.round(v * 10) / 10;

// Kutu: 2,5 mm'den kalın parçalarda kenarlar pahlanır (gerçek ürünler gibi ışığı kenarda yakalar)
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const mn = Math.min(w, h, d);
  const geo = mn >= 2.5
    ? cachedGeo(`bb${r1(w)}|${r1(h)}|${r1(d)}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(1.6, mn * 0.18)))
    : cachedGeo(`b${r1(w)}|${r1(h)}|${r1(d)}`, () => new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0) {
  const rr = Math.max(0.2, Math.min(r, w / 2 - 0.05, h / 2 - 0.05, d / 2 - 0.05));
  const m = new THREE.Mesh(cachedGeo(`rb${r1(w)}|${r1(h)}|${r1(d)}|${r1(rr)}`, () => new RoundedBoxGeometry(w, h, d, 3, rr)), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(r, h, mat, seg = 28, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(cachedGeo(`c${r1(r)}|${r1(h)}|${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg)), mat);
  m.position.set(x, y, z);
  return m;
}
function plane(w, h, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(cachedGeo(`p${r1(w)}|${r1(h)}`, () => new THREE.PlaneGeometry(w, h)), mat);
  m.position.set(x, y, z);
  return m;
}
function shadowize(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

const BRAND_ACCENT = {
  Asus: 0xe3242b, MSI: 0xe0262f, Gigabyte: 0xf28c28, ASRock: 0x9aa3b0, NZXT: 0x8b5cf6, Corsair: 0xf3d34a,
  Kingston: 0xe62a2a, 'G.Skill': 0xd0d3d8, Sapphire: 0x2f6fde, PowerColor: 0xd12b2b, Zotac: 0xf2b705,
  'be quiet!': 0xf5a524, 'Cooler Master': 0x7c3aed, DeepCool: 0x25b5e8, Arctic: 0x2aa6e0, 'Lian Li': 0xc7cbd1,
  AMD: 0xed1c24, Intel: 0x0071c5, NVIDIA: 0x76b900, Samsung: 0x1d4ed8, WD: 0x2563eb, Crucial: 0x16a34a,
};
const accentOf = (brand, fallback = 0x7c6cff) => BRAND_ACCENT[brand] ?? fallback;

// =====================================================================
// FAN — ekseni yerel z
// =====================================================================
export function makeFan(size = 120, { frame = 0x15171b, blade = 0x22252b, rgb = false, thickness = 25, speed = 1, frameless = false } = {}) {
  const g = new THREE.Group();
  const s = size / 2;
  if (frameless) return makeRotorOnly(g, size, thickness, blade, speed);
  const frameGeo = cachedGeo(`fanframe${size}|${thickness}`, () => {
    const r = size * 0.09;
    const shape = new THREE.Shape();
    shape.moveTo(-s + r, -s); shape.lineTo(s - r, -s); shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r); shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s); shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r); shape.quadraticCurveTo(-s, -s, -s + r, -s);
    const hole = new THREE.Path();
    hole.absarc(0, 0, size * 0.468, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 36 });
    geo.translate(0, 0, -thickness / 2);
    return geo;
  });
  g.add(new THREE.Mesh(frameGeo, M.plastic(frame, 0.55)));

  const rotor = new THREE.Group();
  rotor.userData.spin = speed * (0.9 + Math.random() * 0.25);
  const hubMat = M.plastic(blade, 0.5);
  const hub = cyl(size * 0.17, thickness * 0.72, hubMat, 32);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);
  const bladesGeo = bladesGeometry(size);
  const bladeMat = rgb
    ? new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, transparent: true, opacity: 0.55 })
    : M.plastic(blade, 0.5);
  rotor.add(new THREE.Mesh(bladesGeo, bladeMat));
  g.add(rotor);

  // köşe lastikleri (tek geometri)
  const padsGeo = cachedGeo(`fanpads${size}|${thickness}`, () => {
    const parts = [];
    for (const [px, py] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const c = new THREE.CylinderGeometry(size * 0.045, size * 0.045, thickness + 0.6, 12);
      c.rotateX(Math.PI / 2);
      c.translate(px * (s - size * 0.07), py * (s - size * 0.07), 0);
      parts.push(c);
    }
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return merged;
  });
  g.add(new THREE.Mesh(padsGeo, M.rubber(0x2a2d33)));

  if (rgb) {
    const ringGeo = cachedGeo(`fanring${size}`, () => new THREE.TorusGeometry(size * 0.47, 1.5, 8, 72));
    const ringMat = rgbMaterial(1, 2.4);
    for (const zz of [-thickness / 2 + 0.6, thickness / 2 - 0.6]) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.z = zz;
      g.add(ring);
    }
    const cap = cyl(size * 0.12, 1, rgbMaterial(0.25, 1.6), 24, 0, 0, thickness * 0.37);
    cap.rotation.x = Math.PI / 2;
    rotor.add(cap);
  }
  g.userData.rotor = rotor;
  return g;
}

function bladesGeometry(size) {
  return cachedGeo(`blades${size}`, () => {
    const rh = size * 0.15, rt = size * 0.455;
    const sh = new THREE.Shape();
    sh.moveTo(rh, -size * 0.06);
    sh.quadraticCurveTo((rh + rt) / 2, -size * 0.14, rt, -size * 0.07);
    sh.quadraticCurveTo(rt + size * 0.012, size * 0.05, rt - size * 0.03, size * 0.12);
    sh.quadraticCurveTo((rh + rt) / 2, size * 0.05, rh, size * 0.07);
    sh.closePath();
    const one = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: false, curveSegments: 8 });
    one.translate(0, 0, -0.55);
    one.rotateX(0.5);
    const parts = [];
    for (let k = 0; k < 9; k++) parts.push(one.clone().rotateZ((k * Math.PI * 2) / 9));
    const merged = mergeGeometries(parts);
    one.dispose(); parts.forEach((p) => p.dispose());
    return merged;
  });
}

// çerçevesiz fan (ekran kartları için): yalnızca göbek + kanatlar
function makeRotorOnly(g, size, thickness, blade, speed) {
  const rotor = new THREE.Group();
  rotor.userData.spin = speed * (0.9 + Math.random() * 0.25);
  const hub = cyl(size * 0.17, thickness * 0.72, M.plastic(blade, 0.5), 32);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);
  rotor.add(new THREE.Mesh(bladesGeometry(size), M.plastic(blade, 0.5)));
  g.add(rotor);
  g.userData.rotor = rotor;
  return g;
}

// =====================================================================
// KASA
// =====================================================================
export function makeCase(x) {
  // Tüm iç ölçüler ortak yerleşim modelinden (fit.js) gelir; uyumluluk denetimi de aynı sayıları kullanır.
  const G = caseGeom(x);
  const { W, H, D, t, f, yB, yT, xR, xF, dual, trayZ, shroudTop, hasShroud, boardTopY } = G;
  const color = colorOf(x.col, 0x1b1d22);
  const light = isLight(color);
  const body = M.painted(color, light ? 0.48 : 0.58);
  const innerC = new THREE.Color(color).multiplyScalar(light ? 0.9 : 0.8);
  const inner = M.painted(innerC, 0.72);
  const trimMat = M.plastic(light ? 0xd9dce1 : 0x0e0f12, 0.5);
  const darkMat = M.plastic(0x0b0c0f, 0.7);

  const g = new THREE.Group();
  g.name = 'case';

  // ---- gövde panelleri ----
  g.add(box(D, t, W, body, 0, yB + t / 2, 0));                        // alt
  g.add(box(t, H - yB, W, body, -D / 2 + t / 2, (H + yB) / 2, 0));    // arka
  g.add(box(D, H - yB, t, body, 0, (H + yB) / 2, -W / 2 + t / 2));    // arka yan panel
  // üst: çerçeve + delikli ızgara
  const topMesh = new THREE.MeshStandardMaterial({ color: light ? 0xc9ccd2 : 0x111317, metalness: 0.4, roughness: 0.5, alphaMap: cloneTex(meshAlpha, (D * 0.72) / 14, (W * 0.6) / 14), alphaTest: 0.5, side: THREE.DoubleSide });
  const topRim = 22;
  const topParts = [
    box(D, t, topRim, body, 0, H - t / 2, W / 2 - topRim / 2),
    box(D, t, topRim, body, 0, H - t / 2, -W / 2 + topRim / 2),
    box(topRim * 2, t, W - topRim * 2, body, D / 2 - topRim, H - t / 2, 0),
    box(topRim * 2, t, W - topRim * 2, body, -D / 2 + topRim, H - t / 2, 0),
    plane(D - topRim * 4, W - topRim * 2, topMesh, 0, H - t / 2, 0),
  ];
  topParts[4].rotation.x = -Math.PI / 2;
  topParts.forEach((m) => g.add(m));

  // ön I/O
  const io = new THREE.Group();
  io.add(rbox(60, 4, 26, 2, darkMat, 0, 0, 0));
  const btn = cyl(5.5, 2, x.rgb ? M.emissive(0x7c6cff, 1.6) : M.metal(0x9aa0aa), 20, -18, 2.2, 0);
  io.add(btn);
  for (let i = 0; i < 2; i++) io.add(box(12, 1, 4.5, M.plastic(0x2563eb, 0.4), 4 + i * 16, 2.2, 0));
  io.position.set(D / 2 - 45, H + 1.2, 0);
  g.add(io);

  // ---- ön panel: çift bölmeli ya da "çift temperli cam" kasalarda cam, diğerlerinde delikli ----
  const front = new THREE.Group();
  front.name = 'front';
  const fw = 16;
  const glassFront = dual || !!x.dglass;
  if (glassFront) {
    const gl = box(t, H - yB - 8, W - 8, M.glass(), xF + t / 2, (H + yB) / 2, 0);
    gl.castShadow = false;
    front.add(gl);
    front.add(box(t + 1, 10, W, trimMat, xF + t / 2, H - 5, 0));
    front.add(box(t + 1, 10, W, trimMat, xF + t / 2, yB + 5, 0));
  } else {
    front.add(box(t + 6, H - yB, fw, body, xF + 4, (H + yB) / 2, W / 2 - fw / 2));
    front.add(box(t + 6, H - yB, fw, body, xF + 4, (H + yB) / 2, -W / 2 + fw / 2));
    front.add(box(t + 6, fw, W - 2 * fw, body, xF + 4, H - fw / 2, 0));
    front.add(box(t + 6, fw, W - 2 * fw, body, xF + 4, yB + fw / 2, 0));
    const fm = new THREE.MeshStandardMaterial({ color: light ? 0xd4d7dc : 0x15171b, metalness: 0.35, roughness: 0.5, alphaMap: cloneTex(meshAlpha, (W - 2 * fw) / 13, (H - yB - 2 * fw) / 13), alphaTest: 0.5, side: THREE.DoubleSide });
    const grill = plane(W - 2 * fw, H - yB - 2 * fw, fm, xF + 6, (H + yB) / 2, 0);
    grill.rotation.y = Math.PI / 2;
    front.add(grill);
  }
  // kasa gövdesindeki LED şerit (ön panelin iki dikey kenarı)
  if (x.strip) {
    const strip = rgbMaterial(1, 2.6);
    for (const sz of [-1, 1]) front.add(box(2, H - yB - 40, 2.4, strip, xF + (glassFront ? 4.4 : 9.6), (H + yB) / 2, sz * (W / 2 - (glassFront ? 3 : fw / 2))));
  }
  g.add(front);

  // ---- anakart tepsisi ----
  const trayX0 = xR, trayX1 = G.trayX1;
  const trayTop = G.arch === 'topRear' ? yT - 88 : yT;
  const tray = box(trayX1 - trayX0, trayTop - shroudTop, 1.5, inner, (trayX0 + trayX1) / 2, (trayTop + shroudTop) / 2, trayZ);
  g.add(tray);
  for (const gr of G.grommets) {
    if (gr.y + gr.h / 2 > trayTop) continue;
    g.add(rbox(14, gr.h, 2.5, 4, M.rubber(0x08090b), gr.x, gr.y, trayZ + 1));
  }

  // ---- PSU örtüsü ----
  if (hasShroud) {
    const sx0 = xR, sx1 = G.shroudX1;
    const zs0 = trayZ, zs1 = G.shroudZ1;
    const shroudH = shroudTop - (yB + t);
    g.add(box(sx1 - sx0, 2, zs1 - zs0, inner, (sx0 + sx1) / 2, shroudTop - 1, (zs0 + zs1) / 2));
    const sm = new THREE.MeshStandardMaterial({ color: innerC, metalness: 0.25, roughness: 0.65, alphaMap: cloneTex(meshAlpha, (sx1 - sx0) / 16, shroudH / 16), alphaTest: 0.5, side: THREE.DoubleSide });
    const side = plane(sx1 - sx0, shroudH - t, sm, (sx0 + sx1) / 2, (shroudTop + yB + t) / 2 - t / 2, zs1);
    g.add(side);
    // örtü üzerindeki marka plakası
    const brandTex = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.75, spacing: 6 }], { w: 512, h: 96, bg: null, fg: light ? '#3a3f48' : '#c9ced6', align: 'center' });
    const plate = plane(110, 20, new THREE.MeshStandardMaterial({ map: brandTex, transparent: true, roughness: 0.5 }), sx1 - 90, (shroudTop + yB) / 2 + 2, zs1 + 0.6);
    g.add(plate);
    g.add(box(sx1 - sx0, 6, 4, body, (sx0 + sx1) / 2, shroudTop - 3, zs1));
  }

  // ---- cam / yan panel ----
  const side = new THREE.Group();
  side.name = 'side';
  const sH = H - yB - 6, sD = D - 6;
  if (x.glass) {
    const glass = box(sD, sH, 3, M.glass(), 0, (H + yB) / 2, W / 2 + 1.5);
    glass.castShadow = false;
    glass.renderOrder = 10;
    side.add(glass);
    const bm = light ? M.painted(0xd9dce1, 0.5) : M.plastic(0x050506, 0.4);
    const bw = light ? 6 : 12;
    side.add(box(sD, bw, 1, bm, 0, H - 3 - bw / 2, W / 2 + 0.4));
    side.add(box(sD, bw, 1, bm, 0, yB + 3 + bw / 2, W / 2 + 0.4));
    side.add(box(bw, sH, 1, bm, -D / 2 + 3 + bw / 2, (H + yB) / 2, W / 2 + 0.4));
    side.add(box(bw, sH, 1, bm, D / 2 - 3 - bw / 2, (H + yB) / 2, W / 2 + 0.4));
  } else {
    // camsız panel: içi görünsün diye yarı saydam çizilir
    const ghost = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const sp = box(sD, sH, 3, ghost, 0, (H + yB) / 2, W / 2 + 1.5);
    sp.castShadow = false;
    side.add(sp);
  }
  g.add(side);

  // ---- ayaklar (alçak kasalarda kısa) ----
  for (const sxn of [-1, 1]) for (const szn of [-1, 1]) {
    g.add(rbox(34, f, 22, Math.min(4, f / 2 - 0.1), M.rubber(0x0d0e11), sxn * (D / 2 - 34), f / 2, szn * (W / 2 - 22)));
  }

  // ---- arka panel detayları (dış yüz) ----
  const rearX = -D / 2 - 0.3;
  const ioPlate = box(1, 160, 46, M.metal(0x6b7078, 0.5), rearX, boardTopY - 10 - 80, G.boardZ + 24);
  g.add(ioPlate);
  for (let i = 0; i < 7; i++) {
    const sy = boardTopY - 162 - i * 20.32;
    if (sy < (hasShroud ? shroudTop : G.floorY) + 12) break;
    g.add(box(1, 14, 110, M.metal(light ? 0xd0d3d8 : 0x2b2f36, 0.45), rearX, sy, G.boardZ + 52));
  }
  const rearGrill = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, alphaMap: grillTexture, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });

  // ---- fanlar (yuvalar ortak modelden; görünürlüğü sahne yerleşim planına göre ayarlar) ----
  const fanOpts = { frame: light ? 0xe2e4e8 : 0x15171b, blade: light ? 0xeceef1 : 0x1d2026, rgb: !!x.frgb };
  const fanList = [];
  for (const s of G.fans) {
    const fan = makeFan(s.size, fanOpts);
    fan.position.set(...s.pos);
    if (s.axis === 'x') fan.rotation.y = Math.PI / 2;
    else fan.rotation.x = Math.PI / 2;
    g.add(fan);
    fanList.push(fan);
  }
  if (!G.fans.some((s) => s.g === 'r')) {
    const rs = G.rearSlot;
    const rg = plane(rs.size - 4, rs.size - 4, rearGrill, rearX - 0.2, rs.pos[1], rs.pos[2]);
    rg.rotation.y = -Math.PI / 2;
    g.add(rg);
  }

  shadowize(g);
  g.traverse((o) => { if (o.isMesh && o.material && o.material.transparent && !o.material.alphaTest) o.castShadow = false; });
  // üst ve ön panel iç kısmı karartmasın (zemin gölgesini alt/arka paneller verir)
  for (const m of topParts) m.castShadow = false;
  front.traverse((o) => { o.castShadow = false; });

  g.userData.layout = { ...G, light, center: new THREE.Vector3(0, H / 2, 0) };
  g.userData.side = side;
  g.userData.front = front;
  g.userData.fanList = fanList;
  return g;
}

// =====================================================================
// ANAKART
// =====================================================================
function socketGeometryFor(sock) {
  if (/^LGA17|^LGA18/.test(sock)) return { w: 45, h: 37.5, intel: true };
  if (/^LGA/.test(sock)) return /4677|3647|4189|2066|2011/.test(sock) ? { w: 56, h: 76, intel: true } : { w: 37.5, h: 37.5, intel: true };
  if (/TR|WRX/.test(sock)) return { w: 58.5, h: 75.4, intel: false, tr: true };
  return { w: 40, h: 40, intel: false };
}

export function makeMotherboard(x) {
  const L = boardLayout(x);
  const { w, h, socket: s } = L;
  const white = !!x.white;
  const g = new THREE.Group();
  g.name = 'mobo';
  const pcbCol = white ? '#d7dbe1' : '#232832';
  const pcbMat = new THREE.MeshStandardMaterial({ map: pcbTexture(pcbCol, white ? '#c7ccd4' : '#303844'), roughness: 0.62, metalness: 0.15 });
  const pcb = box(w, h, 2, pcbMat, w / 2, -h / 2, -1);
  g.add(pcb);
  const hsCol = white ? 0xe4e6ea : 0x2a2e35;
  const hsMat = M.metal(hsCol, white ? 0.35 : 0.42);
  const hsDark = M.painted(white ? 0xcfd3d9 : 0x16181d, 0.5);
  const accent = accentOf(x.br, 0x7c6cff);
  const plastic = M.plastic(white ? 0xeceef1 : 0x1a1c21, 0.5);

  // montaj delikleri
  const holeMat = M.metal(0x9c8450, 0.65);
  for (const [u, v] of [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6], [s.u + 30, 6], [6, h / 2], [w - 6, h / 2]]) {
    const hm = cyl(3.2, 0.6, holeMat, 16, u, -v, 0.3);
    hm.rotation.x = Math.PI / 2;
    g.add(hm);
  }

  // soket
  const sg = socketGeometryFor(L.sock);
  g.add(box(sg.w + 10, sg.h + 10, 3, M.plastic(0x2a2c31, 0.6), s.u, -s.v, 1.5));
  const frameMat = M.metal(0xb7bcc4, 0.3);
  const fw = sg.w + 6, fh = sg.h + 6;
  g.add(box(fw, 3, 1.4, frameMat, s.u, -s.v + fh / 2 - 1.5, 3.4));
  g.add(box(fw, 3, 1.4, frameMat, s.u, -s.v - fh / 2 + 1.5, 3.4));
  g.add(box(3, fh, 1.4, frameMat, s.u - fw / 2 + 1.5, -s.v, 3.4));
  g.add(box(3, fh, 1.4, frameMat, s.u + fw / 2 - 1.5, -s.v, 3.4));
  const lever = cyl(0.9, fh + 6, frameMat, 8, s.u + fw / 2 + 3, -s.v, 3);
  g.add(lever);
  g.add(box(sg.w - 2, sg.h - 2, 0.5, M.gold(), s.u, -s.v, 3.1));

  // VRM soğutucuları (alçak soğutucularla 3D'de çakışmasın diye sahne yüksekliklerini ölçekleyebilir)
  const vrm = new THREE.Group();
  vrm.name = 'vrm';
  const vU1 = L.vrmU1;
  vrm.add(rbox(vU1 - 28, 24, 30, 3, hsMat, (28 + vU1) / 2, -20, 15));
  if (L.vrmLeft) vrm.add(rbox(22, s.v + 40 - 12, 34, 3, hsMat, 40, -(12 + s.v + 40) / 2, 17));
  // kanatçık çizgileri
  const finMat = M.painted(white ? 0xbfc4cb : 0x101216, 0.6);
  for (let i = 0; i < 6; i++) vrm.add(box(vU1 - 34, 1, 1, finMat, (28 + vU1) / 2, -12 - i * 3, 30.4));
  g.add(vrm);
  const ioH = L.ioH;
  const ioShroud = rbox(27, ioH, 40, 4, hsDark, 14, -6 - ioH / 2, 20);
  g.add(ioShroud);
  g.add(box(1.2, ioH - 16, 20, M.painted(accent, 0.4), 27.7, -6 - ioH / 2, 22));
  if (x.rgb) g.add(box(1.4, ioH - 30, 4, rgbMaterial(0.5, 2.2), 28.2, -6 - ioH / 2, 36));
  const ioLabel = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.7, spacing: 4 }], { w: 512, h: 96, bg: null, fg: white ? '#5b616b' : '#d6dae0', align: 'center' });
  const ioText = plane(ioH * 0.6, 12, new THREE.MeshStandardMaterial({ map: ioLabel, transparent: true, roughness: 0.4 }), 14, -6 - ioH / 2, 40.2);
  ioText.rotation.z = Math.PI / 2;
  g.add(ioText);

  // EPS 8 pin
  for (let i = 0; i < (L.sock === 'AM5' || /LGA18|LGA17/.test(L.sock) ? 2 : 1); i++) g.add(box(18, 9, 12, M.plastic(0x101114), 34 + i * 22, -6.5, 6));

  // DIMM yuvaları
  const slotMatA = M.plastic(white ? 0xf2f3f5 : 0x17191d, 0.5);
  const slotMatB = M.plastic(white ? 0xcfd3d9 : 0x2d3138, 0.5);
  L.dimm.forEach((d, i) => {
    g.add(box(6.2, 140, 7.2, i % 2 ? slotMatA : slotMatB, d.u, -d.v, 3.6));
    g.add(box(6.6, 6, 9.5, plastic, d.u, -d.v + 72.5, 4.75));
    g.add(box(6.6, 6, 9.5, plastic, d.u, -d.v - 72.5, 4.75));
  });

  // 24 pin
  g.add(box(10, 52, 16, M.plastic(0x101114), L.atx24.u - 1, -L.atx24.v, 8));

  // PCIe yuvaları
  const pcieMat = M.plastic(white ? 0xeeeff2 : 0x1b1d22, 0.5);
  const armor = M.metal(white ? 0xe8eaee : 0xb8bcc3, 0.28);
  L.pcie.forEach((p, i) => {
    g.add(box(p.len, 7.5, 11, i === 0 ? armor : pcieMat, p.u + p.len / 2, -p.v, 5.5));
    if (p.x16) g.add(box(7, 7.5, 13, plastic, p.u + p.len + 4, -p.v, 6.5));
  });

  // M.2 soğutucuları (boşken görünür; SSD takılınca sahne gizler)
  const m2Covers = [];
  L.m2.forEach((m, i) => {
    if (m.back) { m2Covers.push(null); return; }
    const cover = new THREE.Group();
    cover.add(rbox(84, 24, 5, 1.5, hsMat, m.u + 42, -m.v, 4.5));
    cover.add(box(60, 2, 0.6, M.painted(i === 0 ? accent : white ? 0xbfc4cb : 0x0f1114, 0.4), m.u + 42, -m.v, 7.2));
    g.add(cover);
    m2Covers.push(cover);
  });

  // yonga seti + SATA
  if (L.chip) {
    const { u: chipU, v: chipV } = L.chip;
    g.add(rbox(56, 38, 9, 4, hsMat, chipU, -chipV, 4.5));
    const chipLbl = labelTexture([{ text: x.chip || '', size: 0.55 }], { w: 512, h: 96, bg: null, fg: white ? '#5b616b' : '#cfd3da', align: 'center' });
    g.add(plane(46, 9, new THREE.MeshStandardMaterial({ map: chipLbl, transparent: true }), chipU, -chipV, 9.2));
    const nSata = clamp(x.sata ?? 4, 0, 8);
    for (let i = 0; i < Math.ceil(nSata / 2); i++) {
      const sv = chipV + 30 + i * 17;
      if (sv > h - 10) break;
      g.add(box(9, 15, 12, M.plastic(0x101114), w - 6, -sv, 6));
    }
  }
  // ses bölümü
  g.add(rbox(clamp(w * 0.22, 40, 70), 50, 6, 3, hsDark, 6 + clamp(w * 0.22, 40, 70) / 2, -(h - 34), 3));

  // marka/model yazısı
  const nm = labelTexture([{ text: x.n || '', size: 0.5, weight: 600 }], { w: 1024, h: 64, bg: null, fg: white ? '#4b515a' : '#9aa1ab' });
  g.add(plane(Math.min(160, w * 0.7), 10, new THREE.MeshStandardMaterial({ map: nm, transparent: true }), w * 0.55, -(h - 8), 0.15));

  shadowize(g);
  g.userData.layout = L;
  g.userData.m2Covers = m2Covers;
  g.userData.vrm = vrm;
  return g;
}

// yer tutucu anakart (anakart seçilmeden önce takılan parçalar için)
export function makeGhostBoard(L = boardLayout(null)) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(L.w, L.h);
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6d7cff, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
  fill.position.set(L.w / 2, -L.h / 2, 0);
  g.add(fill);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineDashedMaterial({ color: 0x8a96ff, dashSize: 8, gapSize: 6, transparent: true, opacity: 0.7 }));
  edges.computeLineDistances();
  edges.position.copy(fill.position);
  g.add(edges);
  const lbl = labelTexture([{ text: 'Anakart seçilmedi', size: 0.55, weight: 600 }], { w: 512, h: 80, bg: null, fg: '#9aa6ff', align: 'center' });
  g.add(plane(120, 19, new THREE.MeshBasicMaterial({ map: lbl, transparent: true, depthWrite: false }), L.w / 2, -L.h + 22, 0.5));
  g.userData.layout = L;
  return g;
}

// tezgâh ayakları (kasa yokken anakart tutucu)
export function makeBenchStand(w) {
  const g = new THREE.Group();
  const mat = M.metal(0x3a3f48, 0.4);
  for (const u of [24, w - 24]) {
    g.add(rbox(16, 50, 70, 3, mat, u, -25, -20));
    g.add(rbox(30, 6, 90, 2, mat, u, -50, -20));
  }
  return shadowize(g);
}

// =====================================================================
// İŞLEMCİ
// =====================================================================
export function makeCPU(x) {
  const sg = socketGeometryFor(x.sock || 'AM5');
  const g = new THREE.Group();
  g.name = 'cpu';
  const subMat = M.plastic(sg.intel ? 0x1f5d34 : sg.tr ? 0x3c6e3a : 0x2c6a3e, 0.5);
  g.add(box(sg.w, sg.h, 1.4, subMat, 0, 0, 0.7));
  const ihsMat = M.metal(0xaeb3ba, 0.5);
  const iw = sg.w * (sg.intel ? 0.66 : 0.86), ih = sg.h * (sg.intel ? 0.86 : 0.86);
  const ihs = rbox(iw, ih, 3, 1.2, ihsMat, 0, 0, 2.8);
  g.add(ihs);
  if (x.sock === 'AM5') {
    // AM5'in köşe çentikleri
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(box(5, 5, 3.2, subMat, a * (iw / 2 - 2), b * (ih / 2 - 2), 2.8));
  }
  if (sg.intel) {
    g.add(rbox(sg.w * 0.86, ih * 0.5, 1.2, 0.6, ihsMat, 0, 0, 1.9));
  }
  const brand = x.br === 'Intel' ? 'intel' : 'AMD';
  const fam = (x.fam || '').replace(/^(AMD|Intel)\s*/i, '').toUpperCase();
  const model = ((x.n || '').match(/([\w-]*\d{3,5}[\w-]*)\s*$/) || [])[1] || '';
  const tex = labelTexture([
    { text: brand, size: 0.9, weight: 800, color: '#4a4f57' },
    { text: fam, size: 0.6, color: '#5a5f68' },
    { text: model.toUpperCase(), size: 0.55, weight: 600, color: '#6a6f78' },
  ], { w: 256, h: 256, bg: null, align: 'center' });
  const lbl = plane(Math.min(iw, ih) * 0.82, Math.min(iw, ih) * 0.82, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.3, metalness: 0.4 }), 0, 0, 4.35);
  g.add(lbl);
  return shadowize(g);
}

// =====================================================================
// HAVA SOĞUTUCU — yerel z karttan dışarı (yükseklik), x hava akışı
// =====================================================================
export function makeAirCooler(x) {
  const cg = coolerGeom(x);
  if (cg.type === 'radial') return makeRadialCooler(x, cg);
  const g = new THREE.Group();
  g.name = 'cooler';
  const white = x.col === 'Beyaz' || /white|beyaz/i.test(x.n || '');
  const finCol = white ? 0xe2e5e9 : x.col === 'Siyah' ? 0x1b1d22 : 0xc4c8ce;
  const finMat = new THREE.MeshStandardMaterial({ color: finCol, metalness: x.col === 'Siyah' || white ? 0.3 : 0.9, roughness: 0.38 });
  const pipeMat = x.col === 'Siyah' ? M.painted(0x15171b, 0.4) : white ? M.painted(0xe6e8ec, 0.4) : M.nickel();
  const fanOpts = { frame: white ? 0xdfe2e6 : 0x15171b, blade: white ? 0xe4e7eb : 0x23262c, rgb: !!x.rgb, thickness: 25 };
  const mtx = new THREE.Matrix4();

  // taban
  g.add(rbox(42, 42, 7, 1.5, M.copper(), 0, 0, 3.5));
  g.add(box(70, 18, 4, M.metal(0x34383f, 0.4), 0, 0, 8));

  if (cg.type === 'low') {
    // üstten üflemeli / alçak: kanatçık yığını + üstte fan; bellek altına girerse yığın yukarı sıkıştırılır
    const { Hc, ex, ey, fanT, finZ0, finZ1 } = cg;
    const fins = new THREE.Group();
    fins.name = 'fins';
    const finH = finZ1 - finZ0;
    const nFin = Math.max(4, Math.floor(finH / 2.4));
    const inst = new THREE.InstancedMesh(cachedGeo(`lowfin${r1(ex)}|${r1(ey)}`, () => new THREE.BoxGeometry(ex, ey, 0.5)), finMat, nFin);
    for (let i = 0; i < nFin; i++) { mtx.makeTranslation(0, 0, finZ0 + 0.25 + (i * (finH - 0.5)) / (nFin - 1)); inst.setMatrixAt(i, mtx); }
    fins.add(inst);
    g.add(fins);
    const nPipes = clamp(x.pipes || 4, 2, 6);
    for (let k = 0; k < nPipes; k++) {
      const p = cyl(3, finZ1 - 8, pipeMat, 12, -((nPipes - 1) * 11) / 2 + k * 11, 0, 8 + (finZ1 - 8) / 2);
      p.rotation.x = Math.PI / 2;
      g.add(p);
    }
    const fan = makeFan(cg.fsz, { ...fanOpts, thickness: fanT });
    fan.position.set(0, 0, Hc - fanT / 2);
    fan.userData.baseZ = fan.position.z;
    g.add(fan);
    g.userData.fans = [fan];
    g.userData.fins = fins;
    g.userData.cg = cg;
    return shadowize(g);
  }

  const { Hc, fsz, width, sd, zStart, zEnd, stackCenters } = cg;
  const nFin = Math.max(10, Math.floor((zEnd - zStart) / 2.3));
  const finGeo = cachedGeo(`fin${r1(sd)}|${r1(width)}`, () => new THREE.BoxGeometry(sd, width, 0.45));
  for (const cx of stackCenters) {
    const inst = new THREE.InstancedMesh(finGeo, finMat, nFin);
    for (let i = 0; i < nFin; i++) { mtx.makeTranslation(cx, 0, zStart + i * ((zEnd - zStart) / (nFin - 1))); inst.setMatrixAt(i, mtx); }
    g.add(inst);
    // üst kapak
    const capMat = M.painted(white ? 0xf3f4f6 : x.col === 'Siyah' ? 0x0f1013 : 0x202329, 0.35);
    g.add(rbox(sd + 2, width + 2, 4, 1.5, capMat, cx, 0, Hc - 1));
    if (x.rgb) {
      const strip = rgbMaterial(0.5);
      g.add(box(sd - 4, 2.2, 1.6, strip, cx, width / 2 - 2, Hc + 0.6));
      g.add(box(sd - 4, 2.2, 1.6, strip, cx, -width / 2 + 2, Hc + 0.6));
    }
  }
  // ısı boruları: tabandan kuleye
  const nPipes = clamp(x.pipes || 6, 3, 8);
  for (let k = 0; k < nPipes; k++) {
    const yy = -width * 0.3 + (k * (width * 0.6)) / (nPipes - 1);
    for (const cx of stackCenters) {
      const p = cyl(3, zEnd - 12, pipeMat, 12, cx + (k % 2 ? 4 : -4) * (stackCenters.length === 1 ? 1 : 0.5), yy, 12 + (zEnd - 12) / 2);
      p.rotation.x = Math.PI / 2;
      g.add(p);
    }
    if (stackCenters.length === 2) {
      const bridge = cyl(3, stackCenters[1] - stackCenters[0], pipeMat, 12, 0, yy, 12);
      bridge.rotation.z = Math.PI / 2;
      g.add(bridge);
    }
  }
  // fanlar (hava akışı: önden arkaya); bellek yüksekse sahne fanları yukarı kaydırır
  const fans = [];
  for (const f of cg.fans) {
    const fan = makeFan(f.size, fanOpts);
    fan.rotation.y = Math.PI / 2;
    fan.position.set(f.x, 0, f.z);
    fan.userData.baseZ = f.z;
    g.add(fan);
    fans.push(fan);
  }
  g.userData.fans = fans;
  g.userData.cg = cg;
  return shadowize(g);
}

// stok tipi (AMD Wraith, Intel kutu soğutucusu vb.): ışınsal alüminyum kanatçıklar + üstte fan
function makeRadialCooler(x, cg) {
  const g = new THREE.Group();
  g.name = 'cooler';
  const { Hc, R, finR, fanT } = cg;
  const white = x.col === 'Beyaz' || /white|beyaz/i.test(x.n || '');
  const alu = M.metal(0xc9cdd3, 0.36);
  const finZ1 = Hc - fanT - 1;
  const base = cyl(finR * 0.5, 3, alu, 40, 0, 0, 1.5);
  base.rotation.x = Math.PI / 2;
  g.add(base);
  const core = cyl(finR * 0.34, finZ1 - 3, /prism|spire|bakır|copper/i.test(x.n || '') ? M.copper() : alu, 32, 0, 0, 3 + (finZ1 - 3) / 2);
  core.rotation.x = Math.PI / 2;
  g.add(core);
  const nFin = 44;
  const finLen = finR * 0.66;
  const finGeo = cachedGeo(`radfin${r1(finLen)}|${r1(finZ1)}`, () => new THREE.BoxGeometry(finLen, 0.9, finZ1 - 4));
  const inst = new THREE.InstancedMesh(finGeo, alu, nFin);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), ax = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < nFin; i++) {
    const a = (i / nFin) * Math.PI * 2;
    const rr = finR * 0.34 + finLen / 2;
    q.setFromAxisAngle(ax, a + 0.22);
    pos.set(Math.cos(a) * rr, Math.sin(a) * rr, 4 + (finZ1 - 4) / 2);
    mtx.compose(pos, q, one);
    inst.setMatrixAt(i, mtx);
  }
  g.add(inst);
  const fan = makeFan(2 * R - 2, { frame: white ? 0xe9ebee : 0x101114, blade: white ? 0xe4e7eb : 0x1d2025, rgb: !!x.rgb, thickness: fanT });
  fan.position.set(0, 0, Hc - fanT / 2);
  fan.userData.baseZ = fan.position.z;
  g.add(fan);
  g.userData.fans = [fan];
  g.userData.cg = cg;
  return shadowize(g);
}

// =====================================================================
// SIVI SOĞUTMA (AIO) — pompa + radyatör (+ hortumları sahne çizer)
// =====================================================================
export function makeAIOPump(x) {
  const g = new THREE.Group();
  g.name = 'pump';
  const white = x.col === 'Beyaz' || /white|beyaz/i.test(x.n || '');
  // yükseklik epey'deki pompa ölçüsünden (yerleşim denetimi de aynı değeri kullanır)
  const ph = pumpDims(x).z1;
  g.add(rbox(44, 44, 6, 1.5, M.copper(), 0, 0, 3));
  const body = cyl(33, ph - 8, M.plastic(white ? 0xeceef1 : 0x14161a, 0.45), 48, 0, 0, 6 + (ph - 8) / 2);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const capMat = x.lcd
    ? new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x1f6feb, emissiveIntensity: 0.9, roughness: 0.2, emissiveMap: labelTexture([{ text: (x.br || 'AIO').toUpperCase(), size: 0.5 }, { text: '42°C', size: 0.7 }], { w: 256, h: 256, bg: '#0a1a33', fg: '#cfe3ff', align: 'center' }) })
    : M.plastic(white ? 0xf6f7f9 : 0x0c0d10, 0.25);
  const cap = cyl(30, 2, capMat, 48, 0, 0, ph - 1);
  cap.rotation.x = Math.PI / 2;
  g.add(cap);
  if (x.rgb) {
    const ring = new THREE.Mesh(cachedGeo('pumpring', () => new THREE.TorusGeometry(31.5, 1.6, 8, 64)), rgbMaterial(1, 2.6));
    ring.position.z = ph - 1.5;
    g.add(ring);
  }
  if (!x.lcd) {
    const lbl = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.75, spacing: 3 }], { w: 256, h: 64, bg: null, fg: white ? '#41464f' : '#d7dbe2', align: 'center' });
    g.add(plane(40, 10, new THREE.MeshStandardMaterial({ map: lbl, transparent: true }), 0, 0, ph + 0.1));
  }
  // hortum bağlantıları (pompanın üst tarafından çıkar)
  const fitMat = M.metal(0x2a2d33, 0.4);
  const ports = [];
  const fz = clamp(ph * 0.6, 20, ph - 12);
  for (const dx of [-11, 11]) {
    const fit = cyl(5.5, 14, fitMat, 16, dx, 33, fz);
    g.add(fit);
    ports.push(new THREE.Vector3(dx, 40, fz));
  }
  g.userData.ports = ports;
  return shadowize(g);
}

export function makeRadiator(x) {
  const g = new THREE.Group();
  g.name = 'radiator';
  const { fsz, n, L, Wd, T } = radDims(x);
  const white = x.col === 'Beyaz' || /white|beyaz/i.test(x.n || '');
  const finMat = new THREE.MeshStandardMaterial({ color: white ? 0xe9ebee : 0x23262b, map: cloneTex(finTexture, 1, (L - 40) / 8), metalness: 0.5, roughness: 0.55 });
  finMat.map.rotation = Math.PI / 2;
  g.add(box(L - 40, T - 2, Wd, finMat, 0, 0, 0));
  const tankMat = M.painted(white ? 0xf2f3f5 : 0x101114, 0.4);
  g.add(rbox(22, T + 4, Wd + 4, 3, tankMat, -L / 2 + 11, 0, 0));
  g.add(rbox(22, T + 4, Wd + 4, 3, tankMat, L / 2 - 11, 0, 0));
  g.add(box(L - 40, 2, Wd + 2, tankMat, 0, T / 2, 0));
  const fanOpts = { frame: white ? 0xdfe2e6 : 0x15171b, blade: white ? 0xe4e7eb : 0x23262c, rgb: !!x.rgb, thickness: 25 };
  const fans = [];
  for (let i = 0; i < n; i++) {
    const fan = makeFan(fsz, fanOpts);
    fan.rotation.x = Math.PI / 2;
    fan.position.set(-((n - 1) * fsz) / 2 + i * fsz, -T / 2 - 12.5, 0);
    g.add(fan);
    fans.push(fan);
  }
  const fitMat = M.metal(0x2a2d33, 0.4);
  const ports = [];
  for (const dz of [-14, 14]) {
    const fit = cyl(5.5, 10, fitMat, 16, L / 2 - 11, -T / 2 - 4, dz);
    g.add(fit);
    ports.push(new THREE.Vector3(L / 2 - 11, -T / 2 - 9, dz));
  }
  g.userData.ports = ports;
  g.userData.fans = fans;
  g.userData.dims = { L, T, W: Wd };
  return shadowize(g);
}

// =====================================================================
// RAM — yerel y uzun kenar, z karttan dışarı, x kalınlık
// =====================================================================
export function makeRamStick(x) {
  const g = new THREE.Group();
  g.name = 'ram';
  const { ht, bare } = ramDims(x);
  const col = colorOf(x.col, 0x1d1f24);
  const light = isLight(col);
  g.add(box(1.3, 133, 31, M.plastic(bare ? 0x1d5a32 : 0x1f4f2f, 0.5), 0, 0, 15.5));
  g.add(box(1.4, 128, 4, M.gold(), 0, 0, 2));
  if (bare) {
    // soğutucusuz modül: yeşil PCB üzerinde bellek yongaları ve etiket
    const chip = M.plastic(0x111214, 0.38);
    const per = x.mods ? (x.cap || 0) / x.mods : x.per || 8;
    const sides = per >= 32 ? [-1, 1] : [1];
    for (const sx of sides) for (let i = 0; i < 8; i++) g.add(box(1.1, 11, 10, chip, sx * 1.2, -57 + i * 15.2 + (i >= 4 ? 6 : 0), 15));
    if (x.mt === 'DDR5') g.add(box(1.1, 6, 6, chip, 1.2, 3, 25));
    const lbl = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.62, weight: 800 }, { text: `${x.per || x.cap || ''}GB ${x.mt || ''}-${x.spd || ''}`, size: 0.42, weight: 500 }], { w: 512, h: 128, bg: '#e9ebee', fg: '#1b1d22' });
    const p = plane(46, 8, new THREE.MeshStandardMaterial({ map: lbl, roughness: 0.6 }), 0.72, -30, 26.5);
    p.rotation.y = Math.PI / 2;
    p.rotation.z = Math.PI / 2;
    g.add(p);
    g.userData.height = 31;
    return shadowize(g);
  }
  const spread = M.painted(col, light ? 0.35 : 0.42);
  const hsH = x.rgb ? ht - 7 : x.hs ? ht - 2 : ht;
  for (const sx of [-1, 1]) {
    g.add(rbox(2.4, 133, hsH - 3, 1, spread, sx * 2, 0, 3 + (hsH - 3) / 2));
  }
  if (x.hs || x.rgb) {
    g.add(rbox(6.8, 133, 4, 1.2, spread, 0, 0, hsH));
  }
  if (x.rgb) {
    const bar = rbox(6, 127, 7, 2, rgbMaterial(0.8, 2.6), 0, 0, hsH + 3.5);
    g.add(bar);
  }
  const lbl = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.62, spacing: 2 }, { text: `${x.mt || ''} ${x.spd || ''}`, size: 0.45, weight: 500 }], { w: 512, h: 128, bg: null, fg: light ? '#3c4049' : '#d5d9e0' });
  const lm = new THREE.MeshStandardMaterial({ map: lbl, transparent: true, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    const p = plane(70, 17, lm, sx * 3.3, 10, Math.min(hsH * 0.55, hsH - 10));
    p.rotation.y = sx * Math.PI / 2;
    p.rotation.z = Math.PI / 2 * sx;
    g.add(p);
  }
  g.userData.height = ht;
  return shadowize(g);
}

// =====================================================================
// EKRAN KARTI — yerel x uzunluk (0 = arka braket), z karttan dışarı, -y fan tarafı
// =====================================================================
export function makeGPU(x) {
  const g = new THREE.Group();
  g.name = 'gpu';
  // ölçüler ortak modelden: Hc = PCB alt kenarından kapağa (epey yüksekliği - 10 mm)
  const gd = gpuDims(x);
  const { cool, lp, L, T } = gd;
  const Hc = gd.H;
  const col = colorOf(x.col, 0x1c1f24);
  const light = isLight(col);
  const shroud = M.painted(col, light ? 0.4 : 0.46);
  const shroud2 = M.painted(new THREE.Color(col).multiplyScalar(light ? 0.86 : 1.6), 0.5);
  const accent = x.mk === 'NVIDIA' ? 0x76b900 : x.mk === 'AMD' ? 0xed1c24 : x.mk === 'Intel' ? 0x0071c5 : 0x7c6cff;
  const plateT = 8; // fan tarafındaki kapak kalınlığı

  // PCB + altın uçlar + görünen bileşenler
  const pcbMat = M.plastic(0x101a14, 0.6);
  g.add(box(L - 10, 1.6, Hc - 8, pcbMat, 4 + (L - 10) / 2, 0, (Hc - 8) / 2));
  g.add(box(80, 1.7, 6, M.gold(), 48 + 40, 0, -3));

  // arka plaka (+y): metal, plastik ya da yok (yoksa PCB üzerindeki bileşenler görünür)
  const bp = x.bp || 'metal';
  if (bp === 'metal' || bp === 'plastic') {
    const bpMat = bp === 'metal' ? M.metal(light ? 0xe2e4e8 : 0x22252b, 0.42) : M.plastic(light ? 0xe6e8ec : 0x15171b, 0.55);
    g.add(rbox(L - 6, 2.4, Hc - 6, 1, bpMat, 3 + (L - 6) / 2, 2.1, (Hc - 6) / 2 + 2));
    // akış delikli arka plaka ucu (uzun kartlarda)
    if (L > 250 && bp === 'metal') g.add(box(L * 0.18, 0.6, Hc * 0.6, M.plastic(0x050506, 0.7), L - L * 0.13, 3.4, Hc * 0.5));
    const bpLbl = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.7, spacing: 6 }], { w: 512, h: 96, bg: null, fg: light ? '#61666f' : '#b8bdc6', align: 'center' });
    const bpText = plane(Math.min(120, L * 0.45), 22, new THREE.MeshStandardMaterial({ map: bpLbl, transparent: true }), L * 0.5, 3.4, Hc * 0.5);
    bpText.rotation.x = -Math.PI / 2;
    g.add(bpText);
  } else {
    const chip = M.plastic(0x16181b, 0.45);
    for (let i = 0; i < Math.floor((L - 60) / 26); i++) g.add(box(12, 1.2, 12, chip, 40 + i * 26, 1.4, Hc * 0.62));
    for (let i = 0; i < 6; i++) g.add(cyl(3, 4, M.metal(0x8a8f98, 0.35), 12, 30 + i * 12, 3, Hc * 0.25));
  }

  const fans = [];
  const tubePorts = [];
  if (cool === 'block') {
    // su bloğu: ince akrilik/metal blok, iki rakor; fan yok
    const blockMat = new THREE.MeshPhysicalMaterial({ color: 0x0d1016, metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 });
    g.add(rbox(L - 8, T - 6, Hc - 4, 4, blockMat, L / 2, -T / 2 - 1, Hc / 2 + 1));
    g.add(rbox(L * 0.55, 2, Hc * 0.55, 2, M.metal(0xb9bec7, 0.25), L * 0.45, -T + 3, Hc * 0.5));
    for (const dz of [-14, 14]) {
      const fit = cyl(6, 12, M.nickel(), 20, L * 0.78, -T / 2, Hc + 4 + 0 * dz);
      fit.rotation.x = Math.PI / 2;
      fit.position.x += dz;
      g.add(fit);
    }
  } else {
    // soğutucu kanatçık bloğu (yan yüzlerde dikey kanatçık görünümü)
    const finT = cool === 'passive' ? T - 3 : Math.max(6, T - plateT - 3);
    const finSide = new THREE.MeshStandardMaterial({ color: 0xffffff, map: cloneTex(finVTexture, (L - 12) / 18, 1), metalness: 0.6, roughness: 0.45 });
    const finEnd = M.metal(0x2c3036, 0.5);
    const fins = new THREE.Mesh(cachedGeo(`gpufin${r1(L)}|${r1(finT)}|${r1(Hc)}`, () => new THREE.BoxGeometry(L - 12, finT, Hc - 7)), [finEnd, finEnd, finEnd, finEnd, finSide, finSide]);
    fins.position.set(L / 2, -1.5 - finT / 2, (Hc - 7) / 2 + 3);
    g.add(fins);
    if (cool === 'passive') {
      // pasif: açık alüminyum kanatçıklar, alt yüzde de kanatçık dokusu
      const under = new THREE.MeshStandardMaterial({ color: 0xc9cdd3, map: cloneTex(finVTexture, (L - 12) / 18, 1), metalness: 0.8, roughness: 0.4 });
      const bottom = plane(L - 12, Hc - 7, under, L / 2, -T + 1.4, (Hc - 7) / 2 + 3);
      bottom.rotation.x = Math.PI / 2;
      g.add(bottom);
    }
  }

  if (cool === 'fan' || cool === 'liquid') {
    // fan tarafı kapak; sıvı soğutmalı kartlarda fan deliği yok (hortumlar radyatöre gider)
    const nf = cool === 'liquid' ? 0 : clamp(x.fans || (L > 280 ? 3 : 2), 1, 3);
    const fsz = nf ? Math.min(Hc - 20, (L - 24) / nf - 6, 102) : 0;
    const centers = Array.from({ length: nf }, (_, i) => 12 + (L - 24) * ((i + 0.5) / nf));
    const plateGeo = cachedGeo(`gpuplate2${r1(L)}|${r1(Hc)}|${nf}|${r1(fsz)}`, () => {
      const r = 6, z0 = 4, z1 = Hc + 3;
      const sh = new THREE.Shape();
      sh.moveTo(r, z0); sh.lineTo(L - r, z0); sh.quadraticCurveTo(L, z0, L, z0 + r);
      sh.lineTo(L, z1 - r); sh.quadraticCurveTo(L, z1, L - r, z1);
      sh.lineTo(r, z1); sh.quadraticCurveTo(0, z1, 0, z1 - r);
      sh.lineTo(0, z0 + r); sh.quadraticCurveTo(0, z0, r, z0);
      for (const cx of centers) {
        const hole = new THREE.Path();
        hole.absarc(cx, (z0 + z1) / 2, fsz / 2 + 1.5, 0, Math.PI * 2, true);
        sh.holes.push(hole);
      }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: plateT, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2, curveSegments: 40 });
      geo.rotateX(Math.PI / 2);
      return geo;
    });
    const plate = new THREE.Mesh(plateGeo, shroud);
    plate.position.set(0, -T + plateT + 1, 0);
    g.add(plate);
    for (const cx of centers) {
      const fan = makeFan(fsz, { blade: light ? 0xe9ebee : 0x1d2025, thickness: 11, speed: 0.8, frameless: true });
      fan.rotation.x = Math.PI / 2;
      fan.position.set(cx, -T + plateT / 2 + 1, Hc / 2 + 3.5);
      g.add(fan);
      fans.push(fan);
      const ring = new THREE.Mesh(cachedGeo(`gpuring${r1(fsz)}`, () => new THREE.TorusGeometry(fsz / 2 + 1.5, 1.1, 6, 48)), x.rgb ? rgbMaterial(1, 2.4) : shroud2);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, -T + 1, Hc / 2 + 3.5);
      g.add(ring);
    }
    if (cool === 'liquid') {
      // hibrit: fansız kapak üzerinde havalandırma çizgileri; hortumlar kartın ön ucundan çıkar
      for (let i = 0; i < 5; i++) g.add(box(L * 0.5, 0.8, 2.4, M.plastic(0x050506, 0.6), L * 0.45, -T - 0.2, Hc * 0.3 + i * Hc * 0.1));
      const fitMat = M.metal(0x2a2d33, 0.35);
      for (const dz of [Hc * 0.38, Hc * 0.62]) {
        const fit = cyl(5.5, 12, fitMat, 16, L + 4, -T / 2, dz);
        fit.rotation.z = Math.PI / 2;
        g.add(fit);
        tubePorts.push(new THREE.Vector3(L + 10, -T / 2, dz));
      }
    }
    // uç kapağı
    g.add(rbox(10, T - 1, Hc, 3, shroud, L - 5, -T / 2 + 0.5, Hc / 2 + 3));
  }

  // cam tarafı (+z) yan kapak: logo, vurgu çizgisi, RGB
  if (cool !== 'passive') {
    const coverH = Math.max(10, Math.min(T * 0.42, 26));
    const coverY = -T + (cool === 'block' ? 4 : plateT + 1) + coverH / 2 - 2;
    const coverL = L * 0.74;
    g.add(rbox(coverL, coverH, 3.2, 1.2, shroud, L * 0.52, coverY, Hc + 2.6));
    const chipTxt = (x.chip || x.n || '').replace(/^GeForce\s*/i, 'GEFORCE ').toUpperCase();
    const sideTex = labelTexture([{ text: chipTxt, size: 0.62, spacing: 3 }], { w: 1024, h: 96, bg: null, fg: light ? '#3d424b' : '#e2e6ec' });
    g.add(plane(Math.min(coverL * 0.55, 180), Math.min(coverH * 0.55, 12), new THREE.MeshStandardMaterial({ map: sideTex, transparent: true }), L * 0.42, coverY + 1, Hc + 4.25));
    g.add(box(coverL * 0.92, 1.3, 0.6, M.painted(accent, 0.4), L * 0.52, coverY - coverH / 2 + 2.2, Hc + 4.3));
    if (x.rgb) g.add(rbox(coverL * 0.86, 2.2, 1.2, 0.5, rgbMaterial(1.4, 2.8), L * 0.52, coverY + coverH / 2 - 1.6, Hc + 4.3));
  }

  // braket: düşük profil kartta yarım boy; portlar (DP/HDMI) dış yüzde
  const br = M.metal(0x9ea3ab, 0.35);
  const brH = lp ? 79 : 121;
  const brW = Math.max(T + 6, 22);
  g.add(box(1.2, brW, brH, br, -1, -T / 2 + 6, brH / 2 - 8));
  g.add(box(14, brW, 1.2, br, 6, -T / 2 + 6, brH - 7));
  const portMat = M.plastic(0x050506, 0.7);
  const ports = [...Array(clamp(x.dp ?? 3, 0, 4)).fill('dp'), ...Array(clamp(x.hdmi ?? 1, 0, 2)).fill('hdmi')];
  ports.slice(0, lp ? 3 : 6).forEach((t, i) => {
    g.add(box(1, t === 'dp' ? 5 : 4.5, t === 'dp' ? 16 : 14, portMat, -1.8, -6, 6 + i * 19));
  });

  // güç soketleri (üst kenar): 8/6 pin ya da 12V-2x6 (16 pin); "pinsiz" kartlarda yok
  const sockets = gpuSocketsLayout(gd);
  for (const sk of sockets) g.add(box(sk.w, 8, 7, M.plastic(0x0d0e10, 0.6), sk.x, -4, Hc + 1.5));

  g.userData.powerSockets = sockets;
  g.userData.fans = fans;
  g.userData.dims = { L, H: Hc, T };
  g.userData.liquid = cool === 'liquid';
  g.userData.ports = tubePorts;
  return shadowize(g);
}

// =====================================================================
// GÜÇ KAYNAĞI — yerel x derinlik (0..dd), y yükseklik (0..dh), z genişlik (ortalı)
// =====================================================================
export function makePSU(x, { generic = false } = {}) {
  const g = new THREE.Group();
  g.name = 'psu';
  const pd = psuDims(x);
  const { dw, dh, dd } = pd;
  const col = colorOf(x && x.col, 0x15171b);
  const light = isLight(col);
  const bodyMat = M.painted(col, 0.5);
  g.add(rbox(dd, dh, dw, 3, bodyMat, dd / 2, dh / 2, 0));
  // fan ızgarası (alt yüz) ve üst yüz
  const fanR = Math.min(dw, dd) * 0.42;
  const grill = new THREE.Mesh(cachedGeo(`psugrill${r1(fanR)}`, () => new THREE.CircleGeometry(fanR, 48)), new THREE.MeshStandardMaterial({ color: light ? 0xcfd2d7 : 0x0a0b0d, alphaMap: grillTexture, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.4 }));
  grill.rotation.x = Math.PI / 2;
  grill.position.set(dd / 2, -0.4, 0);
  g.add(grill);
  const fanDisk = new THREE.Mesh(cachedGeo(`psufan${r1(fanR)}`, () => new THREE.CircleGeometry(fanR - 2, 40)), M.plastic(0x16181c, 0.6));
  fanDisk.rotation.x = Math.PI / 2;
  fanDisk.position.set(dd / 2, 2, 0);
  g.add(fanDisk);
  // yan etiket (cam tarafı +z)
  const wTxt = generic ? 'PSU' : `${x.w || ''}W`;
  const tex = labelTexture([
    { text: generic ? 'KASA İLE GELEN' : (x.br || '').toUpperCase(), size: 0.42, spacing: 3, color: light ? '#4a4f58' : '#9aa1ab' },
    { text: wTxt, size: 0.95, weight: 800, color: light ? '#1d2026' : '#f0f2f5' },
    { text: generic ? '' : (x.eff || '').toUpperCase(), size: 0.4, color: '#c9a24a' },
  ], { w: 512, h: 256, bg: null, align: 'left' });
  const side = plane(dd * 0.8, dh * 0.8, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4 }), dd * 0.5, dh / 2, dw / 2 + 0.3);
  g.add(side);
  // ön yüz: modüler soketler veya kablo demeti
  if (pd.modular) {
    const sock = M.plastic(0x060607, 0.7);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) g.add(box(1, 9, 16, sock, dd + 0.2, 18 + r * 22, -dw / 2 + 22 + c * ((dw - 44) / 3)));
  } else {
    const bundle = cyl(9, 15, M.plastic(0x08090a, 0.6), 16, dd + 4.5, dh / 2, 0);
    bundle.rotation.z = Math.PI / 2;
    g.add(bundle);
  }
  // arka yüz: priz + anahtar + petek
  g.add(box(1, 16, 28, M.plastic(0x050506), -0.3, dh * 0.3, -dw * 0.22));
  g.add(box(1, 10, 14, M.plastic(0x050506), -0.3, dh * 0.3, dw * 0.12));
  g.userData.dims = { dw, dh, dd };
  return shadowize(g);
}

// =====================================================================
// DEPOLAMA
// =====================================================================
export function makeM2(x) {
  const g = new THREE.Group();
  g.name = 'm2';
  const L = /2230/.test(x.ff || '') ? 30 : /2242/.test(x.ff || '') ? 42 : /22110/.test(x.ff || '') ? 110 : 80;
  g.add(box(L, 22, 0.9, M.plastic(0x0c0d10, 0.5), L / 2, 0, 0.45));
  g.add(box(4, 19, 1, M.gold(), 2, 0, 0.5));
  const chip = M.plastic(0x15171a, 0.4);
  g.add(box(14, 14, 1.4, chip, 14, 0, 1.6));
  if (L > 40) { g.add(box(16, 15, 1.4, chip, 34, 0, 1.6)); g.add(box(16, 15, 1.4, chip, 55, 0, 1.6)); }
  // soğutucu (kartın arkasındaki yuvaya takılırsa sahne gizler; sökülmüş sayılır) ve etiket
  const lbl = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.55, weight: 800 }, { text: capText(x.cap) + (x.bus ? ' · ' + x.bus : ''), size: 0.38 }], { w: 512, h: 160, bg: '#c9cdd3', fg: '#15171b', accent: '#' + accentOf(x.br, 0x2563eb).toString(16).padStart(6, '0') });
  const label = plane(L - 12, 19, new THREE.MeshStandardMaterial({ map: lbl, roughness: 0.6 }), L / 2 + 2, 0, 2.45);
  g.add(label);
  if (x.hs) {
    const hs = new THREE.Group();
    hs.add(rbox(L - 4, 23, 7, 1.5, M.metal(0x2a2e35, 0.4), L / 2, 0, 4.5));
    for (let i = 0; i < 5; i++) hs.add(box(L - 10, 1.2, 1.5, M.metal(0x41464f, 0.4), L / 2, -8 + i * 4, 8.5));
    g.add(hs);
    label.visible = false;
    g.userData.hs = hs;
  }
  g.userData.label = label;
  return shadowize(g);
}

const capText = (gb) => (!gb ? '' : gb >= 1000 ? `${+(gb / 1000).toFixed(1)} TB` : `${gb} GB`);

// 2.5" SSD ve 3.5" HDD — yerel x uzunluk, z genişlik, y kalınlık (ortalı)
export function makeDrive(x) {
  const g = new THREE.Group();
  const hdd = x.kind === 'hdd';
  const big = hdd && x.ff !== '2.5';
  g.name = hdd ? 'hdd' : 'ssd';
  const dd = big ? DRIVE_DIMS.hdd35 : hdd ? DRIVE_DIMS.hdd25 : DRIVE_DIMS.ssd;
  const L = dd.L, Wd = dd.W, T = dd.T;
  const bodyMat = hdd ? M.metal(0xaeb3ba, 0.42) : M.painted(colorOf(x.col, 0x23262c), 0.45);
  g.add(rbox(L, T, Wd, 1.5, bodyMat, 0, 0, 0));
  const lbl = labelTexture([
    { text: (x.br || '').toUpperCase(), size: 0.62, weight: 800 },
    { text: capText(x.cap) + (hdd ? (x.rpm ? ` · ${x.rpm} RPM` : '') : ' SSD'), size: 0.45 },
  ], { w: 512, h: 256, bg: hdd ? '#16181c' : null, fg: '#eef0f3', accent: '#' + accentOf(x.br, 0x7c6cff).toString(16).padStart(6, '0') });
  const top = plane(L * 0.8, Wd * 0.75, new THREE.MeshStandardMaterial({ map: lbl, transparent: !hdd, roughness: 0.5 }), 0, T / 2 + 0.2, 0);
  top.rotation.x = -Math.PI / 2;
  g.add(top);
  if (hdd) g.add(box(L * 0.6, 1, Wd * 0.8, M.plastic(0x103a22, 0.5), 0, -T / 2 - 0.5, 0));
  return shadowize(g);
}
