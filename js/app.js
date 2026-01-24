const cfg = window.APP_CONFIG || {};
if (!cfg.MAPBOX_TOKEN || !cfg.DATA_URL) {
  alert('Trūkst konfigurācijas. Pārbaudi config.php (MAPBOX_TOKEN un DATA_URL).');
  throw new Error('Missing MAPBOX_TOKEN or DATA_URL');
}

mapboxgl.accessToken = cfg.MAPBOX_TOKEN;

const DATA_URL = cfg.DATA_URL;
const REGISTRY_URL = '/data/country_continent_lv.json';
const COUNTRIES_GEOJSON_URL = '/data/countries_simplified.geojson';

const UNKNOWN_CONTINENT_VALUE = '__UNKNOWN__';
const UNKNOWN_CONTINENT_LABEL = 'Nezināms kontinents';

let allFeatures = [];
let filteredFeatures = [];
let activePopup = null;

let registryPairs = [];
let countryToContinent = new Map();
let continentToCountries = new Map();
let countryToIsoA2 = new Map(); // LV nosaukums -> ISO A2

let continentCounts = new Map();
let unknownCountries = new Set();

// valstis iekrāsošanai
let activeIsoSet = new Set(); // ISO A2, kuriem count > 0 (filtered)
let countriesFeatureIds = new Set(); // ISO A2, kas eksistē poligonu failā

const els = {
  totalCount: document.getElementById('total-count'),
  objectsList: document.getElementById('objects-list'),
  search: document.getElementById('filter-search'),

  modal: document.getElementById('filtersModal'),
  backdrop: document.getElementById('filtersBackdrop'),
  openFilters: document.getElementById('openFilters'),
  closeFilters: document.getElementById('closeFilters'),
  resetFilters: document.getElementById('resetFilters'),
  applyFiltersBtn: document.getElementById('applyFiltersBtn'),

  author: document.getElementById('filter-author'),
  year: document.getElementById('filter-year'),
  continent: document.getElementById('filter-continent'),
  country: document.getElementById('filter-country')
};

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [10, 50],
  zoom: 2
});

map.on('load', async () => {
  initModal();

  const [registryRes, dataRes] = await Promise.all([
    fetch(REGISTRY_URL, { cache: 'force-cache' }).catch(() => null),
    fetch(DATA_URL).catch(() => null)
  ]);

  if (registryRes && registryRes.ok) {
    try {
      registryPairs = await registryRes.json();
      buildRegistryMaps(registryPairs);
      console.log('[Registry] pairs:', registryPairs.length, 'iso mapped:', countryToIsoA2.size);
    } catch (e) {
      console.warn('[Registry] JSON parse error:', e);
    }
  } else {
    console.warn('[Registry] failed to load:', REGISTRY_URL);
  }

  if (!dataRes || !dataRes.ok) {
    alert('Neizdevās ielādēt datus (GeoJSON).');
    return;
  }

  const geojson = await dataRes.json();

  allFeatures = (geojson.features || []).map((f, i) => {
    if (!f.properties) f.properties = {};

    const uidBase = (f.properties.id || f.properties.title)
      ? String(f.properties.id || f.properties.title)
      : `row_${i}`;
    f.__uid = `${uidBase}__${i}`;

    f.properties.missing_info = normalizeBoolean(f.properties.missing_info);

    if (typeof f.properties.country === 'string') {
      f.properties.country = f.properties.country.trim();
    }

    if (typeof f.properties.photos === 'string') {
      f.properties.photos = normalizePhotoField(f.properties.photos);
    } else if (Array.isArray(f.properties.photos)) {
      f.properties.photos = f.properties.photos.map(normalizePhotoUrl);
    }

    return f;
  });

  updateTotalCountBadge(allFeatures.length);
  computeContinentStats();

  // 1) Countries polygons
  await addCountriesLayer();

  // 2) Stones points
  map.addSource('stones', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: allFeatures }
  });

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

  // Pārliek countries zem punktiem, ja vajag
  tryMoveCountriesBelowStones();

  populateFilters();
  applyFilters();
});

