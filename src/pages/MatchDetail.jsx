import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePredictions } from "../context/PredictionContext";
import { useMatches } from "../hooks/useMatches";
import { generateMatchStats } from "../services/footballApi";
import teamRatingsData from "../data/teamRatings.json";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  Cell, PieChart, Pie, Tooltip
} from "recharts";
import {
  ArrowLeft, Cpu, Users, BarChart2, Calendar,
  MapPin, Clock, CheckCircle, Zap, Shield, Swords, Star
} from "lucide-react";
import "./MatchDetail.css";

/* ─── helpers ─── */
const API_KEY  = import.meta.env.VITE_FOOTBALL_API_KEY || "4eda5db232484db3b743c1544bf90b86";
const API_BASE = "/api/football-data";
const squadCache = {};

const fetchSquad = async (id) => {
  if (!id) return [];
  if (squadCache[id]) return squadCache[id];
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${API_BASE}/v4/teams/${id}`, {
      headers: { "X-Auth-Token": API_KEY }
    });
    if (res.status === 429) { await new Promise(r => setTimeout(r, 6000)); continue; }
    if (!res.ok) return [];
    const data = await res.json();
    const squad = data.squad || [];
    if (squad.length > 0) squadCache[id] = squad;
    return squad;
  }
  return [];
};

const buildLineup = (squad) => {
  const gks  = squad.filter(p => p.position === "Goalkeeper");
  const defs = squad.filter(p => p.position?.match(/efenc|ack|efend/i));
  const mids = squad.filter(p => p.position?.match(/idfield|idfield/i));
  const atts = squad.filter(p => p.position?.match(/ffence|ttack|orward/i));
  const rest = squad.filter(p => !gks.includes(p));
  const def4 = defs.length >= 4 ? defs.slice(0,4) : [...defs, ...rest.filter(x=>!defs.includes(x))].slice(0,4);
  const mid3 = mids.length >= 3 ? mids.slice(0,3) : [...mids, ...rest.filter(x=>!def4.includes(x)&&!mids.includes(x))].slice(0,3);
  const att3 = atts.length >= 3 ? atts.slice(0,3) : [...atts, ...rest.filter(x=>!def4.includes(x)&&!mid3.includes(x)&&!atts.includes(x))].slice(0,3);
  return { gk: gks.slice(0,1), def: def4, mid: mid3, att: att3 };
};

const fmt = n => n ? n.split(" ").pop() : "—";

const TABS = ["Overview", "Lineup", "H2H", "Statistik"];

const ProbDonut = ({ home, draw, away, homeTeam, awayTeam }) => {
  const data = [
    { name: homeTeam, value: home, color: "#22c55e" },
    { name: "Seri",    value: draw,  color: "#64748b" },
    { name: awayTeam, value: away, color: "#ef4444" },
  ];
  return (
    <div className="donut-wrapper">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={52} outerRadius={80} paddingAngle={3} startAngle={90} endAngle={-270}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background:"#0f1117", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px", color:"#fff", fontSize:"0.82rem" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-labels">
        {data.map((d,i) => (
          <div key={i} className="donut-label">
            <span className="donut-dot" style={{ background: d.color }} />
            <span className="donut-name">{d.name}</span>
            <span className="donut-val">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RadarComp = ({ homeTeam, awayTeam }) => {
  const homeRating = teamRatingsData[homeTeam.name] || teamRatingsData[homeTeam.shortName] || {};
  const awayRating = teamRatingsData[awayTeam.name] || teamRatingsData[awayTeam.shortName] || {};
  const data = [
    { attr: "Serangan",  home: homeRating.attack  || homeTeam.att || 70, away: awayRating.attack  || awayTeam.att || 70 },
    { attr: "Pertahanan",home: homeRating.defense  || homeTeam.def || 70, away: awayRating.defense || awayTeam.def || 70 },
    { attr: "Penguasaan",home: homeRating.possession || Math.round((homeRating.attack||70)*0.6+20), away: awayRating.possession || Math.round((awayRating.attack||70)*0.6+20) },
    { attr: "Kecepatan", home: homeRating.pace    || Math.round((homeRating.attack||70)*0.7+25), away: awayRating.pace    || Math.round((awayRating.attack||70)*0.7+25) },
    { attr: "Fisik",     home: homeRating.physical || Math.round((homeRating.defense||70)*0.5+45), away: awayRating.physical || Math.round((awayRating.defense||70)*0.5+45) },
    { attr: "Mental",    home: homeRating.mental   || Math.round(((homeRating.attack||70)+(homeRating.defense||70))/2), away: awayRating.mental || Math.round(((awayRating.attack||70)+(awayRating.defense||70))/2) },
  ];
  return (
    <div className="radar-wrapper">
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={data} margin={{ top: 8, right: 32, bottom: 8, left: 32 }}>
          <PolarGrid stroke="rgba(255,255,255,0.08)" />
          <PolarAngleAxis dataKey="attr" tick={{ fill:"rgba(255,255,255,0.5)", fontSize:11 }} />
          <Radar name={homeTeam.shortName||homeTeam.name} dataKey="home" stroke="#22c55e" fill="#22c55e" fillOpacity={0.18} strokeWidth={2} />
          <Radar name={awayTeam.shortName||awayTeam.name} dataKey="away" stroke="#ef4444" fill="#ef4444" fillOpacity={0.18} strokeWidth={2} />
          <Tooltip contentStyle={{ background:"#0f1117", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px", color:"#fff", fontSize:"0.82rem" }} />
        </RadarChart>
      </ResponsiveContainer>
      <div className="radar-legend">
        <span><span className="radar-dot green"/>  {homeTeam.shortName||homeTeam.name}</span>
        <span><span className="radar-dot red"/> {awayTeam.shortName||awayTeam.name}</span>
      </div>
    </div>
  );
};

const LineupField = ({ squad, teamName, crest, side }) => {
  const lineup = buildLineup(squad);
  const rows = [lineup.att, lineup.mid, lineup.def, lineup.gk];
  return (
    <div className={`lineup-side ${side}`}>
      <div className="lineup-team-label">
        {crest && <img src={crest} alt={teamName} className="lineup-team-logo" />}
        <span>{teamName}</span>
      </div>
      <div className="pitch-rows">
        {rows.map((row, ri) => (
          <div key={ri} className="pitch-row">
            {row.map((p, pi) => (
              <div key={pi} className="player-spot">
                <div className="player-avatar">
                  <span className="player-no">{p.shirtNumber || (pi+1)}</span>
                </div>
                <span className="player-short">{fmt(p.name)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── Main Component ─── */
const MatchDetail = () => {
  const { matchId } = useParams();
  const navigate    = useNavigate();
  const { selectedLeagueCode, generateAIPrediction, getPredictionForMatch } = usePredictions();
  const { matches, loading } = useMatches(selectedLeagueCode);

  const match = matches.find(m => m.id === matchId);

  const [activeTab,   setActiveTab]   = useState("Overview");
  const [isPredicting,setIsPredicting]= useState(false);
  const [matchStats,  setMatchStats]  = useState(null);
  const [homeSquad,   setHomeSquad]   = useState([]);
  const [awaySquad,   setAwaySquad]   = useState([]);
  const [squadLoading,setSquadLoading]= useState(false);

  const pred = match ? getPredictionForMatch(match.id) : null;

  // Generate stats on mount
  useEffect(() => {
    if (match && !matchStats) {
      setMatchStats(generateMatchStats(match.homeTeam, match.awayTeam));
    }
  }, [match]);

  // Fetch lineup when switching to Lineup tab
  useEffect(() => {
    if (activeTab !== "Lineup" || !match) return;
    if (homeSquad.length > 0) return;
    setSquadLoading(true);
    Promise.all([
      fetchSquad(match.homeTeam.id),
      fetchSquad(match.awayTeam.id),
    ]).then(([home, away]) => {
      setHomeSquad(home);
      setAwaySquad(away);
      setSquadLoading(false);
    });
  }, [activeTab, match]);

  const handlePredict = async () => {
    if (!match) return;
    setIsPredicting(true);
    await new Promise(r => setTimeout(r, 900));
    await generateAIPrediction(match);
    setIsPredicting(false);
  };

  if (loading) return (
    <div className="match-detail-loading">
      <div className="loading-spinner" />
      <p>Memuat data pertandingan...</p>
    </div>
  );

  if (!match) return (
    <div className="match-detail-notfound">
      <h2>Pertandingan tidak ditemukan</h2>
      <button className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={16}/> Kembali</button>
    </div>
  );

  const matchDate = new Date(match.date).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta"
  });

  const isFinished = match.status === "FINISHED";
  const isLive     = match.status === "LIVE";
  const canPredict = match.status === "SCHEDULED";

  return (
    <div className="match-detail animate-fade-in">
      {/* ── Back Button ── */}
      <button className="md-back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> <span>Kembali</span>
      </button>

      {/* ── Hero Section ── */}
      <div className={`md-hero glass-card ${isLive ? "hero-live" : ""}`}>
        {isLive && <div className="hero-live-pulse" />}

        <div className="md-meta">
          <span className="md-league">{match.group}</span>
          {match.matchday && <span className="md-md">Matchday {match.matchday}</span>}
          {isLive  && <div className="md-badge live"><Zap size={11} /> LIVE</div>}
          {isFinished && <div className="md-badge finished"><CheckCircle size={11} /> Selesai</div>}
          {canPredict && <div className="md-badge upcoming"><Clock size={11} /> Akan Datang</div>}
        </div>

        {/* ── Teams Score ── */}
        <div className="md-teams">
          <div className="md-team home">
            {match.homeTeam.crest && <img src={match.homeTeam.crest} alt="" className="md-crest" />}
            <span className="md-team-name">{match.homeTeam.name}</span>
          </div>

          <div className="md-score-block">
            {(isFinished || isLive) ? (
              <div className="md-score">
                <span className="md-goal">{match.score.home ?? "?"}</span>
                <span className="md-dash">:</span>
                <span className="md-goal">{match.score.away ?? "?"}</span>
              </div>
            ) : (
              <div className="md-vs">VS</div>
            )}
            <div className="md-date-info">
              <Calendar size={13} /> <span>{matchDate}</span>
            </div>
            {match.venue && (
              <div className="md-venue">
                <MapPin size={12} /> <span>{match.venue}</span>
              </div>
            )}
          </div>

          <div className="md-team away">
            {match.awayTeam.crest && <img src={match.awayTeam.crest} alt="" className="md-crest" />}
            <span className="md-team-name">{match.awayTeam.name}</span>
          </div>
        </div>

        {/* ── AI Predict Button ── */}
        {!pred && (
          <button
            className={`md-predict-btn btn-primary ${isPredicting ? "loading" : ""}`}
            onClick={handlePredict}
            disabled={isPredicting}
          >
            {isPredicting ? (
              <><span className="btn-spinner" /> Menganalisis...</>
            ) : (
              <><Cpu size={16} /> Generate Prediksi AI</>
            )}
          </button>
        )}

        {/* ── AI Prediction Result (mini banner) ── */}
        {pred && (
          <div className="md-pred-banner">
            <Star size={14} className="pred-star" />
            <span>AI Prediksi:</span>
            <strong>{match.homeTeam.shortName || match.homeTeam.name} {pred.homeScore} – {pred.awayScore} {match.awayTeam.shortName || match.awayTeam.name}</strong>
            <span className="pred-conf">({pred.probabilities?.home}% / {pred.probabilities?.draw}% / {pred.probabilities?.away}%)</span>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="md-tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={`md-tab ${activeTab === t ? "active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t === "Overview"   && <BarChart2 size={15} />}
            {t === "Lineup"     && <Users size={15} />}
            {t === "H2H"        && <Swords size={15} />}
            {t === "Statistik"  && <Shield size={15} />}
            <span>{t}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="md-tab-content">

        {/* OVERVIEW TAB */}
        {activeTab === "Overview" && (
          <div className="tab-overview">
            {/* Probability Donut */}
            {pred && (
              <div className="overview-card glass-card">
                <h3 className="overview-title"><Cpu size={16} /> Probabilitas AI</h3>
                <ProbDonut
                  home={pred.probabilities?.home || 0}
                  draw={pred.probabilities?.draw || 0}
                  away={pred.probabilities?.away || 0}
                  homeTeam={match.homeTeam.shortName || match.homeTeam.name}
                  awayTeam={match.awayTeam.shortName || match.awayTeam.name}
                />
                <div className="pred-score-display">
                  <span>Prediksi Skor:</span>
                  <strong>{pred.homeScore} – {pred.awayScore}</strong>
                </div>
              </div>
            )}

            {!pred && (
              <div className="overview-card glass-card no-pred">
                <Cpu size={32} style={{ color:"rgba(255,255,255,0.15)", marginBottom:"0.75rem" }} />
                <p>Klik "Generate Prediksi AI" di atas untuk melihat analisis probabilitas.</p>
              </div>
            )}

            {/* Probability Bar */}
            {pred && (
              <div className="overview-card glass-card">
                <h3 className="overview-title"><BarChart2 size={16} /> Perbandingan Peluang</h3>
                <div className="prob-bar-block">
                  <div className="prob-bar-row">
                    <span className="prob-team">{match.homeTeam.shortName || match.homeTeam.name}</span>
                    <div className="prob-bar">
                      <div className="prob-fill home" style={{ width:`${pred.probabilities?.home}%` }}>
                        <span>{pred.probabilities?.home}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="prob-bar-row">
                    <span className="prob-team">Seri</span>
                    <div className="prob-bar">
                      <div className="prob-fill draw" style={{ width:`${pred.probabilities?.draw}%` }}>
                        <span>{pred.probabilities?.draw}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="prob-bar-row">
                    <span className="prob-team">{match.awayTeam.shortName || match.awayTeam.name}</span>
                    <div className="prob-bar">
                      <div className="prob-fill away" style={{ width:`${pred.probabilities?.away}%` }}>
                        <span>{pred.probabilities?.away}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Over/Under */}
            {matchStats && (
              <div className="overview-card glass-card">
                <h3 className="overview-title">🎲 Over / Under 2.5</h3>
                <div className="ou-block">
                  <div className="ou-item over">
                    <span className="ou-pct">{matchStats.overUnder?.over25}%</span>
                    <span className="ou-lbl">Over 2.5</span>
                  </div>
                  <div className="ou-divider" />
                  <div className="ou-item under">
                    <span className="ou-pct">{matchStats.overUnder?.under25}%</span>
                    <span className="ou-lbl">Under 2.5</span>
                  </div>
                </div>
              </div>
            )}

            {/* Odds */}
            {matchStats && (
              <div className="overview-card glass-card">
                <h3 className="overview-title">💹 Odds Prediksi</h3>
                <div className="odds-row">
                  <div className="odds-box home">
                    <span className="odds-lbl">{match.homeTeam.shortName || match.homeTeam.name}</span>
                    <span className="odds-val">{matchStats.odds?.home}</span>
                  </div>
                  <div className="odds-box draw">
                    <span className="odds-lbl">Seri</span>
                    <span className="odds-val">{matchStats.odds?.draw}</span>
                  </div>
                  <div className="odds-box away">
                    <span className="odds-lbl">{match.awayTeam.shortName || match.awayTeam.name}</span>
                    <span className="odds-val">{matchStats.odds?.away}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LINEUP TAB */}
        {activeTab === "Lineup" && (
          <div className="tab-lineup">
            {squadLoading && (
              <div className="squad-loading">
                <div className="loading-spinner" />
                <p>Memuat skuad...</p>
              </div>
            )}
            {!squadLoading && homeSquad.length === 0 && awaySquad.length === 0 && (
              <div className="squad-empty glass-card">
                <Users size={40} style={{ color:"rgba(255,255,255,0.15)" }} />
                <p>Data skuad tidak tersedia untuk pertandingan ini.</p>
              </div>
            )}
            {!squadLoading && (homeSquad.length > 0 || awaySquad.length > 0) && (
              <div className="pitch-container">
                <div className="pitch-bg">
                  <div className="pitch-center-circle" />
                  <div className="pitch-center-line" />
                </div>
                <div className="pitch-teams">
                  {homeSquad.length > 0 && (
                    <LineupField squad={homeSquad} teamName={match.homeTeam.shortName||match.homeTeam.name} crest={match.homeTeam.crest} side="home" />
                  )}
                  {awaySquad.length > 0 && (
                    <LineupField squad={awaySquad} teamName={match.awayTeam.shortName||match.awayTeam.name} crest={match.awayTeam.crest} side="away" />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* H2H TAB */}
        {activeTab === "H2H" && matchStats && (
          <div className="tab-h2h">
            {matchStats.h2h?.length > 0 ? matchStats.h2h.map((h, i) => {
              const d = new Date(h.date);
              const dateStr = d.toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" });
              return (
                <div key={i} className="h2h-row glass-card">
                  <span className="h2h-date">{dateStr}</span>
                  <div className="h2h-match">
                    <span className="h2h-team">{h.homeTeam}</span>
                    <div className="h2h-score-box">
                      <span>{h.homeScore}</span>
                      <span className="h2h-dash">:</span>
                      <span>{h.awayScore}</span>
                    </div>
                    <span className="h2h-team away">{h.awayTeam}</span>
                  </div>
                  <span className="h2h-comp">{h.competition || ""}</span>
                </div>
              );
            }) : (
              <div className="squad-empty glass-card">
                <p>Belum ada data pertemuan sebelumnya.</p>
              </div>
            )}
          </div>
        )}

        {/* STATISTIK TAB — Radar Chart */}
        {activeTab === "Statistik" && (
          <div className="tab-stats">
            <div className="overview-card glass-card">
              <h3 className="overview-title"><Shield size={16} /> Perbandingan Kekuatan Tim</h3>
              <RadarComp homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
            </div>

            {matchStats && (
              <div className="overview-card glass-card">
                <h3 className="overview-title">📊 Form 5 Pertandingan Terakhir</h3>
                <div className="form-compare">
                  <div className="form-side">
                    {match.homeTeam.crest && <img src={match.homeTeam.crest} alt="" className="form-crest" />}
                    <div className="form-badges-row">
                      {(matchStats.form?.home || []).map((f, i) => (
                        <span key={i} className={`form-badge form-${f}`}>{f}</span>
                      ))}
                    </div>
                  </div>
                  <div className="form-vs">Form</div>
                  <div className="form-side away">
                    <div className="form-badges-row">
                      {(matchStats.form?.away || []).map((f, i) => (
                        <span key={i} className={`form-badge form-${f}`}>{f}</span>
                      ))}
                    </div>
                    {match.awayTeam.crest && <img src={match.awayTeam.crest} alt="" className="form-crest" />}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchDetail;
