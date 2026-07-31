/**
 * ============================================================
 *  ADVANCED AI FOOTBALL PREDICTOR — GRADIENT BOOSTING TRAINER
 * ============================================================
 *  Metode: Gradient Boosted Decision Trees (XGBoost-style)
 *
 *  Pipeline:
 *  1. Baca results.csv, hitung Elo setiap tim secara kronologis.
 *  2. Feature Engineering — 14 fitur per pertandingan:
 *       - Elo difference, Home Elo, Away Elo
 *       - Home/Away attack & defense (Poisson)
 *       - Home/Away form skor (win rate 10 match terakhir)
 *       - Home/Away form gol (avg scored/conceded 10 match terakhir)
 *       - Tournament weight
 *       - Is neutral venue
 *  3. Latih 3 Gradient Boosting Classifier (multi-class):
 *       - Target 0: Home Win, 1: Draw, 2: Away Win
 *  4. Latih 2 Gradient Boosting Regressor:
 *       - Target: Expected home goals, expected away goals
 *  5. Simpan model (pohon keputusan) → mlModel.json
 *  6. Simpan teamRatings.json (Elo + Poisson, tetap untuk fallback)
 * ============================================================
 */

import fs   from 'fs';
import path from 'path';
import csv  from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CSV_FILE        = path.join(__dirname, '../results.csv');
const RATINGS_OUTPUT  = path.join(__dirname, '../src/data/teamRatings.json');
const ML_OUTPUT       = path.join(__dirname, '../src/data/mlModel.json');

// ── Konfigurasi ─────────────────────────────────────────────
const MIN_YEAR       = 1990;
const TRAIN_FROM     = 2000;   // Hanya latih GB dari data 2000+
const BASE_ELO       = 1500;
const HOME_ADVANTAGE = 50;
const DECAY_RATE     = 0.99;
const MIN_MATCHES    = 15;
const NOW_YEAR       = 2025;
const FORM_WINDOW    = 10;     // Jumlah pertandingan terakhir untuk fitur form

// Gradient Boosting config — balanced speed/accuracy
const GB_N_ESTIMATORS  = 50;   // 50 pohon sudah sangat kuat
const GB_MAX_DEPTH     = 3;    // kedalaman 3 lebih cepat, cukup expressive
const GB_LEARNING_RATE = 0.15;
const GB_SUBSAMPLE     = 0.6;  // 60% sampel per pohon
const GB_MAX_THRESHOLDS = 15;  // batasi kandidat split per fitur

// K-factor per turnamen
const K_FACTORS = {
  'FIFA World Cup':                  60,
  'UEFA Euro':                       50,
  'Copa América':                    50,
  'Africa Cup of Nations':           45,
  'AFC Asian Cup':                   45,
  'CONCACAF Gold Cup':               40,
  'FIFA Confederations Cup':         45,
  'FIFA World Cup qualification':    40,
  'UEFA Euro qualification':         35,
  'Copa América qualification':      35,
  'AFC Asian Cup qualification':     35,
  'Africa Cup of Nations qualification': 35,
  'CONCACAF Gold Cup qualification': 30,
  'UEFA Nations League':             35,
  'Friendly':                        20,
};

const getKFactor = (t) => {
  for (const [k, v] of Object.entries(K_FACTORS)) {
    if (t.includes(k)) return v;
  }
  return 30;
};

const goalDiffMultiplier = (gd) => {
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8;
};

const EXCLUDED_TEAMS = new Set([
  'Occitania','Padania','Northern Cyprus','Isle of Man','Tibet',
  'Chagos Islands','Provence','Yorkshire','Cascadia','Ellan Vannin',
  'Abkhazia','South Ossetia','Somaliland','Matabeleland',
  'Székely Land','Romani people','Sápmi','Iraqi Kurdistan',
  'Zanzibar','Balearic Islands','Greenland','Monaco','Vatican',
  'Ynys Môn','Alderney','Guernsey','Jersey','Kernow',
  'County of Nice','Brittany','Lapland','Western Sahara',
]);

const expectedScore = (homeElo, awayElo) =>
  1 / (1 + Math.pow(10, (awayElo - homeElo - HOME_ADVANTAGE) / 400));

