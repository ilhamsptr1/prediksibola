import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PredictionProvider } from './context/PredictionContext';
import Navbar from './components/Navbar';
import LiveMatchBanner from './components/LiveMatchBanner';
import Dashboard from './pages/Dashboard';
import Standings from './pages/Standings';
import Leaderboard from './pages/Leaderboard';
import KnockoutBracket from './pages/KnockoutBracket';

// Error Boundary — mencegah blank screen saat ada komponen crash
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#03050f', color: '#fff', fontFamily: 'Outfit, sans-serif',
          gap: '1rem', padding: '2rem', textAlign: 'center'
        }}>
          <span style={{ fontSize: '3rem' }}>⚠️</span>
          <h2 style={{ color: '#f87171' }}>Terjadi kesalahan</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{
              marginTop: '1rem', padding: '0.75rem 2rem',
              background: '#00ff88', color: '#000', border: 'none',
              borderRadius: '999px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem'
            }}
          >
            🔄 Muat Ulang Halaman
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <PredictionProvider>
        <Router>
          <div className="app-wrapper">
            {/* Background layer — gambar stadion per liga */}
            <div className="league-bg-layer" aria-hidden="true" />
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
    </ErrorBoundary>
  );
}

export default App;
