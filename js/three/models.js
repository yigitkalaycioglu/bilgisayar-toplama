// Prosedürel 3D parça modelleri. Birim: milimetre.
// Dünya ekseni: +x kasanın önü, +y yukarı, +z cam yan panel (izleyiciye doğru).
// Anakart yerel ekseni: orijin kartın üst-arka köşesi, +x öne, -y aşağı, +z karttan dışarı.
import * as THREE from '../../vendor/three.bundle.js';
import { RoundedBoxGeometry, mergeGeometries } from '../../vendor/three.bundle.js';
import {
  M, rgbMaterial, pcbTexture, meshAlpha, finTexture, finVTexture, grillTexture, labelTexture,
  colorOf, isLight, cachedGeo, cloneTex,
} from './materials.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(cachedGeo(`b${r1(w)}|${r1(h)}|${r1(d)}`, () => new THREE.BoxGeometry(w, h, d)), mat);
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
  let W = x.w || ({ 'Mini ITX': 200, 'Micro ATX': 210 }[x.ct] ?? 225);
  let H = x.h || ({ 'Mini ITX': 340, 'Micro ATX': 420, 'E-ATX': 520 }[x.ct] ?? 470);
  let D = x.d || ({ 'Mini ITX': 360, 'Micro ATX': 400, 'E-ATX': 500 }[x.ct] ?? 450);
  if (W > D * 1.35 && D < 300) [W, D] = [D, W];
  W = clamp(W, 160, 380); H = clamp(H, 240, 720); D = clamp(D, 260, 680);

  const color = colorOf(x.col, 0x1b1d22);
  const light = isLight(color);
  const body = M.painted(color, light ? 0.48 : 0.58);
  const innerC = new THREE.Color(color).multiplyScalar(light ? 0.9 : 0.8);
  const inner = M.painted(innerC, 0.72);
  const trimMat = M.plastic(light ? 0xd9dce1 : 0x0e0f12, 0.5);
  const darkMat = M.plastic(0x0b0c0f, 0.7);
  const t = 3, f = 14, yB = f;
  const dual = /yan/i.test(x.pos || '') && W >= 262;
  const topPsu = /üst/i.test(x.pos || '');
  const hasShroud = !dual && !topPsu;
  const shroudH = hasShroud ? clamp(H * 0.2, 78, 104) : 0;

  const g = new THREE.Group();
  g.name = 'case';
  const xR = -D / 2 + t, xF = D / 2 - t, yT = H - t;

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

  // ---- ön panel ----
  const front = new THREE.Group();
  front.name = 'front';
  const fw = 16;
  if (dual) {
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
  g.add(front);

  // ---- anakart tepsisi ----
  const trayZ = dual ? Math.max(-W / 2 + t + 96, W / 2 - t - 205) : -W / 2 + clamp(W * 0.12, 20, 34);
  const shroudTop = hasShroud ? yB + t + shroudH : yB + t;
  const frontGap = dual ? 20 : clamp(D * 0.11, 38, 70);
  const trayX0 = xR, trayX1 = xF - frontGap;
  const tray = box(trayX1 - trayX0, yT - shroudTop, 1.5, inner, (trayX0 + trayX1) / 2, (yT + shroudTop) / 2, trayZ);
  g.add(tray);
  // kablo geçiş lastikleri
  const grommets = [];
  for (const [yy, hh] of [[0.72, 70], [0.42, 55], [0.16, 40]]) {
    const gy = shroudTop + (yT - shroudTop) * yy;
    g.add(rbox(14, hh, 2.5, 4, M.rubber(0x08090b), trayX1 - 16, gy, trayZ + 1));
    grommets.push({ x: trayX1 - 16, y: gy, h: hh });
  }
  // dual: iki bölmeyi ayıran üst/alt çıta
  const mainZ = (trayZ + W / 2 - t) / 2;

  // ---- PSU örtüsü ----
  if (hasShroud) {
    const sx0 = xR, sx1 = xF - 28;
    const zs0 = trayZ, zs1 = W / 2 - t - 3;
    g.add(box(sx1 - sx0, t, zs1 - zs0, inner, (sx0 + sx1) / 2, shroudTop - t / 2, (zs0 + zs1) / 2));
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

  // ---- ayaklar ----
  for (const sxn of [-1, 1]) for (const szn of [-1, 1]) {
    g.add(rbox(34, f, 22, 4, M.rubber(0x0d0e11), sxn * (D / 2 - 34), f / 2, szn * (W / 2 - 22)));
  }

  // ---- arka panel detayları (dış yüz) ----
  const rearX = -D / 2 - 0.3;
  const boardTopGap = topPsu ? 106 : clamp((yT - shroudTop - 305) * 0.5, 16, 64);
  const boardTopY = yT - boardTopGap;
  const boardRearX = xR + 10;
  const ioPlate = box(1, 160, 46, M.metal(0x6b7078, 0.5), rearX, boardTopY - 10 - 80, trayZ + 8 + 24);
  g.add(ioPlate);
  for (let i = 0; i < 7; i++) {
    const sy = boardTopY - 160 - i * 20.32;
    if (sy < shroudTop + 12) break;
    g.add(box(1, 14, 110, M.metal(light ? 0xd0d3d8 : 0x2b2f36, 0.45), rearX, sy, trayZ + 8 + 60));
  }
  const rearGrill = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, alphaMap: grillTexture, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });

  // ---- fanlar ----
  const fsz = x.fsz && x.fsz >= 80 ? Math.min(x.fsz, 200) : 120;
  const nFans = clamp(x.fans || 0, 0, 10);
  const fanOpts = { frame: light ? 0xe2e4e8 : 0x15171b, blade: light ? 0xeceef1 : 0x1d2026, rgb: !!x.frgb };
  const slots = [];
  const rearFanSize = Math.min(fsz, 140);
  const rearFan = { pos: [xR + 13.5, yT - 22 - rearFanSize / 2, mainZ], axis: 'x', size: rearFanSize };
  const frontCap = dual ? 0 : Math.floor((yT - yB - 30) / (fsz + 4));
  const fronts = Array.from({ length: Math.min(3, frontCap) }, (_, i) => ({ pos: [xF - 15, yT - 30 - fsz / 2 - i * (fsz + 4), 0], axis: 'x', size: fsz }));
  const topCap = Math.floor((D - 150) / (fsz + 4));
  const tops = Array.from({ length: Math.min(3, topCap) }, (_, i) => ({ pos: [xF - frontGap - 15 - fsz / 2 - i * (fsz + 4), yT - 14, mainZ + 6], axis: 'y', size: fsz }));
  const bottoms = Array.from({ length: Math.min(3, Math.floor((D - 80) / (fsz + 4))) }, (_, i) => ({ pos: [xF - 30 - fsz / 2 - i * (fsz + 4), yB + t + 14, mainZ], axis: 'y', size: fsz }));
  if (dual) slots.push(...bottoms, ...tops, rearFan);
  else slots.push(rearFan, ...fronts, ...tops);
  const used = slots.slice(0, nFans);
  const fanGroups = { r: [], f: [], t: [], b: [], s: [] };
  for (const s of used) {
    const fan = makeFan(s.size, fanOpts);
    fan.position.set(...s.pos);
    if (s.axis === 'x') fan.rotation.y = Math.PI / 2;
    else fan.rotation.x = Math.PI / 2;
    g.add(fan);
    const key = s === rearFan ? 'r' : fronts.includes(s) ? 'f' : tops.includes(s) ? 't' : 'b';
    fanGroups[key].push(fan);
  }
  if (!fanGroups.r.length) {
    const rg = plane(rearFanSize - 4, rearFanSize - 4, rearGrill, rearX - 0.2, rearFan.pos[1], mainZ);
    rg.rotation.y = -Math.PI / 2;
    g.add(rg);
  }

  // ---- yerleşim bilgisi ----
  const psuLayout = topPsu
    ? { pos: new THREE.Vector3(xR + 1, yT - 88, -20), rot: new THREE.Euler(0, 0, 0) }
    : dual
      ? { pos: new THREE.Vector3(xF - 35 - 165, yB + t + 76, trayZ - 4), rot: new THREE.Euler(-Math.PI / 2, 0, 0) }
      : { pos: new THREE.Vector3(xR + 1, yB + t + 0.5, 0), rot: new THREE.Euler(0, 0, 0) };

  const radLayout = (pos, radL, radT) => {
    const fanT = 25;
    switch (pos) {
      case 't': return { pos: new THREE.Vector3(clamp(xF - frontGap - radL / 2 + 10, xR + radL / 2 + 4, xF - radL / 2 - 4), yT - 4 - radT / 2, mainZ + 6), rot: new THREE.Euler(0, 0, 0) };
      case 'b': return { pos: new THREE.Vector3(clamp(xF - 20 - radL / 2, xR + radL / 2 + 4, xF - radL / 2 - 4), yB + t + 4 + radT / 2, mainZ), rot: new THREE.Euler(Math.PI, 0, 0) };
      case 'r': return { pos: new THREE.Vector3(xR + fanT + 2 + radT / 2, rearFan.pos[1], mainZ), rot: new THREE.Euler(0, 0, -Math.PI / 2) };
      case 's':
      case 'f':
      default: {
        const yy = clamp(yT - 24 - radL / 2, yB + radL / 2 + 6, yT - radL / 2 - 4);
        const zz = dual ? mainZ + 10 : 0;
        return { pos: new THREE.Vector3(xF - (dual ? 8 : fanT + 6) - radT / 2, yy, zz), rot: new THREE.Euler(0, 0, Math.PI / 2) };
      }
    }
  };
  // fan alanı radyatörle çakışmasın diye radyatör takılınca o konumdaki kasa fanları gizlenebilir
  const drive35 = [], drive25 = [];
  for (let i = 0; i < 4; i++) {
    if (hasShroud) drive35.push({ pos: new THREE.Vector3(xF - 38 - 74, yB + t + 16 + i * 30, clamp(W / 2 - t - 62, -W / 2, W / 2)), rot: new THREE.Euler(0, 0, 0) });
    else drive35.push({ pos: new THREE.Vector3(xF - 80, yT - 120 - i * 112, (trayZ - W / 2 + t) / 2), rot: new THREE.Euler(Math.PI / 2, 0, 0) });
  }
  for (let i = 0; i < 6; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    if (hasShroud) drive25.push({ pos: new THREE.Vector3(xF - 36 - 54, shroudTop + 4 + row * 9, mainZ + (col ? 38 : -38)), rot: new THREE.Euler(0, 0, 0) });
    else drive25.push({ pos: new THREE.Vector3(xF - 70 - col * 110, yT - 90 - row * 80, trayZ - 6), rot: new THREE.Euler(Math.PI / 2, 0, 0) });
  }

  shadowize(g);
  g.traverse((o) => { if (o.isMesh && o.material && o.material.transparent && !o.material.alphaTest) o.castShadow = false; });
  // üst ve ön panel iç kısmı karartmasın (zemin gölgesini alt/arka paneller verir)
  for (const m of topParts) m.castShadow = false;
  front.traverse((o) => { o.castShadow = false; });

  g.userData.layout = {
    W, H, D, t, yB, yT, xR, xF, trayZ, mainZ, dual, hasShroud, shroudTop, frontGap, grommets, light,
    boardTopY, boardRearX, boardZ: trayZ + 8,
    psu: psuLayout, radLayout, drive35, drive25,
    center: new THREE.Vector3(0, H / 2, 0),
  };
  g.userData.side = side;
  g.userData.front = front;
  g.userData.fanGroups = fanGroups;
  return g;
}

