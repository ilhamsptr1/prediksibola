import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, List, Trophy, TrendingUp, History, User } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { usePredictions } from '../context/PredictionContext';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();
  const { allMatches } = usePredictions();

  const navItems = [
    { path: '/',           label: 'Jadwal',   icon: <Home size={18} /> },
    { path: '/standings',  label: 'Klasemen', icon: <List size={18} /> },
    { path: '/bracket',    label: 'Bagan',    icon: <Trophy size={18} /> },
    { path: '/leaderboard',label: 'AI Rank',  icon: <TrendingUp size={18} /> },
    { path: '/stats',      label: 'Statistik',icon: <User size={18} /> },
    { path: '/history',    label: 'Riwayat',  icon: <History size={18} /> },
  ];

  return (
    <nav className="navbar glass">
      <div className="container navbar-content">
        <Link to="/" className="navbar-brand">
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
          <NotificationBell matches={allMatches || []} />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
