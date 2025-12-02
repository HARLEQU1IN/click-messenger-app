const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { ChatStorage, MessageStorage, UserStorage } = require('../storage/fileStorage');
const router = express.Router();

const uploadsDir = path.join(__dirname, '../../uploads');

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
          return { ...msg, sender: null, status: msg.status || 'sent' };
        }
        const senderId = msg.sender && typeof msg.sender === 'object'
          ? (msg.sender._id || String(msg.sender))
          : String(msg.sender);
        const sender = await UserStorage.findById(senderId);
        return {
          ...msg,
          status: msg.status || 'sent',
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

// Setup multer for group avatar uploads
const ensureUploadsDir = async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    console.error('Error creating uploads directory:', error);
  }
};

const groupAvatarStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadsDir();
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '';
    const decodedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const originalName = path.basename(decodedOriginalName, ext);
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50);
    cb(null, `group-avatar-${uniqueSuffix}${ext}`);
  }
});

const groupAvatarUpload = multer({
  storage: groupAvatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены'), false);
    }
  }
});

// Upload group avatar
router.post('/group/avatar', authenticate, groupAvatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл аватара не предоставлен' });
    }

    const avatarUrl = req.file.filename;
    res.json({ avatar: avatarUrl });
  } catch (error) {
    console.error('Error uploading group avatar:', error);
    res.status(500).json({ error: error.message || 'Ошибка загрузки аватара группы' });
  }
});

// Create group chat
router.post('/group', authenticate, async (req, res) => {
  try {
    const { name, participants, avatar } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название группы обязательно' });
    }

    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return res.status(400).json({ error: 'Необходимо выбрать хотя бы одного участника' });
    }

    // Проверяем, что все участники существуют
    const allParticipants = [String(req.userId), ...participants.map(p => String(p))];
    const uniqueParticipants = [...new Set(allParticipants)];

    for (const participantId of uniqueParticipants) {
      const user = await UserStorage.findById(participantId);
      if (!user) {
        return res.status(404).json({ error: `Пользователь ${participantId} не найден` });
      }
    }

    // Создаем группу
    const chat = await ChatStorage.create({
      name: name.trim(),
      type: 'group',
      participants: uniqueParticipants,
      avatar: avatar || '',
      lastMessage: null,
      lastMessageAt: new Date().toISOString()
    });

    const populatedChat = await populateChat(chat);
    res.status(201).json(populatedChat);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: error.message || 'Ошибка при создании группы' });
  }
});

// Update group (name, avatar)
router.put('/group/:chatId', authenticate, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { name, avatar } = req.body;

    const chat = await ChatStorage.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Это не группа' });
    }

    // Проверяем, что пользователь является участником
    const participants = Array.isArray(chat.participants) ? chat.participants : [];
    const userId = String(req.userId);
    const isParticipant = participants.some(p => String(p) === userId);
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Вы не являетесь участником группы' });
    }

    const updates = {};
    if (name !== undefined && name.trim()) {
      updates.name = name.trim();
    }
    if (avatar !== undefined) {
      updates.avatar = avatar;
    }

    const updatedChat = await ChatStorage.update(chatId, updates);
    const populatedChat = await populateChat(updatedChat);
    res.json(populatedChat);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: error.message || 'Ошибка при обновлении группы' });
  }
});

// Update group avatar
router.put('/group/:chatId/avatar', authenticate, groupAvatarUpload.single('avatar'), async (req, res) => {
  try {
    const { chatId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл аватара не предоставлен' });
    }

    const chat = await ChatStorage.findById(chatId);
    if (!chat) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (chat.type !== 'group') {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Это не группа' });
    }

    // Проверяем, что пользователь является участником
    const participants = Array.isArray(chat.participants) ? chat.participants : [];
    const userId = String(req.userId);
    const isParticipant = participants.some(p => String(p) === userId);
    
    if (!isParticipant) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(403).json({ error: 'Вы не являетесь участником группы' });
    }

    // Удаляем старый аватар, если есть
    if (chat.avatar) {
      const oldAvatarPath = path.join(uploadsDir, chat.avatar);
      await fs.unlink(oldAvatarPath).catch(() => {});
    }

    const updatedChat = await ChatStorage.update(chatId, { avatar: req.file.filename });
    const populatedChat = await populateChat(updatedChat);
    res.json(populatedChat);
  } catch (error) {
    console.error('Error updating group avatar:', error);
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: error.message || 'Ошибка при обновлении аватара группы' });
  }
});

