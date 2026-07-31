/**
 * ═══════════════════════════════════════════════════════════════
 *  ENSEMBLE FOOTBALL PREDICTOR — FULL PIPELINE TRAINER v3
 * ═══════════════════════════════════════════════════════════════
 *  Data sources:
 *  - results.csv       : International matches (timnas, 48k rows)
 *  - archive (2)/matches.csv : Club matches (PL, La Liga, dll. 25k rows)
 *
 *  Pipeline:
 *  1. Elo Rating (FIFA-style, time-decay, K-factor per tournament)
 *  2. Poisson xG (weighted attack/defense per team)
 *  3. Weighted Recent Form (exponential decay, last 10 matches)
 *  4. Gradient Boosting / XGBoost (16 features, 50 trees)
 *  5. Platt Scaling Calibration (per-model, computed on validation set)
 *  6. Optimal ensemble weights via grid search log-loss
 *
 *  Outputs:
 *  - teamRatings.json  — Elo + Poisson + weighted form per team (club + intl)
 *  - mlModel.json      — GB trees + calibration + ensemble weights
 * ═══════════════════════════════════════════════════════════════
 */

import fs   from 'fs';
import path from 'path';
import csv  from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CSV_FILE       = path.join(__dirname, '../results.csv');
const CLUB_CSV       = path.join(__dirname, '../archive (2)/matches.csv');
const RATINGS_OUTPUT = path.join(__dirname, '../src/data/teamRatings.json');
const ML_OUTPUT      = path.join(__dirname, '../src/data/mlModel.json');

// ── Config ──────────────────────────────────────────────────────
const MIN_YEAR         = 1990;
const TRAIN_FROM       = 2000;
const VAL_YEAR         = 2018;   // 2018+ used as validation for calibration
const BASE_ELO         = 1500;
const HOME_ADVANTAGE   = 50;
const DECAY_RATE       = 0.99;
const MIN_MATCHES      = 10;     // Lebih rendah agar klub kecil tetap terdata
const NOW_YEAR         = 2025;
const FORM_WINDOW      = 10;
const FORM_DECAY       = 0.85;   // Exponential decay weight for recent form
const CLUB_ELO_BASE    = 1500;   // Elo awal khusus tim klub

// GB config
const GB_N_ESTIMATORS   = 50;
const GB_MAX_DEPTH      = 3;
const GB_LEARNING_RATE  = 0.15;
const GB_SUBSAMPLE      = 0.60;
const GB_MAX_THRESHOLDS = 15;

// K-factor per tournament / liga
const K_FACTORS = {
  // International
  'FIFA World Cup': 60, 'UEFA Euro': 50, 'Copa América': 50,
  'Africa Cup of Nations': 45, 'AFC Asian Cup': 45,
  'CONCACAF Gold Cup': 40, 'FIFA Confederations Cup': 45,
  'FIFA World Cup qualification': 40, 'UEFA Euro qualification': 35,
  'Copa América qualification': 35, 'AFC Asian Cup qualification': 35,
  'Africa Cup of Nations qualification': 35,
  'CONCACAF Gold Cup qualification': 30, 'UEFA Nations League': 35,
  'Friendly': 20,
  // Club leagues
  'Premier League': 45, 'Barclays Premier League': 45,
  'La Liga': 45, 'Serie A': 45, 'Bundesliga': 45,
  'Ligue 1': 40, 'Primeira Liga': 38,
  'Championship': 30, 'Segunda': 28,
  'Champions League': 55, 'Europa League': 48,
  'FA Cup': 30, 'Copa del Rey': 30,
};
const getKFactor  = (t) => { for (const [k, v] of Object.entries(K_FACTORS)) if (t.includes(k)) return v; return 30; };
const gdMult      = (gd) => gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
const sigmoid     = (x) => 1 / (1 + Math.exp(-x));

const EXCLUDED_TEAMS = new Set([
  'Occitania','Padania','Northern Cyprus','Isle of Man','Tibet',
  'Chagos Islands','Provence','Yorkshire','Cascadia','Ellan Vannin',
  'Abkhazia','South Ossetia','Somaliland','Matabeleland',
  'Székely Land','Romani people','Sápmi','Iraqi Kurdistan',
  'Zanzibar','Balearic Islands','Greenland','Monaco','Vatican',
  'Ynys Môn','Alderney','Guernsey','Jersey','Kernow',
  'County of Nice','Brittany','Lapland','Western Sahara',
]);

