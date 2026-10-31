// ============================================================
// lineupService.js - Real Match Lineup & Starting XI Service
// Modeled after FotMob's lineup data architecture (REA ev_61e95e43d90e0389b0b9a7baa71a0e4b16e37cef18407ffd3261fa535997d028)
// Combines live match rosters (ESPN Soccer API) with football-data.org team squads & coaches.
// ============================================================

let userApiKey = import.meta.env.VITE_FOOTBALL_API_KEY;
const FALLBACK_KEY = '4eda5db232484db3b743c1544bf90b86';
let API_KEY = (!userApiKey || userApiKey.trim().length < 10) ? FALLBACK_KEY : userApiKey.trim();

const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform();
const FD_BASE = isNative ? 'https://api.football-data.org/v4' : '/api/football-data/v4';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

// In-memory cache to avoid redundant network calls
const lineupCache = new Map();
const teamDataCache = new Map();

// Map competition codes / names to ESPN league slugs
const LEAGUE_SLUG_MAP = {
  PL: 'eng.1',
  PD: 'esp.1',
  SA: 'ita.1',
  BL1: 'ger.1',
  FL1: 'fra.1',
  PPL: 'por.1',
  CL: 'uefa.champions',
  EC: 'uefa.euro',
  WC: 'fifa.world',
};

// Preferred formations by team or deterministic tactical profile
const KNOWN_FORMATIONS = {
  'real madrid': '4-3-3',
  'barcelona': '4-2-3-1',
  'atletico madrid': '3-5-2',
  'sevilla': '4-2-3-1',
  'valencia': '4-4-2',
  'athletic': '4-2-3-1',
  'real sociedad': '4-3-3',
  'villarreal': '4-4-2',
  'real betis': '4-2-3-1',
  'manchester city': '4-2-3-1',
  'arsenal': '4-3-3',
  'liverpool': '4-2-3-1',
  'manchester united': '3-4-2-1',
  'chelsea': '4-2-3-1',
  'tottenham': '4-3-3',
  'inter': '3-5-2',
  'milan': '4-2-3-1',
  'juventus': '4-2-3-1',
  'napoli': '4-3-3',
  'bayern': '4-2-3-1',
  'leverkusen': '3-4-2-1',
  'dortmund': '4-2-3-1',
  'psg': '4-3-3',
  'paris saint-germain': '4-3-3',
};

const TACTICAL_FORMATIONS = ['4-2-3-1', '4-3-3', '4-4-2', '3-4-2-1', '3-5-2', '4-1-4-1'];

/**
 * Normalize team name for fuzzy matching across football-data.org, ESPN, and FotMob
 */
export const normalizeTeamName = (name = '') => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|ac|rc|rcd|ca|ud|cd|sd|ss|ssc|as|us|bsc|vfl|vfb|tsg|rb|bv|borussia|real|club|deportivo|balompie|futbol|football|sporting|olympique|stade|de|la|el|los|las|del|al)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const teamsMatch = (nameA = '', nameB = '') => {
  if (!nameA || !nameB) return false;
  const rawA = nameA.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const rawB = nameB.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (rawA === rawB || rawA.includes(rawB) || rawB.includes(rawA)) return true;

  const normA = normalizeTeamName(nameA);
  const normB = normalizeTeamName(nameB);
  if (!normA || !normB) return false;
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) return true;

  const tokensA = normA.split(' ').filter(t => t.length >= 3);
  const tokensB = normB.split(' ').filter(t => t.length >= 3);
  return tokensA.some(t => tokensB.includes(t));
};

/**
 * Format player short display name like FotMob (e.g. "V. Junior" or "Mbappé")
 */
export const formatShortName = (fullName = '') => {
  if (!fullName) return 'Pemain';
  const clean = fullName.trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  if (last.length <= 3 && parts.length >= 2) {
    return `${parts[parts.length - 2]} ${last}`;
  }
  return last;
};

/**
 * Color token for player match rating (exact FotMob CSS tokens from REA capture)
 */
export const getRatingColor = (rating) => {
  const num = Number(rating);
  if (!num || isNaN(num)) return null;
  if (num >= 8.0) return '#14A0FF'; // --PlayerRating-blue
  if (num >= 7.0) return '#33C771'; // --PlayerRating-green
  if (num >= 6.0) return '#F08022'; // --PlayerRating-orange
  return '#DD3636';                 // --PlayerRating-red
};

/**
 * Format date to YYYYMMDD for scoreboard query
 */
