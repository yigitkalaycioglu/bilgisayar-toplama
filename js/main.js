import {
  CATEGORIES, CAT, ICONS, FACETS, specChips, shortSpecs, perfScore, epeyUrl, imageUrl, fmtPrice, fmtNum, detailRows,
} from './catalog.js';
import { checkItem, evaluateBuild, estimatePower, worstLevel, one } from './compat.js';
import { loadMeta, loadCategory, isLoaded, getLoaded, findItem, norm } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const svg = (d, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}">${d}</svg>`;
const IC = {
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  ok: svg('<path d="M20 6 9 17l-5-5"/>'),
  warn: svg('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/>'),
  err: svg('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>'),
  swap: svg('<path d="M7 7h11l-3-3M17 17H6l3 3"/>'),
};

// ------------------------------------------------------------------ durum
const sel = Object.fromEntries(CATEGORIES.map((c) => [c.key, []]));
let scene = null;
let meta = null;
const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(sel).map(([k, v]) => [k, v.map((e) => [k, e.item.id, e.qty])])));
function restoreSnapshot(s) {
  const o = JSON.parse(s);
  for (const k of Object.keys(sel)) sel[k] = (o[k] || []).map(([cat, id, qty]) => ({ item: findItem(cat, id), qty })).filter((e) => e.item);
  changed();
}

function changed() {
  persist();
  renderBuilder();
  if (scene) scene.update(sel);
  $('#viewer-hint').hidden = CATEGORIES.some((c) => sel[c.key].length) || !scene;
}

function serialize() {
  const p = new URLSearchParams();
  for (const c of CATEGORIES) {
    const list = sel[c.key];
    if (list.length) p.set(c.key, list.map((e) => (e.qty > 1 ? `${e.item.id}x${e.qty}` : e.item.id)).join(','));
  }
  return p.toString().replace(/%2C/g, ',');
}
// Her ziyaretçinin sistemi yalnızca kendi sekmesinin oturumunda (sessionStorage) tutulur:
// sayfa yenilenince korunur, yeni ziyarette site boş açılır, adres çubuğuna hiçbir şey yazılmaz.
// Başkasıyla paylaşmak için "Paylaş" düğmesinin ürettiği bağlantı kullanılır.
const SESSION_KEY = 'pc-toplama-oturum';
const CAT_KEYS_RE = new RegExp(`(^|&)(${CATEGORIES.map((c) => c.key).join('|')})=`);

