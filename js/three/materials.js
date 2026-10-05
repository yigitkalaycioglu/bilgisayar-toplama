// Malzemeler ve canvas ile üretilen dokular. Tüm ölçüler milimetre.
import * as THREE from '../../vendor/three.bundle.js';

const texCache = new Map();

function canvasTex(key, w, h, draw, { repeat = false, srgb = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  texCache.set(key, t);
  return t;
}

// ---- renkler ----
export const COLOR_HEX = {
  Siyah: 0x1b1d22, Beyaz: 0xe9ebef, Gri: 0x70757e, 'Gümüş': 0xb8bcc3, Pembe: 0xf1a9c9, Mavi: 0x3a6fd6,
  'Kırmızı': 0xc23a33, 'Yeşil': 0x3f9b5d, Mor: 0x7a4fd0, Turuncu: 0xe57a2e, 'Sarı': 0xe8c13a,
  Kahverengi: 0x6d4a33, Lacivert: 0x22315c, 'Altın': 0xc9a24a, Bej: 0xd9cdb5, 'Ahşap': 0x8a5a36,
};
export const colorOf = (name, fallback = 0x1b1d22) => (name && COLOR_HEX[name] != null ? COLOR_HEX[name] : fallback);
export const isLight = (hex) => {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.55;
};

// ---- temel malzemeler (her çağrıda yeni örnek: parça bazlı vurgulama için) ----
export const M = {
  painted: (color, rough = 0.55) => new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: rough }),
  metal: (color = 0xb9bec7, rough = 0.32) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough }),
  plastic: (color = 0x15171b, rough = 0.62) => new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: rough }),
  rubber: (color = 0x0c0d10) => new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.9 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.28 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xc27a4a, metalness: 1, roughness: 0.3 }),
  nickel: () => new THREE.MeshStandardMaterial({ color: 0xd2d5da, metalness: 1, roughness: 0.18 }),
  glass: (tint = 0x1a2633) => new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.1,
    envMapIntensity: 0.35, specularIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false,
  }),
  emissive: (color, intensity = 2) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
    m.userData.glow = true;
    return m;
  },
};

// ---- RGB: kayan gökkuşağı dokusu (tüm RGB malzemeler aynı dokuyu paylaşır) ----
export const rgbTexture = canvasTex('rgb', 512, 4, (g, w, h) => {
  for (let x = 0; x < w; x++) {
    g.fillStyle = `hsl(${(x / w) * 360}, 100%, 55%)`;
    g.fillRect(x, 0, 1, h);
  }
}, { repeat: true });

const rgbMats = new Set();
let rgbOn = true;
export function rgbMaterial(repeat = 1, intensity = 3.6) {
  const tex = rgbTexture.clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, 1);
  const m = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: rgbOn ? intensity : 0, roughness: 0.35 });
  m.userData.rgb = true;
  m.userData.baseIntensity = intensity;
  rgbMats.add(m);
  return m;
}
export function releaseRgb(material) { rgbMats.delete(material); }
export function setRgbEnabled(on) {
  rgbOn = on;
  for (const m of rgbMats) m.emissiveIntensity = on ? m.userData.baseIntensity : 0.0;
}
export function tickRgb(t) {
  if (!rgbOn) return;
  for (const m of rgbMats) m.emissiveMap.offset.x = (t * 0.12) % 1;
}

// ---- PCB dokusu ----
export function pcbTexture(base = '#15181d', trace = '#20262e', key = 'pcb') {
  return canvasTex(key + base, 1024, 1024, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = trace; g.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      let x = rnd() * w, y = rnd() * h;
      g.lineWidth = rnd() < 0.8 ? 1.2 : 2.6;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        const len = 20 + rnd() * 120;
        const dir = Math.floor(rnd() * 8) * (Math.PI / 4);
        x += Math.cos(dir) * len; y += Math.sin(dir) * len;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = trace;
    for (let i = 0; i < 500; i++) g.fillRect(rnd() * w, rnd() * h, 3, 3);
  });
}

// ---- delikli (mesh) panel alfa dokusu ----
export const meshAlpha = canvasTex('mesh', 128, 128, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#000';
  const r = 9.5, dx = 32, dy = 27.7;
  for (let row = -1; row < 6; row++) {
    for (let col = -1; col < 6; col++) {
      const x = col * dx + (row % 2 ? dx / 2 : 0), y = row * dy;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.fill();
    }
  }
}, { repeat: true, srgb: false });

