import React, { useState } from 'react';
import './ChatList.css';

const API_URL = 'http://localhost:5000/api';

function ChatList({ chats, selectedChat, onSelectChat, onCreateChat, users, currentUserId }) {
  const [showUserList, setShowUserList] = useState(false);

  const getChatName = (chat) => {
    if (!chat) return 'Chat';
    if (chat.type === 'private' && chat.participants && Array.isArray(chat.participants)) {
      const otherUser = chat.participants.find(p => p && p._id && p._id !== currentUserId);
      return otherUser && otherUser.username ? otherUser.username : 'Chat';
    }
    return chat.name || 'Chat';
  };

  const getChatAvatar = (chat) => {
    if (!chat) return null;
    if (chat.type === 'group') {
      // Для групп возвращаем сам чат (чтобы использовать avatar группы)
      return chat;
    }
    if (chat.type === 'private' && chat.participants && Array.isArray(chat.participants)) {
      const otherUser = chat.participants.find(p => p && p._id && p._id !== currentUserId);
      return otherUser || null;
    }
    return null;
  };

  const getChatAvatarUrl = (chat) => {
    if (chat.type === 'group' && chat.avatar) {
      return chat.avatar.startsWith('http') ? chat.avatar : `${API_URL}/uploads/${chat.avatar}`;
    }
    const user = getChatAvatar(chat);
    if (user && user.avatar) {
      return user.avatar.startsWith('http') ? user.avatar : `${API_URL}/uploads/${user.avatar}`;
    }
    return null;
  };

  const getChatAvatarInitial = (chat) => {
    if (chat.type === 'group') {
      return chat.name?.[0]?.toUpperCase() || '👥';
    }
    const user = getChatAvatar(chat);
    if (user && user.username) {
      return user.username[0].toUpperCase();
    }
    return '👤';
  };

  return (
    <div className="chat-list">
      <button className="new-chat-btn" onClick={() => setShowUserList(!showUserList)}>
        {showUserList ? '✕ Отмена' : '+ Новый чат'}
      </button>

      {showUserList && (
        <div className="user-list">
          <h3>Выберите пользователя:</h3>
          {!users || users.length === 0 ? (
            <p>Нет других пользователей</p>
          ) : (
            users
              .filter(user => user && user._id)
              .map(user => (
                <div
                  key={user._id}
                  className="user-item"
                  onClick={() => {
                    if (user._id) {
                      onCreateChat(user._id);
                      setShowUserList(false);
                    }
                  }}
                >
                  <div className="user-avatar">
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
                      <span>{user.username?.[0]?.toUpperCase() || '👤'}</span>
                    )}
                  </div>
                  <span className="user-name">{user.username || 'Unknown'}</span>
                  {user.online && <span className="online-indicator">●</span>}
                </div>
              ))
          )}
        </div>
      )}

      <div className="chats">
        {!chats || chats.length === 0 ? (
          <p className="no-chats">Нет чатов. Создайте новый!</p>
        ) : (
          chats
            .filter(chat => chat && chat._id)
            .map(chat => (
              <div
                key={chat._id}
                className={`chat-item ${selectedChat?._id === chat._id ? 'active' : ''}`}
                onClick={() => onSelectChat(chat)}
              >
                <div className="chat-avatar">
                  {getChatAvatarUrl(chat) ? (
                    <img 
                      src={getChatAvatarUrl(chat)} 
                      alt={getChatName(chat)}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) {
                          e.target.nextSibling.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  {!getChatAvatarUrl(chat) && (
                    <span>{getChatAvatarInitial(chat)}</span>
                  )}
                </div>
                <div className="chat-info">
                  <div className="chat-name">{getChatName(chat)}</div>
                  {chat.lastMessage && chat.lastMessage.text && (
                    <div className="chat-preview">
                      {chat.lastMessage.text.substring(0, 30)}...
                    </div>
                  )}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

export default ChatList;

