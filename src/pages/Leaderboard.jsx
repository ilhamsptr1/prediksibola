import React from 'react';
import { Trophy, Target, Shield, Zap } from 'lucide-react';
import teamRatingsData from '../data/teamRatings.json';
import './Leaderboard.css';

const rankIcon = (index) => {
  if (index === 0) return <Trophy size={22} className="rank-icon gold" />;
  if (index === 1) return <Trophy size={22} className="rank-icon silver" />;
  if (index === 2) return <Trophy size={22} className="rank-icon bronze" />;
  return <span className="rank-number">#{index + 1}</span>;
};

const Leaderboard = () => {
  const ranking = teamRatingsData.aiPowerRanking || [];
  const top3 = ranking.slice(0, 3);

  return (
    <div className="leaderboard animate-fade-in">
      <header className="lb-header text-center">
        <CpuIcon />
        <h1 className="heading-lg">
          AI Power <span className="text-gradient">Ranking</span>
        </h1>
        <p className="text-muted">
          Peringkat kekuatan negara berdasarkan analisis ribuan pertandingan historis oleh algoritma AI.
        </p>
      </header>

      {/* Podium top-3 */}
      <div className="podium">
        {top3[1] && (
          <div className="podium-card podium-2 glass-card">
            <Trophy size={28} className="rank-icon silver" />
            <p className="podium-name" style={{ marginTop: '1rem' }}>{top3[1].name}</p>
            <p className="podium-pts">{top3[1].powerIndex} <span>PWR</span></p>
            <div className="podium-bar bar-2" />
          </div>
        )}
        {top3[0] && (
          <div className="podium-card podium-1 glass-card">
            <Trophy size={32} className="rank-icon gold" />
            <p className="podium-name" style={{ marginTop: '1rem', fontSize: '1.2rem' }}>{top3[0].name}</p>
            <p className="podium-pts">{top3[0].powerIndex} <span>PWR</span></p>
            <div className="podium-bar bar-1" />
          </div>
        )}
        {top3[2] && (
          <div className="podium-card podium-3 glass-card">
            <Trophy size={24} className="rank-icon bronze" />
            <p className="podium-name" style={{ marginTop: '1rem' }}>{top3[2].name}</p>
            <p className="podium-pts">{top3[2].powerIndex} <span>PWR</span></p>
            <div className="podium-bar bar-3" />
          </div>
        )}
      </div>

      {/* Full list */}
      <div className="lb-list glass">
        <div className="lb-list-header" style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px 80px 80px', gap: '0.5rem' }}>
          <span>Rank</span>
          <span>Negara</span>
          <span className="hide-sm text-center" title="Attack Strength"><Target size={14}/> ATT</span>
          <span className="hide-sm text-center" title="Defense Strength"><Shield size={14}/> DEF</span>
          <span className="text-right">Power</span>
        </div>

        {ranking.map((team, index) => (
          <div key={team.name} className={`lb-row ${index < 3 ? 'lb-row-top' : ''}`} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px 80px 80px', gap: '0.5rem', alignItems: 'center' }}>
            <div className="lb-rank">{rankIcon(index)}</div>

            <div className="lb-user">
              <span className="lb-name font-heading font-bold">{team.name}</span>
            </div>

            <div className="lb-stat hide-sm text-center" style={{ color: '#4ade80' }}>
              {team.attack}
            </div>

            <div className="lb-stat hide-sm text-center" style={{ color: '#f87171' }}>
              {team.defense}
            </div>

            <div className="lb-points text-right">
              <span className="pts-value text-gradient">{team.powerIndex}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CpuIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="url(#gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lb-trophy-icon" style={{ marginBottom: '1rem', filter: 'drop-shadow(0 0 10px rgba(0,255,136,0.5))' }}>
    <defs>
      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00ff88" />
        <stop offset="100%" stopColor="#00b8ff" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
    <rect x="9" y="9" width="6" height="6"></rect>
    <line x1="9" y1="1" x2="9" y2="4"></line>
    <line x1="15" y1="1" x2="15" y2="4"></line>
    <line x1="9" y1="20" x2="9" y2="23"></line>
    <line x1="15" y1="20" x2="15" y2="23"></line>
    <line x1="20" y1="9" x2="23" y2="9"></line>
    <line x1="20" y1="14" x2="23" y2="14"></line>
    <line x1="1" y1="9" x2="4" y2="9"></line>
    <line x1="1" y1="14" x2="4" y2="14"></line>
  </svg>
);

export default Leaderboard;
