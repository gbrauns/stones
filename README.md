# 🗺️ Akmeņu Karte / Stones Map

Interaktīva pasaules karte ar akmeņiem, pieminekļiem un citiem objektiem. Mapbox-bāzēta web aplikācija, kas ļauj izpētīt, filtrēt un apskatīt unikālus objektus no visas pasaules ar fotogrāfijām un video.

Interactive world map featuring stones, monuments, and other objects. Mapbox-based web application for exploring, filtering, and viewing unique objects from around the world with photos and videos.

---

## ⚠️ SVARĪGI: Versiju Vadības Noteikumi

### 🚨 OBLIGĀTI: Pie katra commit jāpalielina versija!

**Pirms KATRA commit:**

1. **Atjaunini `version.json`:**
   ```json
   {
     "version": "1.XX"  ← Palielini šo numuru!
   }
   ```

2. **Atjaunini `index.html` cache busting:**
   ```html
   <script src="config.php?v=XX"></script>  ← Palielini!
   <script src="js/app.js?v=XX"></script>   ← Palielini!
   ```

3. **Commit ar versiju ziņojumā:**
   ```bash
   git add -A
   git commit -m "feat: apraksts (v1.XX)"
   git push origin main
   ```

### Kāpēc tas ir svarīgi?

- ✅ **Cache busting** - Lietotāji saņem jaunāko kodu
- ✅ **Versiju izsekošana** - Vienkārši identificēt, kura versija ir deployed
- ✅ **Debugging** - Zini precīzi, kurš kods darbojas production

### Commit ziņojumu formāts:

```
<tips>: <apraksts> (v1.XX)

Tips: feat, fix, docs, style, refactor, test, chore
```

**Piemēri:**
```bash
git commit -m "feat: pievienots video atbalsts Google Drive (v1.18)"
git commit -m "fix: labots slideshow navigācijas bugs (v1.19)"
git commit -m "docs: atjauninātas setup instrukcijas (v1.20)"
```

---

## 🎯 Funkcionalitāte

### Interaktīvā karte
- **Mapbox GL JS** - moderna, ātrdarbīga vektorkaršu platforma
- **Clustering** - punkti, kas atrodas tuvu, tiek grupēti ar ciparu; zoom in parāda tos atsevišķi
- **Valstu iekrāsošana** - valstis, kurās ir vismaz viens objekts, tiek iekrāsotas
- **Valsts highlight** - valsts kļūst gaišāka, kad tās objekta popup ir atvērts
- **Deep linking** - katram objektam ir unikāls URL (piemēram: `#spanu-danci-5`)

### Media galerija
- ✅ **Attēli** - Google Drive, direct URLs
- ✅ **Video** - Google Drive (preview iframe), YouTube, Vimeo, direct video faili
- ✅ **Slideshow** - Touch swipe, klaviatūras navigācija (← →)
- ✅ **Jaukts saturs** - Attēli + video vienā slideshow

### Filtri un meklēšana
- **Teksta meklēšana** - meklē pēc nosaukuma, autora, valsts, apraksta
- **Filtri:**
  - Autors
  - Gads (automātiski no datuma)
  - Kontinents (ar objektu skaitītāju)
  - Valsts (dinamisks - mainās pēc kontinenta izvēles)

### Objektu saraksts
- Visi objekti redzami sānjoslā (sidebar)
- Klikšķinot uz objekta → karte automātiski fly to uz objektu
- Skaitītājs rāda kopējo objektu skaitu

### Popup
- **Fotogrāfijas un video** - slideshow ar swipe atbalstu (touch)
- **Meta informācija** - autors, datums, valsts
- **Apraksts** - detalizēts objekta apraksts
- **Status badge** - ⚠️ trūkst info vai ✓ ok
- **Copy link** - 🔗 ikona kopē URL ar hash uz clipboard

## 🛠️ Tehnoloģijas

- **Frontend:** Vanilla JavaScript (bez framework!)
- **Karte:** Mapbox GL JS v2.15.0
- **Backend:** Google Apps Script (Google Sheets → GeoJSON API)
- **Datu glabāšana:** Google Sheets
- **Media glabāšana:** Google Drive
- **Styling:** CSS3 (responsive, animations)
- **Kartes dati:** Natural Earth (simplificēti valstu poligoni)

## 📁 Projekta struktūra

