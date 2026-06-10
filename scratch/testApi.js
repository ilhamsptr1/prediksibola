import https from 'https';

const API_KEY = '4eda5db232484db3b743c1544bf90b86';

const options = {
  hostname: 'api.football-data.org',
  path: '/v4/competitions/WC/teams',
  headers: {
    'X-Auth-Token': API_KEY
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Total Teams:', json.teams ? json.teams.length : 'No teams array');
      if (json.teams) {
        console.log(json.teams.slice(0, 3).map(t => ({ id: t.id, name: t.name })));
      } else {
        console.log(json);
      }
    } catch (e) {
      console.log('Parse error', e);
    }
  });
}).on('error', err => console.log('Error', err));
