const Notification = require('../models/Notification');

module.exports = async function createNotification(app, { message, type = 'INFO' }) {
  try {
    const notification = await Notification.create({ message, type });
    app?.get('io')?.emit('notification:new', notification);
    return notification;
  } catch (error) {
    console.error('Could not create notification:', error.message);
    return null;
  }
};
