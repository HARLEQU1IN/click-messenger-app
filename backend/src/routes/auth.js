const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const User = require('../models/User');
const { UserStorage } = require('../storage/fileStorage');
const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
const ensureUploadsDir = async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    console.error('Error creating uploads directory:', error);
  }
};
ensureUploadsDir();

// Configure multer for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadsDir();
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB максимум
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены'), false);
    }
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    const existingUser = await UserStorage.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const hashedPassword = await User.hashPassword(password);
    const userData = await UserStorage.create({
      username,
      email,
      password: hashedPassword,
      avatar: '',
      online: false
    });

    const user = new User(userData);
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message || 'Произошла ошибка при регистрации' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const userData = await UserStorage.findOne({ email });
    if (!userData) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const user = new User(userData);
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    await UserStorage.update(user._id, { online: true });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Произошла ошибка при входе' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const userData = await UserStorage.findById(decoded.userId);
    
    if (!userData) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = new User(userData);
    res.json(user.toJSON());
  } catch (error) {
    res.status(401).json({ error: 'Неверный токен' });
  }
});

// Middleware to verify token
const authenticate = (req, res, next) => {
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

// Upload avatar
router.post('/avatar', authenticate, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не предоставлен' });
    }

    const userData = await UserStorage.findById(req.userId);
    if (!userData) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Delete old avatar if exists
    if (userData.avatar) {
      const oldAvatarPath = path.join(uploadsDir, userData.avatar);
      await fs.unlink(oldAvatarPath).catch(() => {});
    }

    // Update user with new avatar
    const updatedUser = await UserStorage.update(req.userId, {
      avatar: req.file.filename
    });

    res.json({
      avatar: req.file.filename,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: error.message || 'Ошибка загрузки аватара' });
  }
});

// Update profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userData = await UserStorage.findById(req.userId);
    
    if (!userData) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const { username, phone, bio, birthday, displayName } = req.body;
    const updates = {};

    if (username !== undefined) {
      // Check if username is already taken by another user
      const existingUser = await UserStorage.findOne({ username });
      if (existingUser && existingUser._id !== req.userId) {
        return res.status(400).json({ error: 'Это имя пользователя уже занято' });
      }
      updates.username = username;
    }

    if (phone !== undefined) updates.phone = phone;
    if (bio !== undefined) updates.bio = bio;
    if (birthday !== undefined) updates.birthday = birthday;
    if (displayName !== undefined) updates.displayName = displayName;

    const updatedUser = await UserStorage.update(req.userId, updates);
    const user = new User(updatedUser);
    
    res.json(user.toJSON());
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message || 'Ошибка обновления профиля' });
  }
});

module.exports = router;
