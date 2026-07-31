import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PredictionProvider } from './context/PredictionContext';
import Navbar from './components/Navbar';
import LiveMatchBanner from './components/LiveMatchBanner';
import Dashboard from './pages/Dashboard';
import Standings from './pages/Standings';
import Leaderboard from './pages/Leaderboard';
import KnockoutBracket from './pages/KnockoutBracket';

function App() {
  return (
    <PredictionProvider>
      <Router>
        <div className="app-wrapper">
          <Navbar />
          <LiveMatchBanner />
          <main className="container">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/standings" element={<Standings />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/bracket" element={<KnockoutBracket />} />
            </Routes>
          </main>
        </div>
      </Router>
    </PredictionProvider>
  );
}

export default App;
