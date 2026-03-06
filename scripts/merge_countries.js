#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Kontinentu kartējums no angļu uz latviešu
const continentMap = {
  'Africa': 'Āfrika',
  'Asia': 'Āzija',
  'Europe': 'Eiropa',
  'North America': 'Ziemeļamerika',
  'South America': 'Dienvidamerika',
  'Oceania': 'Okeānija',
  'Antarctica': 'Antarktīda',
  'Seven seas (open ocean)': 'Okeāni'
};

// Latviešu valstu nosaukumu kartējums (no angļu)
const countryNamesLV = {
  'Afghanistan': 'Afganistāna',
  'Aland': 'Olandes Salas',
  'Albania': 'Albānija',
  'Algeria': 'Alžīrija',
  'American Samoa': 'Amerikāņu Samoa',
  'Anguilla': 'Angilja',
  'Antarctica': 'Antarktīda',
  'Aruba': 'Aruba',
  'Andorra': 'Andora',
  'Angola': 'Angola',
  'Antigua and Barbuda': 'Antigva un Barbuda',
  'Argentina': 'Argentīna',
  'Armenia': 'Armēnija',
  'Australia': 'Austrālija',
  'Austria': 'Austrija',
  'Azerbaijan': 'Azerbaidžāna',
  'Bahamas': 'Bahamu Salas',
  'Bahrain': 'Bahreina',
  'Bangladesh': 'Bangladeša',
  'Barbados': 'Barbadosa',
  'Belarus': 'Baltkrievija',
  'Belgium': 'Beļģija',
  'Belize': 'Beliza',
  'Bermuda': 'Bermudu Salas',
  'British Indian Ocean Territory': 'Indijas okeāna Britu teritorija',
  'British Virgin Islands': 'Britu Virdžīnu Salas',
  'Benin': 'Benina',
  'Bhutan': 'Butāna',
  'Bolivia': 'Bolīvija',
  'Bosnia and Herzegovina': 'Bosnija un Hercegovina',
  'Botswana': 'Botsvāna',
  'Brazil': 'Brazīlija',
  'Brunei': 'Bruneja',
  'Bulgaria': 'Bulgārija',
  'Burkina Faso': 'Burkinafaso',
  'Burundi': 'Burundi',
  'Cambodia': 'Kambodža',
  'Cameroon': 'Kamerūna',
  'Canada': 'Kanāda',
  'Cape Verde': 'Kaboverde',
  'Cayman Islands': 'Kaimanu Salas',
  'Central African Republic': 'Centrālāfrikas Republika',
  'Cook Islands': 'Kuka Salas',
  'Curaçao': 'Kirasao',
  'Chad': 'Čada',
  'Chile': 'Čīle',
  'China': 'Ķīna',
  'Colombia': 'Kolumbija',
  'Comoros': 'Komoru Salas',
  'Congo': 'Kongo',
  'Costa Rica': 'Kostarika',
  'Croatia': 'Horvātija',
  'Cuba': 'Kuba',
  'Cyprus': 'Kipra',
  'Czechia': 'Čehija',
  'Czech Republic': 'Čehija',
  'Denmark': 'Dānija',
  'Djibouti': 'Džibutija',
  'Dominica': 'Dominika',
  'Dominican Republic': 'Dominikānas Republika',
  'Ecuador': 'Ekvadora',
  'Egypt': 'Ēģipte',
  'El Salvador': 'Salvadora',
  'Equatorial Guinea': 'Ekvatoriālā Gvineja',
  'Eritrea': 'Eritreja',
  'Estonia': 'Igaunija',
  'Eswatini': 'Esvatīni',
  'Ethiopia': 'Etiopija',
  'Falkland Islands': 'Folklenda Salas',
  'Faroe Islands': 'Fēru Salas',
  'Federated States of Micronesia': 'Mikronēzijas Federatīvās Valstis',
  'Fiji': 'Fidži',
  'Finland': 'Somija',
  'France': 'Francija',
  'French Polynesia': 'Franču Polinēzija',
  'French Southern and Antarctic Lands': 'Francijas dienvidu un antarktiskie apgabali',
  'Gabon': 'Gabona',
  'Gambia': 'Gambija',
  'Georgia': 'Gruzija',
  'Germany': 'Vācija',
  'Ghana': 'Gana',
  'Greece': 'Grieķija',
  'Greenland': 'Grenlande',
  'Grenada': 'Grenāda',
  'Guam': 'Guama',
  'Guatemala': 'Gvatemala',
  'Guernsey': 'Gērnsija',
  'Guinea': 'Gvineja',
  'Guinea-Bissau': 'Gvineja-Bisava',
  'Guyana': 'Gajāna',
  'Haiti': 'Haiti',
  'Heard Island and McDonald Islands': 'Hērda Sala un Makdonalda Salas',
  'Honduras': 'Hondurasa',
  'Hong Kong': 'Honkonga',
  'Hong Kong S.A.R.': 'Honkonga',
  'Hungary': 'Ungārija',
  'Iceland': 'Islande',
  'India': 'Indija',
  'Indonesia': 'Indonēzija',
  'Iran': 'Irāna',
  'Iraq': 'Irāka',
  'Ireland': 'Īrija',
  'Isle of Man': 'Menas Sala',
  'Israel': 'Izraēla',
  'Italy': 'Itālija',
  'Jamaica': 'Jamaika',
  'Jersey': 'Džērsija',
  'Japan': 'Japāna',
  'Jordan': 'Jordānija',
  'Kazakhstan': 'Kazahstāna',
  'Kenya': 'Kenija',
  'Kiribati': 'Kiribati',
  'Kuwait': 'Kuveita',
  'Kyrgyzstan': 'Kirgizstāna',
  'Laos': 'Laosa',
  'Latvia': 'Latvija',
  'Lebanon': 'Libāna',
  'Lesotho': 'Lesoto',
  'Liberia': 'Libērija',
  'Libya': 'Lībija',
  'Liechtenstein': 'Lihtenšteina',
  'Lithuania': 'Lietuva',
  'Luxembourg': 'Luksemburga',
  'Macao': 'Makao',
  'Macao S.A.R': 'Makao',
  'Madagascar': 'Madagaskara',
  'Malawi': 'Malāvija',
  'Malaysia': 'Malaizija',
  'Maldives': 'Maldīvija',
  'Mali': 'Mali',
  'Malta': 'Malta',
  'Marshall Islands': 'Māršala Salas',
  'Mauritania': 'Mauritānija',
  'Mauritius': 'Maurīcija',
  'Mexico': 'Meksika',
  'Micronesia': 'Mikronēzija',
  'Moldova': 'Moldova',
  'Monaco': 'Monako',
  'Mongolia': 'Mongolija',
  'Montenegro': 'Melnkalne',
  'Montserrat': 'Montserrata',
  'Morocco': 'Maroka',
  'Mozambique': 'Mozambika',
  'Myanmar': 'Mjanma',
  'Namibia': 'Namībija',
  'Nauru': 'Nauru',
  'Nepal': 'Nepāla',
  'Netherlands': 'Nīderlande',
  'New Caledonia': 'Jaunkaledonija',
  'New Zealand': 'Jaunzēlande',
  'Niue': 'Niue',
  'Norfolk Island': 'Norfolkas Sala',
  'Northern Mariana Islands': 'Ziemeļu Marianas Salas',
  'Nicaragua': 'Nikaragva',
  'Niger': 'Nigēra',
  'Nigeria': 'Nigērija',
  'North Korea': 'Ziemeļkoreja',
  'North Macedonia': 'Ziemeļmaķedonija',
  'Norway': 'Norvēģija',
  'Oman': 'Omāna',
  'Pakistan': 'Pakistāna',
  'Palau': 'Palau',
  'Palestine': 'Palestīna',
  'Panama': 'Panama',
  'Papua New Guinea': 'Papua-Jaungvineja',
  'Paraguay': 'Paragvaja',
  'Peru': 'Peru',
  'Philippines': 'Filipīnas',
  'Pitcairn Islands': 'Pitkērnas Salas',
  'Poland': 'Polija',
  'Portugal': 'Portugāle',
  'Puerto Rico': 'Puerto Rico',
  'Qatar': 'Katara',
  'Romania': 'Rumānija',
  'Russia': 'Krievija',
  'Rwanda': 'Ruanda',
  'Saint Barthélemy': 'Senbartelmī',
  'Saint Helena': 'Sv. Helēnas Sala',
  'Saint Kitts and Nevis': 'Sentkitsa un Nevisa',
  'Saint Martin': 'Senmartēna',
  'Saint Pierre and Miquelon': 'Senpjēra un Mikelona',
  'Saint Lucia': 'Sentlūsija',
  'Saint Vincent and the Grenadines': 'Sentvinsenta un Grenadīnas',
  'Samoa': 'Samoa',
  'San Marino': 'Sanmarīno',
  'São Tomé and Príncipe': 'Santome un Prinsipi',
  'Sao Tome and Principe': 'Santome un Prinsipi',
  'Saudi Arabia': 'Saudu Arābija',
  'Senegal': 'Senegāla',
  'Serbia': 'Serbija',
  'Seychelles': 'Seišelu salas',
  'Sierra Leone': 'Sjerraleone',
  'Singapore': 'Singapūra',
  'Sint Maarten': 'Sintmārtena',
  'Slovakia': 'Slovākija',
  'Slovenia': 'Slovēnija',
  'Solomon Islands': 'Zālamana Salas',
  'Somalia': 'Somālija',
  'South Africa': 'Dienvidāfrika',
  'South Georgia and the South Sandwich Islands': 'Dienviddžordžija un Dienvidsendviču Salas',
  'South Korea': 'Dienvidkoreja',
  'South Sudan': 'Dienvidsudāna',
  'Spain': 'Spānija',
  'Sri Lanka': 'Šrilanka',
  'Sudan': 'Sudāna',
  'Suriname': 'Surinama',
  'Sweden': 'Zviedrija',
  'Switzerland': 'Šveice',
  'Syria': 'Sīrija',
  'Taiwan': 'Taivāna',
  'Tajikistan': 'Tadžikistāna',
  'Tanzania': 'Tanzānija',
  'Thailand': 'Taizeme',
  'Timor-Leste': 'Austrumtimora',
  'Togo': 'Togo',
  'Tonga': 'Tonga',
  'Trinidad and Tobago': 'Trinidāda un Tobāgo',
  'Tunisia': 'Tunisija',
  'Turks and Caicos Islands': 'Tērksas un Kaikosas Salas',
  'Turkey': 'Turcija',
  'Turkmenistan': 'Turkmenistāna',
  'Tuvalu': 'Tuvalu',
  'Uganda': 'Uganda',
  'Ukraine': 'Ukraina',
  'United States Virgin Islands': 'ASV Virdžīnu Salas',
  'United Arab Emirates': 'Apvienotie Arābu Emirāti',
  'United Kingdom': 'Apvienotā Karaliste',
  'United States of America': 'Amerikas Savienotās Valstis',
  'Uruguay': 'Urugvaja',
  'Uzbekistan': 'Uzbekistāna',
  'Vanuatu': 'Vanuatu',
  'Vatican': 'Vatikāns',
  'Venezuela': 'Venecuēla',
  'Wallis and Futuna': 'Volisa un Futuna',
  'Western Sahara': 'Rietumsahāra',
  'Vietnam': 'Vjetnama',
  'Yemen': 'Jemena',
  'Zambia': 'Zambija',
  'Zimbabwe': 'Zimbabve',
  'W. Sahara': 'Rietumsahāra',
  // Papildus varianti
  'Dem. Rep. Congo': 'Kongo Demokrātiskā Republika',
  'Democratic Republic of the Congo': 'Kongo Demokrātiskā Republika',
  'Republic of the Congo': 'Kongo Republika',
  'Republic of Congo': 'Kongo Republika',
  'Ivory Coast': 'Kotdivuāra',
  "Côte d'Ivoire": 'Kotdivuāra',
  'Swaziland': 'Esvatīni',
  'North Macedonia': 'Ziemeļmaķedonija',
  'Macedonia': 'Ziemeļmaķedonija',
  'East Timor': 'Austrumtimora',
  'Vatican City': 'Vatikāns',
  'The Bahamas': 'Bahamu Salas',
  'The Gambia': 'Gambija',
  'Lao PDR': 'Laosa',
  'South Korea': 'Dienvidkoreja',
  'Korea': 'Dienvidkoreja',
  'United States': 'Amerikas Savienotās Valstis',
  'USA': 'Amerikas Savienotās Valstis',
  'UK': 'Apvienotā Karaliste',
  'Britain': 'Apvienotā Karaliste',
  'Great Britain': 'Apvienotā Karaliste',
  'Falkland Islands': 'Folklenda Salas',
  'Åland': 'Olandes Salas',
  'Faroe Islands': 'Fēru Salas',
  'Guernsey': 'Gērnsija',
  'Isle of Man': 'Menas Sala',
  'Jersey': 'Džērsija',
  'American Samoa': 'Amerikāņu Samoa',
  'Cook Islands': 'Kuka Salas',
  'Federated States of Micronesia': 'Mikronēzijas Federatīvās Valstis',
  'French Polynesia': 'Franču Polinēzija',
  'Guam': 'Guama',
  'New Caledonia': 'Jaunkaledonija',
  'Niue': 'Niue',
  'Norfolk Island': 'Norfolkas Sala',
  'Northern Mariana Islands': 'Ziemeļu Marianas Salas',
  'Pitcairn Islands': 'Pitkērnas Salas',
  'Wallis and Futuna': 'Volisa un Futuna',
  'British Indian Ocean Territory': 'Indijas okeāna Britu teritorija',
  'French Southern and Antarctic Lands': 'Francijas dienvidu un antarktiskie apgabali',
  'Heard Island and McDonald Islands': 'Hērda Sala un Makdonalda Salas',
  'Saint Helena': 'Sv. Helēnas Sala',
  'South Georgia and the South Sandwich Islands': 'Dienviddžordžija un Dienvidsendviču Salas',
  'Anguilla': 'Angilja',
  'Aruba': 'Aruba',
  'Bermuda': 'Bermudu Salas',
  'British Virgin Islands': 'Britu Virdžīnu Salas',
  'Cayman Islands': 'Kaimanu Salas',
  'Curaçao': 'Kirasao',
  'Greenland': 'Grenlande',
  'Montserrat': 'Montserrata',
  'Saint Barthélemy': 'Senbartelmī',
  'Saint Martin': 'Senmartēna',
  'Saint Pierre and Miquelon': 'Senpjēra un Mikelona',
  'Sint Maarten': 'Sintmārtena',
  'Turks and Caicos Islands': 'Tērksas un Kaikosas Salas',
  'United States Virgin Islands': 'ASV Virdžīnu Salas'
};

