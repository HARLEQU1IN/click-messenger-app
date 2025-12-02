import React, { useState } from 'react';
import './Menu.css';

function Menu({ user, onClose, onProfile, onCreateGroup, onContacts, onCalls, onFavorites, onSettings, darkMode, onToggleDarkMode }) {
  const [activeItem, setActiveItem] = useState(null);

  const menuItems = [
    { id: 'profile', label: 'Мой профиль', icon: '👤', action: onProfile },
    { id: 'group', label: 'Создать группу', icon: '👥', action: onCreateGroup },
    { id: 'contacts', label: 'Контакты', icon: '📇', action: onContacts },
    { id: 'calls', label: 'Звонки', icon: '📞', action: onCalls },
    { id: 'favorites', label: 'Избранное', icon: '⭐', action: onFavorites },
    { id: 'settings', label: 'Настройки', icon: '⚙️', action: onSettings },
  ];

  const handleItemClick = (item) => {
    setActiveItem(item.id);
    if (item.action) {
      item.action();
    }
  };

  return (
    <div className="menu-overlay" onClick={onClose}>
      <div className="menu-container" onClick={(e) => e.stopPropagation()}>
        <div className="menu-header">
          <h3>Меню</h3>
          <button className="menu-close-btn" onClick={onClose}>✕</button>
        </div>
        
        {user && (
          <div className="menu-user-info">
            <div className="menu-user-avatar">
              {user.avatar ? (
                <img src={user.avatar} alt={user.username} />
              ) : (
                <span>{user.username?.[0]?.toUpperCase() || 'U'}</span>
              )}
            </div>
            <div className="menu-user-details">
              <div className="menu-username">{user.username || 'Пользователь'}</div>
              <div className="menu-user-email">{user.email || ''}</div>
            </div>
          </div>
        )}

        <div className="menu-items">
          {menuItems.map((item) => (
            <div
              key={item.id}
              className={`menu-item ${activeItem === item.id ? 'active' : ''}`}
              onClick={() => handleItemClick(item)}
            >
              <span className="menu-item-icon">{item.icon}</span>
              <span className="menu-item-label">{item.label}</span>
            </div>
          ))}
        </div>

        <div className="menu-divider"></div>

        <div className="menu-toggle">
          <div className="menu-item" onClick={onToggleDarkMode}>
            <span className="menu-item-icon">{darkMode ? '🌙' : '☀️'}</span>
            <span className="menu-item-label">Ночной режим</span>
            <div className={`toggle-switch ${darkMode ? 'active' : ''}`}>
              <div className="toggle-slider"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Menu;

