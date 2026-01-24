mapboxgl.accessToken = 'pk.eyJ1IjoiZ2F0aXNicmF1bnMiLCJhIjoiY21mZmd5M3l5MGVlMTJtc2ZjNmQxcnJibyJ9.zV-sHT7Skewg0tSlRqxbVA';

const DATA_URL =
  'https://script.google.com/macros/s/AKfycbzWd7a_KT12EtY0U7ys-wTftiR-sRT0bg8jORAr7CrU4veQUMIHz7FhsfusRiSAFUxz/exec';

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

  allFeatures = geojson.features;

  map.addSource('stones', {
    type: 'geojson',
    data: geojson
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
  const f = e.features[0];
  const p = f.properties;

  const photos = JSON.parse(p.photos || '[]');

  let html = `
    <div class="popup-title">${p.title || 'Bez nosaukuma'}</div>
    <div class="popup-meta">${p.author} · ${p.date}</div>
  `;

  if (p.description) {
    html += `<div class="popup-desc">${p.description}</div>`;
  }

  if (photos.length) {
    html += `<div class="popup-images">`;
    photos.forEach(url => {
      html += `<img src="${url}" loading="lazy" />`;
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

map.on('mouseenter', 'stones-layer', () => {
  map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'stones-layer', () => {
  map.getCanvas().style.cursor = '';
});

document
  .getElementById('filter-author')
  .addEventListener('change', applyFilters);
document
  .getElementById('filter-year')
  .addEventListener('change', applyFilters);
document
  .getElementById('filter-missing')
  .addEventListener('change', applyFilters);

function populateFilters() {
  const authors = new Set();
  const years = new Set();

  allFeatures.forEach(f => {
    authors.add(f.properties.author);
    if (f.properties.date) {
      years.add(f.properties.date.substring(0, 4));
    }
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
  const author = document.getElementById('filter-author').value;
  const year = document.getElementById('filter-year').value;
  const missing = document.getElementById('filter-missing').checked;

  const filtered = allFeatures.filter(f => {
    if (author && f.properties.author !== author) return false;
    if (year && !f.properties.date.startsWith(year)) return false;
    if (missing && f.properties.missing_info !== true && f.properties.missing_info !== 'true') return false;
    return true;
  });

  map.getSource('stones').setData({
    type: 'FeatureCollection',
    features: filtered
  });
}
