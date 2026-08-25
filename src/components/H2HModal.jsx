import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, TrendingUp, Target, Shield, Zap } from 'lucide-react';
import './H2HModal.css';

let userApiKey = import.meta.env.VITE_FOOTBALL_API_KEY;
const FALLBACK_KEY = '4eda5db232484db3b743c1544bf90b86';
let API_KEY = (!userApiKey || userApiKey.trim().length < 10) ? FALLBACK_KEY : userApiKey.trim();
const isNative = window.Capacitor?.isNativePlatform();
const BASE_URL = isNative ? 'https://api.football-data.org/v4' : '/api/football-data/v4';

const TeamCrest = ({ crest, name, size = 36 }) => {
  const [err, setErr] = useState(false);
  if (crest && !err) {
    return <img src={crest} alt={name} width={size} height={size} style={{ objectFit: 'contain' }} onError={() => setErr(true)} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(255,255,255,0.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
    }}>
      {name?.[0] || '?'}
    </div>
  );
};

const H2HModal = ({ match, onClose }) => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;

  const fetchH2H = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res = await fetch(
        `${BASE_URL}/matches/${match.id}/head2head?limit=15`,
        { headers: { 'X-Auth-Token': API_KEY } }
      );
      
      // Fallback jika API key user tidak valid / terblokir untuk endpoint ini
      if (res.status === 400 && API_KEY !== FALLBACK_KEY) {
        API_KEY = FALLBACK_KEY;
        res = await fetch(
          `${BASE_URL}/matches/${match.id}/head2head?limit=15`,
          { headers: { 'X-Auth-Token': API_KEY } }
        );
      }
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [match.id]);

  useEffect(() => {
    fetchH2H();
    // Tutup modal saat klik backdrop atau tekan Escape
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fetchH2H, onClose]);

  // Hitung statistik dari H2H data
  const stats = React.useMemo(() => {
    if (!data?.matches?.length) return null;
    const matches = data.matches.filter(m => m.status === 'FINISHED');
    let homeW = 0, draws = 0, awayW = 0;
    let totalGoals = 0;
    const homeId = homeTeam.id;

    for (const m of matches) {
      const hg = m.score?.fullTime?.home ?? 0;
      const ag = m.score?.fullTime?.away ?? 0;
      totalGoals += hg + ag;
      if (m.homeTeam.id === homeId) {
        if (hg > ag) homeW++;
        else if (hg === ag) draws++;
        else awayW++;
      } else {
        if (ag > hg) homeW++;
        else if (hg === ag) draws++;
        else awayW++;
      }
    }

    const total = matches.length;
    return {
      homeW, draws, awayW, total,
      homeWPct:  total ? ((homeW  / total) * 100).toFixed(0) : 0,
      drawPct:   total ? ((draws  / total) * 100).toFixed(0) : 0,
      awayWPct:  total ? ((awayW  / total) * 100).toFixed(0) : 0,
      avgGoals:  total ? (totalGoals / total).toFixed(1) : 0,
      avgGoalsH: total ? (matches.reduce((s, m) => {
        const hg = m.score?.fullTime?.home ?? 0;
        const ag = m.score?.fullTime?.away ?? 0;
        return s + (m.homeTeam.id === homeId ? hg : ag);
      }, 0) / total).toFixed(1) : 0,
      avgGoalsA: total ? (matches.reduce((s, m) => {
        const hg = m.score?.fullTime?.home ?? 0;
        const ag = m.score?.fullTime?.away ?? 0;
        return s + (m.homeTeam.id === homeId ? ag : hg);
      }, 0) / total).toFixed(1) : 0,
      recentMatches: matches.slice(-10).reverse(),
    };
  }, [data, homeTeam.id]);

  return createPortal(
    <div className="h2h-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="h2h-modal">
        {/* Header */}
        <div className="h2h-modal__header">
          <div className="h2h-modal__teams">
            <div className="h2h-modal__team">
              <TeamCrest crest={homeTeam.crest} name={homeTeam.name} size={44} />
              <span className="h2h-modal__team-name">{homeTeam.shortName || homeTeam.name}</span>
            </div>
            <div className="h2h-modal__vs">
              <span className="h2h-modal__vs-text">H2H</span>
              <span className="h2h-modal__vs-sub">Head to Head</span>
            </div>
            <div className="h2h-modal__team h2h-modal__team--away">
              <span className="h2h-modal__team-name">{awayTeam.shortName || awayTeam.name}</span>
              <TeamCrest crest={awayTeam.crest} name={awayTeam.name} size={44} />
            </div>
          </div>
          <button className="h2h-modal__close" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="h2h-modal__body">
          {loading && (
            <div className="h2h-loading">
              <div className="h2h-spinner" />
              <p>Memuat data historis…</p>
            </div>
          )}

          {error && (
            <div className="h2h-error">
              <p>⚠️ Gagal memuat data H2H</p>
              <small>{error === 'HTTP 429' ? 'Rate limit — coba lagi dalam 1 menit' : error}</small>
              <button className="h2h-retry" onClick={fetchH2H}>Coba Lagi</button>
            </div>
          )}

          {!loading && !error && stats && (
            <>
              {/* Record summary */}
              <div className="h2h-record">
                <div className="h2h-record__col h2h-record__col--home">
                  <span className="h2h-record__count">{stats.homeW}</span>
                  <span className="h2h-record__label">Menang {homeTeam.shortName || homeTeam.name}</span>
                </div>
                <div className="h2h-record__col h2h-record__col--draw">
                  <span className="h2h-record__count">{stats.draws}</span>
                  <span className="h2h-record__label">Seri</span>
                </div>
                <div className="h2h-record__col h2h-record__col--away">
                  <span className="h2h-record__count">{stats.awayW}</span>
                  <span className="h2h-record__label">Menang {awayTeam.shortName || awayTeam.name}</span>
                </div>
              </div>

              {/* Win bar */}
              <div className="h2h-winbar">
                <div className="h2h-winbar__seg h2h-winbar__seg--home"
                     style={{ width: `${stats.homeWPct}%` }}>
                  {stats.homeWPct > 8 && <span>{stats.homeWPct}%</span>}
                </div>
                <div className="h2h-winbar__seg h2h-winbar__seg--draw"
                     style={{ width: `${stats.drawPct}%` }}>
                  {stats.drawPct > 8 && <span>{stats.drawPct}%</span>}
                </div>
                <div className="h2h-winbar__seg h2h-winbar__seg--away"
                     style={{ width: `${stats.awayWPct}%` }}>
                  {stats.awayWPct > 8 && <span>{stats.awayWPct}%</span>}
                </div>
              </div>

              {/* Stats chips */}
              <div className="h2h-chips">
                <div className="h2h-chip">
                  <Zap size={14} />
                  <span className="h2h-chip__val">{stats.avgGoals}</span>
                  <span className="h2h-chip__label">Rata-rata Gol/Match</span>
                </div>
                <div className="h2h-chip">
                  <Target size={14} />
                  <span className="h2h-chip__val">{stats.avgGoalsH}</span>
                  <span className="h2h-chip__label">Avg Gol {homeTeam.shortName || homeTeam.name}</span>
                </div>
                <div className="h2h-chip">
                  <Shield size={14} />
                  <span className="h2h-chip__val">{stats.avgGoalsA}</span>
                  <span className="h2h-chip__label">Avg Gol {awayTeam.shortName || awayTeam.name}</span>
                </div>
                <div className="h2h-chip">
                  <TrendingUp size={14} />
                  <span className="h2h-chip__val">{stats.total}</span>
                  <span className="h2h-chip__label">Total Pertemuan</span>
                </div>
              </div>

              {/* Match history */}
              <div className="h2h-history">
                <h4 className="h2h-history__title">Pertemuan Terakhir</h4>
                <div className="h2h-history__list">
                  {stats.recentMatches.map((m, i) => {
                    const isHomeOurHome = m.homeTeam.id === homeTeam.id;
                    const hg = m.score?.fullTime?.home ?? '?';
                    const ag = m.score?.fullTime?.away ?? '?';
                    const ourGoals  = isHomeOurHome ? hg : ag;
                    const theirGoals = isHomeOurHome ? ag : hg;
                    const result = ourGoals > theirGoals ? 'W' : ourGoals === theirGoals ? 'D' : 'L';
                    const date = new Date(m.utcDate).toLocaleDateString('id-ID', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    });
                    return (
                      <div key={i} className={`h2h-match h2h-match--${result.toLowerCase()}`}>
                        <div className="h2h-match__left">
                          <span className={`h2h-match__result h2h-match__result--${result.toLowerCase()}`}>{result}</span>
                          <div className="h2h-match__meta">
                            <span className="h2h-match__date">{date}</span>
                            <span className="h2h-match__comp">{m.competition?.name || ''}</span>
                          </div>
                        </div>
                        <div className="h2h-match__score-block">
                          <span className="h2h-match__team">{m.homeTeam.shortName || m.homeTeam.name}</span>
                          <span className="h2h-match__score">{hg} – {ag}</span>
                          <span className="h2h-match__team h2h-match__team--away">{m.awayTeam.shortName || m.awayTeam.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {!loading && !error && !stats && (
            <div className="h2h-empty">
              <p>📋 Belum ada catatan pertemuan antara kedua tim.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default H2HModal;