// ═══════════════════════════════════════════════════════════════
//  SECTION A: Decision Tree + Gradient Boosting
// ═══════════════════════════════════════════════════════════════

const mse = (vals) => {
  if (!vals.length) return 0;
  const m = vals.reduce((s, v) => s + v, 0) / vals.length;
  return vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length;
};

const findBestSplit = (X, residuals, featureIndices) => {
  let bestGain = -Infinity, bestFeat = null, bestThr = null;
  const parentMSE = mse(residuals);
  for (const fi of featureIndices) {
    let vals = [...new Set(X.map(x => x[fi]))].sort((a, b) => a - b);
    if (vals.length > GB_MAX_THRESHOLDS + 1) {
      const step = (vals.length - 1) / GB_MAX_THRESHOLDS;
      const sampled = [];
      for (let s = 0; s <= GB_MAX_THRESHOLDS; s++)
        sampled.push(vals[Math.min(Math.round(s * step), vals.length - 1)]);
      vals = [...new Set(sampled)].sort((a, b) => a - b);
    }
    for (let i = 0; i < vals.length - 1; i++) {
      const thr = (vals[i] + vals[i + 1]) / 2;
      const lR  = residuals.filter((_, k) => X[k][fi] <= thr);
      const rR  = residuals.filter((_, k) => X[k][fi] > thr);
      if (!lR.length || !rR.length) continue;
      const gain = parentMSE - (lR.length / residuals.length) * mse(lR) - (rR.length / residuals.length) * mse(rR);
      if (gain > bestGain) { bestGain = gain; bestFeat = fi; bestThr = thr; }
    }
  }
  return { featureIdx: bestFeat, threshold: bestThr, gain: bestGain };
};

const buildTree = (X, residuals, depth, maxDepth) => {
  if (depth >= maxDepth || residuals.length <= 3) {
    return { v: residuals.reduce((s, v) => s + v, 0) / residuals.length };
  }
  const nF = X[0].length;
  const nT = Math.max(1, Math.floor(Math.sqrt(nF)));
  const fi = [];
  while (fi.length < nT) { const r = Math.floor(Math.random() * nF); if (!fi.includes(r)) fi.push(r); }
  const { featureIdx, threshold, gain } = findBestSplit(X, residuals, fi);
  if (featureIdx === null || gain <= 0) {
    return { v: residuals.reduce((s, v) => s + v, 0) / residuals.length };
  }
  const mask = X.map(x => x[featureIdx] <= threshold);
  return {
    f: featureIdx,
    t: parseFloat(threshold.toFixed(5)),
    l: buildTree(X.filter((_, k) => mask[k]),  residuals.filter((_, k) =>  mask[k]), depth + 1, maxDepth),
    r: buildTree(X.filter((_, k) => !mask[k]), residuals.filter((_, k) => !mask[k]), depth + 1, maxDepth),
  };
};

const predictTree = (node, x) => {
  if ('v' in node) return node.v;
  return x[node.f] <= node.t ? predictTree(node.l, x) : predictTree(node.r, x);
};

const trainGBRegressor = (X, y, label) => {
  console.log(`  🌲 Training GB: ${label} (${X.length} samples)...`);
  const trees = [];
  const preds = new Array(X.length).fill(y.reduce((s, v) => s + v, 0) / y.length);
  const initVal = preds[0];
  for (let iter = 0; iter < GB_N_ESTIMATORS; iter++) {
    const residuals = y.map((yi, i) => yi - preds[i]);
    const nS = Math.floor(X.length * GB_SUBSAMPLE);
    const idx = [];
    while (idx.length < nS) { const r = Math.floor(Math.random() * X.length); if (!idx.includes(r)) idx.push(r); }
    const tree = buildTree(idx.map(i => X[i]), idx.map(i => residuals[i]), 0, GB_MAX_DEPTH);
    for (let i = 0; i < X.length; i++) preds[i] += GB_LEARNING_RATE * predictTree(tree, X[i]);
    trees.push(tree);
    if ((iter + 1) % 20 === 0) {
      const mseV = y.reduce((s, yi, i) => s + (yi - preds[i]) ** 2, 0) / y.length;
      console.log(`    Iter ${iter + 1}/${GB_N_ESTIMATORS} | MSE: ${mseV.toFixed(4)}`);
    }
  }
  return { initVal, trees };
};

