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
  try {
    const participants = await Promise.all(
      (chat.participants || []).map(async (pId) => {
        if (!pId) return null;
        const id = pId && typeof pId === 'object' ? (pId._id || pId.toString()) : String(pId);
        const user = await UserStorage.findById(id);
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
      const lastMessageId = chat.lastMessage && typeof chat.lastMessage === 'object' 
        ? (chat.lastMessage._id || String(chat.lastMessage))
        : String(chat.lastMessage);
      lastMessage = await MessageStorage.findById(lastMessageId);
      if (lastMessage && lastMessage.sender) {
        const senderId = lastMessage.sender && typeof lastMessage.sender === 'object'
          ? (lastMessage.sender._id || String(lastMessage.sender))
          : String(lastMessage.sender);
        const sender = await UserStorage.findById(senderId);
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
  } catch (error) {
    console.error('Error populating chat:', error, chat);
    return {
      ...chat,
      participants: [],
      lastMessage: null
    };
  }
}

// Get all chats for user
router.get('/', authenticate, async (req, res) => {
  try {
    const allChats = await ChatStorage.findAll();
    const userId = String(req.userId);
    
    // Фильтруем чаты, где пользователь является участником
    const userChats = allChats.filter(c => {
      const participants = Array.isArray(c.participants) ? c.participants : [];
      return participants.some(p => String(p) === userId);
    });
    
    const populatedChats = await Promise.all(userChats.map(populateChat));
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

    console.log('Creating chat:', { currentUserId: req.userId, targetUserId: userId });

    if (!userId) {
      return res.status(400).json({ error: 'ID пользователя обязателен' });
    }

    // Проверяем, что пользователь существует
    const targetUser = await UserStorage.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Проверяем, существует ли уже чат
    const allChats = await ChatStorage.findAll();
    console.log('All chats:', allChats.length);
    
    let chat = allChats.find(c => {
      if (c.type !== 'private') return false;
      const participants = Array.isArray(c.participants) ? c.participants : [];
      const participantIds = participants.map(p => String(p));
      const queryIds = [String(req.userId), String(userId)];
      
      // Проверяем, что оба ID есть в участниках и их ровно 2
      return participantIds.length === 2 &&
             queryIds.every(id => participantIds.includes(id)) &&
             participantIds.every(id => queryIds.includes(id));
    });

    console.log('Found existing chat:', !!chat);

    if (!chat) {
      // Создаем новый чат
      console.log('Creating new chat...');
      chat = await ChatStorage.create({
        name: 'Private Chat',
        type: 'private',
        participants: [String(req.userId), String(userId)],
        lastMessage: null,
        lastMessageAt: new Date().toISOString()
      });
      console.log('Chat created:', chat._id);
    }

    const populatedChat = await populateChat(chat);
    console.log('Returning populated chat:', populatedChat._id);
    res.json(populatedChat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: error.message || 'Ошибка при создании чата' });
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
    const userId = String(req.userId);
    const isParticipant = participants.some(p => {
      if (!p) return false;
      const pId = typeof p === 'object' ? (p._id || String(p)) : String(p);
      return pId === userId;
    });

    if (!isParticipant) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const messages = await MessageStorage.find({ chat: chatId });
    const populatedMessages = await Promise.all(
      messages.map(async (msg) => {
        if (!msg || !msg.sender) {
          return { ...msg, sender: null };
        }
        const senderId = msg.sender && typeof msg.sender === 'object'
          ? (msg.sender._id || String(msg.sender))
          : String(msg.sender);
        const sender = await UserStorage.findById(senderId);
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
