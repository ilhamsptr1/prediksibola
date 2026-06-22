import React, { useState } from 'react';
import { usePredictions } from '../context/PredictionContext';
import { Calendar, MapPin, CheckCircle, Clock, Zap, BarChart2, Cpu } from 'lucide-react';
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
  const existingPrediction = getPredictionForMatch(match.id);

  const [isPredicting, setIsPredicting] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [matchStats, setMatchStats] = useState(null);

  const isFinished  = match.status === 'FINISHED';
  const isLive      = match.status === 'LIVE';
  const canPredict  = match.status === 'SCHEDULED';

  const handlePredict = async () => {
    setIsPredicting(true);
    // Simulate thinking delay for effect
    await new Promise(r => setTimeout(r, 800));
    await generateAIPrediction(match);
    setIsPredicting(false);
  };

  const toggleStats = async () => {
    if (!showStats && !matchStats) {
      const { generateMatchStats } = await import('../services/footballApi');
      setMatchStats(generateMatchStats(match.homeTeam, match.awayTeam));
    }
    setShowStats(!showStats);
  };

  const matchDate = new Date(match.date).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  });

  const cardClass = `match-card glass-card animate-fade-in${isLive ? ' card-live' : ''}${isFinished ? ' card-finished' : ''}`;

  return (
    <div className={cardClass}>
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

      {/* Teams & Score */}
      <div className="match-teams">
        <div className="team home-team">
          <TeamBadge team={match.homeTeam} />
          <span className="team-name">{match.homeTeam.name}</span>
          {(isLive || isFinished) && match.score.home !== null ? (
            <span className={`real-score${isLive ? ' live-score' : ''}`}>{match.score.home}</span>
          ) : (
            <span className="real-score" style={{ opacity: existingPrediction ? 1 : 0.2 }}>
              {existingPrediction ? existingPrediction.homeScore : '-'}
            </span>
          )}
        </div>

        <div className="match-vs">
          {(isLive || isFinished) && match.score.home !== null ? <span className="score-divider">—</span> : <span>VS</span>}
        </div>

        <div className="team away-team">
          {(isLive || isFinished) && match.score.away !== null ? (
            <span className={`real-score${isLive ? ' live-score' : ''}`}>{match.score.away}</span>
          ) : (
            <span className="real-score" style={{ opacity: existingPrediction ? 1 : 0.2 }}>
              {existingPrediction ? existingPrediction.awayScore : '-'}
            </span>
          )}
          <span className="team-name">{match.awayTeam.name}</span>
          <TeamBadge team={match.awayTeam} />
        </div>
      </div>

      {/* AI Prediction info */}
      {existingPrediction && (
        <div className="prediction-badge ai-badge">
          <div className="ai-badge-content">
            <Cpu size={14} className="ai-icon-pulse" />
            <span>AI Prediction Generated</span>
          </div>
          <div className="ai-stats-row">
            <span className="ai-xg" title="Expected Goals (xG)">xG: {existingPrediction.xG.home} - {existingPrediction.xG.away}</span>
            <span className="ai-power" title="Historical AI Power Index">Power: {existingPrediction.powerInfo.homePower} vs {existingPrediction.powerInfo.awayPower}</span>
          </div>
        </div>
      )}

      <div className="match-footer">
        {canPredict ? (
          <button
            className={`btn ${existingPrediction ? 'btn-saved' : 'btn-primary'} predict-btn`}
            onClick={handlePredict}
            disabled={isPredicting}
          >
            {isPredicting
              ? 'Menghitung Probabilitas...'
              : existingPrediction
              ? <><CheckCircle size={16} /> Prediksi AI Selesai</>
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
      
      {/* Expanded Stats Section (kept from original) */}
      {showStats && matchStats && (
        <div className="stats-container animate-fade-in">
          {/* Include original probability and H2H stats ... */}
          <div className="stats-header"><h4>Peluang & Odds Riil</h4></div>
          <div className="probability-section">
            <div className="prob-labels">
              <span>{match.homeTeam.name} ({matchStats.percentages.home}%)</span>
              <span>Seri ({matchStats.percentages.draw}%)</span>
              <span>{match.awayTeam.name} ({matchStats.percentages.away}%)</span>
            </div>
            <div className="probability-bar">
              <div className="prob-home" style={{ width: `${matchStats.percentages.home}%` }}></div>
              <div className="prob-draw" style={{ width: `${matchStats.percentages.draw}%` }}></div>
              <div className="prob-away" style={{ width: `${matchStats.percentages.away}%` }}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchCard;
