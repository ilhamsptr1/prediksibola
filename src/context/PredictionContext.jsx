import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import teamRatingsData from '../data/teamRatings.json';
import { getLeague } from '../data/leagues';
import { fetchOddsForLeague, findMatchOdds, oddsToFairProbs } from '../services/oddsService.js';

const PredictionContext = createContext();
export const usePredictions = () => useContext(PredictionContext);

// ── Fallback: Elo + Poisson + Dixon-Coles (no ML model needed) ──
const poissonPMF = (k, l) => { if (l <= 0) return k === 0 ? 1 : 0; let r = Math.exp(-l); for (let i = 1; i <= k; i++) r *= l / i; return r; };
const dcTau = (i, j, l, u, rho = -0.1) => {
  if (i === 0 && j === 0) return 1 - l * u * rho;
  if (i === 0 && j === 1) return 1 + l * rho;
  if (i === 1 && j === 0) return 1 + u * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
};

const eloPoisson = (homeStats, awayStats, globalAvg) => {
  const hAtk = homeStats?.attack  ?? 1.0, hDef = homeStats?.defense ?? 1.0;
  const aAtk = awayStats?.attack  ?? 1.0, aDef = awayStats?.defense ?? 1.0;
  const hElo = homeStats?.elo ?? 1500,    aElo = awayStats?.elo ?? 1500;
  const eloDiff = hElo - aElo;
  const xGH = Math.max(0.1, Math.min(5, hAtk * aDef * globalAvg * 1.10 * (1 + eloDiff / 2000)));
  const xGA = Math.max(0.1, Math.min(5, aAtk * hDef * globalAvg        * (1 - eloDiff / 2000)));
  let pH = 0, pD = 0, pA = 0, bP = -1, bH = 0, bA = 0;
  for (let h = 0; h <= 8; h++) for (let a = 0; a <= 8; a++) {
    const p = poissonPMF(h, xGH) * poissonPMF(a, xGA) * dcTau(h, a, xGH, xGA);
    if (p > bP) { bP = p; bH = h; bA = a; }
    if (h > a) pH += p; else if (h === a) pD += p; else pA += p;
  }
  const s = pH + pD + pA;
  return {
    probabilities: { home: ((pH/s)*100).toFixed(1), draw: ((pD/s)*100).toFixed(1), away: ((pA/s)*100).toFixed(1) },
    likelyHome: bH, likelyAway: bA,
    xG: { home: xGH.toFixed(2), away: xGA.toFixed(2) },
    confidenceSource: 'elo-poisson-dixon-coles (fallback)',
  };
};

// ── Team Name Normalizer ──────────────────────────────────────────
// API seperti football-data.org sering mengembalikan nama lengkap:
// "Getafe CF", "Villarreal CF", "Real Racing Club de Santander"
// Sedangkan dataset training memakai nama pendek: "Getafe", "Villarreal"
const TEAM_ALIASES = {
  // Suffix umum yang perlu dihapus
  'CF': '', 'FC': '', 'SC': '', 'AC': '', 'AS': '', 'SS': '', 'SL': '',
  'United': '', 'City': '', 'Town': '', 'Athletic': '',
};