function persist() {
  const s = serialize();
  try { s ? sessionStorage.setItem(SESSION_KEY, s) : sessionStorage.removeItem(SESSION_KEY); } catch { /* gizli sekme vb. */ }
}
function shareUrl() {
  const s = serialize();
  return location.origin + location.pathname + (s ? `#paylas=${s}` : '');
}
async function restore() {
  // önceki sürümün tarayıcıda kalıcı tuttuğu kaydı sil
  try { localStorage.removeItem('pc-toplama-build'); } catch { /* yok say */ }
  let s = '', shared = false;
  const h = location.hash.slice(1);
  if (h) {
    if (h.startsWith('paylas=')) { try { s = decodeURIComponent(h.slice(7)); } catch { s = h.slice(7); } shared = true; }
    else if (CAT_KEYS_RE.test(h)) { s = h; shared = true; } // eski biçimli paylaşım bağlantıları
    // paylaşılan sistem bu ziyaretçinin oturumuna alınır; adres çubuğu temizlenir
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (!s) { try { s = sessionStorage.getItem(SESSION_KEY) || ''; } catch { s = ''; } }
  if (!s) return;
  if (shared) setTimeout(() => toast('Paylaşılan bir sistem açıldı. Değiştirmek ya da temizlemek sana kalmış.', { ms: 5000 }), 300);
  const p = new URLSearchParams(s);
  let missing = 0;
  await Promise.all(CATEGORIES.map(async (c) => {
    const v = p.get(c.key);
    if (!v) return;
    try { await loadCategory(c.key); } catch { missing++; return; }
    const entries = [];
    for (const tok of v.split(',')) {
      const [id, q] = tok.split('x');
      const item = findItem(c.key, id);
      if (!item) { missing++; continue; }
      const qty = Math.max(1, Math.min(8, parseInt(q || '1', 10) || 1));
      const dup = entries.find((e) => e.item.id === item.id);
      if (dup && c.multi) dup.qty += qty;
      else entries.push({ item, qty: c.qty || c.multi ? qty : 1 });
    }
    sel[c.key] = entries.slice(0, c.multi || 1);
  }));
  if (missing) toast(`${missing} parça artık listede olmadığı için çıkarıldı.`, { kind: 'err' });
  persist();
}

// ------------------------------------------------------------------ sağ panel
const compatCount = (cat) => {
  const items = getLoaded(cat);
  if (!items) return null;
  let n = 0;
  for (const x of items) if (worstLevel(checkItem(cat, x, sel)) !== 'err') n++;
  return n;
};

function thumb(cat, item, cls = 'thumb') {
  const src = imageUrl(item, 'k');
  return src
    ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : `<span class="thumb-ph">${ICONS[cat]}</span>`;
}

function renderBuilder() {
  const cs = one(sel, 'case');
  $('#slots').innerHTML = CATEGORIES.map((c) => {
    const list = sel[c.key];
    const filled = list.length > 0;
    const n = compatCount(c.key);
    const total = meta && meta.counts ? meta.counts[c.key] : null;
    let sub;
    if (c.key === 'psu' && !filled && cs && cs.psu) sub = `Kasa ${cs.psuw ? cs.psuw + ' W ' : ''}güç kaynağıyla geliyor · isteğe bağlı`;
    else if (n != null) sub = `${fmtNum(n)} uyumlu ürün${!c.required ? ' · isteğe bağlı' : ''}`;
    else if (total) sub = `${fmtNum(total)} ürün${!c.required ? ' · isteğe bağlı' : ''}`;
    else sub = c.required ? 'Seçilmedi' : 'İsteğe bağlı';
    if (filled && c.multi) sub = `${list.reduce((a, e) => a + e.qty, 0)} sürücü · ${sub}`;
    const btnLabel = filled && !c.multi ? 'Değiştir' : filled ? 'Ekle' : 'Seç';
    const canAddMore = !c.multi || list.reduce((a, e) => a + e.qty, 0) < c.multi;
    return `<li class="slot ${filled ? 'filled' : ''}" data-cat="${c.key}">
      <div class="slot-head">
        <span class="slot-icon">${ICONS[c.key]}</span>
        <div class="slot-title"><strong>${c.label}</strong><span>${esc(sub)}</span></div>
        ${canAddMore ? `<button class="btn btn-sm ${filled ? '' : 'btn-primary'}" type="button" data-pick="${c.key}">${filled && !c.multi ? IC.swap : IC.plus}<span>${btnLabel}</span></button>` : ''}
      </div>
      ${filled ? `<div class="slot-items">${list.map((e, i) => chosenHTML(c, e, i)).join('')}</div>` : ''}
    </li>`;
  }).join('');

  // toplam fiyat
  let total = 0;
  for (const c of CATEGORIES) for (const e of sel[c.key]) total += (e.item.p || 0) * e.qty;
  $('#total-price').textContent = fmtPrice(total);
  const count = CATEGORIES.reduce((a, c) => a + sel[c.key].length, 0);
  $('#build-sub').textContent = count ? `${count} parça seçildi` : 'Parçaları seç, uyumsuzlar otomatik elenir.';

  // güç
  const pw = estimatePower(sel);
  const psu = one(sel, 'psu');
  const psuW = psu ? psu.w : cs && cs.psu ? cs.psuw : null;
  $('#power-value').textContent = pw.draw ? `~${pw.draw} W` : '0 W';
  const scale = Math.max(psuW || 0, pw.rec || 0, pw.draw, 400) * 1.08;
  const fill = $('#power-fill');
  fill.style.width = `${Math.min(100, (pw.draw / scale) * 100)}%`;
  fill.classList.toggle('over', !!(psuW && pw.draw > psuW));
  const mark = $('#power-mark');
  mark.hidden = !psuW;
  if (psuW) mark.style.left = `${Math.min(100, (psuW / scale) * 100)}%`;
  $('#power-note').textContent = !pw.draw
    ? 'Parça seçtikçe tahmini tüketim ve önerilen güç kaynağı hesaplanır.'
    : psuW
      ? `Güç kaynağı ${psuW} W (çizgi) · önerilen en az ${pw.rec} W`
      : `Önerilen güç kaynağı: en az ${pw.rec} W`;

  // uyumluluk listesi
  const checks = evaluateBuild(sel, CATEGORIES);
  $('#checks').innerHTML = checks.length
    ? checks.map((ch) => `<li class="check ${ch.level}">${IC[ch.level] || IC.info}<span>${esc(ch.msg)}</span></li>`).join('')
    : `<li class="check info">${IC.info}<span>Henüz parça seçilmedi. Önce kasayı ya da işlemciyi seçmek iyi bir başlangıç.</span></li>`;
}

function chosenHTML(c, e, i) {
  const x = e.item;
  const qtyCtl = c.qty || c.multi
    ? `<span class="qty" aria-label="Adet"><button type="button" data-qty="${c.key}:${i}:-1" aria-label="Azalt">−</button><span>${e.qty}</span><button type="button" data-qty="${c.key}:${i}:1" aria-label="Artır">+</button></span>`
    : '';
  return `<div class="chosen">
    ${thumb(c.key, x)}
    <div class="chosen-main">
      <a class="chosen-name" href="${esc(epeyUrl(c.key, x))}" target="_blank" rel="noopener" title="epey.com'da aç">${esc(x.n)}</a>
      <div class="chosen-specs">${esc(shortSpecs(c.key, x, 4))}</div>
    </div>
    <div class="chosen-side">
      <span class="price">${fmtPrice((x.p || 0) * e.qty)}</span>
      <div class="chosen-actions">
        ${qtyCtl}
        <button class="icon-btn sm" type="button" data-focus="${c.key}" title="3D modelde göster" aria-label="3D modelde göster">${IC.eye}</button>
        <button class="icon-btn sm" type="button" data-remove="${c.key}:${i}" title="Kaldır" aria-label="Kaldır">${IC.x}</button>
      </div>
    </div>
  </div>`;
}

$('#slots').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.pick) openPicker(b.dataset.pick, b);
  else if (b.dataset.remove) {
    const [cat, i] = b.dataset.remove.split(':');
    const before = snapshot();
    const [removed] = sel[cat].splice(+i, 1);
    changed();
    toast(`${removed.item.n} kaldırıldı`, { undo: before });
  } else if (b.dataset.qty) {
    const [cat, i, d] = b.dataset.qty.split(':');
    const e = sel[cat][+i];
    const c = CAT[cat];
    let max = 8;
    if (cat === 'ram') { const mb = one(sel, 'mobo'); max = mb && mb.slots ? Math.max(1, Math.floor(mb.slots / (e.item.mods || 1))) : 4; }
    if (c.multi) max = c.multi - sel[cat].reduce((a, x) => a + x.qty, 0) + e.qty;
    e.qty += +d;
    if (e.qty < 1) sel[cat].splice(+i, 1);
    else if (e.qty > max) { e.qty = max; toast(cat === 'ram' ? 'Anakartta daha fazla bellek yuvası yok.' : 'En fazla bu kadar sürücü eklenebilir.', { kind: 'err' }); }
    changed();
  } else if (b.dataset.focus && scene) scene.focusCategory(b.dataset.focus);
});
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pick]');
  if (b && !b.closest('#slots')) openPicker(b.dataset.pick, b);
});
document.addEventListener('error', (ev) => {
  const t = ev.target;
  if (t.tagName === 'IMG' && t.classList.contains('thumb')) {
    const ph = document.createElement('span');
    ph.className = 'thumb-ph';
    ph.innerHTML = ICONS.storage;
    t.replaceWith(ph);
  }
}, true);

