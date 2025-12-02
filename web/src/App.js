import React, { useState, useEffect } from 'react';
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
  }, [token]);

  const connectSocket = () => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('receive-message', (message) => {
      setMessages(prev => ({
        ...prev,
        [message.chat]: [...(prev[message.chat] || []), message]
      }));
      loadChats(); // Обновляем список чатов
    });

    return () => newSocket.close();
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
    setUser(userData);
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
    if (!messages[chat._id]) {
      loadMessages(chat._id);
    }
    if (socket) {
      socket.emit('join-room', chat._id);
    }
  };

  const handleCreateChat = async (userId) => {
    try {
      const res = await axios.post(`${API_URL}/chats/private`, 
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setChats(prev => [res.data, ...prev.filter(c => c._id !== res.data._id)]);
      handleSelectChat(res.data);
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  const handleSendMessage = (text) => {
    if (socket && selectedChat && text.trim()) {
      socket.emit('send-message', {
        chatId: selectedChat._id,
        senderId: user.id,
        text: text.trim()
      });
    }
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
          currentUserId={user.id}
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
