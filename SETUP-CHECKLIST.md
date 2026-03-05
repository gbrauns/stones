# Video Support Setup Checklist

## 1️⃣ Google Sheets ✓/✗
- [ ] Ir kolonna ar nosaukumu `videos` (ar mazo "v")
- [ ] Kolonnā ir ievietots kaut viens Google Drive video links
- [ ] Piemērs: `https://drive.google.com/file/d/FILE_ID/view`

## 2️⃣ Google Apps Script ✓/✗
- [ ] Atvērts Apps Script editors (Extensions → Apps Script)
- [ ] Kopēts kods no `google-apps-script/Code-with-videos.gs`
- [ ] Kodā ir redzama rindiņa: `videos: parseVideos(getCell(row, idx, 'videos')),`
- [ ] Kodā ir funkcija `parseVideos(raw)`
- [ ] Saglabāts kods (Ctrl+S vai File → Save)

## 3️⃣ Deployment ✓/✗
- [ ] Deploy → Manage deployments
- [ ] Spiedis uz ⚙️ (Edit) pie esošā deployment
- [ ] Version: izvēlēts "New version"
- [ ] Description: ievadīts `Add videos support`
- [ ] Spiedis "Deploy"
- [ ] Redzēts paziņojums: "Successfully updated deployment"

## 4️⃣ Pārbaude ✓/✗

### A) JSON output pārbaude:
Atver šo URL pārlūkā:
```
https://script.google.com/macros/s/AKfycbzOjr_oXwDw6-GSqOARzAv8ImhGsGvqafycLJ5YanF40Psn2QXtRTJasiHicca4G1Bo/exec
```

Meklē JSON:
```json
{
  "type": "FeatureCollection",
  "features": [{
    "properties": {
      "photos": [...],
      "videos": [...]  ← Šim JĀBŪT!
    }
  }]
}
```

- [ ] JSON satur `videos` lauku
- [ ] `videos` ir array (saraksts)
- [ ] `videos` satur Google Drive linkus

### B) Console pārbaude:
1. Atver lapu: https://tavs-domēns.com
2. Spied F12 → Console tab
3. Atver kādu punktu ar video
4. Meklē:
```
[Slideshow] Media type: video Element: IFRAME URL: https://drive.google.com/...
```

- [ ] Console rāda `Media type: video`
- [ ] Element ir `IFRAME` (ne `IMG`)
- [ ] URL ir Google Drive preview

## 5️⃣ Bieži sastopamās problēmas

### ❌ JSON nesatur `videos` lauku
**Iemesls:** Apps Script kods nav atjaunināts vai nav izveidota jauna versija

**Risinājums:**
1. Pārbaudi, vai Apps Script kodā ir `parseVideos` funkcija
2. Izveido jaunu deployment versiju (svarīgi - "New version", nevis "Head")
3. Pagaidi 1-2 minūtes (Google cache)

### ❌ Video parādās kā attēls (thumbnail)
**Iemesls:** Apps Script konvertē video uz thumbnail URL

**Risinājums:**
- Pārbaudi, vai izmanto `Code-with-videos.gs` (NE `Code.gs`)
- `parseVideos()` funkcija NEDRĪKST izmantot `toDirectDriveUrl()`

### ❌ Iframe neielādējas (melnā ekrāns)
**Iemesls:** Google Drive fails nav public

**Risinājums:**
1. Atver Google Drive failu
2. Share → Anyone with the link can view
3. Saglabā

### ❌ Console rāda "Media type: image" video failam
**Iemesls:** Apps Script nesūta `videos` lauku, tāpēc JavaScript uzskata, ka viss ir `photos`

**Risinājums:**
- Atgriezies pie 2️⃣ un 3️⃣ soļiem
- Pārbaudi JSON output (4️⃣ A)

## 6️⃣ Test komanda

Terminālī:
```bash
curl -sL "https://script.google.com/macros/s/AKfycbzOjr_oXwDw6-GSqOARzAv8ImhGsGvqafycLJ5YanF40Psn2QXtRTJasiHicca4G1Bo/exec" | python3 -c "import sys, json; data = json.load(sys.stdin); feat = data['features'][0]; props = feat['properties']; print('Has videos?', 'videos' in props); print('Videos:', props.get('videos', 'NONE'))"
```

Sagaidāmais rezultāts:
```
Has videos? True
Videos: ['https://drive.google.com/file/d/...']
```

Ja rāda `Has videos? False` - Apps Script nav atjaunināts!