// =====================================================================
// ANAKART
// =====================================================================
const FF_DIMS = { 'Mini ITX': [170, 170], 'Mini DTX': [170, 203], 'Micro ATX': [244, 244], 'ATX': [244, 305], 'E-ATX': [277, 305], 'SSI-EEB': [330, 305], 'SSI-CEB': [305, 267], 'XL-ATX': [345, 262] };

export function boardLayout(x) {
  const ff = x ? x.ff : 'ATX';
  const def = FF_DIMS[ff] || FF_DIMS.ATX;
  let w = (x && x.w) || def[0], h = (x && x.h) || def[1];
  w = clamp(w, 150, 360); h = clamp(h, 150, 340);
  const itx = w < 200 && h < 215;
  const sock = (x && x.sock) || 'AM5';
  const big = /TR|WRX|LGA4677|LGA3647|LGA4189|LGA2066|LGA2011/.test(sock);
  const s = itx ? { u: w * 0.5 - 6, v: 70 } : { u: Math.min(116, w * 0.46), v: big ? 105 : 80 };
  const nSlots = clamp((x && x.slots) || (itx ? 2 : 4), 1, 8);
  const dimm = [];
  const pitch = 9.6;
  if (nSlots === 8) {
    for (let i = 0; i < 4; i++) dimm.push({ u: s.u - 58 - (3 - i) * pitch, v: s.v + 4 });
    for (let i = 0; i < 4; i++) dimm.push({ u: s.u + 58 + i * pitch, v: s.v + 4 });
  } else {
    const startU = itx ? w - 22 - (nSlots - 1) * pitch : s.u + 48;
    for (let i = 0; i < nSlots; i++) dimm.push({ u: Math.min(startU + i * pitch, w - 18 - (nSlots - 1 - i) * pitch), v: s.v + 4 });
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
  return { w, h, itx, sock, socket: s, dimm, pcie, m2, chip, atx24: { u: w - 6, v: s.v + 36 } };
}

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

  // VRM soğutucuları + I/O örtüsü
  const vrmTop = rbox(Math.min(w * 0.55, s.u + 40) - 28, 24, 30, 3, hsMat, (28 + Math.min(w * 0.55, s.u + 40)) / 2, -20, 15);
  g.add(vrmTop);
  g.add(rbox(22, s.v + 40 - 12, 34, 3, hsMat, 40, -(12 + s.v + 40) / 2, 17));
  // kanatçık çizgileri
  const finMat = M.painted(white ? 0xbfc4cb : 0x101216, 0.6);
  for (let i = 0; i < 6; i++) g.add(box(Math.min(w * 0.55, s.u + 40) - 34, 1, 1, finMat, (28 + Math.min(w * 0.55, s.u + 40)) / 2, -12 - i * 3, 30.4));
  const ioH = Math.min(s.v + 75, h * 0.55);
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
  return g;
}

