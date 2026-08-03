/**
 * Update Elo ratings untuk mencerminkan kekuatan tim musim 2025/26
 * Berdasarkan performa aktual musim 2024/25
 */
const fs = require('fs');
const data = require('./src/data/teamRatings.json');

// Updated Elo ratings based on 2024/25 final standings & performance
const ELO_UPDATES = {
  // Premier League 2025/26 (berdasarkan hasil akhir 24/25)
  // Liverpool juara, Arsenal 2nd, Chelsea 3rd, Newcastle 5th, Man City 6th, Man Utd 15th
  'Liverpool':              { elo: 1920, attack: 1.58, defense: 0.62, formWinRate: 0.72, formDrawRate: 0.16, formAvgGF: 2.15, formAvgGA: 0.85, formScore: 0.72 },
  'Arsenal':                { elo: 1810, attack: 1.38, defense: 0.72, formWinRate: 0.68, formDrawRate: 0.18, formAvgGF: 1.95, formAvgGA: 0.90, formScore: 0.65 },
  'Chelsea':                { elo: 1760, attack: 1.42, defense: 0.78, formWinRate: 0.62, formDrawRate: 0.20, formAvgGF: 1.88, formAvgGA: 1.05, formScore: 0.58 },
  'Aston Villa':            { elo: 1720, attack: 1.28, defense: 0.82, formWinRate: 0.58, formDrawRate: 0.22, formAvgGF: 1.72, formAvgGA: 1.10, formScore: 0.52 },
  'Newcastle United':       { elo: 1700, attack: 1.22, defense: 0.80, formWinRate: 0.58, formDrawRate: 0.20, formAvgGF: 1.65, formAvgGA: 1.05, formScore: 0.50 },
  'Manchester City':        { elo: 1780, attack: 1.48, defense: 0.72, formWinRate: 0.62, formDrawRate: 0.18, formAvgGF: 1.90, formAvgGA: 0.95, formScore: 0.58 },
  'Tottenham Hotspur':      { elo: 1660, attack: 1.20, defense: 0.88, formWinRate: 0.52, formDrawRate: 0.22, formAvgGF: 1.60, formAvgGA: 1.20, formScore: 0.44 },
  'Manchester United':      { elo: 1560, attack: 1.05, defense: 1.02, formWinRate: 0.42, formDrawRate: 0.22, formAvgGF: 1.35, formAvgGA: 1.45, formScore: 0.28 },
  'Brighton & Hove Albion': { elo: 1640, attack: 1.18, defense: 0.90, formWinRate: 0.50, formDrawRate: 0.24, formAvgGF: 1.55, formAvgGA: 1.20, formScore: 0.42 },
  'Fulham':                 { elo: 1580, attack: 1.08, defense: 1.00, formWinRate: 0.44, formDrawRate: 0.24, formAvgGF: 1.40, formAvgGA: 1.35, formScore: 0.32 },
  'West Ham United':        { elo: 1580, attack: 1.05, defense: 1.05, formWinRate: 0.42, formDrawRate: 0.24, formAvgGF: 1.35, formAvgGA: 1.40, formScore: 0.30 },
  'Crystal Palace':         { elo: 1550, attack: 0.95, defense: 1.02, formWinRate: 0.40, formDrawRate: 0.26, formAvgGF: 1.20, formAvgGA: 1.40, formScore: 0.26 },
  'Wolverhampton Wanderers':{ elo: 1520, attack: 0.92, defense: 1.10, formWinRate: 0.36, formDrawRate: 0.28, formAvgGF: 1.10, formAvgGA: 1.50, formScore: 0.20 },
  'Brentford':              { elo: 1550, attack: 1.00, defense: 1.05, formWinRate: 0.40, formDrawRate: 0.26, formAvgGF: 1.30, formAvgGA: 1.42, formScore: 0.28 },
  'Nottingham Forest':      { elo: 1610, attack: 1.05, defense: 0.88, formWinRate: 0.50, formDrawRate: 0.22, formAvgGF: 1.38, formAvgGA: 1.08, formScore: 0.42 },
  'AFC Bournemouth':        { elo: 1560, attack: 1.05, defense: 1.02, formWinRate: 0.44, formDrawRate: 0.22, formAvgGF: 1.40, formAvgGA: 1.38, formScore: 0.32 },
  'Everton':                { elo: 1500, attack: 0.90, defense: 1.10, formWinRate: 0.35, formDrawRate: 0.28, formAvgGF: 1.05, formAvgGA: 1.50, formScore: 0.18 },
  'Ipswich Town':           { elo: 1440, attack: 0.82, defense: 1.18, formWinRate: 0.28, formDrawRate: 0.26, formAvgGF: 0.95, formAvgGA: 1.65, formScore: 0.10 },
  'Leicester City':         { elo: 1420, attack: 0.80, defense: 1.20, formWinRate: 0.26, formDrawRate: 0.24, formAvgGF: 0.90, formAvgGA: 1.70, formScore: 0.08 },
  'Southampton':            { elo: 1380, attack: 0.72, defense: 1.30, formWinRate: 0.20, formDrawRate: 0.22, formAvgGF: 0.75, formAvgGA: 1.85, formScore: 0.04 },
  // Promosi 2025/26 - team baru promosi dari Championship
  'Leeds United':           { elo: 1540, attack: 1.02, defense: 1.00, formWinRate: 0.45, formDrawRate: 0.24, formAvgGF: 1.48, formAvgGA: 1.20, formScore: 0.35 },
  'Coventry City':          { elo: 1460, attack: 0.88, defense: 1.15, formWinRate: 0.35, formDrawRate: 0.26, formAvgGF: 1.15, formAvgGA: 1.45, formScore: 0.18 },
  'Sunderland':             { elo: 1450, attack: 0.85, defense: 1.18, formWinRate: 0.33, formDrawRate: 0.26, formAvgGF: 1.10, formAvgGA: 1.50, formScore: 0.15 },
  'Hull City':              { elo: 1420, attack: 0.80, defense: 1.22, formWinRate: 0.30, formDrawRate: 0.25, formAvgGF: 1.02, formAvgGA: 1.55, formScore: 0.12 },
  // La Liga 2025/26 (berdasarkan 24/25)
  // Barcelona juara, Real Madrid 2nd, Atletico 3rd
  'Barcelona':              { elo: 1870, attack: 1.82, defense: 0.60, formWinRate: 0.74, formDrawRate: 0.14, formAvgGF: 2.42, formAvgGA: 0.82, formScore: 0.74 },
  'Real Madrid':            { elo: 1850, attack: 1.65, defense: 0.65, formWinRate: 0.70, formDrawRate: 0.16, formAvgGF: 2.20, formAvgGA: 0.90, formScore: 0.68 },
  'Atletico Madrid':        { elo: 1780, attack: 1.22, defense: 0.58, formWinRate: 0.65, formDrawRate: 0.20, formAvgGF: 1.75, formAvgGA: 0.80, formScore: 0.62 },
  'Athletic Club':          { elo: 1680, attack: 1.15, defense: 0.78, formWinRate: 0.55, formDrawRate: 0.22, formAvgGF: 1.58, formAvgGA: 1.05, formScore: 0.48 },
  'Real Betis':             { elo: 1620, attack: 1.05, defense: 0.92, formWinRate: 0.48, formDrawRate: 0.24, formAvgGF: 1.42, formAvgGA: 1.20, formScore: 0.38 },
  'Real Sociedad':          { elo: 1600, attack: 1.08, defense: 0.90, formWinRate: 0.46, formDrawRate: 0.24, formAvgGF: 1.38, formAvgGA: 1.18, formScore: 0.36 },
  'Villarreal':             { elo: 1640, attack: 1.15, defense: 0.85, formWinRate: 0.50, formDrawRate: 0.22, formAvgGF: 1.50, formAvgGA: 1.10, formScore: 0.42 },
  'Sevilla':                { elo: 1580, attack: 1.02, defense: 0.95, formWinRate: 0.42, formDrawRate: 0.24, formAvgGF: 1.28, formAvgGA: 1.32, formScore: 0.28 },
  'Girona':                 { elo: 1580, attack: 1.12, defense: 0.90, formWinRate: 0.44, formDrawRate: 0.22, formAvgGF: 1.45, formAvgGA: 1.18, formScore: 0.35 },
  'Valencia':               { elo: 1520, attack: 0.95, defense: 1.05, formWinRate: 0.38, formDrawRate: 0.26, formAvgGF: 1.18, formAvgGA: 1.42, formScore: 0.22 },
  'Osasuna':                { elo: 1520, attack: 0.88, defense: 0.98, formWinRate: 0.40, formDrawRate: 0.26, formAvgGF: 1.12, formAvgGA: 1.30, formScore: 0.25 },
  'Getafe':                 { elo: 1490, attack: 0.80, defense: 1.05, formWinRate: 0.35, formDrawRate: 0.28, formAvgGF: 0.98, formAvgGA: 1.38, formScore: 0.18 },
  'Rayo Vallecano':         { elo: 1500, attack: 0.88, defense: 1.02, formWinRate: 0.38, formDrawRate: 0.26, formAvgGF: 1.05, formAvgGA: 1.30, formScore: 0.22 },
  'Alavés':                 { elo: 1450, attack: 0.78, defense: 1.15, formWinRate: 0.30, formDrawRate: 0.28, formAvgGF: 0.90, formAvgGA: 1.55, formScore: 0.12 },
  'Celta Vigo':             { elo: 1500, attack: 0.90, defense: 1.05, formWinRate: 0.38, formDrawRate: 0.26, formAvgGF: 1.10, formAvgGA: 1.35, formScore: 0.22 },
  'Mallorca':               { elo: 1480, attack: 0.80, defense: 1.08, formWinRate: 0.35, formDrawRate: 0.28, formAvgGF: 0.95, formAvgGA: 1.40, formScore: 0.18 },
  'Las Palmas':             { elo: 1450, attack: 0.78, defense: 1.15, formWinRate: 0.30, formDrawRate: 0.26, formAvgGF: 0.88, formAvgGA: 1.55, formScore: 0.12 },
};

let updateCount = 0;
for (const [team, stats] of Object.entries(ELO_UPDATES)) {
  if (data.teamRatings[team]) {
    data.teamRatings[team] = { ...data.teamRatings[team], ...stats };
    updateCount++;
    console.log(`✓ Updated ${team}: Elo ${stats.elo}`);
  } else {
    data.teamRatings[team] = stats;
    updateCount++;
    console.log(`+ Added ${team}: Elo ${stats.elo}`);
  }
}

fs.writeFileSync('./src/data/teamRatings.json', JSON.stringify(data, null, 2));
console.log(`\nDone. Updated/added ${updateCount} teams.`);
