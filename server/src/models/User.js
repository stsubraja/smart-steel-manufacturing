const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['ADMIN','USER'], default: 'USER' },
  status: { type: String, enum: ['PENDING','ACTIVE','DISABLED'], default: 'PENDING' }
}, { timestamps: true });
module.exports = mongoose.model('User', userSchema);
