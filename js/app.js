const cfg = window.APP_CONFIG || {};
if (!cfg.MAPBOX_TOKEN || !cfg.DATA_URL) {
  alert('Trūkst konfigurācijas. Pārbaudi config.php (MAPBOX_TOKEN un DATA_URL).');
  throw new Error('Missing MAPBOX_TOKEN or DATA_URL');
}

mapboxgl.accessToken = cfg.MAPBOX_TOKEN;

const DATA_URL = cfg.DATA_URL;
const REGISTRY_URL = '/data/country_continent_lv.json';
const COUNTRIES_GEOJSON_URL = '/data/countries_simplified.geojson.json';
const VERSION_URL = '/version.json';

const UNKNOWN_CONTINENT_VALUE = '__UNKNOWN__';
const UNKNOWN_CONTINENT_LABEL = 'Nezināms kontinents';

let allFeatures = [];
let filteredFeatures = [];
let activePopup = null;

// Lazy loading state
let displayedItemsCount = 50;
const ITEMS_PER_PAGE = 50;

let registryPairs = [];
let countryToContinent = new Map();
let continentToCountries = new Map();
let countryToIsoA2 = new Map(); // LV nosaukums -> ISO A2

let continentCounts = new Map();
let unknownCountries = new Set();

// valstis iekrāsošanai
let activeIsoSet = new Set(); // ISO A2, kuriem count > 0 (no allFeatures)
let filteredIsoSet = new Set(); // ISO A2, kuriem count > 0 (no filteredFeatures)
let countriesFeatureIds = new Set(); // ISO A2, kas eksistē poligonu failā
let highlightedCountryIso = null; // Pašlaik highlighted valsts (popup atvērts)

const els = {
  loader: document.getElementById('loader'),
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
  country: document.getElementById('filter-country'),

  versionNumber: document.getElementById('version-number'),

  sidebar: document.getElementById('sidebar'),
  mapContainer: document.getElementById('map'),

  // Pull to refresh
  pullToRefreshIndicator: document.getElementById('pull-to-refresh-indicator'),

  // Mobile controls
  mobileListBtn: document.getElementById('mobileListBtn'),
  mobileFiltersBtn: document.getElementById('mobileFiltersBtn'),
  mobileTotalCount: document.getElementById('mobile-total-count'),
  mobileZoomIn: document.getElementById('mobileZoomIn'),
  mobileZoomOut: document.getElementById('mobileZoomOut'),
  mobileVersion: document.getElementById('mobile-version-number'),

  // Mobile overlays
  mobileListOverlay: document.getElementById('mobileListOverlay'),
  closeMobileList: document.getElementById('closeMobileList'),
  mobileFilterSearch: document.getElementById('mobile-filter-search'),
  mobileObjectsList: document.getElementById('mobile-objects-list'),
  mobileListCount: document.getElementById('mobile-list-count'),
  mobilePullToRefresh: document.getElementById('mobile-pull-to-refresh-indicator'),

  mobileFiltersOverlay: document.getElementById('mobileFiltersOverlay'),
  closeMobileFilters: document.getElementById('closeMobileFilters'),
  mobileFilterAuthor: document.getElementById('mobile-filter-author'),
  mobileFilterYear: document.getElementById('mobile-filter-year'),
  mobileFilterContinent: document.getElementById('mobile-filter-continent'),
  mobileFilterCountry: document.getElementById('mobile-filter-country'),
  mobileResetFilters: document.getElementById('mobileResetFilters'),
  mobileApplyFilters: document.getElementById('mobileApplyFilters')
};

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [10, 50],
  zoom: 2
});

map.on('load', async () => {
  initModal();
  initMobileControls();
  initPullToRefresh();
  initDarkMode();
  loadVersion();

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
    f.__index = i; // Vienkāršs index hash veidošanai
    f.properties.__index = i; // Saglabā arī properties, lai Mapbox to nezaudē

    f.properties.missing_info = normalizeBoolean(f.properties.missing_info);

    if (typeof f.properties.country === 'string') {
      f.properties.country = f.properties.country.trim();
    }

    if (typeof f.properties.photos === 'string') {
      f.properties.photos = normalizePhotoField(f.properties.photos);
    } else if (Array.isArray(f.properties.photos)) {
      f.properties.photos = f.properties.photos.map(normalizePhotoUrl);
    }

    // Normalizējam arī videos lauku (ja eksistē)
    if (typeof f.properties.videos === 'string') {
      f.properties.videos = normalizePhotoField(f.properties.videos);
    } else if (Array.isArray(f.properties.videos)) {
      f.properties.videos = f.properties.videos.map(normalizePhotoUrl);
    }

    return f;
  });

  updateTotalCountBadge(allFeatures.length);
  computeContinentStats();

  // 1) Countries polygons
  await addCountriesLayer();

  // 2) Stones points with clustering
  map.addSource('stones', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: allFeatures },
    cluster: true,
    clusterMaxZoom: 14, // Maksimālais zoom, kurā darbojas clustering
    clusterRadius: 50 // Radius pikseļos
  });

  // Cluster apļi
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'stones',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step',
        ['get', 'point_count'],
        '#51bbd6', // < 10 punkti
        10,
        '#f1f075', // 10-29 punkti
        30,
        '#f28cb1'  // 30+ punkti
      ],
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        20,  // < 10 punkti
        10,
        30,  // 10-29 punkti
        30,
        40   // 30+ punkti
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff'
    }
  });

  // Cluster cipari
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'stones',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 14
    },
    paint: {
      'text-color': '#ffffff'
    }
  });

  // Atsevišķi punkti (ne-clustered)
  map.addLayer({
    id: 'stones-layer',
    type: 'circle',
    source: 'stones',
    filter: ['!', ['has', 'point_count']], // Tikai ne-clustered punkti
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

  // Iekrāso valstis pēc allFeatures (tikai vienreiz)
  updateActiveCountries();

  // Deep linking - ja URL satur hash, atver atbilstošo objektu
  openPopupFromHash();

  // Paslēpj loader, kad viss ir ielādēts
  hideLoader();
});

