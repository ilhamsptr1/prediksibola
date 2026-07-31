/**
 * ═══════════════════════════════════════════════════════════════
 *  ENSEMBLE ML INFERENCE ENGINE v2
 * ═══════════════════════════════════════════════════════════════
 *  Pipeline (sama persis dengan diagram arsitektur):
 *
 *  Historical Data
 *       │
 *       ▼
 *  [1] Weighted Recent Form  ──┐
 *  [2] Elo Rating             ──┤
 *  [3] Expected Goals (xG)   ──┤──► Ensemble Blending
 *  [4] Dixon-Coles            ──┤       │
 *  [5] XGBoost (GB Trees)    ──┘       ▼
 *                              Platt Calibration
 *                                      │
 *                              Bookmaker Odds Layer
 *                              (koreksi overround)
 *                                      │
 *                              Final Prediction
 * ═══════════════════════════════════════════════════════════════
 */

// Lazy load mlModel.json agar tidak memperlambat initial page load
let _model    = null;
let _loadProm = null;

const loadModel = () => {
  if (_model)    return Promise.resolve(_model);
  if (_loadProm) return _loadProm;
  _loadProm = import('../data/mlModel.json')
    .then(m => { _model = m.default ?? m; return _model; });
  return _loadProm;
};

// ── Math helpers ─────────────────────────────────────────────────
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const softmax = (arr) => {
  const mx = Math.max(...arr);
  const ex = arr.map(v => Math.exp(v - mx));
  const s  = ex.reduce((a, b) => a + b, 0);
  return ex.map(v => v / s);
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── GB Tree Inference ────────────────────────────────────────────
const predictTree = (node, x) =>
  'v' in node ? node.v : x[node.f] <= node.t
    ? predictTree(node.l, x)
    : predictTree(node.r, x);

const predictGB = (gbModel, x, lr) => {
  let pred = gbModel.initVal;
  for (const tree of gbModel.trees) pred += lr * predictTree(tree, x);
  return pred;
};

// ── Poisson PMF ─────────────────────────────────────────────────
const poissonPMF = (k, lambda) => {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let r = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) r *= lambda / i;
  return r;
};

// ── Dixon-Coles correction ───────────────────────────────────────
// Mengoreksi under/overestimasi untuk skor rendah
const dixonColes = (i, j, l, u, rho = -0.1) => {
  if (i === 0 && j === 0) return 1 - l * u * rho;
  if (i === 0 && j === 1) return 1 + l * rho;
  if (i === 1 && j === 0) return 1 + u * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
};

// ── Score distribution via Poisson + Dixon-Coles ─────────────────
const scoreDistribution = (lambda, mu) => {
  let pH = 0, pD = 0, pA = 0;
  let bestP = -1, bestH = 0, bestA = 0;
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = poissonPMF(h, lambda) * poissonPMF(a, mu) * dixonColes(h, a, lambda, mu);
      if (p > bestP) { bestP = p; bestH = h; bestA = a; }
      if (h > a) pH += p;
      else if (h === a) pD += p;
      else pA += p;
    }
  }
  const s = pH + pD + pA;
  return { pH: pH / s, pD: pD / s, pA: pA / s, likelyH: bestH, likelyA: bestA };
};

// ── Bookmaker Odds Calibration Layer ────────────────────────────
/**
 * Simulasi koreksi bookmaker overround.
 * Bookmaker biasanya menambah margin 5-8% ke probabilitas asli.
 * Dengan menghapus margin ini, kita mendapat "true probability" yang
 * lebih terkalibrasi terhadap pasar.
 *
 * Jika odds nyata diberikan (dalam format desimal), gunakan langsung.
 * Jika tidak, gunakan predicted probs + koreksi regularisasi ringan.
 *
 * @param {number} pH, pD, pA - raw ensemble probabilities
 * @param {object|null} marketOdds - { home, draw, away } (format desimal, opsional)
 */
