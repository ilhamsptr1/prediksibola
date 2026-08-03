import React, { useState, useEffect } from 'react';
import MatchCard from '../components/MatchCard';
import LeagueSelector from '../components/LeagueSelector';
import { usePredictions } from '../context/PredictionContext';
import { useMatches } from '../hooks/useMatches';
import { getLeague } from '../data/leagues';
import { RefreshCw, Wifi, WifiOff, Zap, CalendarOff, Search, X } from 'lucide-react';
import './Dashboard.css';

// Mapping liga → file background di /public/img/
const LEAGUE_BG = {
  WC:  '/img/bg_wc.jpg',
  PL:  '/img/bg_pl.png',
  PD:  '/img/bg_laliga.jpg',
  SA:  '/img/bg_seriea.jpg',
  BL1: '/img/bg_bundesliga.jpg',
  FL1: '/img/bg_ligue1.jpg',
  PPL: '/img/bg_ligapt.jpg',
  CL:  '/img/bg_wc.jpg',     // fallback
  EC:  '/img/bg_wc.jpg',     // fallback Euro
};

const Dashboard = () => {
  const { selectedLeagueCode, setSelectedLeagueCode } = usePredictions();
  const selectedLeague = getLeague(selectedLeagueCode);

  const { matches, loading, isLive, lastUpdated, error, hasLiveNow, refresh } = useMatches(selectedLeagueCode);

  const [selectedGroup, setSelectedGroup]     = useState('Semua');
  const [selectedMatchday, setSelectedMatchday] = useState('Semua');
  const [searchQuery, setSearchQuery]           = useState('');

  // Reset filters when league changes
  const handleLeagueSelect = (code) => {
    setSelectedLeagueCode(code);
    setSelectedGroup('Semua');
    setSelectedMatchday('Semua');
    setSearchQuery('');
  };

  // Unique group codes sorted
  const groups = ['Semua', ...new Set(matches.map(m => m.group).filter(Boolean))].sort((a, b) =>
    a === 'Semua' ? -1 : b === 'Semua' ? 1 : a.localeCompare(b)
  );

  // Matchdays
  const matchdays = ['Semua', ...new Set(matches.map(m => m.matchday).filter(Boolean))].sort((a, b) =>
    a === 'Semua' ? -1 : b === 'Semua' ? 1 : Number(a) - Number(b)
  );

  // Filter
  const filteredMatches = matches.filter(m => {
    const groupOk    = selectedGroup    === 'Semua' || m.group    === selectedGroup;
    const matchdayOk = selectedMatchday === 'Semua' || String(m.matchday) === String(selectedMatchday);
    const searchOk   = !searchQuery.trim() ||
      m.homeTeam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.awayTeam.name.toLowerCase().includes(searchQuery.toLowerCase());
    return groupOk && matchdayOk && searchOk;
  });

  const liveMatches     = filteredMatches.filter(m => m.status === 'LIVE');
  const upcomingMatches = filteredMatches.filter(m => m.status === 'SCHEDULED');
  const finishedMatches = filteredMatches.filter(m => m.status === 'FINISHED');

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const isGroupCompetition = selectedLeague?.hasGroups;

  // Ganti background body sesuai liga yang dipilih
  useEffect(() => {
    const bg = LEAGUE_BG[selectedLeagueCode] || LEAGUE_BG['WC'];
    document.body.style.setProperty('--league-bg', `url('${bg}')`);
    document.body.classList.add('has-league-bg');
    return () => {
      document.body.classList.remove('has-league-bg');
      document.body.style.removeProperty('--league-bg');
    };
  }, [selectedLeagueCode]);

  return (
    <div className="dashboard animate-fade-in">

      {/* ── Hero Header ── */}
      <header className="dashboard-header text-center">
        <h1 className="heading-lg">
          <span className="text-gradient">{selectedLeague?.name || 'Prediksi Bola'}</span>
        </h1>
        <p className="subtitle text-muted">
          Jadwal pertandingan dan prediksi AI — powered by football-data.org
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

      {/* ── League Selector ── */}
      <LeagueSelector selectedLeague={selectedLeagueCode} onSelect={handleLeagueSelect} />

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

      {/* ── Search Bar ── */}
      {matches.length > 0 && (
        <div className="search-bar-wrapper">
          <div className="search-bar glass">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Cari tim... (misal: Arsenal, Real Madrid)"
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

      {/* ── Error banner ── */}
      {error && (
        <div className="error-banner">
          ⚠️ API tidak tersedia — {selectedLeagueCode === 'WC' ? 'menampilkan jadwal lokal.' : 'tidak ada data untuk liga ini.'} ({error})
        </div>
      )}

      {/* ── Filters ── */}
      {matches.length > 0 && (
        <section className="filters-section">
          {isGroupCompetition && groups.length > 2 && (
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
          )}
          {matchdays.length > 2 && (
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
          )}
        </section>
      )}

      {/* ── Loading skeleton ── */}
      {loading && matches.length === 0 && (
        <div className="skeleton-grid">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton-card" />)}
        </div>
      )}

      {/* ── Empty state (no matches from API) ── */}
      {!loading && matches.length === 0 && (
        <div className="empty-state glass-card">
          <CalendarOff size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
          <h3>Jadwal Tidak Tersedia</h3>
          <p className="text-muted">
            Data untuk <strong>{selectedLeague?.name}</strong> belum tersedia.<br />
            Kemungkinan liga sedang dalam masa jeda antar musim, atau API Key belum terpasang.
          </p>
          <button className="btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => handleLeagueSelect('WC')}>
            Lihat Jadwal World Cup
          </button>
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

      {!loading && filteredMatches.length === 0 && matches.length > 0 && (
        <div className="no-matches text-muted">Tidak ada pertandingan untuk filter ini.</div>
      )}
    </div>
  );
};

export default Dashboard;
