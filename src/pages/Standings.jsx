import React, { useMemo } from 'react';
import { useMatches } from '../hooks/useMatches';
import { usePredictions } from '../context/PredictionContext';
import { calculateStandings } from '../utils/standings';
import { List, Play, HelpCircle } from 'lucide-react';
import './Standings.css';

const Standings = () => {
  const { matches, loading: matchesLoading } = useMatches();
  const { predictions, generateSystemPrediction, loading: predLoading } = usePredictions();

  // Hitung klasemen menggunakan matches asli + prediksi
  const standings = useMemo(() => {
    return calculateStandings(matches, predictions);
  }, [matches, predictions]);

  const groupKeys = Object.keys(standings).sort();

  // Simulasikan pertandingan yang belum diprediksi & belum selesai
  const handleSimulateAll = async () => {
    const unplayedMatches = matches.filter(
      m => m.status !== 'FINISHED' && !predictions.some(p => p.matchId === m.id)
    );
    
    // Simulate one by one to avoid overwhelming state (ideally we should bulk update)
    for (const m of unplayedMatches) {
      await generateSystemPrediction(m);
    }
  };

  const isLoading = matchesLoading || predLoading;

  return (
    <div className="standings animate-fade-in">
      {/* ── Hero Header ── */}
      <header className="standings-header text-center">
        <List size={48} className="lb-trophy-icon" />
        <h1 className="heading-lg">
          Klasemen <span className="text-gradient">Simulasi Live</span>
        </h1>
        <p className="subtitle text-muted">
          Gabungan hasil pertandingan aktual dan tebakan prediksi Anda.
        </p>
        <button className="btn-primary simulate-btn" onClick={handleSimulateAll} disabled={isLoading}>
          <Play size={16} /> Prediksi Semua Sisa Pertandingan
        </button>
      </header>

      {/* ── Loading state ── */}
      {isLoading && (
        <div className="skeleton-grid">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton-card" style={{height: '250px'}} />)}
        </div>
      )}

      {/* ── Standings Grid ── */}
      {!isLoading && groupKeys.length > 0 && (
        <div className="standings-grid">
          {groupKeys.map(groupCode => {
            const table = standings[groupCode];
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
                        <th title="Menang" className="hide-xs">M</th>
                        <th title="Seri" className="hide-xs">S</th>
                        <th title="Kalah" className="hide-xs">K</th>
                        <th title="Selisih Gol">SG</th>
                        <th title="Poin">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((row, index) => {
                        // Tentukan zona lolos (Pos 1 & 2 lolos otomatis)
                        let rowClass = '';
                        if (index === 0 || index === 1) rowClass = 'zone-qualified';
                        // Peringkat 3 bisa lolos (conditional), kita beri warna tipis
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

      {/* ── Empty state ── */}
      {!isLoading && groupKeys.length === 0 && (
        <div className="no-data text-muted">
          Belum ada data klasemen yang bisa dihitung.
        </div>
      )}
    </div>
  );
};

export default Standings;
