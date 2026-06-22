import React, { useMemo } from 'react';
import { mockLeaderboard } from '../data/mockLeaderboard';
import { useUser } from '../context/UserContext';
import { Trophy, Medal, Target, CheckCircle } from 'lucide-react';
import './Leaderboard.css';

const rankIcon = (index) => {
  if (index === 0) return <Trophy size={22} className="rank-icon gold" />;
  if (index === 1) return <Medal  size={22} className="rank-icon silver" />;
  if (index === 2) return <Medal  size={22} className="rank-icon bronze" />;
  return <span className="rank-number">#{index + 1}</span>;
};

const Leaderboard = () => {
  const { user } = useUser();

  // Combine mock leaderboard with current user
  const combinedLeaderboard = useMemo(() => {
    let list = [...mockLeaderboard];
    
    if (user) {
      // Check if user is already in list (for dev hot reloads)
      if (!list.find(u => u.id === user.id)) {
        list.push({
          id: user.id,
          name: user.name + ' (Anda)',
          avatar: user.avatar,
          points: user.points,
          totalPredicted: user.totalPredicted,
          correct: user.correct,
          isCurrentUser: true
        });
      }
    }
    
    // Sort by points descending
    return list.sort((a, b) => b.points - a.points);
  }, [user]);

  const top3    = combinedLeaderboard.slice(0, 3);

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
          <div className={`podium-card podium-2 glass-card ${top3[1].isCurrentUser ? 'current-user-podium' : ''}`}>
            <Medal size={28} className="rank-icon silver" />
            <img src={top3[1].avatar} alt={top3[1].name} className="podium-avatar" />
            <p className="podium-name">{top3[1].name}</p>
            <p className="podium-pts">{top3[1].points} <span>pts</span></p>
            <div className="podium-bar bar-2" />
          </div>
        )}
        {/* 1st */}
        {top3[0] && (
          <div className={`podium-card podium-1 glass-card ${top3[0].isCurrentUser ? 'current-user-podium' : ''}`}>
            <Trophy size={32} className="rank-icon gold" />
            <img src={top3[0].avatar} alt={top3[0].name} className="podium-avatar large" />
            <p className="podium-name">{top3[0].name}</p>
            <p className="podium-pts">{top3[0].points} <span>pts</span></p>
            <div className="podium-bar bar-1" />
          </div>
        )}
        {/* 3rd */}
        {top3[2] && (
          <div className={`podium-card podium-3 glass-card ${top3[2].isCurrentUser ? 'current-user-podium' : ''}`}>
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

        {combinedLeaderboard.map((u, index) => (
          <div key={u.id} className={`lb-row ${index < 3 ? 'lb-row-top' : ''} ${u.isCurrentUser ? 'lb-row-current' : ''}`}>
            <div className="lb-rank">{rankIcon(index)}</div>

            <div className="lb-user">
              <img src={u.avatar} alt={u.name} className="lb-avatar" />
              <span className="lb-name" style={{ color: u.isCurrentUser ? 'var(--primary)' : 'inherit', fontWeight: u.isCurrentUser ? 'bold' : 'normal' }}>
                {u.name}
              </span>
            </div>

            <div className="lb-stat hide-sm">
              <Target size={14} />
              {u.totalPredicted}
            </div>

            <div className="lb-stat hide-sm">
              <CheckCircle size={14} />
              {u.correct}
            </div>

            <div className="lb-points">
              <span className="pts-value" style={{ color: u.isCurrentUser ? 'var(--primary)' : 'inherit' }}>{u.points}</span>
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
