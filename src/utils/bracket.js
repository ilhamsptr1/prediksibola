export const generateBracket32 = (standings) => {
  const firsts = [];
  const seconds = [];
  const thirds = [];

  // 1. Ekstrak tim dari klasemen
  Object.keys(standings).forEach(group => {
    const table = standings[group];
    if (table.length >= 1) {
      firsts.push({ ...table[0], originalGroupRank: 1, originalGroup: group });
    }
    if (table.length >= 2) {
      seconds.push({ ...table[1], originalGroupRank: 2, originalGroup: group });
    }
    if (table.length >= 3) {
      thirds.push({ ...table[2], originalGroupRank: 3, originalGroup: group });
    }
  });

  // Fungsi pengurutan (Points > GD > GF)
  const sortTeams = (a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  };

  // 2. Ambil 8 Peringkat 3 terbaik
  thirds.sort(sortTeams);
  const bestThirds = thirds.slice(0, 8);

  // 3. Kumpulkan 32 tim yang lolos
  const qualified = [...firsts, ...seconds, ...bestThirds];

  // 4. Urutkan semua tim 1 hingga 32 (Seeding)
  // Untuk turnamen simulasi ini, kita unggulkan tim berdasarkan poin total
  qualified.sort(sortTeams);

  // Berikan label seed
  const seededTeams = qualified.map((t, i) => ({
    ...t,
    seed: i + 1
  }));

  // Jika belum lengkap 32 (karena data kurang), isi dengan dummy
  while (seededTeams.length < 32) {
    seededTeams.push({
      team: { name: 'TBD', flag: '' },
      seed: seededTeams.length + 1,
      isPlaceholder: true
    });
  }

  // 5. Susun bracket (1 vs 32, 16 vs 17, dsb.)
  // Skema standar 32 tim (Pohon Turnamen)
  const bracketOrder = [
    1, 32, 16, 17,
    8, 25, 9, 24,
    4, 29, 13, 20,
    5, 28, 12, 21,
    2, 31, 15, 18,
    7, 26, 10, 23,
    3, 30, 14, 19,
    6, 27, 11, 22
  ];

  const roundOf32 = [];
  for (let i = 0; i < 32; i += 2) {
    const s1 = bracketOrder[i];
    const s2 = bracketOrder[i + 1];
    const t1 = seededTeams.find(t => t.seed === s1);
    const t2 = seededTeams.find(t => t.seed === s2);
    
    roundOf32.push({
      id: `r32_${i/2 + 1}`,
      team1: t1 || null,
      team2: t2 || null,
      score1: null,
      score2: null,
      winner: null
    });
  }

  return roundOf32;
};
