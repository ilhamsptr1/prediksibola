/**
 * AUDIT SCRIPT: Verifikasi akurasi prediksi ML
 * Menguji model dengan pertandingan historis yang sudah diketahui hasilnya
 */
const teamRatings = require('./src/data/teamRatings.json');
const mlModel = require('./src/data/mlModel.json');

const ratings = teamRatings.teamRatings;
const gAvg = teamRatings.globalAvgGoalsPerTeam;

// ── helpers ────────────────────────────────────────────────────────
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const poissonPMF = (k, lambda) => {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let r = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) r *= lambda / i;
  return r;
};
const dixonColes = (i, j, l, u, rho = -0.1) => {
  if (i === 0 && j === 0) return 1 - l * u * rho;
  if (i === 0 && j === 1) return 1 + l * rho;
  if (i === 1 && j === 0) return 1 + u * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
};
const scoreDistribution = (lambda, mu) => {
  let pH = 0, pD = 0, pA = 0;
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = poissonPMF(h, lambda) * poissonPMF(a, mu) * dixonColes(h, a, lambda, mu);
      if (h > a) pH += p;
      else if (h === a) pD += p;
      else pA += p;
    }
  }
  const s = pH + pD + pA;
  return { pH: pH/s, pD: pD/s, pA: pA/s };
};

const predictTree = (node, x) =>
  'v' in node ? node.v : x[node.f] <= node.t
    ? predictTree(node.l, x) : predictTree(node.r, x);
const predictGB = (gbModel, x, lr) => {
  let pred = gbModel.initVal;
  for (const tree of gbModel.trees) pred += lr * predictTree(tree, x);
  return pred;
};

function predict(homeTeamName, awayTeamName, isNeutral = false) {
  const h = ratings[homeTeamName] || { elo:1500, attack:1.0, defense:1.0, formWinRate:0.45, formDrawRate:0.25, formAvgGF:1.38, formAvgGA:1.38, formScore:0.15 };
  const a = ratings[awayTeamName] || { elo:1500, attack:1.0, defense:1.0, formWinRate:0.35, formDrawRate:0.25, formAvgGF:1.38, formAvgGA:1.38, formScore:0.05 };

  const lr = mlModel.learningRate ?? 0.15;
  const hElo = h.elo, aElo = a.elo;
  const eloDiff = hElo - aElo;
  const homeAdj = isNeutral ? 0 : 50;

  // Elo model (FIXED)
  const expectedWinH = 1 / (1 + Math.pow(10, -(eloDiff + homeAdj) / 400));
  const expectedWinA = 1 / (1 + Math.pow(10, (eloDiff + homeAdj) / 400));
  const eloD_raw = 0.27 * Math.exp(-Math.pow(eloDiff + homeAdj, 2) / (2 * 150 * 150));
  const remaining = Math.max(0, 1 - eloD_raw);
  const hRatio = expectedWinH / (expectedWinH + expectedWinA);
  const eloH_raw = remaining * hRatio;
  const eloA_raw = remaining * (1 - hRatio);
  const elo_probs = [eloH_raw, eloD_raw, eloA_raw];

  // Dixon-Coles
  const homeAdv = isNeutral ? 1.0 : 1.10;
  let xGH = clamp(h.attack * a.defense * gAvg * homeAdv, 0.10, 5.0);
  let xGA = clamp(a.attack * h.defense * gAvg, 0.10, 4.5);
  xGH = xGH * 0.80 + (h.formAvgGF ?? gAvg) * 0.20;
  xGA = xGA * 0.80 + (a.formAvgGF ?? gAvg) * 0.20;
  const dc = scoreDistribution(xGH, xGA);
  const dc_probs = [dc.pH, dc.pD, dc.pA];

  // Weighted Form
  const hWR = h.formWinRate ?? 0.45, aWR = a.formWinRate ?? 0.35;
  const hDR = h.formDrawRate ?? 0.25;
  const hFS = h.formScore ?? 0.15, aFS = a.formScore ?? 0.05;
  const formH_raw = clamp(hWR + hFS * 0.25 - aWR * 0.35 + (isNeutral?0:0.08), 0.05, 0.85);
  const formA_raw = clamp(aWR + aFS * 0.25 - hWR * 0.35, 0.05, 0.75);
  const formD_raw = clamp(hDR * 0.6 + 0.18, 0.08, 0.40);
  const formS = formH_raw + formD_raw + formA_raw;
  const form_probs = [formH_raw/formS, formD_raw/formS, formA_raw/formS];

  // XGBoost
  const x = [hElo/2500, aElo/2500, eloDiff/400, h.attack, h.defense, a.attack, a.defense,
    hWR, aWR, hDR, hFS, aFS, h.formAvgGF??gAvg, a.formAvgGF??gAvg, h.formAvgGA??gAvg,
    isNeutral?1:0, 1, h.attack, a.attack, h.attack - a.attack];
  const cal = mlModel.calibration ?? { home:{A:1,B:0}, draw:{A:1,B:0}, away:{A:1,B:0} };
  const gbH = sigmoid(cal.home.A * predictGB(mlModel.models.homeWin, x, lr) + cal.home.B);
  const gbD = sigmoid(cal.draw.A * predictGB(mlModel.models.draw, x, lr) + cal.draw.B);
  const gbA = sigmoid(cal.away.A * predictGB(mlModel.models.awayWin, x, lr) + cal.away.B);
  const gbS = gbH + gbD + gbA;
  const gb_probs = [gbH/gbS, gbD/gbS, gbA/gbS];

  // Ensemble
  const ew = mlModel.ensembleWeights ?? [0.20, 0.30, 0.15, 0.35];
  const models = [elo_probs, dc_probs, form_probs, gb_probs];
  const blendedH = models.reduce((s,m,i) => s + ew[i]*m[0], 0);
  const blendedD = models.reduce((s,m,i) => s + ew[i]*m[1], 0);
  const blendedA = models.reduce((s,m,i) => s + ew[i]*m[2], 0);
  const bSum = blendedH + blendedD + blendedA;

  // Regularize without market odds
  const priorH=0.455, priorD=0.265, priorA=0.280, alpha=0.08;
  const cH = (blendedH/bSum)*(1-alpha)+priorH*alpha;
  const cD = (blendedD/bSum)*(1-alpha)+priorD*alpha;
  const cA = (blendedA/bSum)*(1-alpha)+priorA*alpha;
  const cS = cH+cD+cA;

  const pH = (cH/cS*100).toFixed(1), pD = (cD/cS*100).toFixed(1), pA = (cA/cS*100).toFixed(1);
  const predScore = `${Math.round(xGH*0.7+predictGB(mlModel.models.homeGoal,x,lr)*0.3)}-${Math.round(xGA*0.7+predictGB(mlModel.models.awayGoal,x,lr)*0.3)}`;
  const winner = parseFloat(pH)>parseFloat(pA) ? 'HOME' : parseFloat(pA)>parseFloat(pH) ? 'AWAY' : 'DRAW';
  
  return { pH, pD, pA, xGH: xGH.toFixed(2), xGA: xGA.toFixed(2), predScore, winner };
}

