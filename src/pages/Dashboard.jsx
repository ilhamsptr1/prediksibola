import React, { useState } from 'react';
import MatchCard from '../components/MatchCard';
import { usePredictions } from '../context/PredictionContext';
import { useMatches } from '../hooks/useMatches';
import { RefreshCw, Wifi, WifiOff, Zap } from 'lucide-react';
import './Dashboard.css';

const Dashboard = () => {
  const { predictions } = usePredictions();
  const { matches, loading, isLive, lastUpdated, error, hasLiveNow, refresh } = useMatches();
  const [selectedGroup, setSelectedGroup] = useState('Semua');
  const [selectedMatchday, setSelectedMatchday] = useState('Semua');

  const predictedCount    = predictions.length;
  const totalGroupMatches = matches.length;

  // Unique group codes sorted
  const groups = ['Semua', ...new Set(matches.map(m => m.group))].sort((a, b) =>
    a === 'Semua' ? -1 : b === 'Semua' ? 1 : a.localeCompare(b)
  );

  // Matchdays
  const matchdays = ['Semua', ...new Set(matches.map(m => m.matchday).filter(Boolean))].sort();

  // Filter
  const filteredMatches = matches.filter(m => {
    const groupOk    = selectedGroup    === 'Semua' || m.group    === selectedGroup;
    const matchdayOk = selectedMatchday === 'Semua' || String(m.matchday) === String(selectedMatchday);
    return groupOk && matchdayOk;
  });

  const liveMatches     = filteredMatches.filter(m => m.status === 'LIVE');
  const upcomingMatches = filteredMatches.filter(m => m.status === 'SCHEDULED');
  const finishedMatches = filteredMatches.filter(m => m.status === 'FINISHED');

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div className="dashboard animate-fade-in">

      {/* ── Hero Header ── */}
      <header className="dashboard-header text-center">
        <h1 className="heading-lg">
          Prediksi <span className="text-gradient">Piala Dunia 2026</span>
        </h1>
        <p className="subtitle text-muted">
          Jadwal resmi babak grup — 48 tim, 12 grup, 72 pertandingan.
        </p>

        {/* Stats pill */}
        <div className="stats-row">

          {hasLiveNow && (
            <div className="live-pill glass">
              <span className="live-dot" />
              {liveMatches.length} Live Sekarang
            </div>
          )}
        </div>
      </header>

      {/* ── Data Source Bar ── */}
      <div className="source-bar glass">
        <div className="source-left">
          {isLive
            ? <><Wifi size={16} className="icon-live" /> Data Live (football-data.org)</>
            : <><WifiOff size={16} className="icon-offline" /> Data Lokal (aktifkan API key untuk live)</>
          }
        </div>
        <div className="source-right">
          <span className="last-updated">Diperbarui: {lastUpdatedStr}</span>
          <button className={`refresh-btn ${loading ? 'spinning' : ''}`} onClick={refresh} disabled={loading} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="error-banner">
          ⚠️ API tidak tersedia — menampilkan jadwal lokal. ({error})
        </div>
      )}

      {/* ── Filters ── */}
      <section className="filters-section">
        <div className="filter-group">
          <span className="filter-label">Grup:</span>
          <div className="filter-chips">
            {groups.map(g => (
              <button
                key={g}
                className={`filter-btn ${selectedGroup === g ? 'active' : ''}`}
                onClick={() => setSelectedGroup(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Matchday:</span>
          <div className="filter-chips">
            {matchdays.map(md => (
              <button
                key={md}
                className={`filter-btn ${selectedMatchday === String(md) ? 'active' : ''}`}
                onClick={() => setSelectedMatchday(String(md))}
              >
                {md === 'Semua' ? 'Semua' : `MD ${md}`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Loading skeleton ── */}
      {loading && matches.length === 0 && (
        <div className="skeleton-grid">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton-card" />)}
        </div>
      )}

      {/* ── LIVE Matches ── */}
      {liveMatches.length > 0 && (
        <section className="matches-section">
          <div className="section-title live-title">
            <Zap size={20} className="icon-live" />
            <h2>Sedang Berlangsung</h2>
            <div className="title-underline red" />
          </div>
          <div className="grid-auto">
            {liveMatches.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* ── Upcoming Matches ── */}
      {upcomingMatches.length > 0 && (
        <section className="matches-section">
          <div className="section-title">
            <h2>Akan Datang</h2>
            <div className="title-underline" />
          </div>
          <div className="grid-auto">
            {upcomingMatches.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* ── Finished Matches ── */}
      {finishedMatches.length > 0 && (
        <section className="matches-section">
          <div className="section-title">
            <h2>Selesai</h2>
            <div className="title-underline muted" />
          </div>
          <div className="grid-auto">
            {finishedMatches.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {!loading && filteredMatches.length === 0 && (
        <div className="no-matches text-muted">Tidak ada pertandingan untuk filter ini.</div>
      )}
    </div>
  );
};

export default Dashboard;
