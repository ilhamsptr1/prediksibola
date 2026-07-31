import React, { createContext, useContext, useState } from 'react';
import teamRatingsData from '../data/teamRatings.json';
import { getLeague } from '../data/leagues';

const PredictionContext = createContext();
export const usePredictions = () => useContext(PredictionContext);

/**
 * Poisson PMF — P(X = k | lambda)
 */
const poissonPMF = (k, lambda) => {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
  return result;
};

/**
 * Generate score probability matrix (up to maxGoals x maxGoals)
 * Returns the most likely score and win/draw/loss probabilities.
 */
const scoreMatrix = (xGHome, xGAway, maxGoals = 8) => {
  let probHome = 0, probDraw = 0, probAway = 0;
  let bestProb = -1, bestHome = 0, bestAway = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPMF(h, xGHome) * poissonPMF(a, xGAway);
      if (p > bestProb) { bestProb = p; bestHome = h; bestAway = a; }
      if (h > a) probHome += p;
      else if (h === a) probDraw += p;
      else probAway += p;
    }
  }

  const total = probHome + probDraw + probAway;
  return {
    likelyHome: bestHome,
    likelyAway: bestAway,
    pHome: ((probHome / total) * 100).toFixed(1),
    pDraw: ((probDraw / total) * 100).toFixed(1),
    pAway: ((probAway / total) * 100).toFixed(1),
  };
};

export const PredictionProvider = ({ children }) => {
  const [predictions, setPredictions] = useState({});
  const [selectedLeagueCode, setSelectedLeagueCode] = useState('WC');

  const selectedLeague = getLeague(selectedLeagueCode);

  const generateAIPrediction = async (match) => {
    const ratings = teamRatingsData.teamRatings;
    const globalAvg = teamRatingsData.globalAvgGoalsPerTeam; // ~1.37

    const homeStats = ratings[match.homeTeam.name];
    const awayStats = ratings[match.awayTeam.name];

    // Fallback stats for unknown teams
    const homeAtk = homeStats?.attack  ?? 1.0;
    const homeDef = homeStats?.defense ?? 1.0;
    const awayAtk = awayStats?.attack  ?? 1.0;
    const awayDef = awayStats?.defense ?? 1.0;
    const homeElo = homeStats?.elo ?? 1500;
    const awayElo = awayStats?.elo ?? 1500;

    // Elo-based home advantage factor on top of Poisson
    const eloDiff        = homeElo - awayElo;
    const eloFactor      = 1 + eloDiff / 2000; // mild adjustment
    const homeAdvantage  = 1.12; // +12% for playing at home

    // xG = Attack × Opponent Defense × Global Avg × adjustments
    let xGHome = homeAtk * awayDef * globalAvg * homeAdvantage * Math.max(0.7, Math.min(1.3, eloFactor));
    let xGAway = awayAtk * homeDef * globalAvg * Math.max(0.7, Math.min(1.3, 1 / eloFactor));

    // Clamp to reasonable range
    xGHome = Math.max(0.1, Math.min(5.0, xGHome));
    xGAway = Math.max(0.1, Math.min(5.0, xGAway));

    // Build full probability matrix
    const matrix = scoreMatrix(xGHome, xGAway);

    const prediction = {
      matchId:   match.id,
      homeScore: matrix.likelyHome,
      awayScore: matrix.likelyAway,
      xG: {
        home: xGHome.toFixed(2),
        away: xGAway.toFixed(2),
      },
      probabilities: {
        home: matrix.pHome,
        draw: matrix.pDraw,
        away: matrix.pAway,
      },
      powerInfo: {
        homeElo:   homeElo,
        awayElo:   awayElo,
        homePower: homeStats?.powerIndex ?? 50,
        awayPower: awayStats?.powerIndex ?? 50,
      },
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
    }}>
      {children}
    </PredictionContext.Provider>
  );
};
