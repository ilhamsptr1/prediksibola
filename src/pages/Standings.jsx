import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useMatches } from "../hooks/useMatches";
import { usePredictions } from "../context/PredictionContext";
import { calculateStandings } from "../utils/standings";
import { fetchLeagueStandings } from "../services/footballApi";
import LeagueSelector from "../components/LeagueSelector";
import { getLeague } from "../data/leagues";
import { List, Play, Trophy, X, Calendar, ChevronRight, TrendingUp } from "lucide-react";
import "./Standings.css";

/* ── Form badge (W/D/L) ─────────────────────────────── */
const FormBadge = ({ result }) => (
  <span className={`form-badge form-${result}`}>{result}</span>
);

/* ── Team Schedule Modal ────────────────────────────── */
const TeamScheduleModal = ({ team, matches, onClose }) => {
  const teamMatches = matches
    .filter(m =>
      m.homeTeam.name === team.name ||
      m.homeTeam.shortName === team.name ||
      m.awayTeam.name === team.name ||
      m.awayTeam.shortName === team.name
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const finished  = teamMatches.filter(m => m.status === "FINISHED");
  const upcoming  = teamMatches.filter(m => m.status === "SCHEDULED");
  const live      = teamMatches.filter(m => m.status === "LIVE");

  const getResult = (m) => {
    if (m.status !== "FINISHED") return null;
    const isHome = m.homeTeam.name === team.name || m.homeTeam.shortName === team.name;
    const goalsFor = isHome ? m.score.home : m.score.away;
    const goalsAgainst = isHome ? m.score.away : m.score.home;
    if (goalsFor > goalsAgainst) return "W";
    if (goalsFor < goalsAgainst) return "L";
    return "D";
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) +
      " • " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const MatchRow = ({ m }) => {
    const result = getResult(m);
    const isHome = m.homeTeam.name === team.name || m.homeTeam.shortName === team.name;
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    return (
      <div className={`schedule-row ${m.status === "LIVE" ? "live-row" : ""}`}>
        <div className="schedule-date">{formatDate(m.date)}</div>
        <div className="schedule-match">
          <div className="schedule-teams">
            <span className="schedule-venue">{isHome ? "H" : "A"}</span>
            {opponent.crest && <img src={opponent.crest} alt="" className="schedule-crest" />}
            <span className="schedule-opp">{opponent.shortName || opponent.name}</span>
          </div>
          {m.status === "FINISHED" && (
            <div className="schedule-score">
              <FormBadge result={result} />
              <span className="score-str">
                {isHome ? `${m.score.home}-${m.score.away}` : `${m.score.away}-${m.score.home}`}
              </span>
            </div>
          )}
          {m.status === "LIVE" && (
            <div className="schedule-live-badge">
              <span className="live-dot" /> <span>LIVE</span>
            </div>
          )}
          {m.status === "SCHEDULED" && (
            <div className="schedule-upcoming">
              <Calendar size={12} />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="schedule-overlay" onClick={onClose}>
      <div className="schedule-modal glass" onClick={e => e.stopPropagation()}>
        <div className="schedule-modal__header">
          <div className="schedule-team-info">
            {team.crest && <img src={team.crest} alt="" className="schedule-team-crest" />}
            <div>
              <div className="schedule-team-name">{team.name || team.shortName}</div>
              <div className="schedule-team-sub">Jadwal Musim Ini</div>
            </div>
          </div>
          <button className="schedule-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="schedule-modal__body">
          {live.length > 0 && (
            <div className="schedule-section">
              <div className="schedule-section-title live-title">
                <span className="live-dot" /> <span>Sedang Berlangsung</span>
              </div>
              {live.map(m => <MatchRow key={m.id} m={m} />)}
            </div>
          )}

          {finished.length > 0 && (
            <div className="schedule-section">
              <div className="schedule-section-title">
                <TrendingUp size={13} /> <span>Hasil Terakhir</span>
              </div>
              {finished.slice(-5).reverse().map(m => <MatchRow key={m.id} m={m} />)}
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="schedule-section">
              <div className="schedule-section-title">
                <Calendar size={13} /> <span>Pertandingan Berikutnya</span>
              </div>
              {upcoming.slice(0, 5).map(m => <MatchRow key={m.id} m={m} />)}
            </div>
          )}

          {teamMatches.length === 0 && (
            <div className="schedule-empty">
              <span>Tidak ada jadwal yang tersedia untuk tim ini di liga yang dipilih.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Form indicator from recent matches ─────────────── */
const getFormFromMatches = (teamName, matches) => {
  const teamMatches = matches
    .filter(m =>
      m.status === "FINISHED" &&
      (m.homeTeam.name === teamName || m.awayTeam.name === teamName ||
       m.homeTeam.shortName === teamName || m.awayTeam.shortName === teamName)
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  return teamMatches.map(m => {
    const isHome = m.homeTeam.name === teamName || m.homeTeam.shortName === teamName;
    const gf = isHome ? m.score.home : m.score.away;
    const ga = isHome ? m.score.away : m.score.home;
    if (gf > ga) return "W";
    if (gf < ga) return "L";
    return "D";
  }).reverse();
};

/* ── League Table Row ───────────────────────────────── */
const LeagueTableRow = ({ row, index, onTeamClick, matches, searchTerm }) => {
  const total = row.total || 20;
  let zone = "";
  if (index < 4)  zone = "zone-qualified";
  else if (index < 6) zone = "zone-possible";
  else if (index >= total - 3) zone = "zone-danger";

  const teamName = row.team?.name || row.team?.shortName || "";
  const form = getFormFromMatches(teamName, matches);
  const isHighlighted = searchTerm &&
    teamName.toLowerCase().includes(searchTerm.toLowerCase());

  return (
    <tr
      className={`${zone} ${isHighlighted ? "row-highlighted" : ""} table-row-clickable`}
      onClick={() => onTeamClick(row.team)}
      title={`Klik untuk lihat jadwal ${teamName}`}
    >
      <td className="pos">{index + 1}</td>
      <td className="team-col">
        {row.team?.crest && <img src={row.team.crest} alt={teamName} className="st-flag" />}
        <span className="st-team-name">{teamName}</span>
        <ChevronRight size={12} className="row-arrow" />
      </td>
      <td>{row.playedGames}</td>
      <td className="hide-xs">{row.won}</td>
      <td className="hide-xs">{row.draw}</td>
      <td className="hide-xs">{row.lost}</td>
      <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
      <td className="pts">{row.points}</td>
      <td className="form-col hide-xs">
        <div className="form-badges">
          {form.length > 0
            ? form.map((f, i) => <FormBadge key={i} result={f} />)
            : <span className="form-na">—</span>
          }
        </div>
      </td>
    </tr>
  );
};

/* ── Main Component ──────────────────────────────────── */
const Standings = () => {
  const { predictions, generateAIPrediction, selectedLeagueCode, setSelectedLeagueCode } = usePredictions();
  const selectedLeague = getLeague(selectedLeagueCode);

  const { matches, loading: matchesLoading } = useMatches(selectedLeagueCode);

  const [liveStandings, setLiveStandings] = useState(null);
  const [liveLoading,   setLiveLoading]   = useState(false);
  const [selectedTeam,  setSelectedTeam]  = useState(null);
  const [searchTerm,    setSearchTerm]    = useState("");

  // Group competition standings (from match data)
  const simulatedStandings = useMemo(() => {
    if (!selectedLeague?.hasGroups) return {};
    return calculateStandings(matches, predictions);
  }, [matches, predictions, selectedLeague]);

  const groupKeys = Object.keys(simulatedStandings).sort();

  // League competition standings (from API)
  useEffect(() => {
    if (selectedLeague?.hasGroups) { setLiveStandings(null); return; }
    setLiveLoading(true);
    fetchLeagueStandings(selectedLeagueCode).then(({ standings }) => {
      setLiveStandings(standings);
      setLiveLoading(false);
    });
  }, [selectedLeagueCode, selectedLeague?.hasGroups]);

  const handleSimulateAll = async () => {
    const unplayed = matches.filter(m => m.status !== "FINISHED" && !predictions[m.id]);
    for (const m of unplayed) await generateAIPrediction(m);
  };

  const handleTeamClick = useCallback((team) => {
    setSelectedTeam(team);
  }, []);

  // Filter table rows by search
  const filterRows = (rows) => {
    if (!searchTerm) return rows;
    return rows.filter(r =>
      (r.team?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.team?.shortName || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const isLoading = matchesLoading || liveLoading;

  return (
    <div className="standings animate-fade-in">
      {/* ── Hero Header ── */}
      <header className="standings-header text-center">
        <List size={40} className="lb-trophy-icon" />
        <h1 className="heading-lg">
          Klasemen <span className="text-gradient">{selectedLeague?.name}</span>
        </h1>
        <p className="subtitle text-muted">
          {selectedLeague?.hasGroups
            ? "Gabungan hasil aktual dan prediksi AI. Klik tim untuk lihat jadwal."
            : "Data live dari API. Klik tim mana saja untuk melihat jadwalnya."}
        </p>
        {selectedLeague?.hasGroups && (
          <button className="btn-primary simulate-btn" onClick={handleSimulateAll} disabled={isLoading}>
            <Play size={16} /> <span>Prediksi Semua Sisa Pertandingan</span>
          </button>
        )}
      </header>

      {/* ── League Selector ── */}
      <LeagueSelector selectedLeague={selectedLeagueCode} onSelect={(c) => {
        setSelectedLeagueCode(c);
        setLiveStandings(null);
        setSearchTerm("");
      }} />

      {/* ── Search/Filter Bar ── */}
      {!isLoading && (
        <div className="standings-search-bar">
          <input
            type="text"
            className="standings-search-input"
            placeholder="🔍  Cari tim..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="standings-search-clear" onClick={() => setSearchTerm("")}>
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="skeleton-grid">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton-card" style={{ height: "300px" }} />)}
        </div>
      )}

      {/* ── GROUP COMPETITION ── */}
      {!isLoading && selectedLeague?.hasGroups && groupKeys.length > 0 && (
        <div className="standings-grid">
          {groupKeys.map(groupCode => {
            const table = simulatedStandings[groupCode];
            const filtered = filterRows(table.map(r => ({
              ...r,
              team: { name: r.team.name, crest: r.team.flag, shortName: r.team.name },
              playedGames: r.mp, won: r.w, draw: r.d, lost: r.l, goalDifference: r.gd, points: r.pts
            })));
            return (
              <div key={groupCode} className="standings-card glass-card">
                <div className="st-card-header">
                  <h3>Grup {groupCode}</h3>
                </div>
                <div className="st-table-wrapper">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>Pos</th><th className="team-col">Tim</th>
                        <th title="Main">M</th>
                        <th title="Menang" className="hide-xs">W</th>
                        <th title="Seri" className="hide-xs">D</th>
                        <th title="Kalah" className="hide-xs">L</th>
                        <th title="Selisih Gol">SG</th>
                        <th title="Poin">Pts</th>
                        <th className="hide-xs" title="5 pertandingan terakhir">Form</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, index) => (
                        <LeagueTableRow
                          key={row.team.name}
                          row={row}
                          index={index}
                          onTeamClick={handleTeamClick}
                          matches={matches}
                          searchTerm={searchTerm}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── LEAGUE COMPETITION ── */}
      {!isLoading && !selectedLeague?.hasGroups && liveStandings && (
        <div className="standings-grid single-col">
          {liveStandings.map((standing, si) => {
            const filtered = filterRows(
              (standing.table || []).map(r => ({ ...r, total: standing.table.length }))
            );
            return (
              <div key={si} className="standings-card glass-card">
                {liveStandings.length > 1 && (
                  <div className="st-card-header">
                    <h3>{standing.group || standing.stage || "Klasemen"}</h3>
                  </div>
                )}
                <div className="st-table-wrapper">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>Pos</th><th className="team-col">Tim</th>
                        <th title="Main">M</th>
                        <th title="Menang" className="hide-xs">W</th>
                        <th title="Seri" className="hide-xs">D</th>
                        <th title="Kalah" className="hide-xs">L</th>
                        <th title="Selisih Gol">SG</th>
                        <th title="Poin">Pts</th>
                        <th className="hide-xs" title="5 pertandingan terakhir">Form</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, index) => (
                        <LeagueTableRow
                          key={row.team?.id || index}
                          row={row}
                          index={index}
                          onTeamClick={handleTeamClick}
                          matches={matches}
                          searchTerm={searchTerm}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {searchTerm && filtered.length === 0 && (
                  <div className="no-search-result">Tim "{searchTerm}" tidak ditemukan.</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty states ── */}
      {!isLoading && !selectedLeague?.hasGroups && !liveStandings && (
        <div className="no-data text-muted">
          <Trophy size={48} style={{ opacity: 0.3, marginBottom: "1rem", display: "block", margin: "0 auto 1rem" }} />
          <p>Data klasemen untuk <strong>{selectedLeague?.name}</strong> belum tersedia.</p>
          <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>Pastikan API Key sudah terpasang di Vercel.</p>
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
          <span className="legend-item click-hint">👆 Klik tim untuk lihat jadwal</span>
        </div>
      )}

      {/* ── Team Schedule Modal ── */}
      {selectedTeam && (
        <TeamScheduleModal
          team={selectedTeam}
          matches={matches}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
  );
};

export default Standings;
