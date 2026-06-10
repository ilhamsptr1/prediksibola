import { MOCK_MATCHES } from './src/data/mockMatches.js';

const mapMatchData = (apiMatch) => {
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
    group: groupName,
    groupCode: groupCode,
    status: mappedStatus
  };
};

const fallback = MOCK_MATCHES.map(mapMatchData);
console.log(fallback[0]);