const bookmakerCalibration = (pH, pD, pA, marketOdds = null) => {
  if (marketOdds && marketOdds.home && marketOdds.draw && marketOdds.away) {
    // Gunakan odds pasar: implied prob = 1 / odds
    const impH = 1 / marketOdds.home;
    const impD = 1 / marketOdds.draw;
    const impA = 1 / marketOdds.away;
    const overround = impH + impD + impA;  // biasanya 1.05 – 1.10

    // Hapus margin overround → "fair" probability
    const fairH = impH / overround;
    const fairD = impD / overround;
    const fairA = impA / overround;

    // Blend: 60% model + 40% market (market sangat informatif)
    return {
      pH: pH * 0.60 + fairH * 0.40,
      pD: pD * 0.60 + fairD * 0.40,
      pA: pA * 0.60 + fairA * 0.40,
      marketUsed: true,
    };
  }

  // Tanpa odds pasar: regularisasi Laplace ringan menuju prior (37/28/35)
  // Prior diambil dari distribusi historis global H/D/A sepak bola dunia
  const priorH = 0.455, priorD = 0.265, priorA = 0.280;
  const alpha  = 0.08;  // kekuatan regularisasi (semakin besar = semakin ke prior)
  return {
    pH: pH * (1 - alpha) + priorH * alpha,
    pD: pD * (1 - alpha) + priorD * alpha,
    pA: pA * (1 - alpha) + priorA * alpha,
    marketUsed: false,
  };
};

// ════════════════════════════════════════════════════════════════
//  MAIN EXPORT: generateMLPrediction
// ════════════════════════════════════════════════════════════════
/**
 * @param {object} params
 * @param {object} params.homeTeam   - { name }
 * @param {object} params.awayTeam   - { name }
 * @param {object} params.homeStats  - dari teamRatings.json
 * @param {object} params.awayStats  - dari teamRatings.json
 * @param {boolean} params.isNeutral
 * @param {number}  params.globalAvg - global avg goals per team per match
 * @param {boolean} params.isClub    - true untuk pertandingan liga klub
 * @param {object|null} params.marketOdds - opsional { home, draw, away } decimal odds
 *
 * @returns {object} prediksi lengkap
 */