```
stones/
├── index.html                          # Galvenā HTML lapa
├── config.php                          # Konfigurācijas loader (lasa .env)
├── version.json                        # Versijas numurs (JĀATJAUNINA pie katra commit!)
├── .env                                # Environment variables (NOT in git!)
├── .env.example                        # Template environment variables
├── .gitignore                          # Git ignore rules
├── css/
│   └── styles.css                      # Visi stili
├── js/
│   └── app.js                          # Galvenā aplikācijas loģika
├── data/
│   ├── country_continent_lv.json       # Valstu reģistrs (112 valstis)
│   └── countries_simplified.geojson.json  # Valstu poligoni (242 features)
├── google-apps-script/
│   ├── Code.gs                         # Apps Script backup (bez video)
│   ├── Code-with-videos.gs            # Apps Script ar video atbalstu ← IZMANTO ŠO!
│   └── README.md                       # Apps Script setup instrukcijas
├── SETUP-CHECKLIST.md                  # Video setup verification checklist
├── test-video-support.html             # Testa lapa funkciju pārbaudei
└── README.md                           # Šis fails
```

## 🚀 Instalācija un Setup

### 1. Clone repozitoriju

```bash
git clone https://github.com/gbrauns/stones.git
cd stones
```

### 2. Environment Variables

Kopē `.env.example` uz `.env`:

```bash
cp .env.example .env
```

Rediģē `.env` un aizpildi savus datus:

```env
MAPBOX_TOKEN=pk.eyJ1...  # Tavs Mapbox access token
DATA_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

**Kur dabūt Mapbox token:** https://account.mapbox.com/access-tokens/

**⚠️ SVARĪGI:** `.env` fails ir `.gitignore` un NEKAD netiek committēts uz Git!

### 3. Google Sheets Setup

**Detalizētas instrukcijas:** [google-apps-script/README.md](google-apps-script/README.md)

**Īsumā:**

1. **Izveido Google Sheet** ar šādām kolonnām:
   - `lat` (latitude) - obligāts
   - `lon` (longitude) - obligāts
   - `date` (YYYY-MM-DD) - obligāts
   - `author` - obligāts
   - `title` - ieteicams
   - `description` - izvēle
   - `photos` - attēlu URLs (atdalīti ar `|` vai jaunām rindām)
   - `videos` - video URLs (atdalīti ar `|` vai jaunām rindām)
   - `Country` - valsts latviešu valodā
   - `missing info` - true/false vai 1/0

2. **Google Apps Script:**
   - Extensions → Apps Script
   - Kopē kodu no `google-apps-script/Code-with-videos.gs`
   - Atjaunini `SPREADSHEET_ID` un `SHEET_NAME`
   - Deploy → New deployment → Web app
   - Kopē deployment URL un ieliec `.env` failā kā `DATA_URL`

3. **Pārbaude:**
   - Atver deployment URL pārlūkā
   - Vajadzētu redzēt GeoJSON ar `photos` un `videos` laukiem

### 4. Palaid lokāli

Tā kā projekts izmanto PHP konfigurācijai, nepieciešams lokāls serveris:

```bash
# PHP built-in server
php -S localhost:8000

# Vai Python
python3 -m http.server 8000

# Vai Node.js http-server
npx http-server -p 8000
```

Atver pārlūkā: http://localhost:8000

## 📊 Datu struktūra

### GeoJSON Features

| Property | Tips | Apraksts | Obligāts |
|----------|------|----------|----------|
| `lat` | number | Platums (latitude) | ✅ |
| `lon` | number | Garums (longitude) | ✅ |
| `date` | string | Datums (YYYY-MM-DD) | ✅ |
| `author` | string | Autors | ✅ |
| `title` | string | Objekta nosaukums | Ieteicams |
| `description` | string | Apraksts | Izvēle |
| `photos` | string/array | Attēlu URLs | Izvēle |
| `videos` | string/array | Video URLs | Izvēle |
| `country` | string | Valsts (LV) | Ieteicams |
| `missing_info` | boolean | Vai trūkst info | Izvēle |

### Media URL formāti

**Attēli:**
- Google Drive: `https://drive.google.com/file/d/FILE_ID/view`
- Direct: `https://example.com/image.jpg`

**Video:**
- Google Drive: `https://drive.google.com/file/d/FILE_ID/view`
- YouTube: `https://youtube.com/watch?v=VIDEO_ID` vai `https://youtu.be/VIDEO_ID`
- Vimeo: `https://vimeo.com/VIDEO_ID`
- Direct: `https://example.com/video.mp4`

**Svarīgi:** Google Drive faili jābūt public (Anyone with the link can view)

### Valstu reģistrs

`data/country_continent_lv.json`:

```json
[
  {
    "country": "Latvija",
    "continent": "Eiropa",
    "iso_a2": "LV"
  }
]
```

## 🎨 Dizaina detaļas

### Krāsu shēma

- **Primārā:** `#1d3557` (tumši zila)
- **Akcents (missing info):** `#e63946` (sarkana)
- **Valstu krāsošana:**
  - Normāla: `#2b6cb0` (zila)
  - Highlighted: `#4a90e2` (gaišāk zila)
  - Filtrēta: `#f97316` (oranža)
- **Clusteri:**
  - < 10 punkti: `#51bbd6` (zila)
  - 10-29 punkti: `#f1f075` (dzeltena)
  - 30+ punkti: `#f28cb1` (rozā)

