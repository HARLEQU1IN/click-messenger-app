const express = require('express');
const jwt = require('jsonwebtoken');
const { ChatStorage, MessageStorage, UserStorage } = require('../storage/fileStorage');
const router = express.Router();

// Middleware для проверки токена
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Неверный токен' });
  }
};

// Helper для заполнения данных
async function populateChat(chat) {
  const participants = await Promise.all(
    (chat.participants || []).map(async (pId) => {
      const user = await UserStorage.findById(pId.toString() || pId);
      return user ? {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        online: user.online
      } : null;
    })
  );

  let lastMessage = null;
  if (chat.lastMessage) {
    lastMessage = await MessageStorage.findById(chat.lastMessage.toString() || chat.lastMessage);
    if (lastMessage) {
      const sender = await UserStorage.findById(lastMessage.sender.toString() || lastMessage.sender);
      if (sender) {
        lastMessage.sender = {
          _id: sender._id,
          username: sender.username,
          avatar: sender.avatar
        };
      }
    }
  }

  return {
    ...chat,
    participants: participants.filter(p => p !== null),
    lastMessage
  };
}

// Get all chats for user
router.get('/', authenticate, async (req, res) => {
  try {
    const chats = await ChatStorage.find({ participants: [req.userId] });
    const populatedChats = await Promise.all(chats.map(populateChat));
    populatedChats.sort((a, b) => {
      const dateA = new Date(a.lastMessageAt || a.createdAt);
      const dateB = new Date(b.lastMessageAt || b.createdAt);
      return dateB - dateA;
    });
    res.json(populatedChats);
  } catch (error) {
    console.error('Error loading chats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create or get private chat
router.post('/private', authenticate, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID пользователя обязателен' });
    }

    // Проверяем, существует ли уже чат
    let chat = await ChatStorage.findOne({
      type: 'private',
      participants: [req.userId, userId]
    });

    if (!chat) {
      // Создаем новый чат
      chat = await ChatStorage.create({
        name: 'Private Chat',
        type: 'private',
        participants: [req.userId, userId],
        lastMessage: null,
        lastMessageAt: new Date().toISOString()
      });
    }

    const populatedChat = await populateChat(chat);
    res.json(populatedChat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get chat messages
router.get('/:chatId/messages', authenticate, async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await ChatStorage.findById(chatId);

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const participants = chat.participants || [];
    const isParticipant = participants.some(p => 
      (p.toString() || p._id || p) === req.userId
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const messages = await MessageStorage.find({ chat: chatId });
    const populatedMessages = await Promise.all(
      messages.map(async (msg) => {
        const sender = await UserStorage.findById(msg.sender.toString() || msg.sender);
        return {
          ...msg,
          sender: sender ? {
            _id: sender._id,
            username: sender.username,
            avatar: sender.avatar
          } : null
        };
      })
    );

    populatedMessages.sort((a, b) => {
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    res.json(populatedMessages.slice(-100)); // Последние 100 сообщений
  } catch (error) {
    console.error('Error loading messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users (for creating chats)
router.get('/users/all', authenticate, async (req, res) => {
  try {
    const users = await UserStorage.findAll();
    const filteredUsers = users
      .filter(u => u._id !== req.userId)
      .map(u => ({
        _id: u._id,
        username: u.username,
        email: u.email,
        avatar: u.avatar,
        online: u.online
      }))
      .slice(0, 50);

    res.json(filteredUsers);
  } catch (error) {
    console.error('Error loading users:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
