const bcrypt = require('bcryptjs');

class User {
  constructor(data) {
    this._id = data._id;
    this.username = data.username;
    this.email = data.email;
    this.password = data.password;
    this.avatar = data.avatar || '';
    this.online = data.online || false;
    this.lastSeen = data.lastSeen || new Date().toISOString();
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  static async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }

  async comparePassword(password) {
    return await bcrypt.compare(password, this.password);
  }

  toJSON() {
    const { password, ...user } = this;
    return user;
  }
}

module.exports = User;
