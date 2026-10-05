// Kategori verilerini (data/*.json) gerektiğinde yükler ve önbellekte tutar.

const cache = new Map();
const byId = new Map();
let metaPromise = null;

export function loadMeta() {
  if (!metaPromise) {
    metaPromise = fetch('data/meta.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return metaPromise;
}

export function loadCategory(cat) {
  if (!cache.has(cat)) {
    const p = loadMeta()
      .then((meta) => fetch(`data/${cat}.json?v=${encodeURIComponent((meta && meta.built) || '')}`))
      .then((r) => {
        if (!r.ok) throw new Error(`${cat} verisi yüklenemedi (${r.status})`);
        return r.json();
      })
      .then((data) => {
        const items = data.items || [];
        const map = new Map(items.map((x) => [x.id, x]));
        byId.set(cat, map);
        return items;
      });
    p.catch(() => cache.delete(cat));
    cache.set(cat, p);
  }
  return cache.get(cat);
}

export const isLoaded = (cat) => byId.has(cat);
export const getLoaded = (cat) => (byId.has(cat) ? [...byId.get(cat).values()] : null);
export const findItem = (cat, id) => (byId.has(cat) ? byId.get(cat).get(String(id)) || null : null);

// Türkçe karakterleri sadeleştirip arama için normalleştirir
export function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9.+]+/g, ' ')
    .trim();
}