// ------------------------------------------------------------------ seçici
const P = {
  cat: null, items: [], compat: new Map(), q: '', sort: 'pop', facet: {}, pmin: null, pmax: null,
  showIncompat: false, list: [], shown: 0, opener: null,
};
const pickerEl = $('#picker');

async function openPicker(cat, opener) {
  const c = CAT[cat];
  Object.assign(P, { cat, items: [], compat: new Map(), q: '', facet: {}, pmin: null, pmax: null, showIncompat: false, list: [], shown: 0, opener });
  P.sort = cat === 'psu' ? 'price-asc' : 'pop';
  $('#picker-title').textContent = `${c.label} seç`;
  $('#picker-icon').innerHTML = ICONS[cat];
  $('#picker-q').value = '';
  $('#picker-sort').value = P.sort;
  $('#facets').classList.remove('open');
  $('#picker-filter-toggle').setAttribute('aria-expanded', 'false');
  $('#picker-filter-toggle').textContent = 'Filtreler';
  $('#product-list').innerHTML = '<li class="empty"><span class="spinner"></span></li>';
  $('#compat-bar').innerHTML = '';
  renderFacetsStatic();
  pickerEl.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#picker-q').focus({ preventScroll: true }), 50);
  try {
    P.items = await loadCategory(cat);
  } catch (err) {
    $('#product-list').innerHTML = `<li class="empty"><strong>Veri yüklenemedi</strong>${esc(err.message)}</li>`;
    return;
  }
  if (P.cat !== cat) return;
  for (const x of P.items) P.compat.set(x.id, checkItem(cat, x, sel));
  applyFilters();
}