// Add participants to group
router.post('/group/:chatId/participants', authenticate, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Необходимо указать участников' });
    }

    const chat = await ChatStorage.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Это не группа' });
    }

    // Проверяем, что пользователь является участником
    const participants = Array.isArray(chat.participants) ? chat.participants : [];
    const userId = String(req.userId);
    const isParticipant = participants.some(p => String(p) === userId);
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Вы не являетесь участником группы' });
    }

    // Проверяем, что все пользователи существуют
    for (const uid of userIds) {
      const user = await UserStorage.findById(String(uid));
      if (!user) {
        return res.status(404).json({ error: `Пользователь ${uid} не найден` });
      }
    }

    // Добавляем участников (убираем дубликаты)
    const newParticipants = [...new Set([...participants.map(p => String(p)), ...userIds.map(u => String(u))])];
    
    const updatedChat = await ChatStorage.update(chatId, { participants: newParticipants });
    const populatedChat = await populateChat(updatedChat);
    res.json(populatedChat);
  } catch (error) {
    console.error('Error adding participants:', error);
    res.status(500).json({ error: error.message || 'Ошибка при добавлении участников' });
  }
});

// Remove participant from group
router.delete('/group/:chatId/participants/:userId', authenticate, async (req, res) => {
  try {
    const { chatId, userId: targetUserId } = req.params;
    const currentUserId = String(req.userId);
    const targetId = String(targetUserId);

    const chat = await ChatStorage.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Это не группа' });
    }

    const participants = Array.isArray(chat.participants) ? chat.participants.map(p => String(p)) : [];
    
    // Проверяем, что текущий пользователь является участником
    if (!participants.includes(currentUserId)) {
      return res.status(403).json({ error: 'Вы не являетесь участником группы' });
    }

    // Проверяем, что целевой пользователь является участником
    if (!participants.includes(targetId)) {
      return res.status(404).json({ error: 'Пользователь не является участником группы' });
    }

    // Удаляем участника
    const newParticipants = participants.filter(p => p !== targetId);
    
    // Если остался только один участник или меньше, удаляем группу
    if (newParticipants.length <= 1) {
      await ChatStorage.delete(chatId);
      return res.json({ deleted: true, message: 'Группа удалена' });
    }

    const updatedChat = await ChatStorage.update(chatId, { participants: newParticipants });
    const populatedChat = await populateChat(updatedChat);
    res.json(populatedChat);
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({ error: error.message || 'Ошибка при удалении участника' });
  }
});

// Leave group
router.post('/group/:chatId/leave', authenticate, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = String(req.userId);

    const chat = await ChatStorage.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Это не группа' });
    }

    const participants = Array.isArray(chat.participants) ? chat.participants.map(p => String(p)) : [];
    
    if (!participants.includes(userId)) {
      return res.status(403).json({ error: 'Вы не являетесь участником группы' });
    }

    // Удаляем пользователя из участников
    const newParticipants = participants.filter(p => p !== userId);
    
    // Если остался только один участник или меньше, удаляем группу
    if (newParticipants.length <= 1) {
      await ChatStorage.delete(chatId);
      return res.json({ deleted: true, message: 'Группа удалена' });
    }

    const updatedChat = await ChatStorage.update(chatId, { participants: newParticipants });
    res.json({ left: true, message: 'Вы покинули группу' });
  } catch (error) {
    console.error('Error leaving group:', error);
    res.status(500).json({ error: error.message || 'Ошибка при выходе из группы' });
  }
});

// Delete group
router.delete('/group/:chatId', authenticate, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = String(req.userId);

    const chat = await ChatStorage.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Это не группа' });
    }

    // Проверяем, что пользователь является участником (для простоты, можно добавить проверку на создателя)
    const participants = Array.isArray(chat.participants) ? chat.participants.map(p => String(p)) : [];
    
    if (!participants.includes(userId)) {
      return res.status(403).json({ error: 'Вы не являетесь участником группы' });
    }

    // Удаляем группу
    await ChatStorage.delete(chatId);
    
    // Удаляем все сообщения группы
    const messages = await MessageStorage.find({ chat: chatId });
    for (const message of messages) {
      await MessageStorage.delete(message._id);
    }

    res.json({ deleted: true, message: 'Группа удалена' });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: error.message || 'Ошибка при удалении группы' });
  }
});

module.exports = router;
