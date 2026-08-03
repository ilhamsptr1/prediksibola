import React, { useState, useEffect, useCallback } from 'react';
import './LineupModal.css';

const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY || '4eda5db232484db3b743c1544bf90b86';
// Gunakan proxy Vite (/api/football-data) agar tidak kena CORS blocking
const API_BASE = '/api/football-data';

const formatName = (name) => {
  if (!name) return '';
  const parts = name.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
};

// Cache agar tidak request ulang saat switch tab bolak-balik
const squadCache = {};

const fetchSquadById = async (id) => {
  if (!id) return [];
  if (squadCache[id]) return squadCache[id];

  // Coba max 2x dengan delay jika kena 429
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API_BASE}/v4/teams/${id}`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    if (res.status === 429) {
      // Tunggu 6 detik lalu retry
      await new Promise(r => setTimeout(r, 6000));
      continue;
    }
    if (!res.ok) return [];
    const data = await res.json();
    const squad = data.squad || [];
    if (squad.length > 0) squadCache[id] = squad;
    return squad;
  }
  return [];
};

const generatePredictedLineup = (squad) => {
  const gks  = squad.filter(p => p.position === 'Goalkeeper');
  const defs = squad.filter(p => ['Defence', 'Defender', 'Defender'].includes(p.position) || p.position?.includes('efenc') || p.position?.includes('ack'));
  const mids = squad.filter(p => p.position?.includes('idfield') || p.position === 'Midfield');
  const atts = squad.filter(p => p.position?.includes('ffence') || p.position?.includes('ttack') || p.position === 'Forward');

  // Pastikan ada minimal 11 pemain dengan fallback dari posisi yang tersedia
  const all = squad.filter(p => !gks.includes(p));
  const fillDefs = defs.length >= 4 ? defs : [...defs, ...all.filter(p => !defs.includes(p))];
  const fillMids = mids.length >= 3 ? mids : [...mids, ...all.filter(p => !fillDefs.slice(0,4).includes(p) && !mids.includes(p))];
  const fillAtts = atts.length >= 3 ? atts : [...atts, ...all.filter(p => !fillDefs.slice(0,4).includes(p) && !fillMids.slice(0,3).includes(p) && !atts.includes(p))];

  return {
    gk:  gks.slice(0, 1),
    def: fillDefs.slice(0, 4),
    mid: fillMids.slice(0, 3),
    att: fillAtts.slice(0, 3),
  };
};

const groupSquad = (squad) => {
  const groups = { Kiper: [], Bek: [], Gelandang: [], Penyerang: [] };
  squad.forEach(p => {
    if (p.position?.includes('oalkeeper') || p.position === 'Goalkeeper') groups.Kiper.push(p);
    else if (p.position?.includes('efenc') || p.position?.includes('ack') || p.position === 'Defence') groups.Bek.push(p);
    else if (p.position?.includes('idfield') || p.position === 'Midfield') groups.Gelandang.push(p);
    else groups.Penyerang.push(p);
  });
  return groups;
};

const LineupModal = ({ match, onClose }) => {
  const [activeTab, setActiveTab] = useState('HOME');
  // Simpan squad per tim ID
  const [squads, setSquads]     = useState({ home: null, away: null }); // null = belum load, [] = kosong
  const [loading, setLoading]   = useState(false);

  // Tidak mengunci scroll background agar user masih bisa scroll halaman
  // saat modal skuad sedang terbuka.

  const loadSquad = useCallback(async (tab) => {
    const isHome = tab === 'HOME';
    const key = isHome ? 'home' : 'away';
    const team = isHome ? match.homeTeam : match.awayTeam;

    // Sudah pernah di-load, skip
    if (squads[key] !== null) return;

    setLoading(true);
    const squad = await fetchSquadById(team.id);
    setSquads(prev => ({ ...prev, [key]: squad }));
    setLoading(false);
  }, [match, squads]);

  // Load home squad on first open
  useEffect(() => {
    loadSquad('HOME');
  }, [match]);

  // Load away squad ketika user switch ke tab AWAY
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    loadSquad(tab);
  };

  const currentSquad = activeTab === 'HOME' ? (squads.home ?? []) : (squads.away ?? []);
  const currentLineup = currentSquad.length > 0 ? generatePredictedLineup(currentSquad) : null;
  const grouped = groupSquad(currentSquad);
  const isLoading = loading || (activeTab === 'HOME' ? squads.home === null : squads.away === null);

  const renderPlayerNode = (player, teamType) => {
    if (!player) return null;
    const isGK = player.position?.includes('oalkeeper');
    const jerseyClass = isGK ? 'jersey-gk' : teamType === 'HOME' ? 'jersey-home' : 'jersey-away';
    const num = player.id ? (player.id % 99) + 1 : '?';
    return (
      <div key={player.id} className="pitch-player">
        <div className={`player-jersey ${jerseyClass}`}>{num}</div>
        <div className="player-name">{formatName(player.name)}</div>
      </div>
    );
  };

  return (
    <div className="lineup-overlay" onClick={onClose}>
      <div className="lineup-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="lineup-modal__header">
          <div className="lineup-modal__title">
            <span>Skuad &amp; Prediksi Formasi</span>
            <span className="lineup-modal__subtitle">
              {match.homeTeam.shortName || match.homeTeam.name} vs {match.awayTeam.shortName || match.awayTeam.name}
            </span>
          </div>
          <button className="lineup-modal__close" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="lineup-tabs">
          <button className={`lineup-tab ${activeTab === 'HOME' ? 'active' : ''}`} onClick={() => handleTabSwitch('HOME')}>
            {match.homeTeam.crest && <img src={match.homeTeam.crest} className="lineup-tab__crest" alt="" />}
            {match.homeTeam.shortName || match.homeTeam.name}
          </button>
          <button className={`lineup-tab ${activeTab === 'AWAY' ? 'active' : ''}`} onClick={() => handleTabSwitch('AWAY')}>
            {match.awayTeam.crest && <img src={match.awayTeam.crest} className="lineup-tab__crest" alt="" />}
            {match.awayTeam.shortName || match.awayTeam.name}
          </button>
        </div>

        {/* Body */}
        <div className="lineup-modal__body">
          {isLoading ? (
            <div className="lineup-loading">
              <div className="lineup-spinner"></div>
              Mengambil data skuad...
            </div>
          ) : currentSquad.length === 0 ? (
            <div className="lineup-error">
              <span style={{ fontSize: '2.5rem' }}>⚽</span>
              <span style={{ fontWeight: 700, marginTop: '0.5rem' }}>Data skuad tidak tersedia</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.5, textAlign: 'center', lineHeight: 1.5 }}>
                Tim ini tidak memiliki data skuad di database.<br />
                Coba lihat tim dari liga-liga Eropa (PL, La Liga, Serie A, dll).
              </span>
            </div>
          ) : (
            <>
              {/* Formasi label */}
              <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', padding: '0.4rem 0 0', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Prediksi Formasi 4-3-3
              </div>

              {/* Pitch */}
              <div className="pitch-container">
                <div className="pitch-line pitch-halfway" />
                <div className="pitch-line pitch-circle" />
                <div className="pitch-line pitch-penalty-top" />
                <div className="pitch-line pitch-goal-top" />
                <div className="pitch-line pitch-penalty-bottom" />
                <div className="pitch-line pitch-goal-bottom" />

                <div className="pitch-players">
                  <div className="pitch-row">{(currentLineup?.att || []).map(p => renderPlayerNode(p, activeTab))}</div>
                  <div className="pitch-row">{(currentLineup?.mid || []).map(p => renderPlayerNode(p, activeTab))}</div>
                  <div className="pitch-row">{(currentLineup?.def || []).map(p => renderPlayerNode(p, activeTab))}</div>
                  <div className="pitch-row">{(currentLineup?.gk  || []).map(p => renderPlayerNode(p, activeTab))}</div>
                </div>
              </div>

              {/* Squad List */}
              <div className="squad-list-container">
                {Object.entries(grouped).map(([groupName, players]) => {
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
                              <div className="squad-item__meta">
                                {p.nationality} {p.dateOfBirth ? `• Lhr: ${p.dateOfBirth.substring(0, 4)}` : ''}
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
          )}
        </div>
      </div>
    </div>
  );
};

export default LineupModal;