// yer tutucu anakart (anakart seçilmeden önce takılan parçalar için)
export function makeGhostBoard() {
  const L = boardLayout(null);
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
function towerType(x) {
  const t = (x.tower || '').toLowerCase();
  if (/çift|dual/.test(t)) return 'dual';
  if (/alçak|low|top|yatay|üstten/.test(t)) return 'low';
  return 'single';
}

export function makeAirCooler(x) {
  const g = new THREE.Group();
  g.name = 'cooler';
  const type = towerType(x);
  const Hc = clamp(x.ht || (type === 'low' ? 58 : 155), 30, 190);
  const fsz = clamp(x.fsz || 120, 80, 140);
  const width = clamp(x.wid || fsz + 5, 90, 160);
  const white = x.col === 'Beyaz' || /white|beyaz/i.test(x.n || '');
  const finCol = white ? 0xe2e5e9 : x.col === 'Siyah' ? 0x1b1d22 : 0xc4c8ce;
  const finMat = new THREE.MeshStandardMaterial({ color: finCol, metalness: x.col === 'Siyah' || white ? 0.3 : 0.9, roughness: 0.38 });
  const pipeMat = x.col === 'Siyah' ? M.painted(0x15171b, 0.4) : white ? M.painted(0xe6e8ec, 0.4) : M.nickel();
  const fanOpts = { frame: white ? 0xdfe2e6 : 0x15171b, blade: white ? 0xe4e7eb : 0x23262c, rgb: !!x.rgb, thickness: 25 };

  // taban
  g.add(rbox(42, 42, 7, 1.5, M.copper(), 0, 0, 3.5));
  g.add(box(70, 18, 4, M.metal(0x34383f, 0.4), 0, 0, 8));

  if (type === 'low') {
    const finH = Hc - 25 - 8;
    const nFin = Math.max(6, Math.floor(finH / 2.4));
    const inst = new THREE.InstancedMesh(cachedGeo(`lowfin${width}`, () => new THREE.BoxGeometry(width, width, 0.5)), finMat, nFin);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < nFin; i++) { mtx.makeTranslation(0, 0, 10 + i * 2.4); inst.setMatrixAt(i, mtx); }
    g.add(inst);
    for (let k = 0; k < 4; k++) {
      const p = cyl(3, finH + 4, pipeMat, 12, -18 + k * 12, 0, 10 + finH / 2);
      p.rotation.x = Math.PI / 2;
      g.add(p);
    }
    const fan = makeFan(Math.min(fsz, width - 4), fanOpts);
    fan.position.set(0, 0, Hc - 12.5);
    g.add(fan);
    g.userData.fans = [fan];
    return shadowize(g);
  }

  const towers = type === 'dual' ? 2 : 1;
  const depthTotal = clamp(x.len || (towers === 2 ? 125 : 78), 50, 175);
  const fanCount = clamp(x.fans || (towers === 2 ? 2 : 1), 1, 3);
  const stackDepth = towers === 2 ? (depthTotal - 25 * Math.max(1, fanCount - 1)) / 2 : depthTotal - 25 * fanCount;
  const sd = clamp(stackDepth, 22, 70);
  const zStart = 38, zEnd = Hc - 3;
  const nFin = Math.max(10, Math.floor((zEnd - zStart) / 2.3));
  const finGeo = cachedGeo(`fin${r1(sd)}|${width}`, () => new THREE.BoxGeometry(sd, width, 0.45));
  const stackCenters = towers === 2 ? [-(sd / 2 + 12.5), sd / 2 + 12.5] : [-(fanCount > 1 ? 0 : 12.5)];
  const mtx = new THREE.Matrix4();
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
      const p = cyl(3, zEnd - 12, pipeMat, 12, cx + (k % 2 ? 4 : -4) * (towers === 1 ? 1 : 0.5), yy, 12 + (zEnd - 12) / 2);
      p.rotation.x = Math.PI / 2;
      g.add(p);
    }
    if (towers === 2) {
      const bridge = cyl(3, stackCenters[1] - stackCenters[0], pipeMat, 12, 0, yy, 12);
      bridge.rotation.z = Math.PI / 2;
      g.add(bridge);
    }
  }
  // fanlar (hava akışı: önden arkaya)
  const fans = [];
  const fanZ = clamp(zStart + (zEnd - zStart) / 2, fsz / 2 + 4, Hc - fsz / 2);
  const fanXs = towers === 2
    ? (fanCount >= 2 ? [stackCenters[1] + sd / 2 + 12.5, 0] : [0])
    : [stackCenters[0] + sd / 2 + 12.5, ...(fanCount > 1 ? [stackCenters[0] - sd / 2 - 12.5] : [])];
  for (const fx of fanXs.slice(0, fanCount)) {
    const fan = makeFan(fsz, fanOpts);
    fan.rotation.y = Math.PI / 2;
    fan.position.set(fx, 0, fanZ);
    g.add(fan);
    fans.push(fan);
  }
  g.userData.fans = fans;
  return shadowize(g);
}

