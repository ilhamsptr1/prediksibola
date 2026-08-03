import React from 'react';
import { LEAGUES } from '../data/leagues';
import './LeagueSelector.css';

const LeagueSelector = ({ selectedLeague, onSelect }) => {
  return (
    <div className="league-selector-wrapper">
      <div className="league-selector">
        {LEAGUES.map((league) => {
          const isActive = selectedLeague === league.code;
          return (
            <button
              key={league.code}
              className={`league-tab ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(league.code)}
              title={league.name}
              style={isActive ? { '--league-color': league.color } : {}}
            >
              <div className="league-icon-container">
                {league.logo ? (
                  <img src={league.logo} alt={league.name} className="league-logo" />
                ) : (
                  <span className="league-flag">{league.flag}</span>
                )}
              </div>
              <span className="league-name">{league.shortName}</span>
              {isActive && <span className="league-active-bar" style={{ background: league.color }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LeagueSelector;
