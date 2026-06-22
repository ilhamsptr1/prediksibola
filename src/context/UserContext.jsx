import React, { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user exists in local storage
    const storedUser = localStorage.getItem('wc_user_profile');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      // Prompt user for name if not exists
      // Wait for a small delay so it doesn't block initial render jarringly
      setTimeout(() => {
        let name = window.prompt("Selamat datang di Tebak Skor Piala Dunia 2026!\nSiapa nama Anda?");
        if (!name || name.trim() === '') {
          name = `Prediktor${Math.floor(Math.random() * 10000)}`;
        }
        
        const newUser = {
          id: `user_${Date.now()}`,
          name: name.trim(),
          points: 0,
          totalPredicted: 0,
          correct: 0,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}&backgroundColor=b6e3f4`
        };
        
        setUser(newUser);
        localStorage.setItem('wc_user_profile', JSON.stringify(newUser));
      }, 500);
    }
    setLoading(false);
  }, []);

  const updateUserStats = (newPoints, isCorrect) => {
    setUser(prev => {
      if (!prev) return prev;
      const updatedUser = {
        ...prev,
        points: prev.points + newPoints,
        totalPredicted: prev.totalPredicted + 1,
        correct: prev.correct + (isCorrect ? 1 : 0)
      };
      localStorage.setItem('wc_user_profile', JSON.stringify(updatedUser));
      return updatedUser;
    });
  };

  return (
    <UserContext.Provider value={{ user, loading, updateUserStats }}>
      {children}
    </UserContext.Provider>
  );
};