// =====================================================================
// SIVI SOĞUTMA (AIO) — pompa + radyatör (+ hortumları sahne çizer)
// =====================================================================
export function makeAIOPump(x) {
  const g = new THREE.Group();
  g.name = 'pump';
  const white = x.col === 'Beyaz' || /white|beyaz/i.test(x.n || '');
  g.add(rbox(44, 44, 6, 1.5, M.copper(), 0, 0, 3));
  const body = cyl(33, 34, M.plastic(white ? 0xeceef1 : 0x14161a, 0.45), 48, 0, 0, 23);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const capMat = x.lcd
    ? new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x1f6feb, emissiveIntensity: 0.9, roughness: 0.2, emissiveMap: labelTexture([{ text: (x.br || 'AIO').toUpperCase(), size: 0.5 }, { text: '42°C', size: 0.7 }], { w: 256, h: 256, bg: '#0a1a33', fg: '#cfe3ff', align: 'center' }) })
    : M.plastic(white ? 0xf6f7f9 : 0x0c0d10, 0.25);
  const cap = cyl(30, 2, capMat, 48, 0, 0, 41);
  cap.rotation.x = Math.PI / 2;
  g.add(cap);
  if (x.rgb) {
    const ring = new THREE.Mesh(cachedGeo('pumpring', () => new THREE.TorusGeometry(31.5, 1.6, 8, 64)), rgbMaterial(1, 2.6));
    ring.position.z = 40.5;
    g.add(ring);
  }
  if (!x.lcd) {
    const lbl = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.75, spacing: 3 }], { w: 256, h: 64, bg: null, fg: white ? '#41464f' : '#d7dbe2', align: 'center' });
    g.add(plane(40, 10, new THREE.MeshStandardMaterial({ map: lbl, transparent: true }), 0, 0, 42.1));
  }
  // hortum bağlantıları (pompanın üst tarafından çıkar)
  const fitMat = M.metal(0x2a2d33, 0.4);
  const ports = [];
  for (const dx of [-11, 11]) {
    const fit = cyl(5.5, 14, fitMat, 16, dx, 33, 28);
    g.add(fit);
    ports.push(new THREE.Vector3(dx, 40, 28));
  }
  g.userData.ports = ports;
  return shadowize(g);
}

