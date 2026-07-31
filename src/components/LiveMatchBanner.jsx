import React, { useState, useEffect, useCallback } from 'react';
import './LiveMatchBanner.css';

const API_KEY  = import.meta.env.VITE_FOOTBALL_API_KEY || '4eda5db232484db3b743c1544bf90b86';
const BASE_URL = '/api/football-data/v4';
const COMPETITIONS = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'PPL'];

const LiveMatchBanner = () => {
  const [items,     setItems]     = useState([]);
  const [mode,      setMode]      = useState('loading'); // 'loading' | 'live' | 'upcoming'
  const [lastFetch, setLastFetch] = useState(null);

  const fetchMatches = useCallback(async () => {
    try {
      // Fetch semua liga sekaligus
      const results = await Promise.allSettled(
        COMPETITIONS.map(code =>
          fetch(`${BASE_URL}/competitions/${code}/matches?status=LIVE`, {
            headers: { 'X-Auth-Token': API_KEY },
          }).then(r => r.ok ? r.json() : { matches: [] })
        )
      );

      const liveMatches = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value.matches || [])
        .map(m => ({
          id:          m.id,
          homeTeam:    m.homeTeam?.shortName || m.homeTeam?.name || '?',
          awayTeam:    m.awayTeam?.shortName || m.awayTeam?.name || '?',
          homeCrest:   m.homeTeam?.crest,
          awayCrest:   m.awayTeam?.crest,
          homeScore:   m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
          awayScore:   m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
          minute:      m.minute || null,
          competition: m.competition?.name || '',
          status:      'LIVE',
        }));

      if (liveMatches.length > 0) {
        setItems(liveMatches);
        setMode('live');
      } else {
        // Tidak ada live → ambil jadwal upcoming (status=SCHEDULED) 7 hari ke depan
        const upcomingResults = await Promise.allSettled(
          COMPETITIONS.map(code =>
            fetch(`${BASE_URL}/competitions/${code}/matches?status=SCHEDULED`, {
              headers: { 'X-Auth-Token': API_KEY },
            }).then(r => r.ok ? r.json() : { matches: [] })
          )
        );

        const now = Date.now();
        const in7days = now + 7 * 24 * 60 * 60 * 1000;
        const upcoming = upcomingResults
          .filter(r => r.status === 'fulfilled')
          .flatMap(r => r.value.matches || [])
          .filter(m => {
            const t = new Date(m.utcDate).getTime();
            return t >= now && t <= in7days;
          })
          .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
          .slice(0, 20)
          .map(m => ({
            id:          m.id,
            homeTeam:    m.homeTeam?.shortName || m.homeTeam?.name || '?',
            awayTeam:    m.awayTeam?.shortName || m.awayTeam?.name || '?',
            homeCrest:   m.homeTeam?.crest,
            awayCrest:   m.awayTeam?.crest,
            homeScore:   null,
            awayScore:   null,
            minute:      null,
            competition: m.competition?.name || '',
            kickoff:     new Date(m.utcDate).toLocaleString('id-ID', {
              weekday: 'short', day: 'numeric', month: 'short',
              hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
            }),
            status: 'UPCOMING',
          }));

        setItems(upcoming);
        setMode(upcoming.length > 0 ? 'upcoming' : 'live');
      }

      setLastFetch(new Date());
    } catch (e) {
      console.warn('[LiveBanner] fetch error', e);
      setMode('upcoming');
    }
  }, []);

  useEffect(() => {
    fetchMatches();
    const timer = setInterval(fetchMatches, 60_000); // refresh 60s
    return () => clearInterval(timer);
  }, [fetchMatches]);

  return (
    <div className={`live-banner live-banner--${mode}`} aria-label="Ticker pertandingan">
      <div className="live-banner__label">
        {mode === 'live' ? (
          <><span className="live-banner__dot" />LIVE</>
        ) : mode === 'upcoming' ? (
          <><span className="live-banner__dot live-banner__dot--upcoming" />UPCOMING</>
        ) : (
          <><span className="live-banner__dot live-banner__dot--loading" />LIVE</>
        )}
      </div>

      {mode === 'loading' ? (
        <div className="live-banner__loading">Memuat data…</div>
      ) : items.length === 0 ? (
        <div className="live-banner__loading">Tidak ada pertandingan tersedia</div>
      ) : (
        <div className="live-banner__track">
          <div className="live-banner__scroll">
            {[...items, ...items].map((m, i) => (
              <LiveMatchChip key={`${m.id}-${i}`} match={m} />
            ))}
          </div>
        </div>
      )}

      {lastFetch && (
        <div className="live-banner__updated">
          ⟳ {lastFetch.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
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
  const homeWin    = match.homeScore !== null && match.homeScore > match.awayScore;
  const awayWin    = match.awayScore !== null && match.awayScore > match.homeScore;
  const isUpcoming = match.status === 'UPCOMING';

  return (
    <div className={`live-chip ${isUpcoming ? 'live-chip--upcoming' : ''}`}>
      {/* Kompetisi */}
      <span className="chip__comp">{match.competition}</span>

      {/* Home */}
      <div className={`chip__team ${homeWin ? 'chip__team--winning' : ''}`}>
        <TeamCrest src={match.homeCrest} name={match.homeTeam} />
        <span className="chip__name">{match.homeTeam}</span>
      </div>

      {/* Skor / VS / Kickoff */}
      {isUpcoming ? (
        <div className="chip__kickoff">
          <span className="chip__vs">VS</span>
          <span className="chip__time">{match.kickoff}</span>
        </div>
      ) : (
        <div className="chip__score-block">
          <span className={`chip__score ${homeWin ? 'chip__score--home' : awayWin ? 'chip__score--away' : ''}`}>
            {match.homeScore ?? '–'}
          </span>
          <span className="chip__divider">:</span>
          <span className={`chip__score ${awayWin ? 'chip__score--away' : homeWin ? 'chip__score--home' : ''}`}>
            {match.awayScore ?? '–'}
          </span>
        </div>
      )}

      {/* Menit (hanya saat live) */}
      {match.minute && !isUpcoming && (
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
