import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './LiveTicker.css';

const FALLBACK_KEY = '4eda5db232484db3b743c1544bf90b86';
const isNative = window.Capacitor?.isNativePlatform();
const BASE_URL = isNative ? 'https://api.football-data.org/v4' : '/api/football-data/v4';
let tickerApiKey = (() => {
  const k = import.meta.env.VITE_FOOTBALL_API_KEY;
  return (!k || k.trim().length < 10) ? FALLBACK_KEY : k.trim();
})();

const TeamCrest = ({ crest, name }) => {
  const [err, setErr] = useState(false);
  if (crest && !err) {
    return <img src={crest} alt={name} className="ticker-crest" onError={() => setErr(true)} />;
  }
  return <span className="ticker-flag">⚽</span>;
};

const TickerItem = ({ match, onClick }) => {
  const isLive = match.status === 'LIVE' || ['IN_PLAY','PAUSED'].includes(match.status);
  const hs = match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? '-';
  const as = match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? '-';
  const minute = match.minute || '';

  return (
    <div className={`ticker-item${isLive ? ' ticker-item--live' : ''}`} onClick={onClick}>
      {isLive && <span className="ticker-live-dot" />}
      <TeamCrest crest={match.homeTeam?.crest} name={match.homeTeam?.name} />
      <span className="ticker-team">{match.homeTeam?.shortName || match.homeTeam?.name}</span>
      <span className="ticker-score">
        {isLive ? (
          <><span className="ticker-score-live">{hs} – {as}</span>{minute && <span className="ticker-min">{minute}&apos;</span>}</>
        ) : (
          <span className="ticker-score-ft">{hs} – {as}</span>
        )}
      </span>
      <span className="ticker-team">{match.awayTeam?.shortName || match.awayTeam?.name}</span>
      <TeamCrest crest={match.awayTeam?.crest} name={match.awayTeam?.name} />
      <span className="ticker-divider">|</span>
    </div>
  );
};

const LiveTicker = () => {
  const [liveMatches, setLiveMatches] = useState([]);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const trackRef = useRef(null);

  const fetchLive = useCallback(async () => {
    try {
      let res = await fetch(`${BASE_URL}/matches?status=IN_PLAY`, {
        headers: { 'X-Auth-Token': tickerApiKey }
      });
      if (res.status === 400 && tickerApiKey !== FALLBACK_KEY) {
        tickerApiKey = FALLBACK_KEY;
        res = await fetch(`${BASE_URL}/matches?status=IN_PLAY`, {
          headers: { 'X-Auth-Token': tickerApiKey }
        });
      }
      if (!res.ok) return;
      const data = await res.json();
      const matches = (data.matches || []).slice(0, 20);
      setLiveMatches(matches);
      setVisible(matches.length > 0);
    } catch {
      // silent fail — ticker is non-critical
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, 30_000);
    return () => clearInterval(id);
  }, [fetchLive]);

  if (!visible || liveMatches.length === 0) return null;

  // Duplicate items for seamless infinite scroll
  const items = [...liveMatches, ...liveMatches];

  return (
    <div className="live-ticker-bar">
      <div className="ticker-label">
        <span className="ticker-label-dot" />
        <span>LIVE</span>
      </div>
      <div className="ticker-track-wrapper">
        <div
          className="ticker-track"
          ref={trackRef}
          style={{ '--item-count': liveMatches.length }}
        >
          {items.map((match, i) => (
            <TickerItem
              key={`${match.id}-${i}`}
              match={match}
              onClick={() => navigate(`/match/${match.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveTicker;
