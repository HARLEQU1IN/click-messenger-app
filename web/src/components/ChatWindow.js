import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css';

function ChatWindow({ chat, messages, currentUser, onSendMessage }) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  const getChatName = () => {
    if (!chat) return 'Chat';
    const currentUserId = currentUser._id || currentUser.id;
    if (chat.type === 'private' && chat.participants && Array.isArray(chat.participants)) {
      const otherUser = chat.participants.find(p => p && p._id && p._id !== currentUserId);
      return otherUser && otherUser.username ? otherUser.username : 'Chat';
    }
    return chat.name || 'Chat';
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getMessageStatusIcon = (status, isOwn) => {
    if (!isOwn) return null;
    
    switch (status) {
      case 'sent':
        return '✓'; // Одна серая галочка
      case 'delivered':
        return '✓✓'; // Две серые галочки
      case 'read':
        return '✓✓'; // Две синие галочки
      default:
        return '✓';
    }
  };

  const getMessageStatusClass = (status) => {
    return `status-${status || 'sent'}`;
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <h3>{getChatName()}</h3>
        {chat && chat.type === 'private' && chat.participants && Array.isArray(chat.participants) && (
          <span className="chat-status">
            {chat.participants.find(p => p && p._id && (p._id !== (currentUser._id || currentUser.id)))?.online ? '🟢 Онлайн' : '⚫ Не в сети'}
          </span>
        )}
      </div>

      <div className="messages-container">
        {!messages || messages.length === 0 ? (
          <div className="no-messages">
            <p>Начните общение! Напишите первое сообщение.</p>
          </div>
        ) : (
          messages
            .filter(message => message && message._id) // Фильтруем невалидные сообщения
            .map((message) => {
              const sender = message.sender || {};
              const currentUserId = currentUser._id || currentUser.id;
              const isOwn = sender._id === currentUserId;
              
              return (
                <div
                  key={message._id || `msg-${Date.now()}-${Math.random()}`}
                  className={`message ${isOwn ? 'own' : 'other'}`}
                >
                  <div className="message-content">
                {!isOwn && sender && sender.username && (
                  <div className="message-sender">{sender.username}</div>
                )}
                    <div className="message-text">{message.text || ''}</div>
                    <div className="message-footer">
                      <div className="message-time">
                        {message.createdAt ? formatTime(message.createdAt) : ''}
                      </div>
                      {isOwn && (
                        <div className={`message-status ${getMessageStatusClass(message.status)}`}>
                          {getMessageStatusIcon(message.status || 'sent', isOwn)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="message-input-form" onSubmit={handleSend}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Введите сообщение..."
          className="message-input"
        />
        <button type="submit" className="send-button" disabled={!inputText.trim()}>
          Отправить
        </button>
      </form>
    </div>
  );
}

export default ChatWindow;

