import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const FavoritesContext = createContext(null);

const STORAGE_KEY = 'ifootballmatch_favorites';

export const FavoritesProvider = ({ children }) => {
  const [favoriteIds, setFavoriteIds] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [favoriteMatches, setFavoriteMatches] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY + '_data');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favoriteIds));
    } catch {}
  }, [favoriteIds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY + '_data', JSON.stringify(favoriteMatches));
    } catch {}
  }, [favoriteMatches]);

  const isFavorite = useCallback((matchId) => {
    return favoriteIds.includes(String(matchId));
  }, [favoriteIds]);

  const toggleFavorite = useCallback((match) => {
    const id = String(match.id);
    setFavoriteIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(fid => fid !== id);
      } else {
        return [...prev, id];
      }
    });
    setFavoriteMatches(prev => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      } else {
        return { ...prev, [id]: match };
      }
    });
  }, []);

  const getFavoriteMatches = useCallback(() => {
    return favoriteIds
      .map(id => favoriteMatches[id])
      .filter(Boolean);
  }, [favoriteIds, favoriteMatches]);

  const updateFavoriteMatch = useCallback((match) => {
    const id = String(match.id);
    if (favoriteIds.includes(id)) {
      setFavoriteMatches(prev => ({ ...prev, [id]: match }));
    }
  }, [favoriteIds]);

  const clearAllFavorites = useCallback(() => {
    setFavoriteIds([]);
    setFavoriteMatches({});
  }, []);

  return (
    <FavoritesContext.Provider value={{
      favoriteIds,
      isFavorite,
      toggleFavorite,
      getFavoriteMatches,
      updateFavoriteMatch,
      clearAllFavorites,
      count: favoriteIds.length,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider');
  return ctx;
};

export default FavoritesContext;
