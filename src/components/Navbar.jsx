import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, List, Star, TrendingUp, Newspaper } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { usePredictions } from '../context/PredictionContext';
import { useFavorites } from '../context/FavoritesContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();
  const { allMatches } = usePredictions();
  const { count: favCount } = useFavorites();

  const navItems = [
    { path: '/',           label: 'Jadwal',   icon: <Home size={18} /> },
    { path: '/standings',  label: 'Klasemen', icon: <List size={18} /> },
    { path: '/favorites',  label: 'Favorit',  icon: <Star size={18} />, badge: favCount || null },
    { path: '/news',       label: 'Berita',   icon: <Newspaper size={18} /> },
    { path: '/leaderboard',label: 'FIFA',     icon: <TrendingUp size={18} /> },
  ];


  const handleNavClick = async () => {
    try {
      if (window.Capacitor?.isNativePlatform()) {
        await Haptics.impact({ style: ImpactStyle.Light });
      }
    } catch (e) {
      // ignore
    }
  };

  return (
    <nav className="navbar glass">
      <div className="container navbar-content">
        <Link to="/" className="navbar-brand" onClick={handleNavClick}>
          <img
            src="https://crests.football-data.org/wm26.png"
            alt="FIFA World Cup 2026"
            className="brand-emblem"
            onError={(e) => { e.currentTarget.style.display='none'; }}
          />
          <div className="brand-text-group">
            <span className="brand-title">Prediksi <span className="text-gradient">Bola</span></span>
          </div>
        </Link>

        <div className="nav-links">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-link-icon-wrap">
                {item.icon}
                {item.badge > 0 && (
                  <span className="nav-badge">{item.badge > 9 ? '9+' : item.badge}</span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
          <NotificationBell matches={allMatches || []} />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
