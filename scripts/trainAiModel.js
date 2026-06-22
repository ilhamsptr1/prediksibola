/**
 * ============================================================
 *  ADVANCED AI FOOTBALL PREDICTOR — ELO + POISSON TRAINER
 * ============================================================
 *  Algorithm: FIFA-style Elo Rating + Poisson Score Prediction
 *
 *  Steps:
 *  1. Process every match chronologically (2000–present).
 *  2. Update each team's Elo rating after every match using
 *     the classic Elo formula with:
 *       - Variable K-factor per tournament tier
 *       - Goal-difference multiplier (winning 4-0 > winning 1-0)
 *       - Home advantage offset (+50 Elo points for home)
 *       - Time decay: Elo drifts toward 1500 for inactive teams
 *  3. Derive Attack & Defense ratings from weighted-average
 *     goals scored/conceded (weighted by time and opponent Elo).
 *  4. Save ratings → teamRatings.json for the front-end.
 * ============================================================
 */

import fs   from 'fs';
import path from 'path';
import csv  from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CSV_FILE    = path.join(__dirname, '../results.csv');
const OUTPUT_FILE = path.join(__dirname, '../src/data/teamRatings.json');

// ── Config ─────────────────────────────────────────────────────────────────
const MIN_YEAR        = 2000;   // Elo needs history to converge; start from 2000
const BASE_ELO        = 1500;
const HOME_ADVANTAGE  = 50;     // Elo points added for home team expectation
const DECAY_RATE      = 0.99;   // Per-year Elo regression toward mean (for inactivity)
const MIN_MATCHES     = 15;     // Minimum matches to be included in output
const NOW_YEAR        = 2025;

// K-factor by tournament importance — controls how much each match moves Elo
const K_FACTORS = {
  'FIFA World Cup':                  60,
  'UEFA Euro':                       50,
  'Copa América':                    50,
  'Africa Cup of Nations':           45,
  'AFC Asian Cup':                   45,
  'CONCACAF Gold Cup':               40,
  'OFC Nations Cup':                 40,
  'FIFA Confederations Cup':         45,
  'FIFA World Cup qualification':    40,
  'UEFA Euro qualification':         35,
  'Copa América qualification':      35,
  'AFC Asian Cup qualification':     35,
  'Africa Cup of Nations qualification': 35,
  'CONCACAF Gold Cup qualification': 30,
  'UEFA Nations League':             35,
  'Friendly':                        20,
};

const getKFactor = (tournament) => {
  for (const [key, k] of Object.entries(K_FACTORS)) {
    if (tournament.includes(key)) return k;
  }
  return 30; // default for other competitions
};

// Goal-difference multiplier (FIFA Elo formula)
const goalDiffMultiplier = (gd) => {
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8;
};

// Non-FIFA / micro-nation teams to exclude from output rankings
const EXCLUDED_TEAMS = new Set([
  'Occitania','Padania','Northern Cyprus','Isle of Man','Tibet',
  'Chagos Islands','Provence','Yorkshire','Cascadia','Ellan Vannin',
  'Abkhazia','South Ossetia','Somaliland','Matabeleland',
  'Székely Land','Romani people','Sápmi','Iraqi Kurdistan',
  'Zanzibar','Balearic Islands','Greenland','Monaco','Vatican',
  'Ynys Môn','Alderney','Guernsey','Jersey','Kernow',
  'County of Nice','Brittany','Lapland','Western Sahara',
]);

