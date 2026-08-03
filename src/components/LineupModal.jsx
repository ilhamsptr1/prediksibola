import React, { useState, useEffect } from 'react';
import './LineupModal.css';

const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY || '4eda5db232484db3b743c1544bf90b86';

const formatName = (name) => {
  if (!name) return '';
  const parts = name.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
};

const getInitials = (name) => {
  if (!name) return '?';
  const p = name.split(' ');
  return p.length > 1 ? p[0][0] + p[p.length-1][0] : name.substring(0, 2);
};

const LineupModal = ({ match, onClose }) => {
  const [activeTab, setActiveTab] = useState('HOME');
  const [loading, setLoading] = useState(true);
  const [homeSquad, setHomeSquad] = useState([]);
  const [awaySquad, setAwaySquad] = useState([]);
  
  const [homeLineup, setHomeLineup] = useState(null);
  const [awayLineup, setAwayLineup] = useState(null);

  useEffect(() => {
    // Prevent body scroll when modal open
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const fetchSquads = async () => {
      setLoading(true);
      try {
        const homeId = match.homeTeam.id;
        const awayId = match.awayTeam.id;

        const [resHome, resAway] = await Promise.all([
          fetch(`/api/football-data/v4/teams/${homeId}`, { headers: { 'X-Auth-Token': API_KEY } }),
          fetch(`/api/football-data/v4/teams/${awayId}`, { headers: { 'X-Auth-Token': API_KEY } })
        ]);

        let homeData = { squad: [] }, awayData = { squad: [] };
        if (resHome.ok) homeData = await resHome.json();
        if (resAway.ok) awayData = await resAway.json();

        setHomeSquad(homeData.squad || []);
        setAwaySquad(awayData.squad || []);

        setHomeLineup(generatePredictedLineup(homeData.squad || []));
        setAwayLineup(generatePredictedLineup(awayData.squad || []));
      } catch (err) {
        console.error('Failed to fetch squads:', err);
      } finally {
        setLoading(false);
      }
    };

    if (match) fetchSquads();
  }, [match]);

  // AI Formator: 4-3-3 Simulator
  const generatePredictedLineup = (squad) => {
    const gks = squad.filter(p => p.position === 'Goalkeeper');
    const defs = squad.filter(p => p.position === 'Defence' || p.position === 'Defender');
    const mids = squad.filter(p => p.position === 'Midfield' || p.position === 'Midfielder');
    const atts = squad.filter(p => p.position === 'Offence' || p.position === 'Attacker');

    return {
      gk:  gks.slice(0, 1),
      def: defs.slice(0, 4),
      mid: mids.slice(0, 3),
      att: atts.slice(0, 3)
    };
  };

  const currentSquad = activeTab === 'HOME' ? homeSquad : awaySquad;
  const currentCrest = activeTab === 'HOME' ? match.homeTeam.crest : match.awayTeam.crest;
  const currentTeamName = activeTab === 'HOME' ? (match.homeTeam.shortName || match.homeTeam.name) : (match.awayTeam.shortName || match.awayTeam.name);

  const groupSquad = (squad) => {
    const groups = { Goalkeepers: [], Defenders: [], Midfielders: [], Attackers: [], Others: [] };
    squad.forEach(p => {
      if (p.position?.includes('Goalkeeper')) groups.Goalkeepers.push(p);
      else if (p.position?.includes('Defen')) groups.Defenders.push(p);
      else if (p.position?.includes('Midfield')) groups.Midfielders.push(p);
      else if (p.position?.includes('Offen') || p.position?.includes('Attack')) groups.Attackers.push(p);
      else groups.Others.push(p);
    });
    return groups;
  };

  const renderPlayerNode = (player, teamType) => {
    if (!player) return <div className="pitch-player empty"></div>;
    const isGK = player.position?.includes('Goalkeeper');
    const jerseyClass = isGK ? 'jersey-gk' : teamType === 'HOME' ? 'jersey-home' : 'jersey-away';
    
    // We mock jersey number from ID just for UI flavor
    const num = player.id ? (player.id % 99) + 1 : '?';

    return (
      <div key={player.id || Math.random()} className="pitch-player">
        <div className={`player-jersey ${jerseyClass}`}>{num}</div>
        <div className="player-name">{formatName(player.name)}</div>
      </div>
    );
  };

  return (
    <div className="lineup-overlay" onClick={onClose}>
      <div className="lineup-modal" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="lineup-modal__header">
          <div className="lineup-modal__title">
            <span>Susunan Pemain (Prediksi)</span>
            <span className="lineup-modal__subtitle">
              {match.homeTeam.shortName || match.homeTeam.name} vs {match.awayTeam.shortName || match.awayTeam.name}
            </span>
          </div>
          <button className="lineup-modal__close" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className="lineup-modal__body">
          {loading ? (
            <div className="lineup-loading">
              <div className="lineup-spinner"></div>
              Sedang mengambil data skuad...
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="lineup-tabs">
                <button 
                  className={`lineup-tab ${activeTab === 'HOME' ? 'active' : ''}`}
                  onClick={() => setActiveTab('HOME')}
                >
                  <img src={match.homeTeam.crest} className="lineup-tab__crest" alt="" />
                  {match.homeTeam.shortName || match.homeTeam.name}
                </button>
                <button 
                  className={`lineup-tab ${activeTab === 'AWAY' ? 'active' : ''}`}
                  onClick={() => setActiveTab('AWAY')}
                >
                  <img src={match.awayTeam.crest} className="lineup-tab__crest" alt="" />
                  {match.awayTeam.shortName || match.awayTeam.name}
                </button>
              </div>

              {/* Pitch */}
              {activeTab === 'HOME' && homeLineup && (
                <div className="pitch-container">
                  <div className="pitch-line pitch-halfway" />
                  <div className="pitch-line pitch-circle" />
                  <div className="pitch-line pitch-penalty-top" />
                  <div className="pitch-line pitch-goal-top" />
                  <div className="pitch-line pitch-penalty-bottom" />
                  <div className="pitch-line pitch-goal-bottom" />

                  <div className="pitch-players">
                    {/* Only showing HOME team on home tab (full pitch) for better visibility like fotmob */}
                    <div className="pitch-row">{homeLineup.att.map(p => renderPlayerNode(p, 'HOME'))}</div>
                    <div className="pitch-row">{homeLineup.mid.map(p => renderPlayerNode(p, 'HOME'))}</div>
                    <div className="pitch-row">{homeLineup.def.map(p => renderPlayerNode(p, 'HOME'))}</div>
                    <div className="pitch-row">{homeLineup.gk.map(p => renderPlayerNode(p, 'HOME'))}</div>
                  </div>
                </div>
              )}

              {activeTab === 'AWAY' && awayLineup && (
                <div className="pitch-container">
                  <div className="pitch-line pitch-halfway" />
                  <div className="pitch-line pitch-circle" />
                  <div className="pitch-line pitch-penalty-top" />
                  <div className="pitch-line pitch-goal-top" />
                  <div className="pitch-line pitch-penalty-bottom" />
                  <div className="pitch-line pitch-goal-bottom" />

                  <div className="pitch-players">
                    <div className="pitch-row">{awayLineup.gk.map(p => renderPlayerNode(p, 'AWAY'))}</div>
                    <div className="pitch-row">{awayLineup.def.map(p => renderPlayerNode(p, 'AWAY'))}</div>
                    <div className="pitch-row">{awayLineup.mid.map(p => renderPlayerNode(p, 'AWAY'))}</div>
                    <div className="pitch-row">{awayLineup.att.map(p => renderPlayerNode(p, 'AWAY'))}</div>
                  </div>
                </div>
              )}

              {/* Squad List */}
              <div className="squad-list-container">
                {Object.entries(groupSquad(currentSquad)).map(([groupName, players]) => {
                  if (players.length === 0) return null;
                  return (
                    <div className="squad-section" key={groupName}>
                      <div className="squad-section__title">{groupName}</div>
                      {players.map(p => (
                        <div className="squad-item" key={p.id}>
                          <div className="squad-item__info">
                            <span className="squad-item__number">{(p.id % 99) + 1}</span>
                            <div>
                              <div className="squad-item__name">{p.name}</div>
                              <div className="squad-item__meta">{p.nationality} • Lhr: {p.dateOfBirth?.substring(0,4)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LineupModal;