function closePicker() {
  pickerEl.hidden = true;
  document.body.style.overflow = '';
  P.cat = null;
  if (P.opener && document.contains(P.opener)) P.opener.focus({ preventScroll: true });
}

pickerEl.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-close]')) return closePicker();
  const add = ev.target.closest('[data-add]');
  if (add) return pickItem(add.dataset.add, add.dataset.force === '1');
  const tg = ev.target.closest('[data-toggle-incompat]');
  if (tg) { P.showIncompat = !P.showIncompat; applyFilters(); }
  const clr = ev.target.closest('[data-clear-facet]');
  if (clr) { delete P.facet[clr.dataset.clearFacet]; applyFilters(); }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !pickerEl.hidden) closePicker();
  if (ev.key === 'Tab' && !pickerEl.hidden) {
    const f = $$('button, input, select, a[href]', $('.picker-panel')).filter((el) => !el.disabled && el.offsetParent);
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  }
});
let qTimer;
$('#picker-q').addEventListener('input', (ev) => { clearTimeout(qTimer); qTimer = setTimeout(() => { P.q = ev.target.value; applyFilters(); }, 120); });
$('#picker-sort').addEventListener('change', (ev) => { P.sort = ev.target.value; applyFilters(); });
$('#picker-filter-toggle').addEventListener('click', (ev) => {
  const open = $('#facets').classList.toggle('open');
  ev.currentTarget.setAttribute('aria-expanded', String(open));
  ev.currentTarget.textContent = open ? 'Sonuçları göster' : 'Filtreler';
});
$('#facets').addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.facet) {
    const s = (P.facet[t.dataset.facet] ||= new Set());
    t.checked ? s.add(t.value) : s.delete(t.value);
    if (!s.size) delete P.facet[t.dataset.facet];
    applyFilters();
  } else if (t.id === 'f-incompat') { P.showIncompat = t.checked; applyFilters(); }
});
let pTimer;
$('#facets').addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id !== 'f-pmin' && t.id !== 'f-pmax') return;
  clearTimeout(pTimer);
  pTimer = setTimeout(() => {
    const v = parseFloat(t.value.replace(/\./g, '').replace(',', '.'));
    P[t.id === 'f-pmin' ? 'pmin' : 'pmax'] = Number.isFinite(v) ? v : null;
    applyFilters();
  }, 250);
});

const levelOf = (x) => worstLevel(P.compat.get(x.id) || []);
// Arama metni: "2×16 GB" gibi değerler "2x16", "16gb", "6000mt" yazımlarıyla da bulunur
const unitText = (s) => s.replace(/×/g, 'x').replace(/MT\/s/gi, 'mts');
function haystack(x) {
  if (!x._s) {
    const name = norm(x.n);
    const specs = norm(unitText(`${x.c || ''} ${x.br || ''} ${shortSpecs(P.cat, x, 8)}`));
    const glued = specs.replace(/(\d) (?=[a-z])/g, '$1');
    const speed = x.spd ? ` ${x.spd}mhz ${x.spd}mts` : '';
    const total = P.cat === 'ram' && x.cap ? ` ${x.cap}gb` : '';
    x._s = `${name} ${name.replace(/ /g, '')} ${specs} ${glued}${speed}${total}`;
  }
  return x._s;
}
const queryTokens = (q) => norm(unitText(q)).replace(/(\d) (mhz|mts|mt|gb|tb|w|mm)\b/g, '$1$2').split(' ').filter(Boolean);

