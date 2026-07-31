import { getH2H } from '../data/h2hData';
import { getTeamMeta, getVenueForMatch } from '../data/teamMeta';
import { MOCK_MATCHES } from '../data/mockMatches';

const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY || '4eda5db232484db3b743c1544bf90b86';
const BASE_URL = '/api/football-data/v4'; // Gunakan proxy Vite untuk menghindari CORS

const mapMatchData = (apiMatch) => {
  const homeMeta = getTeamMeta(apiMatch.homeTeam?.name || 'TBD');
  const awayMeta = getTeamMeta(apiMatch.awayTeam?.name || 'TBD');

  // Group label: group stage comps use "Group X", regular season uses "Matchday N"
  let groupName = 'Regular Season';
  let groupCode = apiMatch.groupCode || null;

  if (apiMatch.group) {
    // e.g. "GROUP_A" → "A"
    groupCode = apiMatch.group.split('_').pop();
    groupName = `Group ${groupCode}`;
  } else if (apiMatch.stage === 'GROUP_STAGE') {
    groupName = 'Group Stage';
  } else if (apiMatch.stage === 'REGULAR_SEASON') {
    const md = apiMatch.matchday;
    groupName = md ? `Matchday ${md}` : 'Regular Season';
  } else if (apiMatch.stage) {
    // Knockout stages: LAST_16, QUARTER_FINALS, etc.
    const stageMap = {
      'LAST_16':        'Babak 16 Besar',
      'QUARTER_FINALS': 'Perempat Final',
      'SEMI_FINALS':    'Semi Final',
      'FINAL':          'Final',
      'THIRD_PLACE':    'Perebutan 3rd',
    };
    groupName = stageMap[apiMatch.stage] || apiMatch.stage.replace(/_/g, ' ');
  }

  let mappedStatus = 'SCHEDULED';
  if (apiMatch.status) {
    if (['IN_PLAY', 'PAUSED'].includes(apiMatch.status)) mappedStatus = 'LIVE';
    else if (apiMatch.status === 'FINISHED') mappedStatus = 'FINISHED';
    else if (['TIMED', 'SCHEDULED'].includes(apiMatch.status)) mappedStatus = 'SCHEDULED';
    else mappedStatus = apiMatch.status;
  }

  return {
    id: apiMatch.id.toString(),
    date: apiMatch.utcDate || new Date().toISOString(),
    group: groupName,
    groupCode: groupCode,
    matchday: apiMatch.matchday || 1,
    venue: apiMatch.venue || getVenueForMatch(apiMatch.id, apiMatch.homeTeam?.name),
    homeTeam: {
      name: apiMatch.homeTeam?.name || 'TBD',
      code: apiMatch.homeTeam?.tla || homeMeta.code,
      flag: apiMatch.homeTeam?.crest || homeMeta.flag,
      crest: apiMatch.homeTeam?.crest || homeMeta.crest,
      att: homeMeta.att,
      def: homeMeta.def
    },
    awayTeam: {
      name: apiMatch.awayTeam?.name || 'TBD',
      code: apiMatch.awayTeam?.tla || awayMeta.code,
      flag: apiMatch.awayTeam?.crest || awayMeta.flag,
      crest: apiMatch.awayTeam?.crest || awayMeta.crest,
      att: awayMeta.att,
      def: awayMeta.def
    },
    status: mappedStatus,
    score: {
      home: apiMatch.score?.fullTime?.home ?? null,
      away: apiMatch.score?.fullTime?.away ?? null
    },
    minute: null
  };
};

