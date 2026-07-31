/**
 * ============================================================
 *  ML INFERENCE ENGINE — Gradient Boosting Predictor
 * ============================================================
 *  Membaca mlModel.json dan melakukan prediksi probabilitas
 *  serta skor untuk setiap pertandingan.
 *
 *  Dipanggil dari PredictionContext.jsx sebagai pengganti
 *  kalkulasi Poisson murni.
 * ============================================================
 */

import mlModelData from '../data/mlModel.json';

let _model = null;

/**
 * Muat model dari JSON (singleton, hanya load sekali).
 */
const loadModel = () => {
  if (_model) return _model;
  _model = mlModelData;
  return _model;
};

/**
 * Prediksi satu sampel dengan satu pohon terstruktur.
 */
const predictTree = (node, x) => {
  if ('v' in node) return node.v;
  return x[node.f] <= node.t
    ? predictTree(node.l, x)
    : predictTree(node.r, x);
};

/**
 * Prediksi satu sampel dengan satu model GB (sum of trees).
 */
const predictGB = (gbModel, x) => {
  let pred = gbModel.initVal;
  for (const tree of gbModel.trees) {
    pred += _model.learningRate * predictTree(tree, x);
  }
  return pred;
};

/**
 * Softmax normalisasi
 */
const softmax = (logits) => {
  const maxL = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - maxL));
  const sum  = exps.reduce((s, e) => s + e, 0);
  return exps.map(e => e / sum);
};

/**
 * Poisson PMF — digunakan untuk Dixon-Coles correction
 */
const poissonPMF = (k, lambda) => {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
  return result;
};

/**
 * Koreksi Dixon-Coles untuk skor rendah (0-0, 1-0, 0-1, 1-1)
 * yang cenderung underestimated oleh Poisson biasa.
 * rho ≈ -0.1 adalah nilai optimal dari paper aslinya.
 */
const dixonColesCorrection = (i, j, lambda, mu, rho = -0.1) => {
  if (i === 0 && j === 0) return 1 - lambda * mu * rho;
  if (i === 0 && j === 1) return 1 + lambda * rho;
  if (i === 1 && j === 0) return 1 + mu * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
};

/**
 * Hitung distribusi probabilitas skor menggunakan
 * model Poisson + koreksi Dixon-Coles.
 *
 * @param {number} lambda - Expected goals (home)
 * @param {number} mu     - Expected goals (away)
 * @param {number} maxGoals - Batas atas gol (default 8)
 */
const scoreDistribution = (lambda, mu, maxGoals = 8) => {
  let probHome = 0, probDraw = 0, probAway = 0;
  let bestProb = -1, bestHome = 0, bestAway = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const tau = dixonColesCorrection(i, j, lambda, mu);
      const p   = poissonPMF(i, lambda) * poissonPMF(j, mu) * tau;

      if (p > bestProb) { bestProb = p; bestHome = i; bestAway = j; }
      if (i > j)       probHome += p;
      else if (i === j) probDraw += p;
      else              probAway += p;
    }
  }

  const total = probHome + probDraw + probAway;
  return {
    pHome: probHome / total,
    pDraw: probDraw / total,
    pAway: probAway / total,
    likelyHome: bestHome,
    likelyAway: bestAway,
  };
};

/**
 * ─────────────────────────────────────────────────────────────
 *  MAIN EXPORT: generateMLPrediction
 * ─────────────────────────────────────────────────────────────
 *
 * @param {object} homeTeam - { name, att, def } (dari teamRatings)
 * @param {object} awayTeam - { name, att, def }
 * @param {object} homeStats - { elo, attack, defense } dari teamRatings
 * @param {object} awayStats - { elo, attack, defense }
 * @param {boolean} isNeutral - apakah venue netral
 * @param {number} globalAvg - rata-rata gol global per tim per match
 *
 * @returns {object} { probabilities, likelyHome, likelyAway, xG, confidenceSource }
 */
