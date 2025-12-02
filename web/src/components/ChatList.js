import React, { useState } from 'react';
import './ChatList.css';

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
    if (!chat) return '👤';
    if (chat.type === 'private' && chat.participants && Array.isArray(chat.participants)) {
      const otherUser = chat.participants.find(p => p && p._id && p._id !== currentUserId);
      return otherUser && otherUser.avatar ? otherUser.avatar : '👤';
    }
    return '👥';
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
                  <span className="user-avatar">{user.avatar || '👤'}</span>
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
                <span className="chat-avatar">{getChatAvatar(chat)}</span>
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