// Manual overrides — API name → dataset name
const MANUAL_MAP = {
  // La Liga
  'Atlético de Madrid':                'Atletico Madrid',
  'Club Atlético de Madrid':           'Atletico Madrid',
  'Deportivo Alavés':                  'Alavés',
  'Real Betis Balompié':               'Real Betis',
  'Rayo Vallecano de Madrid':          'Rayo Vallecano',
  'Real Madrid CF':                    'Real Madrid',
  'FC Barcelona':                      'Barcelona',
  'Deportivo de La Coruña':            'Deportivo La Coruña',
  'Real Racing Club de Santander':     'Racing Santander',
  'RC Celta':                          'Celta Vigo',
  'Celta de Vigo':                     'Celta Vigo',
  'Real Mallorca':                     'Mallorca',
  'UD Las Palmas':                     'Las Palmas',
  'Athletic Club':                     'Athletic Bilbao',
  'Getafe CF':                         'Getafe',
  'Girona FC':                         'Girona',
  'Valencia CF':                       'Valencia',
  'Villarreal CF':                     'Villarreal',
  'Osasuna':                           'Osasuna',
  // Premier League
  'Arsenal FC':                        'Arsenal',
  'Liverpool FC':                      'Liverpool',
  'Chelsea FC':                        'Chelsea',
  'Everton FC':                        'Everton',
  'Fulham FC':                         'Fulham',
  'Brentford FC':                      'Brentford',
  'Southampton FC':                    'Southampton',
  'Brighton & Hove Albion FC':         'Brighton & Hove Albion',
  'Brighton & Hove Albion':            'Brighton & Hove Albion',
  'West Ham United FC':                'West Ham United',
  'West Ham United':                   'West Ham United',
  'Newcastle United FC':               'Newcastle United',
  'Newcastle United':                  'Newcastle United',
  'Wolverhampton Wanderers FC':        'Wolverhampton Wanderers',
  'Tottenham Hotspur':                 'Tottenham Hotspur',
  'AFC Bournemouth':                   'AFC Bournemouth',
  'Leicester City':                    'Leicester City',
  'Nottingham Forest':                 'Nottingham Forest',
  'Nottingham Forest FC':              'Nottingham Forest',
  // Bundesliga
  'FC Bayern München':                 'Bayern Munich',
  'Bayer 04 Leverkusen':               'Bayer Leverkusen',
  'Borussia Dortmund':                 'Dortmund',
  'RB Leipzig':                        'Leipzig',
  'Borussia Mönchengladbach':          'Monchengladbach',
  'VfL Wolfsburg':                     'Wolfsburg',
  'Eintracht Frankfurt':               'Frankfurt',
  'TSG Hoffenheim':                    'Hoffenheim',
  'SC Freiburg':                       'Freiburg',
  // Serie A
  'Internazionale Milano':             'Inter Milan',
  'FC Internazionale Milano':          'Inter Milan',
  'AC Milan':                          'Milan',
  'Juventus FC':                       'Juventus',
  'SSC Napoli':                        'Napoli',
  'AS Roma':                           'Roma',
  'SS Lazio':                          'Lazio',
  'ACF Fiorentina':                    'Fiorentina',
  'Atalanta BC':                       'Atalanta',
  // Ligue 1
  'Paris Saint-Germain FC':            'Paris Saint-Germain',
  'Olympique de Marseille':            'Marseille',
  'Olympique Lyonnais':                'Lyon',
  'AS Monaco FC':                      'Monaco',
  'AS Saint-Étienne':                  'Saint-Etienne',
  'OGC Nice':                          'Nice',
  'Stade Rennais FC':                  'Rennes',
  // Portugal
  'Sport Lisboa e Benfica':            'Benfica',
  'FC Porto':                          'Porto',
  'Sporting CP':                       'Sporting CP',
};

const resolveTeamName = (apiName, ratings) => {
  if (!apiName) return null;

  // 1. Direct match
  if (ratings[apiName]) return apiName;

  // 2. Manual map (highest priority, always correct)
  const mapped = MANUAL_MAP[apiName];
  if (mapped && ratings[mapped]) return mapped;

  // 3. Strip common legal suffixes: "Getafe CF" → "Getafe"
  const stripped = apiName.replace(/\s*\b(CF|FC|SC|AC|AS|SS|SL|SAD|CD|UD|RCD|RFC|AFC|BC|FK|SK|BV|SV)\b\s*/g, ' ').trim();
  if (stripped !== apiName && ratings[stripped]) return stripped;

  // 4. Safe fuzzy: our dataset name must be contained FULLY inside the API name
  // (avoids "Real Madrid" matching "Real Betis" because "Real" alone would match)
  const apiLower = apiName.toLowerCase();
  const allTeams = Object.keys(ratings);
  const contained = allTeams.find(t => {
    const tL = t.toLowerCase();
    // Only match if the full dataset team name appears in the API name
    // AND the match is at least 6 chars long (avoids 'AC', 'AS', etc.)
    return tL.length >= 6 && apiLower.includes(tL);
  });
  if (contained) return contained;

  return null; // Not found — use fallback default stats
};


let _mlMod = null, _mlProm = null;
const loadML = () => {
  if (_mlMod)  return Promise.resolve(_mlMod);
  if (_mlProm) return _mlProm;
  _mlProm = import('../services/mlPredictor.js')
    .then(m => { _mlMod = m; console.log('✅ Ensemble ML model loaded'); return m; })
    .catch(e  => { console.warn('⚠️ ML fallback:', e.message); return null; });
  return _mlProm;
};

