import React, { createContext, useContext, useState, useEffect } from 'react';
import teamRatingsData from '../data/teamRatings.json';
import { getLeague } from '../data/leagues';

const PredictionContext = createContext();
export const usePredictions = () => useContext(PredictionContext);

// ── Fallback: Poisson PMF ──────────────────────────────────────
const poissonPMF = (k, lambda) => {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
  return result;
};

// Dixon-Coles correction untuk skor rendah
const dixonColes = (i, j, lambda, mu, rho = -0.1) => {
  if (i === 0 && j === 0) return 1 - lambda * mu * rho;
  if (i === 0 && j === 1) return 1 + lambda * rho;
  if (i === 1 && j === 0) return 1 + mu * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
};

/**
 * Fallback: Elo + Poisson + Dixon-Coles (tanpa ML model)
 */
const eloPoisson = (homeStats, awayStats, globalAvg) => {
  const homeAtk  = homeStats?.attack  ?? 1.0;
  const homeDef  = homeStats?.defense ?? 1.0;
  const awayAtk  = awayStats?.attack  ?? 1.0;
  const awayDef  = awayStats?.defense ?? 1.0;
  const homeElo  = homeStats?.elo ?? 1500;
  const awayElo  = awayStats?.elo ?? 1500;

  const eloDiff     = homeElo - awayElo;
  const eloFactor   = 1 + eloDiff / 2000;
  const homeAdv     = 1.12;

  let xGHome = homeAtk * awayDef * globalAvg * homeAdv * Math.max(0.7, Math.min(1.3, eloFactor));
  let xGAway = awayAtk * homeDef * globalAvg * Math.max(0.7, Math.min(1.3, 1 / eloFactor));
  xGHome = Math.max(0.1, Math.min(5.0, xGHome));
  xGAway = Math.max(0.1, Math.min(5.0, xGAway));

  let probHome = 0, probDraw = 0, probAway = 0;
  let bestProb = -1, bestHome = 0, bestAway = 0;

  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const tau = dixonColes(h, a, xGHome, xGAway);
      const p   = poissonPMF(h, xGHome) * poissonPMF(a, xGAway) * tau;
      if (p > bestProb) { bestProb = p; bestHome = h; bestAway = a; }
      if (h > a) probHome += p;
      else if (h === a) probDraw += p;
      else probAway += p;
    }
  }

  const total = probHome + probDraw + probAway;
  return {
    probabilities: {
      home: ((probHome / total) * 100).toFixed(1),
      draw: ((probDraw / total) * 100).toFixed(1),
      away: ((probAway / total) * 100).toFixed(1),
    },
    likelyHome: bestHome,
    likelyAway: bestAway,
    xG: { home: xGHome.toFixed(2), away: xGAway.toFixed(2) },
    confidenceSource: 'elo-poisson-dixon-coles',
  };
};

// ── ML Inference Engine (lazy loaded) ─────────────────────────
let mlModule = null;
let mlLoadPromise = null;

const loadMLModule = () => {
  if (mlModule) return Promise.resolve(mlModule);
  if (mlLoadPromise) return mlLoadPromise;

  mlLoadPromise = import('../services/mlPredictor.js')
    .then((mod) => {
      mlModule = mod;
      console.log('✅ ML Gradient Boosting model loaded');
      return mod;
    })
    .catch((err) => {
      console.warn('⚠️ ML model not available, falling back to Elo+Poisson:', err.message);
      return null;
    });

  return mlLoadPromise;
};

// ── Provider ──────────────────────────────────────────────────
export const PredictionProvider = ({ children }) => {
  const [predictions, setPredictions] = useState({});
  const [selectedLeagueCode, setSelectedLeagueCode] = useState('WC');
  const [mlReady, setMlReady] = useState(false);

  const selectedLeague = getLeague(selectedLeagueCode);

  // Pre-load ML model in background on mount
  useEffect(() => {
    loadMLModule().then((mod) => {
      if (mod) setMlReady(true);
    });
  }, []);

  const generateAIPrediction = async (match) => {
    const ratings   = teamRatingsData.teamRatings;
    const globalAvg = teamRatingsData.globalAvgGoalsPerTeam;

    const homeStats = ratings[match.homeTeam.name];
    const awayStats = ratings[match.awayTeam.name];
    const homeElo   = homeStats?.elo ?? 1500;
    const awayElo   = awayStats?.elo ?? 1500;

    let result;

    try {
      // Try ML model first
      const mod = await loadMLModule();
      if (mod && mod.generateMLPrediction) {
        result = mod.generateMLPrediction({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeStats,
          awayStats,
          isNeutral: false,
          globalAvg,
        });
      } else {
        throw new Error('ML model not loaded');
      }
    } catch (e) {
      // Fallback to Elo + Poisson + Dixon-Coles
      console.warn('ML fallback:', e.message);
      result = eloPoisson(homeStats, awayStats, globalAvg);
    }

    const prediction = {
      matchId:   match.id,
      homeScore: result.likelyHome,
      awayScore: result.likelyAway,
      xG:        result.xG,
      probabilities: result.probabilities,
      powerInfo: {
        homeElo,
        awayElo,
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
      predictions,
      generateAIPrediction,
      getPredictionForMatch,
      selectedLeague,
      selectedLeagueCode,
      setSelectedLeagueCode,
      mlReady,
    }}>
      {children}
    </PredictionContext.Provider>
  );
};