function facetValues(f, x) {
  const v = f.get(x);
  if (v == null || v === '') return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

function applyFilters() {
  const cat = P.cat;
  if (!cat) return;
  const tokens = queryTokens(P.q);
  const base = P.items.filter((x) =>
    (!tokens.length || tokens.every((t) => haystack(x).includes(t))) &&
    (P.pmin == null || (x.p || 0) >= P.pmin) &&
    (P.pmax == null || (x.p || 0) <= P.pmax));
  const compatible = base.filter((x) => levelOf(x) !== 'err');
  const pool = P.showIncompat ? base : compatible;
  const facets = FACETS[cat] || [];
  const matches = (x, skip) => facets.every((f) => {
    if (f.id === skip) return true;
    const s = P.facet[f.id];
    return !s || facetValues(f, x).some((v) => s.has(v));
  });
  let list = pool.filter((x) => matches(x, null));

  const price = (x) => x.p || Infinity;
  const sorters = {
    pop: (a, b) => (levelOf(a) === 'err') - (levelOf(b) === 'err') || (a.o ?? 1e9) - (b.o ?? 1e9),
    'price-asc': (a, b) => price(a) - price(b),
    'price-desc': (a, b) => (b.p || 0) - (a.p || 0),
    perf: (a, b) => perfScore(cat, b) - perfScore(cat, a),
    value: (a, b) => perfScore(cat, b) / price(b) - perfScore(cat, a) / price(a),
    name: (a, b) => a.n.localeCompare(b.n, 'tr'),
  };
  list.sort(sorters[P.sort] || sorters.pop);
  if (P.showIncompat && P.sort !== 'pop') list.sort((a, b) => (levelOf(a) === 'err') - (levelOf(b) === 'err'));
  P.list = list;
  P.shown = 0;
  $('#product-list').innerHTML = '';
  $('.results').scrollTop = 0;
  renderMore();
  renderCompatBar(base, compatible);
  renderFacets(pool, matches);
}

function renderCompatBar(base, compatible) {
  const hidden = base.length - compatible.length;
  const anySel = CATEGORIES.some((c) => c.key !== P.cat && sel[c.key].length);
  let reasons = '';
  if (hidden) {
    // aynı türdeki nedenleri grupla, her grup için ilk örneği göster
    const groups = new Map();
    for (const x of base) for (const p of P.compat.get(x.id) || []) if (p.level === 'err') {
      const m = p.msg.match(/^([^:(]+):\s/);
      const shown = m ? m[1] : p.msg;
      const key = shown.replace(/\d[\d.,]*/g, '#');
      const g = groups.get(key) || { n: 0, shown };
      g.n++;
      groups.set(key, g);
    }
    reasons = [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 3).map((g) => g.shown).join(' · ');
  }
  $('#compat-bar').innerHTML = `
    <span class="pill">${IC.ok}${fmtNum(compatible.length)} uyumlu</span>
    <span>${anySel ? 'Seçtiğin parçalara uyan ürünler listeleniyor.' : 'Henüz kısıtlayan parça yok; tüm ürünler listeleniyor.'}
    ${hidden ? `<strong>${fmtNum(hidden)}</strong> uyumsuz ürün ${P.showIncompat ? 'soluk gösteriliyor' : 'gizlendi'}.` : ''}</span>
    ${hidden ? `<button class="btn btn-sm" type="button" data-toggle-incompat>${P.showIncompat ? 'Uyumsuzları gizle' : 'Uyumsuzları göster'}</button>` : ''}
    ${hidden && reasons ? `<div class="reasons">Gizlenme nedenleri: ${esc(reasons)}</div>` : ''}`;
}

function sortFacetOptions(f, entries) {
  if (f.sort === 'num') return entries.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
  if (f.sort === 'cap') {
    const gb = (s) => parseFloat(s) * (/TB/.test(s) ? 1000 : 1);
    return entries.sort((a, b) => gb(a[0]) - gb(b[0]));
  }
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
}

function renderFacetsStatic() {
  $('#facets').innerHTML = `
    <div class="facet"><label class="toggle-row"><input type="checkbox" id="f-incompat"> Uyumsuzları da göster</label></div>
    <div class="facet"><h3>Fiyat (TL)</h3><div class="range">
      <input id="f-pmin" inputmode="numeric" placeholder="En az" aria-label="En düşük fiyat">
      <span>–</span>
      <input id="f-pmax" inputmode="numeric" placeholder="En çok" aria-label="En yüksek fiyat"></div></div>
    <div id="facets-dyn"></div>`;
}

function renderFacets(pool, matches) {
  const facets = FACETS[P.cat] || [];
  const parts = [];
  const inc = $('#f-incompat');
  if (inc) inc.checked = P.showIncompat;
  for (const f of facets) {
    const counts = new Map();
    for (const x of pool) {
      if (!matches(x, f.id)) continue;
      for (const v of facetValues(f, x)) counts.set(v, (counts.get(v) || 0) + 1);
    }
    const chosen = P.facet[f.id] || new Set();
    for (const v of chosen) if (!counts.has(v)) counts.set(v, 0);
    if (counts.size < 2 && !chosen.size) continue;
    const opts = sortFacetOptions(f, [...counts.entries()]);
    parts.push(`<div class="facet"><h3>${esc(f.label)}${chosen.size ? `<button type="button" data-clear-facet="${f.id}">temizle</button>` : ''}</h3><div class="facet-opts">
      ${opts.map(([v, n]) => `<label class="facet-opt ${n ? '' : 'zero'}"><input type="checkbox" data-facet="${f.id}" value="${esc(v)}" ${chosen.has(v) ? 'checked' : ''}><span>${esc(v)}</span><em>${n}</em></label>`).join('')}
    </div></div>`);
  }
  const fc = $('#facets');
  const st = fc.scrollTop;
  const act = document.activeElement;
  const focusKey = act && act.dataset && act.dataset.facet ? [act.dataset.facet, act.value] : null;
  $('#facets-dyn').innerHTML = parts.join('');
  fc.scrollTop = st;
  if (focusKey) {
    const again = $$('#facets-dyn input[data-facet]').find((el) => el.dataset.facet === focusKey[0] && el.value === focusKey[1]);
    if (again) again.focus({ preventScroll: true });
  }
}

function productHTML(x) {
  const cat = P.cat;
  const probs = P.compat.get(x.id) || [];
  const lvl = worstLevel(probs);
  const selected = sel[cat].some((e) => e.item.id === x.id);
  const chips = specChips(cat, x).slice(0, 6).map((c) => `<span class="chip ${c.hl ? 'hl' : ''}">${esc(c.t)}</span>`).join('');
  const warns = probs.filter((p) => p.level === 'warn').map((p) => `<span class="chip warn" title="${esc(p.msg)}">⚠ ${esc(p.msg)}</span>`).join('');
  const infos = probs.filter((p) => p.level === 'info').slice(0, 1).map((p) => `<span class="chip">${esc(p.msg)}</span>`).join('');
  const errs = probs.filter((p) => p.level === 'err');
  const why = errs.length ? `<div class="p-why">${IC.err}<span>${esc(errs.map((p) => p.msg).join(' · '))}</span></div>` : '';
  const btn = lvl === 'err'
    ? `<button class="btn btn-sm" type="button" data-add="${x.id}" data-force="1" title="Çakışan parçaları kaldırıp bunu seçer">${IC.swap}<span>Değiştir ve seç</span></button>`
    : selected && !CAT[cat].multi
      ? `<button class="btn btn-sm" type="button" disabled>${IC.ok}<span>Seçili</span></button>`
      : `<button class="btn btn-sm btn-primary" type="button" data-add="${x.id}">${IC.plus}<span>${CAT[cat].multi && selected ? 'Bir daha ekle' : 'Ekle'}</span></button>`;
  return `<li class="product ${selected ? 'selected' : ''} ${lvl === 'err' ? 'incompatible' : ''}">
    ${thumb(cat, x)}
    <div class="p-main">
      <div class="p-name"><span>${esc(x.n)}</span>${x.c ? `<span class="code">${esc(x.c)}</span>` : ''}</div>
      <div class="p-specs">${chips}${warns}${infos}</div>
      ${why}
      <details class="p-more"><summary>Tüm özellikler</summary><dl>${detailRows(cat, x).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>
    </div>
    <div class="p-side">
      <span class="price">${fmtPrice(x.p)}</span>
      <span class="sellers">${x.s ? `${x.s} satıcı · ` : ''}<a href="${esc(epeyUrl(cat, x))}" target="_blank" rel="noopener">epey'de gör ${IC.ext}</a></span>
      <div class="btns">${btn}</div>
    </div>
  </li>`;
}

function renderMore() {
  const ul = $('#product-list');
  if (!P.list.length) {
    ul.innerHTML = `<li class="empty"><strong>Sonuç bulunamadı</strong>${P.q ? 'Aramayı ya da filtreleri değiştirmeyi dene.' : 'Seçili parçalarla uyumlu ürün yok; uyumsuzları göstererek nedenlerini görebilirsin.'}</li>`;
    return;
  }
  const next = P.list.slice(P.shown, P.shown + 40);
  ul.insertAdjacentHTML('beforeend', next.map(productHTML).join(''));
  P.shown += next.length;
}
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && P.cat && P.shown && P.shown < P.list.length) renderMore();
}, { root: $('.results'), rootMargin: '400px' }).observe($('#list-sentinel'));

