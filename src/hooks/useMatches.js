import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchGroupStageMatches, fetchLiveMatches } from '../services/footballApi';

const REFRESH_INTERVAL_LIVE     = 30_000;   // 30 s when live matches are on
const REFRESH_INTERVAL_DEFAULT  = 5 * 60_000; // 5 min otherwise

export function useMatches() {
  const [matches,    setMatches]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [isLive,     setIsLive]     = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error,      setError]      = useState(null);
  const [hasLiveNow, setHasLiveNow] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { matches: data, isLive: live, error: err } = await fetchGroupStageMatches();

      // Merge live scores into existing matches if we got live data
      setMatches(data);
      setIsLive(live);
      setLastUpdated(new Date());
      if (err) setError(err);

      // Check if any match is currently in play
      const liveNow = data.some(m => m.status === 'LIVE');
      setHasLiveNow(liveNow);

      // Schedule next refresh based on whether games are live
      const interval = liveNow ? REFRESH_INTERVAL_LIVE : REFRESH_INTERVAL_DEFAULT;
      timerRef.current = setTimeout(() => load(), interval);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [load]);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);
    load();
  }, [load]);

  return { matches, loading, isLive, lastUpdated, error, hasLiveNow, refresh };
}
