import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { FIFA_RANKING, FIFA_RANKING_DATE, FIFA_NEXT_UPDATE } from '../data/fifaRanking';
import './Leaderboard.css';

const MEDAL = ['🥇', '🥈', '🥉'];

const CONF_COLORS = {
  UEFA:     { bg: 'rgba(0,100,255,0.15)', border: 'rgba(0,100,255,0.4)', text: '#60a5fa' },
  CONMEBOL: { bg: 'rgba(0,200,100,0.15)', border: 'rgba(0,200,100,0.4)', text: '#4ade80' },
  CAF:      { bg: 'rgba(255,180,0,0.15)', border: 'rgba(255,180,0,0.4)', text: '#fbbf24' },
  AFC:      { bg: 'rgba(255,60,0,0.15)',  border: 'rgba(255,60,0,0.4)',  text: '#f87171' },
  CONCACAF: { bg: 'rgba(180,0,255,0.15)', border: 'rgba(180,0,255,0.4)', text: '#c084fc' },
  OFC:      { bg: 'rgba(0,200,200,0.15)', border: 'rgba(0,200,200,0.4)', text: '#22d3ee' },
};

const CONF_FILTERS = ['Semua', 'UEFA', 'CONMEBOL', 'CAF', 'AFC', 'CONCACAF'];

const ChangeIcon = ({ change }) => {
  if (change > 0) return <span className="rank-up">▲ {change}</span>;
  if (change < 0) return <span className="rank-down">▼ {Math.abs(change)}</span>;
  return <span className="rank-same">—</span>;
};

const Leaderboard = () => {
  const [search, setSearch]         = useState('');
  const [activeConf, setActiveConf] = useState('Semua');

  const filtered = FIFA_RANKING.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchConf   = activeConf === 'Semua' || t.confederation === activeConf;
    return matchSearch && matchConf;
  });

  const top3 = FIFA_RANKING.slice(0, 3);

  return (
    <div className="leaderboard animate-fade-in">
      {/* Header */}
      <header className="lb-header text-center">
        <div className="lb-fifa-badge">
          <span style={{ fontSize: '2.5rem' }}>🏆</span>
        </div>
        <h1 className="heading-lg">FIFA <span className="text-gradient">World Ranking</span></h1>
        <p className="text-muted">
          Peringkat resmi FIFA/Coca-Cola Men's World Ranking — <strong>{FIFA_RANKING.length}</strong> negara
        </p>
        <div className="lb-update-info">
          <span>📅 Update terakhir: <strong>{FIFA_RANKING_DATE}</strong></span>
          <span className="lb-sep">·</span>
          <span>🔜 Update berikutnya: <strong>{FIFA_NEXT_UPDATE}</strong></span>
        </div>
        <div className="lb-algo-badge" style={{ background: 'rgba(0,150,255,0.1)', borderColor: 'rgba(0,150,255,0.3)', color: '#60a5fa' }}>
          Sumber Resmi: FIFA.com — Bukan AI Generated
        </div>
      </header>

      {/* Top 3 Podium */}
      <div className="podium">
        {[top3[1], top3[0], top3[2]].map((team, idx) => {
          if (!team) return null;
          const podiumOrder = [2, 1, 3][idx];
          const conf = CONF_COLORS[team.confederation] || {};
          return (
            <div key={team.name} className={`podium-card podium-${podiumOrder} glass-card`}>
              <div className="podium-medal">{MEDAL[podiumOrder - 1]}</div>
              <div className="podium-flag">{team.flag}</div>
              <p className="podium-name">{team.name}</p>
              <p className="podium-elo" style={{ color: '#60a5fa' }}>
                <strong>{team.points.toFixed(2)}</strong> pts
              </p>
              <span className="podium-conf-badge" style={{ background: conf.bg, border: `1px solid ${conf.border}`, color: conf.text }}>
                {team.confederation}
              </span>
              <div className={`podium-bar bar-${podiumOrder}`} />
            </div>
          );
        })}
      </div>

      {/* Confederation Filter */}
      <div className="lb-conf-filter">
        {CONF_FILTERS.map(cf => (
          <button
            key={cf}
            className={`lb-conf-btn ${activeConf === cf ? 'active' : ''}`}
            onClick={() => setActiveConf(cf)}
          >
            {cf}
          </button>
        ))}
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
          <span className="col-elo">Poin FIFA</span>
          <span className="col-conf hide-sm">Konfederasi</span>
          <span className="col-power">Perubahan</span>
        </div>

        {filtered.map((team) => {
          const globalIdx = team.rank - 1;
          const conf = CONF_COLORS[team.confederation] || {};
          return (
            <div key={team.name} className={`lb-row ${globalIdx < 3 ? 'lb-row-top' : ''}`}>
              <div className="lb-rank col-rank">
                {globalIdx < 3
                  ? <span className="podium-emoji">{MEDAL[globalIdx]}</span>
                  : <span className="rank-number">#{team.rank}</span>}
              </div>

              <div className="lb-user col-name">
                <span className="lb-flag">{team.flag}</span>
                <span className="lb-name">{team.name}</span>
              </div>

              <div className="lb-stat col-elo" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>
                {team.points.toFixed(2)}
              </div>

              <div className="lb-stat col-conf hide-sm">
                <span style={{ background: conf.bg, border: `1px solid ${conf.border}`, color: conf.text, padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700 }}>
                  {team.confederation}
                </span>
              </div>

              <div className="lb-points col-power">
                <ChangeIcon change={team.change} />
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
        * Data peringkat resmi FIFA/Coca-Cola Men's World Ranking per {FIFA_RANKING_DATE}.
        Peringkat diperbarui secara berkala sesuai jadwal resmi FIFA.
        Sumber: <a href="https://www.fifa.com/en/fifa-world-ranking/men" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>fifa.com</a>
      </p>
    </div>
  );
};

export default Leaderboard;
