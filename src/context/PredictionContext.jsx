import React, { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from './UserContext';

const PredictionContext = createContext();

export const usePredictions = () => useContext(PredictionContext);

export const PredictionProvider = ({ children }) => {
  const { user, updateUserStats } = useUser();
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return; // Wait for user to be loaded
    
    const fetchPredictions = () => {
      try {
        const local = localStorage.getItem(`predictions_${user.id}`);
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
  }, [user]);

  // Saves a user's prediction manually
  const saveUserPrediction = (matchId, homeScore, awayScore) => {
    if (!user) return false;

    const newPrediction = {
      matchId,
      homeScore: parseInt(homeScore, 10),
      awayScore: parseInt(awayScore, 10),
      timestamp: new Date().toISOString(),
      evaluated: false,
      pointsEarned: 0
    };

    try {
      const updatedPredictions = [...predictions.filter(p => p.matchId !== matchId), newPrediction];
      setPredictions(updatedPredictions);
      localStorage.setItem(`predictions_${user.id}`, JSON.stringify(updatedPredictions));
      return true;
    } catch (error) {
      console.error("Error saving prediction: ", error);
      return false;
    }
  };

  // Call this when match data is updated and we see finished matches
  const evaluateFinishedMatches = (matches) => {
    if (!user || !matches || matches.length === 0) return;

    let hasUpdates = false;
    let newPredictions = [...predictions];
    let totalPointsGained = 0;
    let totalCorrectGained = 0;

    matches.forEach(match => {
      if (match.status === 'FINISHED' && match.score.home !== null && match.score.away !== null) {
        const predictionIndex = newPredictions.findIndex(p => p.matchId === match.id && !p.evaluated);
        
        if (predictionIndex !== -1) {
          const p = newPredictions[predictionIndex];
          const realHome = match.score.home;
          const realAway = match.score.away;
          
          let points = 0;
          let isCorrect = false;

          // 1. Exact score match = 3 points
          if (p.homeScore === realHome && p.awayScore === realAway) {
            points = 3;
            isCorrect = true;
          } 
          // 2. Correct Result (Win/Draw/Lose) = 1 point
          else {
            const predResult = p.homeScore > p.awayScore ? 'HOME' : (p.homeScore < p.awayScore ? 'AWAY' : 'DRAW');
            const realResult = realHome > realAway ? 'HOME' : (realHome < realAway ? 'AWAY' : 'DRAW');
            
            if (predResult === realResult) {
              points = 1;
              isCorrect = true;
            }
          }

          newPredictions[predictionIndex] = {
            ...p,
            evaluated: true,
            pointsEarned: points
          };

          totalPointsGained += points;
          if (isCorrect) totalCorrectGained++;
          hasUpdates = true;
        }
      }
    });

    if (hasUpdates) {
      setPredictions(newPredictions);
      localStorage.setItem(`predictions_${user.id}`, JSON.stringify(newPredictions));
      
      // Update user context stats!
      if (updateUserStats) {
        // totalPredicted handles differently, we update points and correct count here.
        // Actually we only update points/correct. Total predicted is already +1 when they save prediction?
        // Let's just update points and correct count. 
        updateUserStats(totalPointsGained, totalCorrectGained > 0);
      }
    }
  };

  const getPredictionForMatch = (matchId) => {
    return predictions.find(p => p.matchId === matchId) || null;
  };

  return (
    <PredictionContext.Provider value={{ predictions, saveUserPrediction, getPredictionForMatch, evaluateFinishedMatches, loading }}>
      {children}
    </PredictionContext.Provider>
  );
};