// Ielasām esošo reģistru
const existingRegistryPath = path.join(__dirname, '../data/country_continent_lv.json');
let existingRegistry = [];
const existingByIso = new Map();

if (fs.existsSync(existingRegistryPath)) {
  existingRegistry = JSON.parse(fs.readFileSync(existingRegistryPath, 'utf8'));
  existingRegistry.forEach(item => {
    if (item.iso_a2) {
      existingByIso.set(item.iso_a2.toUpperCase(), item.country);
    }
  });
}

// Ielasām GeoJSON
const geojsonPath = path.join(__dirname, '../data/countries_simplified.geojson.json');
const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

const result = [];
const seen = new Set();

geojson.features.forEach(feature => {
  const props = feature.properties || {};
  const iso_a2 = (props.ISO_A2 || '').toUpperCase();
  const nameEn = props.NAME_EN || props.NAME || props.ADMIN;
  const continentEn = props.CONTINENT || '';

  if (!iso_a2 || iso_a2.length !== 2 || iso_a2 === '-99') return;
  if (seen.has(iso_a2)) return;
  seen.add(iso_a2);

  // Prioritāte latviešu nosaukumam:
  // 1. Kartējums no angļu uz latviešu (mēģinām visus nosaukumu variantus)
  // 2. Esošais reģistrs (ja ir un nav angļu valodā)
  // 3. Angļu nosaukums
  let countryLv = null;

  // Vispirms mēģinām atrast tulkojumu no kartējuma
  const possibleNames = [
    props.NAME_EN,
    props.NAME,
    props.ADMIN,
    props.NAME_LONG,
    props.SOVEREIGNT
  ].filter(Boolean);

  for (const name of possibleNames) {
    if (countryNamesLV[name]) {
      countryLv = countryNamesLV[name];
      break;
    }
  }

  // Ja nav atrasts kartējumā, izmantojam esošo reģistru
  if (!countryLv) {
    const existing = existingByIso.get(iso_a2);
    // Pārbaudām, vai esošais nav angļu valodā (nav neviens no possibleNames)
    if (existing && !possibleNames.includes(existing)) {
      countryLv = existing;
    }
  }

  // Ja vēl arvien nav atrasts, izmantojam angļu nosaukumu
  if (!countryLv) {
    countryLv = nameEn;
    if (iso_a2) {
      console.warn(`⚠️  Nav atrasts tulkojums: ${iso_a2} - ${nameEn}`);
    }
  }

  // Kontinents latviski
  let continentLv = continentMap[continentEn] || continentEn;

  result.push({
    country: countryLv,
    continent: continentLv,
    iso_a2: iso_a2
  });
});

// Kārtojam pēc kontinenta un valsts nosaukuma
result.sort((a, b) => {
  if (a.continent !== b.continent) {
    return a.continent.localeCompare(b.continent, 'lv');
  }
  return a.country.localeCompare(b.country, 'lv');
});

// Saglabājam
const outputPath = path.join(__dirname, '../data/country_continent_lv.json');
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

console.log(`✅ Izveidoti ${result.length} ieraksti`);
console.log(`📝 Saglabāts: ${outputPath}`);

// Izvadām visus valstu nosaukumus
console.log('\n📋 Visi valstu nosaukumi latviešu valodā:\n');
result.forEach((item, i) => {
  console.log(`${i + 1}. ${item.country} (${item.iso_a2}) - ${item.continent}`);
});