// ════════════════════════════════════════════════════════════════
//  SECTION 1: DECISION TREE IMPLEMENTATION
// ════════════════════════════════════════════════════════════════

/**
 * Sebuah node dalam pohon keputusan.
 */
class TreeNode {
  constructor() {
    this.featureIdx  = null;  // indeks fitur untuk split
    this.threshold   = null;  // nilai ambang batas split
    this.left        = null;  // cabang kiri (value <= threshold)
    this.right       = null;  // cabang kanan (value > threshold)
    this.value       = null;  // nilai prediksi (hanya di leaf)
  }
}

/**
 * Hitung mean squared error untuk target residual.
 * Digunakan sebagai kriteria split.
 */
const mse = (values) => {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
};

/**
 * Cari split terbaik dari sekumpulan sampel pada fitur tertentu.
 * Mengembalikan { featureIdx, threshold, gain } terbaik.
 */
const findBestSplit = (X, residuals, featureIndices) => {
  let bestGain = -Infinity;
  let bestFeat = null;
  let bestThr  = null;

  const parentMSE = mse(residuals);

  for (const fi of featureIndices) {
    // Kumpulkan nilai unik, batasi ke GB_MAX_THRESHOLDS midpoints
    let vals = [...new Set(X.map(x => x[fi]))].sort((a, b) => a - b);

    // Sample evenly spaced thresholds if too many unique values
    if (vals.length > GB_MAX_THRESHOLDS + 1) {
      const step = (vals.length - 1) / GB_MAX_THRESHOLDS;
      const sampled = [];
      for (let s = 0; s <= GB_MAX_THRESHOLDS; s++) {
        sampled.push(vals[Math.min(Math.round(s * step), vals.length - 1)]);
      }
      vals = [...new Set(sampled)].sort((a, b) => a - b);
    }

    for (let i = 0; i < vals.length - 1; i++) {
      const thr = (vals[i] + vals[i + 1]) / 2;

      const leftRes  = residuals.filter((_, k) => X[k][fi] <= thr);
      const rightRes = residuals.filter((_, k) => X[k][fi] > thr);

      if (leftRes.length === 0 || rightRes.length === 0) continue;

      const gain = parentMSE
        - (leftRes.length  / residuals.length) * mse(leftRes)
        - (rightRes.length / residuals.length) * mse(rightRes);

      if (gain > bestGain) {
        bestGain = gain;
        bestFeat = fi;
        bestThr  = thr;
      }
    }
  }

  return { featureIdx: bestFeat, threshold: bestThr, gain: bestGain };
};

/**
 * Bangun satu pohon keputusan secara rekursif.
 * Pohon digunakan untuk memprediksi residual (error yang belum terjelaskan).
 */
const buildTree = (X, residuals, depth, maxDepth) => {
  const node = new TreeNode();

  // Kondisi berhenti: kedalaman maks atau sampel terlalu sedikit
  if (depth >= maxDepth || residuals.length <= 3) {
    node.value = residuals.reduce((s, v) => s + v, 0) / residuals.length;
    return node;
  }

  // Pilih subset fitur secara acak (seperti Random Forest / XGBoost)
  const nFeatures = X[0].length;
  const nToTry    = Math.max(1, Math.floor(Math.sqrt(nFeatures)));
  const featIdx   = [];
  while (featIdx.length < nToTry) {
    const r = Math.floor(Math.random() * nFeatures);
    if (!featIdx.includes(r)) featIdx.push(r);
  }

  const { featureIdx, threshold, gain } = findBestSplit(X, residuals, featIdx);

  if (featureIdx === null || gain <= 0) {
    node.value = residuals.reduce((s, v) => s + v, 0) / residuals.length;
    return node;
  }

  node.featureIdx = featureIdx;
  node.threshold  = threshold;

  const leftMask  = X.map(x => x[featureIdx] <= threshold);
  const leftX     = X.filter((_, k) => leftMask[k]);
  const leftRes   = residuals.filter((_, k) => leftMask[k]);
  const rightX    = X.filter((_, k) => !leftMask[k]);
  const rightRes  = residuals.filter((_, k) => !leftMask[k]);

  node.left  = buildTree(leftX,  leftRes,  depth + 1, maxDepth);
  node.right = buildTree(rightX, rightRes, depth + 1, maxDepth);

  return node;
};

