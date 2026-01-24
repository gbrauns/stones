const cfg = window.APP_CONFIG || {};
if (!cfg.MAPBOX_TOKEN || !cfg.DATA_URL) {
  alert('Trūkst konfigurācijas. Pārbaudi .env (MAPBOX_TOKEN un DATA_URL).');
  throw new Error('Missing MAPBOX_TOKEN or DATA_URL');
}

mapboxgl.accessToken = cfg.MAPBOX_TOKEN;
const DATA_URL = cfg.DATA_URL;
const REGISTRY_URL = '/data/country_continent_lv.json';
const UNKNOWN_CONTINENT_VALUE = '__UNKNOWN__';
const UNKNOWN_CONTINENT_LABEL = 'Nezināms kontinents';

let allFeatures = [];
let filteredFeatures = [];
let activePopup = null;

// Country/continent registry (server side file)
let registryPairs = [];
let countryToContinent = new Map();      // country -> continent
let continentToCountries = new Map();    // continent -> Set(countries)

// Stats based on current dataset (stones)
let continentCounts = new Map();         // continent label -> count
let unknownCountries = new Set();        // countries that are not in registry mapping (or empty)

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [10, 50],
  zoom: 2
});

map.on('load', async () => {
  // Load registry + geojson in parallel
  const [registryRes, dataRes] = await Promise.all([
    fetch(REGISTRY_URL, { cache: 'force-cache' }),
    fetch(DATA_URL)
  ]);

  if (!registryRes.ok) {
    console.warn('Neizdevās ielādēt reģistru:', REGISTRY_URL, registryRes.status);
  } else {
    try {
      registryPairs = await registryRes.json();
      buildRegistryMaps(registryPairs);
      console.log('[Registry] loaded pairs:', registryPairs.length);
    } catch (e) {
      console.warn('Reģistra JSON nav nolasāms:', e);
    }
  }

  const geojson = await dataRes.json();

  allFeatures = (geojson.features || []).map((f, i) => {
    if (!f.properties) f.properties = {};

    // Stabils UID priekš list click + popup
    const uidBase =
      (f.properties && (f.properties.id || f.properties.title))
        ? String(f.properties.id || f.properties.title)
        : `row_${i}`;
    f.__uid = `${uidBase}__${i}`;

    // Normalizē missing_info uz boolean, lai Mapbox layer krāsa strādā vienādi
    f.properties.missing_info = normalizeBoolean(f.properties.missing_info);

    // Normalizē country (trim)
    if (typeof f.properties.country === 'string') f.properties.country = f.properties.country.trim();

    return f;
  });

  // 2) Kopējais akmeņu skaits pie "Akmeņu karte"
  updateTotalCountBadge(allFeatures.length);

  // 3) Kontinentu skaiti pie filtra opcijām + 1) Nezināms kontinents
  computeContinentStats();

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

document.getElementById('filter-author').addEventListener('change', applyFilters);
document.getElementById('filter-year').addEventListener('change', applyFilters);
document.getElementById('filter-missing').addEventListener('change', applyFilters);
document.getElementById('filter-search').addEventListener('input', applyFilters);

// Continent + country filters
document.getElementById('filter-continent').addEventListener('change', onContinentChange);
document.getElementById('filter-country').addEventListener('change', applyFilters);

function onContinentChange() {
  const continent = document.getElementById('filter-continent').value;

  // Main rule: mainot kontinentu, valsts tiek resetota un pārbūvēts valstu saraksts
  populateCountryFilter(continent);
  document.getElementById('filter-country').value = '';
  applyFilters();
}

function normalizeBoolean(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (v === 1 || v === '1') return true;
  const s = String(v || '').trim().toLowerCase();
  if (!s) return false;
  return s === 'true' || s === 'yes' || s === 'x' || s === 'on';
}

function buildRegistryMaps(pairs) {
  countryToContinent = new Map();
  continentToCountries = new Map();

  if (!Array.isArray(pairs)) return;

  pairs.forEach(item => {
    const country = String(item.country || '').trim();
    const continent = String(item.continent || '').trim();
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

  const authorSelect = document.getElementById('filter-author');
  authorSelect.innerHTML = '<option value="">Visi</option>';
  [...authors].sort((a, b) => String(a).localeCompare(String(b), 'lv')).forEach(a => {
    const o = document.createElement('option');
    o.value = a;
    o.textContent = a;
    authorSelect.appendChild(o);
  });

  const yearSelect = document.getElementById('filter-year');
  yearSelect.innerHTML = '<option value="">Visi</option>';
  [...years].sort().forEach(y => {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = y;
    yearSelect.appendChild(o);
  });

  populateContinentFilter();
  populateCountryFilter(''); // initially all
}

function populateContinentFilter() {
  const continentSelect = document.getElementById('filter-continent');
  continentSelect.innerHTML = '<option value="">Visi</option>';

  // Continents from registry (stable) + counts from dataset
  let continents = [];
  if (continentToCountries && continentToCountries.size) {
    continents = [...continentToCountries.keys()];
  } else {
    // fallback: derive from dataset
    continents = [...continentCounts.keys()].filter(k => k !== UNKNOWN_CONTINENT_LABEL);
  }

  continents
    .sort((a, b) => String(a).localeCompare(String(b), 'lv'))
    .forEach(cont => {
      const count = Number(continentCounts.get(cont) || 0);
      const o = document.createElement('option');
      o.value = cont;
      o.textContent = `${cont} (${count})`;
      continentSelect.appendChild(o);
    });

  // 1) Nezināms kontinents (tikai, ja tādi ir)
  const unknownCount = Number(continentCounts.get(UNKNOWN_CONTINENT_LABEL) || 0);
  if (unknownCount > 0) {
    const o = document.createElement('option');
    o.value = UNKNOWN_CONTINENT_VALUE;
    o.textContent = `${UNKNOWN_CONTINENT_LABEL} (${unknownCount})`;
    continentSelect.appendChild(o);
  }
}

function populateCountryFilter(continent) {
  const countrySelect = document.getElementById('filter-country');
  countrySelect.innerHTML = '<option value="">Visas</option>';

  let countries = [];

  if (continent === UNKNOWN_CONTINENT_VALUE) {
    countries = [...unknownCountries].filter(Boolean);
  } else if (continent && continentToCountries && continentToCountries.has(continent)) {
    countries = [...continentToCountries.get(continent)];
  } else if (countryToContinent && countryToContinent.size) {
    countries = [...countryToContinent.keys()];
  } else {
    // last fallback: derive from features
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
      countrySelect.appendChild(o);
    });
}

function applyFilters() {
  if (!map.getSource('stones')) return;

  const author = document.getElementById('filter-author').value;
  const year = document.getElementById('filter-year').value;
  const missingOnly = document.getElementById('filter-missing').checked;
  const q = String(document.getElementById('filter-search').value || '').trim().toLowerCase();

  const continent = document.getElementById('filter-continent').value;
  const country = document.getElementById('filter-country').value;

  filteredFeatures = allFeatures.filter(f => {
    const p = f.properties || {};

    if (author && p.author !== author) return false;
    if (year && (!p.date || !String(p.date).startsWith(year))) return false;
    if (missingOnly && !normalizeBoolean(p.missing_info)) return false;

    const featureCountry = String(p.country || '').trim();

    if (country) {
      if (featureCountry !== country) return false;
    } else if (continent) {
      if (continent === UNKNOWN_CONTINENT_VALUE) {
        const featureContinent = countryToContinent.get(featureCountry);
        if (featureContinent) return false; // tikai tie, kam nav mapping
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
}

function updateTotalCountBadge(n) {
  const el = document.getElementById('total-count');
  if (!el) return;
  el.textContent = String(Number(n) || 0);
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

function renderObjectsList() {
  const box = document.getElementById('objects-list');
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
      const found = filteredFeatures.find(x => x.__uid === f.__uid) || allFeatures.find(x => x.__uid === f.__uid);
      if (!found) return;

      const coords = found.geometry.coordinates;
      map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 7), speed: 1.2 });

      setTimeout(() => {
        openFeaturePopup(found, coords);
      }, 250);
    });

    box.appendChild(item);
  });
}

function openFeaturePopup(feature, lngLat) {
  const f = feature;
  const p = f.properties || {};
  const photos = getPhotos(p);
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
        <img src="${escapeAttr(photos[0])}" loading="lazy" referrerpolicy="no-referrer" />
        <button class="slide-btn slide-prev" type="button" aria-label="Iepriekšējā bilde">
          ${iconChevronLeft()}
        </button>
        <button class="slide-btn slide-next" type="button" aria-label="Nākamā bilde">
          ${iconChevronRight()}
        </button>
        <div class="slide-counter">1 / ${photos.length}</div>
      </div>
    `;
  }

  let html = `
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
    const btnPrev = root.querySelector('.slide-prev');
    const btnNext = root.querySelector('.slide-next');
    const counter = root.querySelector('.slide-counter');

    let i = 0;

    const update = () => {
      if (!img) return;
      img.src = photos[i];
      if (counter) counter.textContent = `${i + 1} / ${photos.length}`;

      const hideNav = photos.length <= 1;
      if (btnPrev) btnPrev.classList.toggle('slide-hidden', hideNav);
      if (btnNext) btnNext.classList.toggle('slide-hidden', hideNav);
      if (counter) counter.classList.toggle('slide-hidden', hideNav);
    };

    const prev = () => { i = (i - 1 + photos.length) % photos.length; update(); };
    const next = () => { i = (i + 1) % photos.length; update(); };

    if (btnPrev) btnPrev.addEventListener('click', (ev) => { ev.stopPropagation(); prev(); });
    if (btnNext) btnNext.addEventListener('click', (ev) => { ev.stopPropagation(); next(); });

    const onKey = (ev) => {
      if (ev.key === 'ArrowLeft') prev();
      if (ev.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey, { passive: true });

    const popupEl = root.closest('.mapboxgl-popup');
    if (popupEl) {
      const obs = new MutationObserver(() => {
        if (!document.body.contains(popupEl)) {
          document.removeEventListener('keydown', onKey);
          obs.disconnect();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }

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

function iconChevronLeft() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function iconChevronRight() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