// ── Provider ────────────────────────────────────────────────────
export const PredictionProvider = ({ children }) => {
  const [predictions,        setPredictions]        = useState({});
  const [selectedLeagueCode, setSelectedLeagueCode] = useState(
    () => localStorage.getItem('selectedLeagueCode') || 'WC'
  );
  const [mlReady,            setMlReady]            = useState(false);
  const [oddsData,           setOddsData]           = useState([]);
  const [oddsStatus,         setOddsStatus]         = useState('idle'); // idle | loading | ready | error | no-key
  const selectedLeague = getLeague(selectedLeagueCode);

  // Simpan pilihan liga ke localStorage agar tidak reset saat refresh
  useEffect(() => {
    localStorage.setItem('selectedLeagueCode', selectedLeagueCode);
  }, [selectedLeagueCode]);


  useEffect(() => {
    loadML().then(m => { if (m) setMlReady(true); });
  }, []);

  // Fetch odds setiap kali liga berubah
  useEffect(() => {
    const hasKey = !!import.meta.env.VITE_ODDS_API_KEY;
    if (!hasKey) { setOddsStatus('no-key'); setOddsData([]); return; }

    const leagueKey = selectedLeagueCode?.toLowerCase().replace('_', '-');
    setOddsStatus('loading');
    setOddsData([]);

    fetchOddsForLeague(leagueKey)
      .then(data => {
        setOddsData(data);
        setOddsStatus(data.length > 0 ? 'ready' : 'idle');
      })
      .catch(() => setOddsStatus('error'));
  }, [selectedLeagueCode]);

  const generateAIPrediction = async (match) => {
    const ratings   = teamRatingsData.teamRatings;
    const globalAvg = teamRatingsData.globalAvgGoalsPerTeam ?? 1.3725;

    // Resolve team names with fuzzy matching
    const homeKey   = resolveTeamName(match.homeTeam.name, ratings);
    const awayKey   = resolveTeamName(match.awayTeam.name, ratings);
    const homeStats = homeKey ? ratings[homeKey] : null;
    const awayStats = awayKey ? ratings[awayKey] : null;

    if (!homeKey) console.warn('[PredictionContext] Team not found:', match.homeTeam.name);
    if (!awayKey) console.warn('[PredictionContext] Team not found:', match.awayTeam.name);

    const hElo = homeStats?.elo ?? 1500;
    const aElo = awayStats?.elo ?? 1500;

    let result;
    try {
      const mod = await loadML();
      if (mod?.generateMLPrediction) {
        // Cari odds real-time untuk pertandingan ini
        const rawOdds  = findMatchOdds(match.homeTeam.name, match.awayTeam.name, oddsData);
        const fairOdds = rawOdds ? oddsToFairProbs(rawOdds) : null;

        result = await mod.generateMLPrediction({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeStats, awayStats,
          isNeutral: false,
          globalAvg,
          isClub: true,
          marketOdds: fairOdds, // null jika tidak ada odds API
        });
      } else throw new Error('ML not available');
    } catch (e) {
      console.warn('Fallback to Elo+Poisson:', e.message);
      result = eloPoisson(homeStats, awayStats, globalAvg);
    }

    const prediction = {
      matchId:   match.id,
      homeScore: result.likelyHome,
      awayScore: result.likelyAway,
      xG:        result.xG,
      probabilities:   result.probabilities,
      modelBreakdown:  result.modelBreakdown ?? null,
      ensembleWeights: result.ensembleWeights ?? null,
      hasLiveOdds:     !!(result.marketOddsUsed),
      powerInfo: {
        homeElo: hElo, awayElo: aElo,
        homePower: homeStats?.powerIndex ?? 50,
        awayPower: awayStats?.powerIndex ?? 50,
      },
      method:    result.confidenceSource,
      timestamp: new Date().toISOString(),
    };

    setPredictions(prev => ({ ...prev, [match.id]: prediction }));
    return prediction;
  };

  const getPredictionForMatch = (matchId) => predictions[matchId] ?? null;

  // ── Riwayat Prediksi (disimpan di localStorage) ───────────────────
  const [predictionHistory, setPredictionHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('predictionHistory') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory));
  }, [predictionHistory]);

  /**
   * Simpan hasil prediksi setelah match selesai.
   * dipanggil dari MatchCard saat status === FINISHED dan ada pred.
   */
  const savePredictionResult = (match, pred) => {
    if (!pred || match.status !== 'FINISHED') return;
    // Cegah duplikat
    if (predictionHistory.find(h => h.matchId === match.id)) return;

    const actualHome = match.score?.home ?? null;
    const actualAway = match.score?.away ?? null;
    if (actualHome === null || actualAway === null) return;

    // Cek apakah prediksi pemenang benar
    const predictedResult = pred.homeScore > pred.awayScore ? 'H'
      : pred.homeScore < pred.awayScore ? 'A' : 'D';
    const actualResult = actualHome > actualAway ? 'H'
      : actualHome < actualAway ? 'A' : 'D';
    const isCorrect = predictedResult === actualResult;
    // Cek skor persis
    const isExact = pred.homeScore === actualHome && pred.awayScore === actualAway;

    const entry = {
      matchId:     match.id,
      homeTeam:    match.homeTeam.name,
      awayTeam:    match.awayTeam.name,
      homeCrest:   match.homeTeam.crest || '',
      awayCrest:   match.awayTeam.crest || '',
      date:        match.date,
      league:      match.group || '',
      predictedHome: pred.homeScore,
      predictedAway: pred.awayScore,
      actualHome,
      actualAway,
      isCorrect,
      isExact,
      probabilities: pred.probabilities,
      savedAt: new Date().toISOString(),
    };

    setPredictionHistory(prev => [entry, ...prev.slice(0, 99)]); // max 100
  };

  const clearHistory = () => setPredictionHistory([]);

  return (
    <PredictionContext.Provider value={{
      predictions, generateAIPrediction, getPredictionForMatch,
      selectedLeague, selectedLeagueCode, setSelectedLeagueCode,
      mlReady, oddsStatus,
      predictionHistory, savePredictionResult, clearHistory,
      allMatches: [], // populated by Dashboard via setAllMatches
    }}>
      {children}
    </PredictionContext.Provider>
  );
};
