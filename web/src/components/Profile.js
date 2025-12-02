import React, { useState, useEffect } from 'react';
import './Profile.css';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

function Profile({ user, onClose, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    displayName: user?.displayName || user?.username || '',
    username: user?.username || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    birthday: user?.birthday || '',
    email: user?.email || ''
  });
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [isUploading, setIsUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (user) {
      setFormData({
        displayName: user.displayName || user.username || '',
        username: user.username || '',
        phone: user.phone || '',
        bio: user.bio || '',
        birthday: user.birthday || '',
        email: user.email || ''
      });
      setAvatar(user.avatar || '');
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Размер файла не должен превышать 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await axios.post(`${API_URL}/auth/avatar`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.avatar) {
        setAvatar(response.data.avatar);
        if (onUpdate) {
          onUpdate({ ...user, avatar: response.data.avatar });
        }
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Ошибка загрузки аватара: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await axios.put(`${API_URL}/auth/profile`, formData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.data) {
        if (onUpdate) {
          onUpdate(response.data);
        }
        setIsEditing(false);
        alert('Профиль успешно обновлен');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Ошибка обновления профиля: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFormData({
        displayName: user.displayName || user.username || '',
        username: user.username || '',
        phone: user.phone || '',
        bio: user.bio || '',
        birthday: user.birthday || '',
        email: user.email || ''
      });
    }
    setIsEditing(false);
  };

  const formatBirthday = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('ru-RU', { month: 'short' });
    const year = date.getFullYear();
    const age = new Date().getFullYear() - year;
    return `${day} ${month} ${year} (${age} лет)`;
  };

  const getStatusText = () => {
    return user?.online ? 'в сети' : 'не в сети';
  };

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-container" onClick={(e) => e.stopPropagation()}>
        <div className="profile-header">
          <div className="profile-header-bg">
            <div className="profile-avatar-section">
              <div className="profile-avatar-wrapper">
                {avatar ? (
                  <img 
                    src={avatar.startsWith('http') ? avatar : `${API_URL}/uploads/${avatar}`} 
                    alt={formData.displayName} 
                    className="profile-avatar"
                    onError={(e) => {
                      console.error('Error loading avatar:', avatar);
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                {(!avatar || avatar === '') && (
                  <div className="profile-avatar-placeholder">
                    {formData.displayName?.[0]?.toUpperCase() || formData.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                {isEditing && (
                  <label className="profile-avatar-edit">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                    <span className="profile-avatar-edit-icon">✏️</span>
                  </label>
                )}
              </div>
              <div className="profile-name-section">
                <h2 className="profile-display-name">
                  {isEditing ? (
                    <input
                      type="text"
                      name="displayName"
                      value={formData.displayName}
                      onChange={handleInputChange}
                      className="profile-input"
                      placeholder="Имя"
                    />
                  ) : (
                    formData.displayName || formData.username || 'Пользователь'
                  )}
                </h2>
                <div className="profile-status">{getStatusText()}</div>
              </div>
            </div>
            <div className="profile-header-actions">
              {isEditing ? (
                <>
                  <button className="profile-action-btn" onClick={handleSave} disabled={saving}>
                    {saving ? 'Сохранение...' : '✓'}
                  </button>
                  <button className="profile-action-btn" onClick={handleCancel} disabled={saving}>
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <button className="profile-action-btn" onClick={() => setIsEditing(true)}>
                    ✏️
                  </button>
                  <button className="profile-action-btn" onClick={onClose}>
                    ✕
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="profile-content">
          <div className="profile-section">
            <div className="profile-field">
              <div className="profile-field-label">Телефон</div>
              {isEditing ? (
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="profile-input"
                  placeholder="+7 999 123 45 67"
                />
              ) : (
                <div className="profile-field-value">
                  {formData.phone || 'Не указан'}
                </div>
              )}
            </div>

            <div className="profile-field">
              <div className="profile-field-label">Email</div>
              <div className="profile-field-value">{formData.email}</div>
            </div>

            {formData.bio && (
              <div className="profile-field">
                <div className="profile-field-label">О себе</div>
                {isEditing ? (
                  <textarea
                    name="bio"
                    value={formData.bio}
                    onChange={handleInputChange}
                    className="profile-textarea"
                    placeholder="Расскажите о себе"
                    rows="3"
                  />
                ) : (
                  <div className="profile-field-value">{formData.bio}</div>
                )}
              </div>
            )}

            <div className="profile-field">
              <div className="profile-field-label">Имя пользователя</div>
              {isEditing ? (
                <div className="profile-username-input-wrapper">
                  <span className="profile-username-prefix">@</span>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    className="profile-input profile-username-input"
                    placeholder="username"
                  />
                </div>
              ) : (
                <div className="profile-field-value">
                  @{formData.username}
                  <span className="profile-username-icon">🔗</span>
                </div>
              )}
            </div>

            {formData.birthday && (
              <div className="profile-field">
                <div className="profile-field-label">День рождения</div>
                {isEditing ? (
                  <input
                    type="date"
                    name="birthday"
                    value={formData.birthday}
                    onChange={handleInputChange}
                    className="profile-input"
                  />
                ) : (
                  <div className="profile-field-value">
                    {formatBirthday(formData.birthday)}
                  </div>
                )}
              </div>
            )}

            {isEditing && !formData.bio && (
              <div className="profile-field">
                <div className="profile-field-label">О себе</div>
                <textarea
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  className="profile-textarea"
                  placeholder="Расскажите о себе"
                  rows="3"
                />
              </div>
            )}

            {isEditing && !formData.birthday && (
              <div className="profile-field">
                <div className="profile-field-label">День рождения</div>
                <input
                  type="date"
                  name="birthday"
                  value={formData.birthday}
                  onChange={handleInputChange}
                  className="profile-input"
                />
              </div>
            )}
          </div>

          <div className="profile-stories-section">
            <div className="profile-stories-placeholder">
              Здесь будут показаны Ваши истории.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;

