// Test Odds API key
const KEY = 'f02c5c480c158092498755646c0de76e';

async function test() {
  console.log('Testing The Odds API key...\n');

  // 1. Check sports list (consumes 1 request)
  const r = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${KEY}`);
  const remaining = r.headers.get('x-requests-remaining');
  const used = r.headers.get('x-requests-used');

  if (!r.ok) {
    console.error('❌ API Error:', r.status, await r.text());
    return;
  }

  const sports = await r.json();
  console.log('✅ API key valid!');
  console.log(`📊 Quota: ${used} used / ${remaining} remaining this month\n`);

  // Show soccer leagues available
  const soccer = sports.filter(s => s.group === 'Soccer' && s.active);
  console.log(`⚽ Available soccer leagues (${soccer.length} total):`);
  soccer.slice(0, 15).forEach(s => console.log(` - ${s.key.padEnd(40)} ${s.title}`));

  // 2. Test fetch PL odds
  console.log('\n📡 Fetching Premier League odds...');
  const r2 = await fetch(`https://api.the-odds-api.com/v4/sports/soccer_epl/odds/?apiKey=${KEY}&regions=eu&markets=h2h&oddsFormat=decimal`);
  const remaining2 = r2.headers.get('x-requests-remaining');
  const matches = await r2.json();
  console.log(`✅ Premier League: ${Array.isArray(matches) ? matches.length : 0} upcoming matches with odds`);
  console.log(`📊 Remaining after PL fetch: ${remaining2} requests`);

  if (Array.isArray(matches) && matches.length > 0) {
    const m = matches[0];
    const bk = m.bookmakers?.[0];
    const h2h = bk?.markets?.find(x => x.key === 'h2h');
    console.log(`\nSample match: ${m.home_team} vs ${m.away_team}`);
    console.log(`Bookmaker: ${bk?.title}`);
    if (h2h) {
      h2h.outcomes.forEach(o => console.log(`  ${o.name}: ${o.price}`));
    }
  }
}

test().catch(console.error);
