# 🗺️ Akmeņu karte

Interaktīva pasaules karte ar akmeņiem un pieminekļiem. Mapbox-bāzēta web aplikācija, kas ļauj izpētīt, filtrēt un apskatīt unikālus objektus no visas pasaules.

## 🎯 Funkcionalitāte

### Interaktīvā karte
- **Mapbox GL JS** - moderna, ātrdarbīga vektorkaršu platforma
- **Clustering** - punkti, kas atrodas tuvu, tiek grupēti ar ciparu; zoom in parāda tos atsevišķi
- **Valstu iekrāsošana** - valstis, kurās ir vismaz viens objekts, tiek iekrāsotas
- **Valsts highlight** - valsts kļūst gaišāka, kad tās objekta popup ir atvērts
- **Deep linking** - katram objektam ir unikāls URL (piemēram: `#spanu-danci-5`)

### Filtri un meklēšana
- **Teksta meklēšana** - meklē pēc nosaukuma, autora, valsts
- **Filtri:**
  - Autors
  - Gads
  - Kontinents
  - Valsts (dinamisks - mainās pēc kontinenta izvēles)

### Objektu saraksts
- Visi objekti redzami sānjoslā (sidebar)
- Klikšķinot uz objekta → karte automātiski fly to uz objektu
- Skaitītājs rāda kopējo objektu skaitu

### Popup
- **Fotogrāfijas** - slideshow ar swipe atbalstu (touch)
- **Meta informācija** - autors, datums, valsts
- **Apraksts** - detalizēts objekta apraksts
- **Status badge** - ⚠️ missing info vai ✅ ok
- **Copy links** - 🔗 ikona kopē URL ar hash uz clipboard

### Dati
- **GeoJSON** - ģeogrāfiskie punkti ar koordinātām
- **Valstu reģistrs** - latviešu valodu atbalsts valstu nosaukumiem, kontinentiem un ISO kodiem
- **Valstu poligoni** - simplificēts GeoJSON fails ar 242 valstu robežām

## 🛠️ Tehnoloģijas

- **Mapbox GL JS v2.15.0** - interaktīvā karte
- **Vanilla JavaScript** - bez framework
- **CSS3** - responsive dizains, animācijas
- **GeoJSON** - ģeogrāfisko datu formāts

## 📁 Projekta struktūra

```
stones/
├── index.html              # Galvenā HTML lapa
├── config.php              # Konfigurācija (MAPBOX_TOKEN, DATA_URL)
├── version.json            # Versijas numurs (automātiski palielinās ar git push)
├── css/
│   └── styles.css          # Visi stili (responsive, animations)
├── js/
│   └── app.js              # Galvenā aplikācijas loģika
├── data/
│   ├── country_continent_lv.json          # Valstu reģistrs (112 valstis)
│   └── countries_simplified.geojson.json  # Valstu poligoni (242 features)
└── README.md               # Šis fails
```

## 🔢 Versiju vadība

Projekts izmanto automātisku versiju palielināšanu:

- **Versija glabājas:** `version.json` failā
- **Sākuma versija:** 1.8
- **Palielināšana:** Ar katru `git push` versija automātiski palielinās (1.8 → 1.9 → 1.10 → 1.11 → ... → 1.100)
- **Manuāla izmaiņa:** Var rediģēt `version.json` failu tieši, ja nepieciešams

### Git Hook uzstādīšana (automātiska versiju palielināšana)

Hooks ir jau iestatīts projektā. Ja tas nedarbojas:

```bash
chmod +x .git/hooks/pre-push
```

### Manuāla versijas izmaiņa

Rediģē `version.json`:
```json
{
  "version": "1.25"
}
```

Versija palielinās pēc šī principa:
- 1.8 → 1.9 → 1.10 → 1.11 → ... → 1.99 → 1.100

## ⚙️ Konfigurācija

Izveido `config.php` failu projekta saknē:

```php
<?php
header('Content-Type: application/javascript');
?>
window.APP_CONFIG = {
  MAPBOX_TOKEN: 'pk.YOUR_MAPBOX_TOKEN_HERE',
  DATA_URL: '/path/to/your/geojson/data.json'
};
```

### Nepieciešams:
1. **Mapbox Access Token** - bezmaksas no [mapbox.com](https://account.mapbox.com/)
2. **GeoJSON datu fails** - ar šādu struktūru:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [24.1052, 56.9496]
      },
      "properties": {
        "title": "Objekta nosaukums",
        "author": "Autora vārds",
        "date": "2024-01-15",
        "country": "Latvija",
        "description": "Apraksts...",
        "photos": "https://example.com/photo1.jpg|https://example.com/photo2.jpg",
        "missing_info": false
      }
    }
  ]
}
```

## 🚀 Instalācija

1. **Klonē repozitoriju:**
   ```bash
   git clone https://github.com/yourusername/stones.git
   cd stones
   ```

2. **Izveido config.php:**
   ```bash
   cp config.example.php config.php
   # Rediģē config.php un pievieno savu Mapbox token
   ```

3. **Palaid lokālu serveri:**
   ```bash
   # Python 3
   python -m http.server 8000

   # vai PHP
   php -S localhost:8000
   ```

4. **Atver pārlūkā:**
   ```
   http://localhost:8000
   ```

## 📊 Datu struktūra

### GeoJSON objekts

| Property | Tips | Apraksts |
|----------|------|----------|
| `title` | string | Objekta nosaukums |
| `author` | string | Autors |
| `date` | string | Datums formātā YYYY-MM-DD |
| `country` | string | Valsts (latviešu valodā) |
| `description` | string | Apraksts |
| `photos` | string/array | Foto URL (atdalīti ar \| vai array) |
| `missing_info` | boolean | Vai trūkst informācijas |

### Valstu reģistrs (`country_continent_lv.json`)

```json
[
  {
    "country": "Latvija",
    "continent": "Eiropa",
    "iso_a2": "LV"
  }
]
```

## 🎨 Krāsu shēma

- **Primārā:** `#1d3557` (tumši zila)
- **Akcents:** `#e63946` (sarkana - missing info)
- **Valstu krāsošana:** `#2b6cb0` (normāla), `#4a90e2` (highlighted)
- **Clusteri:** `#51bbd6` (mazi), `#f1f075` (vidēji), `#f28cb1` (lieli)

## 🔗 Deep Linking

Katram objektam tiek ģenerēts unikāls URL hash:
- Nosaukums tiek slugified (latviešu diakritika → ASCII)
- Pievienots index numurs dublikātu gadījumā
- Piemērs: `stones.brauns.lv#spanu-danci-5`

## 🌐 Atbalstītie pārlūki

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## 📝 Licence

[Tava licence šeit]

## 👤 Autors

[Tavs vārds/kontakti]

## 🤝 Piedalīšanās

1. Fork projektu
2. Izveido feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit izmaiņas (`git commit -m 'Add some AmazingFeature'`)
4. Push uz branch (`git push origin feature/AmazingFeature`)
5. Atver Pull Request

## 📧 Kontakti

Forma jaunu objektu pievienošanai: https://forms.gle/JcUwCwtvCwwk2Yxr7
