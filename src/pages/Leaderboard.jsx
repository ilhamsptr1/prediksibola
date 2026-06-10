import React from 'react';
import { mockLeaderboard } from '../data/mockLeaderboard';
import { Trophy, Medal, Target, CheckCircle } from 'lucide-react';
import './Leaderboard.css';

const rankIcon = (index) => {
  if (index === 0) return <Trophy size={22} className="rank-icon gold" />;
  if (index === 1) return <Medal  size={22} className="rank-icon silver" />;
  if (index === 2) return <Medal  size={22} className="rank-icon bronze" />;
  return <span className="rank-number">#{index + 1}</span>;
};

const Leaderboard = () => {
  const top3    = mockLeaderboard.slice(0, 3);
  const theRest = mockLeaderboard.slice(3);

  return (
    <div className="leaderboard animate-fade-in">

      {/* Hero */}
      <header className="lb-header text-center">
        <Trophy size={52} className="lb-trophy-icon" />
        <h1 className="heading-lg">
          Peringkat <span className="text-gradient">Global</span>
        </h1>
        <p className="text-muted">
          Prediksi terbaik Piala Dunia 2026 — siapa yang paling jago?
        </p>
      </header>

      {/* Podium top-3 */}
      <div className="podium">
        {/* 2nd */}
        {top3[1] && (
          <div className="podium-card podium-2 glass-card">
            <Medal size={28} className="rank-icon silver" />
            <img src={top3[1].avatar} alt={top3[1].name} className="podium-avatar" />
            <p className="podium-name">{top3[1].name}</p>
            <p className="podium-pts">{top3[1].points} <span>pts</span></p>
            <div className="podium-bar bar-2" />
          </div>
        )}
        {/* 1st */}
        {top3[0] && (
          <div className="podium-card podium-1 glass-card">
            <Trophy size={32} className="rank-icon gold" />
            <img src={top3[0].avatar} alt={top3[0].name} className="podium-avatar large" />
            <p className="podium-name">{top3[0].name}</p>
            <p className="podium-pts">{top3[0].points} <span>pts</span></p>
            <div className="podium-bar bar-1" />
          </div>
        )}
        {/* 3rd */}
        {top3[2] && (
          <div className="podium-card podium-3 glass-card">
            <Medal size={24} className="rank-icon bronze" />
            <img src={top3[2].avatar} alt={top3[2].name} className="podium-avatar" />
            <p className="podium-name">{top3[2].name}</p>
            <p className="podium-pts">{top3[2].points} <span>pts</span></p>
            <div className="podium-bar bar-3" />
          </div>
        )}
      </div>

      {/* Full list */}
      <div className="lb-list glass">
        <div className="lb-list-header">
          <span>Pemain</span>
          <span className="hide-sm">Prediksi</span>
          <span className="hide-sm">Benar</span>
          <span>Poin</span>
        </div>

        {mockLeaderboard.map((user, index) => (
          <div key={user.id} className={`lb-row ${index < 3 ? 'lb-row-top' : ''}`}>
            <div className="lb-rank">{rankIcon(index)}</div>

            <div className="lb-user">
              <img src={user.avatar} alt={user.name} className="lb-avatar" />
              <span className="lb-name">{user.name}</span>
            </div>

            <div className="lb-stat hide-sm">
              <Target size={14} />
              {user.totalPredicted}
            </div>

            <div className="lb-stat hide-sm">
              <CheckCircle size={14} />
              {user.correct}
            </div>

            <div className="lb-points">
              <span className="pts-value">{user.points}</span>
              <span className="pts-label">pts</span>
            </div>
          </div>
        ))}
      </div>

      <p className="lb-note text-muted">
        * Leaderboard diperbarui setelah setiap pertandingan selesai.
      </p>
    </div>
  );
};

export default Leaderboard;
