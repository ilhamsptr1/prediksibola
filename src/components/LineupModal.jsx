import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchMatchLineups,
  getRatingColor,
} from '../services/lineupService';
import './LineupModal.css';

/**
 * FotMob-style Player Node on the Pitch
 */
export const FotMobPlayerNode = ({ player, side = 'home', compact = false }) => {
  const [imgErr, setImgErr] = useState(false);
  if (!player) return null;

  const isGK = player.role === 'GK';
  const kitClass = isGK
    ? 'fm-kit--gk'
    : side === 'home'
    ? 'fm-kit--home'
    : 'fm-kit--away';

  const ratingBg = getRatingColor(player.rating);
  const hasPhoto = Boolean(player.headshot) && !imgErr;

  return (
    <div className={`fm-player-node${compact ? ' fm-player-node--compact' : ''}`} title={`${player.name} (${player.position})`}>
      <div className="fm-player-visual">
        {/* Avatar or Kit Circle */}
        <div className={`fm-player-avatar ${hasPhoto ? 'fm-player-avatar--photo' : kitClass}`}>
          {hasPhoto ? (
            <img
              src={player.headshot}
              alt={player.name}
              className="fm-player-headshot"
              onError={() => setImgErr(true)}
            />
          ) : (
            <span className="fm-player-shirt-num">{player.shirtNumber ?? '-'}</span>
          )}
        </div>

        {/* Captain Badge (Top-Left, FotMob token --Lineup-captainBackground) */}
        {player.captain && (
          <span className="fm-badge-captain" title="Kapten (Captain)">C</span>
        )}

        {/* Match Rating Pill (Top-Right, FotMob token --PlayerRating-*) */}
        {player.rating && ratingBg && (
          <span className="fm-badge-rating" style={{ backgroundColor: ratingBg }}>
            {player.rating}
          </span>
        )}

        {/* Substitution Out Badge (Bottom-Left) */}
        {player.subbedOut && (
          <span className="fm-badge-sub fm-badge-sub--out" title="Digantikan">
            ↓
          </span>
        )}

        {/* Goal / Card Event Badges (Bottom-Right) */}
        {(player.events?.goals > 0 || player.events?.yellowCard || player.events?.redCard) && (
          <div className="fm-badge-events">
            {player.events?.goals > 0 && (
              <span className="fm-event-goal" title={`${player.events.goals} Gol`}>
                ⚽{player.events.goals > 1 ? player.events.goals : ''}
              </span>
            )}
            {player.events?.yellowCard && <span className="fm-event-card fm-event-card--yellow" title="Kartu Kuning" />}
            {player.events?.redCard && <span className="fm-event-card fm-event-card--red" title="Kartu Merah" />}
          </div>
        )}
      </div>

      {/* Player Name Label */}
      <div className="fm-player-label">
        <span className="fm-player-label-num">{player.shirtNumber}</span>
        <span className="fm-player-label-name">{player.shortName || player.name}</span>
      </div>
    </div>
  );
};

/**
 * FotMob Bench / Substitute Row Item
 */
