const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../../data');

// Убеждаемся, что директория существует
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Генерируем ID
function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

// Чтение данных из файла
async function readFile(fileName) {
  try {
    const filePath = path.join(DATA_DIR, fileName);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Запись данных в файл
async function writeFile(fileName, data) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// User storage
const UserStorage = {
  async findAll() {
    return await readFile('users.json');
  },

  async findById(id) {
    const users = await this.findAll();
    return users.find(u => u._id === id);
  },

  async findOne(query) {
    const users = await this.findAll();
    return users.find(u => {
      if (query.email && u.email === query.email) return true;
      if (query.username && u.username === query.username) return true;
      if (query.$or) {
        return query.$or.some(condition => {
          if (condition.email && u.email === condition.email) return true;
          if (condition.username && u.username === condition.username) return true;
          return false;
        });
      }
      return false;
    });
  },

  async create(userData) {
    const users = await this.findAll();
    const newUser = {
      _id: generateId(),
      ...userData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    users.push(newUser);
    await writeFile('users.json', users);
    return newUser;
  },

  async update(id, updates) {
    const users = await this.findAll();
    const index = users.findIndex(u => u._id === id);
    if (index === -1) return null;
    
    users[index] = {
      ...users[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await writeFile('users.json', users);
    return users[index];
  }
};

// Chat storage
const ChatStorage = {
  async findAll() {
    return await readFile('chats.json');
  },

  async findById(id) {
    const chats = await this.findAll();
    return chats.find(c => c._id === id);
  },

  async find(query) {
    const chats = await this.findAll();
    if (query.participants) {
      return chats.filter(c => {
        const participants = Array.isArray(c.participants) ? c.participants : [];
        return query.participants.some(p => 
          participants.some(cp => cp.toString() === p.toString() || cp._id === p)
        );
      });
    }
    return chats;
  },

  async findOne(query) {
    const chats = await this.findAll();
    if (query.type && query.participants) {
      return chats.find(c => {
        if (c.type !== query.type) return false;
        const participants = Array.isArray(c.participants) ? c.participants : [];
        const participantIds = participants.map(p => p.toString() || p._id || p);
        const queryIds = query.participants.map(p => p.toString());
        return queryIds.every(id => participantIds.includes(id)) && 
               participantIds.length === queryIds.length;
      });
    }
    return chats.find(c => c._id === query._id);
  },

  async create(chatData) {
    const chats = await this.findAll();
    const newChat = {
      _id: generateId(),
      ...chatData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    chats.push(newChat);
    await writeFile('chats.json', chats);
    return newChat;
  },

  async update(id, updates) {
    const chats = await this.findAll();
    const index = chats.findIndex(c => c._id === id);
    if (index === -1) return null;
    
    chats[index] = {
      ...chats[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await writeFile('chats.json', chats);
    return chats[index];
  }
};

// Message storage
const MessageStorage = {
  async findAll() {
    return await readFile('messages.json');
  },

  async findById(id) {
    const messages = await this.findAll();
    return messages.find(m => m._id === id);
  },

  async find(query) {
    const messages = await this.findAll();
    if (query.chat) {
      return messages.filter(m => {
        const chatId = m.chat?.toString() || m.chat?._id || m.chat;
        const queryId = query.chat.toString();
        return chatId === queryId;
      });
    }
    return messages;
  },

  async create(messageData) {
    const messages = await this.findAll();
    const newMessage = {
      _id: generateId(),
      ...messageData,
      read: false,
      readBy: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    messages.push(newMessage);
    await writeFile('messages.json', messages);
    return newMessage;
  },

  async update(id, updates) {
    const messages = await this.findAll();
    const index = messages.findIndex(m => m._id === id);
    if (index === -1) return null;
    
    messages[index] = {
      ...messages[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await writeFile('messages.json', messages);
    return messages[index];
  }
};

module.exports = {
  UserStorage,
  ChatStorage,
  MessageStorage,
  ensureDataDir
};

