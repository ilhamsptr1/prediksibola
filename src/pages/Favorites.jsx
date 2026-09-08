import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Trophy, Clock, CheckCircle2, Trash2, CalendarOff, AlertCircle } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import { usePredictions } from '../context/PredictionContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import './Favorites.css';

const FLAG_FALLBACK = '🏳';

const TeamCrest = ({ crest, name, flag }) => {
  const [err, setErr] = useState(false);
  if (crest && !err) {
    return <img src={crest} alt={name} className="fav-crest" onError={() => setErr(true)} />;
  }
  return <span className="fav-flag">{flag || FLAG_FALLBACK}</span>;
};

const statusLabel = (status) => {
  if (status === 'LIVE' || status === 'IN_PLAY' || status === 'PAUSED') return { text: 'LIVE', cls: 'fav-status-live' };
  if (status === 'FINISHED') return { text: 'Selesai', cls: 'fav-status-finished' };
  if (status === 'TIMED' || status === 'SCHEDULED') return { text: 'Akan Datang', cls: 'fav-status-upcoming' };
  if (status === 'POSTPONED') return { text: 'Ditunda', cls: 'fav-status-cancelled' };
  if (status === 'CANCELLED') return { text: 'Dibatalkan', cls: 'fav-status-cancelled' };
  return { text: status, cls: 'fav-status-upcoming' };
};