function pickItem(id, force) {
  const cat = P.cat;
  const c = CAT[cat];
  const item = P.items.find((x) => x.id === id);
  if (!item) return;
  const before = snapshot();
  const removed = [];
  if (force) {
    const blockers = new Set((P.compat.get(id) || []).filter((p) => p.level === 'err' && p.blocker).map((p) => p.blocker));
    for (const b of blockers) if (b !== cat && sel[b].length) { removed.push(...sel[b].map((e) => e.item.n)); sel[b] = []; }
  }
  if (c.multi) {
    const total = sel[cat].reduce((a, e) => a + e.qty, 0);
    if (total >= c.multi) { toast(`En fazla ${c.multi} sürücü eklenebilir.`, { kind: 'err' }); return; }
    const ex = sel[cat].find((e) => e.item.id === id);
    if (ex) ex.qty++; else sel[cat].push({ item, qty: 1 });
  } else {
    sel[cat] = [{ item, qty: 1 }];
  }
  closePicker();
  changed();
  const li = $(`#slots .slot[data-cat="${cat}"]`);
  if (li) { li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1000); }
  toast(removed.length ? `${item.n} eklendi; uyumsuz ${removed.join(', ')} çıkarıldı` : `${item.n} eklendi`, { undo: before });
  if (scene) setTimeout(() => (cat === 'case' ? scene.resetView() : scene.focusCategory(cat, true)), 450);
}