export const FotMobBenchItem = ({ player, side = 'home' }) => {
  const [imgErr, setImgErr] = useState(false);
  const ratingBg = getRatingColor(player.rating);
  const hasPhoto = Boolean(player.headshot) && !imgErr;
  const isGK = player.role === 'GK';

  return (
    <div className="fm-bench-item">
      <div className="fm-bench-left">
        <div className={`fm-bench-avatar ${isGK ? 'fm-kit--gk' : side === 'home' ? 'fm-kit--home' : 'fm-kit--away'}`}>
          {hasPhoto ? (
            <img src={player.headshot} alt={player.name} onError={() => setImgErr(true)} />
          ) : (
            <span>{player.shirtNumber ?? '-'}</span>
          )}
        </div>
        <div className="fm-bench-info">
          <div className="fm-bench-name-row">
            <span className="fm-bench-num">{player.shirtNumber}</span>
            <span className="fm-bench-name">{player.name}</span>
          </div>
          <div className="fm-bench-meta">
            <span>{player.position}</span>
            {player.subbedIn && (
              <span className="fm-bench-subin">
                ↑ Masuk {player.events?.subMinute ? `(${player.events.subMinute})` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="fm-bench-right">
        {player.events?.goals > 0 && <span className="fm-bench-event">⚽</span>}
        {player.events?.yellowCard && <span className="fm-event-card fm-event-card--yellow" />}
        {player.events?.redCard && <span className="fm-event-card fm-event-card--red" />}
        {player.rating && ratingBg && (
          <span className="fm-bench-rating" style={{ backgroundColor: ratingBg }}>
            {player.rating}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Group full squad by role
 */
const groupSquadByRole = (squad = []) => {
  const groups = { Kiper: [], Bek: [], Gelandang: [], Penyerang: [] };
  squad.forEach(p => {
    if (p.role === 'GK') groups.Kiper.push(p);
    else if (p.role === 'DEF') groups.Bek.push(p);
    else if (p.role === 'MID') groups.Gelandang.push(p);
    else groups.Penyerang.push(p);
  });
  return groups;
};

const LineupModal = ({ match, onClose }) => {
  // 'COMBINED' = FotMob Dual-Team Full Pitch, 'HOME' = Home Only, 'AWAY' = Away Only
  const [viewMode, setViewMode] = useState('COMBINED');
  const [lineups, setLineups] = useState({ home: null, away: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMatchLineups(match).then(res => {
      if (!active) return;
      setLineups(res);
      if (res.home && !res.away) setViewMode('HOME');
      else if (!res.home && res.away) setViewMode('AWAY');
      setLoading(false);
    });
    return () => { active = false; };
  }, [match]);

  const homeData = lineups.home;
  const awayData = lineups.away;
  const hasAnyData = Boolean(homeData || awayData);
  const isConfirmed = Boolean(homeData?.isConfirmed || awayData?.isConfirmed);

  const homeName = match.homeTeam.shortName || match.homeTeam.name;
  const awayName = match.awayTeam.shortName || match.awayTeam.name;

  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeSingleData = viewMode === 'AWAY' ? awayData : homeData;
  const activeSingleSide = viewMode === 'AWAY' ? 'away' : 'home';
  const activeSingleTeam = viewMode === 'AWAY' ? match.awayTeam : match.homeTeam;
  const activeGroupedSquad = groupSquadByRole(activeSingleData?.fullSquad || []);

  return createPortal(
    <div className="lineup-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Susunan Pemain">
      <div className="lineup-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="lineup-modal__header">
          <div className="lineup-modal__title">
            <div className="lineup-modal__title-row">
              <span>Susunan Pemain (Lineup)</span>
              {hasAnyData && (
                <span className={`fm-status-pill ${isConfirmed ? 'fm-status-pill--confirmed' : 'fm-status-pill--probable'}`}>
                  {isConfirmed ? 'Resmi (Starting XI)' : 'Prediksi Lineup'}
                </span>
              )}
            </div>
            <span className="lineup-modal__subtitle">
              {homeName} vs {awayName}
            </span>
          </div>
          <button className="lineup-modal__close" onClick={onClose} aria-label="Tutup">×</button>
        </div>

        {/* Mode Switcher Tabs (FotMob Dual Pitch vs Individual Team) */}
        <div className="lineup-tabs">
          <button
            className={`lineup-tab ${viewMode === 'COMBINED' ? 'active' : ''}`}
            onClick={() => setViewMode('COMBINED')}
          >
            <span>Lapangan Penuh</span>
          </button>
          <button
            className={`lineup-tab ${viewMode === 'HOME' ? 'active' : ''}`}
            onClick={() => setViewMode('HOME')}
          >
            {match.homeTeam.crest && <img src={match.homeTeam.crest} className="lineup-tab__crest" alt="" />}
            <span>{homeName}</span>
            {homeData?.formation && <span className="fm-tab-formation">{homeData.formation}</span>}
          </button>
          <button
            className={`lineup-tab ${viewMode === 'AWAY' ? 'active' : ''}`}
            onClick={() => setViewMode('AWAY')}
          >
            {match.awayTeam.crest && <img src={match.awayTeam.crest} className="lineup-tab__crest" alt="" />}
            <span>{awayName}</span>
            {awayData?.formation && <span className="fm-tab-formation">{awayData.formation}</span>}
          </button>
        </div>

        {/* Body */}
        <div className="lineup-modal__body">
          {loading ? (
            <div className="lineup-loading">
              <div className="lineup-spinner" />
              <span>Memuat susunan pemain &amp; formasi...</span>
            </div>
          ) : !hasAnyData ? (
            <div className="lineup-error">
              <span style={{ fontSize: '2.5rem' }}>⚽</span>
              <span style={{ fontWeight: 700, marginTop: '0.5rem', color: '#fff' }}>Susunan pemain belum tersedia</span>
              <span style={{ fontSize: '0.78rem', opacity: 0.65, textAlign: 'center', lineHeight: 1.5, maxWidth: '320px' }}>
                Data Starting XI untuk pertandingan ini belum dirilis oleh penyelenggara kompetisi.
              </span>
            </div>
          ) : viewMode === 'COMBINED' && homeData && awayData ? (
            /* ============================================================
               FOTMOB DUAL-TEAM FULL VERTICAL PITCH
               Top Half: Home Team (GK at top -> Strikers at center)
               Bottom Half: Away Team (Strikers at center -> GK at bottom)
               ============================================================ */
            <>
              <div className={`fm-dual-pitch-card ${isConfirmed ? 'fm-pitch--confirmed' : 'fm-pitch--probable'}`}>
                {/* Top Team Bar (Home) */}
                <div className="fm-team-bar fm-team-bar--top">
                  <div className="fm-team-bar__left">
                    {match.homeTeam.crest && <img src={match.homeTeam.crest} alt="" className="fm-team-bar__crest" />}
                    <span className="fm-team-bar__name">{homeName}</span>
                  </div>
                  <div className="fm-team-bar__right">
                    {homeData.avgRating && (
                      <span className="fm-team-bar__rating" style={{ backgroundColor: getRatingColor(homeData.avgRating) }}>
                        ★ {homeData.avgRating}
                      </span>
                    )}
                    <span className="fm-team-bar__formation">{homeData.formation}</span>
                  </div>
                </div>

                {/* Full Pitch Surface */}
                <div className="fm-pitch-surface fm-pitch-surface--dual">
                  {/* Pitch Markings */}
                  <div className="fm-marking fm-marking--penalty-top" />
                  <div className="fm-marking fm-marking--goal-top" />
                  <div className="fm-marking fm-marking--arc-top" />
                  <div className="fm-marking fm-marking--halfway" />
                  <div className="fm-marking fm-marking--center-circle" />
                  <div className="fm-marking fm-marking--center-spot" />
                  <div className="fm-marking fm-marking--arc-bottom" />
                  <div className="fm-marking fm-marking--penalty-bottom" />
                  <div className="fm-marking fm-marking--goal-bottom" />

                  {/* Home Half (Top: GK at row 0 -> Attack at last row) */}
                  <div className="fm-half fm-half--home">
                    {homeData.rows.map((row, rIdx) => (
                      <div key={`home-r-${rIdx}`} className="fm-pitch-row">
                        {row.map(player => (
                          <FotMobPlayerNode key={player.id} player={player} side="home" compact />
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Away Half (Bottom: Attack near center -> GK at bottom) */}
                  <div className="fm-half fm-half--away">
                    {[...awayData.rows].reverse().map((row, rIdx) => (
                      <div key={`away-r-${rIdx}`} className="fm-pitch-row">
                        {row.map(player => (
                          <FotMobPlayerNode key={player.id} player={player} side="away" compact />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Team Bar (Away) */}
                <div className="fm-team-bar fm-team-bar--bottom">
                  <div className="fm-team-bar__left">
                    {match.awayTeam.crest && <img src={match.awayTeam.crest} alt="" className="fm-team-bar__crest" />}
                    <span className="fm-team-bar__name">{awayName}</span>
                  </div>
                  <div className="fm-team-bar__right">
                    {awayData.avgRating && (
                      <span className="fm-team-bar__rating" style={{ backgroundColor: getRatingColor(awayData.avgRating) }}>
                        ★ {awayData.avgRating}
                      </span>
                    )}
                    <span className="fm-team-bar__formation">{awayData.formation}</span>
                  </div>
                </div>
              </div>

              {/* Coaches Row (Pelatih) */}
              {(homeData.coach || awayData.coach) && (
                <div className="fm-section-card">
                  <div className="fm-section-header">Pelatih (Manager)</div>
                  <div className="fm-coaches-grid">
                    <div className="fm-coach-box">
                      <span className="fm-coach-team">{homeName}</span>
                      <span className="fm-coach-name">{homeData.coach || ' belum diumumkan'}</span>
                    </div>
                    <div className="fm-coach-box fm-coach-box--right">
                      <span className="fm-coach-team">{awayName}</span>
                      <span className="fm-coach-name">{awayData.coach || 'belum diumumkan'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Substitutes / Bench Section (Pemain Cadangan) */}
              {(homeData.bench?.length > 0 || awayData.bench?.length > 0) && (
                <div className="fm-section-card">
                  <div className="fm-section-header">Pemain Cadangan (Bench)</div>
                  <div className="fm-bench-dual-grid">
                    <div className="fm-bench-col">
                      <div className="fm-bench-col__title">
                        {match.homeTeam.crest && <img src={match.homeTeam.crest} alt="" />}
                        <span>{homeName}</span>
                      </div>
                      {homeData.bench.map(p => (
                        <FotMobBenchItem key={p.id} player={p} side="home" />
                      ))}
                    </div>
                    <div className="fm-bench-col">
                      <div className="fm-bench-col__title">
                        {match.awayTeam.crest && <img src={match.awayTeam.crest} alt="" />}
                        <span>{awayName}</span>
                      </div>
                      {awayData.bench.map(p => (
                        <FotMobBenchItem key={p.id} player={p} side="away" />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ============================================================
               SINGLE TEAM DETAILED VIEW (HOME OR AWAY)
               ============================================================ */
            activeSingleData && (
              <>
                <div className={`fm-dual-pitch-card ${activeSingleData.isConfirmed ? 'fm-pitch--confirmed' : 'fm-pitch--probable'}`}>
                  <div className="fm-team-bar fm-team-bar--top">
                    <div className="fm-team-bar__left">
                      {activeSingleTeam.crest && <img src={activeSingleTeam.crest} alt="" className="fm-team-bar__crest" />}
                      <span className="fm-team-bar__name">{activeSingleTeam.shortName || activeSingleTeam.name}</span>
                    </div>
                    <div className="fm-team-bar__right">
                      {activeSingleData.coach && (
                        <span className="fm-team-bar__coach">Pelatih: {activeSingleData.coach}</span>
                      )}
                      <span className="fm-team-bar__formation">{activeSingleData.formation}</span>
                    </div>
                  </div>

                  {/* Single Team Pitch (Attack at top -> GK at bottom) */}
                  <div className="fm-pitch-surface fm-pitch-surface--single">
                    <div className="fm-marking fm-marking--penalty-top" />
                    <div className="fm-marking fm-marking--goal-top" />
                    <div className="fm-marking fm-marking--halfway" />
                    <div className="fm-marking fm-marking--center-circle" />
                    <div className="fm-marking fm-marking--penalty-bottom" />
                    <div className="fm-marking fm-marking--goal-bottom" />

                    <div className="fm-single-rows">
                      {[...activeSingleData.rows].reverse().map((row, rIdx) => (
                        <div key={`single-r-${rIdx}`} className="fm-pitch-row">
                          {row.map(player => (
                            <FotMobPlayerNode key={player.id} player={player} side={activeSingleSide} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bench for Single Team */}
                {activeSingleData.bench?.length > 0 && (
                  <div className="fm-section-card">
                    <div className="fm-section-header">Pemain Cadangan ({activeSingleData.bench.length})</div>
                    <div className="fm-bench-single-list">
                      {activeSingleData.bench.map(p => (
                        <FotMobBenchItem key={p.id} player={p} side={activeSingleSide} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Squad List by Role */}
                <div className="squad-list-container">
                  {Object.entries(activeGroupedSquad).map(([groupName, players]) => {
                    if (players.length === 0) return null;
                    return (
                      <div className="squad-section" key={groupName}>
                        <div className="squad-section__title">{groupName} ({players.length})</div>
                        {players.map(p => (
                          <div className="squad-item" key={p.id}>
                            <div className="squad-item__info">
                              <span className="squad-item__number">{p.shirtNumber ?? '-'}</span>
                              <div>
                                <div className="squad-item__name"><span>{p.name}</span></div>
                                <div className="squad-item__meta">
                                  <span>
                                    {p.nationality || p.position}
                                    {p.dateOfBirth ? ` • ${p.dateOfBirth.substring(0, 4)}` : ''}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LineupModal;
