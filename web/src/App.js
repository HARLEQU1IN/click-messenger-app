import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import Login from './components/Login';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
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

  useEffect(() => {
    if (token) {
      // Проверяем токен и загружаем пользователя
      axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          setUser(res.data);
          loadChats();
          loadUsers();
          connectSocket();
        })
        .catch(() => {
          localStorage.removeItem('token');
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

  const connectSocket = () => {
    if (socket) {
      socket.close();
    }
    
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
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
          newMessages[existingIndex] = message;
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
          [chatId]: [...chatMessages, message]
        };
      });
      
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

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  };

  const loadChats = async () => {
    try {
      const res = await axios.get(`${API_URL}/chats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChats(res.data);
    } catch (error) {
      console.error('Error loading chats:', error);
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
      const res = await axios.get(`${API_URL}/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(prev => ({ ...prev, [chatId]: res.data }));
    } catch (error) {
      console.error('Error loading messages:', error);
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
    if (socket) {
      socket.close();
      setSocket(null);
    }
  };

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
    const chatId = chat._id;
    
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
    
    // Затем обновляем каждые 5 секунд
    const intervalId = setInterval(() => {
      if (selectedChat?._id === chatId) {
        loadMessages(chatId);
      }
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [selectedChat?._id, token]);

  const handleCreateChat = async (userId) => {
    try {
      console.log('Creating chat with user:', userId);
      const res = await axios.post(`${API_URL}/chats/private`, 
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Chat created successfully:', res.data);
      
      // Обновляем список чатов
      await loadChats();
      
      // Выбираем созданный чат
      handleSelectChat(res.data);
    } catch (error) {
      console.error('Error creating chat:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Ошибка при создании чата';
      alert(errorMessage); // Показываем ошибку пользователю
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

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>💬 Messenger</h2>
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
          />
        ) : (
          <div className="welcome-screen">
            <h1>Добро пожаловать, {user.username}!</h1>
            <p>Выберите чат из списка слева или создайте новый</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
