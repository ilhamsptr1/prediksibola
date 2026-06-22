import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchTeamRecentForm } from '../services/footballApi';

const PredictionContext = createContext();

export const usePredictions = () => useContext(PredictionContext);

export const PredictionProvider = ({ children }) => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPredictions = () => {
      try {
        const local = localStorage.getItem('system_predictions');
        if (local) {
          setPredictions(JSON.parse(local));
        }
      } catch (error) {
        console.error("Error fetching predictions: ", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPredictions();
  }, []);

  const poissonRandom = (lambda) => {
    let L = Math.exp(-lambda), p = 1.0, k = 0;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  };

  const calculateScore = (homeStats, awayStats) => {
    const homeAdvantage = 3; // Slight bump for being "home" team on paper
    const homeAttack = (homeStats.att || 70) + homeAdvantage;
    const homeDefense = (homeStats.def || 70) + homeAdvantage;
    
    const awayAttack = awayStats.att || 70;
    const awayDefense = awayStats.def || 70;

    // Base expected goals ~1.2 per team
    const expectedHomeGoals = Math.max(0.1, (homeAttack - awayDefense) * 0.1 + 1.4);
    const expectedAwayGoals = Math.max(0.1, (awayAttack - homeDefense) * 0.1 + 1.1);

    return {
      homeScore: poissonRandom(expectedHomeGoals),
      awayScore: poissonRandom(expectedAwayGoals)
    };
  };

  const generateSystemPrediction = async (match) => {
    // Attempt to fetch live stats, otherwise fallback to static TEAM_META stats
    const homeLiveStats = await fetchTeamRecentForm(match.homeTeam.name);
    const awayLiveStats = await fetchTeamRecentForm(match.awayTeam.name);
    
    const finalHomeStats = homeLiveStats || match.homeTeam;
    const finalAwayStats = awayLiveStats || match.awayTeam;

    const usedLiveApi = !!(homeLiveStats || awayLiveStats);

    // Generate scores based on stats
    const { homeScore, awayScore } = calculateScore(finalHomeStats, finalAwayStats);
    
    const newPrediction = {
      matchId: match.id,
      homeScore,
      awayScore,
      usedLiveApi,
      timestamp: new Date().toISOString()
    };

    try {
      const updatedPredictions = [...predictions.filter(p => p.matchId !== match.id), newPrediction];
      setPredictions(updatedPredictions);
      localStorage.setItem('system_predictions', JSON.stringify(updatedPredictions));
      return true;
    } catch (error) {
      console.error("Error saving prediction: ", error);
      return false;
    }
  };

  const getPredictionForMatch = (matchId) => {
    return predictions.find(p => p.matchId === matchId) || null;
  };

  return (
    <PredictionContext.Provider value={{ predictions, generateSystemPrediction, getPredictionForMatch, loading }}>
      {children}
    </PredictionContext.Provider>
  );
};
