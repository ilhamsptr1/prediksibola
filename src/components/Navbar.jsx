import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Wifi, List, Trophy, User } from 'lucide-react';
import { useUser } from '../context/UserContext';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();
  const { user } = useUser();

  const navItems = [
    { path: '/', label: 'Jadwal', icon: <Home size={18} /> },
    { path: '/standings', label: 'Klasemen', icon: <List size={18} /> },
    { path: '/leaderboard', label: 'Leaderboard', icon: <Trophy size={18} /> },
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
            <span className="brand-title">WC <span className="text-gradient">2026</span></span>
            <span className="brand-sub">Prediksi Babak Grup</span>
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
              <span className="hide-sm">{item.label}</span>
            </Link>
          ))}
          
          {user && (
            <div className="nav-profile">
              <div className="nav-profile-info">
                <span className="profile-name">{user.name}</span>
                <span className="profile-pts">{user.points} pts</span>
              </div>
              <img src={user.avatar} alt="Avatar" className="profile-avatar" />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