// ------------------------------------------------------------------ bildirim
function toast(msg, { kind = '', undo = null, ms = 4200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${kind === 'err' ? IC.warn : IC.ok}<span>${esc(msg)}</span>${undo ? '<button class="btn btn-sm btn-ghost" type="button">Geri al</button>' : ''}`;
  if (undo) el.querySelector('button').addEventListener('click', () => { restoreSnapshot(undo); el.remove(); });
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ------------------------------------------------------------------ üst çubuk
$('#btn-share').addEventListener('click', async () => {
  if (!CATEGORIES.some((c) => sel[c.key].length)) { toast('Paylaşılacak sistem yok; önce parça seç.', { kind: 'err' }); return; }
  const url = shareUrl();
  try { await navigator.clipboard.writeText(url); toast('Paylaşım bağlantısı kopyalandı; açan kişi bu sistemi kendi oturumunda görür.'); }
  catch { prompt('Bu bağlantıyı kopyala:', url); }
});
$('#btn-copy-list').addEventListener('click', async () => {
  const lines = ['PC Toplama — sistem listesi', ''];
  let total = 0;
  for (const c of CATEGORIES) for (const e of sel[c.key]) {
    const p = (e.item.p || 0) * e.qty;
    total += p;
    lines.push(`${c.label}: ${e.qty > 1 ? e.qty + ' × ' : ''}${e.item.n} — ${fmtPrice(p)}`);
  }
  if (lines.length === 2) { toast('Liste boş; önce parça seç.', { kind: 'err' }); return; }
  lines.push('', `Toplam: ${fmtPrice(total)}`, `Tahmini tüketim: ~${estimatePower(sel).draw} W`, '', shareUrl());
  try { await navigator.clipboard.writeText(lines.join('\n')); toast('Parça listesi panoya kopyalandı'); }
  catch { prompt('Listeyi kopyala:', lines.join(' | ')); }
});
$('#btn-reset').addEventListener('click', () => {
  if (!CATEGORIES.some((c) => sel[c.key].length)) return;
  const before = snapshot();
  for (const c of CATEGORIES) sel[c.key] = [];
  changed();
  toast('Tüm seçimler temizlendi', { undo: before, ms: 6000 });
});

// ------------------------------------------------------------------ 3D
function hudToggle(id, initial, fn) {
  const b = $(id);
  let on = initial;
  b.setAttribute('aria-pressed', String(on));
  b.addEventListener('click', () => { on = !on; b.setAttribute('aria-pressed', String(on)); fn(on); });
}

async function initScene() {
  const loading = $('#viewer-loading');
  try {
    const mod = await import('./three/scene.js');
    if (!mod.webglAvailable()) throw new Error('WebGL2 desteklenmiyor');
    const tip = $('#scene-tooltip');
    scene = new mod.PCScene($('#scene'), $('#viewer'), {
      onHover: (h) => {
        if (!h) { tip.hidden = true; return; }
        tip.innerHTML = `<small>${esc(h.catLabel)}</small>${esc(h.name)}`;
        tip.style.left = `${h.x}px`;
        tip.style.top = `${h.y}px`;
        tip.hidden = false;
      },
      onPick: (cat) => {
        const li = $(`#slots .slot[data-cat="${cat}"]`);
        if (li) {
          li.classList.add('flash');
          setTimeout(() => li.classList.remove('flash'), 1000);
          const r = li.getBoundingClientRect();
          if (r.top < 70 || r.bottom > innerHeight) li.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      },
      onReady: () => loading.classList.add('done'),
    });
    hudToggle('#hud-explode', false, (on) => scene.setExploded(on));
    hudToggle('#hud-panel', true, (on) => scene.setPanel(on));
    hudToggle('#hud-rgb', true, (on) => scene.setRgb(on));
    hudToggle('#hud-rotate', false, (on) => scene.setAutoRotate(on));
    $('#hud-reset').addEventListener('click', () => scene.resetView());
    scene.update(sel);
    window.__scene = scene;
  } catch (err) {
    console.error(err);
    loading.innerHTML = `3D önizleme açılamadı: ${esc(err.message)}. Parça seçimi ve uyumluluk kontrolü çalışmaya devam eder.`;
    $('.hud').hidden = true;
  }
  $('#viewer-hint').hidden = CATEGORIES.some((c) => sel[c.key].length) || !scene;
}

