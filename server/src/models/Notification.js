const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  message: { type: String, required: true },
  type: { type: String, enum: ['INFO','WARNING','SUCCESS','ALERT'], default: 'INFO' },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });
module.exports = mongoose.model('Notification', schema);
