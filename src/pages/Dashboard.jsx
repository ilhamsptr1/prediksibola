import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import MatchRow from '../components/MatchRow';
import LeagueSelector from '../components/LeagueSelector';
import { usePredictions } from '../context/PredictionContext';
import { useMatches } from '../hooks/useMatches';
import { getLeague } from '../data/leagues';
import { RefreshCw, Wifi, WifiOff, Zap, CalendarOff, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import './Dashboard.css';

// Mapping liga → file background
const LEAGUE_BG = {
  WC:  '/img/bg_wc.jpg',
  PL:  '/img/bg_pl.png',
  PD:  '/img/bg_laliga.jpg',
  SA:  '/img/bg_seriea.jpg',
  BL1: '/img/bg_bundesliga.jpg',
  FL1: '/img/bg_ligue1.jpg',
  PPL: '/img/bg_ligapt.jpg',
  CL:  '/img/bg_wc.jpg',
  EC:  '/img/bg_wc.jpg',
};

/**
 * Smart: pilih matchday yang paling relevan.
 * Priority: ada yang LIVE → ada SCHEDULED terdekat → matchday terakhir selesai
 */
const getActiveMatchday = (matches) => {
  if (!matches.length) return null;

  // 1. Ada pertandingan LIVE → tampilkan matchday tersebut
  const liveMatch = matches.find(m => m.status === 'LIVE');
  if (liveMatch) return liveMatch.matchday;

  // 2. Ada pertandingan SCHEDULED → ambil matchday dengan jadwal paling awal
  const scheduledMatches = matches.filter(m => m.status === 'SCHEDULED');
  if (scheduledMatches.length) {
    // Sort by utcDate, ambil paling dekat
    const sorted = [...scheduledMatches].sort((a, b) =>
      new Date(a.utcDate) - new Date(b.utcDate)
    );
    return sorted[0].matchday;
  }

  // 3. Semua FINISHED → tampilkan matchday terbesar (paling baru)
  const mds = [...new Set(matches.map(m => m.matchday).filter(Boolean))].map(Number).sort((a, b) => b - a);
  return mds[0] ?? null;
};

const Dashboard = () => {
  const { selectedLeagueCode, setSelectedLeagueCode } = usePredictions();
  const selectedLeague = getLeague(selectedLeagueCode);
  const { matches, loading, isLive, lastUpdated, error, hasLiveNow, refresh } = useMatches(selectedLeagueCode);

  const [searchQuery, setSearchQuery] = useState('');

  // Sorted unique matchdays
  const matchdays = useMemo(() =>
    [...new Set(matches.map(m => m.matchday).filter(Boolean))]
      .map(Number).sort((a, b) => a - b),
    [matches]
  );

  // Auto-detect active matchday when matches load
  const autoMD = useMemo(() => getActiveMatchday(matches), [matches]);
  const [selectedMatchday, setSelectedMatchday] = useState(null);

  // Reset when league or auto-matchday changes
  useEffect(() => {
    setSelectedMatchday(autoMD);
    setSearchQuery('');
  }, [selectedLeagueCode, autoMD]);

  const handleLeagueSelect = (code) => {
    setSelectedLeagueCode(code);
  };

  // Filter matches
  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      const mdOk = selectedMatchday === null || Number(m.matchday) === Number(selectedMatchday);
      const searchOk = !searchQuery.trim() ||
        m.homeTeam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.awayTeam.name.toLowerCase().includes(searchQuery.toLowerCase());
      return mdOk && searchOk;
    });
  }, [matches, selectedMatchday, searchQuery]);

  // Sort within matchday: LIVE first, then SCHEDULED by date, then FINISHED
  const sortedMatches = useMemo(() => {
    const order = { LIVE: 0, SCHEDULED: 1, FINISHED: 2 };
    return [...filteredMatches].sort((a, b) => {
      const statusDiff = (order[a.status] ?? 1) - (order[b.status] ?? 1);
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.utcDate) - new Date(b.utcDate);
    });
  }, [filteredMatches]);

  // For group competitions: group by group name
  const isGroupComp = selectedLeague?.hasGroups;
  const groups = useMemo(() => {
    if (!isGroupComp) return null;
    const grpMap = {};
    sortedMatches.forEach(m => {
      const key = m.group || 'Lainnya';
      if (!grpMap[key]) grpMap[key] = [];
      grpMap[key].push(m);
    });
    return grpMap;
  }, [sortedMatches, isGroupComp]);

  // Navigate matchdays
  const mdIndex = matchdays.indexOf(Number(selectedMatchday));
  const prevMD = mdIndex > 0 ? matchdays[mdIndex - 1] : null;
  const nextMD = mdIndex < matchdays.length - 1 ? matchdays[mdIndex + 1] : null;

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  useEffect(() => {
    const bg = LEAGUE_BG[selectedLeagueCode] || LEAGUE_BG['WC'];
    document.body.style.setProperty('--league-bg', `url('${bg}')`);
    document.body.classList.add('has-league-bg');
    return () => {
      document.body.classList.remove('has-league-bg');
      document.body.style.removeProperty('--league-bg');
    };
  }, [selectedLeagueCode]);

  const liveCount = filteredMatches.filter(m => m.status === 'LIVE').length;

  return (
    <div className="dashboard animate-fade-in">

      {/* Hero Header */}
      <motion.header
        className="dashboard-header text-center"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <h1 className="heading-lg">
          <span className="text-gradient">{selectedLeague?.name || 'Prediksi Bola'}</span>
        </h1>
        <p className="subtitle">
          Jadwal pertandingan dan prediksi AI — powered by football-data.org
        </p>
        <div className="stats-row">
          {hasLiveNow && (
            <div className="live-pill glass">
              <span className="live-dot" />
              {liveCount} Live Sekarang
            </div>
          )}
        </div>
      </motion.header>

      {/* League Selector */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <LeagueSelector selectedLeague={selectedLeagueCode} onSelect={handleLeagueSelect} />
      </motion.div>

      {/* Source Bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.15 }}>
        <div className="source-bar glass">
          <div className="source-left">
            {isLive
              ? <><Wifi size={14} className="icon-live" /> Data Live (football-data.org)</>
              : <><WifiOff size={14} className="icon-offline" /> Data Lokal</>
            }
          </div>
          <div className="source-right">
            <span className="last-updated">Diperbarui: {lastUpdatedStr}</span>
            <button className={`refresh-btn ${loading ? 'spinning' : ''}`} onClick={refresh} disabled={loading} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Search */}
      {matches.length > 0 && (
        <div className="search-bar-wrapper">
          <div className="search-bar glass">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Cari tim..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && matches.length === 0 && (
        <div className="skeleton-grid">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton-row" />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && matches.length === 0 && (
        <div className="empty-state glass-card">
          <CalendarOff size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
          <h3>Jadwal Tidak Tersedia</h3>
          <p className="text-muted">
            Data untuk <strong>{selectedLeague?.name}</strong> belum tersedia.
          </p>
          <button className="btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => handleLeagueSelect('WC')}>
            Lihat Jadwal World Cup
          </button>
        </div>
      )}

      {/* Main match list */}
      {matches.length > 0 && (
        <motion.div
          className="matches-container"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {/* Matchday Navigator */}
          {matchdays.length > 1 && (
            <div className="matchday-nav">
              <button
                className="md-nav-btn"
                onClick={() => prevMD !== null && setSelectedMatchday(prevMD)}
                disabled={prevMD === null}
              >
                <ChevronLeft size={16} />
              </button>

              <div className="md-nav-pills">
                {matchdays.map(md => (
                  <button
                    key={md}
                    className={`md-pill${Number(selectedMatchday) === md ? ' md-pill--active' : ''}${md === Number(autoMD) ? ' md-pill--auto' : ''}`}
                    onClick={() => setSelectedMatchday(md)}
                  >
                    MD {md}
                    {md === Number(autoMD) && <span className="md-pill-dot" />}
                  </button>
                ))}
              </div>

              <button
                className="md-nav-btn"
                onClick={() => nextMD !== null && setSelectedMatchday(nextMD)}
                disabled={nextMD === null}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Matchday title */}
          {selectedMatchday && !searchQuery && (
            <div className="matchday-header">
              <span className="matchday-title">
                {hasLiveNow && liveCount > 0 && <><span className="live-dot" style={{marginRight:6}}/></>}
                Matchday {selectedMatchday}
              </span>
              <span className="matchday-meta">
                {sortedMatches.filter(m => m.status === 'FINISHED').length}/{sortedMatches.length} selesai
              </span>
            </div>
          )}

          {/* Match rows — grouped by group for group competitions */}
          <div className="match-list glass-card">
            {isGroupComp && groups && !searchQuery
              ? Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([grpName, grpMatches]) => (
                  <div key={grpName} className="match-group-section">
                    <div className="match-group-header">
                      <span>{grpName === 'Lainnya' ? 'Pertandingan' : `Grup ${grpName}`}</span>
                    </div>
                    {grpMatches.map(m => <MatchRow key={m.id} match={m} />)}
                  </div>
                ))
              : sortedMatches.map(m => <MatchRow key={m.id} match={m} />)
            }
          </div>

          {!loading && sortedMatches.length === 0 && matches.length > 0 && (
            <div className="no-matches text-muted">Tidak ada pertandingan untuk filter ini.</div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default Dashboard;
