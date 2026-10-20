const Notification = require('../models/Notification');
const User = require('../models/User');

module.exports = async function createNotification(app, { message, type = 'INFO' }) {
  try {
    const recipients = await User.find({ status: 'ACTIVE' }).distinct('_id');
    const notification = await Notification.create({ message, type, audience: 'ACTIVE_USERS', recipients });
    const io = app?.get('io');
    recipients.forEach(id => io?.to(`user:${id}`).emit('notification:new', notification));
    return notification;
  } catch (error) {
    console.error('Could not create notification:', error.message);
    return null;
  }
};