export function makeRadiator(x) {
  const g = new THREE.Group();
  g.name = 'radiator';
  const size = x.rad || 240;
  const fam140 = size % 140 === 0 && size !== 0 && size % 120 !== 0;
  const fsz = fam140 ? 140 : 120;
  const n = Math.max(1, Math.round(size / fsz));
  const L = clamp(x.radl || size + 35, 130, 520);
  const Wd = fsz + 2;
  const T = clamp(x.radt || 27, 20, 60);
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
  const Ht = clamp(x.ht || (x.rgb ? 44 : 34), 30, 60);
  const col = colorOf(x.col, 0x1d1f24);
  const light = isLight(col);
  const pcb = box(1.3, 133, 31, M.plastic(0x1f4f2f, 0.5), 0, 0, 15.5);
  g.add(pcb);
  g.add(box(1.4, 128, 4, M.gold(), 0, 0, 2));
  const spread = M.painted(col, light ? 0.35 : 0.42);
  const hsH = x.hs || x.rgb ? Ht - (x.rgb ? 7 : 0) : 30;
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
    const p = plane(70, 17, lm, sx * 3.3, 10, hsH * 0.55);
    p.rotation.y = sx * Math.PI / 2;
    p.rotation.z = Math.PI / 2 * sx;
    g.add(p);
  }
  g.userData.height = hsH + (x.rgb ? 7 : 2);
  return shadowize(g);
}