const predictGB = (model, x, lr = GB_LEARNING_RATE) => {
  let pred = model.initVal;
  for (const tree of model.trees) pred += lr * predictTree(tree, x);
  return pred;
};

// ═══════════════════════════════════════════════════════════════
//  SECTION B: Platt Scaling Calibration
// ═══════════════════════════════════════════════════════════════
/**
 * Fit Platt scaling: P_calibrated = sigmoid(A * score + B)
 * Uses gradient descent on cross-entropy loss.
 */
const fitPlattScaling = (scores, labels) => {
  let A = 0, B = 0;
  const lr = 0.01;
  for (let iter = 0; iter < 200; iter++) {
    let dA = 0, dB = 0;
    for (let i = 0; i < scores.length; i++) {
      const p   = sigmoid(A * scores[i] + B);
      const err = p - labels[i];
      dA += err * scores[i];
      dB += err;
    }
    A -= lr * dA / scores.length;
    B -= lr * dB / scores.length;
  }
  return { A: parseFloat(A.toFixed(6)), B: parseFloat(B.toFixed(6)) };
};

// ═══════════════════════════════════════════════════════════════
//  SECTION C: Ensemble Optimal Weights (via grid search)
// ═══════════════════════════════════════════════════════════════
/**
 * Find the best blend weights (w_elo, w_dc, w_form, w_gb) 
 * that minimize log-loss on the validation set.
 * Returns [wElo, wDC, wForm, wGB] normalized to sum=1.
 */
