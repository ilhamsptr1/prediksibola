import React, { useState } from 'react';
import { usePredictions } from '../context/PredictionContext';
import { Calendar, MapPin, CheckCircle, Clock, BarChart2, Cpu } from 'lucide-react';
import { generateMatchStats } from '../services/footballApi';
import teamRatingsData from '../data/teamRatings.json';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip
} from 'recharts';
import './MatchCard.css';

const TeamBadge = ({ team }) => {
  const [imgError, setImgError] = useState(false);
  if (team.crest && !imgError) {
    return <img src={team.crest} alt={team.name} className="team-crest" onError={() => setImgError(true)} />;
  }
  return <span className="team-flag">{team.flag}</span>;
};

const StatusBadge = ({ status, minute }) => {
  if (status === 'LIVE') return <div className="status-badge status-live"><span className="live-dot" /> LIVE {minute ? `${minute}'` : ''}</div>;
  if (status === 'FINISHED') return <div className="status-badge status-finished">FT</div>;
  if (status === 'POSTPONED' || status === 'CANCELLED') return <div className="status-badge status-cancelled">{status}</div>;
  return null;
};

const MatchCard = ({ match }) => {
  const { generateAIPrediction, getPredictionForMatch } = usePredictions();
  const pred = getPredictionForMatch(match.id);

  const [isPredicting, setIsPredicting] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [matchStats, setMatchStats] = useState(null);

  const isFinished = match.status === 'FINISHED';
  const isLive     = match.status === 'LIVE';
  const canPredict = match.status === 'SCHEDULED';

  const handlePredict = async () => {
    setIsPredicting(true);
    await new Promise(r => setTimeout(r, 900));
    await generateAIPrediction(match);
    setIsPredicting(false);
  };

  const toggleStats = () => {
    if (!showStats && !matchStats) {
      setMatchStats(generateMatchStats(match.homeTeam, match.awayTeam));
    }
    setShowStats(!showStats);
  };

  const matchDate = new Date(match.date).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  });

  const cardClass = `match-card glass-card animate-fade-in${isLive ? ' card-live' : ''}${isFinished ? ' card-finished' : ''} tilt-wrapper`;

  return (
    <div className={cardClass}>
      {/* Animated accent bar at top */}
      <div className="card-accent-bar" />

      {/* Header */}
      <div className="match-header">
        <div className="header-left">
          <span className="match-group">{match.group}</span>
          {match.matchday && <span className="match-day">MD {match.matchday}</span>}
        </div>
        <div className="header-right">
          <StatusBadge status={match.status} minute={match.minute} />
          <span className="match-date"><Calendar size={13} /> {matchDate} WIB</span>
          <span className="match-venue"><MapPin size={13} /> {match.venue}</span>
        </div>
      </div>

      {/* Teams & Scores */}
      <div className="match-teams">
        {/* Home */}
        <div className="team home-team">
          <TeamBadge team={match.homeTeam} />
          <span className="team-name">{match.homeTeam.name}</span>
          {(isLive || isFinished) && match.score.home !== null ? (
            <span className={`real-score${isLive ? ' live-score' : ''}`}>{match.score.home}</span>
          ) : (
            <span className="real-score predicted-score" style={{ opacity: pred ? 1 : 0.2 }}>
              {pred ? pred.homeScore : '-'}
            </span>
          )}
        </div>

        <span className="match-vs-wrapper">
          <span className="match-vs">
            {(isLive || isFinished) && match.score.home !== null ? '—' : 'VS'}
          </span>
        </span>

        {/* Away */}
        <div className="team away-team">
          {(isLive || isFinished) && match.score.away !== null ? (
            <span className={`real-score${isLive ? ' live-score' : ''}`}>{match.score.away}</span>
          ) : (
            <span className="real-score predicted-score" style={{ opacity: pred ? 1 : 0.2 }}>
              {pred ? pred.awayScore : '-'}
            </span>
          )}
          <span className="team-name">{match.awayTeam.name}</span>
          <TeamBadge team={match.awayTeam} />
        </div>
      </div>

      {/* AI Prediction Result Card */}
      {pred && (
        <div className="ai-result-card">
          {/* Win/Draw/Loss probability bar */}
          <div className="prob-row">
            <span className="prob-label home-label">{match.homeTeam.name}</span>
            <span className="prob-label draw-label">Seri</span>
            <span className="prob-label away-label">{match.awayTeam.name}</span>
          </div>
          <div className="prob-bar-outer">
            <div className="prob-seg prob-home" style={{ width: `${pred.probabilities.home}%` }}>
              <span className="prob-pct">{pred.probabilities.home}%</span>
            </div>
            <div className="prob-seg prob-draw" style={{ width: `${pred.probabilities.draw}%` }}>
              <span className="prob-pct">{pred.probabilities.draw}%</span>
            </div>
            <div className="prob-seg prob-away" style={{ width: `${pred.probabilities.away}%` }}>
              <span className="prob-pct">{pred.probabilities.away}%</span>
            </div>
          </div>

          {/* xG & Elo row */}
          <div className="ai-meta-row">
            <div className="ai-meta-item">
              <span className="ai-meta-label">xG</span>
              <span className="ai-meta-value">{pred.xG.home} — {pred.xG.away}</span>
            </div>
            <div className="ai-meta-item">
              <Cpu size={12} className="ai-icon-pulse" />
              <span className="ai-meta-label">AI Score</span>
            </div>
            <div className="ai-meta-item">
              <span className="ai-meta-label">Elo</span>
              <span className="ai-meta-value">{pred.powerInfo.homeElo} — {pred.powerInfo.awayElo}</span>
            </div>
          </div>
        </div>
      )}

      {/* Footer Buttons */}
      <div className="match-footer">
        {canPredict ? (
          <button
            className={`btn ${pred ? 'btn-saved' : 'btn-primary'} predict-btn`}
            onClick={handlePredict}
            disabled={isPredicting}
          >
            {isPredicting
              ? <><span className="spinner" /> Menghitung probabilitas...</>
              : pred
              ? <><CheckCircle size={16} /> AI Prediksi Selesai — Prediksi Ulang</>
              : <><Cpu size={16} /> Generate AI Prediction</>}
          </button>
        ) : isLive ? (
          <div className="info-text live-info"><span className="live-dot" /> Pertandingan berlangsung</div>
        ) : isFinished ? (
          <div className="info-text finished-info"><CheckCircle size={14} /> Pertandingan selesai</div>
        ) : (
          <div className="info-text"><Clock size={14} /> Prediksi ditutup</div>
        )}
        <button className="btn btn-secondary btn-stats" onClick={toggleStats}>
          <BarChart2 size={16} /> {showStats ? 'Tutup Statistik' : 'Statistik & Odds'}
        </button>
      </div>

      {/* Expanded Stats Section */}
      {showStats && matchStats && (
        <div className="stats-container animate-fade-in">
          <div className="stats-header"><h4>Analisis Mendalam</h4></div>
          <div className="probability-section">
            <div className="prob-labels">
              <span>{match.homeTeam.name} ({matchStats.percentages.home}%)<br/><small>Odds: {matchStats.odds.home}</small></span>
              <span>Seri ({matchStats.percentages.draw}%)<br/><small>Odds: {matchStats.odds.draw}</small></span>
              <span>{match.awayTeam.name} ({matchStats.percentages.away}%)<br/><small>Odds: {matchStats.odds.away}</small></span>
            </div>
            <div className="probability-bar">
              <div className="prob-home" style={{ width: `${matchStats.percentages.home}%` }}></div>
              <div className="prob-draw" style={{ width: `${matchStats.percentages.draw}%` }}></div>
              <div className="prob-away" style={{ width: `${matchStats.percentages.away}%` }}></div>
            </div>
          </div>

          <div className="radar-chart-section" style={{ height: '220px', width: '100%', marginTop: '1rem', marginBottom: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                { subject: 'Attack', A: match.homeTeam.att || 70, B: match.awayTeam.att || 70, fullMark: 100 },
                { subject: 'Defense', A: match.homeTeam.def || 70, B: match.awayTeam.def || 70, fullMark: 100 },
                { subject: 'Form', A: (matchStats.form.home.filter(x=>x==='W').length * 20) + 40, B: (matchStats.form.away.filter(x=>x==='W').length * 20) + 40, fullMark: 100 },
                { subject: 'Elo PWR', A: pred?.powerInfo?.homePower || 50, B: pred?.powerInfo?.awayPower || 50, fullMark: 100 },
                { subject: 'Win Odds', A: matchStats.percentages.home, B: matchStats.percentages.away, fullMark: 100 },
              ]}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px' }} />
                <Radar name={match.homeTeam.name} dataKey="A" stroke="#4ade80" fill="#4ade80" fillOpacity={0.4} />
                <Radar name={match.awayTeam.name} dataKey="B" stroke="#f87171" fill="#f87171" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="h2h-section">
            <h4>Head-to-Head (3 Pertemuan Terakhir)</h4>
            <div className="h2h-list">
              {matchStats.h2h.length > 0 ? matchStats.h2h.map((h, i) => (
                <div key={i} className="h2h-item">
                  <div className="h2h-meta">
                    <span className="h2h-year">{h.date}</span>
                    <span className="h2h-tourney">{h.tournament}</span>
                  </div>
                  <span className="h2h-match">
                    {h.homeTeam} <strong>{h.homeScore} - {h.awayScore}</strong> {h.awayTeam}
                  </span>
                </div>
              )) : (
                <div className="h2h-item h2h-empty">Belum ada catatan pertemuan.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchCard;
