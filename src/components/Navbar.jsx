import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Wifi, List, Trophy, TrendingUp } from 'lucide-react';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Jadwal', icon: <Home size={18} /> },
    { path: '/standings', label: 'Klasemen', icon: <List size={18} /> },
    { path: '/bracket', label: 'Bagan', icon: <Trophy size={18} /> },
    { path: '/leaderboard', label: 'AI Ranking', icon: <TrendingUp size={18} /> },
  ];

  return (
    <nav className="navbar glass">
      <div className="container navbar-content">
        <Link to="/" className="navbar-brand">
          {/* Official WC Emblem from football-data.org CDN */}
          <img
            src="https://crests.football-data.org/wm26.png"
            alt="FIFA World Cup 2026"
            className="brand-emblem"
            onError={(e) => { e.currentTarget.style.display='none'; }}
          />
          <div className="brand-text-group">
            <span className="brand-title">Prediksi <span className="text-gradient">Bola</span></span>
            <span className="brand-sub">AI-Powered • Live Data</span>
          </div>
        </Link>

        <div className="nav-center">
          <div className="live-indicator">
            <Wifi size={14} />
            <span>Live Data</span>
          </div>
        </div>

        <div className="nav-links">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
