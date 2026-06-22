import React, { useState, useEffect } from 'react';
import { usePredictions } from '../context/PredictionContext';
import { Calendar, MapPin, CheckCircle, Clock, Save, BarChart2 } from 'lucide-react';
import './MatchCard.css';

// Shows official crest or falls back to emoji flag
const TeamBadge = ({ team }) => {
  const [imgError, setImgError] = useState(false);
  if (team.crest && !imgError) {
    return (
      <img
        src={team.crest}
        alt={team.name}
        className="team-crest"
        onError={() => setImgError(true)}
      />
    );
  }
  return <span className="team-flag">{team.flag}</span>;
};

const StatusBadge = ({ status, minute }) => {
  if (status === 'LIVE') {
    return (
      <div className="status-badge status-live">
        <span className="live-dot" />
        LIVE {minute ? `${minute}'` : ''}
      </div>
    );
  }
  if (status === 'FINISHED') {
    return <div className="status-badge status-finished">FT</div>;
  }
  if (status === 'POSTPONED' || status === 'CANCELLED') {
    return <div className="status-badge status-cancelled">{status}</div>;
  }
  return null;
};

const MatchCard = ({ match }) => {
  const { saveUserPrediction, getPredictionForMatch } = usePredictions();
  const existingPrediction = getPredictionForMatch(match.id);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  
  const [inputHome, setInputHome] = useState(existingPrediction ? existingPrediction.homeScore.toString() : '');
  const [inputAway, setInputAway] = useState(existingPrediction ? existingPrediction.awayScore.toString() : '');

  const [showStats, setShowStats] = useState(false);
  const [matchStats, setMatchStats] = useState(null);

  const isFinished  = match.status === 'FINISHED';
  const isLive      = match.status === 'LIVE';
  const canPredict  = match.status === 'SCHEDULED';

  const handlePredict = async () => {
    if (inputHome === '' || inputAway === '') return;
    
    setIsSubmitting(true);
    // Simulate slight delay
    await new Promise(r => setTimeout(r, 400));
    
    const success = saveUserPrediction(match.id, inputHome, inputAway);
    setIsSubmitting(false);
    
    if (success) {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    }
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
          {match.matchday && (
            <span className="match-day">MD {match.matchday}</span>
          )}
        </div>
        <div className="header-right">
          <StatusBadge status={match.status} minute={match.minute} />
          <span className="match-date"><Calendar size={13} /> {matchDate} WIB</span>
          <span className="match-venue"><MapPin size={13} /> {match.venue}</span>
        </div>
      </div>

      {/* Teams & Score */}
      <div className="match-teams">
        {/* Home Team */}
        <div className="team home-team">
          <TeamBadge team={match.homeTeam} />
          <span className="team-name">{match.homeTeam.name}</span>
        </div>

        {/* VS / Score area */}
        <div className="match-score-area">
          {(isLive || isFinished) && match.score.home !== null ? (
             <div className="real-score-board">
               <span className={`real-score${isLive ? ' live-score' : ''}`}>{match.score.home}</span>
               <span className="score-divider">-</span>
               <span className={`real-score${isLive ? ' live-score' : ''}`}>{match.score.away}</span>
             </div>
          ) : (
            <div className="predict-inputs">
              <input 
                type="number" 
                min="0" max="20"
                value={inputHome}
                onChange={(e) => setInputHome(e.target.value)}
                disabled={!canPredict}
                className="score-input"
                placeholder="-"
              />
              <span className="score-divider">VS</span>
              <input 
                type="number" 
                min="0" max="20"
                value={inputAway}
                onChange={(e) => setInputAway(e.target.value)}
                disabled={!canPredict}
                className="score-input"
                placeholder="-"
              />
            </div>
          )}
        </div>

        {/* Away Team */}
        <div className="team away-team">
          <span className="team-name">{match.awayTeam.name}</span>
          <TeamBadge team={match.awayTeam} />
        </div>
      </div>

      {/* Power Stats Row */}
      <div className="match-power-stats-row">
        <div className="team-power-stats home-power">
          <span className="stat-att" title="Attack Strength">ATT {match.homeTeam.att}</span>
          <span className="stat-def" title="Defense Strength">DEF {match.homeTeam.def}</span>
        </div>
        <div className="team-power-stats away-power">
          <span className="stat-att" title="Attack Strength">ATT {match.awayTeam.att}</span>
          <span className="stat-def" title="Defense Strength">DEF {match.awayTeam.def}</span>
        </div>
      </div>

      {/* Prediction info/points badge */}
      {existingPrediction && (
        <div className="prediction-badge" style={{ justifyContent: 'center' }}>
          {existingPrediction.evaluated ? (
             <span>
               Tebakan Anda: <strong>{existingPrediction.homeScore} - {existingPrediction.awayScore}</strong> 
               <span style={{ marginLeft: '8px', color: existingPrediction.pointsEarned > 0 ? 'var(--primary)' : 'inherit' }}>
                 ( +{existingPrediction.pointsEarned} Pts )
               </span>
             </span>
          ) : (
             <span>Tebakan tersimpan: <strong>{existingPrediction.homeScore} - {existingPrediction.awayScore}</strong></span>
          )}
        </div>
      )}

      <div className="match-footer">
        {canPredict ? (
          <button
            className={`btn ${isSaved ? 'btn-saved' : 'btn-primary'} predict-btn`}
            onClick={handlePredict}
            disabled={isSubmitting || inputHome === '' || inputAway === ''}
          >
            {isSubmitting
              ? 'Menyimpan...'
              : isSaved
              ? <><CheckCircle size={16} /> Tersimpan!</>
              : <><Save size={16} /> Simpan Prediksi</>}
          </button>
        ) : isLive ? (
          <div className="info-text live-info">
            <span className="live-dot" /> Pertandingan berlangsung
          </div>
        ) : isFinished ? (
          <div className="info-text finished-info">
            <CheckCircle size={14} /> Pertandingan selesai
          </div>
        ) : (
          <div className="info-text">
            <Clock size={14} /> Prediksi ditutup
          </div>
        )}
        <button 
          className="btn btn-secondary btn-stats"
          onClick={toggleStats}
        >
          <BarChart2 size={16} /> {showStats ? 'Tutup Statistik' : 'Statistik & Odds'}
        </button>
      </div>
      
      {/* Expanded Stats Section */}
      {showStats && matchStats && (
        <div className="stats-container animate-fade-in">
          <div className="stats-header">
            <h4>Peluang & Odds Riil</h4>
          </div>
          
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

          {/* Over/Under 2.5 */}
          <div className="overunder-section">
            <h4>Prediksi Over/Under</h4>
            <div className="overunder-bars">
              <div className="ou-item">
                <div className="ou-label">
                  <span className="ou-name">Over 2.5 Goals</span>
                  <span className="ou-value ou-over-value">{matchStats.overUnder.over25}%</span>
                </div>
                <div className="ou-bar-track">
                  <div
                    className="ou-bar-fill ou-over"
                    style={{ width: `${matchStats.overUnder.over25}%` }}
                  ></div>
                </div>
              </div>
              <div className="ou-item">
                <div className="ou-label">
                  <span className="ou-name">Under 2.5 Goals</span>
                  <span className="ou-value ou-under-value">{matchStats.overUnder.under25}%</span>
                </div>
                <div className="ou-bar-track">
                  <div
                    className="ou-bar-fill ou-under"
                    style={{ width: `${matchStats.overUnder.under25}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="team-form">
              <span className="team-name-form">{match.homeTeam.name} Form</span>
              <div className="form-badges">
                {matchStats.form.home.map((f, i) => (
                  <span key={i} className={`form-badge form-${f}`}>{f}</span>
                ))}
              </div>
            </div>
            <div className="team-form right">
              <span className="team-name-form">{match.awayTeam.name} Form</span>
              <div className="form-badges">
                {matchStats.form.away.map((f, i) => (
                  <span key={i} className={`form-badge form-${f}`}>{f}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="h2h-section">
            <h4>Head-to-Head (3 Pertemuan Terakhir)</h4>
            <div className="h2h-list">
              {matchStats.h2h.length > 0 ? (
                matchStats.h2h.map((h, i) => (
                  <div key={i} className="h2h-item">
                    <div className="h2h-meta">
                      <span className="h2h-year">{h.date}</span>
                      <span className="h2h-tourney">{h.tournament}</span>
                    </div>
                    <span className="h2h-match">
                      {h.homeTeam} <strong>{h.homeScore} - {h.awayScore}</strong> {h.awayTeam}
                    </span>
                  </div>
                ))
              ) : (
                <div className="h2h-item h2h-empty">
                  Belum ada catatan pertemuan yang tersedia.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchCard;