/**
 * Prediksi nilai untuk satu sampel menggunakan satu pohon.
 */
const predictTree = (node, x) => {
  if (node.value !== null) return node.value;
  return x[node.featureIdx] <= node.threshold
    ? predictTree(node.left, x)
    : predictTree(node.right, x);
};

/**
 * Serialisasi tree ke objek polos (agar bisa disimpan ke JSON).
 */
const serializeTree = (node) => {
  if (!node) return null;
  if (node.value !== null) return { v: parseFloat(node.value.toFixed(5)) };
  return {
    f: node.featureIdx,
    t: parseFloat(node.threshold.toFixed(5)),
    l: serializeTree(node.left),
    r: serializeTree(node.right),
  };
};

/**
 * Prediksi dari tree yang sudah diserialisasi.
 */
const predictSerializedTree = (node, x) => {
  if ('v' in node) return node.v;
  return x[node.f] <= node.t
    ? predictSerializedTree(node.l, x)
    : predictSerializedTree(node.r, x);
};

// ════════════════════════════════════════════════════════════════
//  SECTION 2: GRADIENT BOOSTING TRAINER
// ════════════════════════════════════════════════════════════════

/**
 * Latih satu Gradient Boosting Regressor untuk satu target kontinu.
 * Mengembalikan array pohon yang sudah diserialisasi.
 */
const trainGBRegressor = (X, y, label) => {
  console.log(`  Training GB Regressor: ${label} (${X.length} samples)...`);

  const trees = [];
  const preds = new Array(X.length).fill(
    y.reduce((s, v) => s + v, 0) / y.length  // inisialisasi dengan mean
  );
  const initVal = preds[0];

  for (let iter = 0; iter < GB_N_ESTIMATORS; iter++) {
    // Hitung residual (gradient negatif untuk MSE = y - pred)
    const residuals = y.map((yi, i) => yi - preds[i]);

    // Subsample (random tanpa replacement)
    const nSamples = Math.floor(X.length * GB_SUBSAMPLE);
    const indices  = [];
    while (indices.length < nSamples) {
      const r = Math.floor(Math.random() * X.length);
      if (!indices.includes(r)) indices.push(r);
    }

    const subX = indices.map(i => X[i]);
    const subR = indices.map(i => residuals[i]);

    // Bangun pohon untuk mempelajari residual
    const tree = buildTree(subX, subR, 0, GB_MAX_DEPTH);

    // Update prediksi seluruh dataset
    for (let i = 0; i < X.length; i++) {
      preds[i] += GB_LEARNING_RATE * predictTree(tree, X[i]);
    }

    // Simpan pohon yang sudah diserialisasi
    trees.push(serializeTree(tree));

    if ((iter + 1) % 20 === 0) {
      const mseVal = y.reduce((s, yi, i) => s + (yi - preds[i]) ** 2, 0) / y.length;
      console.log(`    Iter ${iter + 1}/${GB_N_ESTIMATORS} | MSE: ${mseVal.toFixed(4)}`);
    }
  }

  return { initVal, trees };
};

/**
 * Inferensi satu sampel menggunakan model GB.
 */
const predictGB = (model, x) => {
  let pred = model.initVal;
  for (const tree of model.trees) {
    pred += GB_LEARNING_RATE * predictSerializedTree(tree, x);
  }
  return pred;
};

// ════════════════════════════════════════════════════════════════
//  SECTION 3: SOFTMAX (untuk klasifikasi multi-kelas)
// ════════════════════════════════════════════════════════════════

const softmax = (logits) => {
  const maxL = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - maxL));
  const sum  = exps.reduce((s, e) => s + e, 0);
  return exps.map(e => e / sum);
};

