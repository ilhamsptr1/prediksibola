export const calculateStandings = (matches, predictions) => {
  const standings = {};

  matches.forEach(match => {
    if (!match.groupCode) return; // Lewati jika tidak ada grup

    const group = match.groupCode;
    if (!standings[group]) {
      standings[group] = {};
    }

    // Inisialisasi tim jika belum ada
    [match.homeTeam, match.awayTeam].forEach(team => {
      if (team && team.name && !standings[group][team.name]) {
        standings[group][team.name] = {
          team,
          mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0
        };
      }
    });

    if (!match.homeTeam?.name || !match.awayTeam?.name) return;

    let homeGoals = null;
    let awayGoals = null;

    if (match.status === 'FINISHED') {
      homeGoals = match.score.home;
      awayGoals = match.score.away;
    } else {
      const pred = predictions.find(p => p.matchId === match.id);
      if (pred) {
        homeGoals = pred.homeScore;
        awayGoals = pred.awayScore;
      }
    }

    if (homeGoals !== null && awayGoals !== null && homeGoals !== undefined && awayGoals !== undefined) {
      const home = standings[group][match.homeTeam.name];
      const away = standings[group][match.awayTeam.name];

      home.mp += 1;
      away.mp += 1;

      home.gf += homeGoals;
      home.ga += awayGoals;
      away.gf += awayGoals;
      away.ga += homeGoals;

      if (homeGoals > awayGoals) {
        home.w += 1;
        home.pts += 3;
        away.l += 1;
      } else if (homeGoals < awayGoals) {
        away.w += 1;
        away.pts += 3;
        home.l += 1;
      } else {
        home.d += 1;
        away.d += 1;
        home.pts += 1;
        away.pts += 1;
      }

      home.gd = home.gf - home.ga;
      away.gd = away.gf - away.ga;
    }
  });

  // Konversi object ke array dan urutkan (Pts > GD > GF > Nama)
  const sortedStandings = {};
  Object.keys(standings).sort().forEach(group => {
    sortedStandings[group] = Object.values(standings[group]).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.team.name.localeCompare(b.team.name);
    });
  });

  return sortedStandings;
};
