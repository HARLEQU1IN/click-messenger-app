import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css';
import VoiceRecorder from './VoiceRecorder';
import VoiceMessage from './VoiceMessage';
import AttachmentMenu from './AttachmentMenu';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

function ChatWindow({ chat, messages, currentUser, onSendMessage, onSendVoiceMessage }) {
  const [inputText, setInputText] = useState('');
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const messagesEndRef = useRef(null);
  const attachmentButtonRef = useRef(null);
  const token = localStorage.getItem('token');

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
      setShowAttachmentMenu(false);
    }
  };

  const handleAttachmentSelect = async (type) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    
    if (type === 'photo') {
      input.accept = 'image/*,video/*';
    } else if (type === 'document') {
      input.accept = '*/*';
    }
    
    input.onchange = async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        await handleFileUpload(file, type);
      }
    };
    input.click();
  };

  const handleFileUpload = async (file, type) => {
    try {
      console.log('Uploading file:', file.name, file.type, 'Type:', type);
      
      if (!chat || !chat._id) {
        alert('Чат не выбран');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('chatId', chat._id);
      formData.append('type', type);

      console.log('Sending file to:', `${API_URL}/messages/file`);

      const response = await axios.post(`${API_URL}/messages/file`, formData, {
        headers: {
          Authorization: `Bearer ${token}`
          // Не устанавливаем Content-Type вручную - axios сделает это автоматически для FormData
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Upload progress: ${percentCompleted}%`);
        }
      });

      console.log('File upload response:', response.data);

      if (response.data && response.data.message) {
        const fileMessage = response.data.message;
        // Добавляем информацию об отправителе
        if (!fileMessage.sender) {
          fileMessage.sender = {
            _id: currentUser._id || currentUser.id,
            username: currentUser.username || 'User',
            avatar: currentUser.avatar || ''
          };
        }
        // Отправляем сообщение через socket
        if (onSendVoiceMessage) {
          onSendVoiceMessage(fileMessage);
        }
      } else {
        console.error('No message in response:', response.data);
        alert('Файл загружен, но сообщение не создано');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Неизвестная ошибка';
      console.error('Full error:', error.response);
      alert('Ошибка загрузки файла: ' + errorMessage);
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

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
                    {message.audioUrl ? (
                      <VoiceMessage
                        audioUrl={`${API_URL}/uploads/${message.audioUrl}`}
                        duration={message.duration}
                        fileSize={message.fileSize}
                        isOwn={isOwn}
                      />
                    ) : message.fileUrl ? (
                      <div className="message-file">
                        {message.fileType === 'photo' || message.fileType === 'video' ? (
                          <div className="message-media">
                            {message.fileType === 'photo' ? (
                              <img 
                                src={`${API_URL}/uploads/${message.fileUrl}`} 
                                alt={message.fileName || 'Фото'}
                                className="message-image"
                                onError={(e) => {
                                  console.error('Error loading image:', message.fileUrl);
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <video 
                                src={`${API_URL}/uploads/${message.fileUrl}`} 
                                controls
                                className="message-video"
                                onError={(e) => {
                                  console.error('Error loading video:', message.fileUrl);
                                }}
                              >
                                Ваш браузер не поддерживает видео.
                              </video>
                            )}
                          </div>
                        ) : (
                          <div className="message-document">
                            <div className="document-icon">📄</div>
                            <div className="document-info">
                              <div className="document-name">{message.fileName || 'Документ'}</div>
                              <div className="document-size">
                                {message.fileSize ? formatFileSize(message.fileSize) : ''}
                              </div>
                            </div>
                            <a 
                              href={`${API_URL}/uploads/${message.fileUrl}`} 
                              download={message.fileName}
                              className="document-download"
                              title="Скачать"
                            >
                              ⬇️
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="message-text">{message.text || ''}</div>
                    )}
                    <div className="message-footer">
                      <div className="message-time">
                        {message.createdAt ? formatTime(message.createdAt) : ''}
                      </div>
                      {isOwn && (
                        <div className={`message-status ${getMessageStatusClass(message.status)}`}></div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
        )}
        <div ref={messagesEndRef} />
      </div>

      {showVoiceRecorder ? (
        <VoiceRecorder
          onSend={async (audioBlob, duration) => {
            try {
              const formData = new FormData();
              formData.append('audio', audioBlob, `voice-${Date.now()}.webm`);
              formData.append('chatId', chat._id);
              if (duration) {
                formData.append('duration', duration.toString());
              }

              const response = await axios.post(`${API_URL}/messages/voice`, formData, {
                headers: {
                  'Content-Type': 'multipart/form-data',
                  Authorization: `Bearer ${token}`
                }
              });

              if (response.data && response.data.message) {
                const voiceMessage = response.data.message;
                // Добавляем информацию об отправителе, если её нет
                if (!voiceMessage.sender) {
                  voiceMessage.sender = {
                    _id: currentUser._id || currentUser.id,
                    username: currentUser.username || 'User',
                    avatar: currentUser.avatar || ''
                  };
                }
                if (onSendVoiceMessage) {
                  onSendVoiceMessage(voiceMessage);
                }
              }
              setShowVoiceRecorder(false);
            } catch (error) {
              console.error('Error sending voice message:', error);
              alert('Ошибка отправки голосового сообщения: ' + (error.response?.data?.error || error.message));
            }
          }}
          onCancel={() => setShowVoiceRecorder(false)}
        />
      ) : (
        <form className="message-input-form" onSubmit={handleSend}>
          <div className="input-buttons-wrapper" style={{ position: 'relative' }}>
            <button
              type="button"
              className="attachment-button"
              onClick={(e) => {
                e.preventDefault();
                setShowAttachmentMenu(!showAttachmentMenu);
              }}
              title="Прикрепить файл"
              ref={attachmentButtonRef}
            >
              📎
            </button>
            {showAttachmentMenu && (
              <AttachmentMenu
                onClose={() => setShowAttachmentMenu(false)}
                onSelect={(type) => {
                  handleAttachmentSelect(type);
                }}
              />
            )}
          </div>
          <button
            type="button"
            className="voice-button"
            onClick={() => setShowVoiceRecorder(true)}
            title="Голосовое сообщение"
          >
            🎤
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Сообщение..."
            className="message-input"
          />
          <button type="submit" className="send-button" disabled={!inputText.trim()}>
            Отправить
          </button>
        </form>
      )}
    </div>
  );
}

export default ChatWindow;