// =====================================================================
// EKRAN KARTI — yerel x uzunluk (0 = arka braket), z karttan dışarı, -y fan tarafı
// =====================================================================
export function makeGPU(x) {
  const g = new THREE.Group();
  g.name = 'gpu';
  const L = clamp(x.len || 280, 150, 380);
  const Hc = clamp(x.ht || 125, 100, 175);
  const T = clamp(x.th || 50, 20, 90);
  const col = colorOf(x.col, 0x1c1f24);
  const light = isLight(col);
  const shroud = M.painted(col, light ? 0.4 : 0.46);
  const shroud2 = M.painted(new THREE.Color(col).multiplyScalar(light ? 0.86 : 1.6), 0.5);
  const accent = x.mk === 'NVIDIA' ? 0x76b900 : x.mk === 'AMD' ? 0xed1c24 : x.mk === 'Intel' ? 0x0071c5 : 0x7c6cff;
  const plateT = 8; // fan tarafındaki kapak kalınlığı

  // PCB + altın uçlar
  g.add(box(L - 10, 1.6, Hc - 8, M.plastic(0x101a14, 0.6), 4 + (L - 10) / 2, 0, (Hc - 8) / 2));
  g.add(box(80, 1.7, 6, M.gold(), 48 + 40, 0, -3));
  // arka plaka (+y)
  g.add(rbox(L - 6, 2.4, Hc - 6, 1, M.metal(light ? 0xe2e4e8 : 0x22252b, 0.45), 3 + (L - 6) / 2, 2.1, (Hc - 6) / 2 + 2));
  const bpLbl = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.7, spacing: 6 }], { w: 512, h: 96, bg: null, fg: light ? '#61666f' : '#b8bdc6', align: 'center' });
  const bpText = plane(Math.min(120, L * 0.45), 22, new THREE.MeshStandardMaterial({ map: bpLbl, transparent: true }), L * 0.55, 3.4, Hc * 0.5);
  bpText.rotation.x = -Math.PI / 2;
  g.add(bpText);

  // soğutucu kanatçık bloğu (yan yüzlerde dikey kanatçık görünümü)
  const finT = Math.max(6, T - plateT - 3);
  const finSide = new THREE.MeshStandardMaterial({ color: 0xffffff, map: cloneTex(finVTexture, (L - 12) / 18, 1), metalness: 0.6, roughness: 0.45 });
  const finEnd = M.metal(0x2c3036, 0.5);
  const fins = new THREE.Mesh(cachedGeo(`gpufin${r1(L)}|${r1(finT)}|${r1(Hc)}`, () => new THREE.BoxGeometry(L - 12, finT, Hc - 6)), [finEnd, finEnd, finEnd, finEnd, finSide, finSide]);
  fins.position.set(L / 2, -1.5 - finT / 2, (Hc - 6) / 2 + 2);
  g.add(fins);

  // fan tarafı kapak: fan delikli tek parça
  const nf = clamp(x.fans || (L > 280 ? 3 : 2), 1, 3);
  const fsz = Math.min(Hc - 18, (L - 24) / nf - 6, 102);
  const centers = Array.from({ length: nf }, (_, i) => 12 + (L - 24) * ((i + 0.5) / nf));
  const plateGeo = cachedGeo(`gpuplate${r1(L)}|${r1(Hc)}|${nf}|${r1(fsz)}`, () => {
    const r = 6, z0 = 0, z1 = Hc + 3;
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
  plate.position.set(0, -T + plateT + 1, -0.5);
  g.add(plate);
  const fans = [];
  for (const cx of centers) {
    const fan = makeFan(fsz, { blade: light ? 0xe9ebee : 0x1d2025, thickness: 11, speed: 0.8, frameless: true });
    fan.rotation.x = Math.PI / 2;
    fan.position.set(cx, -T + plateT / 2 + 1, Hc / 2 + 1);
    g.add(fan);
    fans.push(fan);
    const ring = new THREE.Mesh(cachedGeo(`gpuring${r1(fsz)}`, () => new THREE.TorusGeometry(fsz / 2 + 1.5, 1.1, 6, 48)), x.rgb ? rgbMaterial(1, 2.4) : shroud2);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, -T + 1, Hc / 2 + 1);
    g.add(ring);
  }
  // uç kapağı
  g.add(rbox(10, T - 1, Hc + 3, 3, shroud, L - 5, -T / 2 + 0.5, (Hc + 3) / 2 - 0.5));

  // cam tarafı (+z) yan kapak: logo, vurgu çizgisi, RGB
  const coverH = Math.max(12, Math.min(T * 0.42, 26));
  const coverY = -T + plateT + 1 + coverH / 2 - 2;
  const coverL = L * 0.74;
  g.add(rbox(coverL, coverH, 3.2, 1.2, shroud, L * 0.52, coverY, Hc + 2.6));
  const chipTxt = (x.chip || x.n || '').replace(/^GeForce\s*/i, 'GEFORCE ').toUpperCase();
  const sideTex = labelTexture([{ text: chipTxt, size: 0.62, spacing: 3 }], { w: 1024, h: 96, bg: null, fg: light ? '#3d424b' : '#e2e6ec' });
  g.add(plane(Math.min(coverL * 0.55, 180), Math.min(coverH * 0.55, 12), new THREE.MeshStandardMaterial({ map: sideTex, transparent: true }), L * 0.42, coverY + 1, Hc + 4.25));
  g.add(box(coverL * 0.92, 1.3, 0.6, M.painted(accent, 0.4), L * 0.52, coverY - coverH / 2 + 2.2, Hc + 4.3));
  if (x.rgb) g.add(rbox(coverL * 0.86, 2.2, 1.2, 0.5, rgbMaterial(1.4, 2.8), L * 0.52, coverY + coverH / 2 - 1.6, Hc + 4.3));

  // braket
  const br = M.metal(0x9ea3ab, 0.35);
  g.add(box(1.2, Math.max(T + 6, 22), 121, br, -1, -T / 2 + 6, 121 / 2 - 8));
  g.add(box(14, Math.max(T + 6, 22), 1.2, br, 6, -T / 2 + 6, 114));
  // güç soketi (üst kenar)
  const is16 = /16|12V/i.test(x.conn || '');
  const pcount = is16 ? 1 : Math.min(3, Number(((x.conn || '').match(/(\d)\s*[xX×]/) || [0, 1])[1]) || 1);
  for (let i = 0; i < pcount; i++) g.add(box(is16 ? 18 : 20, 8, 7, M.plastic(0x0d0e10), L * 0.62 + i * 22, -4, Hc + 1.5));
  g.userData.fans = fans;
  g.userData.dims = { L, H: Hc, T };
  return shadowize(g);
}

