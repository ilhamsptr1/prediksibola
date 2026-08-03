import React, { useState } from "react";
import { usePredictions } from "../context/PredictionContext";
import { Link } from "react-router-dom";
import { Trophy, Target, TrendingUp, Trash2, ArrowLeft, CheckCircle, XCircle, Star } from "lucide-react";
import "./PredictionHistory.css";

const PredictionHistory = () => {
  const { predictionHistory, clearHistory } = usePredictions();
  const [confirmClear, setConfirmClear] = useState(false);

  const total   = predictionHistory.length;
  const correct = predictionHistory.filter(h => h.isCorrect).length;
  const exact   = predictionHistory.filter(h => h.isExact).length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : "0.0";

  const handleClear = () => {
    if (confirmClear) { clearHistory(); setConfirmClear(false); }
    else setConfirmClear(true);
  };

  return (
    <div className="history-page animate-fade-in">
      <div className="history-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} /> <span>Kembali</span>
        </Link>
        <h1 className="history-title">
          <Trophy size={28} className="trophy-icon" />
          <span>Riwayat Prediksi AI</span>
        </h1>
        <p className="history-subtitle">
          <span>Semua prediksi yang sudah kamu buat dan hasilnya</span>
        </p>
      </div>

      {/* Stats Summary */}
      <div className="history-stats-row">
        <div className="hstat-card glass">
          <div className="hstat-icon"><Target size={22} /></div>
          <div className="hstat-value">{total}</div>
          <div className="hstat-label"><span>Total Prediksi</span></div>
        </div>
        <div className="hstat-card glass correct">
          <div className="hstat-icon"><TrendingUp size={22} /></div>
          <div className="hstat-value">{accuracy}%</div>
          <div className="hstat-label"><span>Akurasi Pemenang</span></div>
        </div>
        <div className="hstat-card glass exact">
          <div className="hstat-icon"><Star size={22} /></div>
          <div className="hstat-value">{exact}</div>
          <div className="hstat-label"><span>Skor Persis</span></div>
        </div>
      </div>

      {total === 0 ? (
        <div className="history-empty glass-card">
          <span style={{ fontSize: "3rem" }}>🤖</span>
          <h3><span>Belum ada riwayat prediksi</span></h3>
          <p>
            <span>Buka jadwal pertandingan yang sudah SELESAI,</span><br />
            <span>lalu tekan "Generate AI Prediction" untuk menyimpan riwayat.</span>
          </p>
          <Link to="/" className="btn-primary-link">
            <span>Lihat Jadwal</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="history-list">
            {predictionHistory.map((h, i) => {
              const matchDate = new Date(h.date).toLocaleDateString("id-ID", {
                weekday: "short", day: "numeric", month: "short", year: "numeric"
              });
              return (
                <div key={h.matchId + i} className={`history-item glass ${h.isCorrect ? "correct" : "incorrect"}`}>
                  {/* Status Badge */}
                  <div className="history-badge">
                    {h.isExact ? (
                      <div className="badge-exact"><Star size={12} /> <span>Persis!</span></div>
                    ) : h.isCorrect ? (
                      <div className="badge-correct"><CheckCircle size={12} /> <span>Benar</span></div>
                    ) : (
                      <div className="badge-wrong"><XCircle size={12} /> <span>Salah</span></div>
                    )}
                  </div>

                  {/* Teams */}
                  <div className="history-teams">
                    <div className="hist-team">
                      {h.homeCrest && <img src={h.homeCrest} alt="" className="hist-crest" />}
                      <span>{h.homeTeam}</span>
                    </div>
                    <div className="hist-scores">
                      <div className="hist-score-block predicted">
                        <span className="hist-score-label">AI</span>
                        <span className="hist-score-val">{h.predictedHome} - {h.predictedAway}</span>
                      </div>
                      <div className="hist-vs">vs</div>
                      <div className="hist-score-block actual">
                        <span className="hist-score-label">Asli</span>
                        <span className="hist-score-val">{h.actualHome} - {h.actualAway}</span>
                      </div>
                    </div>
                    <div className="hist-team away">
                      {h.awayCrest && <img src={h.awayCrest} alt="" className="hist-crest" />}
                      <span>{h.awayTeam}</span>
                    </div>
                  </div>

                  {/* Probabilities */}
                  {h.probabilities && (
                    <div className="hist-probs">
                      <div className="hist-prob-bar">
                        <div className="hpb-home" style={{ width: `${h.probabilities.home}%` }} />
                        <div className="hpb-draw" style={{ width: `${h.probabilities.draw}%` }} />
                        <div className="hpb-away" style={{ width: `${h.probabilities.away}%` }} />
                      </div>
                      <div className="hist-prob-vals">
                        <span style={{ color: "#4ade80" }}>{h.probabilities.home}%</span>
                        <span style={{ color: "#94a3b8" }}>{h.probabilities.draw}%</span>
                        <span style={{ color: "#f87171" }}>{h.probabilities.away}%</span>
                      </div>
                    </div>
                  )}

                  <div className="hist-date"><span>{matchDate}</span></div>
                </div>
              );
            })}
          </div>

          <div className="history-footer">
            <button
              className={`clear-btn ${confirmClear ? "confirm" : ""}`}
              onClick={handleClear}
            >
              <Trash2 size={16} />
              <span>{confirmClear ? "Yakin? Klik lagi untuk hapus semua" : "Hapus Semua Riwayat"}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default PredictionHistory;
