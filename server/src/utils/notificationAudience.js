function visibleNotificationQuery(user) {
  const userId = user._id;
  const targeted = [
    { audience: 'USERS', recipients: userId },
    { audience: 'ACTIVE_USERS', recipients: userId }
  ];
  if (user.role === 'ADMIN') return { $or: targeted };
  return { $or: [{ audience: { $in: ['ALL_USERS', 'USERS_ONLY'] } }, ...targeted] };
}

function announcementRecipientQuery(senderId) {
  return { status: 'ACTIVE', role: 'USER', _id: { $ne: senderId } };
}

module.exports = { visibleNotificationQuery, announcementRecipientQuery };
