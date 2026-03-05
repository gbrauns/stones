# Google Apps Script

Šis direktorijs satur Google Apps Script kodu, kas lasa datus no Google Sheets un atgriež tos kā GeoJSON.

## Faili

- `Code.gs` - Oriģinālais kods (bez video atbalsta) - BACKUP
- `Code-with-videos.gs` - Atjauninātais kods ar video atbalstu - **IZMANTO ŠO!**

## Uzstādīšana

### 1. Google Sheets kolonnas

Tavai Google Sheets lapai jābūt šādām kolonnām:

**Obligātās:**
- `lat` - Platums (latitude)
- `lon` - Garums (longitude)
- `date` - Datums (YYYY-MM-DD vai jebkurš Date formāts)
- `author` - Autors
- `missing info` - Vai trūkst informācijas (true/false)

**Izvēles:**
- `id` - Unikāls ID
- `title` - Nosaukums
- `description` - Apraksts
- `Country` vai `country` - Valsts
- `photos` - Attēlu URLs (|, new line vai komats kā atdalītājs)
- `videos` - Video URLs (|, new line vai komats kā atdalītājs) - **JAUNS!**

### 2. Kā pievienot video atbalstu

1. **Google Sheets:**
   - Pievieno jaunu kolonnu ar nosaukumu `videos`
   - Tajā ievieto Google Drive video linkus (viens vai vairāki, atdalīti ar | vai jaunu rindiņu)

2. **Google Apps Script:**
   - Atver Apps Script editoru (Extensions → Apps Script)
   - Kopē visu kodu no `Code-with-videos.gs`
   - Ielīmē Apps Script editorā, aizstājot veco kodu
   - Spied "Deploy" → "New deployment"
   - Ja jau ir deployment, tad "Manage deployments" → Edit → Version: "New version"
   - Saglabā jauno Web App URL

3. **Pārbaude:**
   - Atver Web App URL pārlūkā
   - Pārbaudi, vai JSON satur gan `photos`, gan `videos` laukus
   - Piemērs:
   ```json
   {
     "type": "FeatureCollection",
     "features": [{
       "properties": {
         "photos": ["https://drive.google.com/thumbnail?id=..."],
         "videos": ["https://drive.google.com/file/d/.../view"]
       }
     }]
   }
   ```

### 3. Kā darbojas

**Attēli (`photos`):**
- Apps Script konvertē Google Drive URL uz thumbnail formātu
- `https://drive.google.com/file/d/FILE_ID/view` → `https://drive.google.com/thumbnail?id=FILE_ID&sz=w1200`
- Optimizē ielādes ātrumu

**Video (`videos`):**
- Apps Script NEATKONVERTĒ URL (atstāj oriģinālo)
- JavaScript puse pārveidīs uz `/preview` formātu
- `https://drive.google.com/file/d/FILE_ID/view` → `https://drive.google.com/file/d/FILE_ID/preview`
- Atbalsta atskaņošanu iframe

## Atjaunošana

Kad maini Apps Script kodu:
1. Saglabā izmaiņas (Ctrl+S vai File → Save)
2. Deploy → Manage deployments → Edit esošo
3. Version → "New version"
4. Deploy

**Svarīgi:** Katru reizi, kad veic izmaiņas, jāizveido jauna versija!

## Problēmu risināšana

### Video neparādās
- Pārbaudi, vai Google Sheets ir `videos` kolonna
- Pārbaudi, vai Apps Script kods ir atjaunināts ar `parseVideos` funkciju
- Pārbaudi Web App JSON output - vai ir `videos` lauks?

### Attēli/video nerādās pareizi
- Pārbaudi, vai Google Drive faili ir public (Anyone with the link can view)
- Pārbaudi console logs pārlūkā (F12 → Console)

### JSON atgriež error
- Pārbaudi, vai visas obligātās kolonnas eksistē
- Pārbaudi Apps Script execution log (View → Logs)
