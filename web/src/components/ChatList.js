import React, { useState } from 'react';
import './ChatList.css';

function ChatList({ chats, selectedChat, onSelectChat, onCreateChat, users, currentUserId }) {
  const [showUserList, setShowUserList] = useState(false);

  const getChatName = (chat) => {
    if (chat.type === 'private' && chat.participants) {
      const otherUser = chat.participants.find(p => p._id !== currentUserId);
      return otherUser ? otherUser.username : 'Chat';
    }
    return chat.name;
  };

  const getChatAvatar = (chat) => {
    if (chat.type === 'private' && chat.participants) {
      const otherUser = chat.participants.find(p => p._id !== currentUserId);
      return otherUser ? (otherUser.avatar || '👤') : '👤';
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
          {users.length === 0 ? (
            <p>Нет других пользователей</p>
          ) : (
            users.map(user => (
              <div
                key={user._id}
                className="user-item"
                onClick={() => {
                  onCreateChat(user._id);
                  setShowUserList(false);
                }}
              >
                <span className="user-avatar">{user.avatar || '👤'}</span>
                <span className="user-name">{user.username}</span>
                {user.online && <span className="online-indicator">●</span>}
              </div>
            ))
          )}
        </div>
      )}

      <div className="chats">
        {chats.length === 0 ? (
          <p className="no-chats">Нет чатов. Создайте новый!</p>
        ) : (
          chats.map(chat => (
            <div
              key={chat._id}
              className={`chat-item ${selectedChat?._id === chat._id ? 'active' : ''}`}
              onClick={() => onSelectChat(chat)}
            >
              <span className="chat-avatar">{getChatAvatar(chat)}</span>
              <div className="chat-info">
                <div className="chat-name">{getChatName(chat)}</div>
                {chat.lastMessage && (
                  <div className="chat-preview">
                    {chat.lastMessage.text?.substring(0, 30)}...
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