export const fetchGroupStageMatches = async (competitionCode = 'WC') => {
  // 1. Check cache first (served as live since it was fetched from API)
  const cached = getCached(competitionCode);
  if (cached) {
    console.log(`[footballApi] Using cached data for ${competitionCode}`);
    return { matches: cached, isLive: true, error: null, fromCache: true };
  }

  if (!API_KEY) {
    if (competitionCode === 'WC') {
      const fallback = MOCK_MATCHES.map(mapMatchData);
      return { matches: fallback, isLive: false, error: 'No API Key provided' };
    }
    return { matches: [], isLive: false, error: 'No API Key provided' };
  }

  try {
    const response = await fetch(`${BASE_URL}/competitions/${competitionCode}/matches`, {
      headers: { 'X-Auth-Token': API_KEY }
    });

    // Handle rate limit — return stale cache (24h) or empty gracefully
    if (response.status === 429) {
      console.warn(`[footballApi] Rate limited for ${competitionCode}. Trying stale cache...`);
      const stale = getStaleCached(competitionCode);
      if (stale) return { matches: stale, isLive: true, error: null, fromCache: true };
      return { matches: [], isLive: false, error: 'Rate limit (429) — tunggu 1 menit lalu refresh' };
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const matches = data.matches.map(mapMatchData);

    // Save to cache + stale cache (stale survives TTL for 429 fallback)
    setCache(competitionCode, matches);
    setCache(`stale_${competitionCode}`, matches);

    return { matches, isLive: true, error: null };
  } catch (error) {
    console.error('Fetch API error:', error);
    // Try stale cache as last resort
    const stale = getCached(`stale_${competitionCode}`);
    if (stale) return { matches: stale, isLive: false, error: error.message + ' (cached)' };
    if (competitionCode === 'WC') {
      const fallback = MOCK_MATCHES.map(mapMatchData);
      return { matches: fallback, isLive: false, error: error.message };
    }
    return { matches: [], isLive: false, error: error.message };
  }
};

export const fetchLeagueStandings = async (competitionCode = 'WC') => {
  if (!API_KEY) return { standings: null, error: 'No API Key' };

  try {
    const response = await fetch(`${BASE_URL}/competitions/${competitionCode}/standings`, {
      headers: { 'X-Auth-Token': API_KEY }
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    return { standings: data.standings, error: null };
  } catch (error) {
    console.error("Error fetching standings:", error);
    return { standings: null, error: error.message };
  }
};

export const fetchLiveMatches = async (competitionCode = null) => {
  if (!API_KEY) return { matches: [], error: 'No API Key' };

  try {
    const response = await fetch(`${BASE_URL}/matches`, {
      headers: { 'X-Auth-Token': API_KEY }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const liveMatches = data.matches.filter(m => {
      const isLive = ['IN_PLAY', 'PAUSED'].includes(m.status);
      return competitionCode ? (isLive && m.competition?.code === competitionCode) : isLive;
    });

    return { matches: liveMatches, error: null };
  } catch (error) {
    console.error("Error fetching live matches:", error);
    return { matches: [], error: error.message };
  }
};

// Mapping prominent national teams to their API IDs
const TEAM_IDS = {
  "Argentina": 762,
  "France": 773,
  "Brazil": 764,
  "England": 66,
  "Spain": 760,
  "Germany": 759,
  "Portugal": 765,
  "Netherlands": 86,
  "Belgium": 769,
  "Uruguay": 758,
  "Croatia": 794,
  "Mexico": 766,
  "USA": 767,
  "Japan": 768,
  "Morocco": 804,
  "Senegal": 805,
  "South Korea": 772,
  "Switzerland": 788,
};

// ── Cache layer ──────────────────────────────────────────────────
const CACHE_VERSION   = 'v3';                  // ← bump ini setiap kali struktur data berubah
const CACHE_TTL_MS    = 60 * 60 * 1000;       // 1 jam (cache utama)
const STALE_CACHE_TTL = 24 * 60 * 60 * 1000;  // 24 jam (stale/fallback)

// Auto-clear cache dari versi lama
const CACHE_PREFIX = `fbd_${CACHE_VERSION}_`;
try {
  Object.keys(localStorage)
    .filter(k => k.startsWith('fbd_') && !k.startsWith(CACHE_PREFIX))
    .forEach(k => localStorage.removeItem(k));
} catch { /* ignore */ }

const getCached = (key, ttl = CACHE_TTL_MS) => {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < ttl) return data;
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  } catch { /* ignore */ }
  return null;
};

const setCache = (key, data) => {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* ignore */ }
};

// Stale cache: 24 jam TTL, used as last-resort on 429/network error
const getStaleCached = (key) => getCached(`stale_${key}`, STALE_CACHE_TTL);


// Cache duration: 24 hours (for team data)
const CACHE_DURATION = 1000 * 60 * 60 * 24;

export const fetchTeamRecentForm = async (teamName) => {
  const teamId = TEAM_IDS[teamName];
  
  if (!teamId) {
    console.log(`No API ID mapped for ${teamName}, using fallback data.`);
    return null;
  }

  const cacheKey = `football_api_team_${teamId}`;
  const cachedData = localStorage.getItem(cacheKey);
  
  if (cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      if (Date.now() - parsed.timestamp < CACHE_DURATION) {
        console.log(`Using cached API data for ${teamName}`);
        return parsed.stats;
      }
    } catch (e) {
      // Ignore cache error and fetch fresh
    }
  }

  try {
    const response = await fetch(`${BASE_URL}/teams/${teamId}/matches?status=FINISHED&limit=10`, {
      headers: {
        'X-Auth-Token': API_KEY,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('API Rate Limit reached. Using fallback data.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Process the last 10 matches to generate attack and defense ratings
    let goalsScored = 0;
    let goalsConceded = 0;
    let wins = 0;
    let totalMatches = data.matches.length;

    if (totalMatches === 0) return null;

    data.matches.forEach(match => {
      const isHome = match.homeTeam.id === teamId;
      const scored = isHome ? match.score.fullTime.home : match.score.fullTime.away;
      const conceded = isHome ? match.score.fullTime.away : match.score.fullTime.home;
      
      goalsScored += (scored || 0);
      goalsConceded += (conceded || 0);
      
      if (scored > conceded) wins++;
    });

    const avgScored = goalsScored / totalMatches; // Typical range: 0.5 - 3.0
    const avgConceded = goalsConceded / totalMatches; // Typical range: 0.5 - 2.5

    // Normalize to a 1-100 scale roughly equivalent to EA Sports FIFA ratings
    // Base 60, + 12 per average goal scored.
    let attackRating = Math.round(Math.min(99, Math.max(50, 60 + (avgScored * 12))));
    
    // Base 95, - 15 per average goal conceded.
    let defenseRating = Math.round(Math.min(99, Math.max(50, 95 - (avgConceded * 15))));

    const stats = {
      att: attackRating,
      def: defenseRating,
      wins: wins,
      matches: totalMatches,
      source: 'live'
    };

    // Save to cache
    localStorage.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      stats
    }));

    console.log(`Fetched fresh API data for ${teamName}:`, stats);
    return stats;

  } catch (error) {
    console.error(`Error fetching data for ${teamName}:`, error);
    return null;
  }
};

// Seeded random number generator
const seededRandom = (seed) => {
  let x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

// Simple string hash
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

export const generateMatchStats = (homeTeam, awayTeam) => {
  const seedHome = hashString(homeTeam.name + "form");
  const seedAway = hashString(awayTeam.name + "form");
  const seedMatch = hashString(homeTeam.name + awayTeam.name + "h2h");

  // 1. Generate Realistic Odds / Win Percentages
  const homeAdvantage = 4;
  const homePower = (homeTeam.att || 70) + (homeTeam.def || 70) + homeAdvantage;
  const awayPower = (awayTeam.att || 70) + (awayTeam.def || 70);
  
  const diff = homePower - awayPower;
  
  // Base probability
  let homeWinProb = 0.38 + (diff * 0.012);
  let awayWinProb = 0.35 - (diff * 0.012);
  
  // Bound probabilities
  homeWinProb = Math.max(0.05, Math.min(0.85, homeWinProb));
  awayWinProb = Math.max(0.05, Math.min(0.85, awayWinProb));
  let drawProb = 1.0 - homeWinProb - awayWinProb;
  
  // If draw probability becomes too low or negative
  if (drawProb < 0.1) {
    drawProb = 0.15 + (seededRandom(seedMatch) * 0.1);
    const remainder = 1.0 - drawProb;
    const ratio = homeWinProb / (homeWinProb + awayWinProb);
    homeWinProb = remainder * ratio;
    awayWinProb = remainder * (1 - ratio);
  }

  // Bookmaker odds conversion with ~5% overround for "real odds" feel
  // e.g. Decimal odds = 1 / (Prob + overround_margin)
  const homeOdds = (1 / (homeWinProb + 0.02)).toFixed(2);
  const drawOdds = (1 / (drawProb + 0.015)).toFixed(2);
  const awayOdds = (1 / (awayWinProb + 0.015)).toFixed(2);

  // 2. Generate Form (Last 5 Matches)
  const outcomes = ['W', 'D', 'L'];
  const generateForm = (seed, power) => {
    let form = [];
    for (let i = 0; i < 5; i++) {
      let rand = seededRandom(seed + i);
      // Higher power = higher chance of W
      let winChance = 0.3 + (power - 140) * 0.01;
      let drawChance = 0.3;
      if (rand < winChance) form.push('W');
      else if (rand < winChance + drawChance) form.push('D');
      else form.push('L');
    }
    return form;
  };

  const homeForm = generateForm(seedHome, homePower - homeAdvantage);
  const awayForm = generateForm(seedAway, awayPower);

  // 3. Get Real Head-to-Head (from local data or API)
  // Instead of generating random fake H2H, we will use real data.
  // We take max 3 matches for UI brevity, but we can return more if available.
  const realH2H = getH2H(homeTeam.name, awayTeam.name);
  const h2h = realH2H.slice(0, 3); // top 3 most recent

  // 4. Over/Under 2.5 Probabilities
  const homeAttack = (homeTeam.att || 70) + homeAdvantage;
  const homeDefense = (homeTeam.def || 70) + homeAdvantage;
  const awayAttack = awayTeam.att || 70;
  const awayDefense = awayTeam.def || 70;

  const expectedHomeGoals = Math.max(0.1, (homeAttack - awayDefense) * 0.1 + 1.4);
  const expectedAwayGoals = Math.max(0.1, (awayAttack - homeDefense) * 0.1 + 1.1);
  const expectedTotalGoals = expectedHomeGoals + expectedAwayGoals;
  
  // Approximate Over 2.5 probability from total xG
  let over25Prob = 0.50 + ((expectedTotalGoals - 2.5) * 0.18);
  over25Prob = Math.max(0.15, Math.min(0.85, over25Prob)); // Bound between 15% and 85%
  const under25Prob = 1.0 - over25Prob;

  return {
    percentages: {
      home: Math.round(homeWinProb * 100),
      draw: Math.round(drawProb * 100),
      away: Math.round(awayWinProb * 100)
    },
    odds: {
      home: homeOdds,
      draw: drawOdds,
      away: awayOdds
    },
    form: {
      home: homeForm,
      away: awayForm
    },
    h2h: h2h,
    overUnder: {
      over25: Math.round(over25Prob * 100),
      under25: Math.round(under25Prob * 100)
    }
  };
};