// Click uz cluster - zoom in
map.on('click', 'clusters', (e) => {
  const features = map.queryRenderedFeatures(e.point, {
    layers: ['clusters']
  });
  const clusterId = features[0].properties.cluster_id;
  map.getSource('stones').getClusterExpansionZoom(
    clusterId,
    (err, zoom) => {
      if (err) return;
      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom: zoom
      });
    }
  );
});

// Click uz atsevišķa punkta - atver popup
map.on('click', 'stones-layer', (e) => {
  const f = e.features && e.features[0];
  if (!f) return;
  openFeaturePopup(f, f.geometry.coordinates);
});

// Cursor styles
map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
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

  // Swipe-to-close for mobile
  initModalSwipe();
}

async function reloadMapLayers() {
  console.log('[Map] Reloading layers after style change');

  // Re-add countries layer
  await addCountriesLayer();

  // Re-add stones source with clustering
  if (!map.getSource('stones')) {
    map.addSource('stones', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: filteredFeatures.length > 0 ? filteredFeatures : allFeatures },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });
  }

  // Re-add cluster circles layer
  if (!map.getLayer('clusters')) {
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'stones',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#51bbd6',
          10,
          '#f1f075',
          30,
          '#f28cb1'
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          20,
          10,
          30,
          30,
          40
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });
  }

  // Re-add cluster count layer
  if (!map.getLayer('cluster-count')) {
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'stones',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 14
      },
      paint: {
        'text-color': '#ffffff'
      }
    });
  }

  // Re-add individual stones layer
  if (!map.getLayer('stones-layer')) {
    map.addLayer({
      id: 'stones-layer',
      type: 'circle',
      source: 'stones',
      filter: ['!', ['has', 'point_count']],
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
  }

  // Move countries layer below stones
  tryMoveCountriesBelowStones();

  // Restore country coloring
  updateActiveCountries();
  updateFilteredCountries();

  console.log('[Map] Layers reloaded successfully');
}

function initDarkMode() {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;

  // Check for saved theme preference or default to system preference
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', theme);
  toggle.textContent = theme === 'dark' ? '☀️' : '🌙';

  // Update Mapbox style
  if (theme === 'dark') {
    map.setStyle('mapbox://styles/mapbox/dark-v11');
    // Re-add sources and layers after style loads
    map.once('style.load', () => {
      console.log('[Dark Mode] Initial dark style loaded, re-adding layers');
      reloadMapLayers();
    });
  }

  toggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    toggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';

    // Update Mapbox style and reload layers
    const newStyle = newTheme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';
    map.setStyle(newStyle);

    // Re-add sources and layers after style loads
    map.once('style.load', () => {
      console.log('[Dark Mode] Style loaded, re-adding layers');
      reloadMapLayers();
    });

    // Haptic feedback
    if (window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
  });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      const newTheme = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      toggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';

      const newStyle = newTheme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';
      map.setStyle(newStyle);

      // Re-add sources and layers after style loads
      map.once('style.load', () => {
        console.log('[Dark Mode] System theme changed, re-adding layers');
        reloadMapLayers();
      });
    }
  });
}

function initModalSwipe() {
  const sheet = document.querySelector('.modal-sheet');
  if (!sheet) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  const onTouchStart = (e) => {
    if (!els.modal.classList.contains('is-open')) return;

    const touch = e.touches[0];
    startY = touch.clientY;
    currentY = startY;
    isDragging = true;
    sheet.classList.add('swiping');
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;

    const touch = e.touches[0];
    currentY = touch.clientY;
    const deltaY = currentY - startY;

    // Only allow downward swipes
    if (deltaY > 0) {
      e.preventDefault();
      sheet.style.transform = `translateX(-50%) translateY(${deltaY}px)`;
    }
  };

  const onTouchEnd = () => {
    if (!isDragging) return;

    const deltaY = currentY - startY;
    sheet.classList.remove('swiping');

    // If swiped down more than 100px, close modal
    if (deltaY > 100) {
      closeModal();

      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(15);
      }
    }

    // Reset transform
    sheet.style.transform = 'translateX(-50%)';
    isDragging = false;
  };

  sheet.addEventListener('touchstart', onTouchStart, { passive: false });
  sheet.addEventListener('touchmove', onTouchMove, { passive: false });
  sheet.addEventListener('touchend', onTouchEnd);
  sheet.addEventListener('touchcancel', onTouchEnd);
}

