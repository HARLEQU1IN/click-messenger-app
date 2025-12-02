import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import Login from './components/Login';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import Menu from './components/Menu';
import CallWindow from './components/CallWindow';
import Profile from './components/Profile';
import CreateGroup from './components/CreateGroup';
import GroupSettings from './components/GroupSettings';
import useWebRTC from './hooks/useWebRTC';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState({});
  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') !== 'false');
  const [activeCall, setActiveCall] = useState(null);
  const [callRemoteUser, setCallRemoteUser] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [selectedGroupForSettings, setSelectedGroupForSettings] = useState(null);

  // Применяем темный режим
  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    if (token) {
      // Проверяем токен и загружаем пользователя
      axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(async res => {
          const userData = {
            ...res.data,
            _id: res.data._id || res.data.id
          };
          setUser(userData);
          
          // Загружаем пользователей
          await loadUsers();
          
          // Загружаем чаты и восстанавливаем выбранный чат
          const loadedChats = await loadChats();
          
          // Восстанавливаем выбранный чат из localStorage после загрузки чатов
          const savedChatId = localStorage.getItem('selectedChatId');
          if (savedChatId && loadedChats && loadedChats.length > 0) {
            const savedChat = loadedChats.find(c => c._id === savedChatId);
            if (savedChat) {
              setSelectedChat(savedChat);
              await loadMessages(savedChatId);
            }
          }
          
          connectSocket(userData);
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('selectedChatId');
          setToken(null);
        });
    }

    // Cleanup при размонтировании
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [token]);

  const connectSocket = (userData) => {
    if (socket && socket.connected) {
      socket.close();
    }
    
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      // Регистрируем пользователя для звонков
      const currentUser = userData || user;
      if (currentUser && (currentUser._id || currentUser.id)) {
        const userId = String(currentUser._id || currentUser.id);
        newSocket.emit('register-user', userId);
        console.log('User registered for calls:', userId);
      }
      // Присоединяемся к комнате выбранного чата, если он есть
      const currentChatId = selectedChat?._id || localStorage.getItem('selectedChatId');
      if (currentChatId) {
        newSocket.emit('join-room', currentChatId);
      }
    });

    // Re-register user on reconnect
    newSocket.on('reconnect', () => {
      console.log('Socket reconnected:', newSocket.id);
      const currentUser = userData || user;
      if (currentUser && (currentUser._id || currentUser.id)) {
        const userId = String(currentUser._id || currentUser.id);
        newSocket.emit('register-user', userId);
        console.log('User re-registered for calls:', userId);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    newSocket.on('receive-message', (message) => {
      console.log('Received message via socket:', message);
      if (!message || !message.chat) {
        console.error('Invalid message received:', message);
        return;
      }

      setMessages(prev => {
        const chatId = message.chat;
        const chatMessages = prev[chatId] || [];
        
        // Проверяем, нет ли уже такого сообщения
        const existingIndex = chatMessages.findIndex(m => 
          m._id === message._id || 
          (m._id && m._id.startsWith('temp-') && m.text === message.text && 
           (m.sender?._id === message.sender?._id || m.sender?._id === message.sender?._id))
        );

        if (existingIndex >= 0) {
          // Заменяем временное сообщение на реальное
          const newMessages = [...chatMessages];
          newMessages[existingIndex] = { ...message, status: message.status || 'sent' };
          return {
            ...prev,
            [chatId]: newMessages.filter((m, index, arr) => {
              // Удаляем дубликаты по _id
              return arr.findIndex(msg => msg._id === m._id) === index;
            })
          };
        }
        
        // Добавляем новое сообщение
        return {
          ...prev,
          [chatId]: [...chatMessages, { ...message, status: message.status || 'sent' }]
        };
      });
      
      // Помечаем сообщение как прочитанное, если это не наше сообщение
      const currentUserId = user?._id || user?.id;
      if (message.sender?._id !== currentUserId && selectedChat?._id === message.chat && newSocket && newSocket.connected) {
        setTimeout(() => {
          newSocket.emit('mark-message-read', {
            messageId: message._id,
            chatId: message.chat
          });
        }, 1000);
      }
      
      // Обновляем список чатов
      loadChats();
      
      // Прокручиваем вниз при новом сообщении
      setTimeout(() => {
        const messagesEnd = document.querySelector('.messages-container');
        if (messagesEnd) {
          messagesEnd.scrollTop = messagesEnd.scrollHeight;
        }
      }, 100);
    });

    newSocket.on('message-status-updated', (data) => {
      console.log('Message status updated:', data);
      setMessages(prev => {
        if (!data.messageId) return prev;
        
        // Обновляем статус во всех чатах, где есть это сообщение
        const updated = { ...prev };
        Object.keys(updated).forEach(chatId => {
          updated[chatId] = updated[chatId].map(m => 
            m._id === data.messageId ? { ...m, status: data.status } : m
          );
        });
        
        return updated;
      });
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  };

  const loadChats = async () => {
    try {
      const res = await axios.get(`${API_URL}/chats`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (status) => status < 500 // Не бросать ошибку для 4xx
      });
      
      if (res.status >= 400) {
        console.error('Error loading chats:', res.status, res.data);
        return [];
      }
      
      const chatsData = Array.isArray(res.data) ? res.data : [];
      setChats(chatsData);
      
      // Восстанавливаем выбранный чат после загрузки
      const savedChatId = localStorage.getItem('selectedChatId');
      if (savedChatId && chatsData.length > 0) {
        const savedChat = chatsData.find(c => c._id === savedChatId);
        if (savedChat) {
          setSelectedChat(savedChat);
          await loadMessages(savedChatId);
        }
      }
      
      return chatsData;
    } catch (error) {
      console.error('Error loading chats:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      } else if (error.request) {
        console.error('No response received:', error.request);
      }
      return [];
    }
  };

  const loadUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/chats/users/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(res.data);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadMessages = async (chatId) => {
    try {
      if (!chatId) {
        console.error('No chatId provided');
        return;
      }
      
      const res = await axios.get(`${API_URL}/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (status) => status < 500
      });
      
      if (res.status >= 400) {
        console.error('Error loading messages:', res.status, res.data);
        return;
      }
      
      const messagesData = Array.isArray(res.data) ? res.data : [];
      setMessages(prev => ({ ...prev, [chatId]: messagesData }));
    } catch (error) {
      console.error('Error loading messages:', error);
      if (error.response) {
        console.error('Response error:', error.response.status, error.response.data);
      } else if (error.request) {
        console.error('No response received');
      }
    }
  };

  const handleLogin = (userData, authToken) => {
    // Убеждаемся, что у пользователя есть _id
    const userWithId = {
      ...userData,
      _id: userData.id || userData._id
    };
    setUser(userWithId);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    loadChats();
    loadUsers();
    connectSocket();
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setChats([]);
    setSelectedChat(null);
    setMessages({});
    localStorage.removeItem('token');
    localStorage.removeItem('selectedChatId');
    if (socket) {
      socket.close();
      setSocket(null);
    }
  };

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
    const chatId = chat._id;
    
    // Сохраняем выбранный чат в localStorage
    localStorage.setItem('selectedChatId', chatId);
    
    if (!messages[chatId]) {
      loadMessages(chatId);
    }
    
    if (socket && socket.connected) {
      console.log('Joining room:', chatId);
      socket.emit('join-room', chatId);
    } else {
      console.warn('Socket not connected, cannot join room');
    }
  };

  // Автообновление сообщений для выбранного чата
  useEffect(() => {
    if (!selectedChat || !token) return;
    
    const chatId = selectedChat._id;
    
    // Загружаем сразу
    loadMessages(chatId);
    
    // Присоединяемся к комнате при выборе чата
    if (socket && socket.connected) {
      socket.emit('join-room', chatId);
    }
    
    // Затем обновляем каждые 5 секунд
    const intervalId = setInterval(() => {
      if (selectedChat?._id === chatId) {
        loadMessages(chatId);
      }
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [selectedChat?._id, token, socket]);

  const handleCreateChat = async (userId) => {
    try {
      console.log('Creating chat with user:', userId);
      if (!userId) {
        alert('ID пользователя не указан');
        return;
      }
      
      const res = await axios.post(`${API_URL}/chats/private`, 
        { userId },
        { 
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: (status) => status < 500
        }
      );
      
      if (res.status >= 400) {
        const errorMessage = res.data?.error || `Ошибка ${res.status}: Ошибка при создании чата`;
        console.error('Error creating chat:', res.status, res.data);
        alert(errorMessage);
        return;
      }
      
      if (!res.data || !res.data._id) {
        console.error('Invalid response from server:', res.data);
        alert('Неверный ответ от сервера');
        return;
      }
      
      console.log('Chat created successfully:', res.data);
      
      // Обновляем список чатов
      await loadChats();
      
      // Выбираем созданный чат
      handleSelectChat(res.data);
    } catch (error) {
      console.error('Error creating chat:', error);
      let errorMessage = 'Ошибка при создании чата';
      
      if (error.response) {
        // Сервер ответил с ошибкой
        errorMessage = error.response.data?.error || `Ошибка ${error.response.status}`;
        console.error('Response error:', error.response.status, error.response.data);
      } else if (error.request) {
        // Запрос был отправлен, но ответа не получено
        errorMessage = 'Сервер не отвечает. Проверьте, что сервер запущен.';
        console.error('No response received:', error.request);
      } else if (error.message) {
        // Ошибка при настройке запроса
        if (error.message.includes('JSON')) {
          errorMessage = 'Ошибка обработки данных. Попробуйте перезагрузить страницу.';
        } else {
          errorMessage = error.message;
        }
      }
      
      alert(errorMessage);
    }
  };

  const handleSendMessage = (text) => {
    if (!socket || !socket.connected) {
      console.error('Socket not connected');
      alert('Нет подключения к серверу. Перезагрузите страницу.');
      return;
    }

    if (!selectedChat || !text.trim() || !user) {
      console.error('Missing chat, text, or user:', { selectedChat: !!selectedChat, text: !!text, user: !!user });
      return;
    }

    const messageText = text.trim();
    const chatId = selectedChat._id;
    const senderId = user._id || user.id;
    
    if (!senderId) {
      console.error('User ID is missing:', user);
      alert('Ошибка: ID пользователя не найден. Перезагрузите страницу.');
      return;
    }
    
    // Убеждаемся, что мы в комнате
    if (!socket.rooms || !socket.rooms.has(chatId)) {
      console.log('Joining room before sending:', chatId);
      socket.emit('join-room', chatId);
    }
    
      // Добавляем сообщение локально сразу для мгновенного отображения
      const tempMessage = {
        _id: `temp-${Date.now()}-${Math.random()}`,
        chat: chatId,
        sender: {
          _id: senderId,
          username: user.username || 'User',
          avatar: user.avatar || ''
        },
        text: messageText,
        status: 'sent',
        createdAt: new Date().toISOString()
      };
    
    setMessages(prev => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), tempMessage]
    }));

    // Отправляем через socket
    const messageData = {
      chatId: chatId,
      senderId: senderId,
      text: messageText
    };
    
    console.log('Sending message:', messageData);
    socket.emit('send-message', messageData, (response) => {
      console.log('Send message response:', response);
      if (response && response.error) {
        console.error('Error sending message:', response.error);
        // Удаляем временное сообщение при ошибке
        setMessages(prev => ({
          ...prev,
          [chatId]: (prev[chatId] || []).filter(m => m._id !== tempMessage._id)
        }));
        alert('Ошибка отправки сообщения: ' + response.error);
      }
    });
  };

  // WebRTC hook for calls
  const {
    localStream,
    remoteStream,
    isCallActive,
    callStatus,
    callDuration,
    connectionState,
    isMuted,
    localVideoRef,
    remoteVideoRef,
    startCall: startWebRTCCall,
    acceptCall: acceptWebRTCCall,
    rejectCall: rejectWebRTCCall,
    endCall: endWebRTCCall,
    toggleMute: toggleMuteCall
  } = useWebRTC(socket, user?._id || user?.id, callRemoteUser?._id);

  // Handle incoming call
  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data) => {
      console.log('=== Incoming Call Received ===');
      console.log('Call data:', data);
      console.log('From user ID:', data.from);
      console.log('Current user ID:', user?._id || user?.id);
      console.log('Available users:', users.map(u => ({ id: u._id || u.id, username: u.username })));
      
      // Find user by ID - try both string and direct comparison
      const callerUser = users.find(u => {
        const userId = String(u._id || u.id);
        const callerId = String(data.from);
        return userId === callerId;
      }) || { _id: data.from, username: 'Неизвестный пользователь' };
      
      console.log('Found caller user:', callerUser);
      
      setCallRemoteUser(callerUser);
      setActiveCall({
        caller: callerUser,
        receiver: user
      });
      // Store offer for later acceptance
      window.pendingCallOffer = data.offer;
      window.pendingCallFrom = data.from;
      
      console.log('Call window should be displayed now');
    };

    socket.on('incoming-call', handleIncomingCall);

    return () => {
      socket.off('incoming-call', handleIncomingCall);
    };
  }, [socket, user, users]);

  const handleStartCall = async (otherUser) => {
    alert('Функция звонков находится в разработке. Скоро будет доступна!');
    return;
    
    // Закомментированный код для будущей реализации
    /*
    try {
      if (!socket || !socket.connected) {
        alert('Нет подключения к серверу. Перезагрузите страницу.');
        return;
      }

      if (!otherUser || !otherUser._id) {
        alert('Ошибка: не удалось определить пользователя для звонка');
        return;
      }

      const otherUserId = String(otherUser._id || otherUser.id);
      const currentUserId = String(user?._id || user?.id);

      console.log('=== Starting Call ===');
      console.log('From user:', currentUserId, user?.username);
      console.log('To user:', otherUserId, otherUser?.username);
      console.log('Socket connected:', socket.connected);
      console.log('Socket ID:', socket.id);

      setCallRemoteUser(otherUser);
      setActiveCall({
        caller: user,
        receiver: otherUser
      });
      
      console.log('Call state set, starting WebRTC call...');
      await startWebRTCCall(otherUserId);
      console.log('WebRTC call started');
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Ошибка при начале звонка: ' + error.message);
      setActiveCall(null);
      setCallRemoteUser(null);
    }
    */
  };

  const handleAcceptCall = async () => {
    try {
      const offer = window.pendingCallOffer;
      if (offer) {
        await acceptWebRTCCall(offer);
        window.pendingCallOffer = null;
        window.pendingCallFrom = null;
      }
    } catch (error) {
      console.error('Error accepting call:', error);
      alert('Ошибка при принятии звонка: ' + error.message);
      handleEndCall();
    }
  };

  const handleRejectCall = () => {
    rejectWebRTCCall();
    setActiveCall(null);
    setCallRemoteUser(null);
  };

  const handleEndCall = () => {
    endWebRTCCall();
    setActiveCall(null);
    setCallRemoteUser(null);
  };

  const handleSendVoiceMessage = (message) => {
    if (!socket || !socket.connected) {
      console.error('Socket not connected');
      return;
    }

    if (!selectedChat || !message || !user) {
      console.error('Missing chat, message, or user');
      return;
    }

    const chatId = selectedChat._id;
    
    // Добавляем сообщение локально
    setMessages(prev => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), message]
    }));

    // Определяем тип события в зависимости от типа сообщения
    const eventType = message.type === 'file' ? 'send-file-message' : 'send-voice-message';
    
    // Отправляем через socket для уведомления других пользователей
    socket.emit(eventType, {
      chatId: chatId,
      messageId: message._id
    }, (response) => {
      if (response && response.error) {
        console.error(`Error sending ${message.type} message:`, response.error);
      }
    });
  };

  // Обработчики меню
  const handleProfile = () => {
    setShowMenu(false);
    setShowProfile(true);
  };

  const handleProfileUpdate = async (updatedUser) => {
    setUser(updatedUser);
    // Обновляем пользователя в списке пользователей
    setUsers(prev => prev.map(u => 
      (u._id === updatedUser._id || u.id === updatedUser._id) ? updatedUser : u
    ));
  };

  const handleCreateGroup = () => {
    setShowMenu(false);
    setShowCreateGroup(true);
  };

  const handleGroupCreated = async (newGroup) => {
    // Обновляем список чатов
    await loadChats();
    // Выбираем созданную группу
    setSelectedChat(newGroup);
    setShowCreateGroup(false);
  };

  const handleContacts = () => {
    setShowMenu(false);
    alert(`Всего контактов: ${users.length}\n\nСписок контактов:\n${users.map(u => `- ${u.username}`).join('\n')}`);
  };

  const handleCalls = () => {
    setShowMenu(false);
    alert('История звонков. (Функция в разработке)');
  };

  const handleFavorites = () => {
    setShowMenu(false);
    alert('Избранные сообщения. (Функция в разработке)');
  };

  const handleSettings = () => {
    setShowMenu(false);
    alert('Настройки приложения. (Функция в разработке)');
  };

  const handleToggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-left">
            <button className="menu-btn" onClick={() => setShowMenu(true)} title="Меню">
              ☰
            </button>
            <h2>💬 Messenger</h2>
          </div>
          <button onClick={handleLogout} className="logout-btn">Выйти</button>
        </div>
        <ChatList
          chats={chats}
          selectedChat={selectedChat}
          onSelectChat={handleSelectChat}
          onCreateChat={handleCreateChat}
          users={users}
          currentUserId={user._id || user.id}
        />
      </div>
      <div className="main-content">
        {selectedChat ? (
          <ChatWindow
            chat={selectedChat}
            messages={messages[selectedChat._id] || []}
            currentUser={user}
            onSendMessage={handleSendMessage}
            onSendVoiceMessage={handleSendVoiceMessage}
            onStartCall={handleStartCall}
            onGroupSettings={(group) => {
              setSelectedGroupForSettings(group);
              setShowGroupSettings(true);
            }}
          />
        ) : (
          <div className="welcome-screen">
            <h1>Добро пожаловать, {user.username}!</h1>
            <p>Выберите чат из списка слева или создайте новый</p>
          </div>
        )}
      </div>
      
      {showMenu && (
        <Menu
          user={user}
          onClose={() => setShowMenu(false)}
          onProfile={handleProfile}
          onCreateGroup={handleCreateGroup}
          onContacts={handleContacts}
          onCalls={handleCalls}
          onFavorites={handleFavorites}
          onSettings={handleSettings}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
        />
      )}

      {activeCall && (
        <CallWindow
          call={activeCall}
          currentUser={user}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          onEnd={handleEndCall}
          onToggleMute={toggleMuteCall}
          callStatus={callStatus}
          isCallActive={isCallActive}
          callDuration={callDuration}
          connectionState={connectionState}
          isMuted={isMuted}
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
        />
      )}

      {showProfile && (
        <Profile
          user={user}
          onClose={() => setShowProfile(false)}
          onUpdate={handleProfileUpdate}
        />
      )}

      {showCreateGroup && (
        <CreateGroup
          users={users}
          currentUser={user}
          onClose={() => setShowCreateGroup(false)}
          onGroupCreated={handleGroupCreated}
        />
      )}

      {showGroupSettings && selectedGroupForSettings && (
        <GroupSettings
          chat={selectedGroupForSettings}
          currentUser={user}
          users={users}
          onClose={() => {
            setShowGroupSettings(false);
            setSelectedGroupForSettings(null);
          }}
          onGroupUpdated={async (updatedGroup) => {
            await loadChats();
            setSelectedChat(updatedGroup);
            setSelectedGroupForSettings(updatedGroup);
          }}
          onGroupDeleted={async () => {
            await loadChats();
            setSelectedChat(null);
            setShowGroupSettings(false);
            setSelectedGroupForSettings(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
