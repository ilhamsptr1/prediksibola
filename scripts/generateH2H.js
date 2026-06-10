import fs from 'fs';
import readline from 'readline';

// Mapping dari nama di aplikasi kita ke nama di dataset Kaggle
const nameMapping = {
  "Bosnia & Herz.": "Bosnia and Herzegovina",
  "USA": "United States",
  "Türkiye": "Turkey",
  "Cabo Verde": "Cape Verde",
  "Curaçao": "Curacao"
};

const reverseMapping = Object.fromEntries(
  Object.entries(nameMapping).map(([k, v]) => [v, k])
);

const getAppName = (csvName) => reverseMapping[csvName] || csvName;
const getCsvName = (appName) => nameMapping[appName] || appName;

async function processCSV(csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.error(`File ${csvPath} tidak ditemukan. Pastikan file CSV ada.`);
    return;
  }

  const h2hDict = {};
  
  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    
    // Split berdasarkan koma (mempertimbangkan tanda kutip jika ada di nama turnamen)
    const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (parts.length < 6) continue;

    const [date, home, away, homeScore, awayScore, tournament] = parts;

    // Kembalikan nama CSV ke nama yang dikenali aplikasi kita
    const appHome = getAppName(home);
    const appAway = getAppName(away);

    const parsedHomeScore = parseInt(homeScore);
    const parsedAwayScore = parseInt(awayScore);

    // Skip pertandingan yang belum dimainkan (skor belum ada / NaN)
    if (isNaN(parsedHomeScore) || isNaN(parsedAwayScore)) continue;

    const matchData = {
      date: new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      homeTeam: appHome,
      awayTeam: appAway,
      homeScore: parsedHomeScore,
      awayScore: parsedAwayScore,
      tournament: tournament.replace(/"/g, '') // Buang tanda kutip
    };

    // Gabungkan nama kedua tim berdasarkan alfabet sebagai key unik (agar home/away tidak masalah)
    const sortedKey = [appHome, appAway].sort().join('-');
    if (!h2hDict[sortedKey]) h2hDict[sortedKey] = [];
    h2hDict[sortedKey].push(matchData);
  }

  // Urutkan setiap array histori dari yang paling terbaru (descending)
  for (const key in h2hDict) {
    h2hDict[key].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // Kita hanya akan menyimpan pasangan tim yang ada di mockSchedule babak grup
  const relevantPairs = [
    ["Mexico", "South Africa"], ["South Korea", "Czechia"], ["Mexico", "South Korea"], ["South Africa", "Czechia"], ["Mexico", "Czechia"], ["South Africa", "South Korea"],
    ["Canada", "Bosnia & Herz."], ["Qatar", "Switzerland"], ["Canada", "Qatar"], ["Bosnia & Herz.", "Switzerland"], ["Canada", "Switzerland"], ["Bosnia & Herz.", "Qatar"],
    ["Brazil", "Morocco"], ["Haiti", "Scotland"], ["Brazil", "Haiti"], ["Scotland", "Morocco"], ["Brazil", "Scotland"], ["Morocco", "Haiti"],
    ["USA", "Paraguay"], ["Australia", "Türkiye"], ["USA", "Australia"], ["Paraguay", "Türkiye"], ["USA", "Türkiye"], ["Paraguay", "Australia"],
    ["Germany", "Curaçao"], ["Ivory Coast", "Ecuador"], ["Germany", "Ivory Coast"], ["Ecuador", "Curaçao"], ["Curaçao", "Ivory Coast"], ["Ecuador", "Germany"],
    ["Netherlands", "Japan"], ["Sweden", "Tunisia"], ["Netherlands", "Sweden"], ["Tunisia", "Japan"], ["Japan", "Sweden"], ["Tunisia", "Netherlands"],
    ["Belgium", "Egypt"], ["Iran", "New Zealand"], ["Belgium", "Iran"], ["New Zealand", "Egypt"], ["Belgium", "New Zealand"], ["Egypt", "Iran"],
    ["Spain", "Cabo Verde"], ["Saudi Arabia", "Uruguay"], ["Spain", "Saudi Arabia"], ["Uruguay", "Cabo Verde"], ["Cabo Verde", "Saudi Arabia"], ["Uruguay", "Spain"],
    ["France", "Senegal"], ["Iraq", "Norway"], ["France", "Iraq"], ["Norway", "Senegal"], ["Norway", "France"], ["Senegal", "Iraq"],
    ["Argentina", "Algeria"], ["Austria", "Jordan"], ["Argentina", "Austria"], ["Jordan", "Algeria"], ["Algeria", "Austria"], ["Jordan", "Argentina"],
    ["Portugal", "Uzbekistan"], ["Colombia", "DR Congo"], ["Colombia", "Portugal"], ["DR Congo", "Uzbekistan"], ["Portugal", "DR Congo"], ["Uzbekistan", "Colombia"],
    ["England", "Croatia"], ["Ghana", "Panama"], ["England", "Ghana"], ["Panama", "Croatia"], ["Panama", "England"], ["Croatia", "Ghana"]
  ];

  const filteredH2H = {};
  relevantPairs.forEach(([t1, t2]) => {
    const sortedKey = [t1, t2].sort().join('-');
    if (h2hDict[sortedKey] && h2hDict[sortedKey].length > 0) {
      // Ambil 5 pertandingan terbaru untuk setiap pasangan
      filteredH2H[`${t1}-${t2}`] = h2hDict[sortedKey].slice(0, 5);
    }
  });

  const outputCode = `// File ini dibuat otomatis oleh skrip generateH2H.js\n\nexport const H2H_DATA = ${JSON.stringify(filteredH2H, null, 2)};\n\nexport const getH2H = (team1, team2) => {\n  const key1 = \`\${team1}-\${team2}\`;\n  const key2 = \`\${team2}-\${team1}\`;\n  \n  if (H2H_DATA[key1]) return H2H_DATA[key1];\n  if (H2H_DATA[key2]) return H2H_DATA[key2];\n  \n  return [];\n};\n`;

  fs.writeFileSync('./src/data/h2hData.js', outputCode, 'utf8');
  console.log('✅ File src/data/h2hData.js berhasil diperbarui dengan rincian H2H baru dari CSV!');
}

// Ambil path CSV dari argumen command-line, jika tidak ada, gunakan default 'results.csv' di root folder
const csvPath = process.argv[2] || 'results.csv';
processCSV(csvPath);