### Responsive Breakpoints

- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

## 🔗 Deep Linking

Katram objektam ir unikāls URL hash:

- Nosaukums → slug (latviešu diakritika → ASCII)
- Pievienots index numurs (dublikātu atšķiršanai)
- Piemērs: `https://stones.brauns.lv#akmens-latvija-5`

Hash formāts: `#{slug}-{index}`

## 🐛 Troubleshooting

### Video neatskaņojas

1. ✅ Pārbaudi, vai Google Drive faili ir public
2. ✅ Pārbaudi, vai Sheets ir `videos` kolonna
3. ✅ Pārbaudi, vai Apps Script izmanto `Code-with-videos.gs`
4. ✅ Pārbaudi deployment versiju (Deploy → Manage deployments → New version)

### Karte neielādējas

1. ✅ Pārbaudi Mapbox token derīgumu
2. ✅ Pārbaudi browser console errors (F12)
3. ✅ Pārbaudi `DATA_URL` - vai atgriež GeoJSON?

### Izmaiņas nav redzamas

1. 🚨 **Vai palielināji versiju?** (Visbiežākā problēma!)
2. Hard refresh: Ctrl+Shift+R (Win) vai Cmd+Shift+R (Mac)
3. Notīri browser cache
4. Pārbaudi, vai `version.json` un `index.html` versijas sakrīt

### "Secret Detected" push error

1. `.env` failam jābūt `.gitignore`
2. Ja jau committēts → spied "Bypass"
3. Pēc bypass → rotē Mapbox tokenu (drošībai)
4. Nekad necommit secrets!

## 🔧 Video atbalsta implementācija

### Kā darbojas

1. **Google Sheets:** Atsevišķas kolonnas `photos` un `videos`
2. **Apps Script:** Lasa abas kolonnas, atgriež JSON ar abiem laukiem
3. **JavaScript:**
   - `getMediaWithTypes()` apvieno attēlus un video
   - `createMediaElement()` izveido `<img>`, `<video>` vai `<iframe>`
   - Google Drive video → `https://drive.google.com/file/d/FILE_ID/preview`
   - YouTube/Vimeo → embed iframe
   - Direct video → `<video>` tags

### Funkcijas

- `getPhotos(props)` - Lasa photos lauku
- `getVideos(props)` - Lasa videos lauku
- `getMediaWithTypes(props)` - Apvieno ar type info
- `isGoogleDriveUrl(url)` - Atpazīst Google Drive
- `getGoogleDriveFileId(url)` - Izvelk FILE_ID
- `createMediaElement(mediaItem, index)` - Izveido HTML

## 🌐 Atbalstītie pārlūki

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## 📝 Licence

MIT License

## 👤 Autors

**Gatis Brauns**

- GitHub: [@gbrauns](https://github.com/gbrauns)
- Email: gatis.brauns@gmail.com

## 🙏 Acknowledgments

- Kartes dati: [Natural Earth](https://www.naturalearthdata.com/)
- Kartes rendering: [Mapbox](https://www.mapbox.com/)
- Izveidots ar [Claude](https://claude.ai) (Anthropic) palīdzību

## 🤝 Piedalīšanās (Contributing)

1. Fork projektu
2. Izveido feature branch: `git checkout -b feature/amazing-feature`
3. **PALIELINI VERSIJU** `version.json` un `index.html`
4. Commit izmaiņas: `git commit -m 'feat: amazing feature (v1.XX)'`
5. Push uz branch: `git push origin feature/amazing-feature`
6. Atver Pull Request

### Contribution Guidelines

- ✅ **Vienmēr palielini versiju** pirms commit
- ✅ Raksti skaidrus commit ziņojumus
- ✅ Testē izmaiņas lokāli pirms push
- ✅ Atjaunini dokumentāciju, ja nepieciešams
- ❌ Necommit `.env` failu
- ❌ Necommit secrets vai API keys

## 📊 Versiju vēsture

- **v1.19** - Pašreizējā versija
- **v1.18** - Pievienots video atbalsts (Google Drive, YouTube, Vimeo)
- **v1.17** - Google Apps Script uzlabojumi
- Agrākās versijas - Sākotnējā izstrāde

## 📧 Kontakti

- **Jaunu objektu pievienošana:** https://forms.gle/JcUwCwtvCwwk2Yxr7
- **Issues/Bugs:** GitHub Issues
- **Email:** gatis.brauns@gmail.com

---

**🚨 ATCERIES: PALIELINI VERSIJU PIE KATRA COMMIT! 🚨**

Skatīt arī:
- [SETUP-CHECKLIST.md](SETUP-CHECKLIST.md) - Video setup verification
- [google-apps-script/README.md](google-apps-script/README.md) - Apps Script setup