export const generateMLPrediction = ({
  homeTeam,
  awayTeam,
  homeStats,
  awayStats,
  isNeutral = false,
  globalAvg,
}) => {
  const model = loadModel();

  const hElo = homeStats?.elo ?? 1500;
  const aElo = awayStats?.elo ?? 1500;
  const hAtk = homeStats?.attack  ?? 1.0;
  const hDef = homeStats?.defense ?? 1.0;
  const aAtk = awayStats?.attack  ?? 1.0;
  const aDef = awayStats?.defense ?? 1.0;

  // ── Build feature vector (sama persis dengan training) ──
  // [0] homeElo_norm, [1] awayElo_norm, [2] eloDiff_norm,
  // [3] homeAtk, [4] homeDef, [5] awayAtk, [6] awayDef,
  // [7] homeFormWR, [8] awayFormWR, [9] homeFormDR,
  // [10] homeFormAvgGF, [11] awayFormAvgGF, [12] homeFormAvgGA,
  // [13] isNeutral
  // Untuk form (7-12): kita gunakan Poisson/Elo sebagai proxy
  // karena di browser tidak ada rolling window real-time.
  const eloDiff   = hElo - aElo;
  const homeFormWR = Math.min(0.9, Math.max(0.1, 0.38 + eloDiff / 4000 + (isNeutral ? 0 : 0.05)));
  const awayFormWR = Math.min(0.9, Math.max(0.1, 0.35 - eloDiff / 4000));
  const homeFormDR = 0.25;
  const gAvg = globalAvg ?? model.globalAvg ?? 1.35;
  const homeFormAvgGF = hAtk * gAvg;
  const awayFormAvgGF = aAtk * gAvg;
  const homeFormAvgGA = hDef * gAvg;

  const x = [
    hElo / 2500,
    aElo / 2500,
    eloDiff / 400,
    hAtk, hDef, aAtk, aDef,
    homeFormWR, awayFormWR, homeFormDR,
    homeFormAvgGF, awayFormAvgGF, homeFormAvgGA,
    isNeutral ? 1 : 0,
  ];

  // ── GB Prediction ──
  const logitHome = predictGB(model.models.homeWin, x);
  const logitDraw = predictGB(model.models.draw, x);
  const logitAway = predictGB(model.models.awayWin, x);

  const [pHome, pDraw, pAway] = softmax([logitHome, logitDraw, logitAway]);

  // ── xG dari GB Regressors ──
  let xGHome = predictGB(model.models.homeGoal, x);
  let xGAway = predictGB(model.models.awayGoal, x);

  // Clamp ke range realistis
  xGHome = Math.max(0.1, Math.min(5.0, xGHome));
  xGAway = Math.max(0.1, Math.min(4.5, xGAway));

  // ── Dixon-Coles untuk likely score ──
  const dc = scoreDistribution(xGHome, xGAway);

  // ── Blend ML probabilities + Dixon-Coles (80% ML, 20% DC) ──
  // Ini meningkatkan kalibrasi untuk pertandingan edge-case
  const finalPHome = pHome * 0.8 + dc.pHome * 0.2;
  const finalPDraw = pDraw * 0.8 + dc.pDraw * 0.2;
  const finalPAway = pAway * 0.8 + dc.pAway * 0.2;

  const total = finalPHome + finalPDraw + finalPAway;

  return {
    probabilities: {
      home: ((finalPHome / total) * 100).toFixed(1),
      draw: ((finalPDraw / total) * 100).toFixed(1),
      away: ((finalPAway / total) * 100).toFixed(1),
    },
    likelyHome: dc.likelyHome,
    likelyAway: dc.likelyAway,
    xG: {
      home: xGHome.toFixed(2),
      away: xGAway.toFixed(2),
    },
    confidenceSource: 'gradient-boosting + dixon-coles',
  };
};

export default generateMLPrediction;