function initMobileControls() {
  console.log('[Mobile Controls] Initializing');

  // Mobile list button - opens list overlay
  if (els.mobileListBtn) {
    els.mobileListBtn.addEventListener('click', () => {
      console.log('[Mobile] Opening list overlay');
      els.mobileListOverlay.classList.add('active');

      // Sync list content from desktop
      if (els.objectsList && els.mobileObjectsList) {
        els.mobileObjectsList.innerHTML = els.objectsList.innerHTML;

        // Re-attach click listeners to mobile list items
        attachMobileListItemListeners();
      }

      // Sync search value
      if (els.search && els.mobileFilterSearch) {
        els.mobileFilterSearch.value = els.search.value;
      }

      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  }

  // Close mobile list overlay
  if (els.closeMobileList) {
    els.closeMobileList.addEventListener('click', () => {
      console.log('[Mobile] Closing list overlay');
      els.mobileListOverlay.classList.remove('active');

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  }

  // Mobile filters button - opens filters overlay
  if (els.mobileFiltersBtn) {
    els.mobileFiltersBtn.addEventListener('click', () => {
      console.log('[Mobile] Opening filters overlay');
      els.mobileFiltersOverlay.classList.add('active');

      // Sync filter values from desktop
      syncMobileFilters();

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  }

  // Close mobile filters overlay
  if (els.closeMobileFilters) {
    els.closeMobileFilters.addEventListener('click', () => {
      console.log('[Mobile] Closing filters overlay');
      els.mobileFiltersOverlay.classList.remove('active');

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  }

  // Mobile apply filters
  if (els.mobileApplyFilters) {
    els.mobileApplyFilters.addEventListener('click', () => {
      console.log('[Mobile] Applying filters');

      // Copy mobile filter values to desktop filters
      if (els.author && els.mobileFilterAuthor) {
        els.author.value = els.mobileFilterAuthor.value;
      }
      if (els.year && els.mobileFilterYear) {
        els.year.value = els.mobileFilterYear.value;
      }
      if (els.continent && els.mobileFilterContinent) {
        els.continent.value = els.mobileFilterContinent.value;
      }
      if (els.country && els.mobileFilterCountry) {
        els.country.value = els.mobileFilterCountry.value;
      }

      // Apply filters
      applyFilters();

      // Close overlay
      els.mobileFiltersOverlay.classList.remove('active');

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  }

  // Mobile reset filters
  if (els.mobileResetFilters) {
    els.mobileResetFilters.addEventListener('click', () => {
      console.log('[Mobile] Resetting filters');

      // Reset mobile filters
      if (els.mobileFilterAuthor) els.mobileFilterAuthor.value = '';
      if (els.mobileFilterYear) els.mobileFilterYear.value = '';
      if (els.mobileFilterContinent) els.mobileFilterContinent.value = '';
      if (els.mobileFilterCountry) els.mobileFilterCountry.value = '';

      // Reset desktop filters
      if (els.author) els.author.value = '';
      if (els.year) els.year.value = '';
      if (els.continent) els.continent.value = '';
      if (els.country) els.country.value = '';

      // Apply filters
      applyFilters();

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  }

  // Mobile search (sync with desktop)
  if (els.mobileFilterSearch) {
    els.mobileFilterSearch.addEventListener('input', (e) => {
      if (els.search) {
        els.search.value = e.target.value;
        els.search.dispatchEvent(new Event('input'));
      }
    });
  }

  // Mobile continent change (update country filter)
  if (els.mobileFilterContinent) {
    els.mobileFilterContinent.addEventListener('change', () => {
      const continent = els.mobileFilterContinent.value;
      populateCountryFilter(continent);

      // Populate mobile country filter too
      if (els.mobileFilterCountry && els.country) {
        els.mobileFilterCountry.innerHTML = els.country.innerHTML;
        els.mobileFilterCountry.value = '';
      }
    });
  }

  // Mobile zoom controls
  if (els.mobileZoomIn) {
    els.mobileZoomIn.addEventListener('click', () => {
      console.log('[Mobile] Zoom in');
      map.zoomIn();

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  }

  if (els.mobileZoomOut) {
    els.mobileZoomOut.addEventListener('click', () => {
      console.log('[Mobile] Zoom out');
      map.zoomOut();

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  }

  console.log('[Mobile Controls] Initialized');
}

function syncMobileFilters() {
  // Copy desktop filter values to mobile
  if (els.author && els.mobileFilterAuthor) {
    els.mobileFilterAuthor.innerHTML = els.author.innerHTML;
    els.mobileFilterAuthor.value = els.author.value;
  }
  if (els.year && els.mobileFilterYear) {
    els.mobileFilterYear.innerHTML = els.year.innerHTML;
    els.mobileFilterYear.value = els.year.value;
  }
  if (els.continent && els.mobileFilterContinent) {
    els.mobileFilterContinent.innerHTML = els.continent.innerHTML;
    els.mobileFilterContinent.value = els.continent.value;
  }
  if (els.country && els.mobileFilterCountry) {
    els.mobileFilterCountry.innerHTML = els.country.innerHTML;
    els.mobileFilterCountry.value = els.country.value;
  }
}

function attachMobileListItemListeners() {
  if (!els.mobileObjectsList) return;

  const items = els.mobileObjectsList.querySelectorAll('.obj-item');
  items.forEach(item => {
    // Remove existing listener by cloning (avoids duplicate listeners)
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);

    // Add click listener that closes overlay
    newItem.addEventListener('click', () => {
      const uid = newItem.dataset.uid;
      if (!uid) return;

      // Find the feature
      const feature = allFeatures.find(f => f.__uid === uid);
      if (!feature) return;

      const coords = feature.geometry.coordinates;
      map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 7), speed: 1.2 });

      setTimeout(() => {
        openFeaturePopup(feature, coords);
      }, 250);

      // Close mobile list overlay
      if (els.mobileListOverlay) {
        els.mobileListOverlay.classList.remove('active');
      }

      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  });
}

function initPullToRefresh() {
  if (!els.objectsList || !els.pullToRefreshIndicator) return;

  let startY = 0;
  let isPulling = false;
  let isRefreshing = false;

  els.objectsList.addEventListener('touchstart', (e) => {
    if (els.objectsList.scrollTop === 0) {
      startY = e.touches[0].clientY;
      isPulling = true;
    }
  });

  els.objectsList.addEventListener('touchmove', (e) => {
    if (!isPulling || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    if (diff > 0 && els.objectsList.scrollTop === 0) {
      e.preventDefault();
      const pullDistance = Math.min(diff, 100);

      if (pullDistance > 60) {
        els.pullToRefreshIndicator.classList.add('visible');
      }
    }
  });

  els.objectsList.addEventListener('touchend', async () => {
    if (!isPulling || isRefreshing) return;

    if (els.pullToRefreshIndicator.classList.contains('visible')) {
      isRefreshing = true;

      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(20);
      }

      // Reload data
      try {
        const dataRes = await fetch(DATA_URL);
        if (dataRes.ok) {
          const geojson = await dataRes.json();

          allFeatures = (geojson.features || []).map((f, i) => {
            if (!f.properties) f.properties = {};
            const uidBase = (f.properties.id || f.properties.title) ? String(f.properties.id || f.properties.title) : `row_${i}`;
            f.__uid = `${uidBase}__${i}`;
            f.__index = i;
            f.properties.__index = i;
            f.properties.missing_info = normalizeBoolean(f.properties.missing_info);
            if (typeof f.properties.country === 'string') f.properties.country = f.properties.country.trim();
            if (typeof f.properties.photos === 'string') {
              f.properties.photos = normalizePhotoField(f.properties.photos);
            } else if (Array.isArray(f.properties.photos)) {
              f.properties.photos = f.properties.photos.map(normalizePhotoUrl);
            }
            if (typeof f.properties.videos === 'string') {
              f.properties.videos = normalizePhotoField(f.properties.videos);
            } else if (Array.isArray(f.properties.videos)) {
              f.properties.videos = f.properties.videos.map(normalizePhotoUrl);
            }
            return f;
          });

          updateTotalCountBadge(allFeatures.length);
          computeContinentStats();
          applyFilters();

          // Update map source
          map.getSource('stones').setData({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }
      } catch (err) {
        console.error('[Pull-to-refresh] Error:', err);
      }

      // Hide indicator after delay
      setTimeout(() => {
        els.pullToRefreshIndicator.classList.remove('visible');
        isRefreshing = false;
      }, 500);
    } else {
      els.pullToRefreshIndicator.classList.remove('visible');
    }

    isPulling = false;
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

  // Show skeleton loaders
  showSkeletonLoaders();

  // Use setTimeout to show loading state
  setTimeout(() => {
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
    updateFilteredCountries();
  }, 100);
}

function updateTotalCountBadge(n) {
  const count = String(Number(n) || 0);
  if (els.totalCount) {
    els.totalCount.textContent = count;
  }
  if (els.mobileTotalCount) {
    els.mobileTotalCount.textContent = count;
  }
  if (els.mobileListCount) {
    els.mobileListCount.textContent = count;
  }
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
        countriesFeatureIds.add(iso);
      }
    });
  }

  console.log('[Countries] features:', (countriesGeojson.features || []).length, 'with ISO_A2 ids:', countriesFeatureIds.size);

  if (map.getSource('countries')) return;

  // Izmanto promoteId, lai ISO_A2 property tiktu izmantots kā feature ID
  map.addSource('countries', {
    type: 'geojson',
    data: countriesGeojson,
    promoteId: 'ISO_A2'
  });

  map.addLayer({
    id: 'countries-fill',
    type: 'fill',
    source: 'countries',
    paint: {
      'fill-color': [
        'case',
        // Highlighted valsts (popup atvērts) - gaišāka
        ['boolean', ['feature-state', 'highlighted'], false],
        '#4a90e2',
        // Aktīva valsts (ir objekti)
        ['boolean', ['feature-state', 'active'], false],
        '#2b6cb0',
        // Nav aktīva
        'rgba(0,0,0,0)'
      ],
      'fill-opacity': [
        'case',
        // Highlighted valsts - spilgtāka
        ['boolean', ['feature-state', 'highlighted'], false],
        0.5,
        // Aktīva valsts
        ['boolean', ['feature-state', 'active'], false],
        0.25,
        // Nav aktīva
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
        // Highlighted valsts - biezāka līnija
        ['boolean', ['feature-state', 'highlighted'], false],
        2.5,
        // Filtrēta valsts - vidēji bieza
        ['boolean', ['feature-state', 'filtered'], false],
        2,
        // Aktīva valsts
        ['boolean', ['feature-state', 'active'], false],
        1.5,
        // Nav aktīva
        0.5
      ],
      'line-color': [
        'case',
        // Highlighted valsts - spilgtāka zilā
        ['boolean', ['feature-state', 'highlighted'], false],
        '#4a90e2',
        // Filtrēta valsts - oranža (aktīvs filtrējums)
        ['boolean', ['feature-state', 'filtered'], false],
        '#f97316',
        // Aktīva valsts - normāla zilā
        ['boolean', ['feature-state', 'active'], false],
        '#2b6cb0',
        // Nav aktīva
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

  // Izmanto allFeatures, lai valstis būtu iekrāsotas pēc visiem objektiem
  allFeatures.forEach(f => {
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

  console.log('[Countries] active ISO (all features):', activeIsoSet.size, 'missing in registry:', missingIsoInRegistry, 'missing in polygons:', missingIsoInPolygons);

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
      console.log('[Countries] Feature state set:', iso, '-> active');
    } catch (e) {
      console.error('[Countries] Failed to set feature state for:', iso, e);
    }
  });
}

function updateFilteredCountries() {
  if (!map.getSource('countries')) return;

  const prev = new Set(filteredIsoSet);
  filteredIsoSet = new Set();

  // Pārbauda, vai kāds filtrs ir aktīvs
  const hasActiveFilters =
    els.author.value ||
    els.year.value ||
    els.continent.value ||
    els.country.value ||
    (els.search && els.search.value.trim());

  // Ja nav aktīvu filtru, noņem visus filtered states
  if (!hasActiveFilters) {
    console.log('[Countries] no active filters, clearing filtered states');
    prev.forEach(iso => {
      try {
        map.setFeatureState({ source: 'countries', id: iso }, { filtered: false });
      } catch (e) {}
    });
    return;
  }

  // Apkopo ISO kodus no filtrētajiem objektiem
  filteredFeatures.forEach(f => {
    const p = f.properties || {};
    const countryLv = String(p.country || '').trim();
    if (!countryLv) return;

    const iso = countryToIsoA2.get(countryLv);
    if (!iso) return;

    const isoUp = String(iso).toUpperCase();
    if (!countriesFeatureIds.has(isoUp)) return;

    filteredIsoSet.add(isoUp);
  });

  console.log('[Countries] filtered ISO:', filteredIsoSet.size);

  // Noņem filtered state no iepriekšējām
  prev.forEach(iso => {
    if (!filteredIsoSet.has(iso)) {
      try {
        map.setFeatureState({ source: 'countries', id: iso }, { filtered: false });
      } catch (e) {}
    }
  });

  // Pievieno filtered state jaunajām
  filteredIsoSet.forEach(iso => {
    try {
      map.setFeatureState({ source: 'countries', id: iso }, { filtered: true });
    } catch (e) {}
  });
}

function showSkeletonLoaders(count = 5) {
  const box = els.objectsList;
  box.innerHTML = '';
  box.classList.add('list-loading');

  for (let i = 0; i < count; i++) {
    const item = document.createElement('div');
    item.className = 'skeleton-item';

    const dot = document.createElement('div');
    dot.className = 'skeleton-dot skeleton';

    const main = document.createElement('div');
    main.className = 'skeleton-main';

    const title = document.createElement('div');
    title.className = 'skeleton-title skeleton';

    const sub = document.createElement('div');
    sub.className = 'skeleton-sub skeleton';

    main.appendChild(title);
    main.appendChild(sub);

    item.appendChild(dot);
    item.appendChild(main);

    box.appendChild(item);
  }
}

function renderObjectsList(reset = true) {
  const box = els.objectsList;
  box.classList.remove('list-loading');

  if (reset) {
    box.innerHTML = '';
    displayedItemsCount = ITEMS_PER_PAGE;
  }

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

  // Remove existing load more button if present
  const existingLoadMore = box.querySelector('.load-more-btn');
  if (existingLoadMore) {
    existingLoadMore.remove();
  }

  // Render items up to displayedItemsCount
  const itemsToRender = sorted.slice(0, displayedItemsCount);

  itemsToRender.forEach((f) => {
    // Skip if already rendered
    if (box.querySelector(`[data-uid="${f.__uid}"]`)) {
      return;
    }

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

      // Close mobile list overlay if open
      if (els.mobileListOverlay && els.mobileListOverlay.classList.contains('active')) {
        els.mobileListOverlay.classList.remove('active');
      }

      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });

    box.appendChild(item);
  });

  // Add load more button if there are more items
  if (displayedItemsCount < sorted.length) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.textContent = `Ielādēt vairāk (${Math.min(ITEMS_PER_PAGE, sorted.length - displayedItemsCount)} no ${sorted.length - displayedItemsCount})`;
    loadMoreBtn.type = 'button';

    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.classList.add('loading');
      loadMoreBtn.textContent = 'Ielādē...';

      setTimeout(() => {
        displayedItemsCount += ITEMS_PER_PAGE;
        renderObjectsList(false);

        // Haptic feedback
        if (window.navigator.vibrate) {
          window.navigator.vibrate(10);
        }
      }, 200);
    });

    box.appendChild(loadMoreBtn);
  }
}

function slugify(text) {
  const str = String(text || '').trim().toLowerCase();

  // Latviešu diakritisko zīmju aizstāšana
  const map = {
    'ā': 'a', 'č': 'c', 'ē': 'e', 'ģ': 'g', 'ī': 'i',
    'ķ': 'k', 'ļ': 'l', 'ņ': 'n', 'š': 's', 'ū': 'u', 'ž': 'z'
  };

  let result = '';
  for (let char of str) {
    result += map[char] || char;
  }

  return result
    .replace(/[^\w\s-]/g, '') // Noņem visas nederīgās rakstzīmes
    .replace(/\s+/g, '-')      // Atstarpes -> domuzīme
    .replace(/-+/g, '-')       // Vairākas domuzīmes -> viena
    .replace(/^-+|-+$/g, '');  // Noņem domuzīmes no sākuma/beigām
}

function openPopupFromHash() {
  const hash = window.location.hash.slice(1); // Noņem # no sākuma
  if (!hash) return;

  // Meklē objektu, kuram atbilst šis slug (ar vai bez index)
  const feature = allFeatures.find(f => {
    const p = f.properties || {};
    const title = getDisplayTitle(p);
    const slug = slugify(title);

    // Mēģina ar pilno slug (slug-index)
    const uniqueSlug = f.__index !== undefined ? `${slug}-${f.__index}` : slug;

    // Atbalsta gan pilno, gan vienkāršo slug (backward compatibility)
    return uniqueSlug === hash || slug === hash;
  });

  if (!feature) {
    console.log('[Deep link] objekts nav atrasts:', hash);
    return;
  }

  const coords = feature.geometry.coordinates;

  // Fly to objekta koordinātām
  map.flyTo({
    center: coords,
    zoom: 8,
    speed: 1.5
  });

  // Atver popup pēc nelielas pauzes
  setTimeout(() => {
    openFeaturePopup(feature, coords);
  }, 800);
}

function openFeaturePopup(feature, lngLat) {
  const p = feature.properties || {};
  const media = getMediaWithTypes(p);
  const missing = normalizeBoolean(p.missing_info);

  const dateText = formatDateDDMMMYYYY(p.date);
  const titleText = escapeHtml(getTitleWithCountry(p));

  // Highlight valsti
  const countryLv = String(p.country || '').trim();
  const iso = countryToIsoA2.get(countryLv);
  if (iso && countriesFeatureIds.has(iso)) {
    const isoUp = String(iso).toUpperCase();

    // Noņem iepriekšējo highlight
    if (highlightedCountryIso && highlightedCountryIso !== isoUp) {
      try {
        map.setFeatureState(
          { source: 'countries', id: highlightedCountryIso },
          { highlighted: false }
        );
      } catch (e) {}
    }

    // Pievieno jauno highlight
    try {
      map.setFeatureState(
        { source: 'countries', id: isoUp },
        { highlighted: true }
      );
      highlightedCountryIso = isoUp;
    } catch (e) {}
  }

  // Ģenerē un iestata URL hash no nosaukuma
  // Pievienojam feature index, lai atšķirtu dublikātus
  const titleForHash = getDisplayTitle(p);
  const slug = slugify(titleForHash);

  // Atrod feature index (pārbauda vairākās vietās)
  let featureIndex = feature.__index ?? p.__index;

  // Ja nav, meklē pēc __uid (unikāls identifikators)
  if (featureIndex === undefined && feature.__uid) {
    featureIndex = allFeatures.findIndex(f => f.__uid === feature.__uid);
  }

  // Ja joprojām nav, meklē pēc coordinates + title (drošākais)
  if (featureIndex === undefined || featureIndex === -1) {
    if (feature.geometry && feature.geometry.coordinates) {
      const coords = feature.geometry.coordinates;
      featureIndex = allFeatures.findIndex(f => {
        const c = f.geometry && f.geometry.coordinates;
        const sameCoords = c && Math.abs(c[0] - coords[0]) < 0.000001 && Math.abs(c[1] - coords[1]) < 0.000001;
        const sameTitle = getDisplayTitle(f.properties || {}) === titleForHash;
        return sameCoords && sameTitle;
      });
    }
  }

  if (slug && featureIndex !== undefined && featureIndex >= 0) {
    // Pievienojam unikālu index hash beigās
    const uniqueSlug = `${slug}-${featureIndex}`;
    window.location.hash = uniqueSlug;
  } else if (slug) {
    window.location.hash = slug;
  }

  const badge = missing
    ? `<span class="badge-missing">⚠️ trūkst info</span>`
    : `<span class="badge-ok">✓ ok</span>`;

  const popupId = `sl_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  let slideshowHtml = '';
  if (media.length) {
    slideshowHtml = `
      <div class="slideshow" id="${popupId}">
        <button class="slide-nav slide-prev" type="button" aria-label="Iepriekšējais">‹</button>
        <button class="slide-nav slide-next" type="button" aria-label="Nākamais">›</button>
        <div class="slide-counter">1 / ${media.length}</div>
      </div>
    `;
  }

  const html = `
    <div class="popup-wrap">
      <div class="popup-title">
        <span>${titleText}</span>
        <div class="popup-title-actions">
          <button class="back-to-list-btn" type="button" title="Atgriezties uz sarakstu">📋</button>
          <button class="copy-link-btn" type="button" title="Kopēt linku">🔗</button>
          ${badge}
        </div>
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

  activePopup = new mapboxgl.Popup({
    closeOnClick: true,
    maxWidth: '460px'
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);

  // Kad popup tiek aizvērts, noņem highlight
  activePopup.on('close', () => {
    if (highlightedCountryIso) {
      try {
        map.setFeatureState(
          { source: 'countries', id: highlightedCountryIso },
          { highlighted: false }
        );
      } catch (e) {}
      highlightedCountryIso = null;
    }
  });

  if (media.length) {
    setupSlideshow(popupId, media);
  }

  // Copy link un back to list funkcionalitāte
  setTimeout(() => {
    // Back to list button
    const backBtn = document.querySelector('.back-to-list-btn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        // Switch to list tab on mobile
        if (els.mobileTabs) {
          const tabs = els.mobileTabs.querySelectorAll('.mobile-tab');
          tabs.forEach(tab => {
            if (tab.dataset.tab === 'list') {
              tab.click();
            }
          });
        }

        // Scroll to item in list
        const uid = feature.__uid;
        if (uid) {
          setTimeout(() => {
            const item = document.querySelector(`[data-uid="${uid}"]`);
            if (item) {
              item.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Highlight effect
              item.style.background = '#e3f2fd';
              setTimeout(() => {
                item.style.background = '';
              }, 1500);
            }
          }, 300);
        }

        // Haptic feedback
        if (window.navigator.vibrate) {
          window.navigator.vibrate(10);
        }
      });
    }

    // Copy link button
    const copyBtn = document.querySelector('.copy-link-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(window.location.href).then(() => {
          // Vizuāls feedback
          copyBtn.textContent = '✓';
          copyBtn.style.color = '#22c55e';
          setTimeout(() => {
            copyBtn.textContent = '🔗';
            copyBtn.style.color = '';
          }, 1500);

          // Haptic feedback
          if (window.navigator.vibrate) {
            window.navigator.vibrate(10);
          }
        }).catch(() => {
          // Fallback ja clipboard nedarbojas
          copyBtn.textContent = '✗';
          setTimeout(() => {
            copyBtn.textContent = '🔗';
          }, 1500);
        });
      });
    }
  }, 100);
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

function getVideos(props) {
  const v = props.videos;
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

// Apvieno attēlus un video vienā masīvā ar type informāciju
function getMediaWithTypes(props) {
  const photos = getPhotos(props);
  const videos = getVideos(props);

  const media = [];

  // Pievienojam attēlus
  photos.forEach(url => {
    media.push({ url: normalizePhotoUrl(url), type: 'image' });
  });

  // Pievienojam video
  videos.forEach(url => {
    media.push({ url: normalizePhotoUrl(url), type: 'video' });
  });

  return media;
}

function isGoogleDriveUrl(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('drive.google.com');
}

function getGoogleDriveFileId(url) {
  const patterns = [
    /\/file\/d\/([^\/]+)/,           // /file/d/FILE_ID/view
    /[?&]id=([^&]+)/,                // thumbnail?id=FILE_ID
    /\/open\?id=([^&]+)/,            // /open?id=FILE_ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isVideoUrl(url) {
  const u = String(url || '').toLowerCase();
  // Direct video faili un video hostingi
  return /\.(mp4|webm|mov|avi|mkv)/i.test(u) ||
         u.includes('youtube.com') ||
         u.includes('youtu.be') ||
         u.includes('vimeo.com');
}

function getEmbedUrl(url) {
  const u = String(url || '').trim();

  // YouTube
  let match = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\/]+)/);
  if (match) return `https://www.youtube.com/embed/${match[1]}`;

  // Vimeo
  match = u.match(/vimeo\.com\/(\d+)/);
  if (match) return `https://player.vimeo.com/video/${match[1]}`;

  return null;
}

function createMediaElement(mediaItem, index) {
  const url = mediaItem.url || mediaItem;
  const type = mediaItem.type || 'image';

  // Ja ir type='video', mēģinam embed vai direct video
  if (type === 'video') {
    const embedUrl = getEmbedUrl(url);

    if (embedUrl) {
      // Embedded video (YouTube, Vimeo)
      return `<iframe
        src="${escapeAttr(embedUrl)}"
        frameborder="0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen
        loading="lazy"
      ></iframe>`;
    } else if (isGoogleDriveUrl(url)) {
      // Google Drive video - izmantojam preview
      const fileId = getGoogleDriveFileId(url);
      if (fileId) {
        return `<iframe
          src="https://drive.google.com/file/d/${escapeAttr(fileId)}/preview"
          frameborder="0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
          loading="lazy"
        ></iframe>`;
      }
    }

    // Direct video file
    return `<video
      src="${escapeAttr(url)}"
      controls
      playsinline
      preload="auto"
      controlslist="nodownload"
    >
      Tavs pārlūks neatbalsta video.
    </video>`;
  } else {
    // Image (default)
    return `<img src="${escapeAttr(url)}" loading="lazy" alt="Media ${index + 1}" />`;
  }
}

function setupSlideshow(rootId, media) {
  setTimeout(() => {
    const root = document.getElementById(rootId);
    if (!root) return;

    const counter = root.querySelector('.slide-counter');
    const prevBtn = root.querySelector('.slide-prev');
    const nextBtn = root.querySelector('.slide-next');

    let i = 0;

    const update = () => {
      // Saglabā pašreizējo augstumu, lai novērstu rausīšanos
      const currentHeight = root.offsetHeight;
      if (currentHeight > 0) {
        root.style.minHeight = `${currentHeight}px`;
      }

      // Noņem VISUS media elementus (img, video, iframe)
      root.querySelectorAll('img, video, iframe').forEach(el => el.remove());

      // Izveido jaunu media elementu
      const wrapper = document.createElement('div');
      wrapper.innerHTML = createMediaElement(media[i], i);
      const mediaElement = wrapper.firstElementChild;

      // Debug logging
      const mediaUrl = media[i].url || media[i];
      const mediaType = media[i].type || 'image';
      console.log('[Slideshow] Media type:', mediaType, 'Element:', mediaElement.tagName, 'URL:', mediaUrl);

      // Ievieto pirms pogām (pirmais elements)
      if (prevBtn) {
        root.insertBefore(mediaElement, prevBtn);
      } else {
        root.insertBefore(mediaElement, root.firstChild);
      }

      // Ja ir video, pievienojam event listeners
      if (mediaElement.tagName === 'VIDEO') {
        mediaElement.addEventListener('loadeddata', () => {
          console.log('[Video] Data loaded, ready to play');
          setTimeout(() => {
            root.style.minHeight = '';
          }, 100);
        }, { once: true });

        mediaElement.addEventListener('error', (e) => {
          console.error('[Video] Error loading:', e, 'URL:', media[i]);
        });
      } else if (mediaElement.tagName === 'IMG') {
        // Ja ir attēls, gaidām ielādi un tad noņemam min-height
        mediaElement.addEventListener('load', () => {
          setTimeout(() => {
            root.style.minHeight = '';
          }, 100);
        }, { once: true });
      } else {
        // iframe - noņemam min-height pēc nelielas pauzes
        setTimeout(() => {
          root.style.minHeight = '';
        }, 200);
      }

      // Atjauno counter
      if (counter) {
        counter.textContent = `${i + 1} / ${media.length}`;
        counter.classList.toggle('slide-hidden', media.length <= 1);
      }

      // Paslēp/rāda pogas
      if (prevBtn && nextBtn) {
        const shouldHide = media.length <= 1;
        prevBtn.classList.toggle('slide-hidden', shouldHide);
        nextBtn.classList.toggle('slide-hidden', shouldHide);
      }
    };

    const goPrev = () => {
      i = (i - 1 + media.length) % media.length;
      update();
    };

    const goNext = () => {
      i = (i + 1) % media.length;
      update();
    };

    // Pogu event listeners
    if (prevBtn) prevBtn.addEventListener('click', goPrev);
    if (nextBtn) nextBtn.addEventListener('click', goNext);

    // Touch swipe atbalsts
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

      // Ignorē vertikālos swipes
      if (Math.abs(dy) > Math.abs(dx)) return;

      if (dx < -50) goNext();
      if (dx > 50) goPrev();
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });

    // Keyboard navigation (tikai ja popup ir aktīvs)
    const onKeyDown = (ev) => {
      if (!document.body.contains(root)) {
        document.removeEventListener('keydown', onKeyDown);
        return;
      }
      if (ev.key === 'ArrowLeft') goPrev();
      if (ev.key === 'ArrowRight') goNext();
    };

    document.addEventListener('keydown', onKeyDown);

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

function hideLoader() {
  if (!els.loader) return;
  els.loader.classList.add('hidden');
  // Pilnībā noņem no DOM pēc animācijas
  setTimeout(() => {
    if (els.loader && els.loader.parentNode) {
      els.loader.parentNode.removeChild(els.loader);
    }
  }, 300);
}

async function loadVersion() {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load version');

    const data = await res.json();
    const version = String(data.version || '?').trim();

    if (els.versionNumber) {
      els.versionNumber.textContent = version;
    }
    if (els.mobileVersion) {
      els.mobileVersion.textContent = version;
    }
  } catch (e) {
    console.warn('[Version] failed to load:', e);
    if (els.versionNumber) {
      els.versionNumber.textContent = '?';
    }
    if (els.mobileVersion) {
      els.mobileVersion.textContent = '?';
    }
  }
}
