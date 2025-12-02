import React, { useState } from 'react';
import axios from 'axios';
import './CreateGroup.css';

const API_URL = 'http://localhost:5000/api';

function CreateGroup({ users, currentUser, onClose, onGroupCreated }) {
  const [step, setStep] = useState(1); // 1: название и аватар, 2: выбор участников
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Размер файла не должен превышать 5MB');
        return;
      }
      setAvatar(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleNext = () => {
    if (step === 1) {
      if (!groupName.trim()) {
        setError('Введите название группы');
        return;
      }
      setError('');
      setStep(2);
    }
  };

  const handleBack = () => {
    setStep(1);
    setError('');
  };

  const handleCreate = async () => {
    if (selectedUsers.length === 0) {
      setError('Выберите хотя бы одного участника');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Сначала загружаем аватар, если есть
      let avatarUrl = '';
      if (avatar) {
        const formData = new FormData();
        formData.append('avatar', avatar);
        const avatarResponse = await axios.post(`${API_URL}/chats/group/avatar`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        avatarUrl = avatarResponse.data.avatar;
      }

      // Создаем группу
      const response = await axios.post(
        `${API_URL}/chats/group`,
        {
          name: groupName.trim(),
          participants: [currentUser._id || currentUser.id, ...selectedUsers],
          avatar: avatarUrl
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (onGroupCreated) {
        onGroupCreated(response.data);
      }
      onClose();
    } catch (error) {
      console.error('Error creating group:', error);
      setError(error.response?.data?.error || error.message || 'Ошибка при создании группы');
    } finally {
      setIsCreating(false);
    }
  };

  const availableUsers = users.filter(u => {
    if (!u || !u._id || (u._id === (currentUser._id || currentUser.id))) {
      return false;
    }
    if (!searchQuery.trim()) {
      return true;
    }
    const query = searchQuery.toLowerCase();
    return (
      (u.username && u.username.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query))
    );
  });

  return (
    <div className="create-group-overlay" onClick={onClose}>
      <div className="create-group-container" onClick={(e) => e.stopPropagation()}>
        <div className="create-group-header">
          <button className="create-group-close-btn" onClick={onClose}>✕</button>
          <h2>{step === 1 ? 'Новая группа' : 'Добавить участников'}</h2>
          {step === 2 && (
            <button className="create-group-back-btn" onClick={handleBack}>Назад</button>
          )}
        </div>

        {error && <div className="create-group-error">{error}</div>}

        {step === 1 && (
          <div className="create-group-step1">
            <div className="create-group-avatar-section">
              <div className="create-group-avatar-wrapper">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Group avatar" className="create-group-avatar-preview" />
                ) : (
                  <div className="create-group-avatar-placeholder">
                    <span>👥</span>
                  </div>
                )}
                <label className="create-group-avatar-edit-btn" title="Изменить фото">
                  📸
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleAvatarChange} 
                    style={{ display: 'none' }} 
                  />
                </label>
              </div>
            </div>

            <div className="create-group-name-input">
              <input
                type="text"
                placeholder="Название группы"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={50}
                autoFocus
              />
            </div>

            <div className="create-group-actions">
              <button className="create-group-btn create-group-btn-primary" onClick={handleNext}>
                Далее
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="create-group-step2">
            <div className="create-group-search">
              <input
                type="text"
                placeholder="Поиск контактов"
                id="group-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="create-group-selected">
              {selectedUsers.length > 0 && (
                <div className="create-group-selected-count">
                  Выбрано: {selectedUsers.length}
                </div>
              )}
            </div>

            <div className="create-group-users-list">
              {availableUsers.length === 0 ? (
                <div className="create-group-no-users">
                  Нет доступных пользователей
                </div>
              ) : (
                availableUsers.map(user => {
                  const isSelected = selectedUsers.includes(user._id || user.id);
                  return (
                    <div
                      key={user._id || user.id}
                      className={`create-group-user-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleUserSelection(user._id || user.id)}
                    >
                      <div className="create-group-user-avatar">
                        {user.avatar ? (
                          <img 
                            src={user.avatar.startsWith('http') ? user.avatar : `${API_URL}/uploads/${user.avatar}`} 
                            alt={user.username}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) {
                                e.target.nextSibling.style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        {(!user.avatar || user.avatar === '') && (
                          <span>{user.username?.[0]?.toUpperCase() || 'U'}</span>
                        )}
                      </div>
                      <div className="create-group-user-info">
                        <div className="create-group-user-name">{user.username || 'Unknown'}</div>
                        {user.email && (
                          <div className="create-group-user-email">{user.email}</div>
                        )}
                      </div>
                      {isSelected && (
                        <div className="create-group-checkmark">✓</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="create-group-actions">
              <button 
                className="create-group-btn create-group-btn-primary" 
                onClick={handleCreate}
                disabled={isCreating || selectedUsers.length === 0}
              >
                {isCreating ? 'Создание...' : `Создать группу (${selectedUsers.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CreateGroup;

