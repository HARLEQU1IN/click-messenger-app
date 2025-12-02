const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const { MessageStorage, ChatStorage, UserStorage, ensureDataDir } = require('./storage/fileStorage');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // Join room (chat)
  socket.on('join-room', (roomId) => {
    if (roomId) {
      socket.join(String(roomId));
      console.log(`User ${socket.id} joined room ${roomId}`);
      console.log('Current rooms:', Array.from(socket.rooms));
    } else {
      console.error('Invalid roomId:', roomId);
    }
  });

  // Leave room
  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room ${roomId}`);
  });

  // Send message
  socket.on('send-message', async (data, callback) => {
    try {
      console.log('Received send-message:', data);
      const { chatId, senderId, text } = data;

      if (!chatId || !senderId || !text) {
        console.error('Missing required fields:', { chatId, senderId, text });
        if (callback) callback({ error: 'Отсутствуют обязательные поля' });
        return;
      }

      // Сохраняем сообщение
      const message = await MessageStorage.create({
        chat: chatId,
        sender: senderId,
        text: text
      });

      console.log('Message saved:', message._id);

      // Обновляем последнее сообщение в чате
      await ChatStorage.update(chatId, {
        lastMessage: message._id,
        lastMessageAt: new Date().toISOString()
      });

      // Получаем данные отправителя
      const sender = await UserStorage.findById(senderId);
      const senderData = sender ? {
        _id: sender._id,
        username: sender.username,
        avatar: sender.avatar
      } : null;

      const messageData = {
        _id: message._id,
        chat: chatId,
        sender: senderData,
        text: message.text,
        createdAt: message.createdAt
      };

      console.log('Emitting to room:', chatId);
      console.log('Message data:', messageData);
      console.log('Rooms:', Array.from(io.sockets.adapter.rooms.keys()));

      // Отправляем сообщение всем в комнате (включая отправителя, если он в комнате)
      io.to(chatId).emit('receive-message', messageData);
      
      console.log(`Message sent to room ${chatId}`);

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error sending message:', error);
      if (callback) callback({ error: error.message || 'Ошибка отправки сообщения' });
      socket.emit('error', { message: 'Ошибка отправки сообщения' });
    }
  });
});

// Инициализируем файловое хранилище
ensureDataDir().then(() => {
  console.log('✅ File storage initialized');
});

// Запускаем сервер
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api`);
  console.log(`💾 Data stored in: backend/data/`);
});

