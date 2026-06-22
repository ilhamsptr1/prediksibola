import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_FILE = path.join(__dirname, '../results.csv');
const OUTPUT_FILE = path.join(__dirname, '../src/data/teamRatings.json');

// Only consider matches from 2010 onwards for modern relevance
const MIN_YEAR = 2010;

const teams = {};
let totalGoals = 0;
let totalMatches = 0;

console.log("Mulai melatih model AI dari dataset historis (results.csv)...");

fs.createReadStream(CSV_FILE)
  .pipe(csv())
  .on('data', (data) => {
    const year = parseInt(data.date.split('-')[0], 10);
    if (year < MIN_YEAR) return;

    const homeTeam = data.home_team;
    const awayTeam = data.away_team;
    const homeScore = parseInt(data.home_score, 10);
    const awayScore = parseInt(data.away_score, 10);

    if (isNaN(homeScore) || isNaN(awayScore)) return;

    if (!teams[homeTeam]) {
      teams[homeTeam] = { matches: 0, goalsScored: 0, goalsConceded: 0, homeMatches: 0 };
    }
    if (!teams[awayTeam]) {
      teams[awayTeam] = { matches: 0, goalsScored: 0, goalsConceded: 0, awayMatches: 0 };
    }

    teams[homeTeam].matches += 1;
    teams[homeTeam].homeMatches += 1;
    teams[homeTeam].goalsScored += homeScore;
    teams[homeTeam].goalsConceded += awayScore;

    teams[awayTeam].matches += 1;
    teams[awayTeam].awayMatches += 1;
    teams[awayTeam].goalsScored += awayScore;
    teams[awayTeam].goalsConceded += homeScore;

    totalGoals += (homeScore + awayScore);
    totalMatches += 1;
  })
  .on('end', () => {
    console.log(`Berhasil memproses ${totalMatches} pertandingan sejak tahun ${MIN_YEAR}.`);
    
    const globalAvgGoalsPerMatch = totalGoals / totalMatches; // usually around 2.6
    // Avg goals per team per match is half of that
    const globalAvgGoalsPerTeam = globalAvgGoalsPerMatch / 2;

    const teamRatings = {};
    const aiPowerRanking = [];

    // Calculate Attack & Defense Strength for Poisson Model
    for (const [teamName, stats] of Object.entries(teams)) {
      if (stats.matches < 10) continue; // Ignore teams with very few matches

      const avgScored = stats.goalsScored / stats.matches;
      const avgConceded = stats.goalsConceded / stats.matches;

      // Attack Strength = Team Avg Scored / Global Avg Scored
      const attackStrength = avgScored / globalAvgGoalsPerTeam;
      
      // Defense Strength = Team Avg Conceded / Global Avg Conceded
      // (Lower is better for defense strength in Poisson, it means they concede less)
      const defenseStrength = avgConceded / globalAvgGoalsPerTeam;

      // Overall Power Index (Just for the Leaderboard/Ranking visual)
      // Higher attack is good, lower defense is good.
      // Base 50, + (Attack - 1) * 25, - (Defense - 1) * 25
      let powerIndex = 50 + ((attackStrength - 1) * 25) - ((defenseStrength - 1) * 25);
      powerIndex = Math.min(99, Math.max(10, Math.round(powerIndex)));

      teamRatings[teamName] = {
        attack: attackStrength,
        defense: defenseStrength,
        powerIndex: powerIndex,
        matchesAnalyzed: stats.matches
      };

      aiPowerRanking.push({
        name: teamName,
        powerIndex: powerIndex,
        attack: attackStrength.toFixed(2),
        defense: defenseStrength.toFixed(2),
        matches: stats.matches
      });
    }

    // Sort power ranking
    aiPowerRanking.sort((a, b) => b.powerIndex - a.powerIndex);

    const finalData = {
      globalAvgGoalsPerTeam,
      teamRatings,
      aiPowerRanking: aiPowerRanking.slice(0, 100) // Top 100
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
    console.log(`✅ Model berhasil dilatih! Data disimpan ke: ${OUTPUT_FILE}`);
  });