export const generateMLPrediction = async ({
  homeTeam,
  awayTeam,
  homeStats,
  awayStats,
  isNeutral = false,
  globalAvg,
  isClub = true,       // default true karena website ini fokus ke liga klub
  marketOdds = null,
}) => {
  const model = await loadModel();
  const lr    = model.learningRate ?? 0.15;
  const gAvg  = globalAvg ?? model.globalAvg ?? 1.3725;

  // ── Unpack team stats ──────────────────────────────────────────
  const hElo = homeStats?.elo       ?? 1500;
  const aElo = awayStats?.elo       ?? 1500;
  const hAtk = homeStats?.attack    ?? 1.0;
  const hDef = homeStats?.defense   ?? 1.0;
  const aAtk = awayStats?.attack    ?? 1.0;
  const aDef = awayStats?.defense   ?? 1.0;

  // Weighted recent form (tersimpan di teamRatings.json)
  const hWR  = homeStats?.formWinRate  ?? 0.45;
  const aWR  = awayStats?.formWinRate  ?? 0.35;
  const hDR  = homeStats?.formDrawRate ?? 0.25;
  const hFS  = homeStats?.formScore    ?? 0.15;
  const aFS  = awayStats?.formScore    ?? 0.05;
  const hGF  = homeStats?.formAvgGF    ?? gAvg;
  const aGF  = awayStats?.formAvgGF    ?? gAvg;
  const hGA  = homeStats?.formAvgGA    ?? gAvg;

  // ══════════════════════════════════════════════════════════════
  //  MODEL 1: Elo Logistic Regression
  // ══════════════════════════════════════════════════════════════
  const eloDiff    = hElo - aElo;
  const homeAdj    = isNeutral ? 0 : 50;
  
  // Menghitung ekspektasi menang menggunakan rumus Elo standar
  const expectedWinH = 1 / (1 + Math.pow(10, -(eloDiff + homeAdj) / 400));
  const expectedWinA = 1 / (1 + Math.pow(10, (eloDiff + homeAdj) / 400));
  
  // Menggunakan distribusi Gaussian untuk menghitung probabilitas seri berdasarkan selisih kekuatan
  // Tim dengan kekuatan seimbang (eloDiff ~ 0) punya probabilitas seri terbesar (~27%)
  const eloD_raw = 0.27 * Math.exp(-Math.pow(eloDiff + homeAdj, 2) / (2 * 150 * 150));
  
  // Sisa probabilitas dialokasikan ke Home dan Away sesuai rasio expected win
  const remaining = Math.max(0, 1 - eloD_raw);
  const hRatio = expectedWinH / (expectedWinH + expectedWinA);
  
  const eloH_raw = remaining * hRatio;
  const eloA_raw = remaining * (1 - hRatio);
  
  const eloS = eloH_raw + eloD_raw + eloA_raw;
  const elo_probs  = [eloH_raw / eloS, eloD_raw / eloS, eloA_raw / eloS];

  // ══════════════════════════════════════════════════════════════
  //  MODEL 2: Dixon-Coles xG
  // ══════════════════════════════════════════════════════════════
  const homeAdv   = isNeutral ? 1.0 : 1.10;
  let xGH = clamp(hAtk * aDef * gAvg * homeAdv, 0.10, 5.0);
  let xGA = clamp(aAtk * hDef * gAvg,            0.10, 4.5);

  // Blend dengan form recency (20% form, 80% Poisson)
  xGH = xGH * 0.80 + hGF * 0.20;
  xGA = xGA * 0.80 + aGF * 0.20;

  const dc = scoreDistribution(xGH, xGA);
  const dc_probs = [dc.pH, dc.pD, dc.pA];

  // ══════════════════════════════════════════════════════════════
  //  MODEL 3: Weighted Recent Form
  // ══════════════════════════════════════════════════════════════
  const formH_raw = clamp(hWR + hFS * 0.25 - aWR * 0.35 + (isNeutral ? 0 : 0.08), 0.05, 0.85);
  const formA_raw = clamp(aWR + aFS * 0.25 - hWR * 0.35,                           0.05, 0.75);
  const formD_raw = clamp(hDR * 0.6 + 0.18,                                         0.08, 0.40);
  const formS     = formH_raw + formD_raw + formA_raw;
  const form_probs = [formH_raw / formS, formD_raw / formS, formA_raw / formS];

  // ══════════════════════════════════════════════════════════════
  //  MODEL 4: XGBoost / Gradient Boosting
  // ══════════════════════════════════════════════════════════════
  // Feature vector (20 dims) — sama persis dengan training
  const GLOBAL_SOT = 4.0;
  // Use attack rating as shot-on-target proxy (fallback when no shot data)
  const hSOT = hAtk;  // normalized attack = proxy for shot quality
  const aSOT = aAtk;
  const x = [
    hElo / 2500, aElo / 2500, eloDiff / 400,
    hAtk, hDef, aAtk, aDef,
    hWR, aWR, hDR,
    hFS, aFS,
    hGF, aGF, hGA,
    isNeutral ? 1 : 0,
    isClub    ? 1 : 0,   // domain flag
    hSOT, aSOT,
    hSOT - aSOT,         // shot quality differential
  ];

  const gbRawH = predictGB(model.models.homeWin, x, lr);
  const gbRawD = predictGB(model.models.draw,    x, lr);
  const gbRawA = predictGB(model.models.awayWin, x, lr);

  // Platt Scaling calibration
  const cal = model.calibration ?? { home: { A:1, B:0 }, draw: { A:1, B:0 }, away: { A:1, B:0 } };
  const gbH  = sigmoid(cal.home.A * gbRawH + cal.home.B);
  const gbD  = sigmoid(cal.draw.A * gbRawD + cal.draw.B);
  const gbA  = sigmoid(cal.away.A * gbRawA + cal.away.B);
  const gbS  = gbH + gbD + gbA;
  const gb_probs = [gbH / gbS, gbD / gbS, gbA / gbS];

  // ══════════════════════════════════════════════════════════════
  //  ENSEMBLE BLENDING
  // ══════════════════════════════════════════════════════════════
  // Gunakan bobot optimal yang ditemukan saat training
  const ew = model.ensembleWeights ?? [0.20, 0.30, 0.15, 0.35];
  const models = [elo_probs, dc_probs, form_probs, gb_probs];
  const blendedH = models.reduce((s, m, i) => s + ew[i] * m[0], 0);
  const blendedD = models.reduce((s, m, i) => s + ew[i] * m[1], 0);
  const blendedA = models.reduce((s, m, i) => s + ew[i] * m[2], 0);
  const bSum = blendedH + blendedD + blendedA;

  // ══════════════════════════════════════════════════════════════
  //  BOOKMAKER ODDS CALIBRATION LAYER
  // ══════════════════════════════════════════════════════════════
  const calibrated = bookmakerCalibration(
    blendedH / bSum,
    blendedD / bSum,
    blendedA / bSum,
    marketOdds
  );
  const cSum = calibrated.pH + calibrated.pD + calibrated.pA;
  const finalH = calibrated.pH / cSum;
  const finalD = calibrated.pD / cSum;
  const finalA = calibrated.pA / cSum;

  // ── xG dari GB Regressor ──────────────────────────────────────
  let predXGH = clamp(predictGB(model.models.homeGoal, x, lr), 0.1, 5.0);
  let predXGA = clamp(predictGB(model.models.awayGoal, x, lr), 0.1, 4.5);

  // Blend xG: 70% GB + 30% Poisson
  predXGH = predXGH * 0.70 + xGH * 0.30;
  predXGA = predXGA * 0.70 + xGA * 0.30;

  // Build label breakdown per model untuk ditampilkan di UI
  const modelBreakdown = {
    elo:  { home: (elo_probs[0]  * 100).toFixed(1), draw: (elo_probs[1]  * 100).toFixed(1), away: (elo_probs[2]  * 100).toFixed(1) },
    dc:   { home: (dc_probs[0]   * 100).toFixed(1), draw: (dc_probs[1]   * 100).toFixed(1), away: (dc_probs[2]   * 100).toFixed(1) },
    form: { home: (form_probs[0] * 100).toFixed(1), draw: (form_probs[1] * 100).toFixed(1), away: (form_probs[2] * 100).toFixed(1) },
    gb:   { home: (gb_probs[0]   * 100).toFixed(1), draw: (gb_probs[1]   * 100).toFixed(1), away: (gb_probs[2]   * 100).toFixed(1) },
  };

  // ── Predicted scoreline ────────────────────────────────────────
  // Gunakan xG yang sudah di-blend (bukan modus Poisson yang selalu 1-1)
  // Math.round(xG) memberikan skor yang lebih bervariasi dan informatif
  // Contoh: xGH=2.1 → 2 gol, xGA=0.9 → 1 gol → "2 - 1"
  const likelyHome = Math.round(predXGH);
  const likelyAway = Math.round(predXGA);

  return {
    probabilities: {
      home: (finalH * 100).toFixed(1),
      draw: (finalD * 100).toFixed(1),
      away: (finalA * 100).toFixed(1),
    },
    likelyHome,
    likelyAway,
    xG: {
      home: predXGH.toFixed(2),
      away: predXGA.toFixed(2),
    },
    modelBreakdown,
    ensembleWeights: { elo: ew[0], dc: ew[1], form: ew[2], gb: ew[3] },
    marketOddsUsed: calibrated.marketUsed,
    confidenceSource: 'ensemble-v2 (Elo+DC+Form+XGBoost+Calibration)',
  };
};

export default generateMLPrediction;
