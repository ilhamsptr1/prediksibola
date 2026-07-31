import React, { useMemo, useState, useEffect } from 'react';
import { useMatches } from '../hooks/useMatches';
import { usePredictions } from '../context/PredictionContext';
import { calculateStandings } from '../utils/standings';
import { fetchLeagueStandings } from '../services/footballApi';
import LeagueSelector from '../components/LeagueSelector';
import { getLeague } from '../data/leagues';
import { List, Play, Trophy, Loader } from 'lucide-react';
import './Standings.css';

/* ── League Table row (for non-group competitions like PL, La Liga) ── */
const LeagueTableRow = ({ row, index }) => {
  let zone = '';
  if (index < 4)  zone = 'zone-qualified';    // Champions League spots
  else if (index < 6) zone = 'zone-possible'; // Europa League
  else if (index >= (row.total - 3)) zone = 'zone-danger'; // Relegation

  return (
    <tr className={zone}>
      <td className="pos">{index + 1}</td>
      <td className="team-col">
        {row.team?.crest && <img src={row.team.crest} alt={row.team.name} className="st-flag" />}
        <span className="st-team-name">{row.team?.name || row.team?.shortName || '—'}</span>
      </td>
      <td>{row.playedGames}</td>
      <td className="hide-xs">{row.won}</td>
      <td className="hide-xs">{row.draw}</td>
      <td className="hide-xs">{row.lost}</td>
      <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
      <td className="pts">{row.points}</td>
    </tr>
  );
};

const Standings = () => {
  const { predictions, generateAIPrediction, selectedLeagueCode, setSelectedLeagueCode } = usePredictions();
  const selectedLeague = getLeague(selectedLeagueCode);

  const { matches, loading: matchesLoading } = useMatches(selectedLeagueCode);

  const [liveStandings, setLiveStandings] = useState(null);
  const [liveLoading,   setLiveLoading]   = useState(false);

  // For group competitions: compute from matches + predictions
  const simulatedStandings = useMemo(() => {
    if (!selectedLeague?.hasGroups) return {};
    return calculateStandings(matches, predictions);
  }, [matches, predictions, selectedLeague]);

  const groupKeys = Object.keys(simulatedStandings).sort();

  // For non-group (league) competitions: fetch live standings from API
  useEffect(() => {
    if (selectedLeague?.hasGroups) {
      setLiveStandings(null);
      return;
    }

    setLiveLoading(true);
    fetchLeagueStandings(selectedLeagueCode).then(({ standings }) => {
      setLiveStandings(standings);
      setLiveLoading(false);
    });
  }, [selectedLeagueCode, selectedLeague?.hasGroups]);

  // Simulate all unplayed group stage matches
  const handleSimulateAll = async () => {
    const unplayedMatches = matches.filter(
      m => m.status !== 'FINISHED' && !predictions[m.id]
    );
    for (const m of unplayedMatches) {
      await generateAIPrediction(m);
    }
  };

  const isLoading = matchesLoading || liveLoading;

  return (
    <div className="standings animate-fade-in">
      {/* ── Hero Header ── */}
      <header className="standings-header text-center">
        <List size={48} className="lb-trophy-icon" />
        <h1 className="heading-lg">
          Klasemen <span className="text-gradient">{selectedLeague?.name}</span>
        </h1>
        <p className="subtitle text-muted">
          {selectedLeague?.hasGroups
            ? 'Gabungan hasil pertandingan aktual dan prediksi AI.'
            : 'Klasemen liga musim ini — data live dari API.'}
        </p>
        {selectedLeague?.hasGroups && (
          <button className="btn-primary simulate-btn" onClick={handleSimulateAll} disabled={isLoading}>
            <Play size={16} /> Prediksi Semua Sisa Pertandingan
          </button>
        )}
      </header>

      {/* ── League Selector ── */}
      <LeagueSelector selectedLeague={selectedLeagueCode} onSelect={(c) => {
        setSelectedLeagueCode(c);
        setLiveStandings(null);
      }} />

      {/* ── Loading state ── */}
      {isLoading && (
        <div className="skeleton-grid">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton-card" style={{height: '250px'}} />)}
        </div>
      )}

      {/* ── GROUP COMPETITION: calculated standings ── */}
      {!isLoading && selectedLeague?.hasGroups && groupKeys.length > 0 && (
        <div className="standings-grid">
          {groupKeys.map(groupCode => {
            const table = simulatedStandings[groupCode];
            return (
              <div key={groupCode} className="standings-card glass-card">
                <div className="st-card-header">
                  <h3>Grup {groupCode}</h3>
                </div>
                <div className="st-table-wrapper">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th className="team-col">Tim</th>
                        <th title="Main">M</th>
                        <th title="Menang" className="hide-xs">W</th>
                        <th title="Seri" className="hide-xs">D</th>
                        <th title="Kalah" className="hide-xs">L</th>
                        <th title="Selisih Gol">SG</th>
                        <th title="Poin">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((row, index) => {
                        let rowClass = '';
                        if (index === 0 || index === 1) rowClass = 'zone-qualified';
                        else if (index === 2) rowClass = 'zone-possible';
                        return (
                          <tr key={row.team.name} className={rowClass}>
                            <td className="pos">{index + 1}</td>
                            <td className="team-col">
                              <img src={row.team.flag} alt={row.team.name} className="st-flag" />
                              <span className="st-team-name">{row.team.name}</span>
                            </td>
                            <td>{row.mp}</td>
                            <td className="hide-xs">{row.w}</td>
                            <td className="hide-xs">{row.d}</td>
                            <td className="hide-xs">{row.l}</td>
                            <td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                            <td className="pts">{row.pts}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── LEAGUE COMPETITION: live standings from API ── */}
      {!isLoading && !selectedLeague?.hasGroups && liveStandings && (
        <div className="standings-grid single-col">
          {liveStandings.map((standing, si) => (
            <div key={si} className="standings-card glass-card">
              {liveStandings.length > 1 && (
                <div className="st-card-header">
                  <h3>{standing.group || standing.stage || 'Klasemen'}</h3>
                </div>
              )}
              <div className="st-table-wrapper">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th className="team-col">Tim</th>
                      <th title="Main">M</th>
                      <th title="Menang" className="hide-xs">W</th>
                      <th title="Seri" className="hide-xs">D</th>
                      <th title="Kalah" className="hide-xs">L</th>
                      <th title="Selisih Gol">SG</th>
                      <th title="Poin">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(standing.table || []).map((row, index) => (
                      <LeagueTableRow
                        key={row.team?.id || index}
                        row={{ ...row, total: standing.table.length }}
                        index={index}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!isLoading && !selectedLeague?.hasGroups && !liveStandings && (
        <div className="no-data text-muted">
          <Trophy size={48} style={{ opacity: 0.3, marginBottom: '1rem', display: 'block', margin: '0 auto 1rem' }} />
          <p>Data klasemen untuk <strong>{selectedLeague?.name}</strong> belum tersedia.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Pastikan API Key sudah terpasang di Vercel.</p>
        </div>
      )}

      {!isLoading && selectedLeague?.hasGroups && groupKeys.length === 0 && (
        <div className="no-data text-muted">Belum ada data klasemen yang bisa dihitung.</div>
      )}

      {/* ── Legend ── */}
      {!isLoading && (
        <div className="standings-legend">
          <span className="legend-item zone-qualified-dot">■ Liga Champions / Lolos</span>
          <span className="legend-item zone-possible-dot">■ Liga Europa / Berpeluang</span>
          <span className="legend-item zone-danger-dot">■ Zona Degradasi</span>
        </div>
      )}
    </div>
  );
};

export default Standings;
