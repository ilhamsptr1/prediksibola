import React, { createContext, useContext, useState } from 'react';
import teamRatingsData from '../data/teamRatings.json';

const PredictionContext = createContext();

export const usePredictions = () => useContext(PredictionContext);

export const PredictionProvider = ({ children }) => {
  const [predictions, setPredictions] = useState({});

  // Poisson distribution random number generator
  const poissonRandom = (lambda) => {
    let L = Math.exp(-lambda), p = 1.0, k = 0;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  };

  const generateAIPrediction = async (match) => {
    // 1. Dapatkan nama tim dari match object
    const homeTeamName = match.homeTeam.name;
    const awayTeamName = match.awayTeam.name;

    // 2. Cari rating tim dari dataset hasil training
    const ratings = teamRatingsData.teamRatings;
    const globalAvg = teamRatingsData.globalAvgGoalsPerTeam; // ~1.3
    
    // Default stats if team not found in dataset
    const homeStats = ratings[homeTeamName] || { attack: 1.0, defense: 1.0 };
    const awayStats = ratings[awayTeamName] || { attack: 1.0, defense: 1.0 };

    // 3. Algoritma Prediksi (Poisson Model Expected Goals)
    // Home Expected Goals = Home Attack * Away Defense * Global Avg * Home Advantage
    const homeAdvantage = 1.15; // 15% boost for home
    let expectedHomeGoals = homeStats.attack * awayStats.defense * globalAvg * homeAdvantage;
    
    // Away Expected Goals = Away Attack * Home Defense * Global Avg
    let expectedAwayGoals = awayStats.attack * homeStats.defense * globalAvg;

    // Limit extreme values
    expectedHomeGoals = Math.max(0.1, Math.min(5.0, expectedHomeGoals));
    expectedAwayGoals = Math.max(0.1, Math.min(5.0, expectedAwayGoals));

    // 4. Generate skor riil menggunakan Poisson
    const predictedHomeScore = poissonRandom(expectedHomeGoals);
    const predictedAwayScore = poissonRandom(expectedAwayGoals);

    const newPrediction = {
      matchId: match.id,
      homeScore: predictedHomeScore,
      awayScore: predictedAwayScore,
      xG: {
        home: expectedHomeGoals.toFixed(2),
        away: expectedAwayGoals.toFixed(2)
      },
      powerInfo: {
        homePower: homeStats.powerIndex || 50,
        awayPower: awayStats.powerIndex || 50
      },
      timestamp: new Date().toISOString()
    };

    setPredictions(prev => ({
      ...prev,
      [match.id]: newPrediction
    }));

    return newPrediction;
  };

  const getPredictionForMatch = (matchId) => {
    return predictions[matchId] || null;
  };

  return (
    <PredictionContext.Provider value={{ predictions, generateAIPrediction, getPredictionForMatch }}>
      {children}
    </PredictionContext.Provider>
  );
};