map.on('click', 'stones-layer', (e) => {
  const f = e.features && e.features[0];
  if (!f) return;
  openFeaturePopup(f, f.geometry.coordinates);
});

map.on('mouseenter', 'stones-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'stones-layer', () => { map.getCanvas().style.cursor = ''; });

els.search.addEventListener('input', () => applyFilters());
els.continent.addEventListener('change', () => onContinentChange());

els.applyFiltersBtn.addEventListener('click', () => {
  applyFilters();
  closeModal();
});

els.resetFilters.addEventListener('click', () => {
  resetAllFilters();
  applyFilters();
  closeModal();
});

function initModal() {
  els.openFilters.addEventListener('click', () => openModal());
  els.closeFilters.addEventListener('click', () => closeModal());
  els.backdrop.addEventListener('click', () => closeModal());

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && els.modal.classList.contains('is-open')) {
      closeModal();
    }
  });
}

function openModal() {
  els.modal.classList.add('is-open');
  els.modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  els.modal.classList.remove('is-open');
  els.modal.setAttribute('aria-hidden', 'true');
}

function resetAllFilters() {
  els.author.value = '';
  els.year.value = '';
  els.continent.value = '';
  populateCountryFilter('');
  els.country.value = '';
  els.search.value = '';
}

function onContinentChange() {
  const continent = els.continent.value;
  populateCountryFilter(continent);
  els.country.value = '';
}

function normalizeBoolean(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (v === 1 || v === '1') return true;
  const s = String(v || '').trim().toLowerCase();
  if (!s) return false;
  return s === 'true' || s === 'yes' || s === 'x' || s === 'on';
}

function normalizePhotoField(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  const parts = s.split(/\r?\n|\||,/g).map(x => x.trim()).filter(Boolean);
  return parts.map(normalizePhotoUrl).join('|');
}

function normalizePhotoUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('http://')) return 'https://' + u.slice('http://'.length);
  return u;
}

function buildRegistryMaps(pairs) {
  countryToContinent = new Map();
  continentToCountries = new Map();
  countryToIsoA2 = new Map();

  if (!Array.isArray(pairs)) return;

  pairs.forEach(item => {
    const country = String(item.country || '').trim();
    const continent = String(item.continent || '').trim();
    const isoA2 = String(item.iso_a2 || '').trim().toUpperCase();

    if (country && isoA2) countryToIsoA2.set(country, isoA2);

    if (!country || !continent) return;

    countryToContinent.set(country, continent);

    if (!continentToCountries.has(continent)) {
      continentToCountries.set(continent, new Set());
    }
    continentToCountries.get(continent).add(country);
  });
}

function populateFilters() {
  const authors = new Set();
  const years = new Set();

  allFeatures.forEach(f => {
    const p = f.properties || {};
    if (p.author) authors.add(p.author);
    if (p.date && String(p.date).length >= 4) years.add(String(p.date).substring(0, 4));
  });

  els.author.innerHTML = '<option value="">Visi</option>';
  [...authors].sort((a, b) => String(a).localeCompare(String(b), 'lv')).forEach(a => {
    const o = document.createElement('option');
    o.value = a;
    o.textContent = a;
    els.author.appendChild(o);
  });

  els.year.innerHTML = '<option value="">Visi</option>';
  [...years].sort().forEach(y => {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = y;
    els.year.appendChild(o);
  });

  populateContinentFilter();
  populateCountryFilter('');
}

function populateContinentFilter() {
  els.continent.innerHTML = '<option value="">Visi</option>';

  let continents = [];
  if (continentToCountries && continentToCountries.size) {
    continents = [...continentToCountries.keys()];
  } else {
    continents = [...continentCounts.keys()].filter(k => k !== UNKNOWN_CONTINENT_LABEL);
  }

  continents
    .sort((a, b) => String(a).localeCompare(String(b), 'lv'))
    .forEach(cont => {
      const count = Number(continentCounts.get(cont) || 0);
      const o = document.createElement('option');
      o.value = cont;
      o.textContent = `${cont} (${count})`;
      els.continent.appendChild(o);
    });

  const unknownCount = Number(continentCounts.get(UNKNOWN_CONTINENT_LABEL) || 0);
  if (unknownCount > 0) {
    const o = document.createElement('option');
    o.value = UNKNOWN_CONTINENT_VALUE;
    o.textContent = `${UNKNOWN_CONTINENT_LABEL} (${unknownCount})`;
    els.continent.appendChild(o);
  }
}