// ════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════
(async () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GRADIENT BOOSTING FOOTBALL PREDICTOR — TRAINING             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── 1. Load Data ──────────────────────────────────────────────
  console.log('📂 Loading results.csv...');
  const allMatches = await new Promise((resolve) => {
    const rows = [];
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', (row) => {
        const year      = parseInt(row.date.split('-')[0], 10);
        const homeScore = parseInt(row.home_score, 10);
        const awayScore = parseInt(row.away_score, 10);
        if (isNaN(homeScore) || isNaN(awayScore)) return;
        if (EXCLUDED_TEAMS.has(row.home_team) || EXCLUDED_TEAMS.has(row.away_team)) return;
        rows.push({
          date: row.date, year,
          homeTeam: row.home_team, awayTeam: row.away_team,
          homeScore, awayScore,
          tournament: row.tournament || '',
          neutral: row.neutral === 'TRUE',
        });
      })
      .on('end', () => {
        rows.sort((a, b) => a.date.localeCompare(b.date));
        resolve(rows);
      });
  });

  console.log(`✔ Loaded ${allMatches.length} matches.\n`);

  // ── 2. Elo Simulation ─────────────────────────────────────────
  console.log('⚡ Running Elo simulation...');
  const elo           = {};
  const lastYear      = {};
  const matchCount    = {};
  const wGoalsFor     = {};
  const wGoalsAgainst = {};
  const wTotal        = {};
  const recentForm    = {};

  // Rolling form window (deque per team)
  const formResults  = {};  // last N outcomes: { result, homeScore, awayScore }
  const formGoalsFor = {};
  const formGoalsAga = {};

  const getElo = (team) => elo[team] ?? BASE_ELO;

  const applyDecay = (team, currentYear) => {
    if (!(team in lastYear)) return;
    const yrs = currentYear - lastYear[team];
    if (yrs > 0) {
      elo[team] = getElo(team) + (BASE_ELO - getElo(team)) * (1 - Math.pow(DECAY_RATE, yrs));
    }
  };

  // Process all matches chronologically to build Elo + form rolling windows
  for (const m of allMatches) {
    if (m.year < MIN_YEAR) continue;
    const { homeTeam, awayTeam, homeScore, awayScore, year, tournament, neutral } = m;

    applyDecay(homeTeam, year);
    applyDecay(awayTeam, year);

    const homeElo = getElo(homeTeam);
    const awayElo = getElo(awayTeam);
    const exp     = neutral
      ? 1 / (1 + Math.pow(10, (awayElo - homeElo) / 400))
      : expectedScore(homeElo, awayElo);
    const act     = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;
    const K       = getKFactor(tournament);
    const GDM     = goalDiffMultiplier(Math.abs(homeScore - awayScore));
    const delta   = K * GDM * (act - exp);

    elo[homeTeam] = homeElo + delta;
    elo[awayTeam] = awayElo - delta;
    lastYear[homeTeam] = year;
    lastYear[awayTeam] = year;
    matchCount[homeTeam] = (matchCount[homeTeam] || 0) + 1;
    matchCount[awayTeam] = (matchCount[awayTeam] || 0) + 1;

    const ageYrs = NOW_YEAR - year;
    const timeW  = Math.pow(0.5, ageYrs / 4);
    const tornW  = K / 30;
    const w      = timeW * tornW;

    for (const [team, scored, conceded] of [
      [homeTeam, homeScore, awayScore],
      [awayTeam, awayScore, homeScore],
    ]) {
      wGoalsFor[team]    = (wGoalsFor[team] || 0) + scored * w;
      wGoalsAgainst[team] = (wGoalsAgainst[team] || 0) + conceded * w;
      wTotal[team]       = (wTotal[team] || 0) + w;

      if (!formResults[team])  formResults[team]  = [];
      if (!formGoalsFor[team]) formGoalsFor[team] = [];
      if (!formGoalsAga[team]) formGoalsAga[team] = [];
      if (!recentForm[team])   recentForm[team]   = [];

      const result = team === homeTeam
        ? (homeScore > awayScore ? 'W' : homeScore === awayScore ? 'D' : 'L')
        : (awayScore > homeScore ? 'W' : homeScore === awayScore ? 'D' : 'L');

      formResults[team].push(result);
      formGoalsFor[team].push(team === homeTeam ? homeScore : awayScore);
      formGoalsAga[team].push(team === homeTeam ? awayScore : homeScore);

      // Keep last FORM_WINDOW only
      if (formResults[team].length > FORM_WINDOW) {
        formResults[team].shift();
        formGoalsFor[team].shift();
        formGoalsAga[team].shift();
      }

      if (m.year >= NOW_YEAR - 2) {
        recentForm[team].push(result);
        if (recentForm[team].length > 5) recentForm[team].shift();
      }
    }
  }

  console.log('✔ Elo simulation done.\n');

  // ── 3. Compute global avg + Poisson ratings ───────────────────
  let totalWGoals = 0, totalW = 0;
  for (const team of Object.keys(wTotal)) {
    if ((matchCount[team] || 0) < MIN_MATCHES) continue;
    totalWGoals += wGoalsFor[team];
    totalW      += wTotal[team];
  }
  const globalAvg = totalWGoals / totalW;
  console.log(`  Global avg goals/team/match: ${globalAvg.toFixed(4)}`);

  const teamStats = {};
  for (const [team, count] of Object.entries(matchCount)) {
    if (count < MIN_MATCHES || EXCLUDED_TEAMS.has(team)) continue;
    const atk = (wGoalsFor[team] / wTotal[team]) / globalAvg;
    const def = (wGoalsAgainst[team] / wTotal[team]) / globalAvg;
    teamStats[team] = { elo: Math.round(getElo(team)), atk, def };
  }

  // ── 4. Feature Engineering ────────────────────────────────────
  console.log('\n🔧 Building feature matrix...');

  const getFormWinRate = (team) => {
    const res = formResults[team] || [];
    if (res.length === 0) return 0.4;
    return res.filter(r => r === 'W').length / res.length;
  };

  const getFormDrawRate = (team) => {
    const res = formResults[team] || [];
    if (res.length === 0) return 0.25;
    return res.filter(r => r === 'D').length / res.length;
  };

  const getFormAvgGoalsFor = (team) => {
    const g = formGoalsFor[team] || [];
    if (g.length === 0) return globalAvg;
    return g.reduce((s, v) => s + v, 0) / g.length;
  };

  const getFormAvgGoalsAgainst = (team) => {
    const g = formGoalsAga[team] || [];
    if (g.length === 0) return globalAvg;
    return g.reduce((s, v) => s + v, 0) / g.length;
  };

  /**
   * Buat vektor fitur untuk satu pertandingan.
   * Fitur ini digunakan saat TRAINING (dari data historis) DAN INFERENSI (dari browser).
   *
   * Feature vector (14 dimensi):
   * [0]  homeElo (normalized: /2500)
   * [1]  awayElo (normalized)
   * [2]  eloDiff = (homeElo - awayElo) / 400
   * [3]  homeAtk (Poisson attack strength)
   * [4]  homeDef (Poisson defense strength, inverted: low = better)
   * [5]  awayAtk
   * [6]  awayDef
   * [7]  homeFormWinRate
   * [8]  awayFormWinRate
   * [9]  homeFormDrawRate
   * [10] homeFormAvgGF
   * [11] awayFormAvgGF
   * [12] homeFormAvgGA
   * [13] isNeutral (0/1)
   */
  const buildFeatureVector = (homeTeam, awayTeam, isNeutral, homeSnap, awaySnap) => {
    const hElo = homeSnap.elo;
    const aElo = awaySnap.elo;
    return [
      hElo / 2500,
      aElo / 2500,
      (hElo - aElo) / 400,
      homeSnap.atk,
      homeSnap.def,
      awaySnap.atk,
      awaySnap.def,
      getFormWinRate(homeTeam),
      getFormWinRate(awayTeam),
      getFormDrawRate(homeTeam),
      getFormAvgGoalsFor(homeTeam),
      getFormAvgGoalsFor(awayTeam),
      getFormAvgGoalsAgainst(homeTeam),
      isNeutral ? 1 : 0,
    ];
  };

  // Build training dataset from matches >= TRAIN_FROM
  const X = [];
  const yOutcome = []; // 0=HomeWin, 1=Draw, 2=AwayWin
  const yHomeGoals = [];
  const yAwayGoals = [];

  // Track Elo snapshots at the time of each match
  const eloSnap = {};
  const fwSnap  = {};
  const fdSnap  = {};
  const fgfSnap = {};
  const fgaSnap = {};

  // Re-run chronologically to capture snapshots at match time
  const eloAtTime = {};
  const formAtTime = {};
  const fgfAtTime  = {};
  const fgaAtTime  = {};

  // Reset Elo for re-simulation
  const elo2 = {};
  const lastYear2 = {};
  const form2 = {};
  const fgf2  = {};
  const fga2  = {};

  const getElo2 = (t) => elo2[t] ?? BASE_ELO;
  const applyDecay2 = (t, yr) => {
    if (!(t in lastYear2)) return;
    const yrs = yr - lastYear2[t];
    if (yrs > 0) elo2[t] = getElo2(t) + (BASE_ELO - getElo2(t)) * (1 - Math.pow(DECAY_RATE, yrs));
  };

  for (const m of allMatches) {
    const { homeTeam, awayTeam, homeScore, awayScore, year, tournament, neutral } = m;
    if (m.year < MIN_YEAR) continue;

    applyDecay2(homeTeam, year);
    applyDecay2(awayTeam, year);

    const homeElo = getElo2(homeTeam);
    const awayElo = getElo2(awayTeam);

    // Capture snapshots for feature building
    const hStats  = teamStats[homeTeam];
    const aStats  = teamStats[awayTeam];

    if (m.year >= TRAIN_FROM && hStats && aStats) {
      const hSnap = { elo: homeElo, atk: hStats.atk, def: hStats.def };
      const aSnap = { elo: awayElo, atk: aStats.atk, def: aStats.def };

      const fv = buildFeatureVector(homeTeam, awayTeam, neutral, hSnap, aSnap);
      X.push(fv);

      const outcome = homeScore > awayScore ? 0 : homeScore === awayScore ? 1 : 2;
      yOutcome.push(outcome);
      yHomeGoals.push(homeScore);
      yAwayGoals.push(awayScore);
    }

    // Update Elo
    const exp2  = neutral
      ? 1 / (1 + Math.pow(10, (awayElo - homeElo) / 400))
      : expectedScore(homeElo, awayElo);
    const act2  = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;
    const K2    = getKFactor(tournament);
    const GDM2  = goalDiffMultiplier(Math.abs(homeScore - awayScore));
    const d2    = K2 * GDM2 * (act2 - exp2);
    elo2[homeTeam] = homeElo + d2;
    elo2[awayTeam] = awayElo - d2;
    lastYear2[homeTeam] = year;
    lastYear2[awayTeam] = year;

    // Update form windows
    for (const [t, sc, cc] of [[homeTeam, homeScore, awayScore], [awayTeam, awayScore, homeScore]]) {
      if (!form2[t]) { form2[t] = []; fgf2[t] = []; fga2[t] = []; }
      const res = t === homeTeam
        ? (homeScore > awayScore ? 'W' : homeScore === awayScore ? 'D' : 'L')
        : (awayScore > homeScore ? 'W' : homeScore === awayScore ? 'D' : 'L');
      form2[t].push(res); fgf2[t].push(sc); fga2[t].push(cc);
      if (form2[t].length > FORM_WINDOW) { form2[t].shift(); fgf2[t].shift(); fga2[t].shift(); }
    }
  }

  console.log(`✔ Feature matrix built: ${X.length} training samples, 14 features each.\n`);

  // ── 5. Train Models ───────────────────────────────────────────
  console.log('🤖 Training Gradient Boosting models...\n');

  // For multi-class (outcome: 0/1/2), we use One-vs-Rest:
  // Train 3 binary regressors (one per class), then softmax.
  const y0 = yOutcome.map(v => v === 0 ? 1 : 0);  // HomeWin vs rest
  const y1 = yOutcome.map(v => v === 1 ? 1 : 0);  // Draw vs rest
  const y2 = yOutcome.map(v => v === 2 ? 1 : 0);  // AwayWin vs rest

  const modelHomeWin  = trainGBRegressor(X, y0, 'Home Win');
  const modelDraw     = trainGBRegressor(X, y1, 'Draw');
  const modelAwayWin  = trainGBRegressor(X, y2, 'Away Win');
  const modelHomeGoal = trainGBRegressor(X, yHomeGoals.map(v => Math.min(v, 8)), 'Home Goals');
  const modelAwayGoal = trainGBRegressor(X, yAwayGoals.map(v => Math.min(v, 8)), 'Away Goals');

  console.log('\n📊 Evaluating accuracy on training set (last 5000 samples)...');
  const evalSet = X.slice(-5000);
  const evalOut = yOutcome.slice(-5000);
  let correct = 0;
  for (let i = 0; i < evalSet.length; i++) {
    const logits = [
      predictGB(modelHomeWin, evalSet[i]),
      predictGB(modelDraw, evalSet[i]),
      predictGB(modelAwayWin, evalSet[i]),
    ];
    const pred = logits.indexOf(Math.max(...logits));
    if (pred === evalOut[i]) correct++;
  }
  console.log(`✔ Training accuracy (last 5000): ${(correct / evalSet.length * 100).toFixed(1)}%`);

  // ── 6. Build teamRatings.json (Elo + Poisson, same as before) ─
  const teamRatings = {};
  const aiPowerRanking = [];

  for (const [team, count] of Object.entries(matchCount)) {
    if (count < MIN_MATCHES || EXCLUDED_TEAMS.has(team)) continue;
    if (!wTotal[team]) continue;
    const avgScored   = wGoalsFor[team] / wTotal[team];
    const avgConceded = wGoalsAgainst[team] / wTotal[team];
    const attack      = avgScored / globalAvg;
    const defense     = avgConceded / globalAvg;
    const teamElo     = Math.round(getElo(team));
    const eloPower    = Math.min(99, Math.max(10, Math.round((teamElo - 1000) / 10)));
    const atkBonus    = Math.round((attack - 1) * 10);
    const defBonus    = Math.round((1 - defense) * 10);
    let powerIndex    = Math.round(eloPower * 0.7 + (50 + atkBonus + defBonus) * 0.3);
    powerIndex        = Math.min(99, Math.max(10, powerIndex));

    teamRatings[team] = { elo: teamElo, attack, defense, powerIndex, matchesAnalyzed: count };
    aiPowerRanking.push({
      name: team, elo: teamElo, powerIndex,
      attack: attack.toFixed(3), defense: defense.toFixed(3),
      form: (recentForm[team] || []).join(''), matches: count,
    });
  }

  aiPowerRanking.sort((a, b) => b.elo - a.elo || b.powerIndex - a.powerIndex);

  fs.writeFileSync(RATINGS_OUTPUT, JSON.stringify({
    modelVersion: 'gradient-boosting-v1',
    algorithm: 'Gradient Boosting (XGBoost-style) + Elo + Dixon-Coles correction',
    globalAvgGoalsPerTeam: globalAvg,
    homeAdvantageElo: HOME_ADVANTAGE,
    teamRatings,
    aiPowerRanking: aiPowerRanking.slice(0, 150),
  }, null, 2));

  console.log(`\n✔ teamRatings.json saved (${aiPowerRanking.length} teams)`);

  // ── 7. Save ML model ─────────────────────────────────────────
  const mlModelData = {
    version: 'gradient-boosting-v1',
    nEstimators: GB_N_ESTIMATORS,
    maxDepth: GB_MAX_DEPTH,
    learningRate: GB_LEARNING_RATE,
    trainSamples: X.length,
    features: [
      'homeElo_norm','awayElo_norm','eloDiff_norm',
      'homeAtk','homeDef','awayAtk','awayDef',
      'homeFormWR','awayFormWR','homeFormDR',
      'homeFormAvgGF','awayFormAvgGF','homeFormAvgGA',
      'isNeutral',
    ],
    models: {
      homeWin:  modelHomeWin,
      draw:     modelDraw,
      awayWin:  modelAwayWin,
      homeGoal: modelHomeGoal,
      awayGoal: modelAwayGoal,
    },
    globalAvg,
  };

  fs.writeFileSync(ML_OUTPUT, JSON.stringify(mlModelData));
  const mlSizeKB = Math.round(fs.statSync(ML_OUTPUT).size / 1024);

  console.log(`✔ mlModel.json saved (${mlSizeKB} KB)`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TRAINING COMPLETE ✅  — Gradient Boosting Model Ready!       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('  🏆 Top 10 Teams:');
  aiPowerRanking.slice(0, 10).forEach((t, i) =>
    console.log(`    ${String(i+1).padStart(2)}. ${t.name.padEnd(24)} Elo:${String(t.elo).padStart(5)}  Power:${t.powerIndex}`)
  );
})();
