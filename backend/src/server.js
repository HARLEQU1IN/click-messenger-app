const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const { MessageStorage, ChatStorage, UserStorage, ensureDataDir } = require('./storage/fileStorage');
const path = require('path');

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

// Статические файлы для загрузок
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Внутренняя ошибка сервера'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

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

      if (!chatId || !senderId) {
        console.error('Missing required fields:', { chatId, senderId });
        if (callback) callback({ error: 'Отсутствуют обязательные поля' });
        return;
      }

      // Для текстовых сообщений text обязателен, для голосовых - нет
      if (!text && !data.audioUrl) {
        console.error('Missing text or audioUrl');
        if (callback) callback({ error: 'Отсутствует текст или аудио' });
        return;
      }

      // Сохраняем сообщение
      const message = await MessageStorage.create({
        chat: chatId,
        sender: senderId,
        text: text || '',
        audioUrl: data.audioUrl || null,
        type: data.audioUrl ? 'voice' : 'text'
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
        text: message.text || '',
        audioUrl: message.audioUrl || null,
        type: message.type || 'text',
        status: message.status || 'sent',
        createdAt: message.createdAt
      };

      console.log('Emitting to room:', chatId);
      console.log('Message data:', messageData);

      // Отправляем сообщение всем в комнате (включая отправителя, если он в комнате)
      io.to(chatId).emit('receive-message', messageData);
      
      // Обновляем статус на "delivered" для всех получателей в комнате
      setTimeout(async () => {
        const room = io.sockets.adapter.rooms.get(chatId);
        if (room && room.size > 1) {
          await MessageStorage.update(message._id, { status: 'delivered' });
          const updatedMessageData = {
            ...messageData,
            status: 'delivered'
          };
          io.to(chatId).emit('message-status-updated', {
            messageId: message._id,
            status: 'delivered'
          });
        } else {
          // Если только отправитель в комнате, все равно помечаем как delivered
          await MessageStorage.update(message._id, { status: 'delivered' });
          io.to(chatId).emit('message-status-updated', {
            messageId: message._id,
            status: 'delivered'
          });
        }
      }, 200);
      
      console.log(`Message sent to room ${chatId}`);

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error sending message:', error);
      if (callback) callback({ error: error.message || 'Ошибка отправки сообщения' });
      socket.emit('error', { message: 'Ошибка отправки сообщения' });
    }
  });

  // Send file message (через socket после загрузки файла)
  socket.on('send-file-message', async (data, callback) => {
    try {
      console.log('Received send-file-message:', data);
      const { chatId, messageId } = data;

      if (!chatId || !messageId) {
        console.error('Missing required fields:', { chatId, messageId });
        if (callback) callback({ error: 'Отсутствуют обязательные поля' });
        return;
      }

      // Получаем сообщение
      const message = await MessageStorage.findById(messageId);
      if (!message) {
        if (callback) callback({ error: 'Сообщение не найдено' });
        return;
      }

      // Получаем данные отправителя
      const sender = await UserStorage.findById(message.sender);
      const senderData = sender ? {
        _id: sender._id,
        username: sender.username,
        avatar: sender.avatar
      } : null;

      const messageData = {
        _id: message._id,
        chat: chatId,
        sender: senderData,
        text: message.text || '',
        fileUrl: message.fileUrl,
        fileName: message.fileName,
        fileSize: message.fileSize,
        fileType: message.fileType,
        mimeType: message.mimeType,
        type: message.type || 'file',
        status: message.status || 'sent',
        createdAt: message.createdAt
      };

      // Отправляем сообщение всем в комнате
      io.to(chatId).emit('receive-message', messageData);
      
      // Обновляем статус на "delivered"
      setTimeout(async () => {
        await MessageStorage.update(message._id, { status: 'delivered' });
        io.to(chatId).emit('message-status-updated', {
          messageId: message._id,
          status: 'delivered'
        });
      }, 200);
      
      console.log(`File message sent to room ${chatId}`);

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error sending file message:', error);
      if (callback) callback({ error: error.message || 'Ошибка отправки файла' });
    }
  });

  // Send voice message (через socket после загрузки файла)
  socket.on('send-voice-message', async (data, callback) => {
    try {
      console.log('Received send-voice-message:', data);
      const { chatId, messageId } = data;

      if (!chatId || !messageId) {
        console.error('Missing required fields:', { chatId, messageId });
        if (callback) callback({ error: 'Отсутствуют обязательные поля' });
        return;
      }

      // Получаем сообщение
      const message = await MessageStorage.findById(messageId);
      if (!message) {
        if (callback) callback({ error: 'Сообщение не найдено' });
        return;
      }

      // Получаем данные отправителя
      const sender = await UserStorage.findById(message.sender);
      const senderData = sender ? {
        _id: sender._id,
        username: sender.username,
        avatar: sender.avatar
      } : null;

      const messageData = {
        _id: message._id,
        chat: chatId,
        sender: senderData,
        text: message.text || '',
        audioUrl: message.audioUrl,
        type: message.type || 'voice',
        status: message.status || 'sent',
        createdAt: message.createdAt
      };

      // Отправляем сообщение всем в комнате
      io.to(chatId).emit('receive-message', messageData);
      
      // Обновляем статус на "delivered"
      setTimeout(async () => {
        await MessageStorage.update(message._id, { status: 'delivered' });
        io.to(chatId).emit('message-status-updated', {
          messageId: message._id,
          status: 'delivered'
        });
      }, 200);
      
      console.log(`Voice message sent to room ${chatId}`);

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error sending voice message:', error);
      if (callback) callback({ error: error.message || 'Ошибка отправки голосового сообщения' });
    }
  });

  // Mark message as read
  socket.on('mark-message-read', async (data) => {
    try {
      const { messageId, chatId } = data;
      
      if (!messageId || !chatId) {
        return;
      }

      const message = await MessageStorage.findById(messageId);
      if (!message) {
        return;
      }

      // Обновляем статус на "read"
      await MessageStorage.update(messageId, { 
        status: 'read',
        read: true
      });

      // Отправляем обновление статуса всем в комнате
      io.to(chatId).emit('message-status-updated', {
        messageId: messageId,
        status: 'read'
      });

      console.log(`Message ${messageId} marked as read`);
    } catch (error) {
      console.error('Error marking message as read:', error);
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

