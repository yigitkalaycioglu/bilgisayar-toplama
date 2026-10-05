// 3D sahne: parçaları seçimlere göre ekler/çıkarır, yerleştirir ve canlandırır.
import * as THREE from '../../vendor/three.bundle.js';
import { OrbitControls, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } from '../../vendor/three.bundle.js';
import { floorTexture, tickRgb, setRgbEnabled, disposeObject, rgbActive, M } from './materials.js';
import {
  makeCase, makeMotherboard, makeGhostBoard, makeBenchStand, boardLayout, makeCPU, makeAirCooler,
  makeAIOPump, makeRadiator, makeRamStick, makeGPU, makePSU, makeM2, makeDrive,
} from './models.js';
import { radiatorMount } from '../compat.js';

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

const CAT_LABEL = {
  case: 'Kasa', mobo: 'Anakart', cpu: 'İşlemci', cooler: 'Soğutucu', ram: 'Bellek', gpu: 'Ekran kartı',
  storage: 'Depolama', psu: 'Güç kaynağı', ghost: 'Yer tutucu',
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const DEFAULT_DIR = V(0.55, 0.36, 1).normalize();

// RAM modüllerinin dolduracağı yuvalar (işlemciye yakın taraftan A1, A2, B1, B2…)
function ramSlotOrder(nSlots, n) {
  if (n >= nSlots) return [...Array(nSlots).keys()];
  if (nSlots === 4) return n === 1 ? [1] : n === 2 ? [1, 3] : [0, 1, 3].slice(0, n);
  if (nSlots === 8) return [1, 3, 5, 7, 0, 2, 4, 6].slice(0, n).sort((a, b) => a - b);
  return [...Array(n).keys()];
}

export class PCScene {
  constructor(canvas, host, { onHover, onPick, onReady } = {}) {
    this.canvas = canvas;
    this.host = host;
    this.onHover = onHover || (() => {});
    this.onPick = onPick || (() => {});
    this.entries = new Map();
    this.exploded = false;
    this.panelOn = true;
    this.rgbOn = true;
    this.userMovedCamera = false;
    this.lastCaseKey = null;
    this.hadParts = false;
    this.running = true;
    this.coarse = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, this.coarse ? 1.5 : 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d12);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.85;
    pmrem.dispose();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(34, 1, 10, 20000);
    camera.position.copy(DEFAULT_DIR.clone().multiplyScalar(1500).add(V(0, 260, 0)));
    this.camera = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 180;
    controls.maxDistance = 4200;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 260, 0);
    controls.autoRotateSpeed = 0.9;
    controls.addEventListener('start', () => { this.userMovedCamera = true; this.camTween = null; });
    this.controls = controls;

    // ışıklar
    scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x1a1d24, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(650, 1150, 950);
    key.castShadow = true;
    key.shadow.mapSize.set(this.coarse ? 1024 : 2048, this.coarse ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700, near: 200, far: 3500 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.8;
    key.shadow.radius = 4;
    scene.add(key);
    this.keyLight = key;
    const rim = new THREE.DirectionalLight(0x8fb0ff, 0.9);
    rim.position.set(-900, 600, -800);
    scene.add(rim);
    // kasanın içini cam taraftan aydınlatan gölgesiz dolgu ışıkları
    const side = new THREE.DirectionalLight(0xe8eeff, 0.9);
    side.position.set(250, 420, 1300);
    scene.add(side);
    this.fill = new THREE.PointLight(0xffffff, 1.4, 700, 0);
    this.fill.position.set(0, 260, 40);
    scene.add(this.fill);
    this.rgbLights = [new THREE.PointLight(0xff00ff, 0, 520, 0), new THREE.PointLight(0x00ffff, 0, 520, 0)];
    this.rgbLights.forEach((l) => scene.add(l));

    // zemin
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1900, 72), new THREE.MeshBasicMaterial({ map: floorTexture, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.6;
    floor.renderOrder = -1;
    scene.add(floor);
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.ShadowMaterial({ opacity: 0.42 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    this.root = new THREE.Group();
    scene.add(this.root);
    this.anchor = new THREE.Group();
    this.anchorTarget = V();
    this.root.add(this.anchor);
    this.tubes = [];

    // son işlem: bloom (dokunmatik/zayıf cihazlarda kapalı)
    this.bloom = !this.coarse;
    if (this.bloom) {
      this.composer = new EffectComposer(renderer);
      this.composer.addPass(new RenderPass(scene, camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 2.5);
      // Yalnızca doygun renkli parlak pikseller (RGB aydınlatma) parlasın; ışığın beyaz
      // yansımaları (cam, metal) "güneş" gibi parlamasın
      const hp = this.bloomPass.materialHighPassFilter;
      hp.fragmentShader = hp.fragmentShader.replace(
        'float v = luminance( texel.xyz );',
        'float mx = max( texel.r, max( texel.g, texel.b ) ); float mn = min( texel.r, min( texel.g, texel.b ) );' +
        ' float v = mx * smoothstep( 0.35, 0.7, ( mx - mn ) / max( mx, 1e-4 ) );',
      );
      hp.needsUpdate = true;
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hovered = null;
    this._bindPointer();

    this.clock = new THREE.Timer();
    if (this.clock.connect) this.clock.connect(document);
    this.frameTimes = [];
    this._resize();
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { threshold: 0.01 });
    this.visible = true;
    this.io.observe(host);
    renderer.setAnimationLoop(() => this._frame());
    onReady && requestAnimationFrame(onReady);
  }

  // ------------------------------------------------------------ dışa açık ayarlar
  setExploded(on) { this.exploded = on; }
  setPanel(on) {
    this.panelOn = on;
    for (const e of this.entries.values()) if (e.cat === 'case' && e.obj.userData.side) e.obj.userData.side.visible = on;
  }
  setRgb(on) { this.rgbOn = on; setRgbEnabled(on); }
  setAutoRotate(on) { this.controls.autoRotate = on; }
  resetView() { this.userMovedCamera = false; this._frameAll(true); }

  // ------------------------------------------------------------ seçimler -> sahne
  update(sel) {
    const one = (c) => (sel[c] && sel[c][0] ? sel[c][0] : null);
    const cs = one('case')?.item, mb = one('mobo')?.item, cpu = one('cpu')?.item, cooler = one('cooler')?.item;
    const gpu = one('gpu')?.item, ramE = one('ram'), psu = one('psu')?.item;
    const storage = [];
    const seenN = new Map();
    for (const { item, qty } of sel.storage || []) {
      for (let i = 0; i < (qty || 1); i++) {
        const n = seenN.get(item.id) || 0;
        seenN.set(item.id, n + 1);
        storage.push({ item, n });
      }
    }
    const m2s = storage.filter((s) => s.item.kind === 'nvme' || s.item.kind === 'm2sata');
    const satas = storage.filter((s) => !(s.item.kind === 'nvme' || s.item.kind === 'm2sata'));

    // istenen parçalar
    const want = new Map();
    const add = (key, spec) => want.set(key, spec);
    if (cs) add(`case:${cs.id}`, { cat: 'case', item: cs, parent: 'root', make: () => makeCase(cs) });
    if (mb) add(`mobo:${mb.id}`, { cat: 'mobo', item: mb, parent: 'anchor', make: () => makeMotherboard(mb) });
    const boardKids = cpu || cooler || ramE || gpu || m2s.length;
    if (!mb && boardKids) add('ghost', { cat: 'ghost', parent: 'anchor', make: () => makeGhostBoard() });
    if (cpu) add(`cpu:${cpu.id}`, { cat: 'cpu', item: cpu, parent: 'anchor', make: () => makeCPU(cpu) });
    if (cooler) {
      if (cooler.kind === 'aio') {
        add(`pump:${cooler.id}`, { cat: 'cooler', item: cooler, parent: 'anchor', make: () => makeAIOPump(cooler) });
        add(`rad:${cooler.id}`, { cat: 'cooler', item: cooler, parent: 'root', make: () => makeRadiator(cooler) });
      } else add(`cooler:${cooler.id}`, { cat: 'cooler', item: cooler, parent: 'anchor', make: () => makeAirCooler(cooler) });
    }
    if (ramE) {
      const n = Math.min((ramE.item.mods || 1) * (ramE.qty || 1), 8);
      for (let i = 0; i < n; i++) add(`ram:${ramE.item.id}:${i}`, { cat: 'ram', item: ramE.item, parent: 'anchor', idx: i, make: () => makeRamStick(ramE.item) });
    }
    if (gpu) add(`gpu:${gpu.id}`, { cat: 'gpu', item: gpu, parent: 'anchor', make: () => makeGPU(gpu) });
    m2s.forEach((s, i) => add(`m2:${s.item.id}:${s.n}`, { cat: 'storage', item: s.item, parent: 'anchor', idx: i, make: () => makeM2(s.item) }));
    satas.forEach((s, i) => add(`drv:${s.item.id}:${s.n}`, { cat: 'storage', item: s.item, parent: 'root', idx: i, make: () => makeDrive(s.item) }));
    if (psu) add(`psu:${psu.id}`, { cat: 'psu', item: psu, parent: 'root', make: () => makePSU(psu) });
    else if (cs && cs.psu) add(`psu:case:${cs.id}`, { cat: 'psu', item: { n: `Kasa ile gelen güç kaynağı${cs.psuw ? ' (' + cs.psuw + ' W)' : ''}`, w: cs.psuw, br: cs.br }, parent: 'root', generic: true, make: () => makePSU({ w: cs.psuw, br: cs.br }, { generic: true }) });

    // çıkarılacaklar
    for (const [key, e] of this.entries) if (!want.has(key) && e.state !== 'exit') this._exit(e);
    // eklenecekler
    for (const [key, spec] of want) {
      const e = this.entries.get(key);
      if (e && e.state !== 'exit') { e.idx = spec.idx; continue; }
      if (e) this._remove(e);
      this._enter(key, spec);
    }

    // anakart tezgâh ayağı
    const boardEntry = [...this.entries.values()].find((e) => (e.key.startsWith('mobo:') || e.key === 'ghost') && e.state !== 'exit');
    const L = boardEntry ? boardEntry.obj.userData.layout : boardLayout(null);
    const standKey = !cs && mb ? `stand:${Math.round(L.w)}` : null;
    for (const [key, e] of this.entries) if (key.startsWith('stand:') && key !== standKey && e.state !== 'exit') this._exit(e);
    if (standKey && !this.entries.has(standKey)) this._enter(standKey, { cat: 'stand', item: mb, parent: 'anchor', make: () => makeBenchStand(L.w) });

    this._layout({ cs, mb, L, cooler, ramE });

    // kamera: ilk parça, kasa değişimi veya tezgâh/kasa geçişinde çerçevele
    const caseKey = cs ? cs.id : null;
    const any = want.size > 0;
    if ((any && !this.hadParts) || caseKey !== this.lastCaseKey) this._frameAll(!this.userMovedCamera || caseKey !== this.lastCaseKey);
    this.lastCaseKey = caseKey;
    this.hadParts = any;
  }

  // ------------------------------------------------------------ giriş / çıkış
  _enter(key, spec) {
    const obj = spec.make();
    obj.userData.partKey = key;
    obj.scale.setScalar(0.92);
    const e = {
      key, cat: spec.cat, item: spec.item, generic: spec.generic, idx: spec.idx, obj,
      parent: spec.parent, pos: V(), quat: new THREE.Quaternion(), explode: V(), enter: V(), state: 'live', rotors: [],
    };
    obj.traverse((o) => { if (o.userData.rotor) e.rotors.push(o.userData.rotor); });
    if (spec.cat === 'case') {
      obj.userData.side.visible = this.panelOn;
      obj.userData.side.traverse((o) => { o.userData.noPick = true; });
      obj.userData.front.traverse((o) => { if (o.material && o.material.transparent && !o.material.alphaTest) o.userData.noPick = true; });
    }
    (spec.parent === 'anchor' ? this.anchor : this.root).add(obj);
    this.entries.set(key, e);
    e.fresh = true;
    return e;
  }

  _exit(e) {
    e.state = 'exit';
    if (this.hovered === e) { this.hovered = null; this.onHover(null); }
  }

  _remove(e) {
    e.obj.parent && e.obj.parent.remove(e.obj);
    disposeObject(e.obj);
    this.entries.delete(e.key);
    if (e.cat === 'cooler' && e.key.startsWith('rad:')) this._clearTubes();
  }

  // ------------------------------------------------------------ yerleşim
  _layout({ cs, mb, L, cooler, ramE }) {
    const caseE = [...this.entries.values()].find((e) => e.cat === 'case' && e.state !== 'exit');
    const CL = caseE ? caseE.obj.userData.layout : null;
    this.caseLayout = CL;
    this.boardL = L;

    // anakart çapası
    if (CL) this.anchorTarget.set(CL.boardRearX, CL.boardTopY, CL.boardZ);
    else this.anchorTarget.set(-L.w / 2, L.h + 53, 0);
    if (this.anchor.position.lengthSq() === 0 && !this._anchorPlaced) { this.anchor.position.copy(this.anchorTarget); this._anchorPlaced = true; }

    const s = L.socket;
    const ramSlots = ramE ? ramSlotOrder(L.dimm.length, Math.min((ramE.item.mods || 1) * (ramE.qty || 1), L.dimm.length)) : [];
    const radMount = cooler && cooler.kind === 'aio' && CL ? radiatorMount(cs, cooler.rad || 240) || 't' : null;

    // kasa fanları: radyatörün oturduğu yerdekileri gizle
    if (caseE) {
      const fg = caseE.obj.userData.fanGroups;
      for (const k of Object.keys(fg)) for (const f of fg[k]) f.visible = !(radMount && k === radMount);
    }
    // anakartın M.2 kapakları: dolu yuvada gizle
    const moboE = [...this.entries.values()].find((e) => e.cat === 'mobo' && e.key.startsWith('mobo:') && e.state !== 'exit');
    const m2Count = [...this.entries.values()].filter((e) => e.key.startsWith('m2:') && e.state !== 'exit').length;
    if (moboE) moboE.obj.userData.m2Covers.forEach((c, i) => { if (c) c.visible = i >= m2Count; });

    for (const e of this.entries.values()) {
      if (e.state === 'exit') continue;
      e.quat.identity();
      const k = e.key;
      if (k.startsWith('case:')) { e.pos.set(0, 0, 0); e.enter.set(0, 420, 0); e.explode.set(0, 0, 0); }
      else if (k.startsWith('mobo:') || k === 'ghost') { e.pos.set(0, 0, 0); e.enter.set(0, 0, 320); e.explode.set(0, 0, 0); }
      else if (k.startsWith('stand:')) { e.pos.set(0, -L.h, 0); e.enter.set(0, -60, 0); e.explode.set(0, 0, 0); }
      else if (k.startsWith('cpu:')) { e.pos.set(s.u, -s.v, 3.2); e.enter.set(0, 0, 170); e.explode.set(0, 0, 120); }
      else if (k.startsWith('cooler:') || k.startsWith('pump:')) { e.pos.set(s.u, -s.v, 7.6); e.enter.set(0, 0, 280); e.explode.set(0, 0, 250); }
      else if (k.startsWith('ram:')) {
        const slot = L.dimm[ramSlots[e.idx] ?? e.idx] || L.dimm[L.dimm.length - 1];
        const extra = e.idx >= L.dimm.length ? 60 * (e.idx - L.dimm.length + 1) : 0;
        e.pos.set(slot.u, -slot.v, 2.2 + extra);
        e.enter.set(0, 0, 160); e.explode.set(0, 0, 105);
      } else if (k.startsWith('gpu:')) {
        const p = L.pcie.find((q) => q.x16) || { v: s.v + 82 };
        e.pos.set(-8, -p.v, 9);
        e.enter.set(0, 0, 300); e.explode.set(0, -30, 200);
      } else if (k.startsWith('m2:')) {
        const slot = L.m2[e.idx];
        if (slot && !slot.back) { e.pos.set(slot.u, -slot.v, 2.6); e.explode.set(0, 0, 70); }
        else {
          const j = slot ? 0 : e.idx;
          e.pos.set((slot ? slot.u : 50 + (j % 2) * 95) + 80, -(slot ? slot.v : 120 + Math.floor(j / 2) * 40), -2.6);
          e.quat.setFromEuler(new THREE.Euler(0, Math.PI, 0));
          e.explode.set(0, 0, -70);
        }
        e.enter.set(0, 0, 120);
      } else if (k.startsWith('rad:')) {
        const dims = e.obj.userData.dims;
        if (CL) {
          const T = CL.radLayout(radMount, dims.L, dims.T);
          e.pos.copy(T.pos); e.quat.setFromEuler(T.rot);
          e.explode.copy({ t: V(0, 190, 0), f: V(170, 0, 0), s: V(170, 0, 0), b: V(0, 0, 220), r: V(-170, 0, 0) }[radMount] || V(0, 190, 0));
        } else {
          e.pos.set(L.w / 2 + 70, dims.L / 2 + 12, 30);
          e.quat.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
          e.explode.set(120, 0, 0);
        }
        e.enter.set(0, 260, 0);
      } else if (k.startsWith('psu:')) {
        if (CL) {
          e.pos.copy(CL.psu.pos); e.quat.setFromEuler(CL.psu.rot);
          e.explode.set(0, 0, CL.dual ? -300 : 300);
          e.enter.set(0, 0, CL.dual ? -400 : 420);
        } else {
          e.pos.set(L.w / 2 + 50, 0, 140);
          e.explode.set(80, 0, 120); e.enter.set(0, 0, 400);
        }
      } else if (k.startsWith('drv:')) {
        const big = (it) => it.kind === 'hdd' && it.ff !== '2.5';
        const hdd = big(e.item);
        const satasOfKind = [...this.entries.values()].filter((x) => x.key.startsWith('drv:') && x.state !== 'exit' && big(x.item) === hdd);
        const idx = satasOfKind.indexOf(e);
        if (CL) {
          const slots = hdd ? CL.drive35 : CL.drive25;
          const sl = slots[Math.min(idx, slots.length - 1)];
          e.pos.copy(sl.pos);
          if (idx >= slots.length) e.pos.y += 12 * (idx - slots.length + 1);
          e.quat.setFromEuler(sl.rot);
          e.explode.set(0, 0, CL.hasShroud ? 260 : -260);
        } else {
          e.pos.set(-L.w / 2 - 110, (hdd ? 13.1 : 3.5) + idx * (hdd ? 27 : 8), 60 + (hdd ? 0 : 130));
          e.explode.set(-60, 0, 80);
        }
        e.enter.set(0, 0, 360);
      }
      if (e.fresh) {
        e.obj.position.copy(e.pos).add(e.enter);
        e.obj.quaternion.copy(e.quat);
        e.fresh = false;
      }
    }

    // iç aydınlatma konumları
    if (CL) {
      this.fill.position.set(0, CL.H * 0.55, CL.mainZ + 40);
      this.fill.distance = Math.max(CL.H, CL.D) * 1.4;
      this.fill.intensity = 2.1;
      this.rgbLights[0].position.set(CL.xF - 60, CL.H * 0.62, CL.mainZ);
      this.rgbLights[1].position.set(CL.boardRearX + s.u + 30, CL.boardTopY - s.v, CL.mainZ + 30);
    } else {
      this.fill.position.set(0, L.h * 0.6 + 53, 260);
      this.fill.distance = 700;
      this.fill.intensity = 0;
      this.rgbLights[0].position.set(0, L.h * 0.7 + 53, 120);
      this.rgbLights[1].position.set(L.w * 0.3, L.h * 0.4 + 53, 120);
    }
  }

  // ------------------------------------------------------------ AIO hortumları
  _clearTubes() {
    for (const t of this.tubes) { this.root.remove(t); t.geometry.dispose(); }
    this.tubes = [];
  }

  _updateTubes() {
    const pump = [...this.entries.values()].find((e) => e.key.startsWith('pump:') && e.state !== 'exit');
    const rad = [...this.entries.values()].find((e) => e.key.startsWith('rad:') && e.state !== 'exit');
    if (!pump || !rad) { if (this.tubes.length) this._clearTubes(); return; }
    this.root.updateMatrixWorld(true);
    const a = pump.obj.userData.ports.map((p) => pump.obj.localToWorld(p.clone()));
    const b = rad.obj.userData.ports.map((p) => rad.obj.localToWorld(p.clone()));
    const sig = [...a, ...b].map((v) => `${v.x.toFixed(0)},${v.y.toFixed(0)},${v.z.toFixed(0)}`).join('|');
    if (sig === this.tubeSig) return;
    this.tubeSig = sig;
    if (!this.tubeMat) this.tubeMat = M.rubber(0x0b0c0f);
    this._clearTubes();
    for (let i = 0; i < 2; i++) {
      const p0 = a[i], p3 = b[i];
      const up = V(0, 1, 0);
      const p1 = p0.clone().add(up.clone().multiplyScalar(45)).add(V(0, 0, 12));
      const radDir = rad.obj.localToWorld(V(0, -1, 0)).sub(rad.obj.getWorldPosition(V())).normalize();
      const p2 = p3.clone().add(radDir.multiplyScalar(55));
      const mid = p1.clone().lerp(p2, 0.5).add(V(0, -25, 25 + i * 8));
      const curve = new THREE.CatmullRomCurve3([p0, p1, mid, p2, p3], false, 'centripetal');
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 5.5, 10, false), this.tubeMat);
      tube.castShadow = true;
      tube.userData.partKey = rad.key;
      this.root.add(tube);
      this.tubes.push(tube);
    }
  }

  // ------------------------------------------------------------ güç kabloları
  // Kasa + anakart + güç kaynağı varken, parçalar yerine oturduktan sonra çizilir.
  _clearCables() {
    for (const c of this.cables || []) { this.root.remove(c); c.geometry.dispose(); }
    this.cables = [];
    this.cableSig = '';
  }

  _updateCables() {
    const CL = this.caseLayout, L = this.boardL;
    const live = (pre) => [...this.entries.values()].find((e) => e.key.startsWith(pre) && e.state !== 'exit');
    const mobo = live('mobo:'), psu = live('psu:'), gpu = live('gpu:');
    const settled = (e) => !e || e.obj.position.distanceTo(e.pos) < 1.5;
    const ok = CL && L && mobo && psu && !this.exploded && settled(mobo) && settled(psu) && settled(gpu) &&
      this.anchor.position.distanceTo(this.anchorTarget) < 1.5;
    if (!ok) { if (this.cables && this.cables.length) this._clearCables(); return; }

    const A = this.anchor.position;
    const bw = (u, v, z) => V(A.x + u, A.y - v, A.z + z); // anakart yerel -> dünya
    const paths = [];
    // 24 pin: kartın ön kenarındaki soketten en yakın kablo geçiş lastiğine
    const c24 = bw(L.w - 1, L.atx24.v, 8);
    const gr = CL.grommets.reduce((a, b) => (Math.abs(b.y - c24.y) < Math.abs(a.y - c24.y) ? b : a));
    const gy = THREE.MathUtils.clamp(c24.y, gr.y - gr.h / 2 + 12, gr.y + gr.h / 2 - 12);
    paths.push({ r: 7.5, pts: [c24, c24.clone().add(V(16, 0, 4)), V((c24.x + gr.x) / 2 + 10, (c24.y + gy) / 2, CL.trayZ + 22), V(gr.x, gy, CL.trayZ + 6), V(gr.x, gy, CL.trayZ - 14)] });
    // EPS 8 pin: sol üst köşeden yukarı ve tepsinin arkasına
    const eps = bw(36, 2, 9);
    const topY = Math.min(eps.y + 26, CL.yT - 8);
    paths.push({ r: 4.5, pts: [eps, eps.clone().add(V(0, 10, 2)), V(eps.x, topY, eps.z - 4), V(eps.x, topY + 2, CL.trayZ + 6), V(eps.x, topY + 2, CL.trayZ - 14)] });
    // ekran kartı: üst kenardaki güç soketinden aşağı, örtünün içine (ya da tepsinin arkasına)
    if (gpu) {
      const d = gpu.obj.userData.dims;
      const n = /16|12V/i.test(gpu.item.conn || '') ? 1 : Math.min(3, Number(((gpu.item.conn || '').match(/(\d)\s*[xX×]/) || [0, 1])[1]) || 1);
      for (let i = 0; i < n; i++) {
        const c = V(A.x + gpu.pos.x + d.L * 0.62 + i * 22, A.y + gpu.pos.y - 4, A.z + gpu.pos.z + d.H + 5);
        const zMax = CL.W / 2 - CL.t - 8;
        const out = Math.min(c.z + 16, zMax);
        const endY = CL.hasShroud ? CL.shroudTop : CL.yB + CL.t + 30;
        const pts = [c, V(c.x, c.y, out), V(c.x + 6, c.y - 30, out), V(c.x + 14, endY + 22, out - 6)];
        if (CL.hasShroud) pts.push(V(c.x + 16, endY - 14, out - 10));
        else pts.push(V(c.x + 16, endY, CL.trayZ + 10), V(c.x + 16, endY, CL.trayZ - 14));
        paths.push({ r: n === 1 ? 5 : 4, pts });
      }
    }
    const sig = paths.map((p) => p.pts.map((v) => `${v.x.toFixed(0)},${v.y.toFixed(0)},${v.z.toFixed(0)}`).join(';')).join('|') + (CL.light ? 'w' : 'b');
    if (sig === this.cableSig) return;
    this._clearCables();
    this.cableSig = sig;
    const mat = (this.cableMat ||= {});
    const key = CL.light ? 'w' : 'b';
    mat[key] ||= new THREE.MeshStandardMaterial({ color: CL.light ? 0xe6e8ec : 0x15161a, roughness: 0.75, metalness: 0.05 });
    for (const p of paths) {
      const curve = new THREE.CatmullRomCurve3(p.pts, false, 'centripetal');
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, p.r, 10, false), mat[key]);
      m.castShadow = true;
      m.userData.partKey = psu.key;
      this.root.add(m);
      this.cables.push(m);
    }
  }

  // ------------------------------------------------------------ kamera
  _sceneBounds() {
    const CL = this.caseLayout, L = this.boardL || boardLayout(null);
    if (CL) return new THREE.Box3(V(-CL.D / 2, 0, -CL.W / 2), V(CL.D / 2, CL.H, CL.W / 2));
    const live = [...this.entries.values()].filter((e) => e.state !== 'exit');
    const box = new THREE.Box3(V(-L.w / 2, 0, -60), V(L.w / 2, L.h + 60, 150));
    if (live.some((e) => e.key.startsWith('psu:') || e.key.startsWith('rad:'))) box.max.x += 230;
    if (live.some((e) => e.key.startsWith('drv:'))) box.min.x -= 200;
    if (live.some((e) => e.key.startsWith('cooler:') || e.key.startsWith('pump:') || e.key.startsWith('gpu:'))) box.max.z += 120;
    return box;
  }

  _frameAll(resetDir) {
    const box = this._sceneBounds();
    const center = box.getCenter(V());
    const size = box.getSize(V());
    const radius = size.length() / 2;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect));
    const dist = (radius / Math.sin(fit / 2)) * 1.02;
    const dir = resetDir ? DEFAULT_DIR.clone() : this.camera.position.clone().sub(this.controls.target).normalize();
    const to = center.clone().add(dir.multiplyScalar(dist));
    this.camTween = { t: 0, dur: 1.1, fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(), toPos: to, toTarget: center };
  }

  focusOn(e, minR = 60) {
    const b = new THREE.Box3().setFromObject(e.obj);
    const c = b.getCenter(V());
    const r = Math.max(b.getSize(V()).length() / 2, minR);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = (r / Math.sin(fov / 2)) * 1.4;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camTween = { t: 0, dur: 0.9, fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(), toPos: c.clone().add(dir.multiplyScalar(dist)), toTarget: c };
  }

  // soft=true: yeni takılan parçayı çok yaklaşmadan, yerini gösterecek kadar yakından göster
  focusCategory(cat, soft = false) {
    const e = [...this.entries.values()].find((x) => x.cat === cat && x.state !== 'exit' && !x.key.startsWith('stand:'));
    if (e) this.focusOn(e, soft ? 170 : 70);
  }

  // ------------------------------------------------------------ fare / dokunma
  _bindPointer() {
    const c = this.canvas;
    let downAt = null;
    c.addEventListener('pointermove', (ev) => {
      const r = c.getBoundingClientRect();
      this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      this.pointerPx = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      this.pointerDirty = ev.pointerType === 'mouse';
    });
    c.addEventListener('pointerleave', () => { this._setHover(null); this.pointerDirty = false; });
    c.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
    c.addEventListener('pointerup', (ev) => {
      if (!downAt) return;
      const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
      if (moved < 6 && performance.now() - downAt.t < 450) {
        const r = c.getBoundingClientRect();
        this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        const hit = this._pick();
        if (hit) { this.focusOn(hit); this.onPick(hit.cat, hit.item); }
      }
      downAt = null;
    });
  }

  _pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.root, true);
    for (const h of hits) {
      if (!h.object.visible) continue;
      let o = h.object, skip = false;
      while (o && !o.userData.partKey) { if (o.userData.noPick || !o.visible) skip = true; o = o.parent; }
      if (skip || !o) continue;
      const e = this.entries.get(o.userData.partKey);
      if (e && e.state !== 'exit' && e.cat !== 'ghost' && !e.key.startsWith('stand:')) return e;
    }
    return null;
  }

  _setHover(e) {
    if (this.hovered === e) return;
    if (this.hovered) this._highlight(this.hovered, false);
    this.hovered = e;
    if (e) this._highlight(e, true);
    this.canvas.style.cursor = e ? 'pointer' : '';
    if (!e) this.onHover(null);
  }

  _highlight(e, on) {
    const seen = new Set();
    const objs = [e.obj, ...(e.key.startsWith('rad:') ? this.tubes : []), ...(e.key.startsWith('psu:') ? this.cables || [] : [])];
    for (const root of objs) root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || seen.has(m) || !m.emissive || m.userData.rgb || m.userData.glow) continue;
        seen.add(m);
        if (on) { m.userData._em = m.emissive.getHex(); m.userData._ei = m.emissiveIntensity; m.emissive.setHex(0x5b6cff); m.emissiveIntensity = 0.16; }
        else if (m.userData._em != null) { m.emissive.setHex(m.userData._em); m.emissiveIntensity = m.userData._ei; }
      }
    });
  }

  // ------------------------------------------------------------ döngü
  _resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
    }
  }

  _frame() {
    this.clock.update();
    if (!this.running || document.hidden || !this.visible) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.getElapsed();
    const k = 1 - Math.exp(-dt * 7);

    // kamera geçişi
    if (this.camTween) {
      const ct = this.camTween;
      ct.t = Math.min(1, ct.t + dt / ct.dur);
      const e = easeInOut(ct.t);
      this.camera.position.lerpVectors(ct.fromPos, ct.toPos, e);
      this.controls.target.lerpVectors(ct.fromTarget, ct.toTarget, e);
      if (ct.t >= 1) this.camTween = null;
    }

    // parçaları hedeflerine taşı
    this.anchor.position.lerp(this.anchorTarget, k);
    const tmp = V();
    const ONE = V(1, 1, 1);
    for (const e of [...this.entries.values()]) {
      tmp.copy(e.pos);
      if (e.state === 'exit') tmp.add(e.enter);
      else if (this.exploded) tmp.add(e.explode);
      e.obj.position.lerp(tmp, k);
      e.obj.quaternion.slerp(e.quat, k);
      if (e.state === 'exit') {
        e.obj.scale.lerp(V(0.7, 0.7, 0.7), k);
        if (e.obj.position.distanceTo(tmp) < 4) this._remove(e);
      } else e.obj.scale.lerp(ONE, k);
      for (const r of e.rotors) r.rotation.z += dt * 9 * r.userData.spin;
      if (e.cat === 'case') {
        const ud = e.obj.userData;
        // ayrık görünümde cam panel kameranın önünü kapatmasın: dışarı kayıp gizlenir
        ud.side.position.lerp(this.exploded ? V(0, 0, 420) : V(), k);
        ud.side.visible = this.panelOn && (!this.exploded || ud.side.position.z < 200);
        ud.front.position.lerp(this.exploded ? V(150, 0, 0) : V(), k);
      }
    }
    this._updateTubes();
    this._updateCables();

    // RGB
    tickRgb(t);
    const rgbOn = this.rgbOn && rgbActive();
    this.rgbLights.forEach((l, i) => {
      l.intensity = THREE.MathUtils.lerp(l.intensity, rgbOn ? 0.7 : 0, k);
      l.color.setHSL((t * 0.12 + i * 0.5) % 1, 1, 0.55);
    });

    // üzerine gelme
    if (this.pointerDirty) {
      this.pointerDirty = false;
      const hit = this._pick();
      this._setHover(hit);
      if (hit) this.onHover({ cat: hit.cat, catLabel: CAT_LABEL[hit.cat] || '', name: hit.item ? hit.item.n : '', x: this.pointerPx.x, y: this.pointerPx.y });
    }

    this.controls.update();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    // yavaş cihazlarda bloom'u kapat ve çözünürlüğü düşür (ilk ~4 sn ölçülür)
    if (this.bloom && !this.perfChecked) {
      const now = performance.now();
      this.perfStart ??= now;
      this.frameTimes.push(now);
      if (now - this.perfStart > 4000) {
        this.perfChecked = true;
        const ts = this.frameTimes.slice(Math.floor(this.frameTimes.length / 3));
        const fps = (ts.length - 1) / ((ts[ts.length - 1] - ts[0]) / 1000);
        if (fps < 28) {
          this.bloom = false;
          this.composer = null;
          this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
          this._resize();
        }
        this.frameTimes = [];
      }
    }
  }
}
