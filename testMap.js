import { MOCK_MATCHES } from './src/data/mockMatches.js';
import { getTeamMeta, getVenueForMatch } from './src/data/teamMeta.js';

const mapMatchData = (apiMatch) => {
  const homeMeta = getTeamMeta(apiMatch.homeTeam?.name || 'TBD');
  const awayMeta = getTeamMeta(apiMatch.awayTeam?.name || 'TBD');

  let groupName = 'Group Stage';
  let groupCode = apiMatch.groupCode || null;
  if (apiMatch.group) {
    groupCode = apiMatch.group.split('_')[1];
  }
  if (groupCode) {
    groupName = `Group ${groupCode}`;
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
    venue: apiMatch.venue || getVenueForMatch(apiMatch.id),
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

try {
  const fallback = MOCK_MATCHES.map(mapMatchData);
  console.log("Success! Extracted " + fallback.length + " matches.");
} catch (e) {
  console.error("Error:", e.message);
}
console.log(JSON.stringify(fallback[0], null, 2));
