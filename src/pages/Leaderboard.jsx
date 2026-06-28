import React, { useState } from 'react';
import { Trophy, Target, Shield, TrendingUp } from 'lucide-react';
import teamRatingsData from '../data/teamRatings.json';
import './Leaderboard.css';

const MEDAL = ['🥇', '🥈', '🥉'];

const formColor = (c) => {
  if (c === 'W') return '#4ade80';
  if (c === 'D') return '#94a3b8';
  return '#f87171';
};

const Leaderboard = () => {
  const [search, setSearch] = useState('');
  const ranking = teamRatingsData.aiPowerRanking || [];

  const filtered = search.trim()
    ? ranking.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : ranking;

  const top3 = ranking.slice(0, 3);

  return (
    <div className="leaderboard animate-fade-in">
      <header className="lb-header text-center">
        <div className="lb-cpu-icon">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="url(#cpuGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <defs>
              <linearGradient id="cpuGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00ff88"/>
                <stop offset="100%" stopColor="#00b8ff"/>
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="16" height="16" rx="2"/>
            <rect x="9" y="9" width="6" height="6"/>
            <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
            <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
            <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
            <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
          </svg>
        </div>
        <h1 className="heading-lg">AI Power <span className="text-gradient">Ranking</span></h1>
        <p className="text-muted">
          Peringkat kekuatan tim berdasarkan analisis <strong>{ranking.length}</strong> negara
          dari <strong>48.000+</strong> pertandingan historis — Algoritma FIFA-style Elo + Poisson.
        </p>
        <div className="lb-algo-badge">
          Elo Rating · Time Decay · Opponent Weighting · Poisson xG
        </div>
      </header>

      {/* Top 3 Podium */}
      <div className="podium">
        {[top3[1], top3[0], top3[2]].map((team, idx) => {
          if (!team) return null;
          const podiumOrder = [2, 1, 3][idx];
          return (
            <div key={team.name} className={`podium-card podium-${podiumOrder} glass-card`}>
              <div className="podium-medal">{MEDAL[podiumOrder - 1]}</div>
              <p className="podium-name">{team.name}</p>
              <p className="podium-elo">Elo <strong>{team.elo}</strong></p>
              <p className="podium-pts">{team.powerIndex} <span>PWR</span></p>
              <div className="podium-atk-def">
                <span style={{ color: '#4ade80' }}>ATK {team.attack}</span>
                <span style={{ color: '#f87171' }}>DEF {team.defense}</span>
              </div>
              <div className={`podium-bar bar-${podiumOrder}`} />
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="lb-search-wrap">
        <input
          className="lb-search"
          type="text"
          placeholder="🔍  Cari negara…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Full List */}
      <div className="lb-list glass">
        <div className="lb-list-header">
          <span className="col-rank">#</span>
          <span className="col-name">Negara</span>
          <span className="col-elo hide-sm">Elo</span>
          <span className="col-atk hide-sm"><Target size={12}/> ATK</span>
          <span className="col-def hide-sm"><Shield size={12}/> DEF</span>
          <span className="col-form hide-sm">Form</span>
          <span className="col-power"><TrendingUp size={12}/> PWR</span>
        </div>

        {filtered.map((team, index) => {
          const globalIdx = ranking.indexOf(team);
          return (
            <div key={team.name} className={`lb-row ${globalIdx < 3 ? 'lb-row-top' : ''}`}>
              <div className="lb-rank col-rank">
                {globalIdx < 3
                  ? <span className="podium-emoji">{MEDAL[globalIdx]}</span>
                  : <span className="rank-number">#{globalIdx + 1}</span>}
              </div>

              <div className="lb-user col-name">
                <span className="lb-name">{team.name}</span>
              </div>

              <div className="lb-stat col-elo hide-sm" style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)' }}>
                {team.elo}
              </div>

              <div className="lb-stat col-atk hide-sm" style={{ color: '#4ade80' }}>{team.attack}</div>
              <div className="lb-stat col-def hide-sm" style={{ color: '#f87171' }}>{team.defense}</div>

              <div className="lb-stat col-form hide-sm">
                <div style={{ display: 'flex', gap: '2px' }}>
                  {(team.form || '').split('').map((c, i) => (
                    <span key={i} style={{
                      width: 18, height: 18, borderRadius: 3, fontSize: '0.6rem', fontWeight: 800,
                      background: formColor(c) + '33', color: formColor(c),
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>{c}</span>
                  ))}
                </div>
              </div>

              <div className="lb-points col-power">
                <span className="pts-value" style={{
                  background: `linear-gradient(90deg, #00ff88, #00b8ff)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>{team.powerIndex}</span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Tidak ada negara yang ditemukan.
          </div>
        )}
      </div>

      <p className="lb-note text-muted">
        * Berdasarkan {ranking.length} tim dari 48.335 pertandingan (tahun 2000–2025).
        Algoritma: FIFA-style Elo dengan K-factor per turnamen, Time Decay (half-life 4 tahun), dan Home Advantage (+50 Elo).
      </p>
    </div>
  );
};

export default Leaderboard;