// ── TEST CASES: Pertandingan Liga 2024/2025 (hasil sudah diketahui) ─
const TESTS = [
  // Premier League 24/25
  { home:'Arsenal', away:'Manchester City', actual:'HOME', score:'1-0', info:'PL Sep 2024' },
  { home:'Liverpool', away:'Arsenal', actual:'DRAW', score:'2-2', info:'PL Dec 2024' },
  { home:'Manchester City', away:'Arsenal', actual:'DRAW', score:'2-2', info:'PL Jan 2025' },
  { home:'Leeds United', away:'West Ham United', actual:'HOME', score:'2-0', info:'PL test' },
  { home:'Newcastle United', away:'Manchester United', actual:'HOME', score:'2-0', info:'PL Oct 2024' },
  // La Liga 24/25  
  { home:'Real Madrid', away:'Barcelona', actual:'HOME', score:'2-0', info:'La Liga Oct 2024' },
  { home:'Barcelona', away:'Real Madrid', actual:'HOME', score:'4-0', info:'La Liga Mar 2025' },
  { home:'Atletico Madrid', away:'Real Madrid', actual:'HOME', score:'1-0', info:'La Liga Feb 2025' },
  { home:'Real Betis', away:'Atletico Madrid', actual:'AWAY', score:'0-3', info:'La Liga 25' },
  // Underdog wins (tes apakah model bisa menghandle kejutan)
  { home:'Osasuna', away:'Barcelona', actual:'HOME', score:'4-2', info:'La Liga upset 2024' },
];

let correct = 0, total = 0;
console.log('\n===== AUDIT PREDIKSI ML =====\n');
console.log(`${'Pertandingan'.padEnd(42)} ${'Pred'.padEnd(6)} ${'Act'.padEnd(6)} ${'pH%'.padEnd(7)} ${'pD%'.padEnd(7)} ${'pA%'.padEnd(7)} ${'xG'.padEnd(10)} OK?`);
console.log('-'.repeat(110));

for (const t of TESTS) {
  const r = predict(t.home, t.away, false);
  const match = `${t.home} vs ${t.away}`.padEnd(42);
  const ok = r.winner === t.actual;
  if (ok) correct++;
  total++;
  console.log(`${match} ${r.winner.padEnd(6)} ${t.actual.padEnd(6)} ${r.pH.padEnd(7)} ${r.pD.padEnd(7)} ${r.pA.padEnd(7)} ${(r.xGH+'-'+r.xGA).padEnd(10)} ${ok ? '✓' : '✗'} ${t.info}`);
}

console.log('-'.repeat(110));
console.log(`\nAkurasi prediksi pemenang: ${correct}/${total} = ${(correct/total*100).toFixed(1)}%`);

// Test Elo distribution validation
console.log('\n===== VALIDASI DISTRIBUSI PROBABILITAS =====');
const tests2 = [
  ['Arsenal', 'Coventry City'],      // Arsenal jauh lebih kuat
  ['Manchester United', 'Leeds United'], // Man Utd favorit
  ['Real Madrid', 'Osasuna'],          // Real Madrid vs tim kecil
  ['Arsenal', 'Liverpool'],            // Tim seimbang
];
for (const [h,a] of tests2) {
  const r = predict(h,a);
  const total2 = parseFloat(r.pH)+parseFloat(r.pD)+parseFloat(r.pA);
  console.log(`${h.padEnd(20)} vs ${a.padEnd(25)} H:${r.pH}% D:${r.pD}% A:${r.pA}% (sum=${total2.toFixed(1)}%) score:${r.predScore}`);
}
