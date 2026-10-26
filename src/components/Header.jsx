import { Flame, LogOut, Sun, Moon } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBurner } from '../contexts/BurnerContext';

import './Header.css';

const Header = ({ currentStreak }) => {
  const { user, logout } = useAuth();
  const { theme, cycle } = useTheme();
  const { isBurnerMode, toggleBurnerMode } = useBurner();
  const [showAvatar, setShowAvatar] = useState(true);

  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__left">
          {currentStreak > 0 && (
            <div className="header__streakBadge">
              <Flame size={14} strokeWidth={2} />
              <span>{currentStreak} Day Streak</span>
            </div>
          )}
        </div>

        {user && (
          <div className="header__right">
            <button type="button" onClick={cycle} className="header__button header__iconButton" title={`Theme: ${theme}`} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
            </button>
            <button type="button" onClick={toggleBurnerMode} className={`header__button header__iconButton${isBurnerMode ? ' header__iconButton--active' : ''}`} title={`Burner mode: ${isBurnerMode ? 'on' : 'off'}`} aria-label="Toggle burner mode" aria-pressed={isBurnerMode}>
              <Flame size={14} strokeWidth={2} />
            </button>
            <div className="header__profile">
              {user.avatar_url && showAvatar && <img src={user.avatar_url} alt={user.name} className="header__avatar" onError={() => setShowAvatar(false)} />}
              <span className="header__profileName">{user.name}</span>
            </div>
            <button type="button" onClick={logout} className="header__button"><LogOut size={14} /> Logout</button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
