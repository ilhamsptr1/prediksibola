import { TEAM_META } from './src/data/teamMeta.js';
import { writeFileSync } from 'fs';

let matchId = 1;
const matches = [];
const groups = ['A','B','C','D','E','F','G','H','I','J','K','L'];
let currentGroupIdx = 0;
let teamsInGroup = [];

const teamNames = Object.keys(TEAM_META);

for (let i = 0; i < teamNames.length; i++) {
  teamsInGroup.push(teamNames[i]);
  if (teamsInGroup.length === 4) {
    const groupCode = groups[currentGroupIdx];
    
    // MD1: 1v4, 2v3
    matches.push({ id: matchId++, homeTeam: {name: teamsInGroup[0]}, awayTeam: {name: teamsInGroup[3]}, groupCode, matchday: 1 });
    matches.push({ id: matchId++, homeTeam: {name: teamsInGroup[1]}, awayTeam: {name: teamsInGroup[2]}, groupCode, matchday: 1 });
    // MD2: 4v2, 3v1
    matches.push({ id: matchId++, homeTeam: {name: teamsInGroup[3]}, awayTeam: {name: teamsInGroup[1]}, groupCode, matchday: 2 });
    matches.push({ id: matchId++, homeTeam: {name: teamsInGroup[2]}, awayTeam: {name: teamsInGroup[0]}, groupCode, matchday: 2 });
    // MD3: 1v2, 3v4
    matches.push({ id: matchId++, homeTeam: {name: teamsInGroup[0]}, awayTeam: {name: teamsInGroup[1]}, groupCode, matchday: 3 });
    matches.push({ id: matchId++, homeTeam: {name: teamsInGroup[2]}, awayTeam: {name: teamsInGroup[3]}, groupCode, matchday: 3 });
    
    currentGroupIdx++;
    teamsInGroup = [];
  }
}

const mockFile = `export const MOCK_MATCHES = ${JSON.stringify(matches, null, 2)};`;
writeFileSync('./src/data/mockMatches.js', mockFile);
console.log("Mock matches generated.");
