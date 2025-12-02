const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const Message = require('./models/Message');
const Chat = require('./models/Chat');

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
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Leave room
  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room ${roomId}`);
  });

  // Send message
  socket.on('send-message', async (data) => {
    try {
      const { chatId, senderId, text } = data;

      // Сохраняем сообщение в БД
      const message = new Message({
        chat: chatId,
        sender: senderId,
        text: text
      });
      await message.save();

      // Обновляем последнее сообщение в чате
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: message._id,
        lastMessageAt: new Date()
      });

      // Заполняем данные отправителя
      await message.populate('sender', 'username avatar');

      // Отправляем сообщение всем в комнате
      io.to(chatId).emit('receive-message', {
        _id: message._id,
        chat: chatId,
        sender: message.sender,
        text: message.text,
        createdAt: message.createdAt
      });
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Ошибка отправки сообщения' });
    }
  });
});

// Database connection
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/messenger';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