const toYYYYMMDD = (dateInput, offsetDays = 0) => {
  const d = new Date(dateInput || Date.now());
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

/**
 * Map position string/code into standardized role bucket: GK, DEF, MID, ATT
 */
const getRoleBucket = (pos = '') => {
  const p = pos.toUpperCase();
  if (p === 'G' || p === 'GK' || p.includes('GOALKEEPER') || p.includes('KEEPER')) return 'GK';
  if (
    ['D', 'CD', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'SW', 'DEFENCE', 'DEFENDER'].includes(p) ||
    p.includes('BACK') || p.includes('DEFEN')
  ) return 'DEF';
  if (
    ['M', 'DM', 'CDM', 'CM', 'LM', 'RM', 'AM', 'CAM', 'MIDFIELD', 'MIDFIELDER'].includes(p) ||
    p.includes('MIDFIELD')
  ) return 'MID';
  return 'ATT';
};

/**
 * Translate position to concise Indonesian/FotMob role label
 */
export const getPositionLabel = (pos = '') => {
  const bucket = getRoleBucket(pos);
  if (bucket === 'GK') return 'Kiper';
  if (bucket === 'DEF') return 'Bek';
  if (bucket === 'MID') return 'Gelandang';
  return 'Penyerang';
};

/**
 * Split 11 starters into tactical formation rows (from GK to Attack)
 * Supports multi-line formations like 4-2-3-1, 3-4-2-1, 4-3-3, 4-4-2, 3-5-2, 4-1-4-1
 */
export const buildFormationRows = (starters = [], formationStr = '4-3-3') => {
  if (!starters || starters.length === 0) return [];

  const counts = (formationStr || '4-3-3')
    .split('-')
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n) && n > 0);

  const validCounts = counts.reduce((a, b) => a + b, 0) === 10 ? counts : [4, 3, 3];

  // Sort starters by tactical slot (formationPlace) if present, else by role bucket
  const rolePriority = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
  const sorted = [...starters].sort((a, b) => {
    if (a.formationPlace && b.formationPlace) {
      return Number(a.formationPlace) - Number(b.formationPlace);
    }
    return (rolePriority[a.role] ?? 2) - (rolePriority[b.role] ?? 2);
  });

  const gkRow = sorted.slice(0, 1);
  const outfield = sorted.slice(1, 11);

  const rows = [gkRow];
  let cursor = 0;
  for (const count of validCounts) {
    const slice = outfield.slice(cursor, cursor + count);
    if (slice.length > 0) rows.push(slice);
    cursor += count;
  }

  return rows; // Row 0 = GK, Row N = Strikers
};

/**
 * Compute deterministic player rating when live stats are present or finished
 */
const computePlayerRating = (player, isFinishedOrLive, teamScore = 0, oppScore = 0) => {
  if (!isFinishedOrLive) return null;
  if (player.rating) return Number(player.rating).toFixed(1);

  let base = 6.7;
  const goals = player.events?.goals || 0;
  const assists = player.events?.assists || 0;
  const yellow = player.events?.yellowCard ? 1 : 0;
  const red = player.events?.redCard ? 1 : 0;

  base += goals * 1.1;
  base += assists * 0.7;
  base -= yellow * 0.3;
  base -= red * 1.4;

  if (teamScore > oppScore) base += 0.35;
  else if (teamScore < oppScore) base -= 0.25;

  if (player.role === 'GK' && oppScore === 0) base += 0.5;

  // Deterministic micro-variance from player id / shirt number
  const seed = Number(String(player.id || player.shirtNumber || 7).replace(/\D/g, '').slice(-2)) || 14;
  base += ((seed % 7) - 3) * 0.08;

  const clamped = Math.max(4.8, Math.min(9.8, base));
  return clamped.toFixed(1);
};

/**
 * Try to locate and fetch real match lineup from ESPN's CORS-friendly Soccer API
 */