// ---- radyatör / soğutucu kanatçık çizgileri ----
export const finTexture = canvasTex('fins', 8, 256, (g, w, h) => {
  for (let y = 0; y < h; y += 4) {
    g.fillStyle = '#2a2e35'; g.fillRect(0, y, w, 2);
    g.fillStyle = '#0d0f12'; g.fillRect(0, y + 2, w, 2);
  }
}, { repeat: true });

// ---- dikey kanatçık çizgileri (ekran kartı soğutucusunun yandan görünüşü) ----
export const finVTexture = canvasTex('finsV', 64, 4, (g, w, h) => {
  for (let x = 0; x < w; x += 8) {
    g.fillStyle = '#3a3f47'; g.fillRect(x, 0, 3, h);
    g.fillStyle = '#0b0c0f'; g.fillRect(x + 3, 0, 5, h);
  }
}, { repeat: true });

// ---- PSU fan ızgarası ----
export const grillTexture = canvasTex('grill', 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#000'; g.lineWidth = 6;
  for (let r = 22; r < 124; r += 17) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.stroke(); }
  for (let k = 0; k < 4; k++) { g.save(); g.translate(w / 2, h / 2); g.rotate((k * Math.PI) / 4); g.fillStyle = '#000'; g.fillRect(-124, -3, 248, 6); g.restore(); }
}, { srgb: false });

// ---- yazılı etiket dokusu ----
export function labelTexture(lines, { w = 512, h = 128, bg = '#111', fg = '#e8e8e8', accent = null, align = 'left', font = 'Inter, Arial, sans-serif', border = null } = {}) {
  const key = 'lbl:' + JSON.stringify([lines, w, h, bg, fg, accent, align, border]);
  return canvasTex(key, w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = Math.max(2, h * 0.04); g.strokeRect(g.lineWidth, g.lineWidth, w - 2 * g.lineWidth, h - 2 * g.lineWidth); }
    if (accent) { g.fillStyle = accent; g.fillRect(0, h - h * 0.08, w, h * 0.08); }
    const arr = Array.isArray(lines) ? lines : [lines];
    const lh = h / (arr.length + 0.6);
    arr.forEach((ln, i) => {
      const t = typeof ln === 'string' ? { text: ln } : ln;
      const size = (t.size || 0.62) * lh;
      g.font = `${t.weight || 700} ${size}px ${font}`;
      g.fillStyle = t.color || fg;
      g.textBaseline = 'middle';
      g.textAlign = align;
      const x = align === 'center' ? w / 2 : align === 'right' ? w - h * 0.15 : h * 0.15;
      let txt = t.text || '';
      while (g.measureText(txt).width > w * 0.92 && txt.length > 3) txt = txt.slice(0, -2);
      if (t.spacing) g.letterSpacing = t.spacing + 'px';
      g.fillText(txt, x, lh * (i + 0.8));
      g.letterSpacing = '0px';
    });
  });
}

// ---- zemin dokusu: ızgara + radyal solma ----
export const floorTexture = canvasTex('floor', 1024, 1024, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(36,42,56,1)');
  grd.addColorStop(0.55, 'rgba(20,24,32,0.85)');
  grd.addColorStop(1, 'rgba(10,12,16,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.save();
  g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); g.clip();
  const step = w / 32;
  for (let i = 0; i <= 32; i++) {
    const d = Math.abs(i - 16) / 16;
    g.strokeStyle = `rgba(120,140,190,${0.16 * (1 - d * d)})`;
    g.lineWidth = i % 4 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, h); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(w, i * step); g.stroke();
  }
  g.restore();
  const fade = g.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w / 2);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fade; g.fillRect(0, 0, w, h);
});

// ---- geometri önbelleği ----
const geoCache = new Map();
export function cachedGeo(key, make) {
  if (!geoCache.has(key)) {
    const g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}

// paylaşılan dokunun ayrı tekrar ayarlı kopyası (parça silinince serbest bırakılır)
export function cloneTex(t, rx = 1, ry = 1) {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  c.userData.clone = true;
  c.needsUpdate = true;
  return c;
}

export const rgbActive = () => rgbMats.size > 0;

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh || o.isLineSegments) {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.userData.rgb) releaseRgb(m);
        for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k] && (m[k].userData.clone || m.userData.rgb)) m[k].dispose();
        m.dispose();
      }
    }
  });
}
