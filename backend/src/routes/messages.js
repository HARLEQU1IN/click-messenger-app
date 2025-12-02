const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const { MessageStorage, ChatStorage, UserStorage } = require('../storage/fileStorage');
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

// Настройка multer для сохранения аудио файлов
const uploadsDir = path.join(__dirname, '../../uploads');
const ensureUploadsDir = async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    console.error('Error creating uploads directory:', error);
  }
};

ensureUploadsDir();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadsDir();
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '';
    // Сохраняем оригинальное имя файла отдельно, а в имени файла используем безопасное имя
    // Оригинальное имя будет сохранено в базе данных
    const safeName = `file-${uniqueSuffix}${ext}`;
    cb(null, safeName);
  }
});

// Для голосовых сообщений
const voiceUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB максимум
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Только аудио файлы разрешены'), false);
    }
  }
});

// Для всех файлов (фото, видео, документы)
const fileUpload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB максимум
  }
});

// Загрузка голосового сообщения
router.post('/voice', authenticate, voiceUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Аудио файл не предоставлен' });
    }

    const { chatId } = req.body;
    const senderId = req.userId;

    if (!chatId) {
      // Удаляем загруженный файл, если нет chatId
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'ID чата обязателен' });
    }

    // Проверяем, что пользователь является участником чата
    const chat = await ChatStorage.findById(chatId);
    if (!chat) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const participants = chat.participants || [];
    const userId = String(senderId);
    const isParticipant = participants.some(p => {
      if (!p) return false;
      const pId = typeof p === 'object' ? (p._id || String(p)) : String(p);
      return pId === userId;
    });

    if (!isParticipant) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    // Получаем размер файла и длительность
    const fileSize = req.file.size;
    const duration = req.body.duration ? parseFloat(req.body.duration) : null;

    // Сохраняем сообщение с аудио
    const message = await MessageStorage.create({
      chat: chatId,
      sender: senderId,
      text: '', // Голосовое сообщение не имеет текста
      audioUrl: req.file.filename,
      type: 'voice',
      fileSize: fileSize,
      duration: duration
    });

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
      audioUrl: message.audioUrl,
      type: message.type,
      fileSize: message.fileSize,
      duration: message.duration,
      status: message.status || 'sent',
      createdAt: message.createdAt
    };

    res.json({ message: messageData });
  } catch (error) {
    console.error('Error uploading voice message:', error);
    // Удаляем файл при ошибке
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: error.message || 'Ошибка загрузки голосового сообщения' });
  }
});

// Загрузка файлов (фото, видео, документы)
router.post('/file', authenticate, fileUpload.single('file'), async (req, res) => {
  try {
    console.log('File upload request:', {
      hasFile: !!req.file,
      fileInfo: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null,
      body: req.body,
      userId: req.userId
    });

    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({ error: 'Файл не предоставлен' });
    }

    const { chatId, type } = req.body;
    const senderId = req.userId;

    console.log('Processing file upload:', { chatId, type, senderId });

    if (!chatId) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'ID чата обязателен' });
    }

    // Проверяем, что пользователь является участником чата
    const chat = await ChatStorage.findById(chatId);
    if (!chat) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const participants = chat.participants || [];
    const userId = String(senderId);
    const isParticipant = participants.some(p => {
      if (!p) return false;
      const pId = typeof p === 'object' ? (p._id || String(p)) : String(p);
      return pId === userId;
    });

    if (!isParticipant) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    // Определяем тип файла
    const fileType = type || (req.file.mimetype.startsWith('image/') ? 'photo' : 
                              req.file.mimetype.startsWith('video/') ? 'video' : 'document');

    // Исправляем кодировку имени файла (браузеры часто отправляют в latin1)
    let fileName = req.file.originalname;
    try {
      // Пытаемся декодировать из latin1 в utf8
      fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    } catch (error) {
      console.error('Error decoding filename:', error);
      // Если не получилось, используем оригинальное имя
      fileName = req.file.originalname;
    }

    // Сохраняем сообщение с файлом
    const message = await MessageStorage.create({
      chat: chatId,
      sender: senderId,
      text: '',
      fileUrl: req.file.filename,
      fileName: fileName,
      fileSize: req.file.size,
      fileType: fileType,
      mimeType: req.file.mimetype,
      type: 'file'
    });

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
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      fileType: message.fileType,
      mimeType: message.mimeType,
      type: message.type,
      status: message.status || 'sent',
      createdAt: message.createdAt
    };

    res.json({ message: messageData });
  } catch (error) {
    console.error('Error uploading file:', error);
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: error.message || 'Ошибка загрузки файла' });
  }
});

module.exports = router;

