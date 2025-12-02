const express = require('express');
const jwt = require('jsonwebtoken');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
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

// Get all chats for user
router.get('/', authenticate, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.userId })
      .populate('participants', 'username email avatar online')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    res.json(chats);
  } catch (error) {
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
    let chat = await Chat.findOne({
      type: 'private',
      participants: { $all: [req.userId, userId] }
    })
      .populate('participants', 'username email avatar online')
      .populate('lastMessage');

    if (!chat) {
      // Создаем новый чат
      chat = new Chat({
        name: 'Private Chat',
        type: 'private',
        participants: [req.userId, userId]
      });
      await chat.save();
      await chat.populate('participants', 'username email avatar online');
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat messages
router.get('/:chatId/messages', authenticate, async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);

    if (!chat || !chat.participants.includes(req.userId)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const messages = await Message.find({ chat: chatId })
      .populate('sender', 'username avatar')
      .sort({ createdAt: 1 })
      .limit(100);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users (for creating chats)
router.get('/users/all', authenticate, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } })
      .select('username email avatar online')
      .limit(50);

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