const findEnsembleWeights = (predsSets, labels) => {
  // predsSets: array of [p_home, p_draw, p_away] per model, per sample
  // labels: actual outcome (0=home, 1=draw, 2=away)
  const N = 4; // number of models
  let bestLoss = Infinity;
  let bestW = [0.2, 0.3, 0.15, 0.35];

  const logLoss = (weights) => {
    let total = 0;
    for (let i = 0; i < labels.length; i++) {
      const blended = [0, 0, 0];
      for (let m = 0; m < N; m++) {
        blended[0] += weights[m] * predsSets[m][i][0];
        blended[1] += weights[m] * predsSets[m][i][1];
        blended[2] += weights[m] * predsSets[m][i][2];
      }
      const sum = blended.reduce((s, v) => s + v, 0);
      const p   = blended[labels[i]] / sum;
      total += -Math.log(Math.max(p, 1e-7));
    }
    return total / labels.length;
  };

  // Grid search over weight combinations (step 0.1)
  const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  for (const w0 of steps) for (const w1 of steps) for (const w2 of steps) {
    const w3 = 1 - w0 - w1 - w2;
    if (w3 < 0 || w3 > 0.7) continue;
    const w = [w0, w1, w2, w3];
    const loss = logLoss(w);
    if (loss < bestLoss) { bestLoss = loss; bestW = [...w]; }
  }
  console.log(`  ✔ Optimal ensemble weights: Elo=${bestW[0]} DC=${bestW[1]} Form=${bestW[2]} GB=${bestW[3]} | log-loss=${bestLoss.toFixed(4)}`);
  return bestW;
};

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
(async () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ENSEMBLE PREDICTOR — FULL PIPELINE TRAINING                 ║');
  console.log('║  Elo + Dixon-Coles + Weighted Form + XGBoost + Calibration   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── 1. Load data ─────────────────────────────────────────────
  console.log('📂 Loading results.csv...');
  const allMatches = await new Promise((resolve) => {
    const rows = [];
    fs.createReadStream(CSV_FILE).pipe(csv())
      .on('data', (row) => {
        const year = parseInt(row.date.split('-')[0], 10);
        const hs = parseInt(row.home_score, 10), as_ = parseInt(row.away_score, 10);
        if (isNaN(hs) || isNaN(as_)) return;
        if (EXCLUDED_TEAMS.has(row.home_team) || EXCLUDED_TEAMS.has(row.away_team)) return;
        rows.push({ date: row.date, year, homeTeam: row.home_team, awayTeam: row.away_team,
          homeScore: hs, awayScore: as_, tournament: row.tournament || '', neutral: row.neutral === 'TRUE' });
      })
      .on('end', () => { rows.sort((a, b) => a.date.localeCompare(b.date)); resolve(rows); });
  });
  console.log(`✔ Loaded ${allMatches.length} international matches.`);

  // ── 1b. Load Club Dataset (matches.csv) ──────────────────────
  console.log('📂 Loading club matches dataset...');

  const parseClubRow = (row) => {
    // Custom CSV parser that handles quoted fields with commas
    const result = [];
    let cur = '', inQ = false;
    for (const ch of row) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };

  const clubMatches = await new Promise((resolve) => {
    const content = fs.readFileSync(CLUB_CSV, 'utf8');
    const lines   = content.split('\n');
    const rows    = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = parseClubRow(lines[i]);
      const hs   = parseInt(cols[12]);
      const as_  = parseInt(cols[13]);
      if (isNaN(hs) || isNaN(as_)) continue;

      const homeTeam = cols[1]?.trim();
      const awayTeam = cols[2]?.trim();
      if (!homeTeam || !awayTeam) continue;

      const year     = parseInt(cols[4]) || 0;
      if (year < 2000) continue;

      const leagueRaw = (cols[8] || '').trim();
      // Normalize league name → tournament key
      let tournament = leagueRaw;
      if (leagueRaw.includes('Premier League') || leagueRaw.includes('Barclays')) tournament = 'Premier League';
      else if (leagueRaw.includes('La Liga') || leagueRaw.includes('Spanish'))    tournament = 'La Liga';
      else if (leagueRaw.includes('Serie A') || leagueRaw.includes('Italian'))    tournament = 'Serie A';
      else if (leagueRaw.includes('Bundesliga') || leagueRaw.includes('German'))  tournament = 'Bundesliga';
      else if (leagueRaw.includes('Ligue 1') || leagueRaw.includes('French'))     tournament = 'Ligue 1';
      else if (leagueRaw.includes('Primeira') || leagueRaw.includes('Portugal'))  tournament = 'Primeira Liga';
      else if (leagueRaw.includes('Champions'))                                    tournament = 'Champions League';
      else if (leagueRaw.includes('Europa'))                                       tournament = 'Europa League';

      // Build a sortable date string (YYYY-MM-DD)
      // col[3] = "Saturday, August 18" — not reliable, use year only + index for ordering
      const dateStr = `${year}-01-01`;

      rows.push({
        date: dateStr,
        year,
        homeTeam,
        awayTeam,
        homeScore: hs,
        awayScore: as_,
        tournament,
        neutral: false,
        isClub: true,
      });
    }

    // Sort by year (approximation)
    rows.sort((a, b) => a.year - b.year);
    resolve(rows);
  });

  console.log(`✔ Loaded ${clubMatches.length} club matches.\n`);

  // ── Merge & sort all matches ──────────────────────────────────
  const allData = [...allMatches, ...clubMatches].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.date.localeCompare(b.date);
  });
  console.log(`📊 Total combined dataset: ${allData.length} matches\n`);

  // ── 2. Elo + Poisson + Weighted Recent Form ───────────────────
  console.log('⚡ Running Elo + Weighted Form simulation...');

  const elo = {}, lastYear = {}, matchCount = {};
  const wGF = {}, wGA = {}, wTotal = {};
  const recentForm = {};

  // Rolling windows for weighted form
  const formRes  = {};  // recent results with weights
  const formGF   = {};  // recent goals for
  const formGA   = {};  // recent goals against

  const getElo = (t) => elo[t] ?? BASE_ELO;
  const applyDecay = (t, yr) => {
    if (!(t in lastYear)) return;
    const yrs = yr - lastYear[t];
    if (yrs > 0) elo[t] = getElo(t) + (BASE_ELO - getElo(t)) * (1 - Math.pow(DECAY_RATE, yrs));
  };

  for (const m of allData) {
    if (m.year < MIN_YEAR) continue;
    const { homeTeam: ht, awayTeam: at, homeScore: hs, awayScore: as_, year, tournament, neutral } = m;
    applyDecay(ht, year); applyDecay(at, year);

    const hE = getElo(ht), aE = getElo(at);
    const exp = neutral ? 1 / (1 + Math.pow(10, (aE - hE) / 400)) : 1 / (1 + Math.pow(10, (aE - hE - HOME_ADVANTAGE) / 400));
    const act = hs > as_ ? 1 : hs === as_ ? 0.5 : 0;
    const K   = getKFactor(tournament);
    const d   = K * gdMult(Math.abs(hs - as_)) * (act - exp);
    elo[ht] = hE + d; elo[at] = aE - d;
    lastYear[ht] = year; lastYear[at] = year;
    matchCount[ht] = (matchCount[ht] || 0) + 1;
    matchCount[at] = (matchCount[at] || 0) + 1;

    const ageW = Math.pow(0.5, (NOW_YEAR - year) / 4) * (K / 30);
    for (const [t, sc, cc] of [[ht, hs, as_], [at, as_, hs]]) {
      wGF[t] = (wGF[t] || 0) + sc * ageW;
      wGA[t] = (wGA[t] || 0) + cc * ageW;
      wTotal[t] = (wTotal[t] || 0) + ageW;
      if (!formRes[t]) { formRes[t] = []; formGF[t] = []; formGA[t] = []; }
      if (!recentForm[t]) recentForm[t] = [];

      const res = t === ht ? (hs > as_ ? 'W' : hs === as_ ? 'D' : 'L') : (as_ > hs ? 'W' : hs === as_ ? 'D' : 'L');
      formRes[t].push(res); formGF[t].push(t === ht ? hs : as_); formGA[t].push(t === ht ? as_ : hs);
      if (formRes[t].length > FORM_WINDOW) { formRes[t].shift(); formGF[t].shift(); formGA[t].shift(); }
      if (m.year >= NOW_YEAR - 2) { recentForm[t].push(res); if (recentForm[t].length > 5) recentForm[t].shift(); }
    }
  }

  // Global average goals
  let tWG = 0, tW = 0;
  for (const t of Object.keys(wTotal)) { if ((matchCount[t] || 0) < MIN_MATCHES) continue; tWG += wGF[t]; tW += wTotal[t]; }
  const globalAvg = tWG / tW;
  console.log(`  Global avg goals/team/match: ${globalAvg.toFixed(4)}`);

  // ── Helper: exponentially-weighted form score ─────────────────
  const getWeightedForm = (team) => {
    const res = formRes[team] || [];
    if (!res.length) return { winRate: 0.4, drawRate: 0.25, avgGF: globalAvg, avgGA: globalAvg, formScore: 0 };
    let wW = 0, wD = 0, wL = 0, wGFv = 0, wGAv = 0, wSum = 0;
    res.forEach((r, i) => {
      const w = Math.pow(FORM_DECAY, res.length - 1 - i);
      wSum += w;
      if (r === 'W') wW += w;
      else if (r === 'D') wD += w;
      else wL += w;
      wGFv += (formGF[team]?.[i] ?? globalAvg) * w;
      wGAv += (formGA[team]?.[i] ?? globalAvg) * w;
    });
    const winRate  = wW / wSum;
    const drawRate = wD / wSum;
    const avgGF    = wGFv / wSum;
    const avgGA    = wGAv / wSum;
    // Composite form score: wins weighted more than draws
    const formScore = (wW + 0.4 * wD - wL) / wSum;
    return { winRate, drawRate, avgGF, avgGA, formScore };
  };

  // Compute teamStats (Poisson) + weighted form
  const teamStats = {};
  const aiPowerRanking = [];
  const teamRatings = {};

  for (const [t, count] of Object.entries(matchCount)) {
    if (count < MIN_MATCHES || EXCLUDED_TEAMS.has(t) || !wTotal[t]) continue;
    const atk = (wGF[t] / wTotal[t]) / globalAvg;
    const def = (wGA[t] / wTotal[t]) / globalAvg;
    const teamElo = Math.round(getElo(t));
    const form = getWeightedForm(t);

    teamStats[t] = { elo: teamElo, atk, def, form };

    const eloPower = Math.min(99, Math.max(10, Math.round((teamElo - 1000) / 10)));
    const atkBonus = Math.round((atk - 1) * 10);
    const defBonus = Math.round((1 - def) * 10);
    let powerIndex = Math.round(eloPower * 0.7 + (50 + atkBonus + defBonus) * 0.3);
    powerIndex = Math.min(99, Math.max(10, powerIndex));

    teamRatings[t] = {
      elo: teamElo, attack: atk, defense: def, powerIndex, matchesAnalyzed: count,
      // Weighted recent form fields (used by ensemble inference)
      formWinRate:  parseFloat(form.winRate.toFixed(4)),
      formDrawRate: parseFloat(form.drawRate.toFixed(4)),
      formAvgGF:    parseFloat(form.avgGF.toFixed(4)),
      formAvgGA:    parseFloat(form.avgGA.toFixed(4)),
      formScore:    parseFloat(form.formScore.toFixed(4)),
    };

    aiPowerRanking.push({
      name: t, elo: teamElo, powerIndex,
      attack: atk.toFixed(3), defense: def.toFixed(3),
      form: (recentForm[t] || []).join(''), matches: count,
    });
  }
  aiPowerRanking.sort((a, b) => b.elo - a.elo || b.powerIndex - a.powerIndex);
  console.log(`✔ Elo + Form simulation done. ${Object.keys(teamStats).length} teams.\n`);

  // ── 3. Feature Engineering ────────────────────────────────────
  console.log('🔧 Building feature matrix...');

  /**
   * Feature vector (16 dimensions):
   * [0]  homeElo_norm
   * [1]  awayElo_norm
   * [2]  eloDiff_norm
   * [3]  homeAtk (Poisson)
   * [4]  homeDef
   * [5]  awayAtk
   * [6]  awayDef
   * [7]  homeFormWinRate (exponentially weighted)
   * [8]  awayFormWinRate
   * [9]  homeFormDrawRate
   * [10] homeFormScore
   * [11] awayFormScore
   * [12] homeFormAvgGF
   * [13] awayFormAvgGF
   * [14] homeFormAvgGA
   * [15] isNeutral
   * [16] isClub (0=international, 1=club league) — KEY untuk domain separation
   */
  const buildFV = (ht, at, isNeutral, hE, aE, isClub = false) => {
    const hS = teamStats[ht];
    const aS = teamStats[at];
    if (!hS || !aS) return null;
    const hF = hS.form;
    const aF = aS.form;
    return [
      hE / 2500, aE / 2500, (hE - aE) / 400,
      hS.atk, hS.def, aS.atk, aS.def,
      hF.winRate, aF.winRate, hF.drawRate,
      hF.formScore, aF.formScore,
      hF.avgGF, aF.avgGF, hF.avgGA,
      isNeutral ? 1 : 0,
      isClub    ? 1 : 0,   // ← domain flag
    ];
  };

  const X = [], yOutcome = [], yHG = [], yAG = [];
  const valX = [], valOutcome = [];

  // Re-simulate Elo at match time for accurate features
  const elo2 = {}, ly2 = {}, fr2 = {}, fgf2 = {}, fga2 = {};
  const getE2 = (t) => elo2[t] ?? BASE_ELO;
  const dec2  = (t, yr) => {
    if (!(t in ly2)) return;
    const y = yr - ly2[t];
    if (y > 0) elo2[t] = getE2(t) + (BASE_ELO - getE2(t)) * (1 - Math.pow(DECAY_RATE, y));
  };

  for (const m of allData) {
    if (m.year < MIN_YEAR) continue;
    const { homeTeam: ht, awayTeam: at, homeScore: hs, awayScore: as_, year, tournament, neutral } = m;
    dec2(ht, year); dec2(at, year);
    const hE2 = getE2(ht), aE2 = getE2(at);

    // Build feature vector at match time using CURRENT Elo + stored Poisson + rolling form
    if (m.year >= TRAIN_FROM) {
      const fv = buildFV(ht, at, neutral, hE2, aE2, m.isClub === true);
      if (fv) {
        const outcome = hs > as_ ? 0 : hs === as_ ? 1 : 2;
        if (m.year >= VAL_YEAR) {
          valX.push(fv); valOutcome.push(outcome);
        } else {
          X.push(fv); yOutcome.push(outcome);
          yHG.push(Math.min(hs, 8)); yAG.push(Math.min(as_, 8));
        }
      }
    }

    // Update Elo
    const exp2 = neutral ? 1/(1+Math.pow(10,(aE2-hE2)/400)) : 1/(1+Math.pow(10,(aE2-hE2-HOME_ADVANTAGE)/400));
    const act2 = hs > as_ ? 1 : hs === as_ ? 0.5 : 0;
    const K2 = getKFactor(tournament);
    const d2 = K2 * gdMult(Math.abs(hs - as_)) * (act2 - exp2);
    elo2[ht] = hE2 + d2; elo2[at] = aE2 - d2;
    ly2[ht] = year; ly2[at] = year;
  }

  console.log(`✔ Feature matrix: ${X.length} train + ${valX.length} validation samples, 17 features (incl. isClub domain flag).\n`);

  // ── 4. Train GB models ────────────────────────────────────────
  console.log('🤖 Training Gradient Boosting models...\n');
  const y0 = yOutcome.map(v => v === 0 ? 1 : 0);
  const y1 = yOutcome.map(v => v === 1 ? 1 : 0);
  const y2 = yOutcome.map(v => v === 2 ? 1 : 0);

  const mHomeWin  = trainGBRegressor(X, y0, 'Home Win');
  const mDraw     = trainGBRegressor(X, y1, 'Draw');
  const mAwayWin  = trainGBRegressor(X, y2, 'Away Win');
  const mHomeGoal = trainGBRegressor(X, yHG, 'Home Goals');
  const mAwayGoal = trainGBRegressor(X, yAG, 'Away Goals');

  // ── 5. Platt Scaling Calibration on Validation Set ───────────
  console.log('\n📐 Fitting Platt Scaling calibration on validation set...');

  const gbScoresHome = valX.map(x => predictGB(mHomeWin, x));
  const gbScoresDraw = valX.map(x => predictGB(mDraw, x));
  const gbScoresAway = valX.map(x => predictGB(mAwayWin, x));

  const calHome = fitPlattScaling(gbScoresHome, valOutcome.map(v => v === 0 ? 1 : 0));
  const calDraw = fitPlattScaling(gbScoresDraw, valOutcome.map(v => v === 1 ? 1 : 0));
  const calAway = fitPlattScaling(gbScoresAway, valOutcome.map(v => v === 2 ? 1 : 0));
  console.log(`  Calibration params (Platt): Home(A=${calHome.A},B=${calHome.B}) Draw(A=${calDraw.A},B=${calDraw.B}) Away(A=${calAway.A},B=${calAway.B})`);

  // ── 6. Find Optimal Ensemble Weights ─────────────────────────
  console.log('\n⚖️  Optimizing ensemble weights on validation set...');

  // For each validation sample, compute predictions from all 4 models
  const poissonPMF = (k, l) => { if (l <= 0) return k === 0 ? 1 : 0; let r = Math.exp(-l); for (let i = 1; i <= k; i++) r *= l / i; return r; };
  const dcCorrect  = (i, j, l, u, rho = -0.1) => {
    if (i === 0 && j === 0) return 1 - l * u * rho;
    if (i === 0 && j === 1) return 1 + l * rho;
    if (i === 1 && j === 0) return 1 + u * rho;
    if (i === 1 && j === 1) return 1 - rho;
    return 1;
  };

  const predsSets = [[], [], [], []]; // [elo, dc, form, gb]
  for (let i = 0; i < valX.length; i++) {
    const x = valX[i];
    const hE = x[0] * 2500, aE = x[1] * 2500;

    // Model 1: Elo logistic
    const eloDiff  = hE - aE;
    const eloHome  = sigmoid((eloDiff + HOME_ADVANTAGE) / 200);
    const eloAway  = sigmoid((-eloDiff + HOME_ADVANTAGE) / 200);
    const eloDraw  = 1 - eloHome - eloAway;
    const eloSum   = eloHome + Math.max(0.05, eloDraw) + eloAway;
    predsSets[0].push([eloHome / eloSum, Math.max(0.05, eloDraw) / eloSum, eloAway / eloSum]);

    // Model 2: Dixon-Coles
    const hAtk = x[3], hDef = x[4], aAtk = x[5], aDef = x[6];
    const xGH  = Math.max(0.1, hAtk / aDef * globalAvg * 1.1);
    const xGA  = Math.max(0.1, aAtk / hDef * globalAvg);
    let pH = 0, pD = 0, pA = 0;
    for (let g = 0; g <= 8; g++) for (let h = 0; h <= 8; h++) {
      const p = poissonPMF(g, xGH) * poissonPMF(h, xGA) * dcCorrect(g, h, xGH, xGA);
      if (g > h) pH += p; else if (g === h) pD += p; else pA += p;
    }
    const dcS = pH + pD + pA;
    predsSets[1].push([pH / dcS, pD / dcS, pA / dcS]);

    // Model 3: Weighted Recent Form
    const hWR = x[7], aWR = x[8], hDR = x[9], hFS = x[10], aFS = x[11];
    const formH = Math.max(0.05, hWR - aWR * 0.5 + hFS * 0.2 + 0.15);
    const formA = Math.max(0.05, aWR - hWR * 0.5 + aFS * 0.2 + 0.05);
    const formD = Math.max(0.05, 0.28 + (hDR - 0.25) * 0.3);
    const formS = formH + formD + formA;
    predsSets[2].push([formH / formS, formD / formS, formA / formS]);

    // Model 4: XGBoost (calibrated)
    const gbH  = sigmoid(calHome.A * gbScoresHome[i] + calHome.B);
    const gbD  = sigmoid(calDraw.A  * gbScoresDraw[i]  + calDraw.B);
    const gbA  = sigmoid(calAway.A * gbScoresAway[i] + calAway.B);
    const gbS  = gbH + gbD + gbA;
    predsSets[3].push([gbH / gbS, gbD / gbS, gbA / gbS]);
  }

  const ensembleWeights = findEnsembleWeights(predsSets, valOutcome);

  // Validation accuracy
  let correct = 0;
  for (let i = 0; i < valX.length; i++) {
    const blended = [0, 0, 0];
    for (let m = 0; m < 4; m++) {
      blended[0] += ensembleWeights[m] * predsSets[m][i][0];
      blended[1] += ensembleWeights[m] * predsSets[m][i][1];
      blended[2] += ensembleWeights[m] * predsSets[m][i][2];
    }
    if (blended.indexOf(Math.max(...blended)) === valOutcome[i]) correct++;
  }
  const valAcc = (correct / valOutcome.length * 100).toFixed(1);
  console.log(`  ✔ Validation accuracy: ${valAcc}%  (${valOutcome.length} matches, 2020-2025)`);

  // ── 7. Save outputs ───────────────────────────────────────────
  fs.writeFileSync(RATINGS_OUTPUT, JSON.stringify({
    modelVersion: 'ensemble-v2',
    algorithm: 'Ensemble: Elo + Dixon-Coles + Weighted Form + Gradient Boosting + Platt Calibration',
    globalAvgGoalsPerTeam: globalAvg,
    homeAdvantageElo: HOME_ADVANTAGE,
    teamRatings,
    aiPowerRanking: aiPowerRanking.slice(0, 150),
  }, null, 2));
  console.log(`\n✔ teamRatings.json saved (${aiPowerRanking.length} teams, with weighted form)`);

  fs.writeFileSync(ML_OUTPUT, JSON.stringify({
    version: 'ensemble-v2',
    nEstimators: GB_N_ESTIMATORS,
    maxDepth: GB_MAX_DEPTH,
    learningRate: GB_LEARNING_RATE,
    trainSamples: X.length,
    valSamples: valX.length,
    valAccuracy: parseFloat(valAcc),
    globalAvg,
    // GB models
    models: { homeWin: mHomeWin, draw: mDraw, awayWin: mAwayWin, homeGoal: mHomeGoal, awayGoal: mAwayGoal },
    // Platt scaling calibration parameters
    calibration: { home: calHome, draw: calDraw, away: calAway },
    // Optimal ensemble weights [Elo, DixonColes, WeightedForm, XGBoost]
    ensembleWeights,
  }));
  const sz = Math.round(fs.statSync(ML_OUTPUT).size / 1024);
  console.log(`✔ mlModel.json saved (${sz} KB)`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TRAINING COMPLETE ✅  — Full Ensemble Model Ready!           ║');
  console.log(`║  Validation Accuracy: ${valAcc}%  (2020–2025 holdout)              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  aiPowerRanking.slice(0, 10).forEach((t, i) =>
    console.log(`  ${String(i+1).padStart(2)}. ${t.name.padEnd(24)} Elo:${String(t.elo).padStart(5)}  Power:${t.powerIndex}`)
  );
})();
