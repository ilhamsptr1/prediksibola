import React, { useState, useEffect, useCallback } from 'react';
import './LiveMatchBanner.css';

let userApiKey = import.meta.env.VITE_FOOTBALL_API_KEY;
const FALLBACK_KEY = '4eda5db232484db3b743c1544bf90b86';
let API_KEY = (!userApiKey || userApiKey.trim().length < 10) ? FALLBACK_KEY : userApiKey.trim();
const isNative = window.Capacitor?.isNativePlatform();
const BASE_URL = isNative ? 'https://api.football-data.org/v4' : '/api/football-data/v4';

// Hanya 2 request global (bukan 12 per-liga) → tidak kena rate limit
const BANNER_CACHE_KEY = 'banner_cache_v1';
const BANNER_CACHE_TTL = 5 * 60 * 1000; // 5 menit

const getBannerCache = () => {
  try {
    const raw = localStorage.getItem(BANNER_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < BANNER_CACHE_TTL) return data;
  } catch (_) {}
  return null;
};

const setBannerCache = (data) => {
  try { localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
};

const mapMatch = (m, status) => ({
  id:          m.id,
  homeTeam:    m.homeTeam?.shortName || m.homeTeam?.name || '?',
  awayTeam:    m.awayTeam?.shortName || m.awayTeam?.name || '?',
  homeCrest:   m.homeTeam?.crest,
  awayCrest:   m.awayTeam?.crest,
  homeScore:   m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
  awayScore:   m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
  minute:      m.minute || null,
  competition: m.competition?.name || '',
  kickoff:     new Date(m.utcDate).toLocaleString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }),
  status,
});

const LiveMatchBanner = () => {
  const [items,     setItems]     = useState([]);
  const [mode,      setMode]      = useState('loading');
  const [lastFetch, setLastFetch] = useState(null);

  const fetchMatches = useCallback(async () => {
    // 1. Coba dari cache dulu
    const cached = getBannerCache();
    if (cached) {
      setItems(cached.items);
      setMode(cached.mode);
      setLastFetch(new Date(cached.ts));
      return;
    }

    try {
      // 2. SATU request global untuk semua liga live sekaligus
      const liveRes = await fetch(`${BASE_URL}/matches?status=LIVE`, {
        headers: { 'X-Auth-Token': API_KEY },
      });

      if (!liveRes.ok && liveRes.status === 400 && API_KEY !== FALLBACK_KEY) {
        API_KEY = FALLBACK_KEY;
        return fetchMatches();
      }

      if (liveRes.ok) {
        const liveData = await liveRes.json();
        const liveMatches = (liveData.matches || []).map(m => mapMatch(m, 'LIVE'));

        if (liveMatches.length > 0) {
          setItems(liveMatches);
          setMode('live');
          setBannerCache({ items: liveMatches, mode: 'live', ts: Date.now() });
          setLastFetch(new Date());
          return;
        }
      }

      // 3. Tidak ada live → SATU request global upcoming 7 hari ke depan
      const now     = new Date();
      const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const dateFrom = now.toISOString().split('T')[0];
      const dateTo   = in7days.toISOString().split('T')[0];

      const upRes = await fetch(
        `${BASE_URL}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`,
        { headers: { 'X-Auth-Token': API_KEY } }
      );

      if (upRes.ok) {
        const upData = await upRes.json();
        const upcoming = (upData.matches || [])
          .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
          .slice(0, 24)
          .map(m => mapMatch(m, 'UPCOMING'));

        setItems(upcoming);
        setMode(upcoming.length > 0 ? 'upcoming' : 'loading');
        setBannerCache({ items: upcoming, mode: upcoming.length > 0 ? 'upcoming' : 'loading', ts: Date.now() });
      }

      setLastFetch(new Date());
    } catch (e) {
      console.warn('[LiveBanner] fetch error', e);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
    const timer = setInterval(fetchMatches, 5 * 60 * 1000); // refresh setiap 5 menit
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