function populateCountryFilter(continent) {
  els.country.innerHTML = '<option value="">Visas</option>';

  let countries = [];

  if (continent === UNKNOWN_CONTINENT_VALUE) {
    countries = [...unknownCountries].filter(Boolean);
  } else if (continent && continentToCountries && continentToCountries.has(continent)) {
    countries = [...continentToCountries.get(continent)];
  } else if (countryToContinent && countryToContinent.size) {
    countries = [...countryToContinent.keys()];
  } else {
    const tmp = new Set();
    allFeatures.forEach(f => {
      const c = String((f.properties && f.properties.country) || '').trim();
      if (c) tmp.add(c);
    });
    countries = [...tmp];
  }

  countries
    .sort((a, b) => String(a).localeCompare(String(b), 'lv'))
    .forEach(c => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      els.country.appendChild(o);
    });
}

function applyFilters() {
  if (!map.getSource('stones')) return;

  const author = els.author.value;
  const year = els.year.value;
  const continent = els.continent.value;
  const country = els.country.value;
  const q = String(els.search.value || '').trim().toLowerCase();

  filteredFeatures = allFeatures.filter(f => {
    const p = f.properties || {};

    if (author && p.author !== author) return false;
    if (year && (!p.date || !String(p.date).startsWith(year))) return false;

    const featureCountry = String(p.country || '').trim();

    if (country) {
      if (featureCountry !== country) return false;
    } else if (continent) {
      if (continent === UNKNOWN_CONTINENT_VALUE) {
        const featureContinent = countryToContinent.get(featureCountry);
        if (featureContinent) return false;
      } else {
        const featureContinent = countryToContinent.get(featureCountry);
        if (featureContinent !== continent) return false;
      }
    }

    if (q) {
      const hay = `${p.title || ''} ${p.author || ''} ${p.description || ''} ${p.country || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });

  map.getSource('stones').setData({
    type: 'FeatureCollection',
    features: filteredFeatures
  });

  renderObjectsList();
  updateActiveCountries();
}

function updateTotalCountBadge(n) {
  if (!els.totalCount) return;
  els.totalCount.textContent = String(Number(n) || 0);
}

function computeContinentStats() {
  continentCounts = new Map();
  unknownCountries = new Set();

  allFeatures.forEach(f => {
    const p = f.properties || {};
    const country = String(p.country || '').trim();
    const cont = countryToContinent.get(country);

    if (cont) {
      continentCounts.set(cont, (continentCounts.get(cont) || 0) + 1);
    } else {
      continentCounts.set(UNKNOWN_CONTINENT_LABEL, (continentCounts.get(UNKNOWN_CONTINENT_LABEL) || 0) + 1);
      if (country) unknownCountries.add(country);
    }
  });
}

// atrod ISO A2 lauku dažādos variantos
function getIsoA2FromProperties(props) {
  if (!props) return '';
  const candidates = [
    'ISO_A2',
    'iso_a2',
    'iso2',
    'ISO2',
    'country_code',
    'COUNTRY_CODE',
    'ADM0_A3', // nav A2, bet atstāsim debugam
    'ISO_A3'   // nav A2, bet atstāsim debugam
  ];

  for (const k of candidates) {
    if (props[k]) {
      return String(props[k]).trim().toUpperCase();
    }
  }
  return '';
}

async function addCountriesLayer() {
  const res = await fetch(COUNTRIES_GEOJSON_URL, { cache: 'force-cache' }).catch(() => null);
  if (!res || !res.ok) {
    console.warn('[Countries] failed to load:', COUNTRIES_GEOJSON_URL);
    return;
  }

  const countriesGeojson = await res.json();

  countriesFeatureIds = new Set();

  if (countriesGeojson && Array.isArray(countriesGeojson.features)) {
    countriesGeojson.features.forEach(ft => {
      const iso = getIsoA2FromProperties(ft.properties);
      if (iso && iso.length === 2) {
        ft.id = iso;
        countriesFeatureIds.add(iso);
      }
    });
  }

  console.log('[Countries] features:', (countriesGeojson.features || []).length, 'with ISO_A2 ids:', countriesFeatureIds.size);

  if (map.getSource('countries')) return;

  map.addSource('countries', {
    type: 'geojson',
    data: countriesGeojson
  });

  map.addLayer({
    id: 'countries-fill',
    type: 'fill',
    source: 'countries',
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'active'], false],
        '#2b6cb0',
        'rgba(0,0,0,0)'
      ],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'active'], false],
        0.25,
        0
      ]
    }
  });

  map.addLayer({
    id: 'countries-outline',
    type: 'line',
    source: 'countries',
    paint: {
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'active'], false],
        1.5,
        0.5
      ],
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'active'], false],
        '#2b6cb0',
        'rgba(0,0,0,0.25)'
      ]
    }
  });
}

function tryMoveCountriesBelowStones() {
  try {
    if (map.getLayer('countries-fill') && map.getLayer('stones-layer')) {
      map.moveLayer('countries-fill', 'stones-layer');
    }
    if (map.getLayer('countries-outline') && map.getLayer('stones-layer')) {
      map.moveLayer('countries-outline', 'stones-layer');
    }
  } catch (e) {}
}

function updateActiveCountries() {
  if (!map.getSource('countries')) return;

  const prev = new Set(activeIsoSet);
  activeIsoSet = new Set();

  const isoCounts = new Map();

  let missingIsoInRegistry = 0;
  let missingIsoInPolygons = 0;

  filteredFeatures.forEach(f => {
    const p = f.properties || {};
    const countryLv = String(p.country || '').trim();
    if (!countryLv) return;

    const iso = countryToIsoA2.get(countryLv);
    if (!iso) {
      missingIsoInRegistry++;
      return;
    }

    const isoUp = String(iso).toUpperCase();

    if (!countriesFeatureIds.has(isoUp)) {
      missingIsoInPolygons++;
      return;
    }

    isoCounts.set(isoUp, (isoCounts.get(isoUp) || 0) + 1);
    activeIsoSet.add(isoUp);
  });

  console.log('[Countries] active ISO after filter:', activeIsoSet.size, 'missing in registry:', missingIsoInRegistry, 'missing in polygons:', missingIsoInPolygons);

  prev.forEach(iso => {
    if (!activeIsoSet.has(iso)) {
      try {
        map.setFeatureState({ source: 'countries', id: iso }, { active: false, count: 0 });
      } catch (e) {}
    }
  });

  activeIsoSet.forEach(iso => {
    try {
      map.setFeatureState(
        { source: 'countries', id: iso },
        { active: true, count: isoCounts.get(iso) || 0 }
      );
    } catch (e) {}
  });
}

function renderObjectsList() {
  const box = els.objectsList;
  box.innerHTML = '';

  if (!filteredFeatures.length) {
    const empty = document.createElement('div');
    empty.className = 'obj-empty';
    empty.textContent = 'Nav atrasts neviens objekts pēc šiem filtriem.';
    box.appendChild(empty);
    return;
  }

  const sorted = [...filteredFeatures].sort((a, b) => {
    const pa = a.properties || {};
    const pb = b.properties || {};
    const ta = String(pa.title || pa.id || '').toLowerCase();
    const tb = String(pb.title || pb.id || '').toLowerCase();
    return ta.localeCompare(tb, 'lv');
  });

  sorted.forEach((f) => {
    const p = f.properties || {};
    const missing = normalizeBoolean(p.missing_info);

    const title = getTitleWithCountry(p);
    const sub = `${p.author || ''} · ${formatDateDDMMMYYYY(p.date)}`.trim();

    const item = document.createElement('div');
    item.className = 'obj-item';
    item.dataset.uid = f.__uid;

    const dot = document.createElement('div');
    dot.className = `obj-dot ${missing ? 'missing' : 'ok'}`;

    const main = document.createElement('div');
    main.className = 'obj-main';

    const t = document.createElement('div');
    t.className = 'obj-title';
    t.textContent = title;

    const s = document.createElement('div');
    s.className = 'obj-sub';
    s.textContent = sub;

    main.appendChild(t);
    main.appendChild(s);

    item.appendChild(dot);
    item.appendChild(main);

    item.addEventListener('click', () => {
      const coords = f.geometry.coordinates;
      map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 7), speed: 1.2 });

      setTimeout(() => {
        openFeaturePopup(f, coords);
      }, 250);
    });

    box.appendChild(item);
  });
}

function openFeaturePopup(feature, lngLat) {
  const p = feature.properties || {};
  const photos = getPhotos(p).map(normalizePhotoUrl);
  const missing = normalizeBoolean(p.missing_info);

  const dateText = formatDateDDMMMYYYY(p.date);
  const titleText = escapeHtml(getTitleWithCountry(p));

  const badge = missing
    ? `<span class="badge-missing">⚠️ missing info</span>`
    : `<span class="badge-ok">✅ ok</span>`;

  const popupId = `sl_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  let slideshowHtml = '';
  if (photos.length) {
    slideshowHtml = `
      <div class="slideshow" id="${popupId}">
        <img src="${escapeAttr(photos[0])}" loading="lazy" />
        <div class="slide-counter">1 / ${photos.length}</div>
      </div>
    `;
  }

  const html = `
    <div class="popup-wrap">
      <div class="popup-title">
        <span>${titleText}</span>
        ${badge}
      </div>
      <div class="popup-meta">
        <span class="popup-chip">👤 ${escapeHtml(p.author || '')}</span>
        <span class="popup-chip">📅 ${escapeHtml(dateText)}</span>
      </div>

      ${slideshowHtml}

      ${p.description ? `<div class="popup-desc">${escapeHtml(p.description)}</div>` : ''}
    </div>
  `;

  if (activePopup) activePopup.remove();

  activePopup = new mapboxgl.Popup({ closeOnClick: true })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);

  if (photos.length) {
    setupSlideshow(popupId, photos);
  }
}

function getTitleWithCountry(p) {
  const base = getDisplayTitle(p);
  const country = String(p.country || '').trim();
  return country ? `${base} (${country})` : base;
}

function getDisplayTitle(p) {
  const t = String(p.title || '').trim();
  if (t) return t;
  const id = String(p.id || '').trim();
  if (id) return id;
  return 'Bez nosaukuma';
}

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

  return s.split(/\r?\n|\||,/g).map(x => x.trim()).filter(Boolean);
}

function setupSlideshow(rootId, photos) {
  setTimeout(() => {
    const root = document.getElementById(rootId);
    if (!root) return;

    const img = root.querySelector('img');
    const counter = root.querySelector('.slide-counter');

    let i = 0;

    const update = () => {
      if (!img) return;
      img.src = photos[i];
      if (counter) counter.textContent = `${i + 1} / ${photos.length}`;
      if (counter) counter.classList.toggle('slide-hidden', photos.length <= 1);
    };

    let startX = 0;
    let startY = 0;

    const onTouchStart = (ev) => {
      const t = ev.touches && ev.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchEnd = (ev) => {
      const t = ev.changedTouches && ev.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (Math.abs(dy) > Math.abs(dx)) return;

      if (dx < -30) { i = (i + 1) % photos.length; update(); }
      if (dx > 30) { i = (i - 1 + photos.length) % photos.length; update(); }
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });

    update();
  }, 0);
}

function formatDateDDMMMYYYY(s) {
  if (!s) return '';
  const str = String(s).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return str;

  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jūn', 'Jūl', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  const mon = months[mm - 1] || String(mm).padStart(2, '0');

  return `${String(dd).padStart(2, '0')}.${mon}.${yyyy}`;
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