// ── Helper: expected result from Elo ────────────────────────────────────────
// Returns P(home wins) using standard Elo formula
const expectedScore = (homeElo, awayElo) =>
  1 / (1 + Math.pow(10, (awayElo - homeElo - HOME_ADVANTAGE) / 400));

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   ADVANCED AI — ELO + POISSON TRAINING               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Dataset : ${CSV_FILE}`);
  console.log(`  Min Year: ${MIN_YEAR} | Home Adv: +${HOME_ADVANTAGE} Elo\n`);

  // 1. Load ALL matches sorted chronologically
  const allMatches = await new Promise((resolve) => {
    const rows = [];
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', (row) => {
        const year = parseInt(row.date.split('-')[0], 10);
        const homeScore = parseInt(row.home_score, 10);
        const awayScore = parseInt(row.away_score, 10);
        if (isNaN(homeScore) || isNaN(awayScore)) return;
        if (EXCLUDED_TEAMS.has(row.home_team) || EXCLUDED_TEAMS.has(row.away_team)) return;
        rows.push({
          date: row.date,
          year,
          homeTeam:   row.home_team,
          awayTeam:   row.away_team,
          homeScore,
          awayScore,
          tournament: row.tournament || '',
          neutral:    row.neutral === 'TRUE',
        });
      })
      .on('end', () => {
        rows.sort((a, b) => a.date.localeCompare(b.date));
        resolve(rows);
      });
  });

  console.log(`✔ Loaded ${allMatches.length} matches. Running Elo simulation...\n`);

  // 2. Elo state for every team
  const elo          = {};          // Current Elo
  const lastYear     = {};          // Year of last match (for decay)
  const matchCount   = {};          // Total matches played
  const wGoalsFor    = {};          // Weighted goals scored (for Poisson ATK)
  const wGoalsAgainst = {};         // Weighted goals conceded (for Poisson DEF)
  const wTotal       = {};          // Total weight (for normalization)
  const recentForm   = {};          // Last 5 results for display

  const getElo = (team) => elo[team] ?? BASE_ELO;

  const applyDecay = (team, currentYear) => {
    if (!(team in lastYear)) return;
    const yearsInactive = currentYear - lastYear[team];
    if (yearsInactive > 0) {
      // Drift toward BASE_ELO proportionally
      elo[team] = getElo(team) + (BASE_ELO - getElo(team)) * (1 - Math.pow(DECAY_RATE, yearsInactive));
    }
  };

  // 3. Process each match chronologically
  for (const m of allMatches) {
    if (m.year < MIN_YEAR) continue;

    const { homeTeam, awayTeam, homeScore, awayScore, year, tournament, neutral } = m;

    // Apply inactivity decay before the match
    applyDecay(homeTeam, year);
    applyDecay(awayTeam, year);

    const homeElo = getElo(homeTeam);
    const awayElo = getElo(awayTeam);

    // Expected outcome (0=away wins, 0.5=draw, 1=home wins)
    const exp = neutral
      ? 1 / (1 + Math.pow(10, (awayElo - homeElo) / 400))
      : expectedScore(homeElo, awayElo);

    // Actual outcome
    const act = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;

    // Elo update
    const K  = getKFactor(tournament);
    const GD = Math.abs(homeScore - awayScore);
    const GDM = goalDiffMultiplier(GD);
    const delta = K * GDM * (act - exp);

    elo[homeTeam] = homeElo + delta;
    elo[awayTeam] = awayElo - delta;

    // Record last active year
    lastYear[homeTeam] = year;
    lastYear[awayTeam] = year;

    // Match counter
    matchCount[homeTeam] = (matchCount[homeTeam] || 0) + 1;
    matchCount[awayTeam] = (matchCount[awayTeam] || 0) + 1;

    // Weighted stats for Poisson model
    // Weight = time recency (exponential) × tournament importance
    const ageYears  = NOW_YEAR - year;
    const timeW     = Math.pow(0.5, ageYears / 4);  // half-life 4 years
    const tournW    = K / 30;                         // normalize K to ~1.0
    const w         = timeW * tournW;

    for (const [team, scored, conceded] of [
      [homeTeam, homeScore, awayScore],
      [awayTeam, awayScore, homeScore],
    ]) {
      wGoalsFor[team]    = (wGoalsFor[team]    || 0) + scored   * w;
      wGoalsAgainst[team] = (wGoalsAgainst[team] || 0) + conceded * w;
      wTotal[team]        = (wTotal[team]        || 0) + w;

      if (!recentForm[team]) recentForm[team] = [];
      if (m.year >= NOW_YEAR - 2) {
        const result = team === homeTeam
          ? (homeScore > awayScore ? 'W' : homeScore === awayScore ? 'D' : 'L')
          : (awayScore > homeScore ? 'W' : homeScore === awayScore ? 'D' : 'W');
        recentForm[team].push(result);
        if (recentForm[team].length > 5) recentForm[team].shift();
      }
    }
  }

  console.log('✔ Elo simulation complete. Deriving Poisson ratings...\n');

  // 4. Compute global weighted average goals per team per match
  let totalWGoals = 0, totalW = 0;
  for (const team of Object.keys(wTotal)) {
    if ((matchCount[team] || 0) < MIN_MATCHES) continue;
    totalWGoals += wGoalsFor[team];
    totalW      += wTotal[team];
  }
  const globalAvg = totalWGoals / totalW;
  console.log(`  Global weighted avg goals/team/match: ${globalAvg.toFixed(4)}`);

  // 5. Derive Attack & Defense Strength (Poisson coefficients)
  const teamRatings  = {};
  const aiPowerRanking = [];

  for (const [team, count] of Object.entries(matchCount)) {
    if (count < MIN_MATCHES) continue;
    if (EXCLUDED_TEAMS.has(team)) continue;

    const avgScored    = wGoalsFor[team]     / wTotal[team];
    const avgConceded  = wGoalsAgainst[team] / wTotal[team];
    const attack       = avgScored   / globalAvg;
    const defense      = avgConceded / globalAvg;

    const teamElo = Math.round(getElo(team));

    // Power Index: blend Elo (main signal) + ATK/DEF bonus
    // Normalize Elo to 0-99 scale: 1500 = 50, 2000 = 99, 1000 = 10
    const eloPower   = Math.min(99, Math.max(10, Math.round((teamElo - 1000) / 10)));
    const atkBonus   = Math.round((attack  - 1) * 10);
    const defBonus   = Math.round((1 - defense) * 10);
    let powerIndex   = Math.round(eloPower * 0.7 + (50 + atkBonus + defBonus) * 0.3);
    powerIndex       = Math.min(99, Math.max(10, powerIndex));

    teamRatings[team] = {
      elo:     teamElo,
      attack,
      defense,
      powerIndex,
      matchesAnalyzed: count,
    };

    aiPowerRanking.push({
      name:       team,
      elo:        teamElo,
      powerIndex,
      attack:     attack.toFixed(3),
      defense:    defense.toFixed(3),
      form:       (recentForm[team] || []).join(''),
      matches:    count,
    });
  }

  // Sort by Elo (primary) then powerIndex
  aiPowerRanking.sort((a, b) => b.elo - a.elo || b.powerIndex - a.powerIndex);

  // 6. Write output
  const finalData = {
    modelVersion:         'elo-poisson-v3',
    algorithm:            'FIFA-style Elo + Time-Decay Poisson (home advantage, goal-diff multiplier, K-factor by tournament)',
    globalAvgGoalsPerTeam: globalAvg,
    homeAdvantageElo:     HOME_ADVANTAGE,
    teamRatings,
    aiPowerRanking: aiPowerRanking.slice(0, 150),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   TRAINING COMPLETE ✅                                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Teams rated : ${aiPowerRanking.length}`);
  console.log(`  Output      : ${OUTPUT_FILE}\n`);
  console.log('  🏆 Top 10 Teams by Elo:');
  aiPowerRanking.slice(0, 10).forEach((t, i) => {
    console.log(`    ${String(i+1).padStart(2)}. ${t.name.padEnd(26)} Elo:${String(t.elo).padStart(5)}  ATK:${t.attack}  DEF:${t.defense}  Power:${t.powerIndex}`);
  });
})();
