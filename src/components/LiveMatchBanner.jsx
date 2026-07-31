import React, { useState, useEffect, useCallback } from 'react';
import './LiveMatchBanner.css';

/**
 * LiveMatchBanner — Strip horizontal di atas dashboard
 * menampilkan semua match LIVE dengan skor real-time
 * Auto-refresh setiap 30 detik via football-data.org
 */

const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY || '4eda5db232484db3b743c1544bf90b86';
const BASE_URL = '/api/football-data/v4';

const COMPETITIONS = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'PPL'];

const LiveMatchBanner = () => {
  const [liveMatches, setLiveMatches] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [lastFetch, setLastFetch]     = useState(null);

  const fetchLive = useCallback(async () => {
    try {
      // Fetch semua liga sekaligus dengan Promise.allSettled
      const results = await Promise.allSettled(
        COMPETITIONS.map(code =>
          fetch(`${BASE_URL}/competitions/${code}/matches?status=LIVE`, {
            headers: { 'X-Auth-Token': API_KEY },
          }).then(r => r.ok ? r.json() : { matches: [] })
        )
      );

      const allLive = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value.matches || [])
        .map(m => ({
          id:         m.id,
          homeTeam:   m.homeTeam?.shortName || m.homeTeam?.name || '?',
          awayTeam:   m.awayTeam?.shortName || m.awayTeam?.name || '?',
          homeCrest:  m.homeTeam?.crest,
          awayCrest:  m.awayTeam?.crest,
          homeScore:  m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
          awayScore:  m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
          minute:     m.minute || null,
          competition: m.competition?.name || '',
          status:     m.status,
        }));

      setLiveMatches(allLive);
      setLastFetch(new Date());
    } catch (e) {
      console.warn('[LiveBanner] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const timer = setInterval(fetchLive, 30_000); // refresh 30s
    return () => clearInterval(timer);
  }, [fetchLive]);

  // Tidak render kalau tidak ada match live
  if (!loading && liveMatches.length === 0) return null;

  return (
    <div className="live-banner" role="marquee" aria-label="Pertandingan Live">
      <div className="live-banner__label">
        <span className="live-banner__dot" />
        LIVE
      </div>

      {loading ? (
        <div className="live-banner__loading">Memuat data live…</div>
      ) : (
        <div className="live-banner__track">
          <div className="live-banner__scroll">
            {/* Duplikat untuk seamless loop */}
            {[...liveMatches, ...liveMatches].map((m, i) => (
              <LiveMatchChip key={`${m.id}-${i}`} match={m} />
            ))}
          </div>
        </div>
      )}

      {lastFetch && (
        <div className="live-banner__updated">
          ⟳ {lastFetch.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}
    </div>
  );
};

const TeamCrest = ({ src, name }) => {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} alt={name} className="chip__crest" onError={() => setErr(true)} />;
  }
  return <span className="chip__initial">{name?.[0] || '?'}</span>;
};

const LiveMatchChip = ({ match }) => {
  const homeWin = match.homeScore !== null && match.homeScore > match.awayScore;
  const awayWin = match.awayScore !== null && match.awayScore > match.homeScore;

  return (
    <div className="live-chip">
      {/* Kompetisi */}
      <span className="chip__comp">{match.competition}</span>

      {/* Home */}
      <div className={`chip__team ${homeWin ? 'chip__team--winning' : ''}`}>
        <TeamCrest src={match.homeCrest} name={match.homeTeam} />
        <span className="chip__name">{match.homeTeam}</span>
      </div>

      {/* Skor */}
      <div className="chip__score-block">
        <span className={`chip__score ${homeWin ? 'chip__score--home' : awayWin ? 'chip__score--away' : ''}`}>
          {match.homeScore ?? '–'}
        </span>
        <span className="chip__divider">:</span>
        <span className={`chip__score ${awayWin ? 'chip__score--away' : homeWin ? 'chip__score--home' : ''}`}>
          {match.awayScore ?? '–'}
        </span>
      </div>

      {/* Menit */}
      {match.minute && (
        <div className="chip__minute">
          <span className="chip__minute-dot" />
          {match.minute}'
        </div>
      )}

      {/* Away */}
      <div className={`chip__team ${awayWin ? 'chip__team--winning' : ''}`}>
        <span className="chip__name">{match.awayTeam}</span>
        <TeamCrest src={match.awayCrest} name={match.awayTeam} />
      </div>
    </div>
  );
};

export default LiveMatchBanner;