// =====================================================================
// GÜÇ KAYNAĞI — yerel x derinlik (0..dd), y yükseklik (0..dh), z genişlik (ortalı)
// =====================================================================
export function makePSU(x, { generic = false } = {}) {
  const g = new THREE.Group();
  g.name = 'psu';
  const sfx = x && /SFX/.test(x.ff || '');
  let dw = (x && x.dw) || (sfx ? 125 : 150), dh = (x && x.dh) || (sfx ? 63.5 : 86), dd = (x && x.dd) || (sfx ? 100 : 160);
  dw = clamp(dw, 100, 160); dh = clamp(dh, 50, 100); dd = clamp(dd, 95, 230);
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
  const modular = x && x.mod && !/değil|olmayan/i.test(x.mod);
  if (modular) {
    const sock = M.plastic(0x060607, 0.7);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) g.add(box(1, 9, 16, sock, dd + 0.2, 18 + r * 22, -dw / 2 + 22 + c * ((dw - 44) / 3)));
  } else {
    const bundle = cyl(9, 30, M.plastic(0x08090a, 0.6), 16, dd + 12, dh / 2, 0);
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
  if (x.hs) {
    g.add(rbox(L - 4, 23, 7, 1.5, M.metal(0x2a2e35, 0.4), L / 2, 0, 4.5));
    for (let i = 0; i < 5; i++) g.add(box(L - 10, 1.2, 1.5, M.metal(0x41464f, 0.4), L / 2, -8 + i * 4, 8.5));
  } else {
    const lbl = labelTexture([{ text: (x.br || '').toUpperCase(), size: 0.55, weight: 800 }, { text: capText(x.cap) + (x.bus ? ' · ' + x.bus : ''), size: 0.38 }], { w: 512, h: 160, bg: '#c9cdd3', fg: '#15171b', accent: '#' + accentOf(x.br, 0x2563eb).toString(16).padStart(6, '0') });
    g.add(plane(L - 12, 19, new THREE.MeshStandardMaterial({ map: lbl, roughness: 0.6 }), L / 2 + 2, 0, 2.45));
  }
  return shadowize(g);
}

const capText = (gb) => (!gb ? '' : gb >= 1000 ? `${+(gb / 1000).toFixed(1)} TB` : `${gb} GB`);

// 2.5" SSD ve 3.5" HDD — yerel x uzunluk, z genişlik, y kalınlık (ortalı)
export function makeDrive(x) {
  const g = new THREE.Group();
  const hdd = x.kind === 'hdd';
  const big = hdd && x.ff !== '2.5';
  g.name = hdd ? 'hdd' : 'ssd';
  const L = big ? 147 : 100, Wd = big ? 101.6 : 69.9, T = big ? 26.1 : hdd ? 9.5 : 7;
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