// ------------------------------------------------------------------ başlangıç
async function init() {
  meta = await loadMeta();
  if (meta) {
    const total = Object.values(meta.counts || {}).reduce((a, b) => a + b, 0);
    const fmt = (d) => d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const times = Object.values(meta.updated || {}).map((s) => new Date(s)).filter((d) => !Number.isNaN(+d));
    const newest = times.length ? new Date(Math.max(...times)) : meta.built ? new Date(meta.built) : null;
    $('#data-meta').innerHTML = `${fmtNum(total)} ürün${newest ? ` · fiyatlar <b>${fmt(newest)}</b> itibarıyla` : ''}`;
    $('#data-meta').title = Object.entries(meta.updated || {})
      .map(([k, v]) => `${CAT[k] ? CAT[k].label : k}: ${fmt(new Date(v))}`).join('\n');
  } else {
    $('#data-meta').textContent = 'Ürün verileri yüklenemedi';
  }
  await restore();
  renderBuilder();
  initScene();
  // diğer kategorileri arka planda yükle (uyumlu ürün sayıları ve hızlı açılış için)
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
  idle(async () => {
    for (const c of CATEGORIES) {
      if (isLoaded(c.key)) continue;
      try { await loadCategory(c.key); } catch { /* sonra tekrar denenir */ }
    }
    renderBuilder();
  });
}

init();