const formatDate = (utcDate) => {
  if (!utcDate) return '';
  const d = new Date(utcDate);
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTime = (utcDate) => {
  if (!utcDate) return '';
  const d = new Date(utcDate);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
};

const FavoriteMatchCard = ({ match, onRemove, onClick }) => {
  const hs = match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? null;
  const as = match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? null;
  const isFinished = match.status === 'FINISHED';
  const isLive = ['LIVE', 'IN_PLAY', 'PAUSED'].includes(match.status);
  const { text: statusText, cls: statusCls } = statusLabel(match.status);

  return (
    <div className="fav-card glass-card" onClick={onClick}>
      {/* Competition + Status */}
      <div className="fav-card-top">
        <span className="fav-comp">{match.competition?.name || 'Pertandingan'}</span>
        <span className={`fav-badge ${statusCls}`}>
          {isLive && <span className="fav-live-dot" />}
          {statusText}
        </span>
      </div>

      {/* Teams + Score */}
      <div className="fav-teams">
        <div className="fav-team">
          <TeamCrest crest={match.homeTeam?.crest} name={match.homeTeam?.name} flag={match.homeTeam?.flag} />
          <span className="fav-team-name">{match.homeTeam?.shortName || match.homeTeam?.name}</span>
        </div>

        <div className="fav-score-center">
          {(isFinished || isLive) && hs !== null ? (
            <span className="fav-score">{hs} – {as}</span>
          ) : (
            <div className="fav-vs">
              <span className="fav-time">{formatTime(match.utcDate)}</span>
              <span className="fav-vs-text">VS</span>
            </div>
          )}
        </div>

        <div className="fav-team fav-team-away">
          <span className="fav-team-name">{match.awayTeam?.shortName || match.awayTeam?.name}</span>
          <TeamCrest crest={match.awayTeam?.crest} name={match.awayTeam?.name} flag={match.awayTeam?.flag} />
        </div>
      </div>

      {/* Date + Remove */}
      <div className="fav-card-bottom">
        <span className="fav-date">
          <Clock size={12} /> {formatDate(match.utcDate)}
        </span>
        <button
          className="fav-remove-btn"
          onClick={(e) => { e.stopPropagation(); onRemove(match); }}
          title="Hapus dari favorit"
        >
          <Star size={14} fill="#f59e0b" stroke="#f59e0b" />
        </button>
      </div>
    </div>
  );
};

const FILTERS = ['Semua', 'Akan Datang', 'Live', 'Selesai'];

const Favorites = () => {
  const { getFavoriteMatches, toggleFavorite, clearAllFavorites, count } = useFavorites();
  const { getPredictionForMatch } = usePredictions();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('Semua');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const matches = getFavoriteMatches();

  const filtered = matches.filter(m => {
    if (filter === 'Semua') return true;
    if (filter === 'Live') return ['LIVE', 'IN_PLAY', 'PAUSED'].includes(m.status);
    if (filter === 'Selesai') return m.status === 'FINISHED';
    if (filter === 'Akan Datang') return ['TIMED', 'SCHEDULED'].includes(m.status);
    return true;
  });

  // Sort: Live first, then upcoming, then finished
  const sorted = [...filtered].sort((a, b) => {
    const order = (s) => {
      if (['LIVE', 'IN_PLAY', 'PAUSED'].includes(s)) return 0;
      if (['TIMED', 'SCHEDULED'].includes(s)) return 1;
      return 2;
    };
    if (order(a.status) !== order(b.status)) return order(a.status) - order(b.status);
    return new Date(a.utcDate) - new Date(b.utcDate);
  });

  const handleRemove = async (match) => {
    try {
      if (window.Capacitor?.isNativePlatform()) {
        await Haptics.impact({ style: ImpactStyle.Light });
      }
    } catch {}
    toggleFavorite(match);
  };

  const handleClearAll = async () => {
    try {
      if (window.Capacitor?.isNativePlatform()) {
        await Haptics.impact({ style: ImpactStyle.Medium });
      }
    } catch {}
    clearAllFavorites();
    setShowClearConfirm(false);
  };

  const handleCardClick = (match) => navigate(`/match/${match.id}`);

  const liveCount = matches.filter(m => ['LIVE', 'IN_PLAY', 'PAUSED'].includes(m.status)).length;

  return (
    <div className="favorites animate-fade-in">
      {/* Header */}
      <header className="fav-header text-center">
        <div className="fav-icon-wrap">
          <Star size={40} fill="#f59e0b" stroke="#f59e0b" className="fav-star-icon" />
        </div>
        <h1 className="heading-lg">
          Pertandingan <span className="text-gradient">Favorit</span>
        </h1>
        <p className="text-muted">
          Tandai pertandingan favoritmu agar mudah dipantau
        </p>
        {count > 0 && (
          <div className="fav-meta-row">
            <span className="fav-count-badge">{count} pertandingan disimpan</span>
            {liveCount > 0 && (
              <span className="fav-live-badge">
                <span className="fav-live-dot" /> {liveCount} Sedang Live!
              </span>
            )}
          </div>
        )}
      </header>

      {/* Filter Tabs */}
      {count > 0 && (
        <div className="fav-filters">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`fav-filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
              {f === 'Live' && liveCount > 0 && (
                <span className="fav-filter-badge">{liveCount}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {count === 0 ? (
        <div className="fav-empty glass-card">
          <CalendarOff size={64} className="fav-empty-icon" />
          <h3>Belum Ada Favorit</h3>
          <p className="text-muted">
            Tekan ikon ⭐ pada kartu pertandingan atau halaman detail untuk menyimpan pertandingan favorit kamu.
          </p>
          <button className="btn-primary fav-go-btn" onClick={() => navigate('/')}>
            Lihat Jadwal Pertandingan
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="fav-empty-filter glass-card">
          <AlertCircle size={40} className="text-muted" />
          <p className="text-muted">Tidak ada pertandingan untuk filter "{filter}"</p>
        </div>
      ) : (
        <div className="fav-grid">
          {sorted.map(match => (
            <FavoriteMatchCard
              key={match.id}
              match={match}
              onRemove={handleRemove}
              onClick={() => handleCardClick(match)}
            />
          ))}
        </div>
      )}

      {/* Clear All Button */}
      {count > 0 && (
        <div className="fav-clear-wrap">
          {showClearConfirm ? (
            <div className="fav-confirm glass-card">
              <p>Hapus <strong>semua {count} pertandingan</strong> dari favorit?</p>
              <div className="fav-confirm-btns">
                <button className="fav-confirm-yes" onClick={handleClearAll}>
                  <Trash2 size={14} /> Ya, Hapus Semua
                </button>
                <button className="fav-confirm-no" onClick={() => setShowClearConfirm(false)}>
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <button className="fav-clear-btn" onClick={() => setShowClearConfirm(true)}>
              <Trash2 size={14} /> Hapus Semua Favorit
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Favorites;
