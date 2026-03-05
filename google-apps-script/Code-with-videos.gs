const SPREADSHEET_ID = '1pwURIl-V6B2Al8xfjf1nP03aLItHamTF35XQq9TcK40';
const SHEET_NAME = 'Stones';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) return outputJson({ error: `Sheet not found: ${SHEET_NAME}` }, e);

    const values = sh.getDataRange().getValues();
    if (values.length < 2) return outputGeojson([], e);

    const headers = values[0].map(h => String(h).trim());
    const idx = indexMap(headers);

    // Required columns
    const need = ['lat', 'lon', 'date', 'author', 'missing info'];
    for (const k of need) {
      if (!(k in idx)) return outputJson({ error: `Missing column: ${k}` }, e);
    }

    // Optional: Country (ar lielo burtu, kā tev ir)
    const hasCountry = ('Country' in idx) || ('country' in idx);

    const features = [];
    for (let r = 1; r < values.length; r++) {
      const row = values[r];

      const lat = toNum(row[idx['lat']]);
      const lon = toNum(row[idx['lon']]);
      if (lat === null || lon === null) continue;

      const countryVal = hasCountry ? (
        ('Country' in idx) ? getCell(row, idx, 'Country') : getCell(row, idx, 'country')
      ) : '';

      const props = {
        id: getCell(row, idx, 'id'),
        date: normalizeDate(row[idx['date']]),
        author: getCell(row, idx, 'author'),
        title: getCell(row, idx, 'title'),
        description: getCell(row, idx, 'description'),
        photos: parsePhotos(getCell(row, idx, 'photos')),
        videos: parseVideos(getCell(row, idx, 'videos')),  // JAUNS: videos lauks
        missing_info: toBool(row[idx['missing info']]),
        country: countryVal
      };

      if (!props.author || !props.date) continue;

      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: props,
      });
    }

    return outputGeojson(features, e);
  } catch (err) {
    return outputJson({ error: String(err) }, e);
  }
}

function outputGeojson(features, e) {
  return outputJson({ type: 'FeatureCollection', features }, e);
}

function outputJson(obj, e) {
  const json = JSON.stringify(obj);
  const callback = e && e.parameter && e.parameter.callback ? String(e.parameter.callback) : '';

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function indexMap(headers) {
  const m = {};
  headers.forEach((h, i) => { m[h] = i; });
  return m;
}

function getCell(row, idx, key) {
  if (!(key in idx)) return '';
  const v = row[idx[key]];
  return v === null || v === undefined ? '' : String(v).trim();
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'jā';
}

function normalizeDate(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, '0');
    const dd = String(v.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return s;
}

function parsePhotos(raw) {
  if (!raw) return [];
  const parts = String(raw)
    .split(/\r?\n|\|/g)
    .map(x => x.trim())
    .filter(Boolean);

  // Attēliem konvertē uz thumbnail URL (optimizācija)
  return parts.map(toDirectDriveUrl);
}

function parseVideos(raw) {
  if (!raw) return [];
  const parts = String(raw)
    .split(/\r?\n|\|/g)
    .map(x => x.trim())
    .filter(Boolean);

  // Video NEKONVERTĒ uz thumbnail - atstāj oriģinālo URL
  // JavaScript puse pati pārveidīs uz /preview formātu
  return parts;
}

function toDirectDriveUrl(url) {
  const s = String(url);

  // drive.google.com/file/d/FILE_ID/...
  let m = s.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/i);
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`;

  // drive.google.com/open?id=FILE_ID vai jebkurš ?id=FILE_ID
  m = s.match(/[?&]id=([^&]+)/i);
  if (m && m[1] && s.includes('drive.google.com')) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`;

  return s;
}
