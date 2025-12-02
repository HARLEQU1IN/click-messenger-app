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
    if (chat.type === 'private' && chat.participants) {
      const otherUser = chat.participants.find(p => p._id !== currentUser.id);
      return otherUser ? otherUser.username : 'Chat';
    }
    return chat.name;
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <h3>{getChatName()}</h3>
        {chat.type === 'private' && chat.participants && (
          <span className="chat-status">
            {chat.participants.find(p => p._id !== currentUser.id)?.online ? '🟢 Онлайн' : '⚫ Не в сети'}
          </span>
        )}
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>Начните общение! Напишите первое сообщение.</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message._id}
              className={`message ${message.sender._id === currentUser.id ? 'own' : 'other'}`}
            >
              <div className="message-content">
                {message.sender._id !== currentUser.id && (
                  <div className="message-sender">{message.sender.username}</div>
                )}
                <div className="message-text">{message.text}</div>
                <div className="message-time">{formatTime(message.createdAt)}</div>
              </div>
            </div>
          ))
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

