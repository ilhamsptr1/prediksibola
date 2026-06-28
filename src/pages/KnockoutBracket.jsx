import React, { useMemo, useState } from 'react';
import { useMatches } from '../hooks/useMatches';
import { usePredictions } from '../context/PredictionContext';
import { calculateStandings } from '../utils/standings';
import { generateBracket32 } from '../utils/bracket';
import teamRatingsData from '../data/teamRatings.json';
import { Trophy, Shield } from 'lucide-react';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import './KnockoutBracket.css';

const getTeamPower = (teamName) => {
  const ratings = teamRatingsData.teamRatings;
  return ratings[teamName]?.powerIndex ?? 50;
};

const simulateMatch = (team1, team2) => {
  if (!team1 || !team2) return null;
  if (team1.isPlaceholder || team2.isPlaceholder) return null;

  // Extremely simplified simulation for instant bracket resolution
  // based on Elo power index
  const p1 = getTeamPower(team1.team.name);
  const p2 = getTeamPower(team2.team.name);
  
  // Random factor with Elo weight
  const s1 = p1 * (Math.random() * 0.5 + 0.5);
  const s2 = p2 * (Math.random() * 0.5 + 0.5);

  let score1 = Math.floor((s1 / 100) * 4);
  let score2 = Math.floor((s2 / 100) * 4);

  // No draws in knockout
  if (score1 === score2) {
    if (s1 > s2) score1++;
    else score2++;
  }

  const winner = score1 > score2 ? team1 : team2;

  return { score1, score2, winner };
};

const MatchBox = ({ match, title }) => {
  if (!match) return <div className="bracket-match empty" />;

  return (
    <div className="bracket-match glass-card">
      {title && <div className="match-round-title">{title}</div>}
      <div className={`bracket-team ${match.winner === match.team1 ? 'winner' : ''} ${match.team1?.isPlaceholder ? 'placeholder' : ''}`}>
        <span className="seed">{match.team1?.seed || ''}</span>
        {match.team1?.team?.flag ? (
          <img src={match.team1.team.flag} alt="" className="bracket-flag" />
        ) : (
          <Shield size={14} className="bracket-shield" />
        )}
        <span className="name">{match.team1?.team?.name || 'TBD'}</span>
        <span className="score">{match.score1 ?? '-'}</span>
      </div>
      <div className={`bracket-team ${match.winner === match.team2 ? 'winner' : ''} ${match.team2?.isPlaceholder ? 'placeholder' : ''}`}>
        <span className="seed">{match.team2?.seed || ''}</span>
        {match.team2?.team?.flag ? (
          <img src={match.team2.team.flag} alt="" className="bracket-flag" />
        ) : (
          <Shield size={14} className="bracket-shield" />
        )}
        <span className="name">{match.team2?.team?.name || 'TBD'}</span>
        <span className="score">{match.score2 ?? '-'}</span>
      </div>
    </div>
  );
};

const KnockoutBracket = () => {
  const { matches } = useMatches();
  const { predictions } = usePredictions();
  const [bracketState, setBracketState] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const { width, height } = useWindowSize();

  const standings = useMemo(() => calculateStandings(matches, predictions), [matches, predictions]);
  const r32 = useMemo(() => generateBracket32(standings), [standings]);

  const simulateTournament = () => {
    const rounds = {
      r32: [...r32],
      r16: [],
      qf: [],
      sf: [],
      final: []
    };

    // Helper to simulate a round and build the next round
    const runRound = (currentRound, nextRoundArr) => {
      for (let i = 0; i < currentRound.length; i += 2) {
        const m1 = currentRound[i];
        const m2 = currentRound[i + 1];

        const sim1 = simulateMatch(m1.team1, m1.team2);
        const sim2 = simulateMatch(m2.team1, m2.team2);

        if (sim1) { m1.score1 = sim1.score1; m1.score2 = sim1.score2; m1.winner = sim1.winner; }
        if (sim2) { m2.score1 = sim2.score1; m2.score2 = sim2.score2; m2.winner = sim2.winner; }

        nextRoundArr.push({
          id: `match_${Math.random()}`,
          team1: m1.winner || null,
          team2: m2.winner || null,
          score1: null,
          score2: null,
          winner: null
        });
      }
    };

    runRound(rounds.r32, rounds.r16);
    runRound(rounds.r16, rounds.qf);
    runRound(rounds.qf, rounds.sf);
    runRound(rounds.sf, rounds.final);

    // Simulate final
    const finalMatch = rounds.final[0];
    const finalSim = simulateMatch(finalMatch.team1, finalMatch.team2);
    if (finalSim) {
      finalMatch.score1 = finalSim.score1;
      finalMatch.score2 = finalSim.score2;
      finalMatch.winner = finalSim.winner;
    }

    setBracketState(rounds);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 8000); // Hide after 8 seconds
  };

  const renderColumn = (matches, title) => (
    <div className="bracket-col">
      <h3 className="round-header">{title}</h3>
      {matches.map((m, i) => (
        <MatchBox key={i} match={m} />
      ))}
    </div>
  );

  return (
    <div className="bracket-container animate-fade-in">
      {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={800} />}
      <header className="bracket-header text-center">
        <Trophy size={42} className="text-primary mb-2" />
        <h1 className="heading-lg">Bagan <span className="text-gradient">Knockout</span></h1>
        <p className="text-muted">Babak 32 Besar hingga Final berdasarkan simulasi AI klasemen grup saat ini.</p>
        <button className="btn-primary mt-4" onClick={simulateTournament}>
          Simulasikan Fase Gugur
        </button>
      </header>

      <div className="bracket-scroll-wrapper">
        <div className="bracket-tree">
          {/* Left Side */}
          <div className="bracket-half left-half">
            {renderColumn(bracketState ? bracketState.r32.slice(0, 8) : r32.slice(0, 8), '32 Besar')}
            {renderColumn(bracketState ? bracketState.r16.slice(0, 4) : Array(4).fill(null), '16 Besar')}
            {renderColumn(bracketState ? bracketState.qf.slice(0, 2) : Array(2).fill(null), 'Perempat Final')}
            {renderColumn(bracketState ? bracketState.sf.slice(0, 1) : Array(1).fill(null), 'Semi Final')}
          </div>

          {/* Center (Final & Champion) */}
          <div className="bracket-center">
            <h3 className="round-header champion-header">Final</h3>
            <MatchBox match={bracketState ? bracketState.final[0] : null} title="World Cup Final" />
            
            {bracketState?.final[0]?.winner && (
              <div className="champion-card glass-card animate-fade-in">
                <Trophy size={32} color="#FFD700" className="mb-2" />
                <h4 className="text-muted">CHAMPION</h4>
                <img src={bracketState.final[0].winner.team.flag} alt="" className="champion-flag" />
                <h2>{bracketState.final[0].winner.team.name}</h2>
              </div>
            )}
          </div>

          {/* Right Side */}
          <div className="bracket-half right-half">
            {renderColumn(bracketState ? bracketState.sf.slice(1, 2) : Array(1).fill(null), 'Semi Final')}
            {renderColumn(bracketState ? bracketState.qf.slice(2, 4) : Array(2).fill(null), 'Perempat Final')}
            {renderColumn(bracketState ? bracketState.r16.slice(4, 8) : Array(4).fill(null), '16 Besar')}
            {renderColumn(bracketState ? bracketState.r32.slice(8, 16) : r32.slice(8, 16), '32 Besar')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnockoutBracket;
