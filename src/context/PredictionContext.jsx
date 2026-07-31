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

// Manual overrides untuk kasus khusus
const MANUAL_MAP = {
  'Real Racing Club de Santander':     'Racing Santander',
  'Deportivo Alavés':                  'Alavés',
  'Athletic Club':                     'Athletic Bilbao',
  'Wolverhampton Wanderers':           'Wolverhampton',
  'West Ham United':                   'West Ham',
  'Tottenham Hotspur':                 'Tottenham',
  'Nottingham Forest':                 'Nottingham Forest',
  'Newcastle United':                  'Newcastle',
  'Leicester City':                    'Leicester',
  'Brighton & Hove Albion':            'Brighton',
  'Bayer 04 Leverkusen':               'Bayer Leverkusen',
  'FC Bayern München':                 'Bayern Munich',
  'Borussia Dortmund':                 'Dortmund',
  'RB Leipzig':                        'Leipzig',
  'Paris Saint-Germain FC':            'Paris Saint-Germain',
  'Olympique de Marseille':            'Marseille',
  'Olympique Lyonnais':                'Lyon',
  'AS Monaco FC':                      'Monaco',
  'Internazionale Milano':             'Inter Milan',
  'AC Milan':                          'Milan',
  'Juventus FC':                       'Juventus',
  'SSC Napoli':                        'Napoli',
  'AS Roma':                           'Roma',
  'SS Lazio':                          'Lazio',
  'ACF Fiorentina':                    'Fiorentina',
  'Atlético de Madrid':                'Atletico Madrid',
  'Rayo Vallecano de Madrid':          'Rayo Vallecano',
  'Deportivo de La Coruña':            'Deportivo La Coruña',
  'Real Betis Balompié':               'Real Betis',
  'FC Barcelona':                      'Barcelona',
  'Real Madrid CF':                    'Real Madrid',
  'Club Atlético de Madrid':           'Atletico Madrid',
};

const resolveTeamName = (apiName, ratings) => {
  if (!apiName) return null;
  // 1. Direct match
  if (ratings[apiName]) return apiName;
  // 2. Manual map
  if (MANUAL_MAP[apiName]) {
    const mapped = MANUAL_MAP[apiName];
    if (ratings[mapped]) return mapped;
  }
  // 3. Strip common suffixes ("Getafe CF" → "Getafe")
  const stripped = apiName.replace(/\b(CF|FC|SC|AC|AS|SS|SL|SAD|CD|UD|RCD|SSD|ASD|RFC|AFC)\b/g, '').trim();
  if (stripped !== apiName && ratings[stripped]) return stripped;
  // 4. Fuzzy: find team where our name is contained in API name or vice versa
  const apiLower = apiName.toLowerCase();
  const allTeams = Object.keys(ratings);
  // Try containment match (longer string contains shorter)
  const fuzzy = allTeams.find(t => {
    const tL = t.toLowerCase();
    return apiLower.includes(tL) || tL.includes(apiLower.split(' ')[0]);
  });
  if (fuzzy) return fuzzy;
  return null; // Not found
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
  const [selectedLeagueCode, setSelectedLeagueCode] = useState('WC');
  const [mlReady,            setMlReady]            = useState(false);
  const [oddsData,           setOddsData]           = useState([]);
  const [oddsStatus,         setOddsStatus]         = useState('idle'); // idle | loading | ready | error | no-key
  const selectedLeague = getLeague(selectedLeagueCode);

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

  return (
    <PredictionContext.Provider value={{
      predictions, generateAIPrediction, getPredictionForMatch,
      selectedLeague, selectedLeagueCode, setSelectedLeagueCode,
      mlReady, oddsStatus,
    }}>
      {children}
    </PredictionContext.Provider>
  );
};