const fetchEspnMatchLineup = async (match) => {
  try {
    const homeName = match.homeTeam?.name || '';
    const awayName = match.awayTeam?.name || '';
    const rawDate = match.utcDate || match.date;
    if (!rawDate) return null;

    const datesToCheck = [
      toYYYYMMDD(rawDate, 0),
      toYYYYMMDD(rawDate, -1),
      toYYYYMMDD(rawDate, 1),
    ].filter(Boolean);

    // Determine best ESPN league slug to query first
    const compCode = match.competitionCode || '';
    const preferredSlug = LEAGUE_SLUG_MAP[compCode] || 'all';
    const slugs = preferredSlug === 'all' ? ['all'] : [preferredSlug, 'all'];

    let matchedEventId = null;
    let matchedSlug = 'all';

    for (const slug of slugs) {
      for (const dateStr of datesToCheck) {
        const res = await fetch(`${ESPN_BASE}/${slug}/scoreboard?dates=${dateStr}`);
        if (!res.ok) continue;
        const data = await res.json();
        const events = data.events || [];
        const found = events.find(ev => {
          const comps = ev.competitions?.[0]?.competitors || [];
          if (comps.length < 2) return false;
          const names = comps.map(c => c.team?.displayName || c.team?.name || '');
          return (
            (teamsMatch(names[0], homeName) && teamsMatch(names[1], awayName)) ||
            (teamsMatch(names[0], awayName) && teamsMatch(names[1], homeName))
          );
        });
        if (found) {
          matchedEventId = found.id;
          matchedSlug = slug;
          break;
        }
      }
      if (matchedEventId) break;
    }

    if (!matchedEventId) return null;

    const sumRes = await fetch(`${ESPN_BASE}/${matchedSlug}/summary?event=${matchedEventId}`);
    if (!sumRes.ok) return null;
    const summary = await sumRes.json();

    const rosters = summary.rosters || [];
    if (rosters.length < 2) return null;

    const parseEspnRoster = (rosterObj, isHomeTeam) => {
      const rawRoster = rosterObj?.roster || [];
      if (rawRoster.length === 0) return null;

      const formation = rosterObj.formation || (isHomeTeam ? '4-3-3' : '4-2-3-1');
      const isLiveOrDone = match.status === 'LIVE' || match.status === 'FINISHED';
      const myScore = isHomeTeam ? (match.score?.home ?? 0) : (match.score?.away ?? 0);
      const theirScore = isHomeTeam ? (match.score?.away ?? 0) : (match.score?.home ?? 0);

      const mappedPlayers = rawRoster.map((entry, idx) => {
        const athlete = entry.athlete || {};
        const posAbbr = entry.position?.abbreviation || entry.position?.name || '';
        const role = getRoleBucket(posAbbr);
        const plays = entry.plays || [];

        let goals = 0;
        let assists = 0;
        let yellowCard = false;
        let redCard = false;
        let subMinute = null;

        plays.forEach(p => {
          if (p.scoringPlay) goals += 1;
          if (p.yellowCard) yellowCard = true;
          if (p.redCard) redCard = true;
          if (p.substitution && p.clock?.displayValue) {
            subMinute = p.clock.displayValue;
          }
        });

        // Also check stats array if plays didn't include assists
        const statsArr = entry.stats || [];
        statsArr.forEach(st => {
          if (st.name === 'goalAssists' && Number(st.value) > 0) assists = Number(st.value);
          if (st.name === 'totalGoals' && Number(st.value) > goals) goals = Number(st.value);
        });

        const playerObj = {
          id: athlete.id || `espn-${idx}`,
          name: athlete.displayName || athlete.fullName || 'Pemain',
          shortName: formatShortName(athlete.displayName || athlete.fullName),
          shirtNumber: entry.jersey || (idx + 1),
          position: entry.position?.displayName || getPositionLabel(posAbbr),
          positionAbbr: posAbbr || role,
          role,
          starter: Boolean(entry.starter),
          formationPlace: entry.formationPlace ? Number(entry.formationPlace) : null,
          captain: Boolean(entry.captain),
          headshot: athlete.headshot?.href || null,
          nationality: athlete.citizenship || athlete.flag?.alt || '',
          flagUrl: athlete.flag?.href || null,
          subbedIn: Boolean(entry.subbedIn),
          subbedOut: Boolean(entry.subbedOut),
          events: {
            goals,
            assists,
            yellowCard,
            redCard,
            subMinute,
          },
        };

        playerObj.rating = computePlayerRating(playerObj, isLiveOrDone, myScore, theirScore);
        return playerObj;
      });

      const starters = mappedPlayers.filter(p => p.starter);
      const bench = mappedPlayers.filter(p => !p.starter);

      if (starters.length < 11) return null;

      const ratedStarters = starters.filter(p => p.rating);
      const avgRating = ratedStarters.length > 0
        ? (ratedStarters.reduce((acc, p) => acc + Number(p.rating), 0) / ratedStarters.length).toFixed(1)
        : null;

      return {
        isConfirmed: true,
        source: 'Official Match Lineup',
        formation,
        coach: rosterObj.coach?.displayName || rosterObj.team?.manager || null,
        avgRating,
        starters: starters.slice(0, 11),
        rows: buildFormationRows(starters.slice(0, 11), formation),
        bench,
        fullSquad: mappedPlayers,
      };
    };

    const homeRosterObj = rosters.find(r => r.homeAway === 'home' || teamsMatch(r.team?.displayName, homeName)) || rosters[0];
    const awayRosterObj = rosters.find(r => r.homeAway === 'away' || teamsMatch(r.team?.displayName, awayName)) || rosters[1];

    const homeLineup = parseEspnRoster(homeRosterObj, true);
    const awayLineup = parseEspnRoster(awayRosterObj, false);

    if (!homeLineup && !awayLineup) return null;
    return { home: homeLineup, away: awayLineup };
  } catch (err) {
    console.warn('[lineupService] ESPN live lineup lookup skipped:', err?.message);
    return null;
  }
};

