const cfg = window.APP_CONFIG || {};
if (!cfg.MAPBOX_TOKEN || !cfg.DATA_URL) {
  alert('Trūkst konfigurācijas. Pārbaudi .env (MAPBOX_TOKEN un DATA_URL).');
  throw new Error('Missing MAPBOX_TOKEN or DATA_URL');
}

mapboxgl.accessToken = cfg.MAPBOX_TOKEN;

const DATA_URL = cfg.DATA_URL;

let allFeatures = [];

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [10, 50],
  zoom: 2
});

map.on('load', async () => {
  const res = await fetch(DATA_URL);
  const geojson = await res.json();

  allFeatures = geojson.features || [];

  map.addSource('stones', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'stones-layer',
    type: 'circle',
    source: 'stones',
    paint: {
      'circle-radius': 6,
      'circle-color': [
        'case',
        ['==', ['get', 'missing_info'], true],
        '#e63946',
        '#1d3557'
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff'
    }
  });

  populateFilters();
  applyFilters();
});

map.on('click', 'stones-layer', (e) => {
  const f = e.features[0];
  const p = f.properties || {};
  const photos = getPhotos(p);

  let html = `
    <div class="popup-title">${escapeHtml(p.title || 'Bez nosaukuma')}</div>
    <div class="popup-meta">${escapeHtml(p.author || '')} · ${escapeHtml(p.date || '')}</div>
  `;

  if (p.description) {
    html += `<div class="popup-desc">${escapeHtml(p.description)}</div>`;
  }

  if (photos.length) {
    html += `<div class="popup-images">`;
    photos.forEach(url => {
      html += `<img src="${escapeAttr(url)}" loading="lazy" referrerpolicy="no-referrer" />`;
    });
    html += `</div>`;
  }

  if (p.missing_info === true || p.missing_info === 'true') {
    html += `<div class="popup-meta">Nepieciešams papildināt</div>`;
  }

  new mapboxgl.Popup()
    .setLngLat(f.geometry.coordinates)
    .setHTML(html)
    .addTo(map);
});

map.on('mouseenter', 'stones-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'stones-layer', () => { map.getCanvas().style.cursor = ''; });

document.getElementById('filter-author').addEventListener('change', applyFilters);
document.getElementById('filter-year').addEventListener('change', applyFilters);
document.getElementById('filter-missing').addEventListener('change', applyFilters);

function getPhotos(props) {
  const v = props.photos;

  if (Array.isArray(v)) return v.filter(Boolean);
  if (!v) return [];

  const s = String(v).trim();
  if (!s) return [];

  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch (e) {}
  }

  return s
    .split(/\r?\n|\||,/g)
    .map(x => x.trim())
    .filter(Boolean);
}

function populateFilters() {
  const authors = new Set();
  const years = new Set();

  allFeatures.forEach(f => {
    const p = f.properties || {};
    if (p.author) authors.add(p.author);
    if (p.date && String(p.date).length >= 4) years.add(String(p.date).substring(0, 4));
  });

  const authorSelect = document.getElementById('filter-author');
  [...authors].sort().forEach(a => {
    const o = document.createElement('option');
    o.value = a;
    o.textContent = a;
    authorSelect.appendChild(o);
  });

  const yearSelect = document.getElementById('filter-year');
  [...years].sort().forEach(y => {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = y;
    yearSelect.appendChild(o);
  });
}

function applyFilters() {
  if (!map.getSource('stones')) return;

  const author = document.getElementById('filter-author').value;
  const year = document.getElementById('filter-year').value;
  const missing = document.getElementById('filter-missing').checked;

  const filtered = allFeatures.filter(f => {
    const p = f.properties || {};
    if (author && p.author !== author) return false;
    if (year && (!p.date || !String(p.date).startsWith(year))) return false;
    if (missing && p.missing_info !== true && p.missing_info !== 'true') return false;
    return true;
  });

  map.getSource('stones').setData({ type: 'FeatureCollection', features: filtered });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll('`', '&#096;');
}
