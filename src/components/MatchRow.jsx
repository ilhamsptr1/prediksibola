import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePredictions } from '../context/PredictionContext';
import { Cpu, Users } from 'lucide-react';
import H2HModal from './H2HModal';
import LineupModal from './LineupModal';
import './MatchRow.css';

const TeamCrest = ({ team }) => {
  const [err, setErr] = useState(false);
  if (team.crest && !err) {
    return <img src={team.crest} alt={team.name} className="row-crest" onError={() => setErr(true)} />;
  }
  return <span className="row-flag">{team.flag || '⚽'}</span>;
};

// Pitch icon SVG (FotMob style lineup icon)
const PitchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="2" width="18" height="20" rx="2" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <circle cx="12" cy="12" r="3" />
    <path d="M8 2v3h8V2" />
    <path d="M8 22v-3h8v3" />
  </svg>
);

const useRowCountdown = (targetDate, enabled) => {
  const calc = () => {
    if (!enabled || !targetDate) return null;
    const diff = new Date(targetDate).getTime() - Date.now();
    if (isNaN(diff) || diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    if (d >= 7) return null;
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s, urgent: diff < 3600000 };
  };

  const [left, setLeft] = useState(calc);

  useEffect(() => {
    if (!enabled || !targetDate) return;
    setLeft(calc());
    const id = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(id);
  }, [targetDate, enabled]);

  return left;
};

const MatchRow = ({ match }) => {
  const navigate = useNavigate();
  const { generateAIPrediction, getPredictionForMatch } = usePredictions();
  const pred = getPredictionForMatch(match.id);

  const [isPredicting, setIsPredicting] = useState(false);
  const [showH2H,      setShowH2H]      = useState(false);
  const [showLineup,   setShowLineup]   = useState(false);

  const isLive      = match.status === 'LIVE';
  const isFinished  = match.status === 'FINISHED';
  const isScheduled = !isLive && !isFinished;

  const rawDate = match.utcDate || match.date;
  const parsedDate = rawDate ? new Date(rawDate) : null;
  const isValidDate = parsedDate && !isNaN(parsedDate.getTime());

  const matchTime = isValidDate
    ? parsedDate.toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
      }).replace(/\./g, ':')
    : '--:--';

  const matchShortDate = isValidDate
    ? parsedDate.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta',
      })
    : '';

  const countdown = useRowCountdown(rawDate, isScheduled);
  const pad = (n) => String(n).padStart(2, '0');

  const StatusLabel = () => {
    if (isLive) return (
      <div className="row-status row-status--live">
        <span className="row-live-dot" />
        <span>{match.minute ? `${match.minute}'` : 'LIVE'}</span>
      </div>
    );
    if (isFinished) return (
      <div className="row-status row-status--ft">
        <span>FT</span>
        {matchShortDate && <span className="row-status-date">{matchShortDate}</span>}
      </div>
    );
    return (
      <div className="row-status row-status--time">
        <span className="row-time-main">{matchTime}</span>
        {countdown ? (
          <span className={`row-countdown${countdown.urgent ? ' row-countdown--urgent' : ''}`}>
            {countdown.d > 0
              ? `${countdown.d}h ${pad(countdown.h)}j`
              : `${pad(countdown.h)}:${pad(countdown.m)}:${pad(countdown.s)}`}
          </span>
        ) : (
          matchShortDate && <span className="row-status-date">{matchShortDate}</span>
        )}
      </div>
    );
  };

  const ScoreBlock = () => {
    if (isFinished || isLive) {
      const hs = match.score?.home ?? '-';
      const as = match.score?.away ?? '-';
      return (
        <div className={`row-score${isLive ? ' row-score--live' : ''}`}>
          <span className={match.score?.home > match.score?.away ? 'score-win' : ''}>{hs}</span>
          <span className="score-sep">-</span>
          <span className={match.score?.away > match.score?.home ? 'score-win' : ''}>{as}</span>
        </div>
      );
    }
    if (pred) {
      return (
        <div className="row-score row-score--pred">
          <span className="pred-score-val">{pred.homeScore}</span>
          <span className="score-sep pred-sep">:</span>
          <span className="pred-score-val">{pred.awayScore}</span>
        </div>
      );
    }
    return <div className="row-vs">vs</div>;
  };

  const handlePredict = async (e) => {
    e.stopPropagation();
    if (isPredicting || pred) return;
    setIsPredicting(true);
    try { await generateAIPrediction(match); }
    finally { setIsPredicting(false); }
  };

  const ProbBar = () => {
    if (!pred) return null;
    return (
      <div className="row-prob-bar">
        <div className="row-prob-seg row-prob-home" style={{ width: `${pred.probabilities.home}%` }} />
        <div className="row-prob-seg row-prob-draw" style={{ width: `${pred.probabilities.draw}%` }} />
        <div className="row-prob-seg row-prob-away" style={{ width: `${pred.probabilities.away}%` }} />
      </div>
    );
  };

  return (
    <>
      <div
        className={`match-row${isLive ? ' match-row--live' : ''}${isFinished ? ' match-row--finished' : ''}`}
        onClick={() => navigate(`/match/${match.id}`)}
      >
        <StatusLabel />
        <div className="row-team row-team--home">
          <span className="row-team-name">{match.homeTeam.shortName || match.homeTeam.name}</span>
          {match.form?.home && (
            <div className="row-form-badges">
              {match.form.home.map((r, i) => (
                <span key={i} className={`row-form-dot row-form-${r}`} title={r} />
              ))}
            </div>
          )}
          <TeamCrest team={match.homeTeam} />
        </div>
        <div className="row-center">
          <ScoreBlock />
          <ProbBar />
        </div>
        <div className="row-team row-team--away">
          <TeamCrest team={match.awayTeam} />
          {match.form?.away && (
            <div className="row-form-badges">
              {match.form.away.map((r, i) => (
                <span key={i} className={`row-form-dot row-form-${r}`} title={r} />
              ))}
            </div>
          )}
          <span className="row-team-name">{match.awayTeam.shortName || match.awayTeam.name}</span>
        </div>
        <div className="row-actions" onClick={e => e.stopPropagation()}>
          <button
            className="row-btn row-btn--lineup"
            onClick={e => { e.stopPropagation(); setShowLineup(true); }}
            title="Lihat Susunan Pemain (Lineup)"
          >
            <PitchIcon />
            <span>Lineup</span>
          </button>
          <button
            className={`row-btn row-btn--ai${pred ? ' has-pred' : ''}${isPredicting ? ' loading' : ''}`}
            onClick={handlePredict}
            title="Prediksi AI"
          >
            <Cpu size={13} />
            <span>{isPredicting ? '...' : pred ? `${pred.probabilities.home}%` : 'AI'}</span>
          </button>
          <button
            className="row-btn row-btn--h2h"
            onClick={e => { e.stopPropagation(); setShowH2H(true); }}
            title="Head to Head"
          >
            <Users size={13} />
          </button>
        </div>
      </div>
      {showH2H    && <H2HModal    match={match} onClose={() => setShowH2H(false)}    />}
      {showLineup && <LineupModal match={match} onClose={() => setShowLineup(false)} />}
    </>
  );
};

export default MatchRow;