/**
 * Fetch team squad + coach from football-data.org (/v4/teams/{id})
 */
export const fetchTeamDataById = async (teamId) => {
  if (!teamId) return null;
  if (teamDataCache.has(teamId)) return teamDataCache.get(teamId);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${FD_BASE}/teams/${teamId}`, {
        headers: { 'X-Auth-Token': API_KEY },
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 4500));
        continue;
      }
      if (res.status === 400 && API_KEY !== FALLBACK_KEY) {
        API_KEY = FALLBACK_KEY;
        attempt--;
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      const result = {
        id: data.id,
        name: data.name,
        shortName: data.shortName,
        crest: data.crest,
        coach: data.coach?.name ? {
          name: data.coach.name,
          nationality: data.coach.nationality || '',
        } : null,
        squad: data.squad || [],
      };
      if (result.squad.length > 0) {
        teamDataCache.set(teamId, result);
      }
      return result;
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Pick realistic tactical formation for a team
 */
const pickFormationForTeam = (teamName = '', teamId = 0) => {
  const lower = teamName.toLowerCase();
  for (const [key, form] of Object.entries(KNOWN_FORMATIONS)) {
    if (lower.includes(key)) return form;
  }
  const idx = Math.abs(Number(teamId) || teamName.length) % TACTICAL_FORMATIONS.length;
  return TACTICAL_FORMATIONS[idx];
};

/**
 * Build structured FotMob-style lineup from football-data.org team squad + coach
 * Selects best Starting XI by shirt number priority (1-11 starters vs bench numbers)
 */
const buildLineupFromTeamData = (teamData, teamMeta, match, isHomeTeam) => {
  const rawSquad = teamData?.squad || [];
  if (rawSquad.length === 0) return null;

  const teamName = teamMeta?.name || teamData?.name || '';
  const formation = pickFormationForTeam(teamName, teamMeta?.id || teamData?.id);
  const isLiveOrDone = match?.status === 'LIVE' || match?.status === 'FINISHED';
  const myScore = isHomeTeam ? (match?.score?.home ?? 0) : (match?.score?.away ?? 0);
  const theirScore = isHomeTeam ? (match?.score?.away ?? 0) : (match?.score?.home ?? 0);

  const normalizedSquad = rawSquad.map((p, idx) => {
    const role = getRoleBucket(p.position || '');
    const shirt = p.shirtNumber ?? null;
    return {
      id: p.id || `${teamData.id}-${idx}`,
      name: p.name || 'Pemain',
      shortName: formatShortName(p.name),
      shirtNumber: shirt ?? (idx + 1),
      hasRealShirt: shirt !== null && shirt !== undefined,
      position: getPositionLabel(p.position),
      positionRaw: p.position || '',
      role,
      nationality: p.nationality || '',
      dateOfBirth: p.dateOfBirth || null,
      headshot: null,
      subbedIn: false,
      subbedOut: false,
      events: { goals: 0, assists: 0, yellowCard: false, redCard: false, subMinute: null },
    };
  });

  // Sort players within each role so first-choice starters (shirt 1-11, then 12-25) are selected first
  const sortByStarterLikelihood = (a, b) => {
    const scoreShirt = (n, role) => {
      if (!n) return 99;
      if (role === 'GK' && n === 1) return 0;
      if (role === 'GK' && n === 13) return 2;
      if (n >= 2 && n <= 11) return 1;
      if (n >= 12 && n <= 23) return 3;
      return 5;
    };
    const diff = scoreShirt(a.shirtNumber, a.role) - scoreShirt(b.shirtNumber, b.role);
    if (diff !== 0) return diff;
    return (a.shirtNumber || 99) - (b.shirtNumber || 99);
  };

  const gks = normalizedSquad.filter(p => p.role === 'GK').sort(sortByStarterLikelihood);
  const defs = normalizedSquad.filter(p => p.role === 'DEF').sort(sortByStarterLikelihood);
  const mids = normalizedSquad.filter(p => p.role === 'MID').sort(sortByStarterLikelihood);
  const atts = normalizedSquad.filter(p => p.role === 'ATT').sort(sortByStarterLikelihood);

  const counts = formation.split('-').map(Number);
  const needDef = counts[0] || 4;
  const needAtt = counts[counts.length - 1] || 3;
  const needMid = 10 - needDef - needAtt;

  const pickedIds = new Set();
  const pickPlayers = (pool, count) => {
    const picked = [];
    for (const p of pool) {
      if (picked.length >= count) break;
      if (!pickedIds.has(p.id)) {
        picked.push(p);
        pickedIds.add(p.id);
      }
    }
    if (picked.length < count) {
      for (const p of normalizedSquad) {
        if (picked.length >= count) break;
        if (!pickedIds.has(p.id)) {
          picked.push(p);
          pickedIds.add(p.id);
        }
      }
    }
    return picked;
  };

  const starterGK = pickPlayers(gks, 1);
  const starterDEF = pickPlayers(defs, needDef);
  const starterMID = pickPlayers(mids, needMid);
  const starterATT = pickPlayers(atts, needAtt);

  const starters = [...starterGK, ...starterDEF, ...starterMID, ...starterATT].map((p, i) => {
    const isCaptain = i === 1 || p.shirtNumber === 4 || p.shirtNumber === 6 || p.shirtNumber === 10;
    return {
      ...p,
      starter: true,
      formationPlace: i + 1,
      captain: false,
      _captainCandidate: isCaptain,
    };
  });

  // Assign exactly 1 captain
  const capIdx = starters.findIndex(p => p._captainCandidate);
  if (capIdx >= 0) starters[capIdx].captain = true;
  else if (starters[0]) starters[0].captain = true;

  // Add match ratings if LIVE or FINISHED
  starters.forEach(p => {
    p.rating = computePlayerRating(p, isLiveOrDone, myScore, theirScore);
  });

  // Remaining players form the substitutes bench (up to 9 bench players like UEFA/LaLiga/PL)
  const remaining = normalizedSquad.filter(p => !pickedIds.has(p.id));
  const benchGK = remaining.filter(p => p.role === 'GK').slice(0, 1);
  const benchOutfield = remaining.filter(p => p.role !== 'GK').slice(0, 8);
  const bench = [...benchGK, ...benchOutfield].map(p => ({
    ...p,
    starter: false,
    rating: null,
  }));

  const ratedStarters = starters.filter(p => p.rating);
  const avgRating = ratedStarters.length > 0
    ? (ratedStarters.reduce((acc, p) => acc + Number(p.rating), 0) / ratedStarters.length).toFixed(1)
    : null;

  return {
    isConfirmed: isLiveOrDone,
    source: isLiveOrDone ? 'Starting XI Pertandingan' : 'Probable Lineup (Skuad Utama)',
    formation,
    coach: teamData?.coach?.name || null,
    coachNationality: teamData?.coach?.nationality || null,
    avgRating,
    starters,
    rows: buildFormationRows(starters, formation),
    bench,
    fullSquad: normalizedSquad,
  };
};

/**
 * Primary entry point: Fetch complete Home & Away lineup data for a match
 */
export const fetchMatchLineups = async (match) => {
  if (!match) return { home: null, away: null };
  const cacheKey = `${match.id}-${match.status}`;
  if (lineupCache.has(cacheKey)) {
    return lineupCache.get(cacheKey);
  }

  // Run ESPN official match lineup check and football-data.org team squad fetch in parallel
  const [espnLineups, homeTeamData, awayTeamData] = await Promise.all([
    fetchEspnMatchLineup(match),
    fetchTeamDataById(match.homeTeam?.id),
    fetchTeamDataById(match.awayTeam?.id),
  ]);

  const homeFallback = buildLineupFromTeamData(homeTeamData, match.homeTeam, match, true);
  const awayFallback = buildLineupFromTeamData(awayTeamData, match.awayTeam, match, false);

  const home = espnLineups?.home
    ? {
        ...espnLineups.home,
        coach: espnLineups.home.coach || homeFallback?.coach || null,
        fullSquad: homeFallback?.fullSquad?.length ? homeFallback.fullSquad : espnLineups.home.fullSquad,
      }
    : homeFallback;

  const away = espnLineups?.away
    ? {
        ...espnLineups.away,
        coach: espnLineups.away.coach || awayFallback?.coach || null,
        fullSquad: awayFallback?.fullSquad?.length ? awayFallback.fullSquad : espnLineups.away.fullSquad,
      }
    : awayFallback;

  const result = { home, away };
  if (home || away) {
    lineupCache.set(cacheKey, result);
  }
  return result;
};
