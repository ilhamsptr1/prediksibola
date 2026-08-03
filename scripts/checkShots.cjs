const fs = require('fs');
const club = fs.readFileSync('archive (2)/matches.csv', 'utf8').split('\n');
let zeroShots = 0, hasShots = 0;
for (let i = 1; i < Math.min(club.length, 500); i++) {
  const cols = club[i].split(',');
  const shotCol = (cols[16] || '').trim();
  if (shotCol.includes('(') && !shotCol.startsWith('0 (0)')) hasShots++;
  else zeroShots++;
}
console.log('Sample 500 rows:');
console.log('  Has real shots data:', hasShots);
console.log('  Zero/missing shots:', zeroShots);
console.log('  Coverage:', (hasShots/500*100).toFixed(1)+'%');
