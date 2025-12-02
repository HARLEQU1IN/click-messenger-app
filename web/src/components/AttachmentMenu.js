import React from 'react';
import './AttachmentMenu.css';

function AttachmentMenu({ onClose, onSelect }) {
  const menuItems = [
    { id: 'photo', icon: '🖼️', label: 'Фото или видео', action: () => handleSelect('photo') },
    { id: 'document', icon: '📄', label: 'Документ', action: () => handleSelect('document') },
  ];

  const handleSelect = (type) => {
    if (onSelect) {
      onSelect(type);
    }
    onClose();
  };

  return (
    <>
      <div className="attachment-menu-overlay" onClick={onClose} />
      <div className="attachment-menu">
        {menuItems.map((item) => (
          <div
            key={item.id}
            className="attachment-menu-item"
            onClick={item.action}
          >
            <span className="attachment-menu-icon">{item.icon}</span>
            <span className="attachment-menu-label">{item.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default AttachmentMenu;

