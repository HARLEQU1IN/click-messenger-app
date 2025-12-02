import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './GroupSettings.css';

const API_URL = 'http://localhost:5000/api';

function GroupSettings({ chat, currentUser, users, onClose, onGroupUpdated, onGroupDeleted }) {
  const [isEditing, setIsEditing] = useState(false);
  const [groupName, setGroupName] = useState(chat?.name || '');
  const [avatar, setAvatar] = useState(chat?.avatar || '');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const token = localStorage.getItem('token');

  useEffect(() => {
    setGroupName(chat?.name || '');
    setAvatar(chat?.avatar || '');
    if (chat?.avatar) {
      setAvatarPreview(chat.avatar.startsWith('http') ? chat.avatar : `${API_URL}/uploads/${chat.avatar}`);
    }
  }, [chat]);

  const handleSave = async () => {
    setError('');
    try {
      const updates = {};
      if (groupName.trim() !== chat.name) {
        updates.name = groupName.trim();
      }

      if (Object.keys(updates).length > 0) {
        const response = await axios.put(
          `${API_URL}/chats/group/${chat._id}`,
          updates,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (onGroupUpdated) {
          onGroupUpdated(response.data);
        }
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving group:', error);
      setError(error.response?.data?.error || error.message || 'Ошибка сохранения группы');
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Размер файла не должен превышать 5MB');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await axios.put(
        `${API_URL}/chats/group/${chat._id}/avatar`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (response.data.avatar) {
        setAvatar(response.data.avatar);
        setAvatarPreview(`${API_URL}/uploads/${response.data.avatar}`);
        if (onGroupUpdated) {
          onGroupUpdated(response.data);
        }
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setError(error.response?.data?.error || error.message || 'Ошибка загрузки аватара');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddMembers = async (userIds) => {
    if (!userIds || userIds.length === 0) return;

    setError('');
    try {
      const response = await axios.post(
        `${API_URL}/chats/group/${chat._id}/participants`,
        { userIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (onGroupUpdated) {
        onGroupUpdated(response.data);
      }
      setShowAddMembers(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Error adding members:', error);
      setError(error.response?.data?.error || error.message || 'Ошибка добавления участников');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Удалить этого участника из группы?')) return;

    setError('');
    try {
      const response = await axios.delete(
        `${API_URL}/chats/group/${chat._id}/participants/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.deleted) {
        // Группа была удалена
        if (onGroupDeleted) {
          onGroupDeleted();
        }
        onClose();
      } else {
        if (onGroupUpdated) {
          onGroupUpdated(response.data);
        }
      }
    } catch (error) {
      console.error('Error removing member:', error);
      setError(error.response?.data?.error || error.message || 'Ошибка удаления участника');
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm('Вы уверены, что хотите покинуть группу?')) return;

    setIsLeaving(true);
    setError('');

    try {
      const response = await axios.post(
        `${API_URL}/chats/group/${chat._id}/leave`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.deleted) {
        // Группа была удалена
        if (onGroupDeleted) {
          onGroupDeleted();
        }
      } else {
        // Пользователь покинул группу
        if (onGroupDeleted) {
          onGroupDeleted();
        }
      }
      onClose();
    } catch (error) {
      console.error('Error leaving group:', error);
      setError(error.response?.data?.error || error.message || 'Ошибка при выходе из группы');
    } finally {
      setIsLeaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm('Вы уверены, что хотите удалить группу? Это действие нельзя отменить.')) return;

    setIsDeleting(true);
    setError('');

    try {
      await axios.delete(
        `${API_URL}/chats/group/${chat._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (onGroupDeleted) {
        onGroupDeleted();
      }
      onClose();
    } catch (error) {
      console.error('Error deleting group:', error);
      setError(error.response?.data?.error || error.message || 'Ошибка при удалении группы');
    } finally {
      setIsDeleting(false);
    }
  };

  const currentUserId = String(currentUser._id || currentUser.id);
  const participants = chat?.participants || [];
  const isParticipant = participants.some(p => String(p._id || p) === currentUserId);

  const availableUsers = users.filter(u => {
    if (!u || !u._id || (u._id === currentUserId)) {
      return false;
    }
    // Исключаем уже добавленных участников
    if (participants.some(p => String(p._id || p) === String(u._id))) {
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
    <div className="group-settings-overlay" onClick={onClose}>
      <div className="group-settings-container" onClick={(e) => e.stopPropagation()}>
        <div className="group-settings-header">
          <h2>Настройки группы</h2>
          <button className="group-settings-close-btn" onClick={onClose}>✕</button>
        </div>

        {error && <div className="group-settings-error">{error}</div>}

        <div className="group-settings-content">
          {/* Avatar Section */}
          <div className="group-settings-section">
            <div className="group-settings-avatar-wrapper">
              {avatarPreview ? (
                <img src={avatarPreview} alt={groupName} className="group-settings-avatar" />
              ) : (
                <div className="group-settings-avatar-placeholder">
                  {groupName?.[0]?.toUpperCase() || '👥'}
                </div>
              )}
              {isEditing && (
                <label className="group-settings-avatar-edit-btn" title="Изменить фото">
                  📸
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleAvatarChange} 
                    style={{ display: 'none' }} 
                    disabled={isUploading}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Group Name */}
          <div className="group-settings-section">
            <label className="group-settings-label">Название группы</label>
            {isEditing ? (
              <div className="group-settings-edit-row">
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="group-settings-input"
                  maxLength={50}
                />
                <button className="group-settings-save-btn" onClick={handleSave}>
                  Сохранить
                </button>
                <button className="group-settings-cancel-btn" onClick={() => {
                  setIsEditing(false);
                  setGroupName(chat?.name || '');
                }}>
                  Отмена
                </button>
              </div>
            ) : (
              <div className="group-settings-display-row">
                <span className="group-settings-value">{groupName}</span>
                <button className="group-settings-edit-btn" onClick={() => setIsEditing(true)}>
                  ✏️
                </button>
              </div>
            )}
          </div>

          {/* Participants */}
          <div className="group-settings-section">
            <div className="group-settings-section-header">
              <label className="group-settings-label">Участники ({participants.length})</label>
              <button 
                className="group-settings-add-btn"
                onClick={() => setShowAddMembers(!showAddMembers)}
              >
                + Добавить
              </button>
            </div>

            {showAddMembers && (
              <div className="group-settings-add-members">
                <input
                  type="text"
                  placeholder="Поиск контактов"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="group-settings-search-input"
                />
                <div className="group-settings-users-list">
                  {availableUsers.length === 0 ? (
                    <div className="group-settings-no-users">Нет доступных пользователей</div>
                  ) : (
                    availableUsers.map(user => (
                      <div
                        key={user._id}
                        className="group-settings-user-item"
                        onClick={() => handleAddMembers([user._id])}
                      >
                        <div className="group-settings-user-avatar">
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
                        <div className="group-settings-user-info">
                          <div className="group-settings-user-name">{user.username || 'Unknown'}</div>
                          {user.email && (
                            <div className="group-settings-user-email">{user.email}</div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="group-settings-participants-list">
              {participants.map((participant, index) => {
                const pId = String(participant._id || participant);
                const pUser = typeof participant === 'object' ? participant : users.find(u => String(u._id) === pId);
                const isCurrentUser = pId === currentUserId;
                
                return (
                  <div key={pId || index} className="group-settings-participant-item">
                    <div className="group-settings-user-avatar">
                      {pUser?.avatar ? (
                        <img 
                          src={pUser.avatar.startsWith('http') ? pUser.avatar : `${API_URL}/uploads/${pUser.avatar}`} 
                          alt={pUser.username}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) {
                              e.target.nextSibling.style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      {(!pUser?.avatar || pUser?.avatar === '') && (
                        <span>{pUser?.username?.[0]?.toUpperCase() || 'U'}</span>
                      )}
                    </div>
                    <div className="group-settings-user-info">
                      <div className="group-settings-user-name">
                        {pUser?.username || 'Unknown'}
                        {isCurrentUser && <span className="group-settings-you"> (Вы)</span>}
                      </div>
                      {pUser?.email && (
                        <div className="group-settings-user-email">{pUser.email}</div>
                      )}
                    </div>
                    {!isCurrentUser && (
                      <button
                        className="group-settings-remove-btn"
                        onClick={() => handleRemoveMember(pId)}
                        title="Удалить из группы"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="group-settings-actions">
            <button
              className="group-settings-leave-btn"
              onClick={handleLeaveGroup}
              disabled={isLeaving}
            >
              {isLeaving ? 'Выход...' : 'Покинуть группу'}
            </button>
            <button
              className="group-settings-delete-btn"
              onClick={handleDeleteGroup}
              disabled={isDeleting}
            >
              {isDeleting ? 'Удаление...' : 'Удалить группу'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GroupSettings;

