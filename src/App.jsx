import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PredictionProvider } from './context/PredictionContext';
import { FavoritesProvider } from './context/FavoritesContext';
import Navbar from './components/Navbar';
import LiveTicker from './components/LiveTicker';
import Footer from './components/Footer';
import Dashboard from './pages/Dashboard';
import Standings from './pages/Standings';
import Leaderboard from './pages/Leaderboard';
import KnockoutBracket from './pages/KnockoutBracket';
import PredictionHistory from './pages/PredictionHistory';
import Stats from './pages/Stats';
import MatchDetail from './pages/MatchDetail';
import Favorites from './pages/Favorites';
import News from './pages/News';
import { SplashScreen } from '@capacitor/splash-screen';
import { Network } from '@capacitor/network';
import { WifiOff } from 'lucide-react';


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
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Hide splash screen after React is fully mounted
    const hideSplash = async () => {
      try {
        if (window.Capacitor?.isNativePlatform()) {
          await SplashScreen.hide();
        }
      } catch (e) {}
    };
    hideSplash();

    // Check current network status
    const checkNetwork = async () => {
      if (window.Capacitor?.isNativePlatform()) {
        const status = await Network.getStatus();
        setIsOffline(!status.connected);
      } else {
        setIsOffline(!navigator.onLine);
      }
    };
    checkNetwork();

    // Listen for network changes
    let networkListener;
    if (window.Capacitor?.isNativePlatform()) {
      Network.addListener('networkStatusChange', status => {
        setIsOffline(!status.connected);
      }).then(listener => {
        networkListener = listener;
      });
    } else {
      window.addEventListener('offline', () => setIsOffline(true));
      window.addEventListener('online', () => setIsOffline(false));
    }

    return () => {
      if (networkListener) networkListener.remove();
      if (!window.Capacitor?.isNativePlatform()) {
        window.removeEventListener('offline', () => setIsOffline(true));
        window.removeEventListener('online', () => setIsOffline(false));
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <FavoritesProvider>
        <PredictionProvider>
          <Router>
            <div className="app-wrapper">
              {/* Offline Banner Overlay */}
              {isOffline && (
                <div className="global-offline-banner">
                  <WifiOff size={16} />
                  <span>Anda sedang offline. Menampilkan data tersimpan.</span>
                </div>
              )}
              {/* Background layer — gambar stadion per liga */}
              <div className="league-bg-layer" aria-hidden="true" />
              <Navbar />
              <LiveTicker />
              <main className="container">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/standings" element={<Standings />} />
                  <Route path="/leaderboard" element={<Leaderboard />} />
                  <Route path="/bracket" element={<KnockoutBracket />} />
                  <Route path="/stats" element={<Stats />} />
                  <Route path="/match/:matchId" element={<MatchDetail />} />
                  <Route path="/history" element={<PredictionHistory />} />
                  <Route path="/favorites" element={<Favorites />} />
                  <Route path="/news" element={<News />} />
                </Routes>
                <Footer />
              </main>
            </div>
          </Router>
        </PredictionProvider>
      </FavoritesProvider>
    </ErrorBoundary>
  );
}

export default App;
