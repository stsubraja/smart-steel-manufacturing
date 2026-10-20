const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  message: { type: String, required: true },
  type: { type: String, enum: ['INFO','WARNING','SUCCESS','ALERT'], default: 'INFO' },
  audience: { type: String, enum: ['ALL_USERS','USERS_ONLY','ACTIVE_USERS','USERS'], default: 'ACTIVE_USERS' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });
module.exports = mongoose.model('Notification', schema);
