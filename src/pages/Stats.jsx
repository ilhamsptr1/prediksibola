import React, { useState, useEffect } from 'react';
import { usePredictions } from '../context/PredictionContext';
import LeagueSelector from '../components/LeagueSelector';
import { getLeague } from '../data/leagues';
import { fetchTopScorers } from '../services/footballApi';
import { BarChart2 } from 'lucide-react';
import './Stats.css';

const Stats = () => {
  const { selectedLeagueCode, setSelectedLeagueCode } = usePredictions();
  const selectedLeague = getLeague(selectedLeagueCode);

  const [scorers, setScorers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchTopScorers(selectedLeagueCode).then(res => {
      if (res.error) {
        setError(res.error);
        setScorers([]);
      } else {
        setScorers(res.scorers);
      }
      setLoading(false);
    });
  }, [selectedLeagueCode]);

  return (
    <div className="stats-page animate-fade-in">
      <header className="stats-header text-center">
        <BarChart2 size={40} className="stats-icon" />
        <h1 className="heading-lg">
          Statistik <span className="text-gradient">{selectedLeague?.name}</span>
        </h1>
        <p className="subtitle text-muted">Daftar pencetak gol terbanyak musim ini.</p>
      </header>

      <LeagueSelector selectedLeague={selectedLeagueCode} onSelect={setSelectedLeagueCode} />

      {loading && (
        <div className="skeleton-grid single-col" style={{ marginTop: '1.5rem' }}>
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton-card" style={{ height: '80px' }} />)}
        </div>
      )}

      {!loading && error && (
        <div className="stats-empty glass-card">
          <p>⚠️ Gagal memuat data statistik: {error}</p>
        </div>
      )}

      {!loading && !error && scorers.length === 0 && (
        <div className="stats-empty glass-card">
          <p>Data pencetak gol belum tersedia untuk liga ini.</p>
        </div>
      )}

      {!loading && !error && scorers.length > 0 && (
        <div className="scorers-list">
          {scorers.map((s, idx) => (
            <div key={s.player.id} className="scorer-card glass">
              <div className="scorer-rank">{idx + 1}</div>
              <div className="scorer-info">
                <div className="scorer-name">{s.player.name}</div>
                <div className="scorer-team">
                  {s.team.crest && <img src={s.team.crest} alt={s.team.name} className="scorer-team-crest" />}
                  <span>{s.team.name}</span>
                </div>
              </div>
              <div className="scorer-stats">
                <div className="stat-box goals">
                  <span className="stat-val">{s.goals}</span>
                  <span className="stat-lbl">Gol</span>
                </div>
                <div className="stat-box assists">
                  <span className="stat-val">{s.assists !== null ? s.assists : '-'}</span>
                  <span className="stat-lbl">Assist</span>
                </div>
                <div className="stat-box pens">
                  <span className="stat-val">{s.penalties !== null ? s.penalties : '-'}</span>
                  <span className="stat-lbl">Penalti</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Stats;
